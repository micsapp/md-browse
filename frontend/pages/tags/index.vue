<template>
  <div>
    <h1>Tags</h1>
    <div class="tags">
      <NuxtLink v-for="tag in tags" :key="tag" :to="`/tags/${tag}`" class="tag">
        {{ tag }} ({{ getCount(tag) }})
      </NuxtLink>
      <div v-if="!tags?.length" class="empty">No tags yet</div>
    </div>
  </div>
</template>

<script setup>
const api = useApi()
const { data: tags } = await useAsyncData('tags', () => api.getTags(), { default: () => [] })
const { data: documents } = await useAsyncData('docs-for-tags', () => api.getDocuments(), { default: () => [] })

function getCount(tag) {
  return documents.value?.filter(d => d.tags?.includes(tag)).length || 0
}
</script>

<style scoped>
h1 { margin-bottom: 1.5rem; }
.tags { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.tag { background: #95a5a6; color: white; padding: 0.5rem 1rem; border-radius: 20px; text-decoration: none; transition: background 0.2s; }
.tag:hover { background: #7f8c8d; }
.empty { color: #666; }
</style>
