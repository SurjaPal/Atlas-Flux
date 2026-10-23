// layer0/trustEngine.js
//
// The runtime entry point for Layer 0: given a window of telemetry
// readings, returns a trust score (0-1000, the architecture doc's
// "Flexibility Credit Score") for every relay device, plus a short list
// of devices whose attack probability crossed the decision threshold.
// This is what pipeline/runDemo.js (and, later, a real deployment) calls
// instead of hand-written rules.

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { buildFeatureRows } = require("./graphUtils");
const { CostSensitiveLogisticClassifier } = require("./costSensitiveClassifier");
const { MLPClassifier } = require("./neuralNet");
const { nearestFingerprint } = require("./threatMesh");

function loadModel(modelPath = path.join(__dirname, "model.json")) {
  if (!fs.existsSync(modelPath)) {
    throw new Error(`layer0: no trained model at ${modelPath} — run "node layer0/train.js" first.`);
  }
  const raw = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const modelType = raw.modelType || "logreg"; // older model.json files predate the MLP comparison and default to logreg
  const classifier = modelType === "mlp" ? MLPClassifier.fromJSON(raw) : CostSensitiveLogisticClassifier.fromJSON(raw);
  return {
    classifier,
    modelType,
    featureNames: raw.featureNames,
    decisionThreshold: raw.decisionThreshold ?? 0.7,
    trainedAt: raw.trainedAt,
    testMetrics: raw.testMetrics,
  };
}

function featureRowToVector(row) {
  return [
    row.spikeRatio,
    row.neighborMeanSpikeRatio,
    row.neighborStdSpikeRatio,
    row.neighborCount,
    row.activeNeighborMeanSpikeRatio,
    row.activeNeighborStdSpikeRatio,
    row.activeNeighborCount,
    row.ownVsNeighborGap,
    row.ownVsActiveNeighborGap,
  ];
}

/**
 * Scores every (relay device, timestamp) pair in the window, then reduces
 * to one entry per device using the worst (highest attack-probability)
 * timestamp — attestation should reflect the most suspicious moment in
 * the window, not an average that dilutes a brief but real spike.
 *
 * @returns {Array} [{ deviceHumanId, attackProbability, trustScore, flagged, worstTimestamp, evidenceHash, reason }]
 */
function scoreDevices(readings, devices, baselineByDevice, model) {
  const { rows, index } = buildFeatureRows(readings, devices, baselineByDevice);
  if (rows.length === 0) return [];

  const X = rows.map(featureRowToVector);
  const probs = model.classifier.predictProba(X);

  const byDevice = new Map();
  for (let i = 0; i < rows.length; i++) {
    const { deviceHumanId, timestamp } = index[i];
    const p = probs[i];
    const prev = byDevice.get(deviceHumanId);
    if (!prev || p > prev.attackProbability) {
      byDevice.set(deviceHumanId, {
        deviceHumanId,
        attackProbability: p,
        worstTimestamp: timestamp,
        features: rows[i],
        featureVector: X[i],
      });
    }
  }

  return [...byDevice.values()].map((d) => {
    const trustScore = Math.round(1000 * (1 - d.attackProbability));
    const flagged = d.attackProbability >= model.decisionThreshold;
    const evidenceHash = ethers.id(
      JSON.stringify({ deviceHumanId: d.deviceHumanId, timestamp: d.worstTimestamp, features: d.features })
    );
    return {
      deviceHumanId: d.deviceHumanId,
      attackProbability: Number(d.attackProbability.toFixed(4)),
      trustScore,
      flagged,
      worstTimestamp: d.worstTimestamp,
      evidenceHash,
      severity: Math.min(100, Math.round(d.attackProbability * 100)),
      featureVector: d.featureVector,
      reason: flagged
        ? `attack probability ${(d.attackProbability * 100).toFixed(1)}% >= decision threshold ${(model.decisionThreshold * 100).toFixed(0)}% (synchronized-load signature)`
        : `attack probability ${(d.attackProbability * 100).toFixed(1)}%, below threshold`,
    };
  });
}

// How much a mesh corroboration can shift an uncertain local probability
// toward "attack". Two safeguards, both deliberate:
//   1. MESH_BOOST_FACTOR is well below 1.0, so cross-feeder intelligence
//      can only ever supplement local evidence, never manufacture a flag
//      from nothing.
//   2. MESH_MIN_LOCAL_SIGNAL: the boost only applies at all once the
//      local model shows *some* anomalous signal already. Without this
//      floor, a single malicious or compromised mesh publisher could
//      flag devices on feeders with zero corroborating local evidence —
//      a real abuse vector for a federated trust system, not a
//      hypothetical one (see INVENTION.md's "Abuse resistance" section).
const MESH_BOOST_FACTOR = 0.75;
const MESH_MIN_LOCAL_SIGNAL = 0.02;

/**
 * Same as scoreDevices, but additionally checks each device's feature
 * vector against a set of fingerprints fetched from the Federated Attack
 * Signature Mesh (see threatMesh.js / INVENTION.md). A close match to a
 * previously-published attack signature from elsewhere nudges an
 * uncertain local probability upward — this is where the mesh earns its
 * keep: a borderline case the local classifier alone wouldn't confidently
 * flag can cross the threshold when corroborated by another feeder's
 * independent incident. It cannot, by design, flag a device the local
 * model sees as entirely clean (see MESH_MIN_LOCAL_SIGNAL above).
 *
 * @param {Array} knownFingerprints - from threatMesh.fetchRecentFingerprints()
 */
function scoreDevicesWithMesh(readings, devices, baselineByDevice, model, knownFingerprints) {
  const baseScores = scoreDevices(readings, devices, baselineByDevice, model);

  return baseScores.map((s) => {
    const { corroboration, minDistance } = nearestFingerprint(s.featureVector, knownFingerprints);
    const eligibleForBoost = s.attackProbability >= MESH_MIN_LOCAL_SIGNAL;
    const effectiveCorroboration = eligibleForBoost ? corroboration : 0;
    const adjustedProbability = Math.min(
      1,
      s.attackProbability + (1 - s.attackProbability) * effectiveCorroboration * MESH_BOOST_FACTOR
    );
    const flagged = adjustedProbability >= model.decisionThreshold;
    const meshContributed = flagged && !s.flagged;

    return {
      ...s,
      attackProbability: Number(adjustedProbability.toFixed(4)),
      trustScore: Math.round(1000 * (1 - adjustedProbability)),
      flagged,
      meshCorroboration: Number(effectiveCorroboration.toFixed(3)),
      meshHammingDistance: minDistance,
      meshContributed,
      reason: meshContributed
        ? `attack probability ${(adjustedProbability * 100).toFixed(1)}% (locally only ${(s.attackProbability * 100).toFixed(1)}%, below threshold alone — flagged because a mesh match at Hamming distance ${minDistance}/64 corroborates a similar incident confirmed on another feeder)`
        : s.reason,
    };
  });
}

module.exports = { loadModel, scoreDevices, scoreDevicesWithMesh, featureRowToVector };
