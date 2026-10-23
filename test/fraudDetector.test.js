const { expect } = require("chai");
const { detectCoordinatedAnomalies, detectClaimMismatch } = require("../pipeline/fraudDetector");

describe("fraudDetector (rule-based stand-in for Layer 0's model)", function () {
  describe("detectCoordinatedAnomalies", function () {
    const baselineByDevice = {
      "relay-1": 1200,
      "relay-2": 1500,
      "relay-3": 1800,
      "relay-4": 2000,
      "relay-5": 1300,
    };

    it("flags a tight cluster that spikes together, proportionally, to a common ratio", function () {
      const t = 1000;
      const readings = [
        { deviceHumanId: "relay-1", type: "SMART_RELAY", timestamp: t, watts: 1200 * 3 },
        { deviceHumanId: "relay-2", type: "SMART_RELAY", timestamp: t, watts: 1500 * 3 },
        { deviceHumanId: "relay-3", type: "SMART_RELAY", timestamp: t, watts: 1800 * 3 },
        { deviceHumanId: "relay-4", type: "SMART_RELAY", timestamp: t, watts: 2000 * 3 },
        // relay-5 is unaffected — normal load
        { deviceHumanId: "relay-5", type: "SMART_RELAY", timestamp: t, watts: 1310 },
      ];

      const flags = detectCoordinatedAnomalies(readings, baselineByDevice);
      expect(flags).to.have.lengthOf(1);
      expect(flags[0].deviceHumanIds.sort()).to.deep.equal(["relay-1", "relay-2", "relay-3", "relay-4"]);
      expect(flags[0].avgSpikeRatio).to.be.closeTo(3.0, 0.05);
    });

    it("does not flag devices that spike but not in sync (high dispersion in spike ratio)", function () {
      const t = 2000;
      const readings = [
        { deviceHumanId: "relay-1", type: "SMART_RELAY", timestamp: t, watts: 1200 * 2.3 }, // just over threshold
        { deviceHumanId: "relay-2", type: "SMART_RELAY", timestamp: t, watts: 1500 * 5.0 }, // wildly different ratio
        { deviceHumanId: "relay-3", type: "SMART_RELAY", timestamp: t, watts: 1800 * 2.5 },
      ];
      const flags = detectCoordinatedAnomalies(readings, baselineByDevice);
      expect(flags).to.have.lengthOf(0);
    });

    it("does not flag normal, uncorrelated fluctuation", function () {
      const t = 3000;
      const readings = [
        { deviceHumanId: "relay-1", type: "SMART_RELAY", timestamp: t, watts: 1250 },
        { deviceHumanId: "relay-2", type: "SMART_RELAY", timestamp: t, watts: 1420 },
        { deviceHumanId: "relay-3", type: "SMART_RELAY", timestamp: t, watts: 1850 },
      ];
      const flags = detectCoordinatedAnomalies(readings, baselineByDevice);
      expect(flags).to.have.lengthOf(0);
    });
  });

  describe("detectClaimMismatch", function () {
    it("flags a demand-response claim well above what telemetry shows", function () {
      const claims = [{ entityHumanId: "member-42", deviceHumanId: "relay-9", claimedReductionWatts: 900, windowStart: 0, windowEnd: 300 }];
      const readings = [
        { deviceHumanId: "relay-9", timestamp: 60, watts: 1150 },
        { deviceHumanId: "relay-9", timestamp: 120, watts: 1180 },
      ];
      const flags = detectClaimMismatch(claims, readings, { baselineWatts: { "relay-9": 1300 } });
      expect(flags).to.have.lengthOf(1);
      expect(flags[0].measuredReductionWatts).to.be.lessThan(200);
    });

    it("does not flag a claim consistent with measured telemetry", function () {
      const claims = [{ entityHumanId: "member-7", deviceHumanId: "relay-3", claimedReductionWatts: 400, windowStart: 0, windowEnd: 300 }];
      const readings = [
        { deviceHumanId: "relay-3", timestamp: 60, watts: 1400 },
        { deviceHumanId: "relay-3", timestamp: 120, watts: 1420 },
      ];
      const flags = detectClaimMismatch(claims, readings, { baselineWatts: { "relay-3": 1800 } });
      expect(flags).to.have.lengthOf(0);
    });
  });
});
