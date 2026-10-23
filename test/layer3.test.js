const { expect } = require("chai");
const { ethers } = require("hardhat");
const { planDispatch, executeDispatchPlan } = require("../layer3/dispatchEngine");
const { ThermalStorageUnit, CommunityBattery } = require("../layer1/thermalStorageSim");
const chainClient = require("../pipeline/chainClient");
const chitFundClient = require("../layer1/chitFundClient");
const { deployAuditLedger } = require("../scripts/deploy");

describe("Layer 3 — dispatch planning (pure logic)", function () {
  it("charges stores when forecast shows surplus", function () {
    const thermalUnit = new ThermalStorageUnit({ capacityKWh: 28, initialChargeFraction: 0.5 });
    const battery = new CommunityBattery({ capacityKWh: 8, initialChargeFraction: 0.5 });
    const plan = planDispatch({ gapKW: -5, hours: 1, households: [], avgRelayLoadKW: 1.5, thermalUnit, battery });
    expect(plan.mode).to.equal("CHARGE");
    expect(plan.shed).to.have.lengthOf(0);
  });

  it("covers a small shortfall from thermal storage alone, no shedding", function () {
    const thermalUnit = new ThermalStorageUnit({ capacityKWh: 28, initialChargeFraction: 1.0 });
    const battery = new CommunityBattery({ capacityKWh: 8, initialChargeFraction: 1.0 });
    const plan = planDispatch({ gapKW: 3, hours: 1, households: [], avgRelayLoadKW: 1.5, thermalUnit, battery });
    expect(plan.mode).to.equal("DISCHARGE_THERMAL");
    expect(plan.shed).to.have.lengthOf(0);
  });

  it("sheds load fairly when stores can't cover the gap, and skips isolated households", function () {
    const thermalUnit = new ThermalStorageUnit({ capacityKWh: 2, initialChargeFraction: 0.1 }); // nearly empty
    const battery = new CommunityBattery({ capacityKWh: 1, initialChargeFraction: 0.1 });
    const households = [
      { humanId: "h1", relayDeviceId: "h1-relay", isolated: false, lastServedAt: 100 }, // served recently
      { humanId: "h2", relayDeviceId: "h2-relay", isolated: false, lastServedAt: 10 }, // served long ago -> protect first
      { humanId: "h3", relayDeviceId: "h3-relay", isolated: true, lastServedAt: 0 }, // isolated -> must be excluded entirely
    ];
    const plan = planDispatch({ gapKW: 1.6, hours: 1, households, avgRelayLoadKW: 1.5, thermalUnit, battery });

    expect(plan.mode).to.equal("SHED_LOAD");
    expect(plan.isolatedSkipped).to.include("h3");
    expect(plan.shed.concat(plan.protect).map((h) => h.humanId)).to.not.include("h3");
    // h2 was served longer ago -> should be protected, not shed, while h1 (served more recently) gets shed.
    expect(plan.protect.map((h) => h.humanId)).to.include("h2");
    expect(plan.shed.map((h) => h.humanId)).to.include("h1");
  });
});

describe("Layer 3 — dispatch execution (on-chain)", function () {
  let ledger, fund, admin, dispatcherSvc, attesterSvc;

  beforeEach(async function () {
    [admin, dispatcherSvc, attesterSvc] = await ethers.getSigners();
    ledger = await deployAuditLedger(admin);
    await ledger.connect(admin).grantRole(await ledger.DISPATCHER_ROLE(), dispatcherSvc.address);
    await ledger.connect(admin).grantRole(await ledger.ATTESTER_ROLE(), attesterSvc.address);

    fund = await chitFundClient.deployChitFund(admin);
    await fund.connect(admin).grantRole(await fund.FUND_ADMIN_ROLE(), admin.address);
    await fund.connect(admin).grantRole(await fund.DISPATCH_ROLE(), dispatcherSvc.address);
    await chitFundClient.joinFund(fund, admin, "h1");
    await chitFundClient.joinFund(fund, admin, "h2");
  });

  it("executing a SHED_LOAD plan logs dispatch for shed households and records service for protected ones", async function () {
    const households = [
      { humanId: "h1", relayDeviceId: "h1-relay", isolated: false, lastServedAt: 100 },
      { humanId: "h2", relayDeviceId: "h2-relay", isolated: false, lastServedAt: 10 },
    ];
    const plan = {
      mode: "SHED_LOAD",
      thermalResult: { servedKW: 1 },
      batteryResult: { servedKW: 0.5, unmetKW: 0 },
      shed: [households[0]],
      protect: [households[1]],
    };

    await executeDispatchPlan(plan, {
      ledger,
      dispatcherSigner: dispatcherSvc,
      fund,
      feederHumanId: "feeder-x",
      thermalDeviceId: "feeder-x-thermal-01",
      batteryDeviceId: "feeder-x-battery-01",
    });

    expect(await ledger.dispatchCount()).to.be.greaterThan(0);
    const h2Member = await chitFundClient.getMember(fund, "h2");
    expect(h2Member.timesServed).to.equal(1);
    const h1Member = await chitFundClient.getMember(fund, "h1");
    expect(h1Member.timesServed).to.equal(0); // shed, not served
  });

  it("dispatching to an isolated device reverts, so the trust gate holds end-to-end", async function () {
    await chainClient.logAttestation(ledger, attesterSvc, "h1-relay", 900, ethers.id("fw"));
    await chainClient.isolateDevice(ledger, attesterSvc, "h1-relay", "flagged by Layer 0");

    await expect(
      chainClient.logDispatchCommand(ledger, dispatcherSvc, "h1-relay", "feeder-x", chainClient.DispatchAction.SHED_LOAD, 1500, "test")
    ).to.be.reverted;
  });
});
