require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { reset } = require('../src/data/store');

// The third-party API is mocked so tests are fast and do not depend on the network.
let weatherMode = 'ok';
const fakeForecast = async () =>
  weatherMode === 'ok'
    ? { status: 'ok', forecastFor: 'x', temperatureC: 20, precipitationProbability: 10, description: 'Clear sky', source: 'open-meteo.com' }
    : { status: 'unavailable', reason: 'Weather provider is unreachable', source: 'open-meteo.com' };

const app = createApp({ getForecast: fakeForecast });

const future = (hours = 24) => new Date(Date.now() + hours * 3600000).toISOString();
const validRide = () => ({
  origin: { name: 'Plaza de Armas', lat: 20.5931, lng: -100.3896 },
  destination: 'Main campus',
  departureTime: future(),
  seats: 2,
  pricePerSeat: 25,
});

async function login(email, password) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.accessToken;
}
const loginAna = () => login('ana@campusride.test', 'Driver123!');
const loginLuis = () => login('luis@campusride.test', 'Rider123!');
const loginSofia = () => login('sofia@campusride.test', 'Rider456!');

test.beforeEach(() => {
  reset();
  weatherMode = 'ok';
});

// ---------- health & unknown routes ----------
test('GET /api/v1/health -> 200', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('unknown route -> 404 JSON', async () => {
  const res = await request(app).get('/api/v1/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

// ---------- auth ----------
test('POST /auth/login with valid credentials -> 200 + JWT without personal data', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'ana@campusride.test', password: 'Driver123!' });
  assert.equal(res.status, 200);
  assert.equal(res.body.tokenType, 'Bearer');
  assert.equal(res.body.expiresIn, 900);
  const payload = jwt.decode(res.body.accessToken);
  assert.equal(payload.sub, 'u1');
  assert.equal(payload.role, 'driver');
  assert.equal(payload.email, undefined);
  assert.equal(res.body.user.passwordHash, undefined);
});

test('POST /auth/login with wrong password -> 401', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'ana@campusride.test', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.message, 'Invalid email or password');
});

test('POST /auth/login with invalid body -> 400 with details', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  const fields = res.body.error.details.map((d) => d.field);
  assert.deepEqual(fields.sort(), ['email', 'password']);
});

test('malformed JSON -> 400 INVALID_JSON without stack trace', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email": ');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_JSON');
  assert.doesNotMatch(JSON.stringify(res.body), /at .*\.js|node_modules|SyntaxError/);
});

test('GET /auth/me with token -> 200, without token -> 401', async () => {
  const token = await loginLuis();
  const ok = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, 'luis@campusride.test');
  const no = await request(app).get('/api/v1/auth/me');
  assert.equal(no.status, 401);
});

// ---------- list / detail ----------
test('GET /rides -> 200 array', async () => {
  const res = await request(app).get('/api/v1/rides');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].driver.name, 'Ana Torres');
});

test('GET /rides?available=true filters rides with seats', async () => {
  const token = await loginLuis();
  await request(app).post('/api/v1/rides/2/bookings').set('Authorization', `Bearer ${token}`); // ride 2 now full
  const res = await request(app).get('/api/v1/rides?available=true');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((r) => r.id), [1]);
});

test('GET /rides with invalid query -> 400', async () => {
  const res = await request(app).get('/api/v1/rides?date=05-11-2026&available=maybe');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details.length, 2);
});

test('GET /rides/:id -> 200, unknown -> 404, invalid -> 400', async () => {
  assert.equal((await request(app).get('/api/v1/rides/1')).status, 200);
  assert.equal((await request(app).get('/api/v1/rides/999')).status, 404);
  assert.equal((await request(app).get('/api/v1/rides/abc')).status, 400);
});

// ---------- create (protected) ----------
test('POST /rides without token -> 401', async () => {
  const res = await request(app).post('/api/v1/rides').send(validRide());
  assert.equal(res.status, 401);
  assert.match(res.body.error.message, /Authorization header/);
});

test('POST /rides with a tampered token -> 401', async () => {
  const token = await loginAna();
  const [h, , s] = token.split('.');
  const fakePayload = Buffer.from(JSON.stringify({ sub: 'u1', role: 'admin', iss: 'campusride-rides-service' })).toString('base64url');
  const res = await request(app).post('/api/v1/rides').set('Authorization', `Bearer ${h}.${fakePayload}.${s}`).send(validRide());
  assert.equal(res.status, 401);
  assert.equal(res.body.error.message, 'Invalid token');
});

test('POST /rides with an expired token -> 401', async () => {
  const expired = jwt.sign({ role: 'driver' }, process.env.JWT_SECRET, {
    subject: 'u1', issuer: 'campusride-rides-service', expiresIn: -10,
  });
  const res = await request(app).post('/api/v1/rides').set('Authorization', `Bearer ${expired}`).send(validRide());
  assert.equal(res.status, 401);
  assert.match(res.body.error.message, /expired/);
});

test('POST /rides with alg "none" token -> 401', async () => {
  const unsigned = jwt.sign({ role: 'driver' }, null, { algorithm: 'none', subject: 'u1', issuer: 'campusride-rides-service' });
  const res = await request(app).post('/api/v1/rides').set('Authorization', `Bearer ${unsigned}`).send(validRide());
  assert.equal(res.status, 401);
});

test('POST /rides valid -> 201 with weather from third-party API', async () => {
  const token = await loginAna();
  const res = await request(app).post('/api/v1/rides').set('Authorization', `Bearer ${token}`).send(validRide());
  assert.equal(res.status, 201);
  assert.equal(res.headers.location, `/api/v1/rides/${res.body.id}`);
  assert.equal(res.body.driver.id, 'u1');
  assert.equal(res.body.seatsAvailable, 2);
  assert.equal(res.body.weather.status, 'ok');
});

test('POST /rides still -> 201 when the weather API is down (graceful degradation)', async () => {
  weatherMode = 'down';
  const token = await loginAna();
  const res = await request(app).post('/api/v1/rides').set('Authorization', `Bearer ${token}`).send(validRide());
  assert.equal(res.status, 201);
  assert.equal(res.body.weather.status, 'unavailable');
});

test('POST /rides invalid -> 400 with every invalid field', async () => {
  const token = await loginAna();
  const res = await request(app)
    .post('/api/v1/rides')
    .set('Authorization', `Bearer ${token}`)
    .send({ origin: { name: 'X', lat: 200, lng: 'a' }, destination: '', departureTime: '2020-01-01T08:00:00Z', seats: 9, pricePerSeat: -1 });
  assert.equal(res.status, 400);
  const fields = res.body.error.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['departureTime', 'destination', 'origin.lat', 'origin.lng', 'origin.name', 'pricePerSeat', 'seats']);
});

// ---------- bookings (protected) ----------
test('POST /rides/:id/bookings -> 201 and seat count decreases', async () => {
  const token = await loginLuis();
  const res = await request(app).post('/api/v1/rides/1/bookings').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 201);
  assert.equal(res.body.rideId, 1);
  assert.equal(res.body.seatsAvailable, 2);
});

test('booking twice -> 409', async () => {
  const token = await loginLuis();
  await request(app).post('/api/v1/rides/1/bookings').set('Authorization', `Bearer ${token}`);
  const res = await request(app).post('/api/v1/rides/1/bookings').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 409);
});

test('booking own ride -> 409', async () => {
  const token = await loginAna();
  const res = await request(app).post('/api/v1/rides/1/bookings').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 409);
});

test('booking a full ride -> 409', async () => {
  // ride 2 has 2 seats and Sofía already booked one
  await request(app).post('/api/v1/rides/2/bookings').set('Authorization', `Bearer ${await loginLuis()}`);
  const stranger = jwt.sign({ role: 'student' }, process.env.JWT_SECRET, { subject: 'u9', issuer: 'campusride-rides-service', expiresIn: 60 });
  const res = await request(app).post('/api/v1/rides/2/bookings').set('Authorization', `Bearer ${stranger}`);
  assert.equal(res.status, 409);
  assert.match(res.body.error.message, /no seats/);
});

test('booking without token -> 401; unknown ride -> 404', async () => {
  assert.equal((await request(app).post('/api/v1/rides/1/bookings')).status, 401);
  const token = await loginLuis();
  assert.equal((await request(app).post('/api/v1/rides/999/bookings').set('Authorization', `Bearer ${token}`)).status, 404);
});

test('GET /bookings returns only my bookings', async () => {
  const res = await request(app).get('/api/v1/bookings').set('Authorization', `Bearer ${await loginSofia()}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].ride.id, 2);
});

// ---------- delete (protected, owner only) ----------
test('DELETE /rides/:id by another user -> 403; by owner -> 204; again -> 404', async () => {
  const other = await request(app).delete('/api/v1/rides/1').set('Authorization', `Bearer ${await loginLuis()}`);
  assert.equal(other.status, 403);
  const ana = await loginAna();
  const ok = await request(app).delete('/api/v1/rides/1').set('Authorization', `Bearer ${ana}`);
  assert.equal(ok.status, 204);
  assert.equal(ok.text, '');
  const again = await request(app).delete('/api/v1/rides/1').set('Authorization', `Bearer ${ana}`);
  assert.equal(again.status, 404);
});

// ---------- weather endpoint ----------
test('GET /rides/:id/weather -> 200 when the provider works, 503 JSON when it fails', async () => {
  const ok = await request(app).get('/api/v1/rides/1/weather');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'ok');
  weatherMode = 'down';
  const down = await request(app).get('/api/v1/rides/1/weather');
  assert.equal(down.status, 503);
  assert.equal(down.body.error.code, 'WEATHER_UNAVAILABLE');
});
