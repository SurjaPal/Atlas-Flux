# Contributing to Atlas Flux

Thanks for looking under the hood. This project was built for the Yuva Yodha
Energy Tech Hackathon 2026, but the bar for contributions is the same as for a
production system: **nothing faked, nothing quietly simplified.** Every claim
in the README is backed by measured output from code in this repo, and that
property is worth more than any single feature.

## Ground rules

1. **Measured, not claimed.** If a change makes a performance, accuracy, gas,
   or security claim, it must ship with a test, a script, or a benchmark that
   produces the number. "Should be faster" is not a claim this repo makes.
2. **Honest about gaps.** If you know a simplification exists, say so — in a
   code comment where it lives, and in `GAP_ANALYSIS.md` if it's architectural.
   The project has a documented tradition of naming its own weaknesses
   (see `GAP_ANALYSIS.md` and `INVENTION.md`); keep that tradition.
3. **Baseline comparisons survive.** Layer 0 always reports the logistic
   regression baseline alongside the MLP; Layer 2 always benchmarks against
   naive baselines. A PR that removes a baseline comparison to make a model
   look better will be rejected, even if the model genuinely is better.
4. **Contracts stay minimal and auditable.** `contracts/` is deliberately
   small. New state variables or roles need a paragraph in the PR explaining
   why the existing surface can't express the requirement.

## Development setup

```bash
nvm use                  # Node 22 (see .nvmrc)
npm ci                   # reproducible install from package-lock.json
npm run compile:offline  # works even where binaries.soliditylang.org is blocked
npm test                 # 47 tests across all layers + the mesh
npm run lint             # ESLint
npm run format:check     # Prettier
npm run coverage         # nyc instrumented test run
```

`npm run compile` / plain `npm test` work on machines with open internet; the
`:offline` variants use the bundled `solc` npm package instead of Hardhat's
compiler downloader.

## Before opening a PR

- [ ] `npm test` passes (all 47 tests).
- [ ] `npm run lint` and `npm run format:check` pass.
- [ ] New behavior has a test; changed measured numbers (precision/recall,
      MAE, gas) are regenerated with the checked-in scripts, not edited by hand.
- [ ] If you touched the demo output, regenerate it: `npm run demo:full:offline`
      then `npm run dashboard:build`.
- [ ] If you found a new gap, add it to `GAP_ANALYSIS.md` — even if the answer
      is "not yet handled."

## Where things live

See the README's project-layout section — it's kept accurate on purpose.
