// layer0/graphUtils.js
//
// The real Layer 0 (per the architecture doc) is "GraphSAGE-embedding +
// behavioral-metric fusion": model the feeder's devices as a graph, then
// classify a device using its own behavior AND its neighbors' behavior,
// not just its own reading in isolation — because the MadIoT signature
// (dossier §4) is a *cluster* moving together, which is invisible if you
// only look at one device at a time.
//
// This module implements the graph-construction and neighbor-aggregation
// half of that idea by hand (mean aggregation over 1-hop neighbors, the
// core operation GraphSAGE's "mean aggregator" performs), without a full
// GNN training framework. See layer0/README.md for why, and what a real
// GraphSAGE model swap-in would change.

/**
 * Builds an adjacency list for a feeder: devices are connected to other
 * devices on the same feeder that share electrical proximity. Here that's
 * approximated as "same device type on the same feeder" (relays cluster
 * with relays, since that's the class MadIoT targets) plus every device
 * being weakly connected to the two shared feeder assets (thermal store,
 * community battery), mirroring how a real feeder topology graph would
 * connect loads to the shared local assets they draw from.
 */
function buildFeederGraph(devices) {
  const adjacency = new Map(devices.map((d) => [d.humanId, new Set()]));

  const relays = devices.filter((d) => d.type === "SMART_RELAY");
  for (const a of relays) {
    for (const b of relays) {
      if (a.humanId !== b.humanId) adjacency.get(a.humanId).add(b.humanId);
    }
  }

  const meters = devices.filter((d) => d.type === "SMART_METER");
  for (const a of meters) {
    for (const b of meters) {
      if (a.humanId !== b.humanId) adjacency.get(a.humanId).add(b.humanId);
    }
  }

  const shared = devices.filter((d) => d.type === "THERMAL_STORAGE" || d.type === "COMMUNITY_BATTERY");
  for (const d of devices) {
    for (const s of shared) {
      if (d.humanId !== s.humanId) {
        adjacency.get(d.humanId).add(s.humanId);
        adjacency.get(s.humanId).add(d.humanId);
      }
    }
  }

  return adjacency;
}

/**
 * Per-device raw behavioral features for one timestamp, given the window's
 * readings and each device's known baseline (a real system would derive
 * baseline from a rolling historical profile per device; the simulator
 * hands it to us directly).
 */
function extractOwnFeatures(reading, baselineWatts) {
  const spikeRatio = reading.watts / Math.max(1, baselineWatts);
  return {
    watts: reading.watts,
    baselineWatts,
    spikeRatio,
  };
}

/**
 * GraphSAGE-style mean aggregation: for a device at a given timestamp,
 * average its 1-hop neighbors' spike ratios and compute how tightly they
 * agree (low std-dev = synchronized = suspicious, per the MadIoT
 * signature). This is exactly the feature that catches the coordinated
 * cluster: no single device's own reading reveals it, but the neighbor
 * aggregate does.
 */
function aggregateNeighborFeatures(deviceHumanId, timestamp, readingsByTimestampAndDevice, baselineByDevice, adjacency) {
  const neighbors = [...(adjacency.get(deviceHumanId) || [])];
  const ratios = [];
  for (const n of neighbors) {
    const r = readingsByTimestampAndDevice.get(`${timestamp}|${n}`);
    if (!r) continue;
    const baseline = baselineByDevice[n] || r.watts;
    ratios.push(r.watts / Math.max(1, baseline));
  }

  const stats = (arr) => {
    if (arr.length === 0) return { mean: 1, std: 0, count: 0 };
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return { mean, std: Math.sqrt(variance), count: arr.length };
  };

  const all = stats(ratios);
  // Only neighbors that are themselves currently elevated — this is the
  // feature that actually targets "is the currently-active cluster in
  // sync", instead of being diluted by idle neighbors sitting near 1.0x,
  // which otherwise makes a loose coincidental spike look artificially
  // tight once averaged in with everyone who isn't spiking at all.
  const active = stats(ratios.filter((r) => r >= 1.3));

  return {
    neighborMeanSpikeRatio: all.mean,
    neighborStdSpikeRatio: all.std,
    neighborCount: all.count,
    activeNeighborMeanSpikeRatio: active.mean,
    activeNeighborStdSpikeRatio: active.std,
    activeNeighborCount: active.count,
  };
}

/**
 * Builds the full per-(device,timestamp) feature matrix for a window of
 * readings, combining own-behavior features with 1-hop neighbor
 * aggregation. Returns { rows, index } where `rows` is an array of feature
 * objects and `index` maps row -> { deviceHumanId, timestamp }.
 */
function buildFeatureRows(readings, devices, baselineByDevice) {
  const adjacency = buildFeederGraph(devices);

  const readingsByTimestampAndDevice = new Map();
  for (const r of readings) readingsByTimestampAndDevice.set(`${r.timestamp}|${r.deviceHumanId}`, r);

  const rows = [];
  const index = [];
  for (const r of readings) {
    if (r.type !== "SMART_RELAY") continue; // MadIoT-class devices are the detection target
    const own = extractOwnFeatures(r, baselineByDevice[r.deviceHumanId] || r.watts);
    const nbr = aggregateNeighborFeatures(
      r.deviceHumanId,
      r.timestamp,
      readingsByTimestampAndDevice,
      baselineByDevice,
      adjacency
    );
    rows.push({
      spikeRatio: own.spikeRatio,
      neighborMeanSpikeRatio: nbr.neighborMeanSpikeRatio,
      neighborStdSpikeRatio: nbr.neighborStdSpikeRatio,
      neighborCount: nbr.neighborCount,
      activeNeighborMeanSpikeRatio: nbr.activeNeighborMeanSpikeRatio,
      activeNeighborStdSpikeRatio: nbr.activeNeighborStdSpikeRatio,
      activeNeighborCount: nbr.activeNeighborCount,
      // "how far is my own spike from the neighborhood's, normalized" —
      // near 0 means moving in lockstep with neighbors (suspicious when
      // both are also spiking); this is the closest single scalar to
      // "graph embedding distance" without an actual trained embedding.
      ownVsNeighborGap: Math.abs(own.spikeRatio - nbr.neighborMeanSpikeRatio),
      ownVsActiveNeighborGap: Math.abs(own.spikeRatio - nbr.activeNeighborMeanSpikeRatio),
    });
    index.push({ deviceHumanId: r.deviceHumanId, timestamp: r.timestamp });
  }
  return { rows, index, adjacency };
}

module.exports = { buildFeederGraph, extractOwnFeatures, aggregateNeighborFeatures, buildFeatureRows };
