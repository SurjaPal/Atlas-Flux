# Gap analysis: what could still go wrong, and what's done about it

A systematic pass over Atlas Flux looking for the gaps a judge, a security reviewer, or a DISCOM procurement team would find — not just "does it work" but "what breaks it, what's been done about that, and what's still open." Organized by category. Each item says: the gap, why it's real, and the current mitigation (or an honest "not yet handled, here's the plan").

## 1. Off-chain oracle key compromise

**Gap:** `ATTESTER_ROLE`, `DISPATCHER_ROLE`, `FRAUD_ORACLE_ROLE`, and `PIPELINE_ROLE` are each a single key in this prototype. Whoever holds the `ATTESTER_ROLE` private key can log arbitrary trust scores for any device — including marking a compromised device as fully trusted. The on-chain trust gate (`logDispatchCommand` reverting for isolated devices) is only as good as the integrity of whoever calls `isolateDevice`/`reinstateDevice`.

**Mitigation here:** role-based separation already means compromising one service (say, the dispatch engine) doesn't grant attestation authority — the roles are independently revocable by `DEFAULT_ADMIN_ROLE`.

**Not yet handled:** a single EOA per role is a single point of failure in production. The standard answer is a **multi-signature or threshold-signature requirement** for `ATTESTER_ROLE` specifically (since it's the one role that can clear a device of suspicion), e.g. a Gnosis Safe requiring 3-of-5 DISCOM/aggregator signers before an `isolateDevice`/`reinstateDevice` call executes. `AuditLedger.sol`'s `AccessControl` pattern supports granting a role to a multisig contract address with zero code changes — this is a deployment-configuration decision, not an architecture change, which is why it's flagged here rather than built: there's no multisig to configure yet for a hackathon demo with one admin key.

## 2. Sybil risk in chit-fund membership

**Gap:** `ChitFund.joinFund` lets `FUND_ADMIN_ROLE` register any `bytes32` household ID. Nothing ties a household ID to a real, unique household — a single person (or a malicious insider with `FUND_ADMIN_ROLE`) could register many fake "households," each accumulating fair-rotation priority (`nextInRotation` weighting) without actually being distinct real contributors, diluting genuine members' rotation turns.

**Mitigation here:** `FUND_ADMIN_ROLE` is itself a controlled role (not open registration) — this isn't a public, permissionless sign-up contract, so a Sybil attack requires either compromising the admin role or an inside job by whoever runs it.

**Not yet handled:** the real fix is binding household IDs to something a DISCOM already verifies — the **existing RDSS smart-meter consumer ID**, which is tied to a billing account and KYC during meter installation. `householdId` is currently derived as `ethers.id(humanReadableString)` with no such binding. A production version would derive it from (or store alongside) the DISCOM's own consumer ID, making a fake household require forging a real meter registration — a much higher bar, and one the DISCOM (not Atlas Flux) would already be enforcing.

## 3. Weather forecast input manipulation

**Gap:** Layer 2's dispatch decisions depend on a cloud-cover forecast (`forecastCloudCover` in the real pipeline would come from an external weather API). If that single data source is wrong — corrupted, delayed, or in a real deployment, spoofed — `weatherInformedSolarForecast` silently produces a bad gap-risk estimate, and Layer 3 dispatches on it.

**Mitigation here:** `naiveSolarForecast` (climatology, ignoring live weather entirely) exists as a fallback path already in `forecastEngine.js` — not currently wired as an automatic failover, but the code to fall back to it if a weather feed looks stale or absent already exists and would be a small integration, not a new build.

**Not yet handled:** multi-source weather consensus (cross-checking 2+ independent weather APIs, flagging disagreement beyond a threshold rather than trusting one feed blindly) is the standard mitigation in real forecasting systems and isn't built here — there's exactly one synthetic weather source in this prototype, by construction, since there's no real feeder to pull live weather for.

## 4. False isolation / no appeal path

**Gap:** `isolateDevice` is called automatically and immediately whenever Layer 0 flags a device (see `runFullDemo.js`'s attack-response flow). A false positive — and the measured ~93-98% precision means false positives *will* happen at scale — cuts a real household off from dispatch with no review step before that happens.

**Mitigation here:** `reinstateDevice` exists and is callable by `ATTESTER_ROLE`, so isolation isn't permanent or irreversible by design.

**Not yet handled:** there's no **graduated response** — e.g., a lower-severity flag reducing trust score and dispatch priority without full isolation, reserving automatic isolation for high-severity/high-confidence flags only, with a human-review queue for the rest. `AuditLedger.sol`'s `DeviceTrust.trustScore` already carries the continuous 0-1000 score needed for this (Layer 3 could key dispatch eligibility off a trust threshold rather than a binary isolated flag), but `logDispatchCommand`'s current gate is binary (`require(!isolated)`), not trust-score-sensitive. Changing that is a real, scoped follow-up, not a vague aspiration.

## 5. Regulatory tension: CEA's OT-isolation mandate vs. a connected ledger

**Gap:** the dossier's own research (§6) states the CEA's 2026 cybersecurity regulation requires operational technology — "the systems that directly control the grid" — to be **physically isolated from the internet and from ordinary IT networks**, effective April 2027. Atlas Flux's architecture involves devices (or their aggregator) writing to a blockchain, which implies internet connectivity somewhere in the chain. Is that a compliance conflict?

**Why it's not, if designed correctly (and why this matters to state explicitly):** the regulation's OT boundary is the real-time control system — the layer that can directly energize/de-energize equipment. In this architecture, that's the local dispatch logic deciding charge/discharge/shed in real time, which should run on isolated OT hardware at the feeder. `AuditLedger` and `ChitFund` are an **audit/reporting plane**, not the control plane: they record what happened, they don't execute control actions themselves (the actual relay switching is a separate, local, physically-isolatable system that *reports* its actions to the ledger after the fact, or via a one-way/air-gapped-with-periodic-sync data diode pattern). This distinction — OT control plane physically isolated, IT-side audit plane connected — is exactly how real compliant OT/IT architectures are built, and it's a design principle this project follows implicitly but has not, until this document, stated explicitly or diagrammed. That's a real documentation gap worth closing before any pitch to a DISCOM: the architecture doc's five-layer diagram doesn't currently show this isolation boundary.

## 6. Gas cost / scalability — now backed by measured numbers, not guesses

**Gap:** does the Merkle-batching design in Layer 4 actually solve the scale problem it claims to, or is that an assertion?

**Measured** (`npm run gas:report`, real numbers from this codebase, not estimates):
- `logAttestation`: 116,459 gas
- `logDispatchCommand`: 53,928 gas
- `anchorTelemetryBatch` (1,000-reading batch): 161,455 gas → **~161 gas per reading-equivalent**

At RDSS's sanctioned 203.3M meters, one direct on-chain attestation per meter per day would cost **~23.7 trillion gas/day** — not viable on any general-purpose chain at any plausible gas price. The batching design is the only way this scales, and now there's a number behind that claim rather than just an assertion in the README.

**Not yet handled:** even dispatch commands (which *can't* be batched the same way — they're individual real-time control decisions, not bulk telemetry) add up: roughly 2 million feeders × a handful of dispatch decisions/day × ~54k gas is still on the order of a trillion gas/day system-wide. The realistic answer — a permissioned/consortium chain or an L2 rollup with near-zero fees, which a DISCOM-operated deployment would almost certainly use rather than Ethereum mainnet — is noted but not built or benchmarked here, since standing up a real L2 testnet deployment is out of scope for this prototype (see `hardhat.config.js`'s commented `feederTestnet` entry).

## 7. Privacy of on-chain telemetry hashes

**Gap:** even though raw readings never go on-chain, the *pattern* of when batches get anchored, their record counts, and their timestamps are public. A sufficiently motivated observer correlating anchor timing against known events (e.g., a public holiday, a cricket match causing a demand spike) could potentially infer coarse household-level behavior patterns from metadata alone, even without the underlying readings.

**Not yet handled:** this is a real, unresolved gap. The standard mitigations — randomized batch-anchoring delay (don't anchor exactly on a fixed schedule), differential-privacy noise added to published record counts, or anchoring at a coarser granularity than per-feeder — aren't implemented. Flagged explicitly rather than ignored, since "we hash the data so it's private" is a common and incorrect simplification or this class of system.

## 8. Layer 0 model-poisoning robustness

**Gap:** the project's own research dossier (§7) cites a finding that FDIA/anomaly detectors can lose 9-29% of detection accuracy under data-poisoning conditions. Layer 0's classifier is trained on synthetic data in this prototype; in production it would need to retrain periodically on real feeder data, which is exactly the retraining pipeline an adversary would want to poison (e.g., slowly shifting "normal" baselines by feeding tampered readings over time, so a real attack later looks like normal drift).

**Not yet handled:** no poisoning-resistant training (robust statistics, anomaly-filtered retraining sets, or periodic retraining-set audits) is implemented. This is named as an open problem in the dossier itself, not something this prototype claims to solve — stated here so it isn't mistaken for solved.

## 9. Federated Attack Signature Mesh publisher Sybil risk

Covered in detail in `INVENTION.md`'s "Abuse resistance" section — repeated here only as an index entry: a compromised `MESH_PUBLISHER_ROLE` key can currently publish unlimited fingerprints to manufacture apparent cross-feeder corroboration. `MESH_MIN_LOCAL_SIGNAL` prevents this from flagging *clean* devices, but could still inflate confidence on genuinely uncertain ones. Open, not hidden.

## What this list is for

Not every gap above has code behind its mitigation — several are explicitly "not yet handled." The point of writing them down this way is that a reviewer (hackathon judge, DISCOM security team, or an internship interviewer) asking "what about X" should find X already named here, with an honest answer, rather than discovering it themselves and wondering what else wasn't considered.
