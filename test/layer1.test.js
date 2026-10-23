const { expect } = require("chai");
const { ethers } = require("hardhat");
const chitFundClient = require("../layer1/chitFundClient");
const { ThermalStorageUnit, CommunityBattery } = require("../layer1/thermalStorageSim");

describe("Layer 1 — ChitFund ownership contract", function () {
  let fund, admin, dispatcher, h1, h2, h3;

  beforeEach(async function () {
    [admin, dispatcher, h1, h2, h3] = await ethers.getSigners();
    fund = await chitFundClient.deployChitFund(admin);
    await fund.connect(admin).grantRole(await fund.FUND_ADMIN_ROLE(), admin.address);
    await fund.connect(admin).grantRole(await fund.DISPATCH_ROLE(), dispatcher.address);

    for (const h of ["household-1", "household-2", "household-3"]) {
      await chitFundClient.joinFund(fund, admin, h);
    }
  });

  it("tracks contributions per household", async function () {
    await chitFundClient.contribute(fund, h1, "household-1", ethers.parseEther("0.01"));
    const m = await chitFundClient.getMember(fund, "household-1");
    expect(m.totalContributedWei).to.equal(ethers.parseEther("0.01"));
    expect(await fund.fundBalance()).to.equal(ethers.parseEther("0.01"));
  });

  it("rotation picks the household that has gone longest without being served", async function () {
    // Nobody served yet -> all tied at lastServedAt=0; the contract picks
    // the first candidate in that case (stable default), which is fine -
    // what matters is what happens once some have been served.
    await chitFundClient.recordServed(fund, dispatcher, "household-1");
    await chitFundClient.recordServed(fund, dispatcher, "household-2");
    // household-3 has never been served -> should win rotation next.
    const winner = await chitFundClient.nextInRotation(fund, ["household-1", "household-2", "household-3"]);
    expect(winner).to.equal("household-3");
  });

  it("rotation cycles fairly across repeated rounds (no household served twice before others once)", async function () {
    const households = ["household-1", "household-2", "household-3"];
    const servedCount = { "household-1": 0, "household-2": 0, "household-3": 0 };

    for (let round = 0; round < 6; round++) {
      const winner = await chitFundClient.nextInRotation(fund, households);
      await chitFundClient.recordServed(fund, dispatcher, winner);
      servedCount[winner] += 1;
    }

    // 6 rounds across 3 households -> each should be served exactly twice.
    for (const h of households) {
      expect(servedCount[h]).to.equal(2);
    }
  });

  it("disburses pooled funds to a vendor address and rejects over-spending", async function () {
    await chitFundClient.contribute(fund, h1, "household-1", ethers.parseEther("0.02"));
    await chitFundClient.contribute(fund, h2, "household-2", ethers.parseEther("0.02"));

    await expect(fund.connect(admin).disburse(h3.address, ethers.parseEther("0.03"), "thermal storage unit purchase")).to.emit(
      fund,
      "FundsDisbursed"
    );

    await expect(
      fund.connect(admin).disburse(h3.address, ethers.parseEther("1"), "over-spend attempt")
    ).to.be.revertedWith("ChitFund: insufficient fund balance");
  });
});

describe("Layer 1 — thermal storage simulation", function () {
  it("charges up to capacity and no further", function () {
    const unit = new ThermalStorageUnit({ capacityKWh: 28, initialChargeFraction: 0.9, chargeEfficiency: 1.0 });
    unit.charge(50, 2); // way more than headroom allows
    const state = unit.getState();
    expect(state.stateOfChargeKWh).to.be.at.most(28);
    expect(state.stateOfChargeFraction).to.equal(1);
  });

  it("discharges to cover demand until depleted, then reports unmet load", function () {
    const unit = new ThermalStorageUnit({ capacityKWh: 10, initialChargeFraction: 1.0, dischargeEfficiency: 1.0 });
    const result = unit.discharge(15, 1); // demand exceeds what's stored
    expect(result.fullyCovered).to.equal(false);
    expect(result.servedKW).to.be.closeTo(10, 0.01);
    expect(result.unmetKW).to.be.closeTo(5, 0.01);
    expect(unit.getState().stateOfChargeKWh).to.be.closeTo(0, 0.01);
  });

  it("community battery reserves capacity for critical loads independent of the thermal unit", function () {
    const battery = new CommunityBattery({ capacityKWh: 8, initialChargeFraction: 0.5 });
    const result = battery.discharge(2, 1);
    expect(result.servedKW).to.equal(2);
    expect(battery.getState().stateOfChargeKWh).to.be.closeTo(2, 0.01);
  });
});
