<template>
  <Teleport to="body">
    <div v-if="modal.isOpen.value" class="modal-backdrop" @click.self="modal.close()">
      <div class="modal-card um-modal">
        <div class="modal-card-header">
          <div class="um-header-title">
            <svg class="ui-icon" aria-hidden="true"><use href="#ui-upload"/></svg>
            <h3>Upload Document</h3>
          </div>
          <button type="button" class="btn btn-xs btn-ghost" aria-label="Close" @click="modal.close()">✕</button>
        </div>

        <div class="um-body">
          <!-- Mode toggle -->
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
            <!-- Single file dropzone -->
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
                  <strong class="dropzone-filename">{{ file.name }}</strong>
                  <span class="dropzone-hint">{{ formatSize(file.size) }} · Click or drop to replace</span>
                </template>
                <template v-else>
                  <strong>Drop a .md or .markdown file here</strong>
                  <span class="dropzone-hint">or click to browse your device</span>
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
                  <strong>{{ mdFiles.length ? `${mdFiles.length} markdown files discovered` : 'Choose a folder to scan for .md files' }}</strong>
                  <span class="dropzone-hint">Click to pick a directory from your computer</span>
                </div>
              </div>
              <div v-if="mdFiles.length" class="file-list">
                <div class="file-list-header">
                  <label class="checkbox-label">
                    <input type="checkbox" :checked="allSelected" @change="toggleAll" />
                    <strong>Select All</strong> ({{ selectedFiles.length }}/{{ mdFiles.length }})
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
              <div v-else-if="folderPicked" class="empty-msg">No .md or .markdown files found in that folder.</div>
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
                <input v-model="form.category" class="input-control" placeholder="e.g., architecture, guide" />
              </div>
            </div>

            <div class="field">
              <label>Tags <span class="label-hint">(comma separated)</span></label>
              <input v-model="form.tags" class="input-control" placeholder="e.g., api, deployment, vue" />
            </div>

            <div v-if="error" class="error-msg">{{ error }}</div>

            <!-- Progress bar -->
            <div v-if="mode === 'folder' && uploadProgress.total > 0" class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
              <span class="progress-text">{{ uploadProgress.done }}/{{ uploadProgress.total }}{{ uploadProgress.current ? ` — ${uploadProgress.current}` : '' }}</span>
            </div>

            <!-- Results -->
            <div v-if="uploadResults.length" class="upload-results">
              <div v-for="r in uploadResults" :key="r.name" :class="['result-item', r.ok ? 'ok' : 'fail']">
                {{ r.ok ? '✓' : '✗' }} {{ r.name }}<span v-if="!r.ok" class="result-err"> — {{ r.error }}</span>
              </div>
            </div>

            <div class="um-footer">
              <button type="button" class="btn" @click="modal.close()">Cancel</button>
              <button
                v-if="mode === 'file'"
                type="submit"
                class="btn btn-primary"
                :disabled="uploading || !file"
              >
                {{ uploading ? 'Uploading…' : 'Upload Document' }}
              </button>
              <button
                v-else
                type="submit"
                class="btn btn-primary"
                :disabled="uploading || !selectedFiles.length"
              >
                {{ uploading ? 'Uploading…' : `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}` }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const modal = useUploadModal()
const api = useApi()
const docViewer = useDocViewer()
const panel = useFolderPanel()

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

// Pre-select current active folder when opening modal
watch(() => modal.isOpen.value, (open) => {
  if (open) {
    mode.value = 'file'
    const activeFolder = panel.selectedFolderId.value
    form.value = {
      category: '',
      tags: '',
      folder_id: (activeFolder && activeFolder !== 'root') ? activeFolder : ''
    }
    file.value = null
    isDragging.value = false
    error.value = ''
    mdFiles.value = []
    selectedFiles.value = []
    folderPicked.value = false
    uploadProgress.value = { done: 0, total: 0, current: '' }
    uploadResults.value = []
  }
})

if (import.meta.client) {
  const onKey = (e) => { if (e.key === 'Escape' && modal.isOpen.value) modal.close() }
  onMounted(() => document.addEventListener('keydown', onKey))
  onUnmounted(() => document.removeEventListener('keydown', onKey))
}

const { data: allFolders } = await useAsyncData('um-folders', async () => {
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

const allSelected = computed(() => mdFiles.value.length > 0 && selectedFiles.value.length === mdFiles.value.length)
function toggleAll() {
  selectedFiles.value = allSelected.value ? [] : mdFiles.value.map(f => f.path)
}
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(1) + ' KB'
}
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
  mdFiles.value = files
    .filter(f => /\.(md|markdown)$/i.test(f.name))
    .map(f => ({ path: f.webkitRelativePath || f.name, file: f }))
    .sort((a, b) => a.path.localeCompare(b.path))
  selectedFiles.value = mdFiles.value.map(f => f.path)
  uploadResults.value = []
}

async function upload() {
  if (!file.value) return
  uploading.value = true; error.value = ''
  const formData = new FormData()
  formData.append('file', file.value)
  formData.append('category', form.value.category)
  formData.append('tags', form.value.tags)
  if (form.value.folder_id) formData.append('folder_id', form.value.folder_id)
  try {
    const result = await api.createDocument(formData)
    const doc = result.documents?.[0] || result
    modal.close()
    panel.notifyFolderChange()
    docViewer.openDoc(doc.id)
  } catch (e) {
    error.value = e.data?.error?.message || e.data?.error || e.message || 'Upload failed'
  } finally {
    uploading.value = false
  }
}

async function uploadSelected() {
  if (!selectedFiles.value.length) return
  uploading.value = true; error.value = ''; uploadResults.value = []
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
      uploadResults.value.push({ name: entry.path, ok: false, error: e.data?.error?.message || e.message || 'Failed' })
    }
    uploadProgress.value.done++
  }
  uploadProgress.value.current = ''
  uploading.value = false
  panel.notifyFolderChange()
}
</script>

<style scoped>
.um-modal {
  width: min(580px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.um-header-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.um-header-title .ui-icon {
  color: var(--accent);
}

.um-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
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
  padding: 8px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
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
  color: var(--ink);
}

.label-hint {
  font-weight: 450;
  color: var(--muted);
}

.dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 24px 16px;
  border: 1.5px dashed var(--line-strong);
  border-radius: 12px;
  background: var(--canvas);
  text-align: center;
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s;
}

.dropzone:hover,
.dropzone--active {
  border-color: var(--accent-solid);
  background: var(--accent-soft);
}

.dropzone--picked {
  border-style: solid;
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
  margin-bottom: 2px;
}

.dropzone strong {
  color: var(--ink);
  font-size: 13.5px;
  font-weight: 650;
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
  font-size: 12.5px;
}

.file-list-items {
  max-height: 190px;
  overflow-y: auto;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--ink);
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
  white-space: nowrap;
}

.empty-msg {
  color: var(--muted);
  font-size: 12.5px;
  margin-bottom: 12px;
}

.error-msg {
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  color: var(--danger);
  margin-bottom: 14px;
  font-size: 12.5px;
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
  transition: width 0.25s;
}

.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}

.upload-results {
  margin-bottom: 12px;
  max-height: 140px;
  overflow-y: auto;
  font-size: 12.5px;
}

.result-item {
  padding: 3px 0;
}
.result-item.ok {
  color: var(--success);
}
.result-item.fail {
  color: var(--danger);
}

.um-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

@media (max-width: 560px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
