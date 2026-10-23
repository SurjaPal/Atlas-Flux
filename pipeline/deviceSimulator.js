// pipeline/deviceSimulator.js
//
// Simulates the grid-edge device population on one feeder, grounded in the
// device types the architecture doc actually proposes deploying:
//   - SMART_METER            : household consumption meter (RDSS-style)
//   - SMART_RELAY             : controls a high-wattage load (AC/EV charger/
//                               water heater) — exactly the device class the
//                               MadIoT paper targets
//   - THERMAL_STORAGE         : the Layer 1 ice/PCM unit (chit-fund owned)
//   - COMMUNITY_BATTERY       : the small shared battery for critical loads
//
// This does not simulate real hardware — it produces the same *shape* of
// telemetry a real deployment's data pipeline would ingest, so the
// ingestion/fraud-detection/audit-anchoring code downstream can be built
// and tested against something realistic before real sensors exist.

function makeFeederDevices(feederHumanId, householdCount = 6) {
  const devices = [];
  for (let h = 1; h <= householdCount; h++) {
    devices.push({
      humanId: `${feederHumanId}-meter-${h}`,
      type: "SMART_METER",
      householdIndex: h,
      baselineWatts: 300 + Math.round(Math.random() * 400),
    });
    devices.push({
      humanId: `${feederHumanId}-relay-${h}`,
      type: "SMART_RELAY",
      householdIndex: h,
      baselineWatts: 1200 + Math.round(Math.random() * 800), // AC / EV charger / water heater class load
    });
  }
  // Shared, chit-fund-owned assets serving the whole feeder, not one household.
  devices.push({ humanId: `${feederHumanId}-thermal-01`, type: "THERMAL_STORAGE", baselineWatts: 250 });
  devices.push({ humanId: `${feederHumanId}-battery-01`, type: "COMMUNITY_BATTERY", baselineWatts: 100 });
  return devices;
}

/** Normal, uncorrelated fluctuation around each device's baseline load. */
function simulateNormalWindow(devices, windowStartUnix, windowSeconds, intervalSeconds = 60) {
  const readings = [];
  for (let t = windowStartUnix; t < windowStartUnix + windowSeconds; t += intervalSeconds) {
    for (const d of devices) {
      const jitter = (Math.random() - 0.5) * 0.2 * d.baselineWatts; // +/-10%
      readings.push({
        deviceHumanId: d.humanId,
        type: d.type,
        timestamp: t,
        watts: Math.max(0, Math.round(d.baselineWatts + jitter)),
      });
    }
  }
  return readings;
}

/**
 * Simulates a MadIoT-style coordinated attack: a subset of SMART_RELAY
 * devices synchronously spike to near-simultaneous full load in the same
 * few-second window, then hold — the signature the dossier describes
 * (sudden, correlated demand manipulation), rather than the gradual,
 * uncorrelated drift of normal usage.
 */
function simulateCoordinatedAttackWindow(devices, compromisedHumanIds, windowStartUnix, windowSeconds, intervalSeconds = 60) {
  const compromised = new Set(compromisedHumanIds);
  const readings = [];
  for (let t = windowStartUnix; t < windowStartUnix + windowSeconds; t += intervalSeconds) {
    for (const d of devices) {
      let watts;
      if (compromised.has(d.humanId)) {
        // Synchronized spike to ~3x baseline, near-identical across the
        // compromised cluster (low variance) — that near-identical timing
        // and magnitude across unrelated households is the tell.
        watts = Math.round(d.baselineWatts * 3 * (0.98 + Math.random() * 0.04));
      } else {
        const jitter = (Math.random() - 0.5) * 0.2 * d.baselineWatts;
        watts = Math.max(0, Math.round(d.baselineWatts + jitter));
      }
      readings.push({ deviceHumanId: d.humanId, type: d.type, timestamp: t, watts });
    }
  }
  return readings;
}

module.exports = { makeFeederDevices, simulateNormalWindow, simulateCoordinatedAttackWindow };
