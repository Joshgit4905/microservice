// Creates rides-service/.env and web-app/.env from their .env.example files
// (only if they do not exist yet) and generates a random JWT_SECRET.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');

for (const dir of ['rides-service', 'web-app']) {
  const example = path.join(root, dir, '.env.example');
  const target = path.join(root, dir, '.env');
  if (fs.existsSync(target)) {
    console.log(`[setup] ${dir}/.env already exists, left unchanged`);
    continue;
  }
  let content = fs.readFileSync(example, 'utf8');
  if (dir === 'rides-service') {
    const secret = crypto.randomBytes(48).toString('hex');
    content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
  }
  fs.writeFileSync(target, content);
  console.log(`[setup] created ${dir}/.env`);
}
console.log('[setup] done. Next: npm start');
