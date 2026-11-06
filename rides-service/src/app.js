const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/auth');
const ridesRoutes = require('./routes/rides');
const bookingsRoutes = require('./routes/bookings');
const weather = require('./services/weather');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

/**
 * Builds the Express app. Dependencies can be injected (tests replace the weather client).
 */
function createApp({ getForecast = weather.getForecast } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'campusride-rides-service', time: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/rides', ridesRoutes({ getForecast }));
  app.use('/api/v1/bookings', bookingsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
