const fs = require('fs');
const path = require('path');

// ── Minimal .env parser (no dotenv dependency) ─────────────────────────────
// Supports `KEY=value`, `KEY="value"`, `KEY='value'`, comments via `#`, blank
// lines, and trailing comments after unquoted values. Doesn't expand $vars.
function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      const hash = val.indexOf(' #');
      if (hash >= 0) val = val.slice(0, hash).trim();
    }
    out[key] = val;
  }
  return out;
}

function loadEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return parseEnv(text);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

// Walk up from cwd to filesystem root looking for `.env`.
function findEnvFile(startDir) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

function loadConfig({ envFile } = {}) {
  const fileEnv = envFile
    ? loadEnvFile(path.resolve(envFile))
    : (findEnvFile(process.cwd()) ? loadEnvFile(findEnvFile(process.cwd())) : {});

  const merged = { ...fileEnv, ...process.env };

  let baseUrl = merged.MD_BROWSE_URL || 'http://localhost/api';
  baseUrl = baseUrl.replace(/\/+$/, '');
  if (!/\/api$/.test(baseUrl)) {
    // Allow MD_BROWSE_URL=https://md.example.com → append /api
    baseUrl = `${baseUrl}/api`;
  }

  return {
    token: merged.MD_BROWSE_TOKEN || '',
    baseUrl,
    envFilePath: envFile || findEnvFile(process.cwd())
  };
}

module.exports = { loadConfig, parseEnv };
