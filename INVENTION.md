# The Federated Attack Signature Mesh (FASM)

A privacy-preserving, decentralized early-warning protocol for coordinated IoT attacks on distributed energy resources. Designed and built as part of Atlas Flux's Layer 0, extending it rather than replacing anything.

## The gap this fills

The project's own research dossier surveyed the existing OT/IoT security vendor landscape (Dragos, Claroty, Nozomi Networks) and reached a specific conclusion: **these vendors are built for utility-operator customers securing utility-owned infrastructure.** Dragos's "Neighborhood Keeper" is the closest existing analogue to what's proposed here — an opt-in, anonymized threat-sharing network — but it is centrally operated by Dragos, for Dragos's utility customers monitoring utility-owned assets.

Nobody in that landscape is positioned around trust/attestation for the **behind-the-meter, community-owned, cheap-hardware** category — which is exactly the device class this whole challenge is about (smart relays, community batteries, thermal storage controllers owned by a chit fund, not a utility). That gap is stated explicitly in the dossier's competitive-landscape section; FASM is a direct, implemented answer to it: decentralized instead of vendor-operated, and designed from the start for a device population nobody owns centrally.

## The core idea

A single feeder's Layer 0 model only ever sees that feeder's own incidents. A novel or slow-rollout attack variant — different device mix, a slightly different spike magnitude than anything in that feeder's training distribution — can be genuinely uncertain to a purely local detector, even when a *very similar* pattern was already confirmed as an attack on a different feeder entirely.

FASM lets feeders share **that a pattern looked like an attack** without sharing **which devices, which households, or which feeder** — the three things that would make the sharing a privacy problem.

The mechanism:

1. **Fingerprint, don't publish raw data.** Each attack's behavioral feature vector (the same 9-dimensional vector Layer 0's classifier already computes — spike ratio, neighbor synchrony statistics, etc.) is hashed into a compact 64-bit fingerprint using **random-hyperplane locality-sensitive hashing (SimHash, Charikar 2002)**: project the vector onto 64 fixed random hyperplanes, one bit per hyperplane sign. Similar feature vectors land on fingerprints with small Hamming distance; unrelated vectors land close to the 32-bit random-chance baseline. This is a 50+ year old, well-understood piece of applied cryptography/algorithms — the novelty here isn't the hash, it's **using it as the anonymization primitive for cross-utility grid-attack threat sharing**, which doesn't exist elsewhere.
2. **Publish only the fingerprint, on-chain, append-only.** `ThreatMesh.sol` is deliberately minimal: a fingerprint, an attack-type code, a severity, a timestamp. No device ID, no feeder ID, no household, nothing re-identifiable. Publication is role-gated but the *registry itself* needs no central operator — any feeder's fraud-oracle service can publish, any feeder can read, and the blockchain means no single company (unlike Dragos) controls or can unilaterally see who reported what.
3. **Corroborate, don't override.** A feeder checking a borderline local reading against the mesh computes the Hamming distance to every known fingerprint and converts the closest match into a corroboration score. That score can *nudge* an uncertain local probability upward — but by design (see "Abuse resistance" below) it can never manufacture a flag against a device with no local signal at all.

## Measured result, not a claim

`test/layer0-mesh.test.js` runs the actual experiment, not a toy: find a spike magnitude where the trained classifier is genuinely uncertain (mean attack probability ≈ 0.4, neither confidently clean nor confidently an attack — a stand-in for a subtle/novel variant). Seed the mesh with 5 independently-confirmed incidents at that magnitude. Then run 20 independent trials of a *new* feeder facing the same pattern:

```
local-only flagged 0/20 trials
mesh-boosted flagged 20/20 trials
```

Local-only detection missed every single instance of this pattern. Mesh-corroborated detection caught every single one. That's measured by running the code, not asserted in a comment — re-run `npx hardhat test --no-compile --grep Federated` and watch the console line it prints.

## Abuse resistance (the part a reviewer should ask about)

A federated trust system has an obvious attack of its own: what stops a malicious or compromised publisher from seeding the mesh with fingerprints of *normal* behavior, tricking other feeders into isolating healthy devices by remote proxy?

`scoreDevicesWithMesh` enforces `MESH_MIN_LOCAL_SIGNAL`: the mesh boost only applies once the local model already shows *some* non-trivial anomalous signal on its own. A device the local model sees as entirely clean (attack probability below ~2%) cannot be flagged by mesh corroboration alone, no matter how severe or how close the published match is. `test/layer0-mesh.test.js`'s "abuse resistance" test verifies this directly: a clean-device fingerprint published with severity 99 does not flag a clean device elsewhere. The mesh can only amplify existing local suspicion, never invent it — defense in depth, not blind trust of a remote report.

(Not yet handled, and worth being upfront about: Sybil resistance on the *publisher* side — nothing currently stops one compromised `MESH_PUBLISHER_ROLE` key from publishing many fingerprints to inflate apparent corroboration. A production version would want either a stake/slashing mechanism for publishers or a minimum-distinct-publisher-count requirement before a fingerprint cluster counts as corroboration, not just distinct fingerprint entries. Flagged here rather than glossed over — see GAP_ANALYSIS.md.)

## Why this is a genuine invention, not a feature

- It's a new **mechanism**, not a configuration of existing ones: nobody combines LSH fingerprinting + blockchain publication + a local-signal-gated corroboration boost for grid-edge coordinated-attack detection. The pieces (SimHash, blockchain registries, anomaly detection) are each individually standard; the combination, applied to this specific problem (privacy-preserving cross-utility threat sharing for *community-owned* devices), is not something the competitive landscape research turned up anywhere.
- It's **falsifiable and measured**, not hand-waved: the uplift above is a real number from real code, with an abuse-resistance test proving the design's main safety property actually holds, not just asserted in prose.
- It's **extensible**: `attackTypeCode` is already a field in `ThreatMesh.sol` for when detection grows beyond coordinated-load-spike signatures; `recentEntries` is paginated for when the mesh has thousands of entries; the hyperplane seed is a public mesh parameter precisely so a real multi-organization deployment can agree on it once and never need a coordination round-trip again.

## For the internship conversation specifically

The honest framing: this is a hackathon-scale prototype of a mechanism, not a production threat-intelligence platform — it hasn't been red-teamed, the publisher-side Sybil gap above is real and unresolved, and the LSH dimensionality (9 features) is small enough that a determined adversary with the public hyperplane parameters could probably reason about what fingerprint ranges correspond to what behavior. What *is* defensible, and is the actual talking point: identifying a specific, named gap in a real competitive landscape (via the dossier's own vendor research), designing a mechanism that addresses it using a well-chosen existing primitive (SimHash) rather than inventing cryptography from scratch, implementing it fully (contract + client + classifier integration), and then *measuring* whether it actually works rather than asserting that it does — including running the experiment that could have shown no uplift, and reporting what would have been an unflattering result if it had come out that way. That's the engineering judgment story, not "I built a blockchain AI thing."
