const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');
const crypto = require('crypto');
const { marked } = require('marked');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const DATA_DIR = path.join(__dirname, 'data');
const DOCS_DIR = path.join(DATA_DIR, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const META_FILE = path.join(DATA_DIR, 'metadata.json');
const VERSIONS_FILE = path.join(DATA_DIR, 'versions.json');
const AGENT_TOKENS_FILE = path.join(DATA_DIR, 'agent_tokens.json');
const AUDIT_LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');
const IDEMPOTENCY_FILE = path.join(DATA_DIR, 'idempotency_keys.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json');
const SHARES_FILE = path.join(DATA_DIR, 'shares.json');

app.use(cors());
app.use(express.json());

// ── Request ID middleware ────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.requestId = `req_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// ── Multer storage ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCS_DIR),
  filename: (req, file, cb) => {
    const base = sanitizeFilename(path.basename(file.originalname, path.extname(file.originalname)));
    cb(null, `${base}_${uuidv4()}.md`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.md', '.markdown'].includes(ext)) cb(null, true);
    else cb(apiError('validation_error', 'Only markdown files allowed', 'Upload a .md or .markdown file'), false);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function readJson(file, defaultVal) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch { return defaultVal !== undefined ? defaultVal : (Array.isArray(defaultVal) ? [] : {}); }
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'document';
}

async function uniqueDirName(name, parentDirName) {
  const base = sanitizeFilename(name);
  let leaf = base;
  let i = 2;
  while (true) {
    const full = parentDirName ? `${parentDirName}/${leaf}` : leaf;
    try { await fs.access(path.join(DOCS_DIR, full)); leaf = `${base}_${i++}`; }
    catch { break; }
  }
  return parentDirName ? `${parentDirName}/${leaf}` : leaf;
}

function tokenEstimate(text) {
  return Math.ceil(text.length / 4);
}

function apiError(code, message, hint) {
  const err = new Error(message);
  err.apiCode = code;
  err.hint = hint;
  return err;
}

function sendError(res, status, code, message, hint, requestId) {
  return res.status(status).json({
    error: { code, message, ...(hint ? { hint } : {}), request_id: requestId }
  });
}

function renderMarkdown(md) {
  return marked(md);
}

async function appendAuditLog(actorType, actorId, action, resourceType, resourceId, metadata) {
  const logs = await readJson(AUDIT_LOGS_FILE, []);
  logs.push({
    id: uuidv4(),
    actor_type: actorType,
    actor_id: actorId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata: metadata || {},
    created_at: new Date().toISOString()
  });
  await writeJson(AUDIT_LOGS_FILE, logs);
}

// ── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return sendError(res, 401, 'unauthorized', 'No token provided', 'Include Authorization: Bearer <token>', req.requestId);
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    req.actorType = 'user';
    req.actorId = req.user.username;
    next();
  } catch {
    sendError(res, 401, 'unauthorized', 'Invalid or expired token', 'Log in again to get a new token', req.requestId);
  }
}

// Agent token middleware (supports X-Agent-Token header)
async function agentTokenMiddleware(req, res, next) {
  const agentToken = req.headers['x-agent-token'];
  if (agentToken) {
    const tokens = await readJson(AGENT_TOKENS_FILE, {});
    const prefix = agentToken.slice(0, 8);
    const tokenData = Object.values(tokens).find(t => t.token_prefix === prefix);
    if (!tokenData) {
      return sendError(res, 401, 'unauthorized', 'Invalid agent token', 'Use a valid X-Agent-Token', req.requestId);
    }
    const tokenHash = sha256(agentToken);
    if (tokenHash !== tokenData.token_hash) {
      return sendError(res, 401, 'unauthorized', 'Invalid agent token', null, req.requestId);
    }
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return sendError(res, 401, 'unauthorized', 'Agent token expired', 'Create a new token', req.requestId);
    }
    // Update last_used_at
    const allTokens = await readJson(AGENT_TOKENS_FILE, {});
    allTokens[tokenData.id].last_used_at = new Date().toISOString();
    await writeJson(AGENT_TOKENS_FILE, allTokens);

    req.agent = tokenData;
    req.agentScopes = tokenData.scopes;
    req.actorType = 'agent';
    req.actorId = tokenData.id;
    return next();
  }
  // Fall back to JWT
  authMiddleware(req, res, next);
}

function requireScope(scope) {
  return (req, res, next) => {
    if (req.actorType === 'user') return next(); // users have all scopes
    if (!req.agentScopes?.includes(scope)) {
      return sendError(res, 403, 'forbidden', `Agent token missing scope: ${scope}`, null, req.requestId);
    }
    next();
  };
}

// Admin middleware — requires admin role in JWT
function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, 403, 'forbidden', 'Admin access required', null, req.requestId);
  }
  next();
}

// ── Idempotency ──────────────────────────────────────────────────────────────
async function checkIdempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();
  const keys = await readJson(IDEMPOTENCY_FILE, {});
  if (keys[key]) {
    return res.status(200).json(keys[key].response);
  }
  req.idempotencyKey = key;
  next();
}

async function saveIdempotencyResult(key, response) {
  if (!key) return;
  const keys = await readJson(IDEMPOTENCY_FILE, {});
  keys[key] = { response, created_at: new Date().toISOString() };
  await writeJson(IDEMPOTENCY_FILE, keys);
}

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Setup endpoint (creates first admin, 409 if users already exist) ──────────
app.post('/api/setup', async (req, res) => {
  const { username = 'admin', password } = req.body;
  if (!password) {
    return sendError(res, 400, 'validation_error', 'Password is required', null, req.requestId);
  }
  const users = await readJson(USERS_FILE, {});
  if (Object.keys(users).length > 0) {
    return sendError(res, 409, 'conflict', 'Setup already completed', 'Users already exist', req.requestId);
  }
  users[username] = {
    password: await bcrypt.hash(password, 10),
    role: 'admin',
    created_at: new Date().toISOString()
  };
  await writeJson(USERS_FILE, users);
  await appendAuditLog('system', 'setup', 'user.create', 'user', username, { role: 'admin' });
  const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, username, role: 'admin' });
});

// ── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return sendError(res, 400, 'validation_error', 'Username and password required', null, req.requestId);
  }
  // Check if registration is enabled
  const settings = await readJson(SETTINGS_FILE, { registration_enabled: true });
  if (!settings.registration_enabled) {
    return sendError(res, 403, 'forbidden', 'Registration is currently disabled', 'Contact an administrator', req.requestId);
  }
  const users = await readJson(USERS_FILE, {});
  if (users[username]) {
    return sendError(res, 409, 'conflict', 'User already exists', null, req.requestId);
  }
  const role = 'viewer';
  users[username] = { password: await bcrypt.hash(password, 10), role, created_at: new Date().toISOString() };
  await writeJson(USERS_FILE, users);
  const token = jwt.sign({ username, role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, role });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await readJson(USERS_FILE, {});
  if (!users[username] || !(await bcrypt.compare(password, users[username].password))) {
    return sendError(res, 401, 'unauthorized', 'Invalid credentials', 'Check your username and password', req.requestId);
  }
  const role = users[username].role || 'viewer';
  const token = jwt.sign({ username, role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, role });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role || 'viewer' });
});

// ── Document helpers ─────────────────────────────────────────────────────────
function buildDocSummary(id, meta) {
  return {
    id,
    title: meta.title || '',
    slug: meta.slug || slugify(meta.title || id),
    description: meta.description || '',
    category: meta.category || 'uncategorized',
    tags: meta.tags || [],
    project: meta.project || '',
    visibility: meta.visibility || 'team',
    latest_version: meta.latest_version || 1,
    checksum: meta.checksum || '',
    token_count_estimate: meta.token_count_estimate || 0,
    folder_id: meta.folder_id || null,
    created_by: meta.created_by || meta.author || '',
    created_at: meta.created_at || meta.createdAt || '',
    updated_at: meta.updated_at || meta.updatedAt || ''
  };
}

async function getDocContent(id, meta) {
  const filePath = meta?.file_path
    ? path.join(DOCS_DIR, meta.file_path)
    : path.join(DOCS_DIR, `${id}.md`);
  return fs.readFile(filePath, 'utf8');
}

// ── v1 Document routes ───────────────────────────────────────────────────────

// List documents
app.get('/api/v1/documents', agentTokenMiddleware, requireScope('documents:read'), async (req, res) => {
  try {
    const { tag, project, q, folder_id, sort_by = 'updated_at', sort_order = 'desc' } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const page_size = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20));

    const metadata = await readJson(META_FILE, {});
    let docs = Object.entries(metadata)
      .filter(([, meta]) => !meta.deleted_at)
      .map(([id, meta]) => buildDocSummary(id, meta));

    if (tag) docs = docs.filter(d => d.tags?.includes(tag));
    if (project) docs = docs.filter(d => d.project === project);
    if (folder_id !== undefined) {
      if (folder_id === 'root' || folder_id === '') {
        docs = docs.filter(d => !d.folder_id);
      } else {
        docs = docs.filter(d => d.folder_id === folder_id);
      }
    }
    if (q) {
      const lower = q.toLowerCase();
      docs = docs.filter(d =>
        d.title?.toLowerCase().includes(lower) ||
        d.description?.toLowerCase().includes(lower) ||
        d.tags?.some(t => t.toLowerCase().includes(lower))
      );
    }

    const sortField = { updated_at: 'updated_at', created_at: 'created_at', title: 'title' }[sort_by] || 'updated_at';
    docs.sort((a, b) => {
      const av = a[sortField] || '';
      const bv = b[sortField] || '';
      return sort_order === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    const total = docs.length;
    const data = docs.slice((page - 1) * page_size, page * page_size);
    res.json({ data, pagination: { page, page_size, total } });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Upload document
app.post('/api/v1/documents/upload', authMiddleware, checkIdempotency, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'validation_error', 'No file uploaded', 'Attach a .md file as form field "file"', req.requestId);
    }
    const id = path.basename(req.file.filename, '.md');
    const rawContent = await fs.readFile(req.file.path, 'utf8');
    const { data: frontmatter, content: body } = matter(rawContent);
    const checksum = sha256(rawContent);

    const metadata = await readJson(META_FILE, {});
    const now = new Date().toISOString();
    const title = frontmatter.title || req.file.originalname.replace(/\.(md|markdown)$/i, '');
    const tags = req.body.tags
      ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean)
      : (frontmatter.tags || []);

    // Validate folder_id if provided
    let folder_id = req.body.folder_id || null;
    let folderDirName = null;
    if (folder_id) {
      const folders = await readJson(FOLDERS_FILE, {});
      if (!folders[folder_id]) { folder_id = null; }
      else { folderDirName = folders[folder_id].dir_name || folder_id; }
    }

    // Move file into folder subdirectory if folder_id is set
    let file_path = req.file.filename;
    if (folder_id && folderDirName) {
      const destDir = path.join(DOCS_DIR, folderDirName);
      await fs.mkdir(destDir, { recursive: true });
      const destPath = path.join(destDir, req.file.filename);
      await fs.rename(req.file.path, destPath);
      file_path = `${folderDirName}/${req.file.filename}`;
    }

    metadata[id] = {
      title,
      slug: slugify(title),
      description: frontmatter.description || req.body.description || '',
      category: req.body.category || frontmatter.category || 'uncategorized',
      tags,
      project: req.body.project || frontmatter.project || '',
      visibility: req.body.visibility || 'team',
      folder_id,
      file_path,
      latest_version: 1,
      checksum,
      token_count_estimate: tokenEstimate(body),
      created_by: req.actorId,
      created_at: now,
      updated_at: now
    };
    await writeJson(META_FILE, metadata);

    // Save initial version
    const versions = await readJson(VERSIONS_FILE, {});
    versions[id] = [{
      id: uuidv4(),
      document_id: id,
      version_number: 1,
      content_md: rawContent,
      change_note: 'Initial upload',
      created_by: req.actorId,
      created_at: now,
      checksum
    }];
    await writeJson(VERSIONS_FILE, versions);

    await appendAuditLog('user', req.actorId, 'document.create', 'document', id, { title });

    const doc = { ...buildDocSummary(id, metadata[id]), content_md: body, content_html: renderMarkdown(body) };
    await saveIdempotencyResult(req.idempotencyKey, { documents: [doc] });
    res.status(201).json({ documents: [doc] });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Get document by ID
app.get('/api/v1/documents/:id', agentTokenMiddleware, requireScope('documents:read'), async (req, res) => {
  try {
    const { id } = req.params;
    const { include_raw = 'true', include_rendered = 'true' } = req.query;
    const metadata = await readJson(META_FILE, {});
    const meta = metadata[id];
    if (!meta || meta.deleted_at) {
      return sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
    }

    const rawContent = await getDocContent(id, meta);
    const { content: body } = matter(rawContent);

    res.setHeader('ETag', `"${meta.checksum}"`);

    const doc = buildDocSummary(id, meta);
    if (include_raw !== 'false') doc.content_md = rawContent;
    if (include_rendered !== 'false') doc.content_html = renderMarkdown(body);

    res.json(doc);
  } catch (err) {
    sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
  }
});

// Update document
app.put('/api/v1/documents/:id', agentTokenMiddleware, requireScope('documents:write'), checkIdempotency, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content_md, tags, project, visibility, change_note, description, category, folder_id } = req.body;
    const metadata = await readJson(META_FILE, {});
    const meta = metadata[id];
    if (!meta || meta.deleted_at) {
      return sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
    }

    // Validate folder_id if provided
    if (folder_id !== undefined && folder_id !== null) {
      const folders = await readJson(FOLDERS_FILE, {});
      if (!folders[folder_id]) {
        return sendError(res, 400, 'validation_error', 'Folder not found', null, req.requestId);
      }
    }

    const now = new Date().toISOString();
    let newContent = null;
    let checksum = meta.checksum;

    // Determine new file path (handle folder change)
    const currentFilePath = meta.file_path || `${id}.md`;
    const filename = path.basename(currentFilePath);
    const newFolderId = folder_id !== undefined ? folder_id : meta.folder_id;
    const allFolders = await readJson(FOLDERS_FILE, {});
    const newFolderDirName = newFolderId ? (allFolders[newFolderId]?.dir_name || newFolderId) : null;
    const newFilePath = newFolderDirName ? `${newFolderDirName}/${filename}` : filename;

    if (content_md !== undefined) {
      newContent = content_md;
      checksum = sha256(newContent);
      await fs.writeFile(path.join(DOCS_DIR, currentFilePath), newContent);
    }

    // Move file if folder changed
    if (folder_id !== undefined && folder_id !== meta.folder_id) {
      const oldFullPath = path.join(DOCS_DIR, currentFilePath);
      const newFullPath = path.join(DOCS_DIR, newFilePath);
      if (newFolderDirName) await fs.mkdir(path.dirname(newFullPath), { recursive: true });
      await fs.rename(oldFullPath, newFullPath);
    }

    // Save version before updating
    const versions = await readJson(VERSIONS_FILE, {});
    if (!versions[id]) versions[id] = [];
    const prevContent = newContent !== null
      ? (await getDocContent(id, meta).catch(() => ''))
      : null;

    const newVersionNumber = meta.latest_version + 1;
    if (content_md !== undefined) {
      // We already wrote new content, so we need to get old content from versions
      const lastVersion = versions[id][versions[id].length - 1];
      const oldContent = lastVersion?.content_md || '';
      versions[id].push({
        id: uuidv4(),
        document_id: id,
        version_number: newVersionNumber,
        content_md: content_md,
        change_note: change_note || '',
        created_by: req.actorId,
        created_at: now,
        checksum
      });
    }
    await writeJson(VERSIONS_FILE, versions);

    metadata[id] = {
      ...meta,
      title: title ?? meta.title,
      slug: title ? slugify(title) : meta.slug,
      description: description ?? meta.description,
      category: category ?? meta.category,
      tags: tags ?? meta.tags,
      project: project ?? meta.project,
      visibility: visibility ?? meta.visibility,
      folder_id: folder_id !== undefined ? folder_id : meta.folder_id,
      file_path: newFilePath,
      latest_version: content_md !== undefined ? newVersionNumber : meta.latest_version,
      checksum,
      token_count_estimate: content_md !== undefined ? tokenEstimate(content_md) : meta.token_count_estimate,
      updated_at: now
    };
    await writeJson(META_FILE, metadata);

    await appendAuditLog(req.actorType, req.actorId, 'document.update', 'document', id, { title: metadata[id].title });

    const updatedContent = content_md !== undefined ? content_md : await getDocContent(id, metadata[id]).then(raw => matter(raw).content).catch(() => '');
    const doc = {
      ...buildDocSummary(id, metadata[id]),
      content_md: updatedContent,
      content_html: renderMarkdown(updatedContent)
    };

    await saveIdempotencyResult(req.idempotencyKey, doc);
    res.json(doc);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Delete document (soft delete)
app.delete('/api/v1/documents/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const metadata = await readJson(META_FILE, {});
    if (!metadata[id] || metadata[id].deleted_at) {
      return sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
    }
    metadata[id].deleted_at = new Date().toISOString();
    await writeJson(META_FILE, metadata);
    await appendAuditLog('user', req.actorId, 'document.delete', 'document', id, {});
    res.status(204).send();
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// List versions
app.get('/api/v1/documents/:id/versions', agentTokenMiddleware, requireScope('versions:read'), async (req, res) => {
  try {
    const { id } = req.params;
    const metadata = await readJson(META_FILE, {});
    if (!metadata[id]) {
      return sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
    }
    const versions = await readJson(VERSIONS_FILE, {});
    const docVersions = (versions[id] || []).map(v => ({
      id: v.id,
      document_id: v.document_id,
      version_number: v.version_number,
      change_note: v.change_note || '',
      created_by: v.created_by,
      created_at: v.created_at,
      checksum: v.checksum
    }));
    res.json({ document_id: id, versions: docVersions });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Rollback
app.post('/api/v1/documents/:id/rollback', authMiddleware, checkIdempotency, async (req, res) => {
  try {
    const { id } = req.params;
    const { target_version, change_note } = req.body;
    if (!target_version) {
      return sendError(res, 400, 'validation_error', 'target_version is required', null, req.requestId);
    }
    const metadata = await readJson(META_FILE, {});
    const meta = metadata[id];
    if (!meta || meta.deleted_at) {
      return sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
    }

    const versions = await readJson(VERSIONS_FILE, {});
    const targetVer = (versions[id] || []).find(v => v.version_number === target_version);
    if (!targetVer) {
      return sendError(res, 400, 'validation_error', `Version ${target_version} not found`, null, req.requestId);
    }

    const now = new Date().toISOString();
    const newVersionNumber = meta.latest_version + 1;
    const newChecksum = sha256(targetVer.content_md);

    // Write file
    const filePath = path.join(DOCS_DIR, meta.file_path || `${id}.md`);
    await fs.writeFile(filePath, targetVer.content_md);

    // Add rollback version
    if (!versions[id]) versions[id] = [];
    versions[id].push({
      id: uuidv4(),
      document_id: id,
      version_number: newVersionNumber,
      content_md: targetVer.content_md,
      change_note: change_note || `Rollback to version ${target_version}`,
      created_by: req.actorId,
      created_at: now,
      checksum: newChecksum
    });
    await writeJson(VERSIONS_FILE, versions);

    metadata[id] = {
      ...meta,
      latest_version: newVersionNumber,
      checksum: newChecksum,
      updated_at: now
    };
    await writeJson(META_FILE, metadata);

    await appendAuditLog('user', req.actorId, 'document.rollback', 'document', id, { target_version, new_version: newVersionNumber });

    const { content: body } = matter(targetVer.content_md);
    const doc = {
      ...buildDocSummary(id, metadata[id]),
      content_md: targetVer.content_md,
      content_html: renderMarkdown(body)
    };

    await saveIdempotencyResult(req.idempotencyKey, doc);
    res.json(doc);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Chunks endpoint
app.get('/api/v1/documents/:id/chunks', agentTokenMiddleware, requireScope('documents:read'), async (req, res) => {
  try {
    const { id } = req.params;
    const max_tokens = Math.min(4096, Math.max(128, parseInt(req.query.max_tokens) || 1024));
    const metadata = await readJson(META_FILE, {});
    if (!metadata[id] || metadata[id].deleted_at) {
      return sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
    }

    const rawContent = await getDocContent(id, metadata[id]);
    const { content: body } = matter(rawContent);
    const lines = body.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentTokens = 0;
    let chunkIndex = 0;
    let startLine = 1;
    let headingPath = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

      if (headingMatch) {
        const level = headingMatch[1].length;
        const heading = headingMatch[2];
        headingPath = headingPath.slice(0, level - 1);
        headingPath[level - 1] = heading;
      }

      const lineTokens = tokenEstimate(line);

      if (currentTokens + lineTokens > max_tokens && currentChunk.length > 0) {
        const text = currentChunk.join('\n');
        chunks.push({
          index: chunkIndex++,
          heading_path: [...headingPath],
          text,
          token_count_estimate: tokenEstimate(text),
          start_line: startLine,
          end_line: i
        });
        currentChunk = [line];
        currentTokens = lineTokens;
        startLine = i + 1;
      } else {
        currentChunk.push(line);
        currentTokens += lineTokens;
      }
    }

    if (currentChunk.length > 0) {
      const text = currentChunk.join('\n');
      chunks.push({
        index: chunkIndex,
        heading_path: [...headingPath],
        text,
        token_count_estimate: tokenEstimate(text),
        start_line: startLine,
        end_line: lines.length
      });
    }

    res.json({ document_id: id, checksum: metadata[id].checksum, chunks });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Search
app.get('/api/v1/search', agentTokenMiddleware, requireScope('search:read'), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return sendError(res, 400, 'validation_error', 'Query parameter q is required', null, req.requestId);
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const page_size = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20));

    const metadata = await readJson(META_FILE, {});
    const lower = q.toLowerCase();
    const results = [];

    for (const [id, meta] of Object.entries(metadata)) {
      if (meta.deleted_at) continue;
      let matched = false;
      let snippet = '';

      if (meta.title?.toLowerCase().includes(lower)) {
        matched = true;
        snippet = meta.title;
      } else if (meta.tags?.some(t => t.toLowerCase().includes(lower))) {
        matched = true;
        snippet = meta.tags.join(', ');
      } else {
        try {
          const content = await getDocContent(id, meta);
          const contentLower = content.toLowerCase();
          if (contentLower.includes(lower)) {
            matched = true;
            const idx = contentLower.indexOf(lower);
            snippet = content.substring(Math.max(0, idx - 50), Math.min(content.length, idx + q.length + 50)).replace(/\n/g, ' ');
          }
        } catch {}
      }

      if (matched) {
        results.push({ ...buildDocSummary(id, meta), snippet });
      }
    }

    const total = results.length;
    const data = results.slice((page - 1) * page_size, page * page_size);
    res.json({ data, pagination: { page, page_size, total } });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Agent tokens
app.post('/api/v1/agents/tokens', authMiddleware, async (req, res) => {
  try {
    const { name, role = 'agent', scopes, expires_at } = req.body;
    if (!name || !scopes?.length) {
      return sendError(res, 400, 'validation_error', 'name and scopes are required', null, req.requestId);
    }

    const validScopes = ['documents:read', 'documents:write', 'versions:read', 'search:read', 'audit:read'];
    const invalidScopes = scopes.filter(s => !validScopes.includes(s));
    if (invalidScopes.length) {
      return sendError(res, 400, 'validation_error', `Invalid scopes: ${invalidScopes.join(', ')}`, `Valid scopes: ${validScopes.join(', ')}`, req.requestId);
    }

    const id = uuidv4();
    const secretToken = `agt_${uuidv4().replace(/-/g, '')}`;
    const tokenPrefix = secretToken.slice(0, 8);
    const tokenHash = sha256(secretToken);
    const now = new Date().toISOString();

    const tokens = await readJson(AGENT_TOKENS_FILE, {});
    tokens[id] = {
      id,
      name,
      role,
      scopes,
      token_prefix: tokenPrefix,
      token_hash: tokenHash,
      expires_at: expires_at || null,
      created_at: now,
      last_used_at: null
    };
    await writeJson(AGENT_TOKENS_FILE, tokens);
    await appendAuditLog('user', req.actorId, 'agent_token.create', 'agent_token', id, { name, scopes });

    res.status(201).json({
      id,
      name,
      role,
      scopes,
      token_prefix: tokenPrefix,
      expires_at: expires_at || null,
      created_at: now,
      last_used_at: null,
      secret_token: secretToken
    });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// ── Folder routes ─────────────────────────────────────────────────────────────

// List all folders
app.get('/api/v1/folders', authMiddleware, async (req, res) => {
  try {
    const folders = await readJson(FOLDERS_FILE, {});
    res.json(Object.values(folders));
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Create folder
app.post('/api/v1/folders', authMiddleware, async (req, res) => {
  try {
    const { name, parent_id = null } = req.body;
    if (!name?.trim()) {
      return sendError(res, 400, 'validation_error', 'Folder name is required', null, req.requestId);
    }
    const folders = await readJson(FOLDERS_FILE, {});
    if (parent_id && !folders[parent_id]) {
      return sendError(res, 400, 'validation_error', 'Parent folder not found', null, req.requestId);
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    const parentDirName = parent_id ? folders[parent_id]?.dir_name : null;
    const dir_name = await uniqueDirName(name.trim(), parentDirName);
    folders[id] = { id, name: name.trim(), dir_name, parent_id: parent_id || null, created_by: req.actorId, created_at: now, updated_at: now };
    await writeJson(FOLDERS_FILE, folders);
    await fs.mkdir(path.join(DOCS_DIR, dir_name), { recursive: true });
    await appendAuditLog('user', req.actorId, 'folder.create', 'folder', id, { name: name.trim() });
    res.status(201).json(folders[id]);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Update folder (rename or reparent)
app.put('/api/v1/folders/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const folders = await readJson(FOLDERS_FILE, {});
    if (!folders[id]) {
      return sendError(res, 404, 'not_found', 'Folder not found', null, req.requestId);
    }
    const { name, parent_id } = req.body;
    if (parent_id !== undefined && parent_id !== null) {
      if (!folders[parent_id]) {
        return sendError(res, 400, 'validation_error', 'Parent folder not found', null, req.requestId);
      }
      // Prevent circular reference
      let cur = parent_id;
      while (cur) {
        if (cur === id) {
          return sendError(res, 400, 'validation_error', 'Circular folder reference not allowed', null, req.requestId);
        }
        cur = folders[cur]?.parent_id;
      }
    }
    const oldDirName = folders[id].dir_name;
    const parentDirName = folders[id].parent_id ? folders[folders[id].parent_id]?.dir_name : null;
    const newName = name !== undefined ? name.trim() : folders[id].name;
    const newDirName = (name !== undefined && name.trim() !== folders[id].name)
      ? await uniqueDirName(name.trim(), parentDirName)
      : oldDirName;

    folders[id] = {
      ...folders[id],
      ...(name !== undefined ? { name: newName, dir_name: newDirName } : {}),
      ...(parent_id !== undefined ? { parent_id } : {}),
      updated_at: new Date().toISOString()
    };

    // If name changed, update all descendant folders' dir_name (they're nested under oldDirName)
    if (name !== undefined && newDirName !== oldDirName) {
      for (const [fid, f] of Object.entries(folders)) {
        if (fid !== id && f.dir_name && f.dir_name.startsWith(oldDirName + '/')) {
          folders[fid] = { ...f, dir_name: newDirName + f.dir_name.slice(oldDirName.length) };
        }
      }
    }

    await writeJson(FOLDERS_FILE, folders);

    // Rename the directory on disk if name changed
    if (name !== undefined && newDirName !== oldDirName) {
      try {
        await fs.rename(path.join(DOCS_DIR, oldDirName), path.join(DOCS_DIR, newDirName));
      } catch {}
      // Update file_path for all docs in this folder or its descendants
      const metadata = await readJson(META_FILE, {});
      let changed = false;
      for (const [docId, docMeta] of Object.entries(metadata)) {
        if (!docMeta.deleted_at && docMeta.file_path && docMeta.file_path.startsWith(oldDirName + '/')) {
          metadata[docId].file_path = newDirName + docMeta.file_path.slice(oldDirName.length);
          changed = true;
        }
      }
      if (changed) await writeJson(META_FILE, metadata);
    }

    await appendAuditLog('user', req.actorId, 'folder.update', 'folder', id, { name, parent_id });
    res.json(folders[id]);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Delete folder (moves docs to parent, recursively deletes children)
app.delete('/api/v1/folders/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const folders = await readJson(FOLDERS_FILE, {});
    if (!folders[id]) {
      return sendError(res, 404, 'not_found', 'Folder not found', null, req.requestId);
    }
    const parentId = folders[id].parent_id;

    // Collect all descendant folder IDs (including the target)
    function getDescendants(folderId) {
      return Object.values(folders)
        .filter(f => f.parent_id === folderId)
        .flatMap(f => [f.id, ...getDescendants(f.id)]);
    }
    const toDelete = [id, ...getDescendants(id)];

    // Move docs in deleted folders up to the parent (or root)
    const metadata = await readJson(META_FILE, {});
    const parentDirName = parentId ? (folders[parentId]?.dir_name || parentId) : null;
    let changed = false;
    for (const [docId, meta] of Object.entries(metadata)) {
      if (!meta.deleted_at && toDelete.includes(meta.folder_id)) {
        metadata[docId].folder_id = parentId;
        // Move the actual file to the parent folder directory
        if (meta.file_path) {
          const oldFullPath = path.join(DOCS_DIR, meta.file_path);
          const filename = path.basename(meta.file_path);
          const newFilePath = parentDirName ? `${parentDirName}/${filename}` : filename;
          const newFullPath = path.join(DOCS_DIR, newFilePath);
          try {
            if (parentDirName) await fs.mkdir(path.dirname(newFullPath), { recursive: true });
            await fs.rename(oldFullPath, newFullPath);
            metadata[docId].file_path = newFilePath;
          } catch {}
        }
        changed = true;
      }
    }
    if (changed) await writeJson(META_FILE, metadata);

    // Delete all collected folders and their directories
    for (const fid of toDelete) {
      const dirName = folders[fid]?.dir_name || fid;
      delete folders[fid];
      try { await fs.rm(path.join(DOCS_DIR, dirName), { recursive: true, force: true }); } catch {}
    }
    await writeJson(FOLDERS_FILE, folders);

    await appendAuditLog('user', req.actorId, 'folder.delete', 'folder', id, { deleted_count: toDelete.length });
    res.status(204).send();
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Audit logs
app.get('/api/v1/audit-logs', authMiddleware, async (req, res) => {
  try {
    const { actor_type, action } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const page_size = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20));

    let logs = await readJson(AUDIT_LOGS_FILE, []);
    if (actor_type) logs = logs.filter(l => l.actor_type === actor_type);
    if (action) logs = logs.filter(l => l.action === action);

    logs.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const total = logs.length;
    const data = logs.slice((page - 1) * page_size, page * page_size);
    res.json({ data, pagination: { page, page_size, total } });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// ── Legacy/convenience routes ────────────────────────────────────────────────
// These support the frontend's category/tag browsing (not in openapi spec but needed by UI)

app.get('/api/v1/categories', async (req, res) => {
  try {
    const metadata = await readJson(META_FILE, {});
    const categories = [...new Set(
      Object.values(metadata)
        .filter(m => !m.deleted_at)
        .map(m => m.category)
        .filter(Boolean)
    )];
    res.json(categories);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

app.get('/api/v1/tags', async (req, res) => {
  try {
    const metadata = await readJson(META_FILE, {});
    const tags = [...new Set(
      Object.values(metadata)
        .filter(m => !m.deleted_at)
        .flatMap(m => m.tags || [])
    )];
    res.json(tags);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// ── Admin: Users ─────────────────────────────────────────────────────────────

// List all users
app.get('/api/v1/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await readJson(USERS_FILE, {});
    const list = Object.entries(users).map(([username, u]) => ({
      username,
      role: u.role || 'viewer',
      created_at: u.created_at
    }));
    res.json(list);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Create user
app.post('/api/v1/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, password, role = 'viewer' } = req.body;
    if (!username || !password) {
      return sendError(res, 400, 'validation_error', 'username and password are required', null, req.requestId);
    }
    const validRoles = ['admin', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return sendError(res, 400, 'validation_error', `Invalid role. Must be one of: ${validRoles.join(', ')}`, null, req.requestId);
    }
    const users = await readJson(USERS_FILE, {});
    if (users[username]) {
      return sendError(res, 409, 'conflict', 'User already exists', null, req.requestId);
    }
    users[username] = { password: await bcrypt.hash(password, 10), role, created_at: new Date().toISOString() };
    await writeJson(USERS_FILE, users);
    await appendAuditLog('user', req.actorId, 'user.create', 'user', username, { role });
    res.status(201).json({ username, role, created_at: users[username].created_at });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Update user (role and/or password)
app.put('/api/v1/admin/users/:username', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const { role, password } = req.body;
    const users = await readJson(USERS_FILE, {});
    if (!users[username]) {
      return sendError(res, 404, 'not_found', 'User not found', null, req.requestId);
    }
    if (role !== undefined) {
      const validRoles = ['admin', 'editor', 'viewer'];
      if (!validRoles.includes(role)) {
        return sendError(res, 400, 'validation_error', `Invalid role. Must be one of: ${validRoles.join(', ')}`, null, req.requestId);
      }
      users[username].role = role;
    }
    if (password) {
      users[username].password = await bcrypt.hash(password, 10);
    }
    await writeJson(USERS_FILE, users);
    await appendAuditLog('user', req.actorId, 'user.update', 'user', username, { role });
    res.json({ username, role: users[username].role, created_at: users[username].created_at });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Delete user
app.delete('/api/v1/admin/users/:username', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    if (username === req.actorId) {
      return sendError(res, 400, 'validation_error', 'Cannot delete your own account', null, req.requestId);
    }
    const users = await readJson(USERS_FILE, {});
    if (!users[username]) {
      return sendError(res, 404, 'not_found', 'User not found', null, req.requestId);
    }
    delete users[username];
    await writeJson(USERS_FILE, users);
    await appendAuditLog('user', req.actorId, 'user.delete', 'user', username, {});
    res.status(204).send();
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// ── Admin: Settings ───────────────────────────────────────────────────────────

app.get('/api/v1/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, { registration_enabled: true });
    res.json(settings);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

app.put('/api/v1/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const current = await readJson(SETTINGS_FILE, { registration_enabled: true });
    const updated = { ...current, ...req.body };
    await writeJson(SETTINGS_FILE, updated);
    await appendAuditLog('user', req.actorId, 'settings.update', 'settings', 'global', req.body);
    res.json(updated);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// ── Download document ────────────────────────────────────────────────────────
app.get('/api/v1/documents/:id/download', agentTokenMiddleware, requireScope('documents:read'), async (req, res) => {
  try {
    const { id } = req.params;
    const metadata = await readJson(META_FILE, {});
    const meta = metadata[id];
    if (!meta || meta.deleted_at) {
      return sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
    }
    const rawContent = await getDocContent(id, meta);
    const filename = `${sanitizeFilename(meta.title || id)}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(rawContent);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// ── Batch operations ─────────────────────────────────────────────────────────
app.post('/api/v1/documents/batch/delete', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, 400, 'validation_error', 'ids array is required', null, req.requestId);
    }
    const metadata = await readJson(META_FILE, {});
    const now = new Date().toISOString();
    const deleted = [];
    for (const id of ids) {
      if (metadata[id] && !metadata[id].deleted_at) {
        metadata[id].deleted_at = now;
        deleted.push(id);
      }
    }
    await writeJson(META_FILE, metadata);
    for (const id of deleted) {
      await appendAuditLog('user', req.actorId, 'document.delete', 'document', id, { batch: true });
    }
    res.json({ deleted });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

app.post('/api/v1/documents/batch/move', authMiddleware, async (req, res) => {
  try {
    const { ids, folder_id } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, 400, 'validation_error', 'ids array is required', null, req.requestId);
    }
    if (folder_id !== null && folder_id !== undefined) {
      const folders = await readJson(FOLDERS_FILE, {});
      if (!folders[folder_id]) {
        return sendError(res, 400, 'validation_error', 'Folder not found', null, req.requestId);
      }
    }
    const metadata = await readJson(META_FILE, {});
    const allFolders = await readJson(FOLDERS_FILE, {});
    const moved = [];
    for (const id of ids) {
      const meta = metadata[id];
      if (!meta || meta.deleted_at) continue;
      const currentFilePath = meta.file_path || `${id}.md`;
      const filename = path.basename(currentFilePath);
      const newFolderId = folder_id !== undefined ? folder_id : null;
      const newFolderDirName = newFolderId ? (allFolders[newFolderId]?.dir_name || newFolderId) : null;
      const newFilePath = newFolderDirName ? `${newFolderDirName}/${filename}` : filename;
      if (newFolderDirName) await fs.mkdir(path.join(DOCS_DIR, newFolderDirName), { recursive: true });
      const oldFullPath = path.join(DOCS_DIR, currentFilePath);
      const newFullPath = path.join(DOCS_DIR, newFilePath);
      if (oldFullPath !== newFullPath) await fs.rename(oldFullPath, newFullPath);
      metadata[id].folder_id = newFolderId;
      metadata[id].file_path = newFilePath;
      metadata[id].updated_at = new Date().toISOString();
      moved.push(id);
    }
    await writeJson(META_FILE, metadata);
    res.json({ moved });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

app.post('/api/v1/documents/batch/download', agentTokenMiddleware, requireScope('documents:read'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, 400, 'validation_error', 'ids array is required', null, req.requestId);
    }
    const metadata = await readJson(META_FILE, {});
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="documents.zip"');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    for (const id of ids) {
      const meta = metadata[id];
      if (!meta || meta.deleted_at) continue;
      const rawContent = await getDocContent(id, meta);
      const filename = `${sanitizeFilename(meta.title || id)}.md`;
      archive.append(rawContent, { name: filename });
    }
    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// ── Share document ───────────────────────────────────────────────────────────
app.post('/api/v1/documents/:id/share', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { access_code } = req.body;
    const metadata = await readJson(META_FILE, {});
    if (!metadata[id] || metadata[id].deleted_at) {
      return sendError(res, 404, 'not_found', 'Document not found', null, req.requestId);
    }
    const shares = await readJson(SHARES_FILE, {});
    const shareId = uuidv4();
    const token = crypto.randomBytes(24).toString('base64url');
    shares[shareId] = {
      id: shareId,
      document_id: id,
      token,
      access_code: access_code || null,
      created_by: req.actorId,
      created_at: new Date().toISOString()
    };
    await writeJson(SHARES_FILE, shares);
    await appendAuditLog('user', req.actorId, 'share.create', 'share', shareId, { document_id: id, has_code: !!access_code });
    res.status(201).json({ id: shareId, token, has_access_code: !!access_code });
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

app.get('/api/v1/documents/:id/shares', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const shares = await readJson(SHARES_FILE, {});
    const docShares = Object.values(shares)
      .filter(s => s.document_id === id)
      .map(s => ({ id: s.id, token: s.token, has_access_code: !!s.access_code, created_by: s.created_by, created_at: s.created_at }));
    res.json(docShares);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

app.delete('/api/v1/shares/:shareId', authMiddleware, async (req, res) => {
  try {
    const { shareId } = req.params;
    const shares = await readJson(SHARES_FILE, {});
    if (!shares[shareId]) {
      return sendError(res, 404, 'not_found', 'Share not found', null, req.requestId);
    }
    delete shares[shareId];
    await writeJson(SHARES_FILE, shares);
    await appendAuditLog('user', req.actorId, 'share.delete', 'share', shareId, {});
    res.status(204).send();
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// Public share access (no auth required)
app.get('/api/share/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { code } = req.query;
    const shares = await readJson(SHARES_FILE, {});
    const share = Object.values(shares).find(s => s.token === token);
    if (!share) {
      return sendError(res, 404, 'not_found', 'Share link not found or expired', null, req.requestId);
    }
    if (share.access_code && share.access_code !== code) {
      return sendError(res, 403, 'forbidden', 'Access code required', 'Provide the correct access code via ?code= parameter', req.requestId);
    }
    const metadata = await readJson(META_FILE, {});
    const meta = metadata[share.document_id];
    if (!meta || meta.deleted_at) {
      return sendError(res, 404, 'not_found', 'Document no longer exists', null, req.requestId);
    }
    const rawContent = await getDocContent(share.document_id, meta);
    const { content: body } = matter(rawContent);
    const doc = {
      ...buildDocSummary(share.document_id, meta),
      content_md: rawContent,
      content_html: renderMarkdown(body),
      shared: true
    };
    res.json(doc);
  } catch (err) {
    sendError(res, 500, 'internal_error', err.message, null, req.requestId);
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(DOCS_DIR, { recursive: true });

  for (const [file, def] of [
    [USERS_FILE, {}],
    [META_FILE, {}],
    [VERSIONS_FILE, {}],
    [AGENT_TOKENS_FILE, {}],
    [AUDIT_LOGS_FILE, []],
    [IDEMPOTENCY_FILE, {}],
    [SETTINGS_FILE, { registration_enabled: true }],
    [FOLDERS_FILE, {}],
    [SHARES_FILE, {}]
  ]) {
    try { await fs.access(file); } catch { await writeJson(file, def); }
  }

  app.listen(PORT, () => console.log(`MarkdownHub API running on http://localhost:${PORT}`));
}

init();
