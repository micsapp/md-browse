<template>
  <div class="doc-page">
    <!-- Workspace Topline -->
    <div class="workspace-topline">
      <div class="workspace-topline-crumbs">
        <NuxtLink to="/" class="workspace-topline-crumb">Documents</NuxtLink>
        <template v-if="doc?.category">
          <span>/</span>
          <NuxtLink :to="`/categories/${doc.category}`" class="workspace-topline-crumb">{{ doc.category }}</NuxtLink>
        </template>
        <template v-if="doc?.title">
          <span>/</span>
          <span class="workspace-topline-crumb current">{{ doc.title }}</span>
        </template>
      </div>
      <div class="workspace-topline-actions">
        <NuxtLink to="/" class="workspace-topline-link">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-arrow-left"/></svg>
          <span>Back to Documents</span>
        </NuxtLink>
      </div>
    </div>

    <div v-if="pending" class="surface-card doc-status">Loading document…</div>
    <div v-else-if="error || !doc" class="surface-card doc-status">Document not found.</div>

    <article v-else class="doc-shell">
      <header class="doc-hero surface-card">
        <div class="doc-hero-top">
          <div class="doc-badges">
            <NuxtLink v-if="doc.category" :to="`/categories/${doc.category}`" class="pill pill-accent">
              {{ doc.category }}
            </NuxtLink>
            <NuxtLink v-for="tag in doc.tags" :key="tag" :to="`/tags/${tag}`" class="pill">
              #{{ tag }}
            </NuxtLink>
            <span v-if="doc.latest_version" class="pill pill-accent">v{{ doc.latest_version }}</span>
            <span v-if="doc.token_count_estimate" class="pill">~{{ doc.token_count_estimate }} tokens</span>
          </div>

          <div class="doc-toolbar">
            <button
              v-if="tocItems.length && !editing"
              type="button"
              class="btn btn-sm"
              :class="{ 'btn-soft': showToc }"
              @click="showToc = !showToc"
            >
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-toc"/></svg>
              <span>Outline</span>
            </button>
            <template v-if="auth.user">
              <button
                type="button"
                class="btn btn-sm"
                :class="{ 'btn-primary': editing }"
                @click="editing = !editing"
              >
                <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-edit"/></svg>
                <span>{{ editing ? 'Close Editor' : 'Edit' }}</span>
              </button>
              <button
                type="button"
                class="btn btn-sm"
                :class="{ 'btn-soft': showVersions }"
                @click="showVersions = !showVersions"
              >
                <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-history"/></svg>
                <span>History</span>
              </button>
              <button
                type="button"
                class="btn btn-sm"
                :class="{ 'btn-soft': showSharePanel }"
                @click="showSharePanel = !showSharePanel"
              >
                <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-share"/></svg>
                <span>Share</span>
              </button>
              <button type="button" class="btn btn-sm" @click="downloadDoc">
                <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-download"/></svg>
                <span>Download</span>
              </button>
              <button type="button" class="btn btn-sm btn-danger" @click="deleteDoc">
                <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-trash"/></svg>
                <span>Delete</span>
              </button>
            </template>
          </div>
        </div>

        <h1 class="doc-title">{{ doc.title }}</h1>
        <p v-if="doc.description" class="doc-description">{{ doc.description }}</p>

        <div class="doc-byline">
          <span>Authored by <strong>{{ doc.created_by || 'system' }}</strong></span>
          <span>·</span>
          <span>Updated {{ formatDate(doc.updated_at) }}</span>
        </div>
      </header>

      <!-- Version History Panel -->
      <section v-if="showVersions" class="surface-card sub-panel">
        <div class="sub-panel-head">
          <h3>Version History</h3>
          <button type="button" class="btn btn-xs btn-ghost" @click="showVersions = false">Close</button>
        </div>
        <div v-if="versions?.length" class="version-list">
          <div v-for="v in versions" :key="v.version_number" class="version-item">
            <span class="pill pill-accent">v{{ v.version_number }}</span>
            <span class="ver-note">{{ v.change_note || 'No change note' }}</span>
            <span class="ver-date">{{ formatDate(v.created_at) }}</span>
            <button
              v-if="v.version_number !== doc.latest_version"
              type="button"
              class="btn btn-xs"
              @click="rollback(v.version_number)"
            >
              Rollback
            </button>
          </div>
        </div>
        <p v-else class="dimmed">No version history yet.</p>
      </section>

      <!-- Share Panel -->
      <section v-if="showSharePanel" class="surface-card sub-panel">
        <div class="sub-panel-head">
          <h3>Share Document</h3>
          <button type="button" class="btn btn-xs btn-ghost" @click="showSharePanel = false">Close</button>
        </div>
        <div class="share-create">
          <input
            v-model="shareSlug"
            placeholder="Custom URL slug (optional, e.g. release-notes)"
            class="input-control share-slug-input"
          />
          <label class="share-label">
            <input v-model="shareWithCode" type="checkbox" />
            <span>Require access code</span>
          </label>
          <input
            v-if="shareWithCode"
            v-model="shareCode"
            placeholder="Enter access code"
            class="input-control share-code-input"
          />
          <button type="button" class="btn btn-sm btn-primary" @click="createNewShare">Create Share Link</button>
        </div>
        <p v-if="slugCheck.message" class="slug-status" :class="slugCheck.ok ? 'slug-ok' : 'slug-bad'">
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
        <p v-if="shareError" class="share-error">{{ shareError }}</p>
        <div v-if="newShareUrl" class="share-result">
          <div class="share-url-row">
            <input :value="newShareUrl" readonly class="input-control" @click="$event.target.select()" />
            <button type="button" class="btn btn-sm btn-primary" @click="copyShareUrl">
              {{ copied ? '✓ Copied' : 'Copy Link' }}
            </button>
          </div>
          <p v-if="newShareHasCode" class="dimmed" style="margin-top:6px;">Access code required to view</p>
        </div>
        <div v-if="shares.length" class="share-list">
          <h4>Active Share Links</h4>
          <div v-for="s in shares" :key="s.id" class="share-item">
            <span class="pill" :class="s.has_access_code ? 'pill-warning' : 'pill-success'">
              {{ s.has_access_code ? 'Code' : 'Public' }}
            </span>
            <span class="share-token">/share/{{ s.slug || (s.token.slice(0, 10) + '…') }}</span>
            <span class="dimmed">{{ formatDate(s.created_at) }}</span>
            <button type="button" class="btn btn-xs" @click="renameShare(s)">
              {{ s.slug ? 'Rename' : 'Add Alias' }}
            </button>
            <button type="button" class="btn btn-xs btn-danger" @click="revokeShare(s.id)">Revoke</button>
          </div>
        </div>
      </section>

      <!-- Editor -->
      <section v-if="editing" class="surface-card editor-card">
        <div class="editor-meta-grid">
          <input v-model="editForm.title" class="input-control" placeholder="Title" />
          <input v-model="editForm.category" class="input-control" placeholder="Category" />
          <input v-model="editForm.description" class="input-control" placeholder="Description" />
          <input v-model="editForm.tagsInput" class="input-control" placeholder="Tags (comma separated)" />
        </div>
        <div class="editor-mode-bar">
          <div class="editor-mode-toggle">
            <button type="button" :class="{ active: editorMode === 'source' }" @click="editorMode = 'source'">Markdown</button>
            <button type="button" :class="{ active: editorMode === 'split' }" @click="editorMode = 'split'">Split View</button>
            <button type="button" :class="{ active: editorMode === 'preview' }" @click="editorMode = 'preview'">Preview</button>
          </div>
        </div>
        <div class="editor-panes" :class="{ 'editor-panes--split': editorMode === 'split' }">
          <textarea
            v-if="editorMode === 'source' || editorMode === 'split'"
            v-model="editForm.content_md"
            rows="22"
            class="textarea-control source-textarea"
          />
          <div
            v-if="editorMode === 'preview' || editorMode === 'split'"
            ref="previewEl"
            class="markdown-body editor-preview"
            v-html="editPreviewHtml"
            @click="handleAnchorClick"
          />
        </div>
        <div class="editor-actions">
          <input v-model="editForm.change_note" class="input-control" placeholder="Version change note (optional)" />
          <button type="button" class="btn" @click="editing = false">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveEdit">Save Changes</button>
        </div>
      </section>

      <!-- Rendered Content + TOC Sidebar -->
      <div v-else class="reader-grid" :class="{ 'reader-grid--toc': showToc && tocItems.length }">
        <aside v-if="showToc && tocItems.length" class="surface-card reader-toc">
          <p class="reader-toc-title">On this page</p>
          <nav>
            <a
              v-for="item in tocItems"
              :key="item.id"
              :href="`#${item.id}`"
              :class="`reader-toc-link reader-toc-level-${item.level}`"
              @click.prevent="scrollToHeading(item.id)"
            >
              {{ item.text }}
            </a>
          </nav>
        </aside>

        <div
          ref="contentEl"
          class="surface-card markdown-body doc-content-card"
          v-html="renderedContent"
          @click="handleAnchorClick"
        />
      </div>
    </article>
  </div>
</template>

<script setup>
const route = useRoute()
const api = useApi()
const auth = useAuth()
const router = useRouter()
const { render: renderMermaid } = useMermaid()
const { renderDocHtml, extractToc, handleAnchorClick } = useMarkdown()

const contentEl = ref(null)
const previewEl = ref(null)
const showToc = ref(true)

const { data: doc, pending, error, refresh } = await useAsyncData(`doc-${route.params.id}`, () => api.getDocument(route.params.id))

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
const slugCheck = reactive({ ok: false, message: '', suggestion: '' })

function scrollToHeading(id) {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  const target = document.querySelector(`[id="${escaped}"]`)
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function apiErrMessage(e) {
  return e?.data?.error?.message || e?.response?._data?.error?.message || e?.message || 'Request failed.'
}
function apiErrSuggestion(e) {
  return e?.data?.error?.suggestion || e?.response?._data?.error?.suggestion || ''
}
function resetSlugCheck() { slugCheck.ok = false; slugCheck.message = ''; slugCheck.suggestion = '' }

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
    const res = await api.getVersions(route.params.id)
    versions.value = res.versions || []
  }
})

const tocItems = computed(() => extractToc(doc.value?.content_md || ''))
const renderedContent = computed(() => renderDocHtml(doc.value, route.params.id))
const editPreviewHtml = computed(() => renderDocHtml(editForm.value.content_md, route.params.id))

watch(renderedContent, async () => {
  await nextTick()
  renderMermaid(contentEl.value)
}, { immediate: true })

watch([editPreviewHtml, editorMode], async () => {
  await nextTick()
  renderMermaid(previewEl.value)
})

function formatDate(date) {
  return date ? new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

async function saveEdit() {
  await api.updateDocument(route.params.id, {
    title: editForm.value.title,
    description: editForm.value.description,
    category: editForm.value.category,
    tags: editForm.value.tagsInput.split(',').map(t => t.trim()).filter(Boolean),
    content_md: editForm.value.content_md,
    change_note: editForm.value.change_note
  })
  editing.value = false
  refresh()
}

async function rollback(targetVersion) {
  if (!confirm(`Roll back to version ${targetVersion}?`)) return
  await api.rollbackDocument(route.params.id, targetVersion, `Rollback to v${targetVersion}`)
  showVersions.value = false
  refresh()
}

async function deleteDoc() {
  if (confirm('Delete this document?')) {
    await api.deleteDocument(route.params.id)
    router.push('/')
  }
}

async function downloadDoc() {
  await api.downloadDocument(route.params.id)
}

async function createNewShare() {
  shareError.value = ''
  try {
    const res = await api.createShare(route.params.id, {
      access_code: shareWithCode.value ? shareCode.value : null,
      slug: shareSlug.value.trim() || null
    })
    const base = window.location.origin
    newShareUrl.value = `${base}/share/${res.slug || res.token}`
    newShareHasCode.value = res.has_access_code
    shareCode.value = ''
    shareWithCode.value = false
    shareSlug.value = ''
    resetSlugCheck()
    await loadShares()
  } catch (e) {
    shareError.value = apiErrMessage(e)
    const suggestion = apiErrSuggestion(e)
    if (suggestion) { slugCheck.ok = false; slugCheck.message = 'That alias is taken.'; slugCheck.suggestion = suggestion }
  }
}

async function loadShares() {
  shares.value = await api.getShares(route.params.id)
}

async function revokeShare(shareId) {
  if (!confirm('Revoke this share link?')) return
  await api.deleteShare(shareId)
  await loadShares()
}

async function renameShare(s) {
  const next = prompt(
    s.slug
      ? `Rename custom URL for this share.\nCurrent: ${s.slug}\nLeave blank to clear and fall back to the random token.`
      : `Set a custom URL (slug). Letters, digits, underscore, hyphen; max 64 chars.\nLeaving blank cancels.`,
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

async function copyShareUrl() {
  await navigator.clipboard.writeText(newShareUrl.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

watch(showSharePanel, (val) => { if (val) loadShares() })
</script>

<style scoped>
.doc-page {
  width: 100%;
}

.doc-status {
  text-align: center;
  padding: 48px 24px;
  color: var(--muted);
  margin-top: 20px;
}

.doc-shell {
  display: grid;
  gap: 18px;
  margin-top: 20px;
}

.doc-hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.doc-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.doc-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.doc-title {
  margin: 0 0 8px;
  color: var(--ink);
  font-size: clamp(24px, 2.5vw, 34px);
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.2;
}

.doc-description {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 14.5px;
}

.doc-byline {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12.5px;
}

.sub-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.sub-panel-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.version-list {
  display: grid;
  gap: 8px;
}

.version-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  background: var(--canvas);
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 13px;
}

.ver-note {
  flex: 1;
  color: var(--ink-secondary);
}

.ver-date,
.dimmed {
  color: var(--muted);
  font-size: 12px;
}

.share-create {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.share-slug-input {
  flex: 1 1 240px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.share-code-input {
  width: 160px;
}

.share-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.slug-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  margin-bottom: 8px;
}
.slug-ok { color: var(--success); }
.slug-bad { color: var(--danger); }

.share-error {
  color: var(--danger);
  font-size: 12.5px;
  margin-bottom: 8px;
}

.share-result {
  background: var(--canvas);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}

.share-url-row {
  display: flex;
  gap: 8px;
}

.share-list {
  border-top: 1px solid var(--line);
  padding-top: 12px;
  display: grid;
  gap: 8px;
}

.share-list h4 {
  font-size: 12.5px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.share-item {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.share-token {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
}

/* ── Editor ────────────────────────────────────────────────────────────── */
.editor-card {
  display: grid;
  gap: 12px;
}

.editor-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.editor-mode-toggle {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 9px;
  background: var(--raised);
}

.editor-mode-toggle button {
  padding: 6px 14px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.editor-mode-toggle button.active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.editor-panes--split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.source-textarea {
  font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13.5px;
  line-height: 1.6;
  min-height: 440px;
}

.editor-preview {
  min-height: 440px;
  max-height: 680px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 20px;
  background: var(--canvas);
}

.editor-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.editor-actions .input-control {
  flex: 1;
}

/* ── Reader + TOC Grid ─────────────────────────────────────────────────── */
.reader-grid--toc {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.reader-toc {
  position: sticky;
  top: 20px;
  padding: 16px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

.reader-toc-title {
  font-size: 10.5px;
  font-weight: 750;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}

.reader-toc nav {
  display: grid;
  gap: 5px;
}

.reader-toc-link {
  display: block;
  font-size: 12.5px;
  color: var(--ink-secondary);
  text-decoration: none;
  line-height: 1.4;
  padding: 3px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-toc-link:hover {
  color: var(--accent);
}

.reader-toc-level-2 {
  padding-left: 12px;
}

.reader-toc-level-3 {
  padding-left: 24px;
  font-size: 12px;
  color: var(--muted);
}

.doc-content-card {
  padding: clamp(22px, 3vw, 40px);
}

@media (max-width: 900px) {
  .reader-grid--toc,
  .editor-panes--split,
  .editor-meta-grid {
    grid-template-columns: 1fr;
  }
  .reader-toc {
    position: static;
  }
}
</style>
