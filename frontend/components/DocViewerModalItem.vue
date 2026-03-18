<template>
  <div
    class="dv-modal"
    :class="{ 'dv-modal--mobile': mobile }"
    :style="modalStyle"
    @mousedown.capture="onModalMousedown"
  >
    <!-- Header / drag handle -->
    <div class="dv-header" @mousedown.prevent="!mobile && startDrag($event)">
      <span class="dv-title">{{ doc?.title || 'Loading…' }}</span>
      <div class="dv-header-actions" @mousedown.stop>
        <button v-if="auth.user" @click="editing = !editing" class="dv-btn" :class="{ active: editing }">Edit</button>
        <button v-if="auth.user" @click="showVersions = !showVersions" class="dv-btn">History</button>
        <button v-if="auth.user" @click="downloadDoc" class="dv-btn">⬇</button>
        <button v-if="auth.user" @click="showSharePanel = !showSharePanel" class="dv-btn">Share</button>
        <button v-if="auth.user" @click="deleteDoc" class="dv-btn dv-btn-danger">Del</button>
        <button @click="viewer.closeDoc(modal.uid)" class="dv-close">✕</button>
      </div>
    </div>

    <!-- Scrollable body -->
    <div class="dv-body" v-if="pending">
      <div class="dv-status">Loading…</div>
    </div>
    <div class="dv-body" v-else-if="!doc">
      <div class="dv-status">Document not found.</div>
    </div>
    <div class="dv-body" v-else>

      <div class="dv-meta">
        <NuxtLink v-if="doc.category" :to="`/categories/${doc.category}`" @click="viewer.closeDoc(modal.uid)" class="dv-tag">{{ doc.category }}</NuxtLink>
        <NuxtLink v-for="tag in doc.tags" :key="tag" :to="`/tags/${tag}`" @click="viewer.closeDoc(modal.uid)" class="dv-tag">#{{ tag }}</NuxtLink>
        <span class="dv-meta-right">
          {{ doc.created_by }} · {{ formatDate(doc.updated_at) }}
          <span v-if="doc.latest_version" class="dv-ver">v{{ doc.latest_version }}</span>
        </span>
      </div>

      <!-- Version history -->
      <div v-if="showVersions" class="dv-panel">
        <h4>Version History</h4>
        <div v-for="v in versions" :key="v.version_number" class="dv-ver-row">
          <span class="dv-ver-num">v{{ v.version_number }}</span>
          <span class="dv-ver-note">{{ v.change_note || 'No note' }}</span>
          <span class="dv-dimmed">{{ formatDate(v.created_at) }}</span>
          <button v-if="v.version_number !== doc.latest_version" @click="rollback(v.version_number)" class="dv-btn">Rollback</button>
        </div>
        <p v-if="!versions.length" class="dv-dimmed">No version history yet.</p>
      </div>

      <!-- Share panel -->
      <div v-if="showSharePanel" class="dv-panel">
        <h4>Share Document</h4>
        <div class="dv-share-row">
          <label class="dv-share-label"><input type="checkbox" v-model="shareWithCode" /> Require access code</label>
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
            <span class="dv-share-icon">{{ s.has_access_code ? '🔒' : '🔗' }}</span>
            <input :value="shareUrl(s.token)" readonly @click="$event.target.select()" class="dv-share-item-url" />
            <span class="dv-dimmed">{{ formatDate(s.created_at) }}</span>
            <button @click="copyUrl(s.token, s.id)" class="dv-btn">{{ copiedId === s.id ? '✓' : 'Copy' }}</button>
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

      <!-- Rendered markdown -->
      <div v-else class="dv-content" v-html="renderedContent" />
    </div>

    <!-- Resize handles (desktop only) -->
    <template v-if="!mobile">
      <div class="dv-resize-e"  @mousedown.prevent.stop="startResize('e', $event)"></div>
      <div class="dv-resize-s"  @mousedown.prevent.stop="startResize('s', $event)"></div>
      <div class="dv-resize-se" @mousedown.prevent.stop="startResize('se', $event)"></div>
    </template>
  </div>
</template>

<script setup>
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const props = defineProps({
  modal: { type: Object, required: true },
  mobile: { type: Boolean, default: false },
})

const viewer = useDocViewer()
const api = useApi()
const auth = useAuth()
const router = useRouter()

// ── Style ─────────────────────────────────────────────────────────────────────
const modalStyle = computed(() => {
  if (props.mobile) return { zIndex: props.modal.zIndex }
  return {
    left: props.modal.x + 'px',
    top: props.modal.y + 'px',
    width: props.modal.width + 'px',
    height: props.modal.height + 'px',
    zIndex: props.modal.zIndex,
  }
})

function onModalMousedown() {
  viewer.focusModal(props.modal.uid)
}

// ── Drag to move ──────────────────────────────────────────────────────────────
let dragging = false, _dragStartX = 0, _dragStartY = 0, _dragStartLeft = 0, _dragStartTop = 0

function startDrag(e) {
  dragging = true
  _dragStartX = e.clientX; _dragStartY = e.clientY
  _dragStartLeft = props.modal.x; _dragStartTop = props.modal.y
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragUp)
}
function onDragMove(e) {
  if (!dragging) return
  viewer.updateModal(props.modal.uid, {
    x: Math.max(0, _dragStartLeft + (e.clientX - _dragStartX)),
    y: Math.max(0, _dragStartTop + (e.clientY - _dragStartY)),
  })
}
function onDragUp() {
  dragging = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragUp)
}

// ── Resize ────────────────────────────────────────────────────────────────────
let resizing = false, resizeDir = '', _resStartX = 0, _resStartY = 0, _resStartW = 0, _resStartH = 0

function startResize(dir, e) {
  resizing = true; resizeDir = dir
  _resStartX = e.clientX; _resStartY = e.clientY
  _resStartW = props.modal.width; _resStartH = props.modal.height
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
}
function onResizeMove(e) {
  if (!resizing) return
  const dx = e.clientX - _resStartX, dy = e.clientY - _resStartY
  const updates = {}
  if (resizeDir === 'e' || resizeDir === 'se') updates.width = Math.max(380, _resStartW + dx)
  if (resizeDir === 's' || resizeDir === 'se') updates.height = Math.max(280, _resStartH + dy)
  viewer.updateModal(props.modal.uid, updates)
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
const copiedId = ref(null)

if (import.meta.client) {
  marked.setOptions({
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
      return hljs.highlightAuto(code).value
    }
  })
}

watch(() => props.modal.docId, async (id) => {
  if (!id) { doc.value = null; return }
  pending.value = true
  editing.value = false; showVersions.value = false; showSharePanel.value = false
  versions.value = []; newShareUrl.value = ''
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
    const res = await api.getVersions(props.modal.docId)
    versions.value = res.versions || []
  }
})

watch(showSharePanel, (val) => { if (val) loadShares() })

const renderedContent = computed(() => {
  if (!doc.value) return ''
  let html = doc.value.content_html || marked(doc.value.content_md || '')
  html = html.replace(/(<img\s[^>]*src=")(?!https?:|data:|\/)(.*?)(")/g,
    `$1/api/v1/documents/${props.modal.docId}/assets/$2$3`)
  return DOMPurify.sanitize(html)
})

const editPreviewHtml = computed(() => {
  if (!editForm.value.content_md) return ''
  let html = marked(editForm.value.content_md)
  html = html.replace(/(<img\s[^>]*src=")(?!https?:|data:|\/)(.*?)(")/g,
    `$1/api/v1/documents/${props.modal.docId}/assets/$2$3`)
  return DOMPurify.sanitize(html)
})

function formatDate(d) { return d ? new Date(d).toLocaleDateString() : '' }

async function saveEdit() {
  await api.updateDocument(props.modal.docId, {
    title: editForm.value.title,
    description: editForm.value.description,
    category: editForm.value.category,
    tags: editForm.value.tagsInput.split(',').map(t => t.trim()).filter(Boolean),
    content_md: editForm.value.content_md,
    change_note: editForm.value.change_note
  })
  editing.value = false
  doc.value = await api.getDocument(props.modal.docId)
}

async function rollback(targetVersion) {
  if (!confirm(`Roll back to version ${targetVersion}?`)) return
  await api.rollbackDocument(props.modal.docId, targetVersion, `Rollback to v${targetVersion}`)
  showVersions.value = false
  doc.value = await api.getDocument(props.modal.docId)
}

async function deleteDoc() {
  if (!confirm('Delete this document?')) return
  await api.deleteDocument(props.modal.docId)
  viewer.closeDoc(props.modal.uid)
  useFolderPanel().notifyFolderChange()
}

async function downloadDoc() { await api.downloadDocument(props.modal.docId) }

async function createNewShare() {
  const res = await api.createShare(props.modal.docId, shareWithCode.value ? shareCode.value : null)
  newShareUrl.value = `${window.location.origin}/share/${res.token}`
  newShareHasCode.value = res.has_access_code
  shareCode.value = ''; shareWithCode.value = false
  await loadShares()
}
async function loadShares() { shares.value = await api.getShares(props.modal.docId) }
async function revokeShare(shareId) {
  if (!confirm('Revoke this share link?')) return
  await api.deleteShare(shareId)
  await loadShares()
}
function shareUrl(token) {
  return `${window.location.origin}/share/${token}`
}

async function copyShareUrl() {
  await navigator.clipboard.writeText(newShareUrl.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

async function copyUrl(token, id) {
  await navigator.clipboard.writeText(shareUrl(token))
  copiedId.value = id
  setTimeout(() => { copiedId.value = null }, 2000)
}
</script>

<style scoped>
.dv-modal {
  position: fixed;
  background: var(--surface);
  border-radius: 8px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.35);
  display: flex; flex-direction: column;
  overflow: hidden;
  min-width: 320px; min-height: 240px;
  border: 1px solid var(--border2);
}

/* Mobile: full screen */
.dv-modal--mobile {
  left: 0 !important; top: 0 !important;
  width: 100vw !important; height: 100dvh !important;
  border-radius: 0;
  border: none;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.dv-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
  cursor: move;
  flex-shrink: 0;
  user-select: none;
}
.dv-modal--mobile .dv-header { cursor: default; }
.dv-title {
  flex: 1; font-weight: 600; font-size: 0.92rem; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dv-header-actions { display: flex; gap: 0.3rem; align-items: center; flex-shrink: 0; }

.dv-btn {
  padding: 0.18rem 0.5rem; font-size: 0.76rem;
  border: 1px solid var(--border2); border-radius: 4px;
  cursor: pointer; background: var(--surface); color: var(--text); white-space: nowrap;
}
.dv-btn:hover { background: var(--hover-bg); }
.dv-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
.dv-btn-accent { background: var(--accent); color: white; border-color: var(--accent); }
.dv-btn-accent:hover { background: var(--accent-hover); }
.dv-btn-danger { border-color: var(--danger); color: var(--danger); }
.dv-btn-danger:hover { background: var(--danger); color: white; }

.dv-close {
  background: none; border: none; font-size: 1.05rem; cursor: pointer;
  color: var(--text3); padding: 0.1rem 0.3rem; border-radius: 4px; line-height: 1;
}
.dv-close:hover { background: var(--hover-bg); color: var(--text); }

/* ── Body ────────────────────────────────────────────────────────────────── */
.dv-body { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; }
.dv-status { text-align: center; padding: 2rem; color: var(--text3); }

.dv-meta {
  display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center;
  margin-bottom: 1rem; font-size: 0.8rem;
}
.dv-tag { color: var(--accent); text-decoration: none; background: var(--surface2); padding: 0.1rem 0.4rem; border-radius: 3px; }
.dv-tag:hover { text-decoration: underline; }
.dv-meta-right { margin-left: auto; color: var(--text3); }
.dv-ver { background: var(--active-bg); color: var(--active-color); padding: 0.1rem 0.3rem; border-radius: 3px; margin-left: 0.3rem; font-size: 0.76rem; }

/* ── Panels ──────────────────────────────────────────────────────────────── */
.dv-panel { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; }
.dv-panel h4 { margin: 0 0 0.5rem; font-size: 0.88rem; color: var(--text); }
.dv-ver-row { display: flex; gap: 0.6rem; align-items: center; padding: 0.3rem 0; font-size: 0.82rem; border-top: 1px solid var(--border); }
.dv-ver-num { font-weight: bold; color: var(--accent); min-width: 2rem; }
.dv-ver-note { flex: 1; color: var(--text2); }
.dv-dimmed { color: var(--text3); font-size: 0.8rem; }

.dv-share-row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.5rem; }
.dv-share-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.83rem; cursor: pointer; color: var(--text); }
.dv-share-code { padding: 0.28rem 0.45rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.83rem; width: 130px; background: var(--surface); color: var(--text); }
.dv-share-result { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 0.45rem; margin-bottom: 0.4rem; }
.dv-share-url-row { display: flex; gap: 0.3rem; }
.dv-share-url-row input { flex: 1; padding: 0.28rem 0.4rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.8rem; font-family: monospace; background: var(--surface2); color: var(--text); }
.dv-share-list { border-top: 1px solid var(--border); padding-top: 0.4rem; }
.dv-share-item { display: flex; gap: 0.4rem; align-items: center; padding: 0.25rem 0; font-size: 0.8rem; color: var(--text2); flex-wrap: wrap; }
.dv-share-icon { flex-shrink: 0; }
.dv-share-item-url { flex: 1; min-width: 0; padding: 0.2rem 0.35rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.75rem; font-family: monospace; background: var(--surface2); color: var(--text); cursor: text; }

/* ── Editor ──────────────────────────────────────────────────────────────── */
.dv-editor { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; }
.dv-editor input { padding: 0.38rem 0.5rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.86rem; background: var(--surface2); color: var(--text); }
.dv-textarea { padding: 0.5rem; border: 1px solid var(--border2); border-radius: 4px; font-family: 'Fira Code', monospace; font-size: 0.86rem; line-height: 1.5; background: var(--surface2); color: var(--text); resize: vertical; min-height: 180px; }
.dv-mode-toggle { display: flex; border: 1px solid var(--border2); border-radius: 4px; overflow: hidden; width: fit-content; }
.dv-mode-toggle button { padding: 0.28rem 0.65rem; border: none; background: var(--surface2); cursor: pointer; font-size: 0.8rem; color: var(--text); }
.dv-mode-toggle button.active { background: var(--accent); color: white; }
.dv-preview { min-height: 180px; border: 1px solid var(--border2); border-radius: 4px; padding: 0.75rem; background: var(--surface); }
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
  width: 18px; height: 18px; cursor: se-resize; z-index: 10;
}
.dv-resize-se::after {
  content: '';
  position: absolute; bottom: 3px; right: 3px;
  width: 9px; height: 9px;
  border-right: 2px solid var(--border2);
  border-bottom: 2px solid var(--border2);
  border-radius: 1px;
}
.dv-resize-e {
  position: absolute; top: 40px; right: 0;
  width: 5px; height: calc(100% - 58px); cursor: ew-resize; z-index: 10;
}
.dv-resize-e:hover { background: var(--accent); opacity: 0.3; }
.dv-resize-s {
  position: absolute; bottom: 0; left: 18px;
  height: 5px; width: calc(100% - 36px); cursor: ns-resize; z-index: 10;
}
.dv-resize-s:hover { background: var(--accent); opacity: 0.3; }
</style>
