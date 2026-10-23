// layer0/dataset.js
//
// Generates labeled (device, timestamp) examples across many simulated
// feeder-windows, for training and evaluating the cost-sensitive
// classifier. Three scenario types are mixed in, deliberately including a
// "hard negative" case:
//
//   1. NORMAL       - uncorrelated fluctuation only. Label 0 for everyone.
//   2. COINCIDENTAL - several relays happen to spike around the same time
//                     (e.g. an evening peak) but NOT in tight sync and NOT
//                     to a common ratio - a real, non-malicious pattern
//                     that a naive "multiple devices spiked at once" rule
//                     would false-positive on. Label 0 for everyone.
//   3. ATTACK       - a MadIoT-style compromised cluster spikes together,
//                     tightly synchronized in ratio. Label 1 for the
//                     compromised devices, 0 for everyone else on the
//                     same feeder in that window.
//
// Without case 2, the classifier could "cheat" by just learning
// "multiple relays spiking at once = attack", which is not actually the
// MadIoT signature (synchronization tightness is) and would false-alarm
// constantly on legitimate coincident demand (e.g. everyone's AC at 7pm).

const { makeFeederDevices, simulateNormalWindow, simulateCoordinatedAttackWindow } = require("../pipeline/deviceSimulator");
const { buildFeatureRows } = require("./graphUtils");

function simulateCoincidentalWindow(devices, spikingHumanIds, windowStartUnix, windowSeconds, intervalSeconds = 60) {
  const spiking = new Set(spikingHumanIds);
  const readings = [];
  for (let t = windowStartUnix; t < windowStartUnix + windowSeconds; t += intervalSeconds) {
    for (const d of devices) {
      let watts;
      if (spiking.has(d.humanId)) {
        // Each device spikes to a *different* ratio (1.8x-3.5x, wide
        // spread) and with independent timing jitter within the window -
        // "everyone's AC kicked on this evening", not a synchronized
        // command.
        const ratio = 1.8 + Math.random() * 1.7;
        const timingNoise = (Math.random() - 0.5) * 0.3;
        watts = Math.round(d.baselineWatts * (ratio + timingNoise));
      } else {
        const jitter = (Math.random() - 0.5) * 0.2 * d.baselineWatts;
        watts = Math.max(0, Math.round(d.baselineWatts + jitter));
      }
      readings.push({ deviceHumanId: d.humanId, type: d.type, timestamp: t, watts });
    }
  }
  return readings;
}

/**
 * Builds a labeled dataset: X (feature rows), y (0/1 labels), plus the
 * row index for traceability.
 */
function buildDataset({ numFeeders = 60, seed } = {}) {
  const X = [];
  const y = [];
  let windowStart = 1_700_000_000;

  for (let f = 0; f < numFeeders; f++) {
    const feederHumanId = `train-feeder-${f}`;
    const devices = makeFeederDevices(feederHumanId, 6);
    const baselineByDevice = Object.fromEntries(devices.map((d) => [d.humanId, d.baselineWatts]));
    const relays = devices.filter((d) => d.type === "SMART_RELAY");

    const scenario = f % 3; // rotate through the three scenario types evenly
    let readings, attackerSet;

    if (scenario === 0) {
      readings = simulateNormalWindow(devices, windowStart, 300, 60);
      attackerSet = new Set();
    } else if (scenario === 1) {
      const numSpiking = 2 + Math.floor(Math.random() * 3);
      const spiking = [...relays].sort(() => Math.random() - 0.5).slice(0, numSpiking).map((d) => d.humanId);
      readings = simulateCoincidentalWindow(devices, spiking, windowStart, 300, 60);
      attackerSet = new Set();
    } else {
      const numCompromised = 2 + Math.floor(Math.random() * 4);
      const compromised = [...relays].sort(() => Math.random() - 0.5).slice(0, numCompromised).map((d) => d.humanId);
      readings = simulateCoordinatedAttackWindow(devices, compromised, windowStart, 300, 60);
      attackerSet = new Set(compromised);
    }

    const { rows, index } = buildFeatureRows(readings, devices, baselineByDevice);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      X.push([
        r.spikeRatio,
        r.neighborMeanSpikeRatio,
        r.neighborStdSpikeRatio,
        r.neighborCount,
        r.activeNeighborMeanSpikeRatio,
        r.activeNeighborStdSpikeRatio,
        r.activeNeighborCount,
        r.ownVsNeighborGap,
        r.ownVsActiveNeighborGap,
      ]);
      y.push(attackerSet.has(index[i].deviceHumanId) ? 1 : 0);
    }

    windowStart += 3600;
  }

  return {
    X,
    y,
    featureNames: [
      "spikeRatio",
      "neighborMeanSpikeRatio",
      "neighborStdSpikeRatio",
      "neighborCount",
      "activeNeighborMeanSpikeRatio",
      "activeNeighborStdSpikeRatio",
      "activeNeighborCount",
      "ownVsNeighborGap",
      "ownVsActiveNeighborGap",
    ],
  };
}

function trainTestSplit(X, y, testFraction = 0.25) {
  const n = X.length;
  const indices = [...Array(n).keys()].sort(() => Math.random() - 0.5);
  const testSize = Math.round(n * testFraction);
  const testIdx = new Set(indices.slice(0, testSize));

  const XTrain = [],
    yTrain = [],
    XTest = [],
    yTest = [];
  for (let i = 0; i < n; i++) {
    if (testIdx.has(i)) {
      XTest.push(X[i]);
      yTest.push(y[i]);
    } else {
      XTrain.push(X[i]);
      yTrain.push(y[i]);
    }
  }
  return { XTrain, yTrain, XTest, yTest };
}

module.exports = { buildDataset, trainTestSplit, simulateCoincidentalWindow };
