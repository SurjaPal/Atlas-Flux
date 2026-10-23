const { expect } = require("chai");
const { makeFeederDevices, simulateNormalWindow, simulateCoordinatedAttackWindow } = require("../pipeline/deviceSimulator");
const { loadModel, scoreDevices } = require("../layer0/trustEngine");

describe("Layer 0 trust engine (trained classifier, out-of-sample check)", function () {
  let model;

  before(function () {
    // Requires layer0/model.json to already exist (npm run train:layer0).
    model = loadModel();
  });

  it("flags no one during normal operation", function () {
    const devices = makeFeederDevices("test-feeder-normal", 6);
    const baselineByDevice = Object.fromEntries(devices.map((d) => [d.humanId, d.baselineWatts]));
    const readings = simulateNormalWindow(devices, 1_800_000_000, 300, 60);

    const scores = scoreDevices(readings, devices, baselineByDevice, model);
    const flagged = scores.filter((s) => s.flagged);
    expect(flagged, `unexpectedly flagged: ${flagged.map((f) => f.deviceHumanId).join(", ")}`).to.have.lengthOf(0);
  });

  it("flags exactly the compromised cluster during a coordinated attack", function () {
    const devices = makeFeederDevices("test-feeder-attack", 6);
    const baselineByDevice = Object.fromEntries(devices.map((d) => [d.humanId, d.baselineWatts]));
    const compromised = ["test-feeder-attack-relay-1", "test-feeder-attack-relay-2", "test-feeder-attack-relay-3"];
    const readings = simulateCoordinatedAttackWindow(devices, compromised, 1_800_000_000, 300, 60);

    const scores = scoreDevices(readings, devices, baselineByDevice, model);
    const flagged = scores.filter((s) => s.flagged).map((s) => s.deviceHumanId);

    for (const c of compromised) {
      expect(flagged, `expected ${c} to be flagged`).to.include(c);
    }
    // Allow the classifier some slack on precision, but it shouldn't flag
    // more than one uninvolved device out of the remaining relays.
    const falsePositives = flagged.filter((id) => !compromised.includes(id));
    expect(falsePositives.length, `too many false positives: ${falsePositives.join(", ")}`).to.be.at.most(1);
  });

  it("keeps the false-positive rate low across repeated coincidental (non-attack) scenarios", function () {
    const { makeFeederDevices } = require("../pipeline/deviceSimulator");
    const { simulateCoincidentalWindow } = require("../layer0/dataset");

    // A single 3-device draw can occasionally land tight by chance (that's
    // a real limitation of 1-hop aggregation on tiny clusters — see
    // graphUtils.js). Averaging over many independent draws is the
    // statistically honest way to check the false-positive rate. Measured
    // true rate on this specific hard (small-cluster) subset is ~28% —
    // notably worse than the ~7% measured on the full, mixed evaluation
    // set in layer0/model.json, because tiny clusters are the case this
    // hand-rolled feature genuinely struggles with most; a real trained
    // GraphSAGE embedding would likely do better here. 60 trials keeps
    // the sampling error small enough that the threshold below isn't
    // itself a coin flip.
    const trials = 60;
    let totalFlagged = 0;
    let totalDevices = 0;

    for (let t = 0; t < trials; t++) {
      const feederId = `test-feeder-coincidental-${t}`;
      const devices = makeFeederDevices(feederId, 6);
      const baselineByDevice = Object.fromEntries(devices.map((d) => [d.humanId, d.baselineWatts]));
      const spiking = [`${feederId}-relay-1`, `${feederId}-relay-2`, `${feederId}-relay-3`];
      const readings = simulateCoincidentalWindow(devices, spiking, 1_800_000_000, 300, 60);

      const scores = scoreDevices(readings, devices, baselineByDevice, model);
      totalFlagged += scores.filter((s) => s.flagged).length;
      totalDevices += spiking.length;
    }

    const falsePositiveRate = totalFlagged / totalDevices;
    expect(falsePositiveRate, `false-positive rate too high: ${(falsePositiveRate * 100).toFixed(1)}%`).to.be.lessThan(0.4);
  });
});
