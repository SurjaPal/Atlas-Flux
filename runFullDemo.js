// runFullDemo.js
//
// The whole system, end to end, across a simulated day on one feeder:
//   Layer 2 forecasts the supply/demand gap for a handful of hours.
//   Layer 3 decides charge/discharge/shed for each hour, consulting
//     Layer 0's trust scores (who's eligible to dispatch) and Layer 1's
//     chit-fund rotation (who gets protected vs. shed, fairly).
//   Layer 4 logs every attestation, dispatch, and fraud flag immutably,
//     and anchors telemetry batches via the ingestion pipeline.
//   Partway through the day, a MadIoT-style coordinated attack hits 3
//     relays; Layer 0 catches it, isolates them on-chain, and Layer 3's
//     next dispatch round correctly excludes them from the fairness
//     rotation — the trust gate holding across the whole stack, not just
//     in isolation.
//
// Writes layer5/data/demo-output.json for the dashboard to render.
//
// Run with: npx hardhat run runFullDemo.js --no-compile

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const { deployAuditLedger } = require("./scripts/deploy");
const chainClient = require("./pipeline/chainClient");
const ingestion = require("./pipeline/ingestion");
const { makeFeederDevices, simulateNormalWindow, simulateCoordinatedAttackWindow } = require("./pipeline/deviceSimulator");

const chitFundClient = require("./layer1/chitFundClient");
const { ThermalStorageUnit, CommunityBattery } = require("./layer1/thermalStorageSim");

const { loadModel, scoreDevices } = require("./layer0/trustEngine");

const { generateCloudCoverSeries, generateSolarSeries, forecastCloudCover } = require("./layer2/weatherModel");
const { generateLoadSeries } = require("./layer2/loadModel");
const { weatherInformedSolarForecast, residualCorrectedLoadForecast, computeGapRisk } = require("./layer2/forecastEngine");

const { planDispatch, executeDispatchPlan } = require("./layer3/dispatchEngine");

const FEEDER_ID = "feeder-12-baner";
const DAY_START = Math.floor(new Date("2026-09-22T00:00:00Z").getTime() / 1000);
const SOLAR_CAPACITY_KW = 25;
const PEAK_LOAD_KW = 20;

function line() {
  console.log("-".repeat(78));
}

async function main() {
  const [admin, attesterSvc, dispatcherSvc, fraudSvc, pipelineSvc] = await ethers.getSigners();

  line();
  console.log("Atlas Flux — full-system demo (Layers 0-5) on one feeder, one simulated day");
  line();

  // ---------------------------------------------------------------
  // Setup: contracts, roles, devices, chit fund membership
  // ---------------------------------------------------------------
  const ledger = await deployAuditLedger(admin);
  await (await ledger.connect(admin).grantRole(await ledger.ATTESTER_ROLE(), attesterSvc.address)).wait();
  await (await ledger.connect(admin).grantRole(await ledger.DISPATCHER_ROLE(), dispatcherSvc.address)).wait();
  await (await ledger.connect(admin).grantRole(await ledger.FRAUD_ORACLE_ROLE(), fraudSvc.address)).wait();
  await (await ledger.connect(admin).grantRole(await ledger.PIPELINE_ROLE(), pipelineSvc.address)).wait();

  const fund = await chitFundClient.deployChitFund(admin);
  await (await fund.connect(admin).grantRole(await fund.FUND_ADMIN_ROLE(), admin.address)).wait();
  await (await fund.connect(admin).grantRole(await fund.DISPATCH_ROLE(), dispatcherSvc.address)).wait();

  const devices = makeFeederDevices(FEEDER_ID, 6);
  const baselineByDevice = Object.fromEntries(devices.map((d) => [d.humanId, d.baselineWatts]));
  const householdIds = [1, 2, 3, 4, 5, 6].map((h) => `${FEEDER_ID}-household-${h}`);
  for (const h of householdIds) {
    await chitFundClient.joinFund(fund, admin, h);
    await chitFundClient.contribute(fund, admin, h, ethers.parseEther("0.005"));
  }
  console.log(`Feeder ${FEEDER_ID}: ${devices.length} devices, ${householdIds.length} chit-fund households.\n`);

  const layer0Model = loadModel();
  const thermalUnit = new ThermalStorageUnit({ capacityKWh: 28, initialChargeFraction: 0.6 });
  const battery = new CommunityBattery({ capacityKWh: 8, initialChargeFraction: 0.6 });

  // ---------------------------------------------------------------
  // Generate one synthetic day of actual weather + load
  // ---------------------------------------------------------------
  const stepsPerDay = 24; // 1-hour resolution for this demo
  const intervalSeconds = 3600;
  const cloudSeries = generateCloudCoverSeries(DAY_START, stepsPerDay, intervalSeconds);
  const solarActual = generateSolarSeries(DAY_START, stepsPerDay, intervalSeconds, SOLAR_CAPACITY_KW, cloudSeries);
  const loadActual = generateLoadSeries(DAY_START, stepsPerDay, intervalSeconds, PEAK_LOAD_KW, { dayFactor: 1.1 });

  // ---------------------------------------------------------------
  // Baseline attestation (Layer 0) on normal telemetry before the day starts
  // ---------------------------------------------------------------
  const baselineReadings = simulateNormalWindow(devices, DAY_START - 600, 300, 60);
  const relayScores = scoreDevices(baselineReadings, devices, baselineByDevice, layer0Model);
  const trustByDevice = new Map();
  for (const s of relayScores) {
    trustByDevice.set(s.deviceHumanId, s.trustScore);
    await chainClient.logAttestation(ledger, attesterSvc, s.deviceHumanId, s.trustScore, ethers.id(`${s.deviceHumanId}-fw-v1`));
  }
  for (const d of devices) {
    if (!trustByDevice.has(d.humanId)) {
      // Meters / thermal / battery aren't in the MadIoT-targeted class
      // Layer 0 models here (see layer0/graphUtils.js) — attest with a
      // fixed high-confidence score rather than silently skipping them.
      trustByDevice.set(d.humanId, 950);
      await chainClient.logAttestation(ledger, attesterSvc, d.humanId, 950, ethers.id(`${d.humanId}-fw-v1`));
    }
  }
  await ingestion.anchorBatch(ledger, pipelineSvc, "batch-baseline", baselineReadings);
  console.log(`Baseline attestation complete: ${await ledger.attestationCount()} devices attested.\n`);

  const isolated = new Set();
  const rounds = [];

  // ---------------------------------------------------------------
  // Dispatch rounds across the day
  // ---------------------------------------------------------------
  const roundHours = [6, 10, 18, 19, 22]; // early morning, midday, evening ramp, attack hour, late evening
  const relayHouseholds = householdIds.map((h, i) => ({
    humanId: h,
    relayDeviceId: `${FEEDER_ID}-relay-${i + 1}`,
  }));

  for (const hour of roundHours) {
    line();
    console.log(`Hour ${String(hour).padStart(2, "0")}:00`);
    line();

    if (hour === 19) {
      // --- Attack window: 3 relays get hijacked into a synchronized spike ---
      const compromised = [relayHouseholds[0].relayDeviceId, relayHouseholds[1].relayDeviceId, relayHouseholds[2].relayDeviceId];
      const attackStart = DAY_START + hour * intervalSeconds;
      const attackReadings = simulateCoordinatedAttackWindow(devices, compromised, attackStart, 300, 60);
      const scores = scoreDevices(attackReadings, devices, baselineByDevice, layer0Model);
      const flagged = scores.filter((s) => s.flagged);

      console.log(`Coordinated attack simulated on: ${compromised.join(", ")}`);
      console.log(`Layer 0 flagged: ${flagged.map((f) => f.deviceHumanId).join(", ") || "(none)"}`);

      for (const f of flagged) {
        await chainClient.flagFraud(ledger, fraudSvc, f.deviceHumanId, chainClient.FraudType.COORDINATED_ANOMALY, f.severity, f.evidenceHash, f.reason);
        await chainClient.isolateDevice(ledger, attesterSvc, f.deviceHumanId, "coordinated-anomaly, auto-isolated");
        isolated.add(f.deviceHumanId);
      }
      await ingestion.anchorBatch(ledger, pipelineSvc, "batch-attack-19h", attackReadings);
      console.log(`Isolated on-chain: ${[...isolated].join(", ")}\n`);
    }

    // --- Forecast this hour (Layer 2) ---
    const idx = hour;
    const cloudForecast = forecastCloudCover([cloudSeries[idx]], 2);
    const solarForecast = weatherInformedSolarForecast(DAY_START + idx * intervalSeconds, 1, intervalSeconds, SOLAR_CAPACITY_KW, cloudForecast);
    const recentActualLoad = loadActual.slice(Math.max(0, idx - 3), idx);
    const loadForecast = residualCorrectedLoadForecast(DAY_START + idx * intervalSeconds, 1, intervalSeconds, PEAK_LOAD_KW, recentActualLoad);

    const gapKW = loadForecast[0].forecastKW - solarForecast[0].forecastKW;
    const bufferKWh = thermalUnit.getState().stateOfChargeKWh + battery.getState().stateOfChargeKWh;
    const [risk] = computeGapRisk(loadForecast, solarForecast, intervalSeconds, Math.max(1, bufferKWh));

    console.log(`Forecast: demand ${loadForecast[0].forecastKW.toFixed(1)}kW, solar ${solarForecast[0].forecastKW.toFixed(1)}kW, gap ${gapKW.toFixed(1)}kW, risk ${risk.riskScore}/100`);

    // --- Dispatch (Layer 3), consulting Layer 0 trust + Layer 1 rotation ---
    const householdsForDispatch = [];
    for (const h of relayHouseholds) {
      const member = await chitFundClient.getMember(fund, h.humanId);
      householdsForDispatch.push({
        humanId: h.humanId,
        relayDeviceId: h.relayDeviceId,
        isolated: isolated.has(h.relayDeviceId),
        lastServedAt: member.lastServedAt,
      });
    }

    const plan = planDispatch({
      gapKW,
      hours: 1,
      households: householdsForDispatch,
      avgRelayLoadKW: 1.5,
      thermalUnit,
      battery,
    });

    await executeDispatchPlan(plan, {
      ledger,
      dispatcherSigner: dispatcherSvc,
      fund,
      feederHumanId: FEEDER_ID,
      thermalDeviceId: `${FEEDER_ID}-thermal-01`,
      batteryDeviceId: `${FEEDER_ID}-battery-01`,
    });

    console.log(`Dispatch mode: ${plan.mode}`);
    if (plan.shed && plan.shed.length > 0) {
      console.log(`  Shed (fairness rotation): ${plan.shed.map((h) => h.humanId).join(", ")}`);
      console.log(`  Protected this round: ${plan.protect.map((h) => h.humanId).join(", ")}`);
    }
    if (plan.isolatedSkipped && plan.isolatedSkipped.length > 0) {
      console.log(`  Excluded from candidates entirely (isolated): ${plan.isolatedSkipped.join(", ")}`);
    }
    console.log(`  Thermal store: ${thermalUnit.getState().stateOfChargeKWh}/${thermalUnit.getState().capacityKWh} kWh`);
    console.log(`  Battery:       ${battery.getState().stateOfChargeKWh}/${battery.getState().capacityKWh} kWh\n`);

    rounds.push({
      hour,
      demandKW: Number(loadForecast[0].forecastKW.toFixed(2)),
      solarKW: Number(solarForecast[0].forecastKW.toFixed(2)),
      gapKW: Number(gapKW.toFixed(2)),
      riskScore: risk.riskScore,
      dispatchMode: plan.mode,
      shed: (plan.shed || []).map((h) => h.humanId),
      protect: (plan.protect || []).map((h) => h.humanId),
      isolatedExcluded: plan.isolatedSkipped || [],
      thermalStateOfChargeKWh: thermalUnit.getState().stateOfChargeKWh,
      batteryStateOfChargeKWh: battery.getState().stateOfChargeKWh,
    });
  }

  // ---------------------------------------------------------------
  // Snapshot for the Layer 5 dashboard
  // ---------------------------------------------------------------
  line();
  console.log("Building dashboard snapshot...");
  line();

  const deviceTrustSnapshot = [];
  for (const d of devices) {
    const t = await chainClient.getDeviceTrust(ledger, d.humanId);
    deviceTrustSnapshot.push({ deviceHumanId: d.humanId, type: d.type, ...t });
  }

  const memberSnapshot = [];
  for (const h of householdIds) {
    const m = await chitFundClient.getMember(fund, h);
    memberSnapshot.push({ humanId: h, ...m, totalContributedWei: m.totalContributedWei.toString() });
  }

  const snapshot = {
    feederId: FEEDER_ID,
    generatedAt: new Date().toISOString(),
    contracts: { auditLedger: await ledger.getAddress(), chitFund: await fund.getAddress() },
    summary: {
      attestationCount: Number(await ledger.attestationCount()),
      dispatchCount: Number(await ledger.dispatchCount()),
      fraudFlagCount: Number(await ledger.fraudFlagCount()),
      batchCount: Number(await ledger.batchCount()),
      isolatedDeviceCount: isolated.size,
      fundBalanceWei: (await fund.fundBalance()).toString(),
    },
    rounds,
    devices: deviceTrustSnapshot,
    households: memberSnapshot,
  };

  const outDir = path.join(__dirname, "layer5", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "demo-output.json");
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote dashboard snapshot to ${outPath}`);
  line();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
