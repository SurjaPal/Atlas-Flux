// layer2/weatherModel.js
//
// Synthetic but physically-shaped solar generation: a clear-sky diurnal
// curve (zero before sunrise/after sunset, peaking at solar noon) times a
// stochastic cloud-cover factor. Cloud cover follows a mean-reverting
// random walk with occasional sharp "cloud events" — this is the
// intermittency the whole challenge is about (dossier §2: solar/wind
// output "swings with clouds, nightfall, and weather").
//
// A forecast series is generated separately from the "actual" series,
// with added error, because a forecasting engine that's evaluated against
// a perfect weather input it wouldn't have in reality is not a real
// evaluation.

const MINUTES_PER_DAY = 24 * 60;

function hourOfDay(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** Clear-sky solar output fraction (0-1), sunrise ~6:00, sunset ~18:30, peak at solar noon. */
function clearSkyFraction(hour) {
  const sunrise = 6.0;
  const sunset = 18.5;
  if (hour <= sunrise || hour >= sunset) return 0;
  const solarNoon = (sunrise + sunset) / 2;
  const halfSpan = (sunset - sunrise) / 2;
  const x = (hour - solarNoon) / halfSpan; // -1 .. 1
  return Math.max(0, Math.cos((x * Math.PI) / 2)); // 0 at edges, 1 at noon
}

/**
 * Generates a cloud-cover series (0 = clear, 1 = fully overcast) via a
 * mean-reverting random walk, with a chance per step of a sharp transient
 * cloud event (the kind of short-horizon dip that makes intermittency
 * genuinely hard to forecast a few hours out).
 */
function generateCloudCoverSeries(startUnix, steps, intervalSeconds, { seedCover = 0.25, eventProbability = 0.03 } = {}) {
  const series = [];
  let cover = seedCover;
  for (let i = 0; i < steps; i++) {
    const meanReversion = (0.3 - cover) * 0.05;
    const drift = (Math.random() - 0.5) * 0.08;
    cover = Math.min(1, Math.max(0, cover + meanReversion + drift));
    if (Math.random() < eventProbability) {
      cover = Math.min(1, cover + 0.4 + Math.random() * 0.3); // sudden cloud bank
    }
    series.push({ timestamp: startUnix + i * intervalSeconds, cloudCover: cover });
  }
  return series;
}

/** "Actual" solar output for a feeder, given a capacity and a cloud-cover series. */
function generateSolarSeries(startUnix, steps, intervalSeconds, capacityKW, cloudSeries) {
  return cloudSeries.map(({ timestamp, cloudCover }, i) => {
    const hour = hourOfDay(timestamp);
    const clearSky = clearSkyFraction(hour);
    const outputKW = capacityKW * clearSky * (1 - 0.85 * cloudCover);
    return { timestamp, cloudCover, outputKW: Math.max(0, outputKW) };
  });
}

/**
 * A forecast of the same cloud-cover series, issued `leadSteps` steps
 * ahead, with error that grows with lead time — a realistic touch (a
 * 15-minute-ahead forecast is much better than a 3-hour-ahead one).
 */
function forecastCloudCover(actualCloudSeries, leadSteps) {
  return actualCloudSeries.map((point, i) => {
    const errorMagnitude = 0.05 + 0.03 * leadSteps; // grows with horizon
    const noise = (Math.random() - 0.5) * 2 * errorMagnitude;
    return { timestamp: point.timestamp, cloudCoverForecast: Math.min(1, Math.max(0, point.cloudCover + noise)) };
  });
}

module.exports = { clearSkyFraction, hourOfDay, generateCloudCoverSeries, generateSolarSeries, forecastCloudCover, MINUTES_PER_DAY };
