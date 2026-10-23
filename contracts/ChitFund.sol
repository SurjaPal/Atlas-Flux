// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Atlas Flux — Chit Fund Ownership (Layer 1)
/// @notice A neighbourhood pools small recurring contributions into a
///         shared fund that owns the physical flexibility assets (thermal
///         storage, a small community battery) — structurally similar to
///         a traditional Indian chit fund (rotating savings, Chit Funds
///         Act 1982), except what rotates here is *priority access to the
///         shared asset during a shortfall*, not a cash payout. No single
///         household needs capital upfront; everyone gets a fair turn at
///         priority.
/// @dev This contract tracks membership, contributions, and rotation
///      state (who was most recently prioritized). It does NOT decide
///      *when* to shed load or *how much* — that's Layer 3's
///      dispatch/fairness engine, which reads `nextInRotation` and calls
///      `recordServed` after acting. Keeping the decision logic off-chain
///      and the fairness *ledger* on-chain keeps this contract cheap and
///      auditable without needing to re-deploy it every time the dispatch
///      strategy changes.
contract ChitFund is AccessControl {
    bytes32 public constant FUND_ADMIN_ROLE = keccak256("FUND_ADMIN_ROLE");
    bytes32 public constant DISPATCH_ROLE = keccak256("DISPATCH_ROLE");

    struct Member {
        bool exists;
        uint256 totalContributedWei;
        uint64 joinedAt;
        uint64 lastServedAt; // last time this household was given priority protection
        uint32 timesServed;
    }

    mapping(bytes32 => Member) public members;
    bytes32[] private _memberIds;

    event MemberJoined(bytes32 indexed householdId, uint64 timestamp);
    event ContributionMade(bytes32 indexed householdId, uint256 amountWei, uint256 newTotalWei, uint64 timestamp);
    event MemberServed(bytes32 indexed householdId, uint32 timesServed, uint64 timestamp);
    event FundsDisbursed(address indexed to, uint256 amountWei, string purpose, uint64 timestamp);

    constructor(address admin) {
        require(admin != address(0), "ChitFund: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function joinFund(bytes32 householdId) external onlyRole(FUND_ADMIN_ROLE) {
        require(!members[householdId].exists, "ChitFund: already a member");
        members[householdId] = Member({
            exists: true,
            totalContributedWei: 0,
            joinedAt: uint64(block.timestamp),
            lastServedAt: 0, // never served -> highest rotation priority by default
            timesServed: 0
        });
        _memberIds.push(householdId);
        emit MemberJoined(householdId, uint64(block.timestamp));
    }

    function contribute(bytes32 householdId) external payable {
        require(members[householdId].exists, "ChitFund: not a member");
        require(msg.value > 0, "ChitFund: zero contribution");
        members[householdId].totalContributedWei += msg.value;
        emit ContributionMade(householdId, msg.value, members[householdId].totalContributedWei, uint64(block.timestamp));
    }

    /// @notice Called by Layer 3 after a household's load was protected
    /// (served) during a shortfall, so the rotation ledger stays current.
    function recordServed(bytes32 householdId) external onlyRole(DISPATCH_ROLE) {
        require(members[householdId].exists, "ChitFund: not a member");
        Member storage m = members[householdId];
        m.lastServedAt = uint64(block.timestamp);
        m.timesServed += 1;
        emit MemberServed(householdId, m.timesServed, uint64(block.timestamp));
    }

    /// @notice Given a set of candidate households (e.g. those with a
    ///         trusted, dispatchable device right now), returns whichever
    ///         has gone longest without being served — the fairness rule:
    ///         no single household should be repeatedly passed over for
    ///         priority while others are protected every time.
    function nextInRotation(bytes32[] calldata candidateHouseholdIds) external view returns (bytes32) {
        require(candidateHouseholdIds.length > 0, "ChitFund: no candidates");
        bytes32 best = candidateHouseholdIds[0];
        uint64 bestServedAt = members[best].lastServedAt;
        for (uint256 i = 1; i < candidateHouseholdIds.length; i++) {
            bytes32 candidate = candidateHouseholdIds[i];
            uint64 servedAt = members[candidate].lastServedAt;
            if (servedAt < bestServedAt) {
                best = candidate;
                bestServedAt = servedAt;
            }
        }
        return best;
    }

    /// @notice Pooled fund spent on the shared physical asset (thermal
    ///         storage unit, community battery) — kept on-chain for
    ///         transparency into how member contributions were used.
    function disburse(address payable to, uint256 amountWei, string calldata purpose) external onlyRole(FUND_ADMIN_ROLE) {
        require(amountWei <= address(this).balance, "ChitFund: insufficient fund balance");
        emit FundsDisbursed(to, amountWei, purpose, uint64(block.timestamp));
        (bool success, ) = to.call{value: amountWei}("");
        require(success, "ChitFund: transfer failed");
    }

    function fundBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function memberCount() external view returns (uint256) {
        return _memberIds.length;
    }

    function memberIdAt(uint256 index) external view returns (bytes32) {
        return _memberIds[index];
    }
}
