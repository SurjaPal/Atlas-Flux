const { ethers } = require("hardhat");

async function deployAuditLedger(adminSigner) {
  const AuditLedger = await ethers.getContractFactory("AuditLedger");
  const ledger = await AuditLedger.deploy(adminSigner.address);
  await ledger.waitForDeployment();
  return ledger;
}

async function main() {
  const [admin] = await ethers.getSigners();
  const ledger = await deployAuditLedger(admin);
  console.log("AuditLedger deployed to:", await ledger.getAddress());
  console.log("Admin:", admin.address);
  console.log(
    "\nGrant roles with ledger.grantRole(<ROLE>, <address>) before Layer 0 / Layer 3 / pipeline services call it — see README."
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { deployAuditLedger };
