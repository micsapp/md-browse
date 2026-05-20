<template>
  <div class="doc-page">
    <div v-if="pending" class="loading">Loading...</div>
    <div v-else-if="error || !doc" class="error">Document not found</div>
    <article v-else class="document">
      <header class="doc-header">
        <h1>{{ doc.title }}</h1>
        <div class="meta">
          <span>Category: <NuxtLink :to="`/categories/${doc.category}`">{{ doc.category }}</NuxtLink></span>
          <span>By {{ doc.created_by }}</span>
          <span>Updated: {{ formatDate(doc.updated_at) }}</span>
          <span v-if="doc.latest_version" class="version">v{{ doc.latest_version }}</span>
        </div>
        <div v-if="doc.tags?.length" class="tags">
          <span v-for="tag in doc.tags" :key="tag" class="tag">
            <NuxtLink :to="`/tags/${tag}`">{{ tag }}</NuxtLink>
          </span>
        </div>
        <div v-if="auth.user" class="actions">
          <button @click="editing = !editing">{{ editing ? 'Cancel' : 'Edit' }}</button>
          <button @click="showVersions = !showVersions">{{ showVersions ? 'Hide History' : 'Version History' }}</button>
          <button @click="downloadDoc" class="download">Download</button>
          <button @click="showSharePanel = !showSharePanel" class="share">Share</button>
          <button @click="deleteDoc" class="delete">Delete</button>
        </div>
      </header>

      <div v-if="showVersions" class="versions-panel">
        <h3>Version History</h3>
        <div v-if="versions?.length" class="version-list">
          <div v-for="v in versions" :key="v.version_number" class="version-item">
            <span class="ver-num">v{{ v.version_number }}</span>
            <span class="ver-note">{{ v.change_note || 'No note' }}</span>
            <span class="ver-date">{{ formatDate(v.created_at) }}</span>
            <button v-if="v.version_number !== doc.latest_version" @click="rollback(v.version_number)" class="rollback-btn">Rollback</button>
          </div>
        </div>
        <p v-else class="no-versions">No version history yet.</p>
      </div>

      <div v-if="showSharePanel" class="share-panel">
        <h3>Share Document</h3>
        <div class="share-create">
          <input v-model="shareSlug" placeholder="Custom URL (optional, e.g. release-notes)" class="share-code-input" style="min-width:240px;" />
          <label class="share-label">
            <input type="checkbox" v-model="shareWithCode" /> Require access code
          </label>
          <input v-if="shareWithCode" v-model="shareCode" placeholder="Enter access code" class="share-code-input" />
          <button @click="createNewShare" class="btn-create-share">Create Share Link</button>
        </div>
        <p v-if="shareError" class="share-error">{{ shareError }}</p>
        <div v-if="newShareUrl" class="share-result">
          <p>Share URL:</p>
          <div class="share-url-row">
            <input :value="newShareUrl" readonly class="share-url-input" @click="$event.target.select()" />
            <button @click="copyShareUrl" class="btn-copy">{{ copied ? '✓' : 'Copy' }}</button>
          </div>
          <p v-if="newShareHasCode" class="share-note">🔒 Access code required to view</p>
        </div>
        <div v-if="shares.length" class="share-list">
          <h4>Active share links</h4>
          <div v-for="s in shares" :key="s.id" class="share-item">
            <span class="share-token">{{ s.has_access_code ? '🔒' : '🔗' }} /share/{{ s.slug || (s.token.slice(0, 8) + '…') }}</span>
            <span class="share-date">{{ formatDate(s.created_at) }}</span>
            <button @click="renameShare(s)" class="btn-sm">{{ s.slug ? 'Rename' : 'Slug' }}</button>
            <button @click="revokeShare(s.id)" class="btn-sm btn-danger">Revoke</button>
          </div>
        </div>
      </div>

      <div v-if="editing" class="editor">
        <input v-model="editForm.title" placeholder="Title" />
        <input v-model="editForm.description" placeholder="Description" />
        <input v-model="editForm.category" placeholder="Category" />
        <input v-model="editForm.tagsInput" placeholder="Tags (comma separated)" />
        <div class="editor-mode-toggle">
          <button :class="{ active: editorMode === 'source' }" @click="editorMode = 'source'">Source</button>
          <button :class="{ active: editorMode === 'preview' }" @click="editorMode = 'preview'">Preview</button>
        </div>
        <textarea v-if="editorMode === 'source'" v-model="editForm.content_md" rows="20" class="source-textarea" />
        <div v-else class="editor-preview content" v-html="editPreviewHtml" />
        <div class="editor-actions">
          <input v-model="editForm.change_note" placeholder="Change note (optional)" />
          <button @click="saveEdit">Save</button>
        </div>
      </div>

      <div v-else class="content" v-html="renderedContent" />
    </article>

    <NuxtLink to="/" class="back">Back to documents</NuxtLink>
  </div>
</template>

<script setup>
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const route = useRoute()
const api = useApi()
const auth = useAuth()
const router = useRouter()

const { data: doc, pending, error, refresh } = await useAsyncData(`doc-${route.params.id}`, () => api.getDocument(route.params.id))

const editing = ref(false)
const showVersions = ref(false)
const showSharePanel = ref(false)
const editorMode = ref('source')
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

function apiErrMessage(e) {
  return e?.data?.error?.message || e?.response?._data?.error?.message || e?.message || 'Request failed.'
}

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

if (import.meta.client) {
  marked.setOptions({
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    }
  })
}

// Collapse blank lines inside <svg> blocks so marked doesn't break them into <p> tags
function fixSvgBlocks(md) {
  return md.replace(/<svg[\s\S]*?<\/svg>/gi, m => m.replace(/\n\s*\n/g, '\n'))
}

const renderedContent = computed(() => {
  if (!doc.value) return ''
  let html = doc.value.content_html || marked(fixSvgBlocks(doc.value.content_md || ''))
  // Rewrite relative image srcs to asset API
  html = html.replace(/(<img\s[^>]*src=")(?!https?:|data:|\/)(.*?)(")/g,
    `$1/api/v1/documents/${route.params.id}/assets/$2$3`)
  return DOMPurify.sanitize(html)
})

const editPreviewHtml = computed(() => {
  if (!editForm.value.content_md) return ''
  let html = marked(fixSvgBlocks(editForm.value.content_md))
  html = html.replace(/(<img\s[^>]*src=")(?!https?:|data:|\/)(.*?)(")/g,
    `$1/api/v1/documents/${route.params.id}/assets/$2$3`)
  return DOMPurify.sanitize(html)
})

function formatDate(date) {
  return date ? new Date(date).toLocaleDateString() : ''
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
    await loadShares()
  } catch (e) {
    shareError.value = apiErrMessage(e)
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
      : `Set a custom URL (slug). Letters, digits, dot, underscore, hyphen; max 64 chars.\nLeaving blank cancels.`,
    s.slug || ''
  )
  if (next === null) return
  const trimmed = next.trim()
  if (!trimmed && !s.slug) return
  try {
    await api.updateShare(s.id, { slug: trimmed || null })
    await loadShares()
  } catch (e) {
    alert(apiErrMessage(e))
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
.doc-page { max-width: 800px; }
.loading, .error { text-align: center; padding: 2rem; }
.doc-header { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
.doc-header h1 { margin-bottom: 0.5rem; }
.meta { display: flex; gap: 1rem; color: var(--text3); font-size: 0.9rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
.meta a { color: var(--accent); }
.version { background: var(--active-bg); color: var(--active-color); padding: 0.1rem 0.4rem; border-radius: 3px; }
.tags { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
.tag a { background: var(--tag-bg); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; text-decoration: none; font-size: 0.85rem; }
.tag a:hover { background: var(--accent); }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.actions button { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
.actions button:first-child { background: var(--accent); color: white; }
.actions button:nth-child(2) { background: #8e44ad; color: white; }
.actions .download { background: var(--success); color: white; }
.actions .share { background: var(--warning); color: white; }
.actions .delete { background: var(--danger); color: white; }
.versions-panel { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; color: var(--text); }
.versions-panel h3 { margin-bottom: 0.75rem; }
.version-list { display: flex; flex-direction: column; gap: 0.5rem; }
.version-item { display: flex; gap: 1rem; align-items: center; padding: 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 0.9rem; }
.ver-num { font-weight: bold; color: var(--accent); min-width: 2rem; }
.ver-note { flex: 1; color: var(--text2); }
.ver-date { color: var(--text3); white-space: nowrap; }
.rollback-btn { padding: 0.2rem 0.6rem; background: var(--warning); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.no-versions { color: var(--text3); font-style: italic; }
.editor { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 2rem; }
.editor input, .editor textarea { padding: 0.5rem; border: 1px solid var(--border2); border-radius: 4px; background: var(--surface2); color: var(--text); }
.editor input:focus, .editor textarea:focus, .share-code-input:focus, .share-url-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--focus-ring); }
.editor-actions { display: flex; gap: 0.5rem; }
.editor-actions input { flex: 1; }
.editor-actions button { background: var(--success); color: white; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
.editor-mode-toggle { display: flex; gap: 0; border: 1px solid var(--border2); border-radius: 4px; overflow: hidden; width: fit-content; }
.editor-mode-toggle button { padding: 0.35rem 0.8rem; border: none; background: var(--surface2); cursor: pointer; font-size: 0.85rem; color: var(--text); }
.editor-mode-toggle button.active { background: var(--accent); color: white; }
.source-textarea { font-family: 'Fira Code', 'Consolas', monospace; font-size: 0.9rem; line-height: 1.5; tab-size: 2; }
.editor-preview { min-height: 300px; border: 1px solid var(--border2); border-radius: 4px; padding: 1rem; background: var(--surface); overflow-y: auto; max-height: 500px; }
.share-panel { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
.share-panel h3 { margin-bottom: 0.75rem; }
.share-panel h4 { margin: 0.75rem 0 0.5rem; font-size: 0.9rem; }
.share-create { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; }
.share-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.9rem; cursor: pointer; }
.share-code-input { padding: 0.35rem 0.5rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.9rem; width: 160px; background: var(--surface); color: var(--text); }
.btn-create-share { padding: 0.35rem 0.8rem; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
.share-result { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem; margin-bottom: 0.75rem; }
.share-result p { margin: 0 0 0.4rem; font-size: 0.85rem; }
.share-url-row { display: flex; gap: 0.4rem; }
.share-url-input { flex: 1; padding: 0.35rem 0.5rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.85rem; font-family: monospace; background: var(--surface2); color: var(--text); }
.btn-copy { padding: 0.35rem 0.6rem; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; min-width: 50px; }
.share-note { color: var(--text3); font-size: 0.82rem; margin-top: 0.3rem; }
.share-error { color: var(--danger, #c0392b); font-size: 0.85rem; margin: 0 0 0.5rem 0; }
.share-list { border-top: 1px solid var(--border); padding-top: 0.5rem; }
.share-item { display: flex; gap: 0.75rem; align-items: center; padding: 0.4rem 0; font-size: 0.85rem; }
.share-token { flex: 1; font-family: monospace; color: var(--text2); }
.share-date { color: var(--text3); font-size: 0.8rem; }
.content { line-height: 1.8; }
.content :deep(h1), .content :deep(h2), .content :deep(h3) { margin: 1.5rem 0 0.5rem; }
.content :deep(p) { margin-bottom: 1rem; }
.content :deep(pre) { background: var(--surface2); padding: 1rem; border-radius: 4px; overflow-x: auto; }
.content :deep(code) { font-family: 'Fira Code', monospace; }
.content :deep(ul), .content :deep(ol) { margin-left: 1.5rem; margin-bottom: 1rem; }
.content :deep(blockquote) { border-left: 4px solid var(--accent); padding-left: 1rem; margin: 1rem 0; color: var(--text2); }
.back { display: inline-block; margin-top: 2rem; color: var(--accent); }

/* ── Mobile ─────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .doc-page { max-width: 100%; }
  .actions { flex-wrap: wrap; }
  .actions button { flex: 1 1 auto; font-size: 0.9rem; padding: 0.5rem 0.75rem; }
  .version-item { flex-wrap: wrap; gap: 0.5rem; }
  .editor-actions { flex-direction: column; }
  .editor-actions input { width: 100%; }
  .content :deep(pre) { font-size: 0.8rem; }
  .content :deep(table) { display: block; overflow-x: auto; }
}
</style>
