<template>
  <div>
    <h1>Tag: #{{ tag }}</h1>
    <div class="documents">
      <div v-for="doc in documents" :key="doc.id" class="doc-card">
        <h2><NuxtLink :to="`/documents/${doc.id}`">{{ doc.title }}</NuxtLink></h2>
        <p class="description">{{ doc.description || 'No description' }}</p>
        <div class="info">By {{ doc.created_by }} | {{ formatDate(doc.updated_at) }}</div>
      </div>
      <div v-if="!documents?.length" class="empty">No documents with this tag</div>
    </div>
    <NuxtLink to="/tags" class="back">Back to tags</NuxtLink>
  </div>
</template>

<script setup>
const route = useRoute()
const api = useApi()
const tag = route.params.tag

const { data: documents } = await useAsyncData(`tag-${tag}`, () => api.getDocuments({ tag }), { default: () => [] })

function formatDate(date) {
  return new Date(date).toLocaleDateString()
}
</script>

<style scoped>
h1 { margin-bottom: 1.5rem; }
.documents { display: grid; gap: 1rem; }
.doc-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.doc-card h2 { margin-bottom: 0.5rem; }
.doc-card h2 a { color: #2c3e50; text-decoration: none; }
.description { color: #666; margin-bottom: 0.5rem; }
.info { font-size: 0.85rem; color: #999; }
.empty { text-align: center; padding: 2rem; color: #666; }
.back { display: inline-block; margin-top: 2rem; color: #3498db; }
</style>
