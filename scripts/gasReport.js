// scripts/gasReport.js
//
// Run with: npx hardhat run scripts/gasReport.js --no-compile
//
// Measures real gas costs for AuditLedger's core write operations. These
// numbers back the scalability discussion in GAP_ANALYSIS.md — the
// decision to batch telemetry via Merkle anchoring rather than logging
// every reading on-chain isn't a guess, it's justified by these figures
// against RDSS's sanctioned 203.3M smart meter rollout.

const { ethers } = require("hardhat");
const { deployAuditLedger } = require("./deploy");

async function main() {
  const [admin, attester, dispatcher, pipeline] = await ethers.getSigners();
  const ledger = await deployAuditLedger(admin);
  await (await ledger.connect(admin).grantRole(await ledger.ATTESTER_ROLE(), attester.address)).wait();
  await (await ledger.connect(admin).grantRole(await ledger.DISPATCHER_ROLE(), dispatcher.address)).wait();
  await (await ledger.connect(admin).grantRole(await ledger.PIPELINE_ROLE(), pipeline.address)).wait();

  const results = {};

  const tx1 = await ledger.connect(attester).logAttestation(ethers.id("d1"), 900, ethers.id("fw1"));
  results.logAttestation = (await tx1.wait()).gasUsed;

  const tx2 = await ledger.connect(dispatcher).logDispatchCommand(ethers.id("d1"), ethers.id("f1"), 0, 100, "test");
  results.logDispatchCommand = (await tx2.wait()).gasUsed;

  const tx3 = await ledger.connect(pipeline).anchorTelemetryBatch(ethers.id("b1"), ethers.id("root1"), 1000, 0, 3600);
  results.anchorTelemetryBatch = (await tx3.wait()).gasUsed;

  console.log("Measured gas costs (AuditLedger, Hardhat in-memory network):");
  for (const [op, gas] of Object.entries(results)) {
    console.log(`  ${op}: ${gas.toString()} gas`);
  }

  console.log("\nScale check against RDSS's 203.3M sanctioned smart meters (see dossier §16):");
  const perDeviceAttestationGasPerDay = BigInt(203_300_000) * results.logAttestation;
  console.log(
    `  If every meter logged one attestation/day directly: ${perDeviceAttestationGasPerDay.toLocaleString()} gas/day — not viable on any general-purpose chain.`
  );
  const batchSize = 1000n;
  const perReadingEquivalentGas = results.anchorTelemetryBatch / batchSize;
  console.log(
    `  Via Merkle batch anchoring (1000 readings/batch): ~${perReadingEquivalentGas.toString()} gas per reading-equivalent — this is the figure the batching design in pipeline/ingestion.js is built around.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
