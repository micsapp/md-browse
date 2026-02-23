<template>
  <div>
    <h1>Categories</h1>
    <div class="categories">
      <NuxtLink v-for="cat in categories" :key="cat" :to="`/categories/${cat}`" class="category-card">
        <h2>{{ cat }}</h2>
        <span class="count">{{ getCount(cat) }} documents</span>
      </NuxtLink>
      <div v-if="!categories?.length" class="empty">No categories yet</div>
    </div>
  </div>
</template>

<script setup>
const api = useApi()
const { data: categories } = await useAsyncData('categories', () => api.getCategories(), { default: () => [] })
const { data: documents } = await useAsyncData('docs-for-cats', () => api.getDocuments(), { default: () => [] })

function getCount(cat) {
  return documents.value?.filter(d => d.category === cat).length || 0
}
</script>

<style scoped>
h1 { margin-bottom: 1.5rem; }
.categories { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
.category-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-decoration: none; color: inherit; transition: transform 0.2s; }
.category-card:hover { transform: translateY(-2px); }
.category-card h2 { font-size: 1.2rem; margin-bottom: 0.5rem; color: #2c3e50; }
.count { font-size: 0.9rem; color: #666; }
.empty { grid-column: 1 / -1; text-align: center; padding: 2rem; color: #666; }
</style>
