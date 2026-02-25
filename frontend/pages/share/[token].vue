<template>
  <div class="share-page">
    <div v-if="needCode && !authorized" class="code-prompt">
      <h2>🔒 Access Code Required</h2>
      <p>This document is protected. Enter the access code to view it.</p>
      <div class="code-form">
        <input v-model="codeInput" type="password" placeholder="Access code" @keyup.enter="submitCode" />
        <button @click="submitCode">Submit</button>
      </div>
      <p v-if="codeError" class="error-msg">Invalid access code</p>
    </div>
    <div v-else-if="error" class="error">{{ errorMessage }}</div>
    <div v-else-if="!doc" class="loading">Loading...</div>
    <article v-else class="document">
      <header class="doc-header">
        <h1>{{ doc.title }}</h1>
        <div class="meta">
          <span v-if="doc.category">Category: {{ doc.category }}</span>
          <span>By {{ doc.created_by }}</span>
          <span>Updated: {{ formatDate(doc.updated_at) }}</span>
        </div>
        <div v-if="doc.tags?.length" class="tags">
          <span v-for="tag in doc.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <div class="shared-badge">Shared document</div>
      </header>
      <div class="content" v-html="renderedContent" />
    </article>
  </div>
</template>

<script setup>
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

definePageMeta({ layout: false, middleware: [] })

const route = useRoute()
const api = useApi()

const doc = ref(null)
const error = ref(false)
const errorMessage = ref('')
const needCode = ref(false)
const authorized = ref(false)
const codeInput = ref('')
const codeError = ref(false)

if (import.meta.client) {
  marked.setOptions({
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
      return hljs.highlightAuto(code).value
    }
  })
}

const renderedContent = computed(() => {
  if (!doc.value) return ''
  if (doc.value.content_html) return DOMPurify.sanitize(doc.value.content_html)
  return DOMPurify.sanitize(marked(doc.value.content_md || ''))
})

function formatDate(date) { return date ? new Date(date).toLocaleDateString() : '' }

async function loadDoc(code) {
  try {
    doc.value = await api.getSharedDocument(route.params.token, code)
    authorized.value = true
    needCode.value = false
  } catch (e) {
    const status = e?.response?.status || e?.status || 0
    if (status === 403) {
      needCode.value = true
      if (code) codeError.value = true
    } else {
      error.value = true
      errorMessage.value = 'Document not found or share link expired'
    }
  }
}

async function submitCode() {
  codeError.value = false
  await loadDoc(codeInput.value)
}

onMounted(() => loadDoc())
</script>

<style scoped>
.share-page { max-width: 800px; margin: 2rem auto; padding: 0 1.5rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.loading, .error { text-align: center; padding: 2rem; color: #666; }
.error { color: #e74c3c; }
.doc-header { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
.doc-header h1 { margin-bottom: 0.5rem; }
.meta { display: flex; gap: 1rem; color: #666; font-size: 0.9rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
.tags { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
.tag { background: #95a5a6; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem; }
.shared-badge { display: inline-block; background: #f39c12; color: white; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; }
.content { line-height: 1.8; }
.content :deep(h1), .content :deep(h2), .content :deep(h3) { margin: 1.5rem 0 0.5rem; }
.content :deep(p) { margin-bottom: 1rem; }
.content :deep(pre) { background: #f8f9fa; padding: 1rem; border-radius: 4px; overflow-x: auto; }
.content :deep(code) { font-family: 'Fira Code', monospace; }
.content :deep(ul), .content :deep(ol) { margin-left: 1.5rem; margin-bottom: 1rem; }
.content :deep(blockquote) { border-left: 4px solid #3498db; padding-left: 1rem; margin: 1rem 0; color: #666; }
.code-prompt { text-align: center; padding: 3rem 1rem; }
.code-prompt h2 { margin-bottom: 0.5rem; }
.code-prompt p { color: #666; margin-bottom: 1rem; }
.code-form { display: flex; gap: 0.5rem; justify-content: center; }
.code-form input { padding: 0.5rem 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; width: 200px; }
.code-form button { padding: 0.5rem 1rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
.error-msg { color: #e74c3c; margin-top: 0.5rem; }
</style>
