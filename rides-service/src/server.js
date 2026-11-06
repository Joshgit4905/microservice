const config = require('./config');
const { createApp } = require('./app');

const app = createApp();

app.listen(config.port, () => {
  console.log(`CampusRide rides-service listening on http://localhost:${config.port}`);
  console.log(`Health check: http://localhost:${config.port}/api/v1/health`);
});
