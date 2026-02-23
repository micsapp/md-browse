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

      <div v-if="editing" class="editor">
        <input v-model="editForm.title" placeholder="Title" />
        <input v-model="editForm.description" placeholder="Description" />
        <input v-model="editForm.category" placeholder="Category" />
        <input v-model="editForm.tagsInput" placeholder="Tags (comma separated)" />
        <textarea v-model="editForm.content_md" rows="20" />
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
const editForm = ref({ title: '', description: '', category: '', tagsInput: '', content_md: '', change_note: '' })
const versions = ref([])

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

const renderedContent = computed(() => {
  if (!doc.value) return ''
  if (doc.value.content_html) return DOMPurify.sanitize(doc.value.content_html)
  const md = doc.value.content_md || ''
  return DOMPurify.sanitize(marked(md))
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
</script>

<style scoped>
.doc-page { max-width: 800px; }
.loading, .error { text-align: center; padding: 2rem; }
.doc-header { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
.doc-header h1 { margin-bottom: 0.5rem; }
.meta { display: flex; gap: 1rem; color: #666; font-size: 0.9rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
.meta a { color: #3498db; }
.version { background: #e8f4fd; color: #2980b9; padding: 0.1rem 0.4rem; border-radius: 3px; }
.tags { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
.tag a { background: #95a5a6; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; text-decoration: none; font-size: 0.85rem; }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.actions button { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
.actions button:first-child { background: #3498db; color: white; }
.actions button:nth-child(2) { background: #8e44ad; color: white; }
.actions .delete { background: #e74c3c; color: white; }
.versions-panel { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
.versions-panel h3 { margin-bottom: 0.75rem; }
.version-list { display: flex; flex-direction: column; gap: 0.5rem; }
.version-item { display: flex; gap: 1rem; align-items: center; padding: 0.5rem; background: white; border-radius: 4px; font-size: 0.9rem; }
.ver-num { font-weight: bold; color: #2980b9; min-width: 2rem; }
.ver-note { flex: 1; color: #555; }
.ver-date { color: #999; white-space: nowrap; }
.rollback-btn { padding: 0.2rem 0.6rem; background: #f39c12; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.no-versions { color: #666; font-style: italic; }
.editor { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 2rem; }
.editor input, .editor textarea { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
.editor-actions { display: flex; gap: 0.5rem; }
.editor-actions input { flex: 1; }
.editor-actions button { background: #27ae60; color: white; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
.content { line-height: 1.8; }
.content :deep(h1), .content :deep(h2), .content :deep(h3) { margin: 1.5rem 0 0.5rem; }
.content :deep(p) { margin-bottom: 1rem; }
.content :deep(pre) { background: var(--surface2); padding: 1rem; border-radius: 4px; overflow-x: auto; }
.content :deep(code) { font-family: 'Fira Code', monospace; }
.content :deep(ul), .content :deep(ol) { margin-left: 1.5rem; margin-bottom: 1rem; }
.content :deep(blockquote) { border-left: 4px solid #3498db; padding-left: 1rem; margin: 1rem 0; color: #666; }
.back { display: inline-block; margin-top: 2rem; color: #3498db; }

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
