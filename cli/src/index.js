const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { loadConfig, writeAuthFile, clearAuthFile, normalizeBaseUrl, AUTH_FILE } = require('./config');
const { buildClient, ApiError } = require('./api');
const { parseArgs } = require('./args');

const VERSION = require('../package.json').version;

const HELP = `md_cli — command-line client for md-browse

Usage:
  md_cli <command> [options]

Commands:
  list                       List documents
  search <query>             Full-text search
  get <id>                   Fetch a document (raw markdown by default)
  upload <file>              Upload a .md file
  update <id>                Update a document's metadata or content
  delete <id>                Soft-delete a document
  versions <id>              List version history
  rollback <id>              Roll back to a prior version (requires --version)
  download <id>              Download a single document
  download-batch <ids>       Download many docs as a zip (comma-separated ids)
  share <subcommand>         Manage public share links (create / list / delete / open)
  login                      Log in with username/password (mints a CLI token)
  logout                     Forget the saved token
  whoami                     Show which token/url is in use
  help [command]             Show help for a command
  version                    Print CLI version

Global options:
  --env-file <path>          Load env from a specific file (default: walk up from cwd)
  --token <t>                Override MD_BROWSE_TOKEN
  --url <baseurl>            Override MD_BROWSE_URL (e.g. https://md.example.com)
  --json                     Print raw JSON output where applicable
  -h, --help                 Show help

Configuration via .env (in cwd or any parent directory):
  MD_BROWSE_TOKEN=agt_...    Required. Create at /tokens on your md-browse site.
  MD_BROWSE_URL=https://...  Optional. Defaults to http://localhost/api.

Run \`md_cli help <command>\` for detailed usage.
`;

const COMMAND_HELP = {
  list: `md_cli list [options]

Options:
  --tag <tag>            Filter by tag
  --project <name>       Filter by project
  --folder <id>          Filter by folder id (or 'root')
  --q <query>            Free-text filter on title/description/tags
  --page <n>             Page number (default 1)
  --page-size <n>        Items per page (default 20, max 100)
  --sort-by <field>      updated_at | created_at | title (default updated_at)
  --sort-order <dir>     asc | desc (default desc)
  --json                 Print full JSON response
`,
  search: `md_cli search <query> [options]

Options:
  --page <n>             Page number
  --page-size <n>        Items per page
  --json                 Print full JSON response
`,
  get: `md_cli get <id> [options]

Options:
  -o, --output <file>    Write content to file instead of stdout
  --rendered             Print rendered HTML (default: raw markdown)
  --json                 Print full document metadata JSON
`,
  upload: `md_cli upload <file> [options]

Options:
  --folder <id>          Folder id to place the doc in
  --tags a,b,c           Comma-separated tags
  --description <text>   Document description
  --category <name>      Document category
  --project <name>       Project name
  --visibility <level>   public | team | private
  --json                 Print full JSON response

Token must include scope documents:write.
`,
  update: `md_cli update <id> [options]

At least one of:
  --title <text>             Set title
  --description <text>       Set description
  --content-file <path>      Replace content from file
  --content <text>           Replace content inline (small bodies)
  --change-note <text>       Note attached to the new version (when content changes)
  --tags a,b,c               Replace tags
  --category <name>          Set category
  --project <name>           Set project
  --visibility <level>       public | team | private
  --folder <id>              Move to folder

Token must include scope documents:write.
`,
  delete: `md_cli delete <id>

Soft-deletes the document. Token must include scope documents:write.
`,
  versions: `md_cli versions <id> [--json]

Lists version history (newest first).
`,
  rollback: `md_cli rollback <id> --version <n> [--note <text>]

Rolls back to the given version, creating a new version on top.
Token must include scope documents:write.
`,
  download: `md_cli download <id> [options]

Options:
  -o, --output <file>    Output filename (default: derived from doc title)
`,
  'download-batch': `md_cli download-batch <id1,id2,id3> [options]

Options:
  -o, --output <file>    Output zip path (default: documents.zip)
`,
  whoami: `md_cli whoami

Prints the configured base URL, env file path, saved auth path, and which
source the active token came from (flag / env / env-file / saved).
`,
  login: `md_cli login [options]

Logs in with your md-browse username/password and saves a CLI token to
~/.md-browse/auth.json (mode 0600). Under the hood: POST /api/auth/login
to get a session JWT, then POST /api/v1/agents/tokens to mint a long-lived
agent token. Existing commands keep working using that token.

Options:
  --username <name>      Login username (otherwise prompted)
  --password <pw>        Login password (otherwise prompted, hidden)
  --url <baseurl>        Base URL (defaults to MD_BROWSE_URL or the saved
                         one). Accepts http(s)://host or http(s)://host/api
                         — the /api suffix is normalized.
  --name <text>          Name for the minted token (default:
                         "md_cli@<hostname> YYYY-MM-DD")
  --scopes a,b,c         Comma-separated scopes (default: all standard).
                         Valid: documents:read, documents:write,
                         versions:read, search:read, audit:read

Already have an agent token? Skip the username/password flow:
  --token <agt_…>        Save this token directly (validated against
                         /v1/documents unless --no-validate is given)
  --no-validate          Skip the validation request when using --token

Each login mints a new agent token. Manage or revoke old ones at /tokens
on your md-browse site.

Token resolution priority (highest first):
  1. --token flag (on any command)
  2. MD_BROWSE_TOKEN env var
  3. .env file (cwd or any parent)
  4. ~/.md-browse/auth.json (saved by this command)

So .env still wins over a saved login — the saved file is a fallback.
`,
  logout: `md_cli logout

Removes ~/.md-browse/auth.json. Does not touch any .env files.
`,
  share: `md_cli share <subcommand>

Subcommands:
  create <doc-id> [--code <access-code>]   Create a public share link
  list [doc-id]                            List share links — for one doc, or all of yours
  delete <share-id>                        Revoke a share link
  open <token> [--code <access-code>]      Fetch a shared doc (no auth needed)

Notes:
  - The printed share URL is derived from MD_BROWSE_URL (strips the /api suffix).
    Override with --site-url <https://md.example.com> if you need a different one.
  - 'create' and 'delete' need scope documents:write; 'list' needs documents:read.
  - 'open' makes a public, unauthenticated call — no MD_BROWSE_TOKEN required.
`
};

function printJson(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); }
function out(s) { process.stdout.write(s + '\n'); }

function buildContext(flags) {
  const cfg = loadConfig({ envFile: flags['env-file'] });
  if (flags.token) cfg.token = flags.token;
  if (flags.url) {
    let u = String(flags.url).replace(/\/+$/, '');
    if (!/\/api$/.test(u)) u = `${u}/api`;
    cfg.baseUrl = u;
  }
  return { cfg, api: buildClient(cfg) };
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdList(rest) {
  const f = parseArgs(rest, { boolFlags: ['json'] });
  const { api } = buildContext(f);
  const res = await api.listDocuments({
    tag: f.tag,
    project: f.project,
    folder_id: f.folder,
    q: f.q,
    page: f.page,
    page_size: f['page-size'],
    sort_by: f['sort-by'],
    sort_order: f['sort-order']
  });
  if (f.json) return printJson(res);
  const { data = [], pagination } = res;
  if (!data.length) { out('(no documents)'); return; }
  for (const d of data) {
    const tags = (d.tags || []).join(',');
    out(`${d.id}  ${d.title || '(untitled)'}${tags ? `  [${tags}]` : ''}  v${d.latest_version}  ${d.updated_at || ''}`);
  }
  if (pagination) out(`\n— page ${pagination.page}/${Math.max(1, Math.ceil(pagination.total / pagination.page_size))} (${pagination.total} total) —`);
}

async function cmdSearch(rest) {
  const f = parseArgs(rest, { boolFlags: ['json'] });
  const q = f._[0];
  if (!q) throw new Error('search requires a query: md_cli search <query>');
  const { api } = buildContext(f);
  const res = await api.searchDocuments(q, { page: f.page, page_size: f['page-size'] });
  if (f.json) return printJson(res);
  const { data = [], pagination } = res;
  if (!data.length) { out('(no matches)'); return; }
  for (const d of data) {
    out(`${d.id}  ${d.title || '(untitled)'}`);
    if (d.snippet) out(`    ${d.snippet}`);
  }
  if (pagination) out(`\n— ${pagination.total} match${pagination.total === 1 ? '' : 'es'} —`);
}

async function cmdGet(rest) {
  const f = parseArgs(rest, { boolFlags: ['json', 'rendered'], aliases: { o: 'output' } });
  const id = f._[0];
  if (!id) throw new Error('get requires a document id: md_cli get <id>');
  const { api } = buildContext(f);
  const res = await api.getDocument(id, {
    include_raw: f.rendered ? undefined : 'true',
    include_rendered: f.rendered ? 'true' : undefined
  });
  if (f.json) return printJson(res);
  const body = f.rendered ? (res.content_html || '') : (res.content_md || '');
  if (f.output) {
    fs.writeFileSync(path.resolve(f.output), body);
    out(`wrote ${body.length} bytes to ${f.output}`);
  } else {
    process.stdout.write(body);
    if (!body.endsWith('\n')) process.stdout.write('\n');
  }
}

async function cmdUpload(rest) {
  const f = parseArgs(rest, { boolFlags: ['json'] });
  const file = f._[0];
  if (!file) throw new Error('upload requires a file path: md_cli upload <file>');
  if (!fs.existsSync(file)) throw new Error(`file not found: ${file}`);
  const { api } = buildContext(f);
  const res = await api.uploadDocument(file, {
    folder_id: f.folder,
    tags: f.tags,
    description: f.description,
    category: f.category,
    project: f.project,
    visibility: f.visibility
  });
  if (f.json) return printJson(res);
  const doc = (res.documents && res.documents[0]) || res;
  out(`uploaded ${doc.id}  ${doc.title || ''}`);
}

async function cmdUpdate(rest) {
  const f = parseArgs(rest, { boolFlags: ['json'] });
  const id = f._[0];
  if (!id) throw new Error('update requires an id: md_cli update <id>');
  const body = {};
  if (f.title !== undefined) body.title = f.title;
  if (f.description !== undefined) body.description = f.description;
  if (f.category !== undefined) body.category = f.category;
  if (f.project !== undefined) body.project = f.project;
  if (f.visibility !== undefined) body.visibility = f.visibility;
  if (f.folder !== undefined) body.folder_id = f.folder;
  if (f.tags !== undefined) body.tags = String(f.tags).split(',').map(s => s.trim()).filter(Boolean);
  if (f['change-note'] !== undefined) body.change_note = f['change-note'];
  if (f['content-file']) body.content_md = fs.readFileSync(path.resolve(f['content-file']), 'utf8');
  else if (f.content !== undefined) body.content_md = f.content;
  if (Object.keys(body).length === 0) throw new Error('update needs at least one field; see `md_cli help update`');

  const { api } = buildContext(f);
  const res = await api.updateDocument(id, body);
  if (f.json) return printJson(res);
  out(`updated ${res.id}  v${res.latest_version}`);
}

async function cmdDelete(rest) {
  const f = parseArgs(rest, { boolFlags: ['yes'] });
  const id = f._[0];
  if (!id) throw new Error('delete requires an id: md_cli delete <id>');
  const { api } = buildContext(f);
  await api.deleteDocument(id);
  out(`deleted ${id}`);
}

async function cmdVersions(rest) {
  const f = parseArgs(rest, { boolFlags: ['json'] });
  const id = f._[0];
  if (!id) throw new Error('versions requires an id: md_cli versions <id>');
  const { api } = buildContext(f);
  const res = await api.listVersions(id);
  if (f.json) return printJson(res);
  const versions = (res.versions || []).slice().sort((a, b) => b.version_number - a.version_number);
  if (!versions.length) { out('(no versions)'); return; }
  for (const v of versions) {
    out(`v${v.version_number}  ${v.created_at}  ${v.created_by || ''}  ${v.change_note || ''}`);
  }
}

async function cmdRollback(rest) {
  const f = parseArgs(rest, { boolFlags: ['json'] });
  const id = f._[0];
  if (!id) throw new Error('rollback requires an id: md_cli rollback <id> --version <n>');
  const target = parseInt(f.version, 10);
  if (!target) throw new Error('rollback requires --version <n>');
  const { api } = buildContext(f);
  const res = await api.rollbackDocument(id, target, f.note);
  if (f.json) return printJson(res);
  out(`rolled back ${id} to v${target} (now v${res.latest_version})`);
}

async function cmdDownload(rest) {
  const f = parseArgs(rest, { aliases: { o: 'output' } });
  const id = f._[0];
  if (!id) throw new Error('download requires an id: md_cli download <id>');
  const { api } = buildContext(f);
  const { buffer, filename } = await api.downloadDocument(id);
  const outPath = path.resolve(f.output || filename || `${id}.md`);
  fs.writeFileSync(outPath, buffer);
  out(`wrote ${buffer.length} bytes to ${outPath}`);
}

async function cmdDownloadBatch(rest) {
  const f = parseArgs(rest, { aliases: { o: 'output' } });
  const idsArg = f._[0];
  if (!idsArg) throw new Error('download-batch requires comma-separated ids: md_cli download-batch <id1,id2,...>');
  const ids = idsArg.split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) throw new Error('no valid ids supplied');
  const { api } = buildContext(f);
  const { buffer } = await api.batchDownload(ids);
  const outPath = path.resolve(f.output || 'documents.zip');
  fs.writeFileSync(outPath, buffer);
  out(`wrote ${buffer.length} bytes to ${outPath} (${ids.length} document${ids.length === 1 ? '' : 's'})`);
}

// Derive the public site URL from baseUrl (strips trailing `/api`).
function siteUrlFromBase(baseUrl, override) {
  if (override) return String(override).replace(/\/+$/, '');
  return baseUrl.replace(/\/api$/, '');
}

async function cmdShare(rest) {
  const sub = rest[0];
  if (!sub) throw new Error('share requires a subcommand: create | list | delete | open');
  const subRest = rest.slice(1);

  if (sub === 'create') {
    const f = parseArgs(subRest, { boolFlags: ['json'] });
    const docId = f._[0];
    if (!docId) throw new Error('share create requires a document id');
    const { cfg, api } = buildContext(f);
    const res = await api.createShare(docId, f.code);
    if (f.json) return printJson(res);
    const site = siteUrlFromBase(cfg.baseUrl, f['site-url']);
    out(`share id:  ${res.id}`);
    out(`token:     ${res.token}`);
    out(`url:       ${site}/share/${res.token}`);
    if (res.has_access_code) out(`note:      access code required to view`);
    return;
  }

  if (sub === 'list') {
    const f = parseArgs(subRest, { boolFlags: ['json'] });
    const docId = f._[0];
    const { cfg, api } = buildContext(f);
    let shares;
    if (docId) {
      shares = await api.listShares(docId);
    } else {
      const res = await api.listAllShares();
      shares = res.data || res;
    }
    if (f.json) return printJson(docId ? shares : { data: shares });
    if (!shares.length) {
      out(docId ? '(no share links for this document)' : '(no share links)');
      return;
    }
    const site = siteUrlFromBase(cfg.baseUrl, f['site-url']);
    for (const s of shares) {
      const lock = s.has_access_code ? ' 🔒' : '';
      const dead = s.document_deleted ? ' (doc deleted)' : '';
      const title = s.document_title ? `  "${s.document_title}"` : '';
      out(`${s.id}${title}${dead}`);
      out(`  url:     ${site}/share/${s.token}${lock}`);
      out(`  doc:     ${s.document_id || '?'}    created: ${s.created_at || '?'}`);
    }
    return;
  }

  if (sub === 'delete' || sub === 'rm' || sub === 'revoke') {
    const f = parseArgs(subRest);
    const shareId = f._[0];
    if (!shareId) throw new Error('share delete requires a share id');
    const { api } = buildContext(f);
    await api.deleteShare(shareId);
    out(`revoked share ${shareId}`);
    return;
  }

  if (sub === 'open') {
    const f = parseArgs(subRest, { boolFlags: ['json', 'rendered'], aliases: { o: 'output' } });
    const token = f._[0];
    if (!token) throw new Error('share open requires a share token');
    const { api } = buildContext(f);
    const res = await api.openShare(token, f.code);
    if (f.json) return printJson(res);
    const body = f.rendered ? (res.content_html || '') : (res.content_md || '');
    if (f.output) {
      const fs = require('fs');
      fs.writeFileSync(require('path').resolve(f.output), body);
      out(`wrote ${body.length} bytes to ${f.output}`);
    } else {
      process.stdout.write(body);
      if (!body.endsWith('\n')) process.stdout.write('\n');
    }
    return;
  }

  throw new Error(`unknown share subcommand: ${sub}\nrun \`md_cli help share\` for usage.`);
}

async function cmdWhoami(rest) {
  const f = parseArgs(rest);
  const { cfg } = buildContext(f);
  // buildContext applies --token / --url overrides; reflect that in source.
  let source = cfg.tokenSource || 'none';
  if (f.token) source = 'flag';
  out(`base url:   ${cfg.baseUrl}`);
  out(`env file:   ${cfg.envFilePath || '(none found)'}`);
  out(`auth file:  ${AUTH_FILE}`);
  out(`token src:  ${source}`);
  out(`token:      ${cfg.token ? cfg.token.slice(0, 8) + '…' : '(not set)'}`);
}

// Visible-input line prompt — used for usernames, etc. Relies on the
// terminal's cooked-mode echo (we don't toggle raw mode here).
function promptLine(question) {
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let buf = '';
      stdin.on('data', (chunk) => { buf += chunk.toString(); });
      stdin.on('end', () => resolve((buf.split(/\r?\n/)[0] || '')));
      stdin.on('error', reject);
      return;
    }
    stdin.resume();
    let buf = '';
    const onData = (data) => {
      const s = data.toString('utf8');
      const nl = s.indexOf('\n');
      if (nl >= 0) {
        buf += s.slice(0, nl).replace(/\r$/, '');
        stdin.pause();
        stdin.removeListener('data', onData);
        resolve(buf);
        return;
      }
      buf += s;
    };
    stdin.on('data', onData);
  });
}

// Hidden-input prompt — used for tokens.
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // No TTY (e.g., piped). Fall back to one-shot read.
      let buf = '';
      stdin.on('data', (chunk) => { buf += chunk.toString(); });
      stdin.on('end', () => resolve(buf.replace(/[\r\n]+$/, '')));
      stdin.on('error', reject);
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    let buf = '';
    const onData = (data) => {
      const s = data.toString('utf8');
      for (const ch of s) {
        const code = ch.charCodeAt(0);
        if (ch === '\n' || ch === '\r') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buf);
          return;
        }
        if (code === 3) { // Ctrl-C
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          reject(new Error('aborted'));
          return;
        }
        if (code === 8 || code === 127) { // Backspace
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      }
    };
    stdin.on('data', onData);
  });
}

function warnIfShadowed(cfgPre) {
  if (process.env.MD_BROWSE_TOKEN) {
    process.stderr.write(
      `\nwarning: MD_BROWSE_TOKEN is set in your shell environment — it takes\n`
      + `         priority over the saved token. Unset it (\`unset MD_BROWSE_TOKEN\`)\n`
      + `         or the saved token won't be used.\n`
    );
  } else if (cfgPre.tokenSource === 'env-file' && cfgPre.envFilePath) {
    process.stderr.write(
      `\nwarning: MD_BROWSE_TOKEN is set in ${cfgPre.envFilePath} — it takes priority\n`
      + `         over the saved token. Remove it from .env or the saved token\n`
      + `         won't be used. Run \`md_cli whoami\` to see which is active.\n`
    );
  }
}

const DEFAULT_TOKEN_SCOPES = [
  'documents:read', 'documents:write', 'versions:read', 'search:read', 'audit:read'
];

async function cmdLogin(rest) {
  const f = parseArgs(rest, { boolFlags: ['no-validate'] });
  const cfgPre = loadConfig({ envFile: f['env-file'] });
  const baseUrl = normalizeBaseUrl(f.url || cfgPre.baseUrl);

  // ── Path 1: --token escape hatch (save an existing agt_ token directly).
  if (f.token) {
    const token = f.token;
    if (!f['no-validate']) {
      const api = buildClient({ token, baseUrl });
      try {
        await api.listDocuments({ page_size: 1 });
      } catch (err) {
        const msg = err instanceof ApiError ? `${err.message} (HTTP ${err.status})` : (err.message || String(err));
        throw new Error(`token validation failed: ${msg}`);
      }
    }
    writeAuthFile({ token, baseUrl, saved_at: new Date().toISOString() });
    out(`saved to  ${AUTH_FILE}`);
    out(`base url: ${baseUrl}`);
    out(`token:    ${token.slice(0, 8)}…`);
    warnIfShadowed(cfgPre);
    return;
  }

  // ── Path 2 (default): username/password → mint an agent token.
  let username = f.username || f.user;
  if (!username) username = (await promptLine('Username: ')).trim();
  if (!username) throw new Error('login requires a username (use --username or type at the prompt)');

  // Don't trim password — leading/trailing whitespace may be intentional.
  const password = f.password !== undefined ? f.password : await promptHidden('Password: ');
  if (!password) throw new Error('password is required');

  // 1) Hit /api/auth/login for a session JWT.
  let loginRes;
  try {
    loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  } catch (err) {
    throw new Error(`could not reach ${baseUrl}/auth/login: ${err.message}`);
  }
  if (!loginRes.ok) {
    const text = await loginRes.text().catch(() => '');
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch {}
    throw new Error(`login failed (HTTP ${loginRes.status}): ${detail || 'check username/password'}`);
  }
  const loginBody = await loginRes.json();
  const jwt = loginBody.token;
  if (!jwt) throw new Error('login response missing token');

  // 2) Mint a long-lived agent token using the JWT.
  const tokenName = f.name || `md_cli@${os.hostname()} ${new Date().toISOString().slice(0, 10)}`;
  const scopes = f.scopes
    ? String(f.scopes).split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_TOKEN_SCOPES;

  let mintRes;
  try {
    mintRes = await fetch(`${baseUrl}/v1/agents/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ name: tokenName, scopes })
    });
  } catch (err) {
    throw new Error(`could not reach ${baseUrl}/v1/agents/tokens: ${err.message}`);
  }
  if (!mintRes.ok) {
    const text = await mintRes.text().catch(() => '');
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch {}
    throw new Error(`failed to mint CLI token (HTTP ${mintRes.status}): ${detail}`);
  }
  const minted = await mintRes.json();
  const secretToken = minted.secret_token;
  if (!secretToken) throw new Error('token creation response missing secret_token');

  writeAuthFile({
    token: secretToken,
    baseUrl,
    username,
    token_name: tokenName,
    saved_at: new Date().toISOString()
  });
  out(`logged in as ${username}`);
  out(`saved to  ${AUTH_FILE}`);
  out(`base url: ${baseUrl}`);
  out(`token:    ${secretToken.slice(0, 8)}…  (name: ${tokenName})`);
  out(`scopes:   ${scopes.join(', ')}`);
  warnIfShadowed(cfgPre);
}

async function cmdLogout() {
  clearAuthFile();
  out(`removed ${AUTH_FILE}`);
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

const COMMANDS = {
  list: cmdList,
  search: cmdSearch,
  get: cmdGet,
  upload: cmdUpload,
  update: cmdUpdate,
  delete: cmdDelete,
  rm: cmdDelete,
  versions: cmdVersions,
  rollback: cmdRollback,
  download: cmdDownload,
  'download-batch': cmdDownloadBatch,
  share: cmdShare,
  login: cmdLogin,
  logout: cmdLogout,
  whoami: cmdWhoami
};

async function run(argv) {
  if (!argv.length || argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
    if (argv[1] && COMMAND_HELP[argv[1]]) {
      out(COMMAND_HELP[argv[1]]);
    } else {
      out(HELP);
    }
    return;
  }
  if (argv[0] === '--version' || argv[0] === '-v' || argv[0] === 'version') {
    out(`md_cli ${VERSION}`);
    return;
  }

  const [cmd, ...rest] = argv;
  const handler = COMMANDS[cmd];
  if (!handler) {
    throw new Error(`unknown command: ${cmd}\nrun \`md_cli help\` for usage.`);
  }

  // Show per-command help if -h/--help is present after the command.
  if (rest.includes('-h') || rest.includes('--help')) {
    const helpText = COMMAND_HELP[cmd] || HELP;
    out(helpText);
    return;
  }

  try {
    await handler(rest);
  } catch (err) {
    if (err instanceof ApiError) {
      const reqId = err.requestId ? ` (request_id=${err.requestId})` : '';
      throw new Error(`${err.message}${reqId}`);
    }
    throw err;
  }
}

module.exports = { run };
