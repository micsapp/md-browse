<template>
  <div class="share-page">
    <!-- Access Code Prompt -->
    <div v-if="needCode && !authorized" class="surface-card code-prompt">
      <div class="code-lock-badge">
        <svg class="ui-icon ui-icon--lg" aria-hidden="true"><use href="#ui-lock"/></svg>
      </div>
      <h2>Protected Document</h2>
      <p>This shared document requires an access code to view.</p>
      <form class="code-form" @submit.prevent="submitCode">
        <input
          v-model="codeInput"
          type="password"
          class="input-control"
          placeholder="Enter access code"
          autofocus
        />
        <button type="submit" class="btn btn-primary">Unlock Document</button>
      </form>
      <p v-if="codeError" class="error-msg">Invalid access code. Please try again.</p>
    </div>

    <div v-else-if="error" class="surface-card share-status share-status--error">{{ errorMessage }}</div>
    <div v-else-if="!doc" class="surface-card share-status">Loading shared document…</div>

    <article v-else class="share-article">
      <header class="surface-card share-hero">
        <div class="share-hero-top">
          <div class="share-badges">
            <span class="pill pill-accent">Shared Document</span>
            <span v-if="doc.category && doc.category !== 'uncategorized'" class="pill">{{ doc.category }}</span>
            <span v-for="tag in doc.tags" :key="tag" class="pill">#{{ tag }}</span>
          </div>
          <div class="share-actions">
            <button
              v-if="tocItems.length"
              type="button"
              class="btn btn-sm"
              :class="{ 'btn-soft': showToc }"
              @click="showToc = !showToc"
            >
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-toc"/></svg>
              <span>Outline</span>
            </button>
            <button type="button" class="btn btn-sm" @click="copyCurrentLink">
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-copy"/></svg>
              <span>{{ linkCopied ? '✓ Link Copied' : 'Copy Link' }}</span>
            </button>
          </div>
        </div>

        <h1 class="share-title">{{ doc.title }}</h1>
        <p v-if="doc.description" class="share-desc">{{ doc.description }}</p>

        <div class="share-byline">
          <span v-if="doc.created_by">By <strong>{{ doc.created_by }}</strong></span>
          <span v-if="doc.created_by && doc.updated_at">·</span>
          <span v-if="doc.updated_at">Updated {{ formatDate(doc.updated_at) }}</span>
        </div>
      </header>

      <div class="share-reader-grid" :class="{ 'share-reader-grid--toc': showToc && tocItems.length }">
        <aside v-if="showToc && tocItems.length" class="surface-card share-toc">
          <p class="share-toc-title">On this page</p>
          <nav>
            <a
              v-for="item in tocItems"
              :key="item.id"
              :href="`#${item.id}`"
              :class="`share-toc-link share-toc-level-${item.level}`"
              @click.prevent="scrollToHeading(item.id)"
            >
              {{ item.text }}
            </a>
          </nav>
        </aside>

        <div
          ref="contentEl"
          class="surface-card markdown-body share-content"
          v-html="renderedContent"
          @click="handleAnchorClick"
        />
      </div>
    </article>
  </div>
</template>

<script setup>
definePageMeta({ layout: false, middleware: [] })

const route = useRoute()
const api = useApi()
const { render: renderMermaid } = useMermaid()
const { renderDocHtml, extractToc, handleAnchorClick } = useMarkdown()

const contentEl = ref(null)
const doc = ref(null)
const error = ref(false)
const errorMessage = ref('')
const needCode = ref(false)
const authorized = ref(false)
const codeInput = ref('')
const codeError = ref(false)
const showToc = ref(true)
const linkCopied = ref(false)

const tocItems = computed(() => extractToc(doc.value?.content_md || ''))
const renderedContent = computed(() => renderDocHtml(doc.value, doc.value?.id))

watch(renderedContent, async () => {
  await nextTick()
  renderMermaid(contentEl.value)
})

function scrollToHeading(id) {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  const target = document.querySelector(`[id="${escaped}"]`)
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function copyCurrentLink() {
  if (!import.meta.client) return
  await navigator.clipboard.writeText(window.location.href)
  linkCopied.value = true
  setTimeout(() => { linkCopied.value = false }, 2000)
}

function formatDate(date) {
  return date ? new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

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
      errorMessage.value = 'Document not found or share link expired.'
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
.share-page {
  width: 100%;
}

.share-status {
  text-align: center;
  padding: 56px 24px;
  color: var(--muted);
}

.share-status--error {
  color: var(--danger);
}

.code-prompt {
  max-width: 440px;
  margin: 48px auto;
  text-align: center;
  padding: 36px 28px;
}

.code-lock-badge {
  display: inline-grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: 16px;
}

.code-prompt h2 {
  margin-bottom: 8px;
  font-size: 22px;
  font-weight: 750;
}

.code-prompt p {
  color: var(--muted);
  margin-bottom: 20px;
  font-size: 14px;
}

.code-form {
  display: flex;
  gap: 8px;
}

.error-msg {
  color: var(--danger) !important;
  margin-top: 12px;
  margin-bottom: 0 !important;
  font-weight: 600;
}

.share-article {
  display: grid;
  gap: 18px;
}

.share-hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.share-badges,
.share-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.share-title {
  margin: 0 0 8px;
  font-size: clamp(26px, 2.8vw, 38px);
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.15;
}

.share-desc {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 15px;
}

.share-byline {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.share-reader-grid--toc {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.share-toc {
  position: sticky;
  top: 84px;
  padding: 16px;
  max-height: calc(100vh - 110px);
  overflow-y: auto;
}

.share-toc-title {
  font-size: 10.5px;
  font-weight: 750;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}

.share-toc nav {
  display: grid;
  gap: 5px;
}

.share-toc-link {
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

.share-toc-link:hover {
  color: var(--accent);
}

.share-toc-level-2 {
  padding-left: 12px;
}

.share-toc-level-3 {
  padding-left: 24px;
  font-size: 12px;
  color: var(--muted);
}

.share-content {
  padding: clamp(24px, 3.5vw, 44px);
}

@media (max-width: 860px) {
  .share-reader-grid--toc {
    grid-template-columns: 1fr;
  }
  .share-toc {
    position: static;
  }
}
</style>
