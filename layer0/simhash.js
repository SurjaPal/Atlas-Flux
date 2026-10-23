// layer0/simhash.js
//
// Part of the Federated Attack Signature Mesh (FASM) — see
// INVENTION.md for the full writeup. This module turns a real-valued
// attack feature vector into a compact binary fingerprint via
// random-hyperplane locality-sensitive hashing (SimHash, Charikar 2002):
// similar feature vectors hash to fingerprints with small Hamming
// distance, dissimilar ones to fingerprints that are ~uncorrelated
// (expected Hamming distance ≈ numBits/2). This is the property that
// makes cross-feeder matching possible without ever comparing or
// transmitting raw feature vectors, device IDs, or locations — only the
// fingerprint bits leave the feeder.

/**
 * Deterministic pseudo-random hyperplanes from a numeric seed, so every
 * feeder in the mesh can independently derive the *same* hyperplane set
 * (it's a public parameter of the mesh, not a secret) without a
 * coordination round-trip.
 */
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateHyperplanes(dim, numBits, seed = 42) {
  const rand = seededRandom(seed);
  const planes = [];
  for (let b = 0; b < numBits; b++) {
    const plane = [];
    for (let d = 0; d < dim; d++) plane.push(rand() * 2 - 1); // uniform in [-1, 1]
    planes.push(plane);
  }
  return planes;
}

/** Projects a feature vector onto each hyperplane; bit = 1 if dot product > 0. */
function computeFingerprint(featureVector, hyperplanes) {
  let bits = "";
  for (const plane of hyperplanes) {
    const dot = plane.reduce((s, w, i) => s + w * (featureVector[i] || 0), 0);
    bits += dot > 0 ? "1" : "0";
  }
  return bits;
}

function hammingDistance(a, b) {
  if (a.length !== b.length) throw new Error("simhash: fingerprint length mismatch");
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Packs a bit string into a hex string suitable for a Solidity bytesN parameter. */
function fingerprintToHex(bits) {
  let hex = "0x";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = bits.slice(i, i + 4).padEnd(4, "0");
    hex += parseInt(nibble, 2).toString(16);
  }
  return hex;
}

function hexToFingerprint(hex, numBits) {
  let bits = "";
  const clean = hex.replace(/^0x/, "");
  for (const ch of clean) {
    bits += parseInt(ch, 16).toString(2).padStart(4, "0");
  }
  return bits.slice(0, numBits);
}

module.exports = { generateHyperplanes, computeFingerprint, hammingDistance, fingerprintToHex, hexToFingerprint };
