// Test environment: a throwaway secret, never the real one.
process.env.JWT_SECRET = 'test-secret-only-for-automated-tests-0123456789';
process.env.JWT_EXPIRES_IN = '15m';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';
