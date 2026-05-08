const fs = require('fs');
const path = require('path');

class ApiError extends Error {
  constructor(status, body, requestId) {
    const code = body?.error?.code || 'http_error';
    const msg = body?.error?.message || `HTTP ${status}`;
    super(`${code}: ${msg}`);
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

function buildClient({ token, baseUrl }) {
  if (typeof fetch !== 'function') {
    throw new Error('Node 18+ is required (global fetch is missing)');
  }

  function authHeaders(extra = {}) {
    if (!token) {
      throw new Error(
        'MD_BROWSE_TOKEN is not set. Create one at /tokens on your md-browse site, '
        + 'then add `MD_BROWSE_TOKEN=agt_…` to your .env file.'
      );
    }
    return { 'X-Agent-Token': token, ...extra };
  }

  async function request(method, urlPath, { headers, body, query, raw } = {}) {
    let url = `${baseUrl}${urlPath}`;
    if (query) {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))
      ).toString();
      if (qs) url += `?${qs}`;
    }
    const init = {
      method,
      headers: authHeaders(headers || {})
    };
    if (body !== undefined) {
      if (body instanceof FormData) {
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
      const url = `${baseUrl}/share/${encodeURIComponent(token)}${code ? `?code=${encodeURIComponent(code)}` : ''}`;
      const res = await fetch(url);
      const text = await res.text();
      let parsed = null;
      if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
      if (!res.ok) throw new ApiError(res.status, parsed, res.headers.get('x-request-id'));
      return parsed;
    }
  };
}

module.exports = { buildClient, ApiError };
