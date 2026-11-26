<template>
  <div>
    <div class="workspace-topline">
      <div class="workspace-topline-crumbs">
        <NuxtLink to="/categories" class="workspace-topline-crumb">Categories</NuxtLink>
        <span>/</span>
        <span class="workspace-topline-crumb current">{{ category }}</span>
      </div>
      <NuxtLink to="/categories" class="workspace-topline-link">
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-arrow-left"/></svg>
        <span>All Categories</span>
      </NuxtLink>
    </div>

    <header class="page-header">
      <div class="page-header-copy">
        <p class="page-eyebrow">CATEGORY COLLECTION</p>
        <h1 class="page-title">{{ category }}</h1>
        <p class="page-subtitle">Documents filed under the “{{ category }}” category.</p>
      </div>
      <div class="catalog-total">
        <strong>{{ filteredDocs.length }}</strong>
        <span>{{ filteredDocs.length === 1 ? 'document' : 'documents' }}</span>
      </div>
    </header>

    <div v-if="filteredDocs.length" class="docs-grid">
      <article
        v-for="doc in filteredDocs"
        :key="doc.id"
        class="doc-card surface-card"
        @click="docViewer.openDoc(doc.id)"
      >
        <div class="doc-card-top">
          <div class="doc-badges">
            <span class="pill pill-accent">{{ doc.category }}</span>
            <span v-for="tag in doc.tags" :key="tag" class="pill">#{{ tag }}</span>
          </div>
          <NuxtLink :to="`/documents/${doc.id}`" class="btn btn-xs" @click.stop>Open Page</NuxtLink>
        </div>
        <h2>
          <a href="#" @click.prevent.stop="docViewer.openDoc(doc.id)">{{ doc.title }}</a>
        </h2>
        <p v-if="doc.description" class="description">{{ doc.description }}</p>
        <div class="info">
          <span>By {{ doc.created_by || 'system' }}</span>
          <span>{{ formatDate(doc.updated_at) }}</span>
        </div>
      </article>
    </div>

    <div v-else class="catalog-empty">
      <svg class="ui-icon" aria-hidden="true"><use href="#ui-doc"/></svg>
      <strong>No documents in this category</strong>
      <span>Try browsing another category or return to all documents.</span>
    </div>
  </div>
</template>

<script setup>
const route = useRoute()
const api = useApi()
const docViewer = useDocViewer()
const category = computed(() => String(route.params.category || ''))

const { data: documents } = await useAsyncData(
  () => `cat-${category.value}`,
  () => api.getDocuments({ category: category.value, page_size: 200 }),
  { default: () => [] }
)

const filteredDocs = computed(() => (documents.value || []).filter(d => d.category === category.value))

function formatDate(date) {
  return date ? new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}
</script>

<style scoped>
.docs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.doc-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: transform 0.16s, border-color 0.16s, box-shadow 0.16s;
}

.doc-card:hover {
  transform: translateY(-2px);
  border-color: var(--line-strong);
  box-shadow: var(--shadow-md);
}

.doc-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.doc-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.doc-card h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 8px;
}

.doc-card h2 a {
  color: var(--ink);
  text-decoration: none;
}

.doc-card:hover h2 a {
  color: var(--accent);
}

.description {
  color: var(--muted);
  font-size: 13.5px;
  margin: 0 0 12px;
}

.info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
</style>
