<template>
  <div>
    <div class="workspace-topline">
      <span>KNOWLEDGE TAXONOMY</span>
      <NuxtLink to="/" class="workspace-topline-link">
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-arrow-left"/></svg>
        <span>All Documents</span>
      </NuxtLink>
    </div>

    <header class="page-header">
      <div class="page-header-copy">
        <p class="page-eyebrow">BROWSE BY TOPIC</p>
        <h1 class="page-title">Categories</h1>
        <p class="page-subtitle">Explore documentation grouped by functional category.</p>
      </div>
      <div class="catalog-total">
        <strong>{{ filteredCategories.length }}</strong>
        <span>{{ filteredCategories.length === 1 ? 'category' : 'categories' }}</span>
      </div>
    </header>

    <div class="workspace-bar">
      <div class="workspace-bar-search">
        <svg class="ui-icon search-leading-icon" aria-hidden="true"><use href="#ui-search"/></svg>
        <input v-model="filterText" type="search" placeholder="Filter categories…" aria-label="Filter categories" />
      </div>
    </div>

    <div v-if="filteredCategories.length" class="categories-grid">
      <NuxtLink
        v-for="cat in filteredCategories"
        :key="cat"
        :to="`/categories/${encodeURIComponent(cat)}`"
        class="category-card"
      >
        <span class="category-icon">
          <svg class="ui-icon" aria-hidden="true"><use href="#ui-category"/></svg>
        </span>
        <div class="category-copy">
          <h2>{{ cat }}</h2>
          <span class="count">{{ getCount(cat) }} {{ getCount(cat) === 1 ? 'document' : 'documents' }}</span>
        </div>
        <svg class="ui-icon ui-icon--sm category-arrow" aria-hidden="true"><use href="#ui-arrow"/></svg>
      </NuxtLink>
    </div>

    <div v-else class="catalog-empty">
      <svg class="ui-icon" aria-hidden="true"><use href="#ui-category"/></svg>
      <strong>No categories found</strong>
      <span>Assign categories when uploading or editing documents to organize them here.</span>
    </div>
  </div>
</template>

<script setup>
const api = useApi()
const filterText = ref('')

const { data: categories } = await useAsyncData('categories', () => api.getCategories(), { default: () => [] })
const { data: documents } = await useAsyncData('docs-for-cats', () => api.getDocuments({ page_size: 200 }), { default: () => [] })

const filteredCategories = computed(() => {
  const q = filterText.value.trim().toLowerCase()
  const list = [...(categories.value || [])].sort((a, b) => a.localeCompare(b))
  if (!q) return list
  return list.filter(c => c.toLowerCase().includes(q))
})

function getCount(cat) {
  return documents.value?.filter(d => d.category === cat).length || 0
}
</script>

<style scoped>
.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.category-card {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 86px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  color: var(--ink);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: transform 0.16s, border-color 0.16s, box-shadow 0.16s;
}

.category-card:hover {
  transform: translateY(-2px);
  border-color: var(--line-strong);
  box-shadow: var(--shadow-md);
}

.category-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.category-copy {
  flex: 1;
  min-width: 0;
}

.category-copy h2 {
  font-size: 15.5px;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-card:hover .category-copy h2 {
  color: var(--accent);
}

.count {
  font-size: 12.5px;
  color: var(--muted);
}

.category-arrow {
  color: var(--subtle);
  transition: transform 0.15s, color 0.15s;
}

.category-card:hover .category-arrow {
  transform: translateX(3px);
  color: var(--accent);
}
</style>
