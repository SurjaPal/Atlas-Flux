// liveDemo.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { deployAuditLedger } = require("./scripts/deploy");
const chainClient = require("./pipeline/chainClient");
const ingestion = require("./pipeline/ingestion");
const { makeFeederDevices, simulateNormalWindow, simulateCoordinatedAttackWindow } = require("./pipeline/deviceSimulator");

const chitFundClient = require("./layer1/chitFundClient");
const { ThermalStorageUnit, CommunityBattery } = require("./layer1/thermalStorageSim");

const { loadModel, scoreDevices, scoreDevicesWithMesh, featureRowToVector } = require("./layer0/trustEngine");
const threatMesh = require("./layer0/threatMesh");

const { generateCloudCoverSeries, generateSolarSeries, forecastCloudCover } = require("./layer2/weatherModel");
const { generateLoadSeries } = require("./layer2/loadModel");
const { weatherInformedSolarForecast, residualCorrectedLoadForecast, computeGapRisk } = require("./layer2/forecastEngine");

const { planDispatch, executeDispatchPlan } = require("./layer3/dispatchEngine");

const FEEDER_ID = "feeder-12-baner";
const DAY_START = Math.floor(new Date("2026-09-22T00:00:00Z").getTime() / 1000);
const SOLAR_CAPACITY_KW = 25;
const PEAK_LOAD_KW = 20;
const stepsPerDay = 24;
const intervalSeconds = 3600;

let currentSnapshot = null;
let isInitialized = false;

// Global State
let admin, attesterSvc, dispatcherSvc, fraudSvc, pipelineSvc;
let ledger, fund, mesh;
let devices, baselineByDevice, householdIds;
let layer0Model, thermalUnit, battery;
let cloudSeries, solarActual, loadActual;
let isolated, rounds, relayHouseholds;
let currentHourIndex = 0;
const roundHours = [6, 10, 18, 19, 22];
let blockchainTxs = [];

// Diagnostic State
let lastDiagnostics = {
  layer0: { lastRun: null, topScores: [] },
  layer2: { forecastDetails: null },
  layer3: { planDetails: null }
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

io.on("connection", (socket) => {
  console.log("Client connected via Socket.io");
  if (currentSnapshot) socket.emit("state_update", currentSnapshot);
});

function logTx(layer, action, hash, details) {
  blockchainTxs.unshift({ timestamp: new Date().toLocaleTimeString(), layer, action, hash: hash.substring(0, 18) + "...", details });
  if (blockchainTxs.length > 15) blockchainTxs.pop();
}

async function generateSnapshot() {
  console.log("Generating snapshot: device trust...");
  const deviceTrustSnapshot = [];
  for (const d of devices) {
    const t = await chainClient.getDeviceTrust(ledger, d.humanId);
    deviceTrustSnapshot.push({ deviceHumanId: d.humanId, type: d.type, ...t });
  }

  console.log("Generating snapshot: members...");
  const memberSnapshot = [];
  for (const h of householdIds) {
    const m = await chitFundClient.getMember(fund, h);
    memberSnapshot.push({ humanId: h, ...m, totalContributedWei: m.totalContributedWei.toString() });
  }

  console.log("Generating snapshot: summary...");
  currentSnapshot = {
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
    simulationComplete: currentHourIndex >= roundHours.length,
    diagnostics: lastDiagnostics,
    blockchainTxs
  };
  console.log("Snapshot generated.");
  io.emit("state_update", currentSnapshot);
}

// API Routes
app.get("/api/state", (req, res) => {
  if (currentSnapshot) {
    res.json(currentSnapshot);
  } else {
    res.status(503).json({ error: "System not initialized." });
  }
});

app.post("/api/init", async (req, res) => {
  try {
    blockchainTxs = [];
    console.log("Initializing Grid...");
    [admin, attesterSvc, dispatcherSvc, fraudSvc, pipelineSvc] = await ethers.getSigners();
    console.log("Got signers.");
    
    // Layer 4 & Layer 1 Contracts
    ledger = await deployAuditLedger(admin);
    console.log("Deployed ledger.");
    logTx("L4", "Deploy Ledger", await ledger.getAddress(), "AuditLedger Contract Created");
    
    await (await ledger.connect(admin).grantRole(await ledger.ATTESTER_ROLE(), attesterSvc.address)).wait();
    console.log("Granted attester role.");
    await (await ledger.connect(admin).grantRole(await ledger.DISPATCHER_ROLE(), dispatcherSvc.address)).wait();
    await (await ledger.connect(admin).grantRole(await ledger.FRAUD_ORACLE_ROLE(), fraudSvc.address)).wait();
    await (await ledger.connect(admin).grantRole(await ledger.PIPELINE_ROLE(), pipelineSvc.address)).wait();
    console.log("Granted all ledger roles.");

    fund = await chitFundClient.deployChitFund(admin);
    console.log("Deployed chit fund.");
    logTx("L1", "Deploy ChitFund", await fund.getAddress(), "ChitFund Contract Created");
    
    await (await fund.connect(admin).grantRole(await fund.FUND_ADMIN_ROLE(), admin.address)).wait();
    await (await fund.connect(admin).grantRole(await fund.DISPATCH_ROLE(), dispatcherSvc.address)).wait();

    // Layer 0 Threat Mesh
    mesh = await threatMesh.deployThreatMesh(admin);
    console.log("Deployed mesh.");
    logTx("L0", "Deploy Mesh", await mesh.getAddress(), "Federated Threat Mesh Created");
    
    await (await mesh.connect(admin).grantRole(await mesh.MESH_PUBLISHER_ROLE(), admin.address)).wait();

    // Seed Mesh with a previous attack from another feeder
    const knownAttackFeatureVector = [2.1, 1.8, 0.5, 4, 1.8, 0.5, 4, 0.1, 0.1];
    const { hex } = await threatMesh.publishToMesh(mesh, admin, knownAttackFeatureVector, { attackTypeCode: 1, severity: 85 });
    console.log("Published to mesh.");
    logTx("L0", "Publish Threat", hex, "Seeded known attack fingerprint from feeder-4-aundh");

    devices = makeFeederDevices(FEEDER_ID, 6);
    baselineByDevice = Object.fromEntries(devices.map((d) => [d.humanId, d.baselineWatts]));
    householdIds = [1, 2, 3, 4, 5, 6].map((h) => `${FEEDER_ID}-household-${h}`);
    
    for (const h of householdIds) {
      await chitFundClient.joinFund(fund, admin, h);
      await chitFundClient.contribute(fund, admin, h, ethers.parseEther("0.005"));
    }
    console.log("Households joined fund.");
    logTx("L1", "Fund Deposits", await fund.getAddress(), "6 Households contributed 0.005 ETH");

    console.log("Loading model...");
    layer0Model = loadModel();
    console.log("Model loaded.");
    
    thermalUnit = new ThermalStorageUnit({ capacityKWh: 28, initialChargeFraction: 0.6 });
    battery = new CommunityBattery({ capacityKWh: 8, initialChargeFraction: 0.6 });

    console.log("Generating series...");
    cloudSeries = generateCloudCoverSeries(DAY_START, stepsPerDay, intervalSeconds);
    solarActual = generateSolarSeries(DAY_START, stepsPerDay, intervalSeconds, SOLAR_CAPACITY_KW, cloudSeries);
    loadActual = generateLoadSeries(DAY_START, stepsPerDay, intervalSeconds, PEAK_LOAD_KW, { dayFactor: 1.1 });
    console.log("Generated series.");

    console.log("Simulating normal window...");
    const baselineReadings = simulateNormalWindow(devices, DAY_START - 600, 300, 60);
    console.log("Simulated normal window.");
    
    console.log("Scoring devices...");
    const relayScores = scoreDevices(baselineReadings, devices, baselineByDevice, layer0Model);
    console.log("Scored devices.");
    
    lastDiagnostics.layer0.lastRun = "Baseline Attestation";
    lastDiagnostics.layer0.topScores = relayScores.slice(0, 3).map(s => ({
      id: s.deviceHumanId,
      prob: s.attackProbability,
      vector: s.featureVector.map(v => Number(v.toFixed(3))),
      flagged: s.flagged,
      meshContributed: false
    }));

    console.log("Logging attestations...");
    const trustByDevice = new Map();
    for (const s of relayScores) {
      trustByDevice.set(s.deviceHumanId, s.trustScore);
      const h = ethers.id(`${s.deviceHumanId}-fw-v1`);
      console.log(`Logging attestation for ${s.deviceHumanId}...`);
      await chainClient.logAttestation(ledger, attesterSvc, s.deviceHumanId, s.trustScore, h);
    }
    for (const d of devices) {
      if (!trustByDevice.has(d.humanId)) {
        trustByDevice.set(d.humanId, 950);
        console.log(`Logging attestation for ${d.humanId}...`);
        await chainClient.logAttestation(ledger, attesterSvc, d.humanId, 950, ethers.id(`${d.humanId}-fw-v1`));
      }
    }
    console.log("Logged all attestations.");
    logTx("L4", "Attestations", await ledger.getAddress(), "Logged Trust Scores for 6 Relays");
    
    console.log("Anchoring batch...");
    await ingestion.anchorBatch(ledger, pipelineSvc, "batch-baseline", baselineReadings);
    console.log("Anchored batch.");

    isolated = new Set();
    rounds = [];
    currentHourIndex = 0;
    relayHouseholds = householdIds.map((h, i) => ({
      humanId: h,
      relayDeviceId: `${FEEDER_ID}-relay-${i + 1}`,
    }));

    await generateSnapshot();
    isInitialized = true;
    res.json({ success: true, message: "Grid initialized." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/step", async (req, res) => {
  if (!isInitialized) return res.status(400).json({ error: "Not initialized" });
  if (currentHourIndex >= roundHours.length) return res.status(400).json({ error: "Simulation complete. Please reset." });
  
  const injectFault = req.body?.fault === true;
  const hour = roundHours[currentHourIndex];
  
  try {
    if (injectFault) {
      // Simulate MadIoT Attack
      const compromised = [relayHouseholds[0].relayDeviceId, relayHouseholds[1].relayDeviceId, relayHouseholds[2].relayDeviceId];
      const attackStart = DAY_START + hour * intervalSeconds;
      const attackReadings = simulateCoordinatedAttackWindow(devices, compromised, attackStart, 300, 60);
      
      // Use Layer 0 Mesh Scoring
      const knownFingerprints = await threatMesh.fetchRecentFingerprints(mesh);
      const scores = scoreDevicesWithMesh(attackReadings, devices, baselineByDevice, layer0Model, knownFingerprints);
      
      lastDiagnostics.layer0.lastRun = "Coordinated Cyberattack";
      lastDiagnostics.layer0.topScores = scores.sort((a,b) => b.attackProbability - a.attackProbability).slice(0, 3).map(s => ({
        id: s.deviceHumanId,
        prob: s.attackProbability,
        vector: s.featureVector.map(v => Number(v.toFixed(3))),
        flagged: s.flagged,
        meshContributed: s.meshContributed
      }));

      const flagged = scores.filter((s) => s.flagged);

      for (const f of flagged) {
        await chainClient.flagFraud(ledger, fraudSvc, f.deviceHumanId, chainClient.FraudType.COORDINATED_ANOMALY, f.severity, f.evidenceHash, f.reason);
        logTx("L0", "Fraud Flag", f.evidenceHash, `Detected Anomaly on ${f.deviceHumanId}`);
        await chainClient.isolateDevice(ledger, attesterSvc, f.deviceHumanId, "coordinated-anomaly, user-simulated fault");
        isolated.add(f.deviceHumanId);
      }
      await ingestion.anchorBatch(ledger, pipelineSvc, `batch-attack-${hour}h`, attackReadings);
      logTx("L4", "Anchor Batch", ethers.id(`batch-attack-${hour}h`), `Anchored malicious telemetry tree`);
    }

    const idx = hour;
    const cloudForecast = forecastCloudCover([cloudSeries[idx]], 2);
    const solarForecast = weatherInformedSolarForecast(DAY_START + idx * intervalSeconds, 1, intervalSeconds, SOLAR_CAPACITY_KW, cloudForecast);
    const recentActualLoad = loadActual.slice(Math.max(0, idx - 3), idx);
    const loadForecast = residualCorrectedLoadForecast(DAY_START + idx * intervalSeconds, 1, intervalSeconds, PEAK_LOAD_KW, recentActualLoad);

    const gapKW = loadForecast[0].forecastKW - solarForecast[0].forecastKW;
    const bufferKWh = thermalUnit.getState().stateOfChargeKWh + battery.getState().stateOfChargeKWh;
    const [risk] = computeGapRisk(loadForecast, solarForecast, intervalSeconds, Math.max(1, bufferKWh));

    // Layer 2 Diagnostics
    lastDiagnostics.layer2.forecastDetails = {
      baseDemand: loadForecast[0].forecastKW,
      correctedDemand: loadForecast[0].forecastKW,
      cloudFactor: cloudForecast[0].cloudCoverForecast,
      computedSolar: solarForecast[0].forecastKW,
      storageBufferRemaining: bufferKWh
    };

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
    
    // Layer 3 Diagnostics
    lastDiagnostics.layer3.planDetails = {
      mode: plan.mode,
      protectList: (plan.protect || []).map(h => h.humanId),
      shedList: (plan.shed || []).map(h => h.humanId),
      skipList: plan.isolatedSkipped || []
    };

    await executeDispatchPlan(plan, {
      ledger,
      dispatcherSigner: dispatcherSvc,
      fund,
      feederHumanId: FEEDER_ID,
      thermalDeviceId: `${FEEDER_ID}-thermal-01`,
      batteryDeviceId: `${FEEDER_ID}-battery-01`,
    });
    logTx("L3", "Dispatch", ethers.id(plan.mode + hour), `Executed Mode: ${plan.mode}`);

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

    currentHourIndex++;
    await generateSnapshot();
    res.json({ success: true, message: `Advanced to hour ${hour}` });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

server.listen(3000, '0.0.0.0', () => {
  console.log("Interactive Demo Server running at http://localhost:3000");
});
