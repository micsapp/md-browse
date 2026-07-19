// PM2 ecosystem for md-browse backend. Secrets live in /etc/md-browse/env,
// not in this file, so the same env file can be replicated to every mirror.
const fs = require('fs');

const env = {};
try {
  for (const line of fs.readFileSync('/etc/md-browse/env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
} catch (e) {
  console.error('WARNING: /etc/md-browse/env not readable:', e.message);
}

module.exports = {
  apps: [
    {
      name: 'md-browse-api',
      script: '/home/mli/md-browse/backend/server.js',
      cwd: '/home/mli/md-browse/backend',
      env,
      max_memory_restart: '300M',
      autorestart: true,
    },
  ],
};
