// layer3/dispatchEngine.js
//
// "When a shortfall is predicted, decides what draws from thermal
// storage/battery reserve and what gets shed. Fairness algorithm governs
// shedding decisions — rotates which non-critical loads go without power
// based on recent history... Trust scores from Layer 0 gate which devices
// are eligible to receive dispatch commands at all." — Final
// Architecture, Layer 3.
//
// planDispatch() is pure decision logic (no chain calls, easy to unit
// test); executeDispatchPlan() carries the plan out by calling into
// Layer 4's chainClient and Layer 1's chitFundClient.

const chainClient = require("../pipeline/chainClient");
const chitFundClient = require("../layer1/chitFundClient");

// Used for the SHED_LOAD dispatch-log magnitude when the caller doesn't
// pass a per-device wattage; kept as a named constant rather than a magic
// number scattered inline.
const AVG_LOAD_PLACEHOLDER_W = 1500;

/**
 * @param {Object} args
 * @param {number} args.gapKW - demand - supply for this window (negative = surplus)
 * @param {number} args.hours - duration of this dispatch window
 * @param {Array} args.households - [{ humanId, relayDeviceId, isolated, lastServedAt }]
 * @param {number} args.avgRelayLoadKW - typical load one shed household removes
 * @param {Object} args.thermalUnit - a ThermalStorageUnit instance (mutated in place)
 * @param {Object} args.battery - a CommunityBattery instance (mutated in place)
 */
function planDispatch({ gapKW, hours, households, avgRelayLoadKW, thermalUnit, battery }) {
  if (gapKW <= 0) {
    const surplusKW = -gapKW;
    const thermalCharge = thermalUnit.charge(surplusKW * 0.7, hours);
    const batteryCharge = battery.charge(surplusKW * 0.3, hours);
    return {
      mode: "CHARGE",
      thermalCharge,
      batteryCharge,
      shed: [],
      protect: [],
    };
  }

  const thermalResult = thermalUnit.discharge(gapKW, hours);
  if (thermalResult.fullyCovered) {
    return { mode: "DISCHARGE_THERMAL", thermalResult, shed: [], protect: [] };
  }

  const batteryResult = battery.discharge(thermalResult.unmetKW, hours);
  if (batteryResult.unmetKW <= 1e-6) {
    return { mode: "DISCHARGE_THERMAL_AND_BATTERY", thermalResult, batteryResult, shed: [], protect: [] };
  }

  // Still short after both stores are drained -> shed load, fairly.
  const eligible = households.filter((h) => !h.isolated);
  const numToShed = Math.min(eligible.length, Math.max(1, Math.ceil(batteryResult.unmetKW / avgRelayLoadKW)));

  // Oldest lastServedAt = most deserving of protection this round (hasn't
  // had priority in the longest time). Sort ascending, protect the front,
  // shed the back (the ones most recently protected already).
  const sorted = [...eligible].sort((a, b) => (a.lastServedAt || 0) - (b.lastServedAt || 0));
  const protect = sorted.slice(0, sorted.length - numToShed);
  const shed = sorted.slice(sorted.length - numToShed);

  return {
    mode: "SHED_LOAD",
    thermalResult,
    batteryResult,
    remainingUnmetKW: batteryResult.unmetKW,
    shed,
    protect,
    isolatedSkipped: households.filter((h) => h.isolated).map((h) => h.humanId),
  };
}

/**
 * Carries out a plan: logs dispatch commands on AuditLedger and updates
 * the ChitFund rotation ledger for whoever was protected this round.
 */
async function executeDispatchPlan(plan, { ledger, dispatcherSigner, fund, feederHumanId, thermalDeviceId, batteryDeviceId }) {
  const receipts = [];

  if (plan.mode === "CHARGE") {
    receipts.push(
      await chainClient.logDispatchCommand(
        ledger,
        dispatcherSigner,
        thermalDeviceId,
        feederHumanId,
        chainClient.DispatchAction.CHARGE,
        Math.round(plan.thermalCharge.chargedKWh * 1000),
        "forecast surplus, charging thermal store"
      )
    );
    if (plan.batteryCharge.chargedKWh > 0) {
      receipts.push(
        await chainClient.logDispatchCommand(
          ledger,
          dispatcherSigner,
          batteryDeviceId,
          feederHumanId,
          chainClient.DispatchAction.CHARGE,
          Math.round(plan.batteryCharge.chargedKWh * 1000),
          "forecast surplus, charging community battery"
        )
      );
    }
    return receipts;
  }

  if (plan.mode.startsWith("DISCHARGE")) {
    receipts.push(
      await chainClient.logDispatchCommand(
        ledger,
        dispatcherSigner,
        thermalDeviceId,
        feederHumanId,
        chainClient.DispatchAction.DISCHARGE,
        Math.round(plan.thermalResult.servedKW * 1000),
        "forecast shortfall, discharging thermal store"
      )
    );
    if (plan.batteryResult && plan.batteryResult.servedKW > 0) {
      receipts.push(
        await chainClient.logDispatchCommand(
          ledger,
          dispatcherSigner,
          batteryDeviceId,
          feederHumanId,
          chainClient.DispatchAction.DISCHARGE,
          Math.round(plan.batteryResult.servedKW * 1000),
          "forecast shortfall, discharging community battery (stores insufficient alone)"
        )
      );
    }
  }

  if (plan.mode === "SHED_LOAD") {
    for (const h of plan.shed) {
      receipts.push(
        await chainClient.logDispatchCommand(
          ledger,
          dispatcherSigner,
          h.relayDeviceId,
          feederHumanId,
          chainClient.DispatchAction.SHED_LOAD,
          Math.round(AVG_LOAD_PLACEHOLDER_W),
          "fairness rotation: shed this round (recently protected)"
        )
      );
    }
    for (const h of plan.protect) {
      receipts.push(await chitFundClient.recordServed(fund, dispatcherSigner, h.humanId));
    }
  }

  return receipts;
}

module.exports = { planDispatch, executeDispatchPlan };
