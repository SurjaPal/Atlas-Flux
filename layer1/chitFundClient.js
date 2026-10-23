// layer1/chitFundClient.js
//
// Integration surface for the ChitFund contract, in the same style as
// pipeline/chainClient.js — Layer 3's dispatch engine calls these
// functions rather than touching ethers.js / the ABI directly.

const { ethers } = require("hardhat");

function householdId(humanId) {
  return ethers.id(humanId);
}

async function deployChitFund(adminSigner) {
  const ChitFund = await ethers.getContractFactory("ChitFund");
  const fund = await ChitFund.deploy(adminSigner.address);
  await fund.waitForDeployment();
  return fund;
}

async function joinFund(fund, adminSigner, humanHouseholdId) {
  const tx = await fund.connect(adminSigner).joinFund(householdId(humanHouseholdId));
  return tx.wait();
}

async function contribute(fund, memberSigner, humanHouseholdId, amountWei) {
  const tx = await fund.connect(memberSigner).contribute(householdId(humanHouseholdId), { value: amountWei });
  return tx.wait();
}

async function recordServed(fund, dispatchSigner, humanHouseholdId) {
  const tx = await fund.connect(dispatchSigner).recordServed(householdId(humanHouseholdId));
  return tx.wait();
}

async function nextInRotation(fund, humanHouseholdIds) {
  const ids = humanHouseholdIds.map(householdId);
  const winner = await fund.nextInRotation(ids);
  const idx = ids.indexOf(winner);
  return humanHouseholdIds[idx];
}

async function getMember(fund, humanHouseholdId) {
  const m = await fund.members(householdId(humanHouseholdId));
  return {
    exists: m.exists,
    totalContributedWei: m.totalContributedWei,
    joinedAt: Number(m.joinedAt),
    lastServedAt: Number(m.lastServedAt),
    timesServed: Number(m.timesServed),
  };
}

module.exports = { householdId, deployChitFund, joinFund, contribute, recordServed, nextInRotation, getMember };
