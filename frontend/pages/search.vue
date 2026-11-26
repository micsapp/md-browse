<template>
  <div class="search-page">
    <div class="workspace-topline">
      <span>FULL-TEXT SEARCH</span>
      <NuxtLink to="/" class="workspace-topline-link">
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-arrow-left"/></svg>
        <span>All Documents</span>
      </NuxtLink>
    </div>

    <header class="page-header">
      <div class="page-header-copy">
        <p class="page-eyebrow">KNOWLEDGE DISCOVERY</p>
        <h1 class="page-title">{{ query ? `Results for “${query}”` : 'Search Documents' }}</h1>
        <p class="page-subtitle">Search across titles, tags, and full markdown content.</p>
      </div>
      <div v-if="query" class="catalog-total">
        <strong>{{ results?.length || 0 }}</strong>
        <span>{{ results?.length === 1 ? 'matching document' : 'matching documents' }}</span>
      </div>
    </header>

    <!-- Interactive Search Bar -->
    <div class="workspace-bar">
      <form class="workspace-bar-search" @submit.prevent="submitSearch">
        <svg class="ui-icon search-leading-icon" aria-hidden="true"><use href="#ui-search"/></svg>
        <input
          v-model="localQuery"
          type="search"
          placeholder="Search titles, tags, or markdown content…"
          aria-label="Search query"
          autofocus
        />
        <button type="submit" class="btn btn-sm btn-primary">Search</button>
      </form>
    </div>

    <div v-if="pending" class="surface-card search-loading">Searching documents…</div>

    <div v-else-if="results?.length" class="results-grid">
      <article
        v-for="doc in results"
        :key="doc.id"
        class="result-card surface-card"
        @click="docViewer.openDoc(doc.id)"
      >
        <div class="result-card-head">
          <div class="result-badges">
            <span v-if="doc.category" class="pill pill-accent">{{ doc.category }}</span>
            <span v-for="tag in doc.tags" :key="tag" class="pill">#{{ tag }}</span>
          </div>
          <NuxtLink
            :to="`/documents/${doc.id}`"
            class="btn btn-xs"
            @click.stop
          >
            Open Page
          </NuxtLink>
        </div>
        <h2 class="result-title">
          <a href="#" @click.prevent.stop="docViewer.openDoc(doc.id)">{{ doc.title }}</a>
        </h2>
        <p v-if="doc.snippet" class="snippet">…{{ doc.snippet }}…</p>
        <div class="result-footer">
          <span v-if="doc.created_by">By {{ doc.created_by }}</span>
          <span v-if="doc.updated_at">{{ formatDate(doc.updated_at) }}</span>
        </div>
      </article>
    </div>

    <div v-else class="catalog-empty">
      <svg class="ui-icon" aria-hidden="true"><use href="#ui-search"/></svg>
      <strong>{{ query ? 'No documents matched your search' : 'Enter a search term above' }}</strong>
      <span>{{ query ? 'Try searching with a broader keyword, tag name, or phrase.' : 'Full-text search scans every document title, tag, and markdown body.' }}</span>
    </div>
  </div>
</template>

<script setup>
const route = useRoute()
const router = useRouter()
const api = useApi()
const docViewer = useDocViewer()

const query = computed(() => String(route.query.q || ''))
const localQuery = ref(query.value)

watch(query, (q) => { localQuery.value = q })

function submitSearch() {
  if (localQuery.value.trim()) {
    router.push({ path: '/search', query: { q: localQuery.value.trim() } })
  }
}

const { data: results, pending } = await useAsyncData(
  () => `search-${query.value}`,
  () => query.value ? api.searchDocuments(query.value) : [],
  { watch: [query], default: () => [] }
)

function formatDate(date) {
  return date ? new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}
</script>

<style scoped>
.search-loading {
  text-align: center;
  padding: 48px 24px;
  color: var(--muted);
}

.results-grid {
  display: grid;
  gap: 14px;
}

.result-card {
  cursor: pointer;
  transition: transform 0.16s, border-color 0.16s, box-shadow 0.16s;
}

.result-card:hover {
  transform: translateY(-2px);
  border-color: var(--line-strong);
  box-shadow: var(--shadow-md);
}

.result-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.result-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.result-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 700;
}

.result-title a {
  color: var(--ink);
  text-decoration: none;
}

.result-card:hover .result-title a {
  color: var(--accent);
}

.snippet {
  color: var(--ink-secondary);
  margin: 0 0 12px;
  font-size: 13.5px;
  line-height: 1.6;
}

.result-footer {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
</style>
