// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Atlas Flux — Federated Attack Signature Mesh (FASM)
/// @notice A decentralized, privacy-preserving early-warning registry for
///         coordinated IoT attacks (MadIoT-class) across independently
///         operated feeders. When any feeder's Layer 0 detects a
///         coordinated-anomaly attack, it publishes a compact locality-
///         sensitive-hash "fingerprint" of the attack's behavioral
///         signature here — NOT the device IDs, feeder identity, or raw
///         telemetry involved. Other feeders can then check incoming
///         suspicious activity against the mesh: a close fingerprint
///         match means "a similar attack pattern was already seen
///         elsewhere," which is corroborating evidence a purely local
///         detector cannot produce on its own, especially for a slow-
///         rollout or low-and-slow variant of an attack a single feeder
///         hasn't seen enough examples of yet.
/// @dev See /INVENTION.md for the full design rationale, novelty
///      argument against existing OT security vendors (who do this
///      centrally, not as a decentralized public good), and the
///      cryptographic reasoning behind using SimHash (Charikar, 2002)
///      specifically. This contract is deliberately minimal — it is a
///      tamper-evident, append-only publication log, not a computation
///      engine; similarity matching happens off-chain in
///      layer0/threatMesh.js, because Hamming-distance search over a
///      growing fingerprint set is far cheaper there than on-chain.
contract ThreatMesh is AccessControl {
    bytes32 public constant MESH_PUBLISHER_ROLE = keccak256("MESH_PUBLISHER_ROLE");

    struct Entry {
        bytes8 fingerprint; // 64-bit SimHash fingerprint — see layer0/simhash.js
        uint8 attackTypeCode; // 0 = COORDINATED_LOAD_SPIKE (MadIoT-class); room to extend
        uint8 severity; // 0-100, as assessed locally by the publishing feeder
        uint64 timestamp;
    }

    Entry[] private _entries;

    event FingerprintPublished(uint256 indexed index, bytes8 fingerprint, uint8 attackTypeCode, uint8 severity, uint64 timestamp);

    constructor(address admin) {
        require(admin != address(0), "ThreatMesh: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Publishes an attack fingerprint. Deliberately takes no
    ///         device, household, or feeder identifier — publishing an
    ///         identity alongside the fingerprint would defeat the
    ///         privacy property the whole design depends on.
    function publishFingerprint(bytes8 fingerprint, uint8 attackTypeCode, uint8 severity) external onlyRole(MESH_PUBLISHER_ROLE) {
        require(severity <= 100, "ThreatMesh: severity out of range");
        _entries.push(Entry({ fingerprint: fingerprint, attackTypeCode: attackTypeCode, severity: severity, timestamp: uint64(block.timestamp) }));
        emit FingerprintPublished(_entries.length - 1, fingerprint, attackTypeCode, severity, uint64(block.timestamp));
    }

    function entryCount() external view returns (uint256) {
        return _entries.length;
    }

    function entryAt(uint256 index) external view returns (bytes8 fingerprint, uint8 attackTypeCode, uint8 severity, uint64 timestamp) {
        Entry storage e = _entries[index];
        return (e.fingerprint, e.attackTypeCode, e.severity, e.timestamp);
    }

    /// @notice Returns up to `count` of the most recent entries, for a
    ///         feeder joining the mesh to bootstrap its local comparison
    ///         set without paginating from index 0.
    function recentEntries(uint256 count) external view returns (Entry[] memory) {
        uint256 n = _entries.length;
        uint256 take = count > n ? n : count;
        Entry[] memory out = new Entry[](take);
        for (uint256 i = 0; i < take; i++) {
            out[i] = _entries[n - take + i];
        }
        return out;
    }
}
