// pipeline/ingestion.js
//
// Design choice worth stating explicitly (this is the "infra/sensing
// realism" half of the role, not just the contract): raw telemetry never
// goes on-chain. At RDSS's sanctioned scale — 20.33 crore (203M) smart
// meters — writing every reading as an on-chain transaction is not
// gas-viable, full stop. So:
//
//   1. Raw readings land in off-chain storage (here: a JSON file per batch,
//      standing in for a real time-series DB / data lake in production).
//   2. A Merkle tree is built over the batch.
//   3. Only the Merkle root (+ record count + time window) is written
//      on-chain via AuditLedger.anchorTelemetryBatch.
//   4. Anyone who wants to verify a specific reading was really part of
//      that anchored batch can request the leaf + proof from off-chain
//      storage and check it against the on-chain root — tamper-evidence
//      without on-chain storage cost.
//
// This mirrors how the dossier's own OT-security vendors (Dragos, Claroty)
// and grid telemetry systems generally operate: bulk data stays in
// utility/vendor infrastructure, only integrity commitments are anchored
// to something harder to alter after the fact.

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const chainClient = require("./chainClient");

const DATA_DIR = path.join(__dirname, "data");
const LEAF_TYPES = ["bytes32", "uint256", "uint256"]; // deviceId, timestamp, watts

function readingToLeafValue(reading) {
  return [chainClient.deviceId(reading.deviceHumanId), reading.timestamp, reading.watts];
}

function buildBatchTree(readings) {
  const values = readings.map(readingToLeafValue);
  return StandardMerkleTree.of(values, LEAF_TYPES);
}

function persistBatch(humanBatchId, readings, tree) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${humanBatchId}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ humanBatchId, readings, treeDump: tree.dump() }, null, 2)
  );
  return file;
}

/**
 * Batches a window of readings, persists them off-chain, and anchors the
 * Merkle root on-chain via the pipeline signer (PIPELINE_ROLE).
 */
async function anchorBatch(ledger, pipelineSigner, humanBatchId, readings) {
  if (readings.length === 0) throw new Error("ingestion: cannot anchor an empty batch");

  const tree = buildBatchTree(readings);
  const windowStart = Math.min(...readings.map((r) => r.timestamp));
  const windowEnd = Math.max(...readings.map((r) => r.timestamp));

  persistBatch(humanBatchId, readings, tree);

  const receipt = await chainClient.anchorTelemetryBatch(
    ledger,
    pipelineSigner,
    humanBatchId,
    tree.root,
    readings.length,
    windowStart,
    windowEnd
  );

  return { tree, root: tree.root, windowStart, windowEnd, receipt };
}

/** Loads a previously-persisted batch and returns a proof for one reading, for later verification against the on-chain root. */
function getProofForReading(humanBatchId, reading) {
  const file = path.join(DATA_DIR, `${humanBatchId}.json`);
  const { treeDump } = JSON.parse(fs.readFileSync(file, "utf8"));
  const tree = StandardMerkleTree.load(treeDump);

  const value = readingToLeafValue(reading);
  for (const [i, v] of tree.entries()) {
    if (JSON.stringify(v) === JSON.stringify(value)) {
      return { leaf: tree.leafHash(v), proof: tree.getProof(i) };
    }
  }
  throw new Error("ingestion: reading not found in persisted batch");
}

module.exports = { buildBatchTree, anchorBatch, getProofForReading, readingToLeafValue };
