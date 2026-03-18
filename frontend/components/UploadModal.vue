<template>
  <Teleport to="body">
    <div v-if="modal.isOpen.value" class="um-overlay" @click.self="modal.close()">
      <div class="um-modal">

        <div class="um-header">
          <span class="um-title">Upload Document</span>
          <button class="um-close" @click="modal.close()">✕</button>
        </div>

        <div class="um-body">
          <!-- Mode toggle -->
          <div class="mode-toggle">
            <button type="button" :class="{ active: mode === 'file' }" @click="mode = 'file'">Single File</button>
            <button type="button" :class="{ active: mode === 'folder' }" @click="mode = 'folder'">Folder</button>
          </div>

          <form @submit.prevent="mode === 'file' ? upload() : uploadSelected()">
            <!-- Single file -->
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
                  <label class="checkbox-label">
                    <input type="checkbox" :checked="allSelected" @change="toggleAll" />
                    <strong>Select All</strong> ({{ selectedFiles.length }}/{{ mdFiles.length }})
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
              <div v-else-if="folderPicked" class="empty-msg">No .md or .markdown files found.</div>
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
              <input v-model="form.category" placeholder="e.g., tutorial, guide" />
            </div>
            <div class="field">
              <label>Tags (comma separated)</label>
              <input v-model="form.tags" placeholder="e.g., vue, javascript" />
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
              <button type="button" class="btn-cancel" @click="modal.close()">Cancel</button>
              <button
                v-if="mode === 'file'" type="submit"
                class="btn-submit" :disabled="uploading"
              >{{ uploading ? 'Uploading…' : 'Upload' }}</button>
              <button
                v-else type="submit"
                class="btn-submit" :disabled="uploading || !selectedFiles.length"
              >{{ uploading ? 'Uploading…' : `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}` }}</button>
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
const uploading = ref(false)
const error = ref('')
const mdFiles = ref([])
const selectedFiles = ref([])
const folderPicked = ref(false)
const uploadProgress = ref({ done: 0, total: 0, current: '' })
const uploadResults = ref([])

// Reset state when modal opens
watch(() => modal.isOpen.value, (open) => {
  if (open) {
    mode.value = 'file'
    form.value = { category: '', tags: '', folder_id: '' }
    file.value = null
    error.value = ''
    mdFiles.value = []
    selectedFiles.value = []
    folderPicked.value = false
    uploadProgress.value = { done: 0, total: 0, current: '' }
    uploadResults.value = []
  }
})

// Escape to close
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

function onFileChange(e) { file.value = e.target.files[0] }
function onFolderChange(e) {
  folderPicked.value = true
  const files = Array.from(e.target.files)
  mdFiles.value = files
    .filter(f => /\.(md|markdown)$/i.test(f.name))
    .map(f => ({ path: f.webkitRelativePath || f.name, file: f }))
    .sort((a, b) => a.path.localeCompare(b.path))
  selectedFiles.value = []
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
.um-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}

.um-modal {
  background: var(--surface);
  border-radius: 10px;
  box-shadow: 0 16px 64px rgba(0,0,0,0.45);
  width: min(600px, 100%);
  max-height: 90vh;
  display: flex; flex-direction: column;
  overflow: hidden;
}

.um-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.85rem 1.25rem;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.um-title { font-weight: 700; font-size: 1rem; color: var(--text); }
.um-close {
  background: none; border: none; font-size: 1.1rem; cursor: pointer;
  color: var(--text3); padding: 0.15rem 0.35rem; border-radius: 4px; line-height: 1;
}
.um-close:hover { background: var(--hover-bg); color: var(--text); }

.um-body { padding: 1.25rem; overflow-y: auto; flex: 1; }

.mode-toggle { display: flex; margin-bottom: 1.25rem; }
.mode-toggle button { flex: 1; padding: 0.55rem 1rem; border: 1px solid var(--border2); background: var(--surface2); cursor: pointer; font-size: 0.9rem; color: var(--text); transition: all 0.15s; }
.mode-toggle button:first-child { border-radius: 6px 0 0 6px; }
.mode-toggle button:last-child { border-radius: 0 6px 6px 0; }
.mode-toggle button.active { background: var(--accent); color: white; border-color: var(--accent); }

.field { margin-bottom: 1rem; }
.field label { display: block; margin-bottom: 0.4rem; font-weight: 500; font-size: 0.88rem; color: var(--text); }
.field input, .field select { width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--border2); border-radius: 4px; box-sizing: border-box; font-size: 0.92rem; background: var(--surface2); color: var(--text); }

.file-list { border: 1px solid var(--border); border-radius: 6px; margin-bottom: 1rem; }
.file-list-header { padding: 0.5rem 0.75rem; background: var(--surface2); border-bottom: 1px solid var(--border); font-size: 0.85rem; color: var(--text); }
.file-list-items { max-height: 220px; overflow-y: auto; }
.checkbox-label { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.75rem; cursor: pointer; font-size: 0.85rem; color: var(--text); }
.checkbox-label:hover { background: var(--hover-bg); }
.file-path { flex: 1; word-break: break-all; }
.file-size { color: var(--text3); font-size: 0.78rem; white-space: nowrap; }
.empty-msg { color: var(--text3); font-style: italic; margin-bottom: 1rem; font-size: 0.88rem; }
.error-msg { color: var(--danger); margin-bottom: 1rem; font-size: 0.88rem; }

.progress-bar { position: relative; height: 26px; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; margin-bottom: 1rem; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.progress-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; color: var(--text); }

.upload-results { margin-bottom: 1rem; max-height: 160px; overflow-y: auto; font-size: 0.83rem; }
.result-item { padding: 0.25rem 0; }
.result-item.ok { color: #27ae60; }
.result-item.fail { color: var(--danger); }
.result-err { opacity: 0.8; }

.um-footer { display: flex; gap: 0.6rem; justify-content: flex-end; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.btn-cancel { padding: 0.5rem 1.1rem; background: var(--surface2); border: 1px solid var(--border2); border-radius: 5px; cursor: pointer; font-size: 0.9rem; color: var(--text); }
.btn-cancel:hover { background: var(--hover-bg); }
.btn-submit { padding: 0.5rem 1.4rem; background: var(--accent); color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.9rem; }
.btn-submit:hover { background: var(--accent-hover); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
