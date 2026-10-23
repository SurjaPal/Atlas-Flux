// layer2/loadModel.js
//
// Synthetic feeder demand: a diurnal profile with morning (cooking,
// getting ready) and evening (lights, AC, cooking, TV) peaks, scaled
// differently for weekdays vs weekends, plus noise. Same "shaped
// synthetic, not random" philosophy as weatherModel.js.

const { hourOfDay } = require("./weatherModel");

function isWeekend(unixSeconds) {
  const day = new Date(unixSeconds * 1000).getUTCDay(); // 0 = Sunday
  return day === 0 || day === 6;
}

/** Demand fraction (0-1 of feeder peak) for a given hour and day type. */
function loadFraction(hour, weekend) {
  const morningPeak = gaussianBump(hour, weekend ? 8.5 : 8.0, 1.2) * (weekend ? 0.55 : 0.65);
  const eveningPeak = gaussianBump(hour, weekend ? 19.5 : 19.0, 1.8) * (weekend ? 0.95 : 1.0);
  const baseline = 0.28;
  return Math.min(1, baseline + morningPeak + eveningPeak);
}

function gaussianBump(x, center, width) {
  return Math.exp(-((x - center) ** 2) / (2 * width * width));
}

function generateLoadSeries(startUnix, steps, intervalSeconds, peakKW, { noiseFraction = 0.06, dayFactor = 1 } = {}) {
  const series = [];
  for (let i = 0; i < steps; i++) {
    const timestamp = startUnix + i * intervalSeconds;
    const hour = hourOfDay(timestamp);
    const weekend = isWeekend(timestamp);
    const frac = loadFraction(hour, weekend);
    const noise = 1 + (Math.random() - 0.5) * 2 * noiseFraction;
    series.push({ timestamp, weekend, demandKW: Math.max(0, peakKW * frac * dayFactor * noise) });
  }
  return series;
}

module.exports = { loadFraction, generateLoadSeries, isWeekend };
