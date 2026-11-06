require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getForecast } = require('../src/services/weather');

const inHours = (h) => {
  const d = new Date(Date.now() + h * 3600000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
};

function fakeOpenMeteo(time) {
  const hourKey = `${time.slice(0, 13)}:00`;
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      hourly: {
        time: ['1999-01-01T00:00', hourKey],
        temperature_2m: [0, 18.4],
        precipitation_probability: [0, 35],
        weather_code: [0, 61],
      },
    }),
  });
}

test('returns the forecast for the departure hour', async () => {
  const time = inHours(10);
  const result = await getForecast({ lat: 20.59, lng: -100.39, time }, { fetchImpl: fakeOpenMeteo(time) });
  assert.equal(result.status, 'ok');
  assert.equal(result.temperatureC, 18.4);
  assert.equal(result.precipitationProbability, 35);
  assert.equal(result.description, 'Light rain');
});

test('sends latitude, longitude and date to Open-Meteo', async () => {
  const time = inHours(10);
  let calledUrl;
  await getForecast({ lat: 20.59, lng: -100.39, time }, {
    fetchImpl: async (url) => {
      calledUrl = new URL(url);
      return fakeOpenMeteo(time)();
    },
  });
  assert.equal(calledUrl.hostname, 'api.open-meteo.com');
  assert.equal(calledUrl.searchParams.get('latitude'), '20.59');
  assert.equal(calledUrl.searchParams.get('start_date'), time.slice(0, 10));
});

test('provider HTTP error -> unavailable, no exception', async () => {
  const result = await getForecast({ lat: 1, lng: 1, time: inHours(5) }, {
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.reason, /HTTP 500/);
});

test('network failure -> unavailable, no exception', async () => {
  const result = await getForecast({ lat: 1, lng: 1, time: inHours(5) }, {
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'Weather provider is unreachable');
});

test('timeout -> unavailable', async () => {
  const result = await getForecast({ lat: 1, lng: 1, time: inHours(5) }, {
    fetchImpl: async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; },
  });
  assert.equal(result.reason, 'Weather provider timed out');
});

test('more than 15 days ahead -> unavailable without calling the provider', async () => {
  let called = false;
  const result = await getForecast({ lat: 1, lng: 1, time: inHours(24 * 20) }, {
    fetchImpl: async () => { called = true; },
  });
  assert.equal(called, false);
  assert.equal(result.status, 'unavailable');
});
