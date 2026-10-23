// pipeline/fraudDetector.js
//
// IMPORTANT — this is a stand-in, not the real detector.
//
// Layer 0's actual anomaly-detection engine (GraphSAGE embeddings +
// cost-sensitive classifier over the feeder's device graph, adapted from
// Sudipto's hardware-Trojan-detection work) owns real detection quality.
// That work isn't blocked on this: this module implements the *same
// output contract* — given a window of readings, return a list of flagged
// entities with a severity and evidence — using simple threshold rules
// instead of a trained model. Everything downstream (audit logging,
// device isolation, on-chain fraud flags) is wired against this contract,
// so swapping the rule engine for the real model later is a drop-in
// replacement: same function signature, same return shape.
//
// Two detectors are implemented, matching the two fraud/attack classes
// the architecture doc calls out for Layer 0 / Layer 4:
//   1. detectCoordinatedAnomalies — external attack pattern (MadIoT-style:
//      a cluster of devices spiking in near-perfect sync)
//   2. detectClaimMismatch        — internal fraud pattern (a participant's
//      claimed demand-response reduction doesn't match measured telemetry)

const { ethers } = require("hardhat");

function mean(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function relativeStdDev(nums) {
  const m = mean(nums);
  if (m === 0) return 0;
  const variance = mean(nums.map((n) => (n - m) ** 2));
  return Math.sqrt(variance) / m;
}

/**
 * Flags clusters of devices whose load moved together, sharply, in the
 * same short window — the MadIoT signature (see dossier §4): attackers
 * don't need grid knowledge, just synchronized high-wattage devices.
 *
 * @param {Array} readings - [{deviceHumanId, type, timestamp, watts}]
 * @param {Object} baselineByDevice - { [deviceHumanId]: baselineWatts }
 * @param {Object} opts
 * @returns {Array} flags - [{ timestamp, deviceHumanIds, avgSpikeRatio, relativeStdDev, severity, evidenceHash }]
 */
function detectCoordinatedAnomalies(
  readings,
  baselineByDevice,
  { spikeRatio = 2.2, maxRelativeStdDev = 0.06, minClusterSize = 3, relayOnly = true } = {}
) {
  const byTimestamp = new Map();
  for (const r of readings) {
    if (relayOnly && r.type !== "SMART_RELAY") continue;
    if (!byTimestamp.has(r.timestamp)) byTimestamp.set(r.timestamp, []);
    byTimestamp.get(r.timestamp).push(r);
  }

  const flags = [];
  for (const [timestamp, group] of byTimestamp.entries()) {
    const spiking = group.filter((r) => {
      const baseline = baselineByDevice[r.deviceHumanId] || r.watts;
      return r.watts >= baseline * spikeRatio;
    });
    if (spiking.length < minClusterSize) continue;

    // Compare spike *ratio* (watts / that device's own baseline), not raw
    // watts — devices have different baseline loads, so "synchronized"
    // means they moved together proportionally, not that their absolute
    // wattage matches.
    const ratios = spiking.map((r) => r.watts / (baselineByDevice[r.deviceHumanId] || r.watts));
    const rsd = relativeStdDev(ratios);
    if (rsd > maxRelativeStdDev) continue; // spiking but *not* synchronized -> more likely coincidence than attack

    const avgSpikeRatio = mean(ratios);

    // severity: higher for larger, tighter, sharper-spiking clusters (0-100 scale for the contract)
    const severity = Math.min(
      100,
      Math.round(40 + spiking.length * 5 + (avgSpikeRatio - spikeRatio) * 10 + (maxRelativeStdDev - rsd) * 200)
    );

    const evidenceHash = ethers.id(
      JSON.stringify({
        timestamp,
        devices: spiking.map((r) => r.deviceHumanId).sort(),
        watts: spiking.map((r) => r.watts),
      })
    );

    flags.push({
      timestamp,
      deviceHumanIds: spiking.map((r) => r.deviceHumanId),
      avgSpikeRatio: Number(avgSpikeRatio.toFixed(2)),
      relativeStdDev: Number(rsd.toFixed(4)),
      severity,
      evidenceHash,
      reason: `${spiking.length} relays spiked to ~${avgSpikeRatio.toFixed(1)}x baseline within the same window, std-dev ${(rsd * 100).toFixed(1)}% — synchronized-load signature`,
    });
  }
  return flags;
}

/**
 * Flags a demand-response claim that overstates the load reduction
 * measured in telemetry for the same device/window (see dossier §10 —
 * the OhmConnect/CAISO measurement-and-verification gap).
 *
 * @param {Array} claims - [{ entityHumanId, deviceHumanId, claimedReductionWatts, windowStart, windowEnd }]
 * @param {Array} readings - telemetry readings covering the same window
 * @param {Object} opts
 */
function detectClaimMismatch(claims, readings, { baselineWatts, overclaimRatio = 1.5 } = {}) {
  const flags = [];
  for (const claim of claims) {
    const windowReadings = readings.filter(
      (r) =>
        r.deviceHumanId === claim.deviceHumanId &&
        r.timestamp >= claim.windowStart &&
        r.timestamp <= claim.windowEnd
    );
    if (windowReadings.length === 0) continue;

    const avgWatts = mean(windowReadings.map((r) => r.watts));
    const baseline = (baselineWatts && baselineWatts[claim.deviceHumanId]) || avgWatts;
    const measuredReduction = Math.max(0, baseline - avgWatts);

    if (claim.claimedReductionWatts > measuredReduction * overclaimRatio && claim.claimedReductionWatts > 50) {
      const evidenceHash = ethers.id(
        JSON.stringify({ claim, measuredReduction: Math.round(measuredReduction) })
      );
      const severity = Math.min(
        100,
        Math.round(30 + Math.min(70, ((claim.claimedReductionWatts - measuredReduction) / Math.max(1, measuredReduction)) * 20))
      );
      flags.push({
        entityHumanId: claim.entityHumanId,
        deviceHumanId: claim.deviceHumanId,
        claimedReductionWatts: claim.claimedReductionWatts,
        measuredReductionWatts: Math.round(measuredReduction),
        severity,
        evidenceHash,
        reason: `claimed ${claim.claimedReductionWatts}W reduction, telemetry shows ~${Math.round(measuredReduction)}W`,
      });
    }
  }
  return flags;
}

module.exports = { detectCoordinatedAnomalies, detectClaimMismatch };
