const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

const ATTESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ATTESTER_ROLE"));
const DISPATCHER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISPATCHER_ROLE"));
const FRAUD_ORACLE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRAUD_ORACLE_ROLE"));
const PIPELINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PIPELINE_ROLE"));

const DEVICE_A = ethers.id("relay-feeder7-A213");
const FEEDER_7 = ethers.id("feeder-7-kharadi");

describe("AuditLedger (Layer 4)", function () {
  let ledger, admin, attesterSvc, dispatcherSvc, fraudSvc, pipelineSvc, stranger;

  beforeEach(async function () {
    [admin, attesterSvc, dispatcherSvc, fraudSvc, pipelineSvc, stranger] = await ethers.getSigners();

    const AuditLedger = await ethers.getContractFactory("AuditLedger");
    ledger = await AuditLedger.deploy(admin.address);
    await ledger.waitForDeployment();

    await ledger.connect(admin).grantRole(ATTESTER_ROLE, attesterSvc.address);
    await ledger.connect(admin).grantRole(DISPATCHER_ROLE, dispatcherSvc.address);
    await ledger.connect(admin).grantRole(FRAUD_ORACLE_ROLE, fraudSvc.address);
    await ledger.connect(admin).grantRole(PIPELINE_ROLE, pipelineSvc.address);
  });

  describe("access control", function () {
    it("rejects attestation from an unauthorized caller", async function () {
      await expect(
        ledger.connect(stranger).logAttestation(DEVICE_A, 900, ethers.id("fw-v1"))
      ).to.be.revertedWithCustomError(ledger, "AccessControlUnauthorizedAccount");
    });

    it("rejects dispatch commands from an unauthorized caller", async function () {
      await expect(
        ledger.connect(stranger).logDispatchCommand(DEVICE_A, FEEDER_7, 0, 500, "peak shave")
      ).to.be.revertedWithCustomError(ledger, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Layer 0 -> attestation", function () {
    it("records a trust score and firmware hash, and emits AttestationLogged", async function () {
      const fwHash = ethers.id("firmware-v1.0.3");
      await expect(ledger.connect(attesterSvc).logAttestation(DEVICE_A, 872, fwHash))
        .to.emit(ledger, "AttestationLogged")
        .withArgs(DEVICE_A, 872, fwHash, anyValue, attesterSvc.address);

      const trust = await ledger.getDeviceTrust(DEVICE_A);
      expect(trust.trustScore).to.equal(872);
      expect(trust.firmwareHash).to.equal(fwHash);
      expect(trust.isolated).to.equal(false);
      expect(trust.attestations).to.equal(1);
    });

    it("rejects a trust score above 1000", async function () {
      await expect(
        ledger.connect(attesterSvc).logAttestation(DEVICE_A, 1001, ethers.id("fw"))
      ).to.be.revertedWith("AuditLedger: score out of range");
    });

    it("isolating a device blocks subsequent dispatch commands", async function () {
      await ledger.connect(attesterSvc).logAttestation(DEVICE_A, 950, ethers.id("fw"));
      await ledger.connect(attesterSvc).isolateDevice(DEVICE_A, "MadIoT-pattern sync detected");

      await expect(
        ledger.connect(dispatcherSvc).logDispatchCommand(DEVICE_A, FEEDER_7, 1 /* DISCHARGE */, 1200, "shortfall response")
      ).to.be.revertedWith("AuditLedger: device isolated, dispatch rejected");

      await ledger.connect(attesterSvc).reinstateDevice(DEVICE_A);
      await expect(
        ledger.connect(dispatcherSvc).logDispatchCommand(DEVICE_A, FEEDER_7, 1, 1200, "shortfall response")
      ).to.emit(ledger, "DispatchLogged");
    });
  });

  describe("Layer 3 -> dispatch", function () {
    it("logs a dispatch command and increments dispatchCount", async function () {
      await expect(
        ledger.connect(dispatcherSvc).logDispatchCommand(DEVICE_A, FEEDER_7, 2 /* SHED_LOAD */, 800, "fairness rotation")
      ).to.emit(ledger, "DispatchLogged");

      expect(await ledger.dispatchCount()).to.equal(1);
    });
  });

  describe("fraud flags", function () {
    it("logs a fraud flag and increments fraudFlagCount", async function () {
      const evidence = ethers.id("mismatched-telemetry-window-4471");
      await expect(
        ledger.connect(fraudSvc).flagFraud(DEVICE_A, 0 /* SPOOFED_TELEMETRY */, 78, evidence, "claimed 3.2kW reduction, telemetry shows 0.4kW")
      ).to.emit(ledger, "FraudFlagged");

      expect(await ledger.fraudFlagCount()).to.equal(1);
    });

    it("rejects severity above 100", async function () {
      await expect(
        ledger.connect(fraudSvc).flagFraud(DEVICE_A, 0, 101, ethers.id("x"), "n/a")
      ).to.be.revertedWith("AuditLedger: severity out of range");
    });
  });

  describe("telemetry batch anchoring + Merkle proofs", function () {
    it("anchors a batch root and verifies a leaf's inclusion", async function () {
      // Simulate what pipeline/ingestion.js does: hash a window of readings
      // into a Merkle tree off-chain, anchor only the root on-chain.
      const readings = [
        [DEVICE_A, "1726790400", "312"], // deviceId, unixTs, watts
        [DEVICE_A, "1726790460", "298"],
        [DEVICE_A, "1726790520", "305"],
      ];
      const tree = StandardMerkleTree.of(readings, ["bytes32", "uint256", "uint256"]);

      const batchId = ethers.id("batch-2026-09-20-08");
      await expect(
        ledger.connect(pipelineSvc).anchorTelemetryBatch(batchId, tree.root, readings.length, 1726790400, 1726790520)
      ).to.emit(ledger, "BatchAnchored");

      expect(await ledger.batchCount()).to.equal(1);

      // Prove the second reading was part of the anchored batch. Use the
      // tree's own leaf-encoding (double keccak256 of the ABI-encoded
      // tuple) so it matches what OpenZeppelin's MerkleProof.verify expects
      // on-chain — this is also what pipeline/ingestion.js does per-leaf.
      const leafIndex = 1;
      const proof = tree.getProof(leafIndex);
      const leaf = tree.leafHash(readings[leafIndex]);

      const ok = await ledger.verifyTelemetryInclusion(batchId, leaf, proof);
      expect(ok).to.equal(true);
    });

    it("rejects anchoring the same batchId twice", async function () {
      const batchId = ethers.id("batch-dupe");
      await ledger.connect(pipelineSvc).anchorTelemetryBatch(batchId, ethers.id("root1"), 10, 0, 60);
      await expect(
        ledger.connect(pipelineSvc).anchorTelemetryBatch(batchId, ethers.id("root2"), 10, 60, 120)
      ).to.be.revertedWith("AuditLedger: batch already anchored");
    });
  });
});
