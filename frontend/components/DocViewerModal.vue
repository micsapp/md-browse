<template>
  <Teleport to="body">
    <div v-if="viewer.isOpen.value" class="dv-overlay" @click.self="viewer.closeDoc()">
      <div class="dv-modal" ref="modalEl" :style="modalStyle">

        <!-- Header / title bar (drag to move) -->
        <div class="dv-header" @mousedown.prevent="startDrag">
          <span class="dv-title">{{ doc?.title || 'Loading…' }}</span>
          <div class="dv-header-actions" @mousedown.stop>
            <button v-if="auth.user" @click="editing = !editing" class="dv-btn" :class="{ active: editing }">Edit</button>
            <button v-if="auth.user" @click="showVersions = !showVersions" class="dv-btn">History</button>
            <button v-if="auth.user" @click="downloadDoc" class="dv-btn">⬇</button>
            <button v-if="auth.user" @click="showSharePanel = !showSharePanel" class="dv-btn">Share</button>
            <button v-if="auth.user" @click="deleteDoc" class="dv-btn dv-btn-danger">Del</button>
            <button @click="viewer.closeDoc()" class="dv-close">✕</button>
          </div>
        </div>

        <!-- Body (scrollable) -->
        <div class="dv-body" v-if="pending">
          <div class="dv-loading">Loading…</div>
        </div>
        <div class="dv-body" v-else-if="!doc">
          <div class="dv-error">Document not found.</div>
        </div>
        <div class="dv-body" v-else>

          <!-- Meta -->
          <div class="dv-meta">
            <span v-if="doc.category">
              <NuxtLink :to="`/categories/${doc.category}`" @click="viewer.closeDoc()">{{ doc.category }}</NuxtLink>
            </span>
            <span v-for="tag in doc.tags" :key="tag">
              <NuxtLink :to="`/tags/${tag}`" @click="viewer.closeDoc()">#{{ tag }}</NuxtLink>
            </span>
            <span class="dv-meta-right">By {{ doc.created_by }} · {{ formatDate(doc.updated_at) }}
              <span v-if="doc.latest_version" class="dv-ver">v{{ doc.latest_version }}</span>
            </span>
          </div>

          <!-- Version history -->
          <div v-if="showVersions" class="dv-versions">
            <h4>Version History</h4>
            <div v-for="v in versions" :key="v.version_number" class="dv-ver-item">
              <span class="dv-ver-num">v{{ v.version_number }}</span>
              <span class="dv-ver-note">{{ v.change_note || 'No note' }}</span>
              <span class="dv-ver-date">{{ formatDate(v.created_at) }}</span>
              <button v-if="v.version_number !== doc.latest_version" @click="rollback(v.version_number)" class="dv-btn">Rollback</button>
            </div>
            <p v-if="!versions.length" class="dv-dimmed">No version history yet.</p>
          </div>

          <!-- Share panel -->
          <div v-if="showSharePanel" class="dv-share">
            <h4>Share Document</h4>
            <div class="dv-share-row">
              <label class="dv-share-label">
                <input type="checkbox" v-model="shareWithCode" /> Require access code
              </label>
              <input v-if="shareWithCode" v-model="shareCode" placeholder="Access code" class="dv-share-code" />
              <button @click="createNewShare" class="dv-btn dv-btn-accent">Create Link</button>
            </div>
            <div v-if="newShareUrl" class="dv-share-result">
              <div class="dv-share-url-row">
                <input :value="newShareUrl" readonly @click="$event.target.select()" />
                <button @click="copyShareUrl" class="dv-btn">{{ copied ? '✓' : 'Copy' }}</button>
              </div>
              <p v-if="newShareHasCode" class="dv-dimmed">🔒 Access code required</p>
            </div>
            <div v-if="shares.length" class="dv-share-list">
              <div v-for="s in shares" :key="s.id" class="dv-share-item">
                <span>{{ s.has_access_code ? '🔒' : '🔗' }} /share/{{ s.token.slice(0, 8) }}…</span>
                <span class="dv-dimmed">{{ formatDate(s.created_at) }}</span>
                <button @click="revokeShare(s.id)" class="dv-btn dv-btn-danger">Revoke</button>
              </div>
            </div>
          </div>

          <!-- Editor -->
          <div v-if="editing" class="dv-editor">
            <input v-model="editForm.title" placeholder="Title" />
            <input v-model="editForm.description" placeholder="Description" />
            <input v-model="editForm.category" placeholder="Category" />
            <input v-model="editForm.tagsInput" placeholder="Tags (comma separated)" />
            <div class="dv-mode-toggle">
              <button :class="{ active: editorMode === 'source' }" @click="editorMode = 'source'">Source</button>
              <button :class="{ active: editorMode === 'preview' }" @click="editorMode = 'preview'">Preview</button>
            </div>
            <textarea v-if="editorMode === 'source'" v-model="editForm.content_md" class="dv-textarea" />
            <div v-else class="dv-content dv-preview" v-html="editPreviewHtml" />
            <div class="dv-editor-actions">
              <input v-model="editForm.change_note" placeholder="Change note (optional)" />
              <button @click="saveEdit" class="dv-btn dv-btn-accent">Save</button>
            </div>
          </div>

          <!-- Rendered content -->
          <div v-else class="dv-content" v-html="renderedContent" />
        </div>

        <!-- Resize handle (bottom-right corner) -->
        <div class="dv-resize-se" @mousedown.prevent="startResize('se')"></div>
        <!-- Right edge -->
        <div class="dv-resize-e" @mousedown.prevent="startResize('e')"></div>
        <!-- Bottom edge -->
        <div class="dv-resize-s" @mousedown.prevent="startResize('s')"></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const viewer = useDocViewer()
const api = useApi()
const auth = useAuth()
const router = useRouter()

// ── Modal position/size ───────────────────────────────────────────────────────
const modalEl = ref(null)
const modalStyle = ref({})

function initModalStyle() {
  if (!import.meta.client) return
  const w = Math.min(900, window.innerWidth * 0.90)
  const h = Math.min(720, window.innerHeight * 0.85)
  const left = (window.innerWidth - w) / 2
  const top = (window.innerHeight - h) / 2
  modalStyle.value = {
    width: w + 'px',
    height: h + 'px',
    left: left + 'px',
    top: top + 'px',
  }
}

watch(() => viewer.isOpen.value, (open) => {
  if (open) nextTick(() => initModalStyle())
})

// ── Drag to move ──────────────────────────────────────────────────────────────
let dragging = false, dragStartX = 0, dragStartY = 0, dragStartLeft = 0, dragStartTop = 0

function startDrag(e) {
  if (!modalStyle.value.left) return
  dragging = true
  dragStartX = e.clientX; dragStartY = e.clientY
  dragStartLeft = parseInt(modalStyle.value.left)
  dragStartTop = parseInt(modalStyle.value.top)
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragUp)
}
function onDragMove(e) {
  if (!dragging) return
  modalStyle.value = {
    ...modalStyle.value,
    left: Math.max(0, dragStartLeft + (e.clientX - dragStartX)) + 'px',
    top: Math.max(0, dragStartTop + (e.clientY - dragStartY)) + 'px',
  }
}
function onDragUp() {
  dragging = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragUp)
}

// ── Resize ────────────────────────────────────────────────────────────────────
let resizing = false, resizeDir = '', resizeStartX = 0, resizeStartY = 0
let resizeStartW = 0, resizeStartH = 0

function startResize(dir) {
  resizing = true; resizeDir = dir
  resizeStartX = event.clientX; resizeStartY = event.clientY
  resizeStartW = parseInt(modalStyle.value.width)
  resizeStartH = parseInt(modalStyle.value.height)
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
}
function onResizeMove(e) {
  if (!resizing) return
  const dx = e.clientX - resizeStartX
  const dy = e.clientY - resizeStartY
  const update = { ...modalStyle.value }
  if (resizeDir === 'se' || resizeDir === 'e') update.width = Math.max(400, resizeStartW + dx) + 'px'
  if (resizeDir === 'se' || resizeDir === 's') update.height = Math.max(300, resizeStartH + dy) + 'px'
  modalStyle.value = update
}
function onResizeUp() {
  resizing = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragUp)
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
})

// ── Document data ─────────────────────────────────────────────────────────────
const doc = ref(null)
const pending = ref(false)
const editing = ref(false)
const showVersions = ref(false)
const showSharePanel = ref(false)
const editorMode = ref('source')
const editForm = ref({ title: '', description: '', category: '', tagsInput: '', content_md: '', change_note: '' })
const versions = ref([])
const shares = ref([])
const shareWithCode = ref(false)
const shareCode = ref('')
const newShareUrl = ref('')
const newShareHasCode = ref(false)
const copied = ref(false)

if (import.meta.client) {
  marked.setOptions({
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
      return hljs.highlightAuto(code).value
    }
  })
}

watch(() => viewer.docId.value, async (id) => {
  if (!id) { doc.value = null; return }
  pending.value = true
  editing.value = false
  showVersions.value = false
  showSharePanel.value = false
  versions.value = []
  newShareUrl.value = ''
  try { doc.value = await api.getDocument(id) }
  catch { doc.value = null }
  finally { pending.value = false }
}, { immediate: true })

watch(editing, (val) => {
  if (val && doc.value) {
    editForm.value = {
      title: doc.value.title,
      description: doc.value.description || '',
      category: doc.value.category || '',
      tagsInput: doc.value.tags?.join(', ') || '',
      content_md: doc.value.content_md || '',
      change_note: ''
    }
  }
})

watch(showVersions, async (val) => {
  if (val) {
    const res = await api.getVersions(viewer.docId.value)
    versions.value = res.versions || []
  }
})

watch(showSharePanel, (val) => { if (val) loadShares() })

const renderedContent = computed(() => {
  if (!doc.value) return ''
  let html = doc.value.content_html || marked(doc.value.content_md || '')
  html = html.replace(/(<img\s[^>]*src=")(?!https?:|data:|\/)(.*?)(")/g,
    `$1/api/v1/documents/${viewer.docId.value}/assets/$2$3`)
  return DOMPurify.sanitize(html)
})

const editPreviewHtml = computed(() => {
  if (!editForm.value.content_md) return ''
  let html = marked(editForm.value.content_md)
  html = html.replace(/(<img\s[^>]*src=")(?!https?:|data:|\/)(.*?)(")/g,
    `$1/api/v1/documents/${viewer.docId.value}/assets/$2$3`)
  return DOMPurify.sanitize(html)
})

function formatDate(d) { return d ? new Date(d).toLocaleDateString() : '' }

async function saveEdit() {
  await api.updateDocument(viewer.docId.value, {
    title: editForm.value.title,
    description: editForm.value.description,
    category: editForm.value.category,
    tags: editForm.value.tagsInput.split(',').map(t => t.trim()).filter(Boolean),
    content_md: editForm.value.content_md,
    change_note: editForm.value.change_note
  })
  editing.value = false
  doc.value = await api.getDocument(viewer.docId.value)
}

async function rollback(targetVersion) {
  if (!confirm(`Roll back to version ${targetVersion}?`)) return
  await api.rollbackDocument(viewer.docId.value, targetVersion, `Rollback to v${targetVersion}`)
  showVersions.value = false
  doc.value = await api.getDocument(viewer.docId.value)
}

async function deleteDoc() {
  if (!confirm('Delete this document?')) return
  await api.deleteDocument(viewer.docId.value)
  viewer.closeDoc()
  useFolderPanel().notifyFolderChange()
}

async function downloadDoc() { await api.downloadDocument(viewer.docId.value) }

async function createNewShare() {
  const res = await api.createShare(viewer.docId.value, shareWithCode.value ? shareCode.value : null)
  newShareUrl.value = `${window.location.origin}/share/${res.token}`
  newShareHasCode.value = res.has_access_code
  shareCode.value = ''
  shareWithCode.value = false
  await loadShares()
}
async function loadShares() { shares.value = await api.getShares(viewer.docId.value) }
async function revokeShare(shareId) {
  if (!confirm('Revoke this share link?')) return
  await api.deleteShare(shareId)
  await loadShares()
}
async function copyShareUrl() {
  await navigator.clipboard.writeText(newShareUrl.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

// Close on Escape key
if (import.meta.client) {
  const onKeydown = (e) => { if (e.key === 'Escape' && viewer.isOpen.value) viewer.closeDoc() }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}
</script>

<style scoped>
.dv-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 800;
}

.dv-modal {
  position: fixed;
  background: var(--surface);
  border-radius: 8px;
  box-shadow: 0 16px 64px rgba(0,0,0,0.4);
  display: flex; flex-direction: column;
  overflow: hidden;
  z-index: 801;
  min-width: 320px; min-height: 240px;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.dv-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
  cursor: move;
  flex-shrink: 0;
  user-select: none;
}
.dv-title {
  flex: 1; font-weight: 600; font-size: 0.95rem; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dv-header-actions { display: flex; gap: 0.3rem; align-items: center; flex-shrink: 0; }

.dv-btn {
  padding: 0.2rem 0.55rem; font-size: 0.78rem;
  border: 1px solid var(--border2); border-radius: 4px;
  cursor: pointer; background: var(--surface); color: var(--text);
  white-space: nowrap;
}
.dv-btn:hover { background: var(--hover-bg); }
.dv-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
.dv-btn-accent { background: var(--accent); color: white; border-color: var(--accent); }
.dv-btn-accent:hover { background: var(--accent-hover); }
.dv-btn-danger { border-color: var(--danger); color: var(--danger); }
.dv-btn-danger:hover { background: var(--danger); color: white; }

.dv-close {
  background: none; border: none; font-size: 1.1rem; cursor: pointer;
  color: var(--text3); padding: 0.1rem 0.3rem; border-radius: 4px; line-height: 1;
}
.dv-close:hover { background: var(--hover-bg); color: var(--text); }

/* ── Body ────────────────────────────────────────────────────────────────── */
.dv-body {
  flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem;
}
.dv-loading, .dv-error { text-align: center; padding: 2rem; color: var(--text3); }

.dv-meta {
  display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center;
  margin-bottom: 1rem; font-size: 0.82rem;
}
.dv-meta a { color: var(--accent); text-decoration: none; background: var(--surface2); padding: 0.1rem 0.4rem; border-radius: 3px; }
.dv-meta a:hover { text-decoration: underline; }
.dv-meta-right { margin-left: auto; color: var(--text3); }
.dv-ver { background: var(--active-bg); color: var(--active-color); padding: 0.1rem 0.35rem; border-radius: 3px; margin-left: 0.3rem; font-size: 0.78rem; }

/* ── Versions ────────────────────────────────────────────────────────────── */
.dv-versions {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 6px;
  padding: 0.75rem; margin-bottom: 1rem;
}
.dv-versions h4 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--text); }
.dv-ver-item { display: flex; gap: 0.75rem; align-items: center; padding: 0.35rem 0; font-size: 0.85rem; border-top: 1px solid var(--border); }
.dv-ver-num { font-weight: bold; color: var(--accent); min-width: 2rem; }
.dv-ver-note { flex: 1; color: var(--text2); }
.dv-ver-date { color: var(--text3); white-space: nowrap; }

/* ── Share ───────────────────────────────────────────────────────────────── */
.dv-share {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 6px;
  padding: 0.75rem; margin-bottom: 1rem;
}
.dv-share h4 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--text); }
.dv-share-row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.5rem; }
.dv-share-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; cursor: pointer; color: var(--text); }
.dv-share-code { padding: 0.3rem 0.5rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.85rem; width: 140px; background: var(--surface); color: var(--text); }
.dv-share-result { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 0.5rem; margin-bottom: 0.5rem; }
.dv-share-url-row { display: flex; gap: 0.3rem; }
.dv-share-url-row input { flex: 1; padding: 0.3rem 0.4rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.82rem; font-family: monospace; background: var(--surface2); color: var(--text); }
.dv-share-list { border-top: 1px solid var(--border); padding-top: 0.4rem; }
.dv-share-item { display: flex; gap: 0.5rem; align-items: center; padding: 0.3rem 0; font-size: 0.82rem; color: var(--text2); }
.dv-dimmed { color: var(--text3); font-size: 0.82rem; margin: 0.2rem 0 0; }

/* ── Editor ──────────────────────────────────────────────────────────────── */
.dv-editor { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1rem; }
.dv-editor input { padding: 0.4rem 0.5rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.88rem; background: var(--surface2); color: var(--text); }
.dv-textarea { padding: 0.5rem; border: 1px solid var(--border2); border-radius: 4px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 0.88rem; line-height: 1.5; tab-size: 2; background: var(--surface2); color: var(--text); resize: vertical; min-height: 200px; }
.dv-mode-toggle { display: flex; border: 1px solid var(--border2); border-radius: 4px; overflow: hidden; width: fit-content; }
.dv-mode-toggle button { padding: 0.3rem 0.7rem; border: none; background: var(--surface2); cursor: pointer; font-size: 0.82rem; color: var(--text); }
.dv-mode-toggle button.active { background: var(--accent); color: white; }
.dv-preview { min-height: 200px; border: 1px solid var(--border2); border-radius: 4px; padding: 0.75rem; background: var(--surface); }
.dv-editor-actions { display: flex; gap: 0.4rem; }
.dv-editor-actions input { flex: 1; }

/* ── Content ─────────────────────────────────────────────────────────────── */
.dv-content { line-height: 1.8; color: var(--text); }
.dv-content :deep(h1), .dv-content :deep(h2), .dv-content :deep(h3) { margin: 1.5rem 0 0.5rem; color: var(--text); }
.dv-content :deep(p) { margin-bottom: 1rem; }
.dv-content :deep(pre) { background: var(--surface2); padding: 1rem; border-radius: 4px; overflow-x: auto; }
.dv-content :deep(code) { font-family: 'Fira Code', monospace; font-size: 0.9em; }
.dv-content :deep(ul), .dv-content :deep(ol) { margin-left: 1.5rem; margin-bottom: 1rem; }
.dv-content :deep(blockquote) { border-left: 4px solid var(--accent); padding-left: 1rem; margin: 1rem 0; color: var(--text2); }
.dv-content :deep(a) { color: var(--accent); }
.dv-content :deep(table) { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
.dv-content :deep(th), .dv-content :deep(td) { border: 1px solid var(--border2); padding: 0.4rem 0.6rem; }
.dv-content :deep(th) { background: var(--surface2); }
.dv-content :deep(img) { max-width: 100%; border-radius: 4px; }

/* ── Resize handles ──────────────────────────────────────────────────────── */
.dv-resize-se {
  position: absolute; bottom: 0; right: 0;
  width: 16px; height: 16px; cursor: se-resize; z-index: 10;
}
.dv-resize-se::after {
  content: '';
  position: absolute; bottom: 3px; right: 3px;
  width: 8px; height: 8px;
  border-right: 2px solid var(--border2);
  border-bottom: 2px solid var(--border2);
  border-radius: 1px;
}
.dv-resize-e {
  position: absolute; top: 40px; right: 0;
  width: 5px; height: calc(100% - 56px);
  cursor: ew-resize; z-index: 10;
}
.dv-resize-e:hover { background: var(--accent); opacity: 0.3; }
.dv-resize-s {
  position: absolute; bottom: 0; left: 16px;
  width: calc(100% - 32px); height: 5px;
  cursor: ns-resize; z-index: 10;
}
.dv-resize-s:hover { background: var(--accent); opacity: 0.3; }

/* ── Mobile ──────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .dv-modal {
    position: fixed !important;
    left: 0 !important; top: 0 !important;
    width: 100vw !important; height: 100dvh !important;
    border-radius: 0;
  }
  .dv-resize-se, .dv-resize-e, .dv-resize-s { display: none; }
  .dv-header { cursor: default; }
}
</style>
