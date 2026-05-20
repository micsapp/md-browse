const fs = require('fs');
const path = require('path');
require('./fetch-polyfill');

class ApiError extends Error {
  constructor(status, body, requestId) {
    const code = body?.error?.code || 'http_error';
    const msg = body?.error?.message || (typeof body === 'string' && body) || `HTTP ${status}`;
    super(`${code}: ${msg}`);
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

// baseUrl is normalized to the bare site root (no trailing slash, no /api).
// Each request helper prepends /api before the path so the same baseUrl
// works for /api/v1/*, /api/auth/*, /share/*, etc.
function buildClient({ token, baseUrl }) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is missing — Node 18+ or the bundled fetch polyfill is required');
  }

  function authHeaders(extra = {}) {
    if (!token) {
      throw new Error(
        'No token configured. Run `md_cli login` or set MD_BROWSE_TOKEN in your .env.'
      );
    }
    return { 'X-Agent-Token': token, ...extra };
  }

  function jwtHeaders(jwt, extra = {}) {
    return { Authorization: `Bearer ${jwt}`, ...extra };
  }

  async function request(method, urlPath, { headers, body, query, raw, noAuth, jwt } = {}) {
    let url = `${baseUrl}/api${urlPath}`;
    if (query) {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))
      ).toString();
      if (qs) url += `?${qs}`;
    }
    let reqHeaders;
    if (noAuth) reqHeaders = headers || {};
    else if (jwt) reqHeaders = jwtHeaders(jwt, headers || {});
    else reqHeaders = authHeaders(headers || {});

    const init = { method, headers: reqHeaders };
    if (body !== undefined) {
      if (body instanceof FormData) {
        init.body = body;
      } else if (Buffer.isBuffer(body)) {
        init.body = body;
      } else {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
      }
    }

    const res = await fetch(url, init);
    const requestId = res.headers.get('x-request-id');

    if (raw) {
      if (!res.ok) {
        let parsed = null;
        try { parsed = await res.json(); } catch {}
        throw new ApiError(res.status, parsed, requestId);
      }
      return res;
    }

    const text = await res.text();
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); }
      catch { parsed = text; }
    }
    if (!res.ok) throw new ApiError(res.status, parsed, requestId);
    return parsed;
  }

  return {
    // ── Health / probe ──────────────────────────────────────────────────────
    health() { return request('GET', '/health', { noAuth: true }); },

    // ── Auth (session JWT flow used by login) ───────────────────────────────
    loginPassword(username, password) {
      return request('POST', '/auth/login', {
        noAuth: true,
        body: { username, password }
      });
    },
    mintAgentToken(jwt, { name, scopes, expires_at }) {
      return request('POST', '/v1/agents/tokens', {
        jwt,
        body: { name, scopes, expires_at }
      });
    },
    me(jwt) {
      return request('GET', '/auth/me', { jwt });
    },

    // ── Documents ────────────────────────────────────────────────────────────
    listDocuments(query = {}) { return request('GET', '/v1/documents', { query }); },
    searchDocuments(q, query = {}) { return request('GET', '/v1/search', { query: { q, ...query } }); },
    getDocument(id, query = {}) { return request('GET', `/v1/documents/${id}`, { query }); },

    async uploadDocument(filePath, fields = {}) {
      const absPath = path.resolve(filePath);
      const buf = fs.readFileSync(absPath);
      const filename = path.basename(absPath);
      const form = new FormData();
      form.set('file', new Blob([buf], { type: 'text/markdown' }), filename);
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined && v !== null && v !== '') form.set(k, String(v));
      }
      return request('POST', '/v1/documents/upload', { body: form });
    },

    updateDocument(id, body) { return request('PUT', `/v1/documents/${id}`, { body }); },
    deleteDocument(id) { return request('DELETE', `/v1/documents/${id}`); },

    listVersions(id) { return request('GET', `/v1/documents/${id}/versions`); },
    rollbackDocument(id, target_version, change_note) {
      return request('POST', `/v1/documents/${id}/rollback`, {
        body: { target_version, change_note }
      });
    },

    getChunks(id, query = {}) { return request('GET', `/v1/documents/${id}/chunks`, { query }); },

    async downloadDocument(id) {
      const res = await request('GET', `/v1/documents/${id}/download`, { raw: true });
      const filename = (res.headers.get('content-disposition') || '').match(/filename="(.+?)"/)?.[1];
      const buf = Buffer.from(await res.arrayBuffer());
      return { buffer: buf, filename };
    },

    async batchDownload(ids) {
      const res = await request('POST', '/v1/documents/batch/download', {
        body: { ids },
        raw: true
      });
      const buf = Buffer.from(await res.arrayBuffer());
      return { buffer: buf };
    },
    batchDelete(ids) { return request('POST', '/v1/documents/batch/delete', { body: { ids } }); },
    batchMove(ids, folder_id) { return request('POST', '/v1/documents/batch/move', { body: { ids, folder_id } }); },

    // ── Sharing ─────────────────────────────────────────────────────────────
    createShare(docId, access_code) {
      return request('POST', `/v1/documents/${docId}/share`, {
        body: { access_code: access_code || undefined }
      });
    },
    listShares(docId) { return request('GET', `/v1/documents/${docId}/shares`); },
    listAllShares() { return request('GET', '/v1/shares'); },
    deleteShare(shareId) { return request('DELETE', `/v1/shares/${shareId}`); },

    // Public share fetch — no auth required.
    async openShare(token, code) {
      const url = `${baseUrl}/api/share/${encodeURIComponent(token)}${code ? `?code=${encodeURIComponent(code)}` : ''}`;
      const res = await fetch(url);
      const text = await res.text();
      let parsed = null;
      if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
      if (!res.ok) throw new ApiError(res.status, parsed, res.headers.get('x-request-id'));
      return parsed;
    },

    // ── Folders ─────────────────────────────────────────────────────────────
    listFolders() { return request('GET', '/v1/folders'); },
    createFolder(name, parent_id) {
      return request('POST', '/v1/folders', { body: { name, parent_id: parent_id || null } });
    },
    updateFolder(id, body) { return request('PUT', `/v1/folders/${id}`, { body }); },
    deleteFolder(id) { return request('DELETE', `/v1/folders/${id}`); },

    // ── Server-side agent tokens (manage your tokens via /tokens UI) ────────
    listAgentTokens() { return request('GET', '/v1/agents/tokens'); },
    revokeAgentToken(id) { return request('DELETE', `/v1/agents/tokens/${id}`); },

    // ── Audit log ───────────────────────────────────────────────────────────
    listAuditLogs(query = {}) { return request('GET', '/v1/audit-logs', { query }); },

    // ── Categories / tags (public list) ─────────────────────────────────────
    listCategories() { return request('GET', '/v1/categories', { noAuth: true }); },
    listTags() { return request('GET', '/v1/tags', { noAuth: true }); },

    // ── Document assets ─────────────────────────────────────────────────────
    listDocumentAssets(docId) { return request('GET', `/v1/documents/${docId}/assets`); },
    async uploadDocumentAssets(docId, filePaths) {
      const form = new FormData();
      for (const fp of filePaths) {
        const abs = path.resolve(fp);
        const buf = fs.readFileSync(abs);
        form.append('files', new Blob([buf]), path.basename(abs));
      }
      return request('POST', `/v1/documents/${docId}/assets`, { body: form });
    },

    // ── Folder assets ───────────────────────────────────────────────────────
    listFolderAssets(folderId) { return request('GET', `/v1/folders/${folderId}/assets`); },
    deleteFolderAsset(folderId, filename) {
      return request('DELETE', `/v1/folders/${folderId}/assets/${encodeURIComponent(filename)}`);
    },
    async uploadFolderAssets(folderId, filePaths) {
      const form = new FormData();
      for (const fp of filePaths) {
        const abs = path.resolve(fp);
        const buf = fs.readFileSync(abs);
        form.append('files', new Blob([buf]), path.basename(abs));
      }
      return request('POST', `/v1/folders/${folderId}/assets`, { body: form });
    },

    // ── Admin: users / settings (require admin role on session JWT) ─────────
    listUsers(jwt) { return request('GET', '/v1/admin/users', { jwt }); },
    createUser(jwt, body) { return request('POST', '/v1/admin/users', { jwt, body }); },
    updateUser(jwt, username, body) { return request('PUT', `/v1/admin/users/${encodeURIComponent(username)}`, { jwt, body }); },
    deleteUser(jwt, username) { return request('DELETE', `/v1/admin/users/${encodeURIComponent(username)}`, { jwt }); },
    getSettings(jwt) { return request('GET', '/v1/admin/settings', { jwt }); },
    updateSettings(jwt, body) { return request('PUT', '/v1/admin/settings', { jwt, body }); }
  };
}

module.exports = { buildClient, ApiError };
