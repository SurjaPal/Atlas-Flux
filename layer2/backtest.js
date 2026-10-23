// layer2/backtest.js
//
// Run with: node layer2/backtest.js
//
// Generates several synthetic days of "actual" weather+load, forecasts
// each 3-hour horizon with both the naive and improved models, and
// reports MAE — the standard way to show a forecasting model is actually
// earning its complexity rather than just being more complicated.

const { generateCloudCoverSeries, generateSolarSeries, forecastCloudCover } = require("./weatherModel");
const { generateLoadSeries } = require("./loadModel");
const {
  naiveSolarForecast,
  weatherInformedSolarForecast,
  naiveLoadForecast,
  residualCorrectedLoadForecast,
  mae,
} = require("./forecastEngine");

const INTERVAL_SECONDS = 15 * 60; // 15-minute steps
const HORIZON_STEPS = 12; // 3-hour horizon
const CAPACITY_KW = 40; // feeder-level rooftop+shared solar capacity
const PEAK_LOAD_KW = 30;

function runOneDay(dayStartUnix) {
  const stepsPerDay = Math.floor((24 * 3600) / INTERVAL_SECONDS);
  const cloudSeries = generateCloudCoverSeries(dayStartUnix, stepsPerDay, INTERVAL_SECONDS);
  const solarActual = generateSolarSeries(dayStartUnix, stepsPerDay, INTERVAL_SECONDS, CAPACITY_KW, cloudSeries);
  // A "hot day" / "cool day" factor that persists for the whole day (e.g.
  // temperature-driven AC use) — the systematic bias a residual-correction
  // forecast is meant to pick up on from a handful of recent readings.
  const dayFactor = 0.85 + Math.random() * 0.45;
  const loadActual = generateLoadSeries(dayStartUnix, stepsPerDay, INTERVAL_SECONDS, PEAK_LOAD_KW, { dayFactor });

  const results = [];
  // Issue a forecast every 2 hours through the day, each covering the next 3 hours.
  for (let startIdx = 8; startIdx + HORIZON_STEPS < stepsPerDay; startIdx += 8) {
    const forecastStart = dayStartUnix + startIdx * INTERVAL_SECONDS;

    const cloudForecast = forecastCloudCover(cloudSeries.slice(startIdx, startIdx + HORIZON_STEPS), 4);
    const solarNaive = naiveSolarForecast(forecastStart, HORIZON_STEPS, INTERVAL_SECONDS, CAPACITY_KW);
    const solarInformed = weatherInformedSolarForecast(forecastStart, HORIZON_STEPS, INTERVAL_SECONDS, CAPACITY_KW, cloudForecast);
    const solarActualSlice = solarActual.slice(startIdx, startIdx + HORIZON_STEPS);

    const recentActualLoad = loadActual.slice(Math.max(0, startIdx - 4), startIdx);
    const loadNaive = naiveLoadForecast(forecastStart, HORIZON_STEPS, INTERVAL_SECONDS, PEAK_LOAD_KW);
    const loadCorrected = residualCorrectedLoadForecast(forecastStart, HORIZON_STEPS, INTERVAL_SECONDS, PEAK_LOAD_KW, recentActualLoad);
    const loadActualSlice = loadActual.slice(startIdx, startIdx + HORIZON_STEPS);

    results.push({
      solarNaiveMAE: mae(solarNaive, solarActualSlice, "outputKW"),
      solarInformedMAE: mae(solarInformed, solarActualSlice, "outputKW"),
      loadNaiveMAE: mae(loadNaive, loadActualSlice, "demandKW"),
      loadCorrectedMAE: mae(loadCorrected, loadActualSlice, "demandKW"),
    });
  }
  return results;
}

function main() {
  const numDays = 14;
  let allResults = [];
  let dayStart = Math.floor(new Date("2026-09-01T00:00:00Z").getTime() / 1000);

  for (let d = 0; d < numDays; d++) {
    allResults = allResults.concat(runOneDay(dayStart));
    dayStart += 24 * 3600;
  }

  const avg = (key) => allResults.reduce((a, r) => a + r[key], 0) / allResults.length;

  console.log(`Backtest over ${numDays} synthetic days, ${allResults.length} forecast issues, 3-hour horizon @ 15-min steps\n`);
  console.log("Solar forecast MAE (kW):");
  console.log(`  naive (climatology):     ${avg("solarNaiveMAE").toFixed(2)}`);
  console.log(`  weather-informed:        ${avg("solarInformedMAE").toFixed(2)}`);
  console.log(
    `  improvement:             ${(((avg("solarNaiveMAE") - avg("solarInformedMAE")) / avg("solarNaiveMAE")) * 100).toFixed(1)}%\n`
  );
  console.log("Load forecast MAE (kW):");
  console.log(`  naive (seasonal only):   ${avg("loadNaiveMAE").toFixed(2)}`);
  console.log(`  residual-corrected:      ${avg("loadCorrectedMAE").toFixed(2)}`);
  console.log(
    `  improvement:             ${(((avg("loadNaiveMAE") - avg("loadCorrectedMAE")) / avg("loadNaiveMAE")) * 100).toFixed(1)}%`
  );
}

if (require.main === module) {
  main();
}

module.exports = { runOneDay };
