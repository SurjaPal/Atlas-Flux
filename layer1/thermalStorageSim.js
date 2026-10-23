// layer1/thermalStorageSim.js
//
// "Primary physical asset is thermal storage (ice-based/phase-change)
// targeting the highest-value load flagged by the challenge itself —
// refrigeration — at a fraction of electrochemical battery cost. A small
// optional battery covers critical non-thermal loads." — Final
// Architecture, Layer 1.
//
// Default capacity (28 kWh-equivalent) is taken directly from the
// dossier's real-world precedent: Promethean Power Systems' PCM "thermal
// battery" units used in Indian dairy cold-chain deployments (dossier
// §14). This is a simple charge/discharge state model, not a thermal
// physics simulation — good enough to drive dispatch decisions in the
// demo, not a claim about real PCM heat-transfer dynamics.

class ThermalStorageUnit {
  constructor({ capacityKWh = 28, initialChargeFraction = 0.7, chargeEfficiency = 0.9, dischargeEfficiency = 0.95 } = {}) {
    this.capacityKWh = capacityKWh;
    this.stateOfChargeKWh = capacityKWh * initialChargeFraction;
    this.chargeEfficiency = chargeEfficiency;
    this.dischargeEfficiency = dischargeEfficiency;
  }

  /** Grid power is available and in surplus: build ice / charge the store. */
  charge(availableKW, hours) {
    const headroomKWh = this.capacityKWh - this.stateOfChargeKWh;
    const requestedKWh = availableKW * hours * this.chargeEfficiency;
    const acceptedKWh = Math.min(headroomKWh, Math.max(0, requestedKWh));
    this.stateOfChargeKWh += acceptedKWh;
    return { chargedKWh: acceptedKWh, drawnFromGridKW: acceptedKWh / Math.max(0.0001, hours * this.chargeEfficiency) };
  }

  /** Shortfall: melt ice / discharge the battery to cover demand, up to what's stored. */
  discharge(demandKW, hours) {
    const requestedKWh = demandKW * hours;
    const availableKWh = this.stateOfChargeKWh * this.dischargeEfficiency;
    const servedKWh = Math.min(availableKWh, requestedKWh);
    this.stateOfChargeKWh -= servedKWh / this.dischargeEfficiency;
    const unmetKWh = Math.max(0, requestedKWh - servedKWh);
    return {
      servedKW: servedKWh / hours,
      unmetKW: unmetKWh / hours,
      fullyCovered: unmetKWh < 1e-6,
    };
  }

  getState() {
    return {
      capacityKWh: this.capacityKWh,
      stateOfChargeKWh: Number(this.stateOfChargeKWh.toFixed(3)),
      stateOfChargeFraction: Number((this.stateOfChargeKWh / this.capacityKWh).toFixed(3)),
    };
  }
}

class CommunityBattery {
  constructor({ capacityKWh = 8, initialChargeFraction = 0.8 } = {}) {
    this.capacityKWh = capacityKWh;
    this.stateOfChargeKWh = capacityKWh * initialChargeFraction;
  }

  charge(availableKW, hours) {
    const headroomKWh = this.capacityKWh - this.stateOfChargeKWh;
    const acceptedKWh = Math.min(headroomKWh, Math.max(0, availableKW * hours));
    this.stateOfChargeKWh += acceptedKWh;
    return { chargedKWh: acceptedKWh };
  }

  /** Reserved for critical, non-thermal loads (medical devices, lighting) per the architecture doc. */
  discharge(demandKW, hours) {
    const requestedKWh = demandKW * hours;
    const servedKWh = Math.min(this.stateOfChargeKWh, requestedKWh);
    this.stateOfChargeKWh -= servedKWh;
    return { servedKW: servedKWh / hours, unmetKW: (requestedKWh - servedKWh) / hours };
  }

  getState() {
    return {
      capacityKWh: this.capacityKWh,
      stateOfChargeKWh: Number(this.stateOfChargeKWh.toFixed(3)),
      stateOfChargeFraction: Number((this.stateOfChargeKWh / this.capacityKWh).toFixed(3)),
    };
  }
}

module.exports = { ThermalStorageUnit, CommunityBattery };
