export const useApi = () => {
  const config = useRuntimeConfig()
  const auth = useAuth()

  const baseUrl = config.public.apiBase

  async function request(url, options = {}) {
    const headers = {
      ...options.headers,
      ...auth.getAuthHeaders()
    }
    return $fetch(`${baseUrl}${url}`, { ...options, headers })
  }

  async function getDocuments(params = {}) {
    const query = new URLSearchParams(params).toString()
    const res = await request(`/v1/documents${query ? '?' + query : ''}`)
    return res.data || res
  }

  async function getDocument(id) {
    return request(`/v1/documents/${id}`)
  }

  async function createDocument(formData) {
    return request('/v1/documents/upload', {
      method: 'POST',
      body: formData
    })
  }

  async function updateDocument(id, data) {
    return request(`/v1/documents/${id}`, {
      method: 'PUT',
      body: data
    })
  }

  async function deleteDocument(id) {
    return request(`/v1/documents/${id}`, { method: 'DELETE' })
  }

  async function getVersions(id) {
    return request(`/v1/documents/${id}/versions`)
  }

  async function rollbackDocument(id, target_version, change_note) {
    return request(`/v1/documents/${id}/rollback`, {
      method: 'POST',
      body: { target_version, change_note }
    })
  }

  async function getChunks(id, max_tokens) {
    const q = max_tokens ? `?max_tokens=${max_tokens}` : ''
    return request(`/v1/documents/${id}/chunks${q}`)
  }

  async function getCategories() {
    return request('/v1/categories')
  }

  async function getTags() {
    return request('/v1/tags')
  }

  async function searchDocuments(q, params = {}) {
    const query = new URLSearchParams({ q, ...params }).toString()
    const res = await request(`/v1/search?${query}`)
    return res.data || res
  }

  async function getFolders() {
    return request('/v1/folders')
  }

  async function createFolder(name, parent_id = null) {
    return request('/v1/folders', {
      method: 'POST',
      body: { name, parent_id }
    })
  }

  async function updateFolder(id, data) {
    return request(`/v1/folders/${id}`, {
      method: 'PUT',
      body: data
    })
  }

  async function deleteFolder(id) {
    return request(`/v1/folders/${id}`, { method: 'DELETE' })
  }

  async function moveDocument(id, folder_id) {
    return updateDocument(id, { folder_id })
  }

  async function downloadDocument(id) {
    const config = useRuntimeConfig()
    const auth = useAuth()
    const headers = auth.getAuthHeaders()
    const res = await fetch(`${config.public.apiBase}/v1/documents/${id}/download`, { headers })
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'document.md'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  async function batchDelete(ids) {
    return request('/v1/documents/batch/delete', { method: 'POST', body: { ids } })
  }

  async function batchMove(ids, folder_id) {
    return request('/v1/documents/batch/move', { method: 'POST', body: { ids, folder_id } })
  }

  async function batchDownload(ids) {
    const config = useRuntimeConfig()
    const auth = useAuth()
    const headers = { ...auth.getAuthHeaders(), 'Content-Type': 'application/json' }
    const res = await fetch(`${config.public.apiBase}/v1/documents/batch/download`, {
      method: 'POST', headers, body: JSON.stringify({ ids })
    })
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'documents.zip'; a.click()
    URL.revokeObjectURL(url)
  }

  async function createShare(docId, access_code) {
    return request(`/v1/documents/${docId}/share`, {
      method: 'POST',
      body: { access_code: access_code || undefined }
    })
  }

  async function getShares(docId) {
    return request(`/v1/documents/${docId}/shares`)
  }

  async function deleteShare(shareId) {
    return request(`/v1/shares/${shareId}`, { method: 'DELETE' })
  }

  async function getSharedDocument(token, code) {
    const config = useRuntimeConfig()
    const url = `${config.public.apiBase}/share/${token}${code ? '?code=' + encodeURIComponent(code) : ''}`
    return $fetch(url)
  }

  return {
    request,
    getDocuments,
    getDocument,
    createDocument,
    updateDocument,
    deleteDocument,
    getVersions,
    rollbackDocument,
    getChunks,
    getCategories,
    getTags,
    searchDocuments,
    getFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    moveDocument,
    downloadDocument,
    batchDelete,
    batchMove,
    batchDownload,
    createShare,
    getShares,
    deleteShare,
    getSharedDocument
  }
}
