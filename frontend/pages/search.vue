<template>
  <div>
    <h1>Search Results for "{{ query }}"</h1>
    <div v-if="pending" class="loading">Searching...</div>
    <div v-else class="results">
      <div v-for="doc in results" :key="doc.id" class="result-card">
        <h2><a href="#" @click.prevent="docViewer.openDoc(doc.id)">{{ doc.title }}</a></h2>
        <p class="snippet">...{{ doc.snippet }}...</p>
        <div class="meta">
          <span class="category">{{ doc.category }}</span>
        </div>
      </div>
      <div v-if="!results?.length" class="empty">No results found</div>
    </div>
  </div>
</template>

<script setup>
const route = useRoute()
const api = useApi()
const docViewer = useDocViewer()
const query = computed(() => route.query.q || '')

const { data: results, pending } = await useAsyncData(
  () => `search-${query.value}`,
  () => query.value ? api.searchDocuments(query.value) : [],
  { watch: [query], default: () => [] }
)
</script>

<style scoped>
h1 { margin-bottom: 1.5rem; }
.loading { text-align: center; padding: 2rem; color: var(--text3); }
.results { display: grid; gap: 1rem; }
.result-card { background: var(--surface); color: var(--text); border: 1px solid var(--border); padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px var(--shadow); }
.result-card h2 { margin-bottom: 0.5rem; }
.result-card h2 a { color: var(--text); text-decoration: none; cursor: pointer; }
.result-card h2 a:hover { color: var(--accent); }
.snippet { color: var(--text2); margin-bottom: 0.5rem; font-size: 0.95rem; }
.snippet :deep(mark) { background: var(--mark-bg); color: var(--mark-text); padding: 0 2px; }
.meta { display: flex; gap: 0.5rem; }
.category { background: var(--accent); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem; }
.empty { text-align: center; padding: 2rem; color: var(--text3); }
</style>
