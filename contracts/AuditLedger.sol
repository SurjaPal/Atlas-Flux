// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title Atlas Flux — Audit Ledger (Layer 4)
/// @notice Immutable, tamper-evident record of: (1) device attestation
///         results and trust scores produced by Layer 0, (2) dispatch
///         commands issued by Layer 3, and (3) fraud flags raised against
///         devices or participants. Bulk sensor telemetry never touches
///         this contract directly — it is batched off-chain and anchored
///         here as a Merkle root, because at the scale of India's smart
///         meter rollout (200M+ sanctioned devices) writing every reading
///         on-chain is not gas-viable. This contract is the shared,
///         append-only surface that Layer 0 and Layer 3 both write to and
///         that Layer 5 dashboards and regulators can read/verify from.
/// @dev Roles:
///      - ATTESTER_ROLE   : Layer 0's attestation/anomaly-detection service
///      - DISPATCHER_ROLE : Layer 3's dispatch/fairness engine
///      - FRAUD_ORACLE_ROLE: the fraud-detection process (reuses Layer 0's
///        detector, extended from external-attack to internal-integrity use)
///      - PIPELINE_ROLE   : the off-chain telemetry ingestion pipeline that
///        anchors batch Merkle roots
///      All four are granted by DEFAULT_ADMIN_ROLE, held by the deployer
///      (intended to be a multisig/DISCOM-governance address in production,
///      an EOA for the hackathon demo).
contract AuditLedger is AccessControl {
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");
    bytes32 public constant DISPATCHER_ROLE = keccak256("DISPATCHER_ROLE");
    bytes32 public constant FRAUD_ORACLE_ROLE = keccak256("FRAUD_ORACLE_ROLE");
    bytes32 public constant PIPELINE_ROLE = keccak256("PIPELINE_ROLE");

    enum DispatchAction {
        CHARGE,
        DISCHARGE,
        SHED_LOAD,
        RESTORE_LOAD,
        ISOLATE,
        REINSTATE
    }

    enum FraudType {
        SPOOFED_TELEMETRY,
        DOUBLE_CLAIM,
        MISREPORTED_DISPATCH,
        COORDINATED_ANOMALY,
        OTHER
    }

    struct DeviceTrust {
        uint16 trustScore; // 0-1000, Layer 0's "Flexibility Credit Score" scaled to an integer
        bytes32 firmwareHash;
        uint64 lastAttestedAt;
        bool isolated;
        uint32 attestationCount;
    }

    struct BatchAnchor {
        bytes32 merkleRoot;
        uint256 recordCount;
        uint64 windowStart;
        uint64 windowEnd;
        address anchoredBy;
    }

    mapping(bytes32 => DeviceTrust) public deviceTrust;
    mapping(bytes32 => BatchAnchor) public batchAnchors;
    bytes32[] private _batchIds;

    uint256 public attestationCount;
    uint256 public dispatchCount;
    uint256 public fraudFlagCount;

    event AttestationLogged(
        bytes32 indexed deviceId,
        uint16 trustScore,
        bytes32 firmwareHash,
        uint64 timestamp,
        address reporter
    );

    event DeviceIsolated(bytes32 indexed deviceId, string reason, uint64 timestamp);
    event DeviceReinstated(bytes32 indexed deviceId, uint64 timestamp);

    event DispatchLogged(
        bytes32 indexed deviceId,
        bytes32 indexed feederId,
        DispatchAction action,
        uint256 magnitudeWatts,
        string reason,
        uint64 timestamp,
        address dispatcher
    );

    event FraudFlagged(
        bytes32 indexed entityId,
        FraudType flagType,
        uint8 severity,
        bytes32 evidenceHash,
        string notes,
        uint64 timestamp,
        address reporter
    );

    event BatchAnchored(
        bytes32 indexed batchId,
        bytes32 merkleRoot,
        uint256 recordCount,
        uint64 windowStart,
        uint64 windowEnd,
        address anchoredBy
    );

    constructor(address admin) {
        require(admin != address(0), "AuditLedger: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ------------------------------------------------------------------
    // Layer 0 -> Layer 4: attestation results and trust-score updates
    // ------------------------------------------------------------------

    function logAttestation(
        bytes32 deviceId,
        uint16 trustScore,
        bytes32 firmwareHash
    ) external onlyRole(ATTESTER_ROLE) {
        require(trustScore <= 1000, "AuditLedger: score out of range");

        DeviceTrust storage d = deviceTrust[deviceId];
        d.trustScore = trustScore;
        d.firmwareHash = firmwareHash;
        d.lastAttestedAt = uint64(block.timestamp);
        d.attestationCount += 1;
        attestationCount += 1;

        emit AttestationLogged(deviceId, trustScore, firmwareHash, uint64(block.timestamp), msg.sender);
    }

    function isolateDevice(bytes32 deviceId, string calldata reason) external onlyRole(ATTESTER_ROLE) {
        deviceTrust[deviceId].isolated = true;
        emit DeviceIsolated(deviceId, reason, uint64(block.timestamp));
    }

    function reinstateDevice(bytes32 deviceId) external onlyRole(ATTESTER_ROLE) {
        deviceTrust[deviceId].isolated = false;
        emit DeviceReinstated(deviceId, uint64(block.timestamp));
    }

    // ------------------------------------------------------------------
    // Layer 3 -> Layer 4: dispatch commands
    // A dispatch call for an isolated device reverts, so Layer 0's trust
    // gate is enforced on-chain, not just trusted client-side.
    // ------------------------------------------------------------------

    function logDispatchCommand(
        bytes32 deviceId,
        bytes32 feederId,
        DispatchAction action,
        uint256 magnitudeWatts,
        string calldata reason
    ) external onlyRole(DISPATCHER_ROLE) {
        require(!deviceTrust[deviceId].isolated, "AuditLedger: device isolated, dispatch rejected");

        dispatchCount += 1;
        emit DispatchLogged(deviceId, feederId, action, magnitudeWatts, reason, uint64(block.timestamp), msg.sender);
    }

    // ------------------------------------------------------------------
    // Internal market integrity: fraud flags
    // Reuses the same detection engine as Layer 0, extended from external
    // attacks (MadIoT-style coordinated behavior) to internal fraud
    // (spoofed DR claims, misreported dispatch, double counting).
    // ------------------------------------------------------------------

    function flagFraud(
        bytes32 entityId,
        FraudType flagType,
        uint8 severity,
        bytes32 evidenceHash,
        string calldata notes
    ) external onlyRole(FRAUD_ORACLE_ROLE) {
        require(severity <= 100, "AuditLedger: severity out of range");

        fraudFlagCount += 1;
        emit FraudFlagged(entityId, flagType, severity, evidenceHash, notes, uint64(block.timestamp), msg.sender);
    }

    // ------------------------------------------------------------------
    // Off-chain telemetry pipeline -> Layer 4: batch anchoring
    // The pipeline hashes a window of raw sensor readings into a Merkle
    // tree off-chain and anchors only the root + a count/window here.
    // Any single reading can later be proven included via
    // verifyTelemetryInclusion, without ever storing the reading on-chain.
    // ------------------------------------------------------------------

    function anchorTelemetryBatch(
        bytes32 batchId,
        bytes32 merkleRoot,
        uint256 recordCount,
        uint64 windowStart,
        uint64 windowEnd
    ) external onlyRole(PIPELINE_ROLE) {
        require(batchAnchors[batchId].anchoredBy == address(0), "AuditLedger: batch already anchored");
        require(merkleRoot != bytes32(0), "AuditLedger: empty root");

        batchAnchors[batchId] = BatchAnchor(merkleRoot, recordCount, windowStart, windowEnd, msg.sender);
        _batchIds.push(batchId);

        emit BatchAnchored(batchId, merkleRoot, recordCount, windowStart, windowEnd, msg.sender);
    }

    function verifyTelemetryInclusion(
        bytes32 batchId,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 root = batchAnchors[batchId].merkleRoot;
        require(root != bytes32(0), "AuditLedger: unknown batch");
        return MerkleProof.verify(proof, root, leaf);
    }

    function batchCount() external view returns (uint256) {
        return _batchIds.length;
    }

    function batchIdAt(uint256 index) external view returns (bytes32) {
        return _batchIds[index];
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function getDeviceTrust(
        bytes32 deviceId
    )
        external
        view
        returns (uint16 trustScore, bytes32 firmwareHash, uint64 lastAttestedAt, bool isolated, uint32 attestations)
    {
        DeviceTrust storage d = deviceTrust[deviceId];
        return (d.trustScore, d.firmwareHash, d.lastAttestedAt, d.isolated, d.attestationCount);
    }
}
