const { expect } = require("chai");
const { runOneDay } = require("../layer2/backtest");
const { computeGapRisk } = require("../layer2/forecastEngine");

describe("Layer 2 forecasting engine", function () {
  describe("backtest vs naive baselines", function () {
    it("weather-informed solar forecast beats climatology naive by a wide margin", function () {
      let results = [];
      let day = Math.floor(new Date("2026-10-01T00:00:00Z").getTime() / 1000);
      for (let d = 0; d < 8; d++) {
        results = results.concat(runOneDay(day));
        day += 86400;
      }
      const naiveMAE = results.reduce((a, r) => a + r.solarNaiveMAE, 0) / results.length;
      const informedMAE = results.reduce((a, r) => a + r.solarInformedMAE, 0) / results.length;
      expect(informedMAE, "weather-informed forecast should have lower error than climatology").to.be.lessThan(naiveMAE);
      expect((naiveMAE - informedMAE) / naiveMAE).to.be.greaterThan(0.3); // at least 30% improvement
    });

    it("residual-corrected load forecast beats pure seasonal naive", function () {
      let results = [];
      let day = Math.floor(new Date("2026-10-01T00:00:00Z").getTime() / 1000);
      for (let d = 0; d < 8; d++) {
        results = results.concat(runOneDay(day));
        day += 86400;
      }
      const naiveMAE = results.reduce((a, r) => a + r.loadNaiveMAE, 0) / results.length;
      const correctedMAE = results.reduce((a, r) => a + r.loadCorrectedMAE, 0) / results.length;
      expect(correctedMAE, "residual-corrected forecast should have lower error than pure seasonal").to.be.lessThan(naiveMAE);
    });
  });

  describe("computeGapRisk", function () {
    it("stays low risk when supply comfortably exceeds demand throughout", function () {
      const load = [0, 1, 2, 3].map((i) => ({ timestamp: i, forecastKW: 5 }));
      const solar = [0, 1, 2, 3].map((i) => ({ timestamp: i, forecastKW: 20 }));
      const risk = computeGapRisk(load, solar, 900, 10); // 15-min steps, 10 kWh buffer
      for (const r of risk) {
        expect(r.riskScore).to.equal(0);
        expect(r.shortfallExpected).to.equal(false);
      }
    });

    it("climbs toward high risk under a sustained shortfall that exceeds the buffer", function () {
      const steps = 12;
      const load = Array.from({ length: steps }, (_, i) => ({ timestamp: i, forecastKW: 7 }));
      const solar = Array.from({ length: steps }, (_, i) => ({ timestamp: i, forecastKW: 5 })); // 2kW gap sustained
      const risk = computeGapRisk(load, solar, 3600, 20); // 1-hour steps, 20kWh buffer
      expect(risk[risk.length - 1].riskScore).to.be.greaterThan(risk[0].riskScore);
      expect(risk.some((r) => r.shortfallExpected)).to.equal(true);
    });
  });
});
