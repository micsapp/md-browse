<template>
  <div class="upload-page">
    <div class="workspace-topline">
      <span>ADD DOCUMENTATION</span>
      <NuxtLink to="/" class="workspace-topline-link">
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-arrow-left"/></svg>
        <span>Back to Documents</span>
      </NuxtLink>
    </div>

    <header class="page-header">
      <div class="page-header-copy">
        <p class="page-eyebrow">IMPORT MARKDOWN</p>
        <h1 class="page-title">Upload Document</h1>
        <p class="page-subtitle">Import individual Markdown files or batch-upload an entire local folder.</p>
      </div>
    </header>

    <div class="upload-layout">
      <div class="surface-card">
        <div class="mode-toggle" role="tablist">
          <button type="button" :class="{ active: mode === 'file' }" @click="mode = 'file'">
            <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-doc"/></svg>
            Single File
          </button>
          <button type="button" :class="{ active: mode === 'folder' }" @click="mode = 'folder'">
            <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
            Folder Batch
          </button>
        </div>

        <form @submit.prevent="mode === 'file' ? upload() : uploadSelected()">
          <!-- Single file mode -->
          <div v-if="mode === 'file'" class="field">
            <label>Markdown File</label>
            <div
              class="dropzone"
              :class="{ 'dropzone--active': isDragging, 'dropzone--picked': !!file }"
              @dragover.prevent="isDragging = true"
              @dragleave="isDragging = false"
              @drop.prevent="onFileDrop"
            >
              <input type="file" accept=".md,.markdown" class="dropzone-input" @change="onFileChange" />
              <svg class="ui-icon ui-icon--lg dropzone-icon" aria-hidden="true"><use href="#ui-upload"/></svg>
              <template v-if="file">
                <strong>{{ file.name }}</strong>
                <span class="dropzone-hint">{{ formatSize(file.size) }} · Click or drop to replace</span>
              </template>
              <template v-else>
                <strong>Drop a .md or .markdown file here</strong>
                <span class="dropzone-hint">or click to browse your computer</span>
              </template>
            </div>
          </div>

          <!-- Folder mode -->
          <div v-if="mode === 'folder'">
            <div class="field">
              <label>Select Local Folder</label>
              <div class="dropzone">
                <input type="file" webkitdirectory class="dropzone-input" @change="onFolderChange" />
                <svg class="ui-icon ui-icon--lg dropzone-icon" aria-hidden="true"><use href="#ui-folder"/></svg>
                <strong>{{ mdFiles.length ? `${mdFiles.length} markdown files found` : 'Choose a local folder to scan' }}</strong>
                <span class="dropzone-hint">Click to pick a folder from your computer</span>
              </div>
            </div>
            <div v-if="mdFiles.length" class="file-list">
              <div class="file-list-header">
                <label class="checkbox-label">
                  <input type="checkbox" :checked="allSelected" @change="toggleAll" />
                  <strong>Select All</strong> ({{ selectedFiles.length }}/{{ mdFiles.length }} files)
                </label>
              </div>
              <div class="file-list-items">
                <label v-for="f in mdFiles" :key="f.path" class="checkbox-label">
                  <input v-model="selectedFiles" type="checkbox" :value="f.path" />
                  <span class="file-path">{{ f.path }}</span>
                  <span class="file-size">{{ formatSize(f.file.size) }}</span>
                </label>
              </div>
            </div>
            <div v-else-if="folderPicked" class="empty-msg">No .md or .markdown files found in this folder.</div>
          </div>

          <div class="field-grid">
            <div class="field">
              <label>Destination Folder</label>
              <select v-model="form.folder_id" class="select-control">
                <option value="">Root (Unfiled)</option>
                <option v-for="f in flatFolders" :key="f.id" :value="f.id">
                  {{ '\u00a0\u00a0'.repeat(f.depth) }}{{ f.name }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>Category</label>
              <input v-model="form.category" class="input-control" placeholder="e.g., tutorial, guide, reference" />
            </div>
          </div>

          <div class="field">
            <label>Tags (comma separated)</label>
            <input v-model="form.tags" class="input-control" placeholder="e.g., vue, javascript, architecture" />
          </div>

          <div v-if="error" class="error-msg">{{ error }}</div>

          <div v-if="mode === 'folder' && uploadProgress.total > 0" class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            <span class="progress-text">{{ uploadProgress.done }} / {{ uploadProgress.total }}{{ uploadProgress.current ? ` — ${uploadProgress.current}` : '' }}</span>
          </div>

          <div v-if="uploadResults.length" class="upload-results">
            <div v-for="r in uploadResults" :key="r.name" :class="['result-item', r.ok ? 'ok' : 'fail']">
              <span>{{ r.ok ? '✓' : '✗' }}</span> {{ r.name }} <span v-if="!r.ok" class="result-err">{{ r.error }}</span>
            </div>
          </div>

          <button v-if="mode === 'file'" type="submit" class="btn btn-primary" :disabled="uploading || !file">
            {{ uploading ? 'Uploading…' : 'Upload Document' }}
          </button>
          <button v-else type="submit" class="btn btn-primary" :disabled="uploading || !selectedFiles.length">
            {{ uploading ? 'Uploading…' : `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}` }}
          </button>
        </form>
      </div>

      <aside class="surface-card info-card">
        <h3>Supported Frontmatter</h3>
        <p>Your Markdown files can optionally include YAML frontmatter at the top:</p>
        <pre>---
title: System Architecture
description: High-level service overview
category: architecture
tags: [cloud, backend]
---</pre>
      </aside>
    </div>
  </div>
</template>

<script setup>
const api = useApi()
const router = useRouter()

const mode = ref('file')
const form = ref({ category: '', tags: '', folder_id: '' })
const file = ref(null)
const isDragging = ref(false)
const uploading = ref(false)
const error = ref('')

const mdFiles = ref([])
const selectedFiles = ref([])
const folderPicked = ref(false)
const uploadProgress = ref({ done: 0, total: 0, current: '' })
const uploadResults = ref([])

const allSelected = computed(() => mdFiles.value.length > 0 && selectedFiles.value.length === mdFiles.value.length)

function toggleAll() {
  selectedFiles.value = allSelected.value ? [] : mdFiles.value.map(f => f.path)
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(1) + ' KB'
}

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
  if (e.target.files?.[0]) file.value = e.target.files[0]
}

function onFileDrop(e) {
  isDragging.value = false
  const dropped = Array.from(e.dataTransfer?.files || []).find(f => /\.(md|markdown)$/i.test(f.name))
  if (dropped) {
    file.value = dropped
    error.value = ''
  } else {
    error.value = 'Please drop a valid .md or .markdown file.'
  }
}

function onFolderChange(e) {
  folderPicked.value = true
  const files = Array.from(e.target.files)
  const md = files
    .filter(f => /\.(md|markdown)$/i.test(f.name))
    .map(f => ({ path: f.webkitRelativePath || f.name, file: f }))
    .sort((a, b) => a.path.localeCompare(b.path))
  mdFiles.value = md
  selectedFiles.value = md.map(f => f.path)
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
}
</script>

<style scoped>
.upload-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
  gap: 20px;
  align-items: start;
}

.mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: var(--raised);
  margin-bottom: 18px;
}

.mode-toggle button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.mode-toggle button.active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.field {
  margin-bottom: 14px;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 12.5px;
}

.dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 18px;
  border: 1.5px dashed var(--line-strong);
  border-radius: 12px;
  background: var(--canvas);
  text-align: center;
  cursor: pointer;
  transition: all 0.16s;
}

.dropzone:hover,
.dropzone--active,
.dropzone--picked {
  border-color: var(--accent-solid);
  background: var(--accent-soft);
}

.dropzone-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.dropzone-icon {
  color: var(--accent);
}

.dropzone-hint {
  color: var(--muted);
  font-size: 12px;
}

.file-list {
  border: 1px solid var(--line);
  border-radius: 10px;
  margin-bottom: 14px;
  overflow: hidden;
}

.file-list-header {
  padding: 8px 12px;
  background: var(--raised);
  border-bottom: 1px solid var(--line);
}

.file-list-items {
  max-height: 240px;
  overflow-y: auto;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 13px;
}

.checkbox-label:hover {
  background: var(--raised);
}

.file-path {
  flex: 1;
  word-break: break-all;
}

.file-size {
  color: var(--muted);
  font-size: 11.5px;
}

.error-msg {
  color: var(--danger);
  margin-bottom: 12px;
  font-size: 13px;
}

.progress-bar {
  position: relative;
  height: 28px;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-soft);
  transition: width 0.3s;
}

.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.upload-results {
  margin-bottom: 12px;
  max-height: 180px;
  overflow-y: auto;
  font-size: 12.5px;
}

.result-item.ok { color: var(--success); }
.result-item.fail { color: var(--danger); }

.info-card h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.info-card p {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 12px;
}

.info-card pre {
  background: var(--raised);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 14px;
  border-radius: 10px;
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.55;
}

@media (max-width: 820px) {
  .upload-layout,
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
