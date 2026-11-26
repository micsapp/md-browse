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
        <p class="page-eyebrow">INDEXED LABELS</p>
        <h1 class="page-title">Tags</h1>
        <p class="page-subtitle">Filter and discover documents across cross-cutting tags.</p>
      </div>
      <div class="catalog-total">
        <strong>{{ filteredTags.length }}</strong>
        <span>{{ filteredTags.length === 1 ? 'tag' : 'tags' }}</span>
      </div>
    </header>

    <div class="workspace-bar">
      <div class="workspace-bar-search">
        <svg class="ui-icon search-leading-icon" aria-hidden="true"><use href="#ui-search"/></svg>
        <input v-model="filterText" type="search" placeholder="Filter tags…" aria-label="Filter tags" />
      </div>
    </div>

    <div v-if="filteredTags.length" class="tags-cloud surface-card">
      <NuxtLink
        v-for="tag in filteredTags"
        :key="tag"
        :to="`/tags/${encodeURIComponent(tag)}`"
        class="tag-cloud-item"
      >
        <span class="tag-hash">#</span>
        <span class="tag-name">{{ tag }}</span>
        <span class="tag-count">{{ getCount(tag) }}</span>
      </NuxtLink>
    </div>

    <div v-else class="catalog-empty">
      <svg class="ui-icon" aria-hidden="true"><use href="#ui-tag"/></svg>
      <strong>No tags found</strong>
      <span>Add comma-separated tags when uploading or editing documents.</span>
    </div>
  </div>
</template>

<script setup>
const api = useApi()
const filterText = ref('')

const { data: tags } = await useAsyncData('tags', () => api.getTags(), { default: () => [] })
const { data: documents } = await useAsyncData('docs-for-tags', () => api.getDocuments({ page_size: 200 }), { default: () => [] })

const filteredTags = computed(() => {
  const q = filterText.value.trim().toLowerCase()
  const list = [...(tags.value || [])].sort((a, b) => a.localeCompare(b))
  if (!q) return list
  return list.filter(t => t.toLowerCase().includes(q))
})

function getCount(tag) {
  return documents.value?.filter(d => d.tags?.includes(tag)).length || 0
}
</script>

<style scoped>
.tags-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-cloud-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--raised);
  color: var(--ink);
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.15s;
}

.tag-cloud-item:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  transform: translateY(-1px);
}

.tag-hash {
  color: var(--accent);
  font-weight: 750;
}

.tag-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 650;
}
</style>
