// layer2/forecastEngine.js
//
// "Predicts short-horizon renewable supply-demand gaps at the feeder
// level using weather data, historical load patterns... Outputs a rolling
// risk score for 'supply will fall below demand' windows." — Final
// Architecture, Layer 2.
//
// Two forecasts, each explicitly benchmarked against a naive baseline
// (standard practice in real forecasting work — a model that doesn't beat
// climatology/persistence isn't earning its complexity):
//
//   SOLAR: naive = "climatology" (average expected cloud cover, ignoring
//          any weather forecast) vs. weather-informed (uses the — imperfect
//          — cloud-cover forecast from weatherModel.js).
//   LOAD:  naive = pure seasonal/diurnal profile vs. profile + a
//          persistence-of-residual correction (if actual demand has been
//          running above/below the seasonal profile recently, that bias
//          likely continues a little further, decaying toward zero as the
//          horizon extends — a standard, simple, *real* forecasting
//          technique, not a hand-wave).

const { clearSkyFraction, hourOfDay, forecastCloudCover } = require("./weatherModel");
const { loadFraction, isWeekend } = require("./loadModel");

const CLIMATOLOGICAL_CLOUD_COVER = 0.3; // long-run average, used when no weather forecast is consulted

// ---- Solar ----

function naiveSolarForecast(startUnix, steps, intervalSeconds, capacityKW) {
  const series = [];
  for (let i = 0; i < steps; i++) {
    const timestamp = startUnix + i * intervalSeconds;
    const clearSky = clearSkyFraction(hourOfDay(timestamp));
    series.push({ timestamp, forecastKW: capacityKW * clearSky * (1 - 0.85 * CLIMATOLOGICAL_CLOUD_COVER) });
  }
  return series;
}

function weatherInformedSolarForecast(startUnix, steps, intervalSeconds, capacityKW, cloudForecastSeries) {
  return cloudForecastSeries.map(({ timestamp, cloudCoverForecast }) => {
    const clearSky = clearSkyFraction(hourOfDay(timestamp));
    return { timestamp, forecastKW: capacityKW * clearSky * (1 - 0.85 * cloudCoverForecast) };
  });
}

// ---- Load ----

function naiveLoadForecast(startUnix, steps, intervalSeconds, peakKW) {
  const series = [];
  for (let i = 0; i < steps; i++) {
    const timestamp = startUnix + i * intervalSeconds;
    const frac = loadFraction(hourOfDay(timestamp), isWeekend(timestamp));
    series.push({ timestamp, forecastKW: peakKW * frac });
  }
  return series;
}

/**
 * @param recentActual - [{timestamp, demandKW}] the last K actual readings *before* startUnix
 */
function residualCorrectedLoadForecast(startUnix, steps, intervalSeconds, peakKW, recentActual) {
  let meanResidualKW = 0;
  if (recentActual && recentActual.length > 0) {
    const residuals = recentActual.map((r) => r.demandKW - peakKW * loadFraction(hourOfDay(r.timestamp), isWeekend(r.timestamp)));
    meanResidualKW = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  }

  const series = [];
  for (let i = 0; i < steps; i++) {
    const timestamp = startUnix + i * intervalSeconds;
    const frac = loadFraction(hourOfDay(timestamp), isWeekend(timestamp));
    const decay = Math.max(0, 1 - i / steps); // persistence fades out across the horizon
    series.push({ timestamp, forecastKW: Math.max(0, peakKW * frac + meanResidualKW * decay) });
  }
  return series;
}

// ---- Gap risk ----

/**
 * Combines a demand and a supply forecast into a rolling shortfall risk
 * score (0-100) per step, based on cumulative energy deficit against
 * available buffer capacity (thermal storage + battery, from Layer 1) —
 * not just instantaneous gap, since a brief small gap a battery can
 * absorb is not the same risk as a sustained one that drains it.
 */
function computeGapRisk(loadForecastSeries, solarForecastSeries, intervalSeconds, bufferKWh) {
  let cumulativeDeficitKWh = 0;
  const results = [];
  for (let i = 0; i < loadForecastSeries.length; i++) {
    const gapKW = loadForecastSeries[i].forecastKW - solarForecastSeries[i].forecastKW;
    const stepHours = intervalSeconds / 3600;
    if (gapKW > 0) {
      cumulativeDeficitKWh += gapKW * stepHours;
    } else {
      // Surplus lets the buffer recharge, so the deficit clock isn't
      // purely one-directional.
      cumulativeDeficitKWh = Math.max(0, cumulativeDeficitKWh + gapKW * stepHours);
    }
    const riskScore = Math.min(100, Math.round((cumulativeDeficitKWh / Math.max(0.001, bufferKWh)) * 100));
    results.push({
      timestamp: loadForecastSeries[i].timestamp,
      gapKW: Number(gapKW.toFixed(2)),
      cumulativeDeficitKWh: Number(cumulativeDeficitKWh.toFixed(2)),
      riskScore,
      shortfallExpected: riskScore >= 60,
    });
  }
  return results;
}

// ---- Evaluation helpers ----

function mae(forecastSeries, actualSeries, key) {
  const n = Math.min(forecastSeries.length, actualSeries.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(forecastSeries[i].forecastKW - actualSeries[i][key]);
  return sum / n;
}

module.exports = {
  naiveSolarForecast,
  weatherInformedSolarForecast,
  naiveLoadForecast,
  residualCorrectedLoadForecast,
  computeGapRisk,
  mae,
  CLIMATOLOGICAL_CLOUD_COVER,
};
