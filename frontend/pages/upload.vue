<template>
  <div class="upload-page">
    <h1>Upload Document</h1>

    <!-- Mode toggle -->
    <div class="mode-toggle">
      <button type="button" :class="{ active: mode === 'file' }" @click="mode = 'file'">Single File</button>
      <button type="button" :class="{ active: mode === 'folder' }" @click="mode = 'folder'">Folder</button>
    </div>

    <form @submit.prevent="mode === 'file' ? upload() : uploadSelected()" class="upload-form">
      <!-- Single file mode -->
      <div v-if="mode === 'file'" class="field">
        <label>Markdown File</label>
        <input type="file" accept=".md,.markdown" @change="onFileChange" required />
      </div>

      <!-- Folder mode -->
      <div v-if="mode === 'folder'">
        <div class="field">
          <label>Select Folder</label>
          <input type="file" webkitdirectory @change="onFolderChange" />
        </div>
        <div v-if="mdFiles.length" class="file-list">
          <div class="file-list-header">
            <label class="checkbox-label select-all">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
              <strong>Select All</strong> ({{ selectedFiles.length }}/{{ mdFiles.length }} files)
            </label>
          </div>
          <div class="file-list-items">
            <label v-for="f in mdFiles" :key="f.path" class="checkbox-label">
              <input type="checkbox" :value="f.path" v-model="selectedFiles" />
              <span class="file-path">{{ f.path }}</span>
              <span class="file-size">{{ formatSize(f.file.size) }}</span>
            </label>
          </div>
        </div>
        <div v-else-if="folderPicked" class="empty-msg">No .md or .markdown files found in this folder.</div>
      </div>

      <div class="field">
        <label>Folder (optional)</label>
        <select v-model="form.folder_id">
          <option value="">Root (no folder)</option>
          <option v-for="f in flatFolders" :key="f.id" :value="f.id">
            {{ '\u00a0\u00a0'.repeat(f.depth) }}{{ f.name }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>Category</label>
        <input v-model="form.category" placeholder="e.g., tutorial, guide, reference" />
      </div>
      <div class="field">
        <label>Tags (comma separated)</label>
        <input v-model="form.tags" placeholder="e.g., vue, javascript, frontend" />
      </div>
      <div v-if="error" class="error-msg">{{ error }}</div>

      <!-- Upload progress for folder mode -->
      <div v-if="mode === 'folder' && uploadProgress.total > 0" class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        <span class="progress-text">{{ uploadProgress.done }} / {{ uploadProgress.total }}{{ uploadProgress.current ? ` — ${uploadProgress.current}` : '' }}</span>
      </div>
      <div v-if="uploadResults.length" class="upload-results">
        <div v-for="r in uploadResults" :key="r.name" :class="['result-item', r.ok ? 'ok' : 'fail']">
          <span>{{ r.ok ? '✓' : '✗' }}</span> {{ r.name }} <span v-if="!r.ok" class="result-err">{{ r.error }}</span>
        </div>
      </div>

      <button v-if="mode === 'file'" type="submit" :disabled="uploading">{{ uploading ? 'Uploading...' : 'Upload' }}</button>
      <button v-else type="submit" :disabled="uploading || !selectedFiles.length">
        {{ uploading ? 'Uploading...' : `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}` }}
      </button>
    </form>

    <div class="info">
      <h3>Supported Frontmatter</h3>
      <p>Your markdown can include YAML frontmatter:</p>
      <pre>---
title: My Document
description: A brief description
category: tutorial
tags: [vue, javascript]
---</pre>
    </div>
  </div>
</template>

<script setup>

const api = useApi()
const router = useRouter()

const mode = ref('file')
const form = ref({ category: '', tags: '', folder_id: '' })
const file = ref(null)
const uploading = ref(false)
const error = ref('')

// Folder mode state
const mdFiles = ref([])
const selectedFiles = ref([])
const folderPicked = ref(false)
const uploadProgress = ref({ done: 0, total: 0, current: '' })
const uploadResults = ref([])

const allSelected = computed(() => mdFiles.value.length > 0 && selectedFiles.value.length === mdFiles.value.length)

function toggleAll() {
  if (allSelected.value) {
    selectedFiles.value = []
  } else {
    selectedFiles.value = mdFiles.value.map(f => f.path)
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(1) + ' KB'
}

// Load folders for the selector
const { data: allFolders } = await useAsyncData('upload-folders', async () => {
  if (import.meta.server) return []
  try { return await api.getFolders() } catch { return [] }
}, { default: () => [], server: false })

const flatFolders = computed(() => {
  function flatten(parentId, depth) {
    return (allFolders.value || [])
      .filter(f => f.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap(f => [{ ...f, depth }, ...flatten(f.id, depth + 1)])
  }
  return flatten(null, 0)
})

const progressPercent = computed(() => {
  if (!uploadProgress.value.total) return 0
  return Math.round((uploadProgress.value.done / uploadProgress.value.total) * 100)
})

function onFileChange(e) {
  file.value = e.target.files[0]
}

function onFolderChange(e) {
  folderPicked.value = true
  const files = Array.from(e.target.files)
  const md = files
    .filter(f => /\.(md|markdown)$/i.test(f.name))
    .map(f => ({ path: f.webkitRelativePath || f.name, file: f }))
    .sort((a, b) => a.path.localeCompare(b.path))
  mdFiles.value = md
  selectedFiles.value = []
  uploadResults.value = []
}

async function upload() {
  if (!file.value) return

  uploading.value = true
  error.value = ''
  const formData = new FormData()
  formData.append('file', file.value)
  formData.append('category', form.value.category)
  formData.append('tags', form.value.tags)
  if (form.value.folder_id) formData.append('folder_id', form.value.folder_id)

  try {
    const result = await api.createDocument(formData)
    const doc = result.documents?.[0] || result
    router.push(`/documents/${doc.id}`)
  } catch (e) {
    error.value = e.data?.error?.message || e.data?.error || e.message || 'Upload failed'
  } finally {
    uploading.value = false
  }
}

async function uploadSelected() {
  if (!selectedFiles.value.length) return

  uploading.value = true
  error.value = ''
  uploadResults.value = []
  const toUpload = mdFiles.value.filter(f => selectedFiles.value.includes(f.path))
  uploadProgress.value = { done: 0, total: toUpload.length, current: '' }

  for (const entry of toUpload) {
    uploadProgress.value.current = entry.path
    const formData = new FormData()
    formData.append('file', entry.file)
    formData.append('category', form.value.category)
    formData.append('tags', form.value.tags)
    if (form.value.folder_id) formData.append('folder_id', form.value.folder_id)

    try {
      await api.createDocument(formData)
      uploadResults.value.push({ name: entry.path, ok: true })
    } catch (e) {
      const msg = e.data?.error?.message || e.data?.error || e.message || 'Failed'
      uploadResults.value.push({ name: entry.path, ok: false, error: msg })
    }
    uploadProgress.value.done++
  }

  uploadProgress.value.current = ''
  uploading.value = false

  const allOk = uploadResults.value.every(r => r.ok)
  if (allOk && uploadResults.value.length === 1) {
    // Single file uploaded — navigate to it would require the id; stay on page instead
  }
}
</script>

<style scoped>
.upload-page { max-width: 600px; }
h1 { margin-bottom: 1.5rem; }
.mode-toggle { display: flex; gap: 0; margin-bottom: 1.5rem; }
.mode-toggle button { flex: 1; padding: 0.6rem 1rem; border: 1px solid #ddd; background: #f5f5f5; cursor: pointer; font-size: 0.95rem; transition: all 0.15s; }
.mode-toggle button:first-child { border-radius: 6px 0 0 6px; }
.mode-toggle button:last-child { border-radius: 0 6px 6px 0; }
.mode-toggle button.active { background: #3498db; color: white; border-color: #3498db; }
.upload-form { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.field { margin-bottom: 1rem; }
.field label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
.field input, .field select { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 0.95rem; }
.file-list { border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 1rem; }
.file-list-header { padding: 0.6rem 0.8rem; background: #f8f9fa; border-bottom: 1px solid #e0e0e0; }
.file-list-items { max-height: 300px; overflow-y: auto; }
.checkbox-label { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.9rem; }
.checkbox-label:hover { background: #f0f7ff; }
.select-all { font-size: 0.9rem; }
.file-path { flex: 1; word-break: break-all; }
.file-size { color: #888; font-size: 0.8rem; white-space: nowrap; }
.empty-msg { color: #888; font-style: italic; margin-bottom: 1rem; }
.error-msg { color: #e74c3c; margin-bottom: 1rem; font-size: 0.9rem; }
.progress-bar { position: relative; height: 28px; background: #e9ecef; border-radius: 4px; margin-bottom: 1rem; overflow: hidden; }
.progress-fill { height: 100%; background: #3498db; transition: width 0.3s; }
.progress-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #333; }
.upload-results { margin-bottom: 1rem; max-height: 200px; overflow-y: auto; }
.result-item { padding: 0.3rem 0; font-size: 0.85rem; }
.result-item.ok { color: #27ae60; }
.result-item.fail { color: #e74c3c; }
.result-err { font-size: 0.8rem; opacity: 0.8; }
button { padding: 0.75rem 2rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
button:disabled { opacity: 0.5; }
.info { margin-top: 2rem; background: #f9f9f9; padding: 1.5rem; border-radius: 8px; }
.info h3 { margin-bottom: 0.5rem; }
.info pre { background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.9rem; }
</style>
