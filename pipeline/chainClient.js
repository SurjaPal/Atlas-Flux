// pipeline/chainClient.js
//
// Thin wrapper around the AuditLedger contract. This is the integration
// surface Layer 0 (Sudipto's attestation/anomaly service) and Layer 3
// (Soumyadip's dispatch/fairness engine) are expected to call into — they
// shouldn't need to know ethers.js or the ABI, just these functions.
//
// Each exported function takes an ethers.Signer already holding the
// relevant role (ATTESTER_ROLE, DISPATCHER_ROLE, FRAUD_ORACLE_ROLE,
// PIPELINE_ROLE) and the deployed contract instance.

const { ethers } = require("hardhat");

const DispatchAction = Object.freeze({
  CHARGE: 0,
  DISCHARGE: 1,
  SHED_LOAD: 2,
  RESTORE_LOAD: 3,
  ISOLATE: 4,
  REINSTATE: 5,
});

const FraudType = Object.freeze({
  SPOOFED_TELEMETRY: 0,
  DOUBLE_CLAIM: 1,
  MISREPORTED_DISPATCH: 2,
  COORDINATED_ANOMALY: 3,
  OTHER: 4,
});

/** Deterministic on-chain id for a device, so every layer derives the same bytes32 from the same human-readable id. */
function deviceId(humanId) {
  return ethers.id(humanId);
}

function feederId(humanId) {
  return ethers.id(humanId);
}

// ---- Layer 0: attestation ----

async function logAttestation(ledger, attesterSigner, humanDeviceId, trustScore, firmwareHashHex) {
  const tx = await ledger
    .connect(attesterSigner)
    .logAttestation(deviceId(humanDeviceId), trustScore, firmwareHashHex);
  return tx.wait();
}

async function isolateDevice(ledger, attesterSigner, humanDeviceId, reason) {
  const tx = await ledger.connect(attesterSigner).isolateDevice(deviceId(humanDeviceId), reason);
  return tx.wait();
}

async function reinstateDevice(ledger, attesterSigner, humanDeviceId) {
  const tx = await ledger.connect(attesterSigner).reinstateDevice(deviceId(humanDeviceId));
  return tx.wait();
}

async function getDeviceTrust(ledger, humanDeviceId) {
  const t = await ledger.getDeviceTrust(deviceId(humanDeviceId));
  return {
    trustScore: Number(t.trustScore),
    firmwareHash: t.firmwareHash,
    lastAttestedAt: Number(t.lastAttestedAt),
    isolated: t.isolated,
    attestations: Number(t.attestations),
  };
}

// ---- Layer 3: dispatch ----

async function logDispatchCommand(ledger, dispatcherSigner, humanDeviceId, humanFeederId, action, magnitudeWatts, reason) {
  const tx = await ledger
    .connect(dispatcherSigner)
    .logDispatchCommand(deviceId(humanDeviceId), feederId(humanFeederId), action, magnitudeWatts, reason);
  return tx.wait(); // reverts (and this throws) if the device is isolated — that's the trust gate
}

// ---- Fraud / internal integrity ----

async function flagFraud(ledger, fraudSigner, humanEntityId, flagType, severity, evidenceHashHex, notes) {
  const tx = await ledger
    .connect(fraudSigner)
    .flagFraud(deviceId(humanEntityId), flagType, severity, evidenceHashHex, notes);
  return tx.wait();
}

// ---- Pipeline: telemetry batch anchoring ----

async function anchorTelemetryBatch(ledger, pipelineSigner, humanBatchId, merkleRoot, recordCount, windowStart, windowEnd) {
  const tx = await ledger
    .connect(pipelineSigner)
    .anchorTelemetryBatch(ethers.id(humanBatchId), merkleRoot, recordCount, windowStart, windowEnd);
  return tx.wait();
}

async function verifyTelemetryInclusion(ledger, humanBatchId, leaf, proof) {
  return ledger.verifyTelemetryInclusion(ethers.id(humanBatchId), leaf, proof);
}

module.exports = {
  DispatchAction,
  FraudType,
  deviceId,
  feederId,
  logAttestation,
  isolateDevice,
  reinstateDevice,
  getDeviceTrust,
  logDispatchCommand,
  flagFraud,
  anchorTelemetryBatch,
  verifyTelemetryInclusion,
};
