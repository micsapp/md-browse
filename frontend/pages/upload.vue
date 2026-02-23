<template>
  <div class="upload-page">
    <h1>Upload Document</h1>
    <form @submit.prevent="upload" class="upload-form">
      <div class="field">
        <label>Markdown File</label>
        <input type="file" accept=".md,.markdown" @change="onFileChange" required />
      </div>
      <div class="field">
        <label>Folder (optional)</label>
        <select v-model="form.folder_id">
          <option value="">Root (no folder)</option>
          <option v-for="f in flatFolders" :key="f.id" :value="f.id">
            {{ '\u00a0\u00a0'.repeat(f.depth) }}{{ f.name }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>Category</label>
        <input v-model="form.category" placeholder="e.g., tutorial, guide, reference" />
      </div>
      <div class="field">
        <label>Tags (comma separated)</label>
        <input v-model="form.tags" placeholder="e.g., vue, javascript, frontend" />
      </div>
      <div v-if="error" class="error-msg">{{ error }}</div>
      <button type="submit" :disabled="uploading">{{ uploading ? 'Uploading...' : 'Upload' }}</button>
    </form>

    <div class="info">
      <h3>Supported Frontmatter</h3>
      <p>Your markdown can include YAML frontmatter:</p>
      <pre>---
title: My Document
description: A brief description
category: tutorial
tags: [vue, javascript]
---</pre>
    </div>
  </div>
</template>

<script setup>

const api = useApi()
const router = useRouter()

const form = ref({ category: '', tags: '', folder_id: '' })
const file = ref(null)
const uploading = ref(false)
const error = ref('')

// Load folders for the selector
const { data: allFolders } = await useAsyncData('upload-folders', async () => {
  if (import.meta.server) return []
  try { return await api.getFolders() } catch { return [] }
}, { default: () => [], server: false })

const flatFolders = computed(() => {
  function flatten(parentId, depth) {
    return (allFolders.value || [])
      .filter(f => f.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap(f => [{ ...f, depth }, ...flatten(f.id, depth + 1)])
  }
  return flatten(null, 0)
})

function onFileChange(e) {
  file.value = e.target.files[0]
}

async function upload() {
  if (!file.value) return

  uploading.value = true
  error.value = ''
  const formData = new FormData()
  formData.append('file', file.value)
  formData.append('category', form.value.category)
  formData.append('tags', form.value.tags)
  if (form.value.folder_id) formData.append('folder_id', form.value.folder_id)

  try {
    const result = await api.createDocument(formData)
    const doc = result.documents?.[0] || result
    router.push(`/documents/${doc.id}`)
  } catch (e) {
    error.value = e.data?.error?.message || e.data?.error || e.message || 'Upload failed'
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.upload-page { max-width: 600px; }
h1 { margin-bottom: 1.5rem; }
.upload-form { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.field { margin-bottom: 1rem; }
.field label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
.field input, .field select { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 0.95rem; }
.error-msg { color: #e74c3c; margin-bottom: 1rem; font-size: 0.9rem; }
button { padding: 0.75rem 2rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
button:disabled { opacity: 0.5; }
.info { margin-top: 2rem; background: #f9f9f9; padding: 1.5rem; border-radius: 8px; }
.info h3 { margin-bottom: 0.5rem; }
.info pre { background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.9rem; }
</style>
