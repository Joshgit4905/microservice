// Third-party API client: Open-Meteo forecast (https://open-meteo.com, free, no API key).
// Never throws: when the provider fails it returns { status: 'unavailable', reason },
// so a weather problem never breaks ride publication.
const config = require('../config');

const MAX_DAYS_AHEAD = 15;

// Subset of WMO weather codes used by Open-Meteo.
const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

function unavailable(reason) {
  return { status: 'unavailable', reason, source: 'open-meteo.com' };
}

/**
 * Forecast for a point at a given time.
 * @param {{lat:number, lng:number, time:string}} params  time is an ISO 8601 date-time
 * @param {{fetchImpl?:Function}} [deps]  injectable fetch for tests
 */
async function getForecast({ lat, lng, time }, { fetchImpl = globalThis.fetch } = {}) {
  const when = new Date(time);
  const daysAhead = (when.getTime() - Date.now()) / 86400000;
  if (daysAhead > MAX_DAYS_AHEAD) {
    return unavailable(`Forecast is only available up to ${MAX_DAYS_AHEAD} days ahead`);
  }
  if (daysAhead < -1) {
    return unavailable('Departure time is in the past');
  }

  const date = when.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const hourKey = `${when.toISOString().slice(0, 13)}:00`; // YYYY-MM-DDTHH:00

  const url = new URL(config.weatherApiUrl);
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    start_date: date,
    end_date: date,
    timezone: 'UTC',
  }).toString();

  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(config.weatherTimeoutMs) });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'Weather provider timed out' : 'Weather provider is unreachable';
    console.warn(`[weather] ${reason}: ${err.message}`);
    return unavailable(reason);
  }

  if (!response.ok) {
    console.warn(`[weather] Open-Meteo answered HTTP ${response.status}`);
    return unavailable(`Weather provider answered with HTTP ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return unavailable('Weather provider returned an invalid response');
  }

  const hourly = data && data.hourly;
  const index = hourly && Array.isArray(hourly.time) ? hourly.time.indexOf(hourKey) : -1;
  if (index === -1) {
    return unavailable('No forecast found for the departure hour');
  }

  const code = hourly.weather_code ? hourly.weather_code[index] : null;
  return {
    status: 'ok',
    forecastFor: `${hourKey}Z`,
    temperatureC: hourly.temperature_2m ? hourly.temperature_2m[index] : null,
    precipitationProbability: hourly.precipitation_probability ? hourly.precipitation_probability[index] : null,
    description: WMO[code] || 'Unknown',
    source: 'open-meteo.com',
  };
}

module.exports = { getForecast };
