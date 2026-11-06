// Loads and validates configuration from environment variables (.env in development).
require('dotenv').config();

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return value;
}

const config = {
  port: readInt('PORT', 4000),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtIssuer: 'campusride-rides-service',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  weatherApiUrl: process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast',
  weatherTimeoutMs: readInt('WEATHER_TIMEOUT_MS', 4000),
  loginRateLimit: readInt('LOGIN_RATE_LIMIT', 10),
};

// Fail fast with a clear message instead of running with an insecure default.
if (!config.jwtSecret || config.jwtSecret.length < 32) {
  console.error(
    '[config] JWT_SECRET is missing or shorter than 32 characters.\n' +
      '         Run "npm run setup" in the repository root, or copy .env.example to .env and set JWT_SECRET.'
  );
  process.exit(1);
}

module.exports = config;
