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
    moveDocument
  }
}
