// layer0/threatMesh.js
//
// Ties simhash.js (fingerprinting) to the ThreatMesh contract
// (publication) into the actual decision-support function Layer 0 uses:
// "has a feature vector like this one been seen elsewhere before?"

const { ethers } = require("hardhat");
const { generateHyperplanes, computeFingerprint, hammingDistance, fingerprintToHex, hexToFingerprint } = require("./simhash");

const NUM_BITS = 64;
const HYPERPLANE_SEED = 42; // public mesh parameter — every feeder derives identical hyperplanes from this

function getHyperplanes(featureDim) {
  return generateHyperplanes(featureDim, NUM_BITS, HYPERPLANE_SEED);
}

async function deployThreatMesh(adminSigner) {
  const ThreatMesh = await ethers.getContractFactory("ThreatMesh");
  const mesh = await ThreatMesh.deploy(adminSigner.address);
  await mesh.waitForDeployment();
  return mesh;
}

/** Publishes an attack's fingerprint to the mesh — no device/feeder identity included, by design. */
async function publishToMesh(mesh, publisherSigner, featureVector, { attackTypeCode = 0, severity = 50 } = {}) {
  const hyperplanes = getHyperplanes(featureVector.length);
  const bits = computeFingerprint(featureVector, hyperplanes);
  const hex = fingerprintToHex(bits); // 64 bits = 16 hex chars = 8 bytes, matches bytes8
  const tx = await mesh.connect(publisherSigner).publishFingerprint(hex, attackTypeCode, severity);
  await tx.wait();
  return { bits, hex };
}

/** Pulls the most recent N entries from the mesh and decodes their fingerprints. */
async function fetchRecentFingerprints(mesh, count = 200) {
  const entries = await mesh.recentEntries(count);
  return entries.map((e) => ({
    bits: hexToFingerprint(e.fingerprint, NUM_BITS),
    attackTypeCode: Number(e.attackTypeCode),
    severity: Number(e.severity),
    timestamp: Number(e.timestamp),
  }));
}

/**
 * Compares a local feature vector against known mesh fingerprints and
 * returns the closest match plus a [0,1] "corroboration" score — 1.0 for
 * an identical signature, ~0 for Hamming distance at or beyond the
 * ~random-chance baseline (numBits/2), since beyond that point the match
 * carries no information (see simhash.js's statistical verification).
 */
function nearestFingerprint(featureVector, knownFingerprints) {
  if (knownFingerprints.length === 0) return { match: null, minDistance: NUM_BITS, corroboration: 0 };

  const hyperplanes = getHyperplanes(featureVector.length);
  const localBits = computeFingerprint(featureVector, hyperplanes);

  let best = null;
  let minDistance = NUM_BITS;
  for (const entry of knownFingerprints) {
    const d = hammingDistance(localBits, entry.bits);
    if (d < minDistance) {
      minDistance = d;
      best = entry;
    }
  }

  const chanceLevel = NUM_BITS / 2;
  const corroboration = Math.max(0, (chanceLevel - minDistance) / chanceLevel);
  return { match: best, minDistance, corroboration, localFingerprint: localBits };
}

module.exports = { NUM_BITS, getHyperplanes, deployThreatMesh, publishToMesh, fetchRecentFingerprints, nearestFingerprint };
