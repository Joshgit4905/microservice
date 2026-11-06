// Starts the rides microservice (port 4000) and the web app (port 3000) together. Ctrl+C stops both.
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const procs = [
  { name: 'rides-service', cwd: path.join(root, 'rides-service'), entry: 'src/server.js' },
  { name: 'web-app', cwd: path.join(root, 'web-app'), entry: 'server.js' },
].map(({ name, cwd, entry }) => {
  const child = spawn(process.execPath, [entry], { cwd, stdio: 'inherit' });
  child.on('exit', (code) => {
    if (code) console.error(`[${name}] exited with code ${code}`);
    procs.forEach((p) => p.kill());
    process.exit(code || 0);
  });
  return child;
});

process.on('SIGINT', () => procs.forEach((p) => p.kill()));
