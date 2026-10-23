# Atlas Flux — full prototype (Layers 0–5) + Federated Attack Signature Mesh

Yuva Yodha Energy Tech Hackathon 2026 · Challenge 03: Grid Reliability & Renewable Intermittency
Built by **Surja Pal**, covering the whole five-layer architecture end to end, plus an original cross-feeder threat-intelligence mechanism (see `INVENTION.md`).

This is a working system, not a diagram: real Solidity contracts, a hyperparameter-tuned neural network with measured precision/recall against a logistic-regression baseline, a forecasting engine benchmarked against naive baselines, a novel privacy-preserving detection-sharing protocol with a measured uplift, and a full-day integrated demo across all five layers — **47 automated tests**. Where something is a deliberate simplification rather than the "real" version, it's called out explicitly, in the code and in `GAP_ANALYSIS.md` — nothing is quietly faked, and nothing is left as an unexamined loophole.

**Start here if you only read three files:** this README for orientation, `INVENTION.md` for the novel contribution, `GAP_ANALYSIS.md` for what's genuinely solved vs. still open.

## The five layers, and where each one lives

| Layer | Responsibility (per the architecture doc) | Where it lives |
|---|---|---|
| **0 — Trust & Attestation** | Device attestation, graph-based coordinated-anomaly detection, hyperparameter-tuned cost-sensitive classification, trust scores, **+ the Federated Attack Signature Mesh** | `layer0/` |
| **1 — Chit-Fund + Thermal Storage** | Pooled community ownership, fairness rotation, thermal/battery physical state | `contracts/ChitFund.sol`, `layer1/` |
| **2 — Forecasting Engine** | Renewable supply/demand gap prediction, feeder-level risk scoring | `layer2/` |
| **3 — Dispatch & Fairness** | Charge/discharge/shed decisions, trust-gated, fairness-rotated | `layer3/` |
| **4 — Blockchain Audit Ledger** | Immutable attestation/dispatch/fraud log, Merkle-anchored telemetry | `contracts/AuditLedger.sol`, `pipeline/` |
| **5 — Dashboards** | DISCOM + household views | `layer5/` |

`runFullDemo.js` runs all five together across a simulated day on one feeder, including a mid-day coordinated attack, and writes the snapshot `layer5/dashboard.html` renders.

## Quick start

```bash
npm install
npm run compile            # or compile:offline — see network note below
npm test                   # 47 tests across all 5 layers + the mesh
npm run train:layer0       # tunes + trains the classifier (MLP vs logistic regression, honest comparison), writes layer0/model.json
npm run backtest:layer2    # forecasting engine vs. naive baselines
npm run gas:report         # real measured gas costs, backs the scalability analysis in GAP_ANALYSIS.md
npm run demo:full          # the whole system, one simulated day, attack included
npm run dashboard:build    # turns the demo snapshot into layer5/dashboard.html — then just open it
npx hardhat test --no-compile --grep Federated   # the mesh's cross-feeder uplift demo, with console output
```

**Network note:** this was built in a sandbox that blocks `binaries.soliditylang.org`, which Hardhat's own compiler downloader needs. If `npm run compile` fails for the same reason on your machine, use `npm run compile:offline` (compiles via the bundled `solc` npm package, no download) and append `:offline` to `test` / `demo` / `demo:full` as well. On a normal machine with open internet access, the plain commands work fine.

`layer0/model.json`, `layer5/data/demo-output.json`, and `layer5/dashboard.html` are committed pre-built, so `npm test` and opening the dashboard work immediately without training or running the demo first.

## Layer 0 — Trust & Attestation (`layer0/`)

### The classifier: real hyperparameter tuning, honestly compared

`layer0/neuralNet.js` is a from-scratch MLP — forward pass, backprop, mini-batch SGD with momentum, He initialization, L2 regularization — verified against a problem (XOR) logistic regression structurally cannot solve, so the backprop implementation is provably correct, not just plausible-looking.

`layer0/hyperparamSearch.js` runs **random search + 5-fold cross-validation** (20 trials by default) over hidden-layer sizes, learning rate, L2, positive-class weight, epochs, and batch size. Random search over grid search is a deliberate choice, citing Bergstra & Bengio (2012): with several hyperparameters of uneven importance, random search finds comparably good configurations in far fewer trials. Selection metric is F1 **subject to a recall floor** (0.95) — a missed attack is worse than a false alarm, so a high-precision/low-recall config is disqualified outright, not just penalized.

`layer0/train.js` trains both the tuned MLP and the original cost-sensitive logistic-regression baseline on the same split and **reports both**, saving whichever wins on held-out test data (by F1, recall-floor-gated) — current run: **MLP wins, precision 0.986 vs. 0.965, both at recall 1.0** (see `layer0/model_comparison.json` for the full numbers and chosen hyperparameters). This is reported as a real comparison, not a foregone conclusion — if logistic regression had won, that would be reported too, and is explicitly handled as a legitimate outcome in `train.js`'s logic, not treated as a failure.

### The graph features (unchanged from the original build, still the foundation)

`graphUtils.js` builds the feeder's device graph and computes 1-hop neighbor mean aggregation — the core operation GraphSAGE's mean aggregator performs. `dataset.js` generates labeled synthetic data across three scenario types (normal, genuine MadIoT-style attack, and a deliberate **hard negative** — coincidental multi-device spikes that are *not* an attack but look superficially similar), specifically so the classifier can't cheat by learning "multiple devices spiking = attack." Two real bugs were found and fixed during development — comparing raw wattage instead of each device's own spike ratio, and diluting the synchrony signal with idle neighbors — both documented with comments in the code where they were fixed.

### The Federated Attack Signature Mesh (the invention — full writeup in `INVENTION.md`)

`layer0/simhash.js` + `layer0/threatMesh.js` + `contracts/ThreatMesh.sol` let feeders share "a pattern like this looked like an attack elsewhere" without ever sharing device IDs, feeder identity, or raw telemetry — via locality-sensitive hashing (SimHash) fingerprints anchored on an append-only, decentralized on-chain registry. `scoreDevicesWithMesh` in `trustEngine.js` lets a close match to a previously-confirmed incident nudge an uncertain local probability upward, gated so it can **never** flag a device with no local signal at all (an explicit abuse-resistance property, tested directly).

**Measured, not claimed:** `npx hardhat test --no-compile --grep Federated` runs 20 independent trials of a genuinely uncertain attack pattern (mean local attack probability ≈ 0.4 — not confidently clean, not confidently an attack) against a mesh seeded with 5 confirmed incidents of the same pattern:

```
local-only flagged 0/20 trials
mesh-boosted flagged 20/20 trials
```

Why this exists: the project's own research dossier surveyed the OT/IoT security vendor landscape (Dragos, Claroty, Nozomi) and found none of them positioned around trust for *behind-the-meter, community-owned* devices — only utility-owned infrastructure. The closest analogue, Dragos's "Neighborhood Keeper," is centrally operated by Dragos. FASM is decentralized by construction. See `INVENTION.md` for the full novelty argument, the abuse-resistance design, and an honest section on what a production version would still need (publisher-side Sybil resistance isn't solved yet — named directly, not hidden).

## Layer 1 — Chit-Fund + Thermal Storage (`contracts/ChitFund.sol`, `layer1/`)

`ChitFund.sol`: households join, contribute (real `msg.value`), and the contract tracks a **fairness rotation ledger** — `nextInRotation` returns whichever candidate has gone longest without being prioritized. Tested over repeated rounds (3 households, 6 rounds, each served exactly twice), not just a single call. `thermalStorageSim.js`'s 28 kWh default capacity is the dossier's real-world Promethean Power PCM figure from Indian dairy cold-chain deployments, not an arbitrary number.

## Layer 2 — Forecasting Engine (`layer2/`)

Two forecasts, each explicitly benchmarked against a naive baseline. **Solar**: weather-informed vs. climatology — **~65-74% lower MAE**, stable across repeated runs. **Load**: seasonal-profile-plus-residual-correction vs. pure seasonal — **~34-42% lower MAE**, after a real fix during development (the first synthetic load model had no day-level systematic bias for the correction to exploit, so it measured *negative* improvement — correctly, since there was nothing to correct; fixed by adding a realistic day-level demand factor before claiming the improvement). `computeGapRisk` scores risk from **cumulative energy deficit against buffer capacity**, not instantaneous gap.

## Layer 3 — Dispatch & Fairness (`layer3/`)

`planDispatch`: surplus → charge; small shortfall → discharge thermal then battery; shortfall exceeding both → **shed load**, chosen via Layer 1's rotation, after first excluding any isolated household entirely — Layer 0's trust gate applies before fairness is even considered. Verified both as pure logic and as on-chain execution, including that a dispatch attempt to an isolated device actually reverts end-to-end.

## Layer 4 — Blockchain Audit Ledger (`contracts/AuditLedger.sol`, `pipeline/`)

Immutable attestation/dispatch/fraud log, role-gated via OpenZeppelin `AccessControl`, bulk telemetry kept off-chain with only Merkle roots anchored. **Gas costs are now measured, not asserted** (`npm run gas:report`): `logAttestation` 116,459 gas, `anchorTelemetryBatch` (1,000 readings) 161,455 gas — ~161 gas per reading-equivalent via batching vs. a projected 23.7 trillion gas/day if every one of RDSS's 203.3M sanctioned meters logged directly. The batching design is now backed by a number, not just a claim.

## Layer 5 — Dashboard (`layer5/`)

A functional wireframe, per the team's own scope decision. `dashboard.template.html` + `buildDashboard.js` inline the demo snapshot directly into a self-contained HTML file. DISCOM view: summary stats, hourly risk/dispatch timeline, device trust table. Household view: fairness rotation queue, contribution history, per-household shed counts.

**Note on the shipped demo run:** the chosen hours (6, 10, 18, 19, 22) mean the attack lands right after an already-heavy evening ramp that has just drained both stores, and by hour 22 (nighttime, no more solar) every household ends up shed. This is the forecasting/storage-adequacy math playing out honestly — a real illustration of why the challenge exists, not a bug.

## `INVENTION.md` and `GAP_ANALYSIS.md`

Two documents written specifically to not leave anything implicit:

- **`INVENTION.md`** — the Federated Attack Signature Mesh in full: the gap it fills (with a direct citation to the dossier's own competitive-landscape research), the mechanism, the measured uplift, the abuse-resistance design and its tested proof, and an honest section on what's still unsolved for a production version.
- **`GAP_ANALYSIS.md`** — nine categories of "what could go wrong," each with a mitigation that exists in code today, or an explicit "not yet handled, here's the specific next step" rather than silence: oracle key compromise, chit-fund Sybil risk, weather-input manipulation, the lack of an isolation appeal path, the regulatory relationship between this architecture and CEA's OT-isolation mandate, gas/scalability (with real measured numbers), on-chain telemetry metadata privacy, Layer 0 poisoning robustness, and the mesh's own publisher Sybil gap.

## Project layout

```
contracts/AuditLedger.sol        Layer 4 contract
contracts/ChitFund.sol           Layer 1 contract
contracts/ThreatMesh.sol         The invention: federated fingerprint registry
layer0/                          Trust engine: graph features, MLP + logreg, hyperparameter search, model.json, simhash + mesh client
layer1/                          ChitFund client, thermal/battery simulation
layer2/                          Weather/load models, forecasting engine, backtest
layer3/                          Dispatch planning + execution
layer5/                          Dashboard template, build script, demo snapshot
pipeline/                        Device simulator, chain client, ingestion (Merkle anchoring), rule-based fraud detector (legacy demo), Layer-4-only demo
runFullDemo.js                   Integrated Layers 0–5 demo across one simulated day
scripts/deploy.js, compile.js, gasReport.js   Deployment helper, offline-compile fallback, gas measurement
test/                            47 tests across all layers + the mesh
INVENTION.md                     The novel contribution, in full
GAP_ANALYSIS.md                  Systematic gap/loophole review
```

## What's built vs. what's still a stand-in

**Built, tested, and measured:** all five layers plus the mesh have working code. The Layer 0 classifier's precision/recall is measured and hyperparameter-tuned via real cross-validation, not hand-picked. The Layer 2 forecasts' improvement over naive baselines is measured. The Layer 1 fairness rotation is tested over repeated rounds. The Layer 3 → Layer 4 trust gate is verified end-to-end. The mesh's cross-feeder uplift is measured over 20 independent trials, and its main safety property (can't flag a clean device) is directly tested.

**Still simplifications, documented where they matter — full list in `GAP_ANALYSIS.md`:**
- Layer 0's graph features are hand-crafted, not a trained GraphSAGE embedding (the MLP learns the classifier on top of hand-crafted features, not the embedding itself).
- Layer 2's weather/load models are physically-shaped synthetic data, not real historical feeder data.
- No testnet deployment yet.
- No multisig on `ATTESTER_ROLE`; no household-identity binding in `ChitFund`; no publisher-side Sybil resistance in the mesh — each named explicitly in `GAP_ANALYSIS.md` with the specific next step, not glossed over.
