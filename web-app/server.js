// CampusRide main web app (backend-for-frontend).
// The "Rides" module of the app consumes the rides microservice through this server:
// the browser never sees the JWT, it is kept in an HttpOnly cookie and sent to the
// microservice as "Authorization: Bearer <token>".
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const PORT = Number(process.env.PORT) || 3000;
const SERVICE_URL = (process.env.RIDES_SERVICE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.RIDES_SERVICE_TIMEOUT_MS) || 8000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const COOKIE = 'cr_token';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const SERVICE_DOWN = {
  error: { code: 'SERVICE_UNAVAILABLE', message: 'The rides service is not available right now. Try again in a moment.' },
};

/** Calls the rides microservice. Returns { status, body } or null when it cannot be reached. */
async function callRidesService(method, servicePath, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(`${SERVICE_URL}${servicePath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } catch (err) {
    console.warn(`[web] rides-service ${method} ${servicePath} failed: ${err.message}`);
    return null;
  }
}

function send(res, result) {
  if (!result) return res.status(503).json(SERVICE_DOWN);
  if (result.status === 204 || result.body === null) return res.status(result.status).end();
  return res.status(result.status).json(result.body);
}

// ---- Session (login / current user / logout) ----
app.post('/session', async (req, res) => {
  const result = await callRidesService('POST', '/auth/login', { body: req.body });
  if (result && result.status === 200) {
    res.cookie(COOKIE, result.body.accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: COOKIE_SECURE,
      maxAge: result.body.expiresIn * 1000,
    });
    return res.status(200).json({ user: result.body.user, expiresIn: result.body.expiresIn });
  }
  return send(res, result);
});

app.get('/session', async (req, res) => {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not logged in' } });
  const result = await callRidesService('GET', '/auth/me', { token });
  if (result && result.status === 401) res.clearCookie(COOKIE);
  return send(res, result);
});

app.delete('/session', (req, res) => {
  res.clearCookie(COOKIE);
  res.status(204).end();
});

// ---- Rides module: forwards to the microservice ----
// /api/rides...  ->  {SERVICE_URL}/rides...      /api/bookings -> {SERVICE_URL}/bookings
app.all(['/api/rides', '/api/rides/*', '/api/bookings'], async (req, res) => {
  const servicePath = req.originalUrl.replace(/^\/api/, '');
  const token = req.cookies[COOKIE];
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
  const result = await callRidesService(req.method, servicePath, { token, body: hasBody ? req.body || {} : undefined });
  if (result && result.status === 401) res.clearCookie(COOKIE);
  return send(res, result);
});

app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  console.error('[web] unexpected error:', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
});

app.listen(PORT, () => {
  console.log(`CampusRide web app on http://localhost:${PORT}  (rides service: ${SERVICE_URL})`);
});
