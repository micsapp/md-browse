<template>
  <div
    class="dv-modal"
    :class="{ 'dv-modal--mobile': mobile, 'dv-modal--fullscreen': isFullscreen }"
    :style="modalStyle"
    @mousedown.capture="onModalMousedown"
  >
    <!-- Header / drag handle -->
    <div class="dv-header" @mousedown.prevent="!mobile && !isFullscreen && startDrag($event)">
      <div class="dv-title-group">
        <span class="dv-doc-icon">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-doc"/></svg>
        </span>
        <span class="dv-title" :title="doc?.title">{{ doc?.title || 'Loading…' }}</span>
      </div>
      <div class="dv-header-actions" @mousedown.stop>
        <button
          v-if="tocItems.length && !editing"
          type="button"
          class="dv-btn"
          :class="{ active: showToc }"
          title="Toggle Table of Contents"
          @click="showToc = !showToc"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-toc"/></svg>
          <span class="dv-btn-label">Outline</span>
        </button>
        <button
          v-if="auth.user"
          type="button"
          class="dv-btn"
          :class="{ active: editing }"
          title="Edit document"
          @click="editing = !editing"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-edit"/></svg>
          <span class="dv-btn-label">{{ editing ? 'Close Editor' : 'Edit' }}</span>
        </button>
        <button
          v-if="auth.user"
          type="button"
          class="dv-btn"
          :class="{ active: showVersions }"
          title="Version history"
          @click="showVersions = !showVersions"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-history"/></svg>
          <span class="dv-btn-label">History</span>
        </button>
        <button
          v-if="auth.user"
          type="button"
          class="dv-btn"
          :class="{ active: showSharePanel }"
          title="Share document"
          @click="showSharePanel = !showSharePanel"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-share"/></svg>
          <span class="dv-btn-label">Share</span>
        </button>
        <button
          v-if="auth.user"
          type="button"
          class="dv-btn"
          title="Download Markdown"
          @click="downloadDoc"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-download"/></svg>
        </button>
        <NuxtLink
          v-if="doc?.id"
          :to="`/documents/${doc.id}`"
          class="dv-btn"
          title="Open full page view"
          @click="viewer.closeDoc(modal.uid)"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-external"/></svg>
        </NuxtLink>
        <button
          v-if="auth.user"
          type="button"
          class="dv-btn dv-btn-danger"
          title="Delete document"
          @click="deleteDoc"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-trash"/></svg>
        </button>
        <button
          v-if="!mobile"
          type="button"
          class="dv-btn"
          :class="{ active: isFullscreen }"
          :title="isFullscreen ? 'Restore window size' : 'Maximize window'"
          @click="toggleFullscreen"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true">
            <use :href="isFullscreen ? '#ui-minimize' : '#ui-maximize'"/>
          </svg>
        </button>
        <button
          type="button"
          class="dv-close"
          title="Close (Esc)"
          aria-label="Close document viewer"
          @click="viewer.closeDoc(modal.uid)"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-close"/></svg>
        </button>
      </div>
    </div>

    <!-- Scrollable body -->
    <div v-if="pending" class="dv-body">
      <div class="dv-status">Loading document…</div>
    </div>
    <div v-else-if="!doc" class="dv-body">
      <div class="dv-status">Document not found.</div>
    </div>
    <div v-else class="dv-body">
      <!-- Metadata Strip -->
      <div class="dv-meta">
        <NuxtLink
          v-if="doc.category"
          :to="`/categories/${doc.category}`"
          class="pill pill-accent"
          @click="viewer.closeDoc(modal.uid)"
        >
          {{ doc.category }}
        </NuxtLink>
        <NuxtLink
          v-for="tag in doc.tags"
          :key="tag"
          :to="`/tags/${tag}`"
          class="pill"
          @click="viewer.closeDoc(modal.uid)"
        >
          #{{ tag }}
        </NuxtLink>
        <span class="dv-meta-right">
          <span v-if="doc.created_by">By <strong>{{ doc.created_by }}</strong> · </span>
          <span>{{ formatDate(doc.updated_at) }}</span>
          <span v-if="doc.latest_version" class="pill pill-accent dv-ver">v{{ doc.latest_version }}</span>
          <span v-if="doc.token_count_estimate" class="pill">~{{ doc.token_count_estimate }} tokens</span>
        </span>
      </div>

      <!-- Version history -->
      <div v-if="showVersions" class="dv-panel">
        <div class="dv-panel-head">
          <h4>Version History</h4>
          <button type="button" class="btn btn-xs btn-ghost" @click="showVersions = false">Close</button>
        </div>
        <div v-for="v in versions" :key="v.version_number" class="dv-ver-row">
          <span class="pill pill-accent">v{{ v.version_number }}</span>
          <span class="dv-ver-note">{{ v.change_note || 'No change note' }}</span>
          <span class="dv-dimmed">{{ formatDate(v.created_at) }}</span>
          <button
            v-if="v.version_number !== doc.latest_version"
            type="button"
            class="btn btn-xs"
            @click="rollback(v.version_number)"
          >
            Rollback
          </button>
        </div>
        <p v-if="!versions.length" class="dv-dimmed">No version history yet.</p>
      </div>

      <!-- Share panel -->
      <div v-if="showSharePanel" class="dv-panel">
        <div class="dv-panel-head">
          <h4>Share Document</h4>
          <button type="button" class="btn btn-xs btn-ghost" @click="showSharePanel = false">Close</button>
        </div>
        <div class="dv-share-row">
          <input
            v-model="shareSlug"
            placeholder="Custom URL slug (optional, e.g. release-notes)"
            class="input-control dv-share-slug"
          />
          <label class="dv-share-label">
            <input v-model="shareWithCode" type="checkbox" />
            <span>Require access code</span>
          </label>
          <input
            v-if="shareWithCode"
            v-model="shareCode"
            placeholder="Access code"
            class="input-control dv-share-code"
          />
          <button type="button" class="btn btn-sm btn-primary" @click="createNewShare">Create Link</button>
        </div>
        <p v-if="slugCheck.message" class="dv-slug-status" :class="slugCheck.ok ? 'dv-slug-ok' : 'dv-slug-bad'">
          {{ slugCheck.message }}
          <button
            v-if="slugCheck.suggestion"
            type="button"
            class="btn btn-xs btn-soft"
            @click="shareSlug = slugCheck.suggestion"
          >
            Use “{{ slugCheck.suggestion }}”
          </button>
        </p>
        <p v-if="shareError" class="dv-share-error">{{ shareError }}</p>
        <div v-if="newShareUrl" class="dv-share-result">
          <div class="dv-share-url-row">
            <input :value="newShareUrl" readonly class="input-control" @click="$event.target.select()" />
            <button type="button" class="btn btn-sm btn-primary" @click="copyShareUrl">
              {{ copied ? '✓ Copied' : 'Copy' }}
            </button>
          </div>
          <p v-if="newShareHasCode" class="dv-dimmed" style="margin-top:6px;">Protected with access code</p>
        </div>
        <div v-if="shares.length" class="dv-share-list">
          <div v-for="s in shares" :key="s.id" class="dv-share-item">
            <span class="pill" :class="s.has_access_code ? 'pill-warning' : 'pill-success'">
              {{ s.has_access_code ? 'Code' : 'Public' }}
            </span>
            <input
              :value="shareUrl(s)"
              readonly
              class="input-control dv-share-item-url"
              @click="$event.target.select()"
            />
            <span class="dv-dimmed">{{ formatDate(s.created_at) }}</span>
            <button type="button" class="btn btn-xs" @click="copyUrl(s)">
              {{ copiedId === s.id ? '✓' : 'Copy' }}
            </button>
            <button
              type="button"
              class="btn btn-xs"
              :title="s.slug ? 'Rename custom URL' : 'Add custom URL'"
              @click="renameShare(s)"
            >
              {{ s.slug ? 'Rename' : 'Alias' }}
            </button>
            <button type="button" class="btn btn-xs btn-danger" @click="revokeShare(s.id)">Revoke</button>
          </div>
        </div>
      </div>

      <!-- Editor (Source / Split / Preview) -->
      <div v-if="editing" class="dv-editor">
        <div class="dv-editor-meta-grid">
          <input v-model="editForm.title" class="input-control" placeholder="Document Title" />
          <input v-model="editForm.category" class="input-control" placeholder="Category" />
          <input v-model="editForm.description" class="input-control" placeholder="Short description" />
          <input v-model="editForm.tagsInput" class="input-control" placeholder="Tags (comma separated)" />
        </div>
        <div class="dv-editor-toolbar">
          <div class="dv-mode-toggle">
            <button type="button" :class="{ active: editorMode === 'source' }" @click="editorMode = 'source'">Markdown</button>
            <button v-if="!mobile" type="button" :class="{ active: editorMode === 'split' }" @click="editorMode = 'split'">Split View</button>
            <button type="button" :class="{ active: editorMode === 'preview' }" @click="editorMode = 'preview'">Preview</button>
          </div>
        </div>
        <div class="dv-editor-panes" :class="{ 'dv-editor-panes--split': editorMode === 'split' && !mobile }">
          <textarea
            v-if="editorMode === 'source' || (editorMode === 'split' && !mobile)"
            v-model="editForm.content_md"
            class="textarea-control dv-textarea"
            placeholder="Write markdown here…"
          />
          <div
            v-if="editorMode === 'preview' || (editorMode === 'split' && !mobile)"
            ref="previewEl"
            class="markdown-body dv-preview"
            v-html="editPreviewHtml"
            @click="handleAnchorClick"
          />
        </div>
        <div class="dv-editor-actions">
          <input v-model="editForm.change_note" class="input-control" placeholder="Version change note (optional)" />
          <button type="button" class="btn" @click="editing = false">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveEdit">Save Changes</button>
        </div>
      </div>

      <!-- Rendered Markdown + Optional TOC Sidebar -->
      <div v-else class="dv-reader-layout" :class="{ 'dv-reader-layout--toc': showToc && tocItems.length }">
        <aside v-if="showToc && tocItems.length" class="dv-toc">
          <p class="dv-toc-title">On this page</p>
          <nav>
            <a
              v-for="item in tocItems"
              :key="item.id"
              :href="`#${item.id}`"
              :class="`dv-toc-link dv-toc-level-${item.level}`"
              @click.prevent="scrollToHeading(item.id)"
            >
              {{ item.text }}
            </a>
          </nav>
        </aside>
        <div
          ref="contentEl"
          class="markdown-body dv-content"
          v-html="renderedContent"
          @click="handleAnchorClick"
        />
      </div>
    </div>

    <!-- Resize handles (desktop only, not in fullscreen) -->
    <template v-if="!mobile && !isFullscreen">
      <div class="dv-resize-e" @mousedown.prevent.stop="startResize('e', $event)"></div>
      <div class="dv-resize-s" @mousedown.prevent.stop="startResize('s', $event)"></div>
      <div class="dv-resize-se" @mousedown.prevent.stop="startResize('se', $event)"></div>
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  modal: { type: Object, required: true },
  mobile: { type: Boolean, default: false },
})

const viewer = useDocViewer()
const api = useApi()
const auth = useAuth()
const { render: renderMermaid } = useMermaid()
const { renderDocHtml, extractToc, handleAnchorClick } = useMarkdown()

const contentEl = ref(null)
const previewEl = ref(null)
const showToc = ref(false)

// ── Fullscreen ────────────────────────────────────────────────────────────────
const isFullscreen = ref(false)
const savedBounds = ref(null)

function toggleFullscreen() {
  if (isFullscreen.value) {
    if (savedBounds.value) {
      viewer.updateModal(props.modal.uid, savedBounds.value)
      savedBounds.value = null
    }
    isFullscreen.value = false
  } else {
    savedBounds.value = { x: props.modal.x, y: props.modal.y, width: props.modal.width, height: props.modal.height }
    viewer.updateModal(props.modal.uid, { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })
    isFullscreen.value = true
  }
}

const modalStyle = computed(() => {
  if (props.mobile) return { zIndex: props.modal.zIndex }
  if (isFullscreen.value) return { left: 0, top: 0, width: '100vw', height: '100dvh', zIndex: props.modal.zIndex, borderRadius: 0 }
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

function scrollToHeading(id) {
  if (!contentEl.value) return
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  const target = contentEl.value.querySelector(`[id="${escaped}"]`)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
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
  if (resizeDir === 'e' || resizeDir === 'se') updates.width = Math.max(420, _resStartW + dx)
  if (resizeDir === 's' || resizeDir === 'se') updates.height = Math.max(320, _resStartH + dy)
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
const editorMode = ref('split')
const editForm = ref({ title: '', description: '', category: '', tagsInput: '', content_md: '', change_note: '' })
const versions = ref([])
const shares = ref([])
const shareWithCode = ref(false)
const shareCode = ref('')
const shareSlug = ref('')
const shareError = ref('')
const newShareUrl = ref('')
const newShareHasCode = ref(false)
const copied = ref(false)
const copiedId = ref(null)
const slugCheck = reactive({ ok: false, message: '', suggestion: '' })

watch(() => props.modal.docId, async (id) => {
  if (!id) { doc.value = null; return }
  pending.value = true
  editing.value = false; showVersions.value = false; showSharePanel.value = false
  versions.value = []; newShareUrl.value = ''; shareError.value = ''; shareSlug.value = ''
  resetSlugCheck()
  try { doc.value = await api.getDocument(id) }
  catch { doc.value = null }
  finally { pending.value = false }
}, { immediate: true })

watch(editing, (val) => {
  if (val && doc.value) {
    editorMode.value = props.mobile ? 'source' : 'split'
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

const tocItems = computed(() => extractToc(doc.value?.content_md || ''))
const renderedContent = computed(() => renderDocHtml(doc.value, props.modal.docId))
const editPreviewHtml = computed(() => renderDocHtml(editForm.value.content_md, props.modal.docId))

watch(renderedContent, async () => {
  await nextTick()
  renderMermaid(contentEl.value)
}, { immediate: true })

watch([editPreviewHtml, editorMode], async () => {
  await nextTick()
  renderMermaid(previewEl.value)
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
  useFolderPanel().notifyFolderChange()
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

function apiErrMessage(e) {
  return e?.data?.error?.message || e?.response?._data?.error?.message || e?.message || 'Request failed.'
}
function resetSlugCheck() { slugCheck.ok = false; slugCheck.message = ''; slugCheck.suggestion = '' }
function apiErrSuggestion(e) {
  return e?.data?.error?.suggestion || e?.response?._data?.error?.suggestion || ''
}

let slugCheckTimer = null
watch(shareSlug, (val) => {
  resetSlugCheck()
  if (slugCheckTimer) clearTimeout(slugCheckTimer)
  const slug = val.trim()
  if (!slug) return
  slugCheck.message = 'Checking…'
  slugCheckTimer = setTimeout(async () => {
    try {
      const res = await api.checkShareSlug(slug)
      if (slug !== shareSlug.value.trim()) return
      if (res.available) {
        slugCheck.ok = true; slugCheck.message = '✓ Available'; slugCheck.suggestion = ''
      } else {
        slugCheck.ok = false; slugCheck.message = res.reason || 'Not available'; slugCheck.suggestion = res.suggestion || ''
      }
    } catch (e) {
      slugCheck.ok = false; slugCheck.message = apiErrMessage(e); slugCheck.suggestion = apiErrSuggestion(e)
    }
  }, 350)
})

async function createNewShare() {
  shareError.value = ''
  try {
    const res = await api.createShare(props.modal.docId, {
      access_code: shareWithCode.value ? shareCode.value : null,
      slug: shareSlug.value.trim() || null
    })
    newShareUrl.value = `${window.location.origin}/share/${res.slug || res.token}`
    newShareHasCode.value = res.has_access_code
    shareCode.value = ''; shareWithCode.value = false; shareSlug.value = ''
    resetSlugCheck()
    await loadShares()
  } catch (e) {
    shareError.value = apiErrMessage(e)
    const suggestion = apiErrSuggestion(e)
    if (suggestion) { slugCheck.ok = false; slugCheck.message = 'That alias is taken.'; slugCheck.suggestion = suggestion }
  }
}
async function loadShares() { shares.value = await api.getShares(props.modal.docId) }
async function revokeShare(shareId) {
  if (!confirm('Revoke this share link?')) return
  await api.deleteShare(shareId)
  await loadShares()
}
async function renameShare(s) {
  const next = prompt(
    s.slug
      ? `Rename custom URL for this share.\nCurrent: ${s.slug}\nLeave blank to clear and fall back to the random token.`
      : `Set a custom URL (slug) for this share. Letters, digits, underscore, hyphen; max 64 chars.\nLeaving blank cancels.`,
    s.slug || ''
  )
  if (next === null) return
  let trimmed = next.trim()
  if (!trimmed && !s.slug) return
  while (true) {
    try {
      await api.updateShare(s.id, { slug: trimmed || null })
      await loadShares()
      return
    } catch (e) {
      const suggestion = apiErrSuggestion(e)
      if (!suggestion) { alert(apiErrMessage(e)); return }
      const retry = prompt(`${apiErrMessage(e)}\nTry this available alias instead:`, suggestion)
      if (retry === null) return
      trimmed = retry.trim()
      if (!trimmed && !s.slug) return
    }
  }
}
function shareUrl(s) {
  return `${window.location.origin}/share/${s.slug || s.token}`
}
async function copyShareUrl() {
  await navigator.clipboard.writeText(newShareUrl.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
async function copyUrl(s) {
  await navigator.clipboard.writeText(shareUrl(s))
  copiedId.value = s.id
  setTimeout(() => { copiedId.value = null }, 2000)
}
</script>

<style scoped>
.dv-modal {
  position: fixed;
  background: var(--surface);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 360px;
  min-height: 260px;
  border: 1px solid var(--line-strong);
}

.dv-modal--mobile {
  left: 0 !important;
  top: 0 !important;
  width: 100vw !important;
  height: 100dvh !important;
  border-radius: 0;
  border: none;
}

.dv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  background: var(--raised);
  border-bottom: 1px solid var(--line);
  cursor: move;
  flex-shrink: 0;
  user-select: none;
}

.dv-modal--mobile .dv-header,
.dv-modal--fullscreen .dv-header {
  cursor: default;
}

.dv-title-group {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
}

.dv-doc-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.dv-title {
  font-weight: 700;
  font-size: 14.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dv-header-actions {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-shrink: 0;
}

.dv-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  cursor: pointer;
  background: var(--surface);
  color: var(--ink-secondary);
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.dv-btn:hover {
  background: var(--hover);
  color: var(--ink);
}

.dv-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}

.dv-btn-danger {
  color: var(--danger);
  border-color: var(--danger-border);
}

.dv-btn-danger:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

.dv-close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.dv-close:hover {
  background: var(--hover);
  color: var(--ink);
}

.dv-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 26px 28px;
}

.dv-status {
  text-align: center;
  padding: 48px 20px;
  color: var(--muted);
}

.dv-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
}

.dv-meta-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}

/* ── Sub-panels (History & Share) ──────────────────────────────────────── */
.dv-panel {
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 18px;
}

.dv-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.dv-panel-head h4 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink);
}

.dv-ver-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  font-size: 12.5px;
  border-top: 1px solid var(--line);
}

.dv-ver-note {
  flex: 1;
  color: var(--ink-secondary);
}

.dv-dimmed {
  color: var(--muted);
  font-size: 12px;
}

.dv-share-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.dv-share-slug {
  flex: 1 1 220px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
}

.dv-share-code {
  width: 140px;
}

.dv-share-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  cursor: pointer;
  color: var(--ink);
}

.dv-share-error {
  color: var(--danger);
  font-size: 12.5px;
  margin-bottom: 8px;
}

.dv-slug-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 8px;
}
.dv-slug-ok { color: var(--success); }
.dv-slug-bad { color: var(--danger); }

.dv-share-result {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
}

.dv-share-url-row {
  display: flex;
  gap: 8px;
}

.dv-share-list {
  border-top: 1px solid var(--line);
  padding-top: 10px;
  display: grid;
  gap: 6px;
}

.dv-share-item {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.dv-share-item-url {
  flex: 1;
  min-width: 180px;
  padding: 5px 9px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* ── Editor ────────────────────────────────────────────────────────────── */
.dv-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dv-editor-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.dv-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dv-mode-toggle {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 9px;
  background: var(--raised);
}

.dv-mode-toggle button {
  padding: 5px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.dv-mode-toggle button.active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.dv-editor-panes--split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: stretch;
}

.dv-textarea {
  font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  min-height: 360px;
  resize: vertical;
}

.dv-preview {
  min-height: 360px;
  max-height: 600px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px 20px;
  background: var(--surface);
}

.dv-editor-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dv-editor-actions .input-control {
  flex: 1;
}

/* ── Reader + TOC Layout ───────────────────────────────────────────────── */
.dv-reader-layout--toc {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.dv-toc {
  position: sticky;
  top: 0;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--raised);
  max-height: 70vh;
  overflow-y: auto;
}

.dv-toc-title {
  font-size: 10.5px;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.dv-toc nav {
  display: grid;
  gap: 4px;
}

.dv-toc-link {
  display: block;
  font-size: 12px;
  color: var(--ink-secondary);
  text-decoration: none;
  line-height: 1.35;
  padding: 3px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dv-toc-link:hover {
  color: var(--accent);
}

.dv-toc-level-2 {
  padding-left: 10px;
}

.dv-toc-level-3 {
  padding-left: 20px;
  font-size: 11.5px;
  color: var(--muted);
}

/* ── Resize Handles ────────────────────────────────────────────────────── */
.dv-resize-se {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 18px;
  height: 18px;
  cursor: se-resize;
  z-index: 10;
}

.dv-resize-se::after {
  content: '';
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--line-strong);
  border-bottom: 2px solid var(--line-strong);
}

.dv-resize-e {
  position: absolute;
  top: 48px;
  right: 0;
  width: 5px;
  height: calc(100% - 66px);
  cursor: ew-resize;
  z-index: 10;
}

.dv-resize-e:hover {
  background: var(--accent-solid);
  opacity: 0.3;
}

.dv-resize-s {
  position: absolute;
  bottom: 0;
  left: 18px;
  height: 5px;
  width: calc(100% - 36px);
  cursor: ns-resize;
  z-index: 10;
}

.dv-resize-s:hover {
  background: var(--accent-solid);
  opacity: 0.3;
}

@media (max-width: 720px) {
  .dv-btn-label {
    display: none;
  }
  .dv-body {
    padding: 16px;
  }
  .dv-editor-meta-grid,
  .dv-reader-layout--toc {
    grid-template-columns: 1fr;
  }
}
</style>
