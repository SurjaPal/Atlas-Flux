const { expect } = require("chai");
const { ethers } = require("hardhat");
const { generateHyperplanes, computeFingerprint, hammingDistance } = require("../layer0/simhash");
const { deployThreatMesh, publishToMesh, fetchRecentFingerprints, nearestFingerprint } = require("../layer0/threatMesh");
const { makeFeederDevices } = require("../pipeline/deviceSimulator");
const { loadModel, scoreDevices, scoreDevicesWithMesh } = require("../layer0/trustEngine");

function probeLocalProbability(model, feederId, spike) {
  const probe = buildWeakAttackReadingsRaw(feederId, [`${feederId}-relay-1`, `${feederId}-relay-2`], spike);
  const scores = scoreDevices(probe.readings, probe.devices, probe.baselineByDevice, model);
  const target = scores.find((s) => s.deviceHumanId === `${feederId}-relay-1`);
  return { flagged: target.flagged, attackProbability: target.attackProbability };
}

/**
 * Finds a spike multiplier where the CURRENT model's attack probability
 * sits, on average, in a weak/uncertain band (targetProbability) rather
 * than confidently flagged or confidently clean. This is a genuinely
 * noisy region of feature space — with only 2 compromised relays, each
 * has exactly one "active" neighbor (the other compromised one), so the
 * neighbor-aggregation features have no averaging effect and swing a lot
 * with per-draw noise and each simulated feeder's independently-random
 * baseline wattages (see deviceSimulator.js). A single-instance binary
 * search for an exact never-flips boundary is the wrong model for that —
 * instead this averages many independent draws per candidate spike level
 * to find where the *mean* sits, which is stable, then the uplift test
 * below itself runs many trials and compares flag *rates*, not a single
 * pass/fail draw. That's the statistically honest way to demonstrate an
 * uplift in a stochastic system. Hardcoding a fixed spike multiplier
 * would also silently go stale across retrains (layer0/train.js produces
 * a different decision boundary every run) — searching keeps this test
 * meaningful against whatever model is actually loaded.
 */
function findUncertainSpikeLevel(model, { targetProbability = 0.4, samplesPerCandidate = 12 } = {}) {
  let best = null;
  for (let spike = 3.3; spike >= 1.8; spike -= 0.1) {
    const probs = Array.from({ length: samplesPerCandidate }, () => probeLocalProbability(model, "spike-probe-feeder", spike).attackProbability);
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    const distance = Math.abs(mean - targetProbability);
    if (!best || distance < best.distance) best = { spike, mean, distance };
    if (distance < 0.05) break; // close enough
  }
  return best;
}

/** Builds a feeder window where exactly `compromised` relays spike to `spikeMultiplier`x baseline. */
function buildWeakAttackReadingsRaw(feederId, compromised, spikeMultiplier) {
  const devices = makeFeederDevices(feederId, 6);
  const baselineByDevice = Object.fromEntries(devices.map((d) => [d.humanId, d.baselineWatts]));
  const start = 1_000_000;
  const readings = [];
  for (let t = start; t < start + 180; t += 60) {
    for (const d of devices) {
      const watts = compromised.includes(d.humanId)
        ? Math.round(d.baselineWatts * spikeMultiplier * (0.99 + Math.random() * 0.02))
        : Math.round(d.baselineWatts * (0.95 + Math.random() * 0.1));
      readings.push({ deviceHumanId: d.humanId, type: d.type, timestamp: t, watts });
    }
  }
  return { devices, baselineByDevice, readings };
}
const buildWeakAttackReadings = buildWeakAttackReadingsRaw;

describe("Federated Attack Signature Mesh — simhash properties", function () {
  it("gives near-zero Hamming distance to near-identical vectors", function () {
    const planes = generateHyperplanes(9, 64, 42);
    const base = [2.6, 2.5, 0.05, 4, 2.6, 0.03, 2, 0.1, 0.05];
    const similar = base.map((v) => v + (Math.random() - 0.5) * 0.05);
    const d = hammingDistance(computeFingerprint(base, planes), computeFingerprint(similar, planes));
    expect(d).to.be.lessThan(10); // well under the ~32-bit random-chance baseline
  });

  it("gives Hamming distance near the random-chance baseline (numBits/2) for unrelated vectors, on average", function () {
    const planes = generateHyperplanes(9, 64, 42);
    let total = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      const a = Array.from({ length: 9 }, () => Math.random() * 5 - 2.5);
      const b = Array.from({ length: 9 }, () => Math.random() * 5 - 2.5);
      total += hammingDistance(computeFingerprint(a, planes), computeFingerprint(b, planes));
    }
    expect(total / trials).to.be.closeTo(32, 6); // 64/2 = 32 expected
  });
});

describe("Federated Attack Signature Mesh — ThreatMesh contract", function () {
  let mesh, admin, publisher, stranger;

  beforeEach(async function () {
    [admin, publisher, stranger] = await ethers.getSigners();
    mesh = await deployThreatMesh(admin);
    await mesh.connect(admin).grantRole(await mesh.MESH_PUBLISHER_ROLE(), publisher.address);
  });

  it("rejects publishing from an unauthorized caller", async function () {
    await expect(mesh.connect(stranger).publishFingerprint("0x1122334455667788", 0, 50)).to.be.revertedWithCustomError(
      mesh,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("publishes a fingerprint with no device/feeder identity attached, and it's retrievable", async function () {
    const featureVector = [2.7, 2.6, 0.05, 4, 2.7, 0.03, 2, 0.1, 0.05];
    const { hex } = await publishToMesh(mesh, publisher, featureVector, { attackTypeCode: 0, severity: 80 });

    expect(await mesh.entryCount()).to.equal(1);
    const entry = await mesh.entryAt(0);
    expect(entry.fingerprint.toLowerCase()).to.equal(hex.toLowerCase());
    expect(Number(entry.severity)).to.equal(80);
  });

  it("recentEntries returns the most recent N in order", async function () {
    for (let i = 0; i < 5; i++) {
      await publishToMesh(mesh, publisher, [i, i, i, i, i, i, i, i, i], { severity: i * 10 });
    }
    const recent = await fetchRecentFingerprints(mesh, 3);
    expect(recent).to.have.lengthOf(3);
    expect(recent.map((e) => e.severity)).to.deep.equal([20, 30, 40]); // the last 3 published, oldest-first within that window
  });
});

describe("Federated Attack Signature Mesh — genuine cross-feeder detection uplift", function () {
  let mesh, admin, publisher;
  let model;

  before(function () {
    model = loadModel();
  });

  beforeEach(async function () {
    [admin, publisher] = await ethers.getSigners();
    mesh = await deployThreatMesh(admin);
    await mesh.connect(admin).grantRole(await mesh.MESH_PUBLISHER_ROLE(), publisher.address);
  });

  it("across many independent trials, mesh corroboration flags a weak/uncertain attack pattern far more often than local-only detection does", async function () {
    // Find a spike level where the local model is genuinely uncertain on
    // average (~40% attack probability) — not confidently clean, not
    // confidently an attack. This represents a marginal/novel attack
    // variant: real, but subtle enough that a single feeder's local
    // model is right to stay unsure.
    const { spike: SPIKE, mean: meanLocalProbability } = findUncertainSpikeLevel(model, { targetProbability: 0.4 });
    expect(meanLocalProbability, "sanity check: the chosen spike level should be genuinely uncertain, not near 0 or 1").to.be.within(0.1, 0.65);

    // --- Seed the mesh: several independent feeders each confirm this
    // pattern (after investigation — see the design note in INVENTION.md
    // on why the mesh is seeded by confirmed incidents, not raw
    // classifier output) and publish their fingerprints. ---
    for (let i = 0; i < 5; i++) {
      const feederId = `mesh-seed-feeder-${i}`;
      const seed = buildWeakAttackReadings(feederId, [`${feederId}-relay-1`, `${feederId}-relay-2`], SPIKE);
      const scores = scoreDevices(seed.readings, seed.devices, seed.baselineByDevice, model);
      const confirmedAttacker = scores.find((s) => s.deviceHumanId === `${feederId}-relay-1`);
      await publishToMesh(mesh, publisher, confirmedAttacker.featureVector, { attackTypeCode: 0, severity: 70 });
    }
    const knownFingerprints = await fetchRecentFingerprints(mesh);

    // --- Now run many independent trials of a *new* feeder experiencing
    // the same weak pattern, comparing local-only vs. mesh-boosted flag
    // rates across the batch. ---
    const trials = 20;
    let localFlagCount = 0;
    let meshFlagCount = 0;

    for (let t = 0; t < trials; t++) {
      const feederId = `mesh-test-feeder-${t}`;
      const feeder = buildWeakAttackReadings(feederId, [`${feederId}-relay-1`, `${feederId}-relay-2`], SPIKE);

      const localOnly = scoreDevices(feeder.readings, feeder.devices, feeder.baselineByDevice, model);
      if (localOnly.find((s) => s.deviceHumanId === `${feederId}-relay-1`).flagged) localFlagCount++;

      const meshBoosted = scoreDevicesWithMesh(feeder.readings, feeder.devices, feeder.baselineByDevice, model, knownFingerprints);
      if (meshBoosted.find((s) => s.deviceHumanId === `${feederId}-relay-1`).flagged) meshFlagCount++;
    }

    console.log(`      [uplift] local-only flagged ${localFlagCount}/${trials} trials, mesh-boosted flagged ${meshFlagCount}/${trials} trials (spike=${SPIKE.toFixed(2)}x, seed mean local prob=${meanLocalProbability.toFixed(2)})`);

    expect(meshFlagCount, "mesh-boosted detection should flag this uncertain pattern meaningfully more often than local-only").to.be.greaterThan(
      localFlagCount
    );
    expect(meshFlagCount / trials, "mesh-boosted flag rate should be high given strong corroboration from 5 confirmed incidents").to.be.at.least(0.7);
  });

  it("abuse resistance: a mesh fingerprint alone cannot flag a device with zero local signal", async function () {
    // An attacker (or a buggy/malicious publisher) seeds the mesh with a
    // fingerprint matching completely normal behavior, trying to get
    // other feeders to falsely isolate healthy devices by proxy.
    const normal = buildWeakAttackReadings("mesh-feeder-clean", [], 1.0); // nobody compromised
    const normalScores = scoreDevices(normal.readings, normal.devices, normal.baselineByDevice, model);
    const cleanDevice = normalScores.find((s) => s.deviceHumanId === "mesh-feeder-clean-relay-1");
    expect(cleanDevice.attackProbability).to.be.lessThan(0.02); // essentially zero local signal

    await publishToMesh(mesh, publisher, cleanDevice.featureVector, { attackTypeCode: 0, severity: 99 });
    const knownFingerprints = await fetchRecentFingerprints(mesh);

    const boosted = scoreDevicesWithMesh(normal.readings, normal.devices, normal.baselineByDevice, model, knownFingerprints);
    const boostedClean = boosted.find((s) => s.deviceHumanId === "mesh-feeder-clean-relay-1");

    expect(boostedClean.flagged, "zero local signal must stay unflagged no matter how strong the mesh match is").to.equal(false);
  });
});
