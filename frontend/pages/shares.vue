<template>
  <div>
    <div class="workspace-topline">
      <span>EXTERNAL SHARING</span>
      <button type="button" class="workspace-topline-link" :disabled="loading" @click="load">
        <span>Refresh List</span>
      </button>
    </div>

    <header class="page-header">
      <div class="page-header-copy">
        <p class="page-eyebrow">PUBLIC &amp; PROTECTED LINKS</p>
        <h1 class="page-title">Shared Links</h1>
        <p class="page-subtitle">
          Manage every share link you've created and assign custom friendly URLs.
          <span v-if="auth.isAdmin"> As an administrator, you can view and manage all users' links.</span>
        </p>
      </div>
      <div class="catalog-total">
        <strong>{{ filteredShares.length }}</strong>
        <span>{{ filteredShares.length === 1 ? 'active link' : 'active links' }}</span>
      </div>
    </header>

    <div class="workspace-bar">
      <div class="workspace-bar-search">
        <svg class="ui-icon search-leading-icon" aria-hidden="true"><use href="#ui-search"/></svg>
        <input v-model="filterText" type="search" placeholder="Filter by document title, slug, or owner…" />
      </div>
      <button type="button" class="btn btn-sm" :disabled="loading" @click="load">Refresh</button>
    </div>

    <div v-if="loading" class="surface-card loading">Loading share links…</div>

    <div v-else-if="!filteredShares.length" class="catalog-empty">
      <svg class="ui-icon" aria-hidden="true"><use href="#ui-share"/></svg>
      <strong>No share links found</strong>
      <span>Open any document and click <strong>Share</strong> to create a public or password-protected link.</span>
    </div>

    <div v-else class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Share URL / Custom Alias</th>
            <th>Access</th>
            <th v-if="auth.isAdmin">Owner</th>
            <th>Created</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filteredShares" :key="s.id">
            <td>
              <NuxtLink v-if="!s.document_deleted" :to="`/documents/${s.document_id}`" class="doc-link">
                {{ s.document_title || '(untitled)' }}
              </NuxtLink>
              <span v-else class="deleted">{{ s.document_title || '(untitled)' }} — deleted</span>
            </td>

            <td>
              <!-- View mode -->
              <div v-if="editingId !== s.id" class="link-cell">
                <input :value="shareUrl(s)" readonly class="input-control link-url" @click="$event.target.select()" />
                <button type="button" class="btn btn-xs" @click="copy(s)">
                  {{ copiedId === s.id ? '✓ Copied' : 'Copy' }}
                </button>
                <a :href="shareUrl(s)" target="_blank" rel="noopener" class="btn btn-xs" title="Open share link">
                  <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-external"/></svg>
                </a>
                <span v-if="s.slug" class="pill pill-accent">alias</span>
              </div>

              <!-- Edit mode -->
              <div v-else class="alias-edit">
                <div class="alias-row">
                  <span class="alias-prefix">/share/</span>
                  <input
                    v-model="editSlug"
                    class="input-control alias-input"
                    :class="aliasInputClass"
                    placeholder="custom-url (blank = random token)"
                    @keyup.enter="saveAlias(s)"
                    @keyup.esc="cancelEdit"
                  />
                  <button type="button" class="btn btn-xs btn-primary" :disabled="saving" @click="saveAlias(s)">Save</button>
                  <button type="button" class="btn btn-xs" @click="cancelEdit">Cancel</button>
                </div>
                <p v-if="checkState.checking" class="alias-status checking">Checking availability…</p>
                <p v-else-if="checkState.message" class="alias-status" :class="checkState.ok ? 'ok' : 'bad'">
                  {{ checkState.message }}
                  <button
                    v-if="checkState.suggestion"
                    type="button"
                    class="btn btn-xs btn-soft"
                    @click="editSlug = checkState.suggestion"
                  >
                    Use “{{ checkState.suggestion }}”
                  </button>
                </p>
                <p v-if="editError" class="alias-status bad">{{ editError }}</p>
              </div>
            </td>

            <td>
              <span class="pill" :class="s.has_access_code ? 'pill-warning' : 'pill-success'">
                {{ s.has_access_code ? 'Code required' : 'Public' }}
              </span>
            </td>
            <td v-if="auth.isAdmin">{{ s.created_by }}</td>
            <td class="td-date">{{ formatDate(s.created_at) }}</td>
            <td class="actions-cell">
              <div style="display:flex; gap:6px; justify-content:flex-end;">
                <button v-if="editingId !== s.id" type="button" class="btn btn-xs" @click="startEdit(s)">
                  {{ s.slug ? 'Edit Alias' : 'Add Alias' }}
                </button>
                <button type="button" class="btn btn-xs btn-danger" @click="revoke(s)">Revoke</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
const api = useApi()
const auth = useAuth()

const shares = ref([])
const loading = ref(true)
const copiedId = ref(null)
const filterText = ref('')

const editingId = ref(null)
const editSlug = ref('')
const editError = ref('')
const saving = ref(false)
const checkState = reactive({ checking: false, ok: false, message: '', suggestion: '' })

const origin = ref('')

const filteredShares = computed(() => {
  const q = filterText.value.trim().toLowerCase()
  if (!q) return shares.value
  return shares.value.filter(s =>
    (s.document_title || '').toLowerCase().includes(q) ||
    (s.slug || '').toLowerCase().includes(q) ||
    (s.token || '').toLowerCase().includes(q) ||
    (s.created_by || '').toLowerCase().includes(q)
  )
})

function shareUrl(s) {
  return `${origin.value}/share/${s.slug || s.token}`
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

function apiErrMessage(e) {
  return e?.data?.error?.message || e?.response?._data?.error?.message || e?.message || 'Request failed.'
}

function apiErrSuggestion(e) {
  return e?.data?.error?.suggestion || e?.response?._data?.error?.suggestion || ''
}

async function load() {
  loading.value = true
  try {
    shares.value = await api.getAllShares()
  } catch (e) {
    console.error('Failed to load shares', e)
  } finally {
    loading.value = false
  }
}

async function copy(s) {
  try {
    await navigator.clipboard.writeText(shareUrl(s))
    copiedId.value = s.id
    setTimeout(() => { if (copiedId.value === s.id) copiedId.value = null }, 1500)
  } catch {
    alert('Copy failed — select and copy manually')
  }
}

function startEdit(s) {
  editingId.value = s.id
  editSlug.value = s.slug || ''
  editError.value = ''
  resetCheck()
}

function cancelEdit() {
  editingId.value = null
  editSlug.value = ''
  editError.value = ''
  resetCheck()
}

function resetCheck() {
  checkState.checking = false
  checkState.ok = false
  checkState.message = ''
  checkState.suggestion = ''
}

const aliasInputClass = computed(() => {
  if (!editSlug.value.trim()) return ''
  if (checkState.checking) return ''
  if (checkState.message) return checkState.ok ? 'input-ok' : 'input-bad'
  return ''
})

let checkTimer = null
watch(editSlug, (val) => {
  resetCheck()
  if (checkTimer) clearTimeout(checkTimer)
  const slug = val.trim()
  if (!slug) return
  const current = shares.value.find(s => s.id === editingId.value)
  if (current && slug === current.slug) {
    checkState.ok = true
    checkState.message = 'Current alias'
    return
  }
  checkState.checking = true
  checkTimer = setTimeout(async () => {
    try {
      const res = await api.checkShareSlug(slug)
      if (slug !== editSlug.value.trim()) return
      checkState.checking = false
      if (res.available) {
        checkState.ok = true
        checkState.message = '✓ Available'
        checkState.suggestion = ''
      } else {
        checkState.ok = false
        checkState.message = res.reason || 'Not available'
        checkState.suggestion = res.suggestion || ''
      }
    } catch (e) {
      checkState.checking = false
      checkState.ok = false
      checkState.message = apiErrMessage(e)
      checkState.suggestion = apiErrSuggestion(e)
    }
  }, 350)
})

async function saveAlias(s) {
  editError.value = ''
  saving.value = true
  try {
    const slug = editSlug.value.trim()
    await api.updateShare(s.id, { slug: slug || null })
    cancelEdit()
    await load()
  } catch (e) {
    editError.value = apiErrMessage(e)
    const suggestion = apiErrSuggestion(e)
    if (suggestion) {
      checkState.ok = false
      checkState.message = 'That alias is taken.'
      checkState.suggestion = suggestion
    }
  } finally {
    saving.value = false
  }
}

async function revoke(s) {
  if (!confirm(`Revoke this share link?\n${shareUrl(s)}`)) return
  try {
    await api.deleteShare(s.id)
    if (editingId.value === s.id) cancelEdit()
    await load()
  } catch (e) {
    alert(apiErrMessage(e))
  }
}

onMounted(() => {
  origin.value = window.location.origin
  load()
})
</script>

<style scoped>
.loading {
  padding: 48px 24px;
  color: var(--muted);
  text-align: center;
}

.doc-link {
  color: var(--ink);
  font-weight: 650;
  text-decoration: none;
}

.doc-link:hover {
  color: var(--accent);
}

.deleted {
  color: var(--muted);
  font-style: italic;
}

.link-cell {
  display: flex;
  gap: 6px;
  align-items: center;
}

.link-url {
  flex: 1;
  min-width: 220px;
  padding: 5px 9px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.alias-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alias-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.alias-prefix {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  color: var(--muted);
}

.alias-input {
  flex: 1;
  min-width: 170px;
  padding: 5px 9px;
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.alias-input.input-ok {
  border-color: var(--success);
}

.alias-input.input-bad {
  border-color: var(--danger);
}

.alias-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin: 0;
}

.alias-status.checking { color: var(--muted); }
.alias-status.ok { color: var(--success); }
.alias-status.bad { color: var(--danger); }

.td-date {
  color: var(--muted);
  font-size: 12.5px;
  white-space: nowrap;
}

.actions-cell {
  white-space: nowrap;
}
</style>
