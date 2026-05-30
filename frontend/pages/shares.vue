<template>
  <div>
    <h1>Share Links</h1>
    <p class="hint">
      Manage every share link you've created. Give a link a friendly custom URL
      (alias) so it's easy to remember — if the alias is already taken we'll
      suggest an available one.
      <span v-if="auth.isAdmin"> As an admin you can see and manage every user's links.</span>
    </p>

    <div class="section-header">
      <h2>Active links <span v-if="!loading" class="count">({{ shares.length }})</span></h2>
      <button class="btn-secondary" @click="load" :disabled="loading">Refresh</button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <p v-else-if="!shares.length" class="hint">
      No share links yet. Open a document and click <strong>Share</strong> to create one.
    </p>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Document</th>
          <th>Link / Alias</th>
          <th>Access</th>
          <th v-if="auth.isAdmin">Owner</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in shares" :key="s.id">
          <td>
            <NuxtLink v-if="!s.document_deleted" :to="`/documents/${s.document_id}`" class="doc-link">
              {{ s.document_title || '(untitled)' }}
            </NuxtLink>
            <span v-else class="deleted">{{ s.document_title || '(untitled)' }} — deleted</span>
          </td>

          <td>
            <!-- View mode -->
            <div v-if="editingId !== s.id" class="link-cell">
              <span class="link-icon">{{ s.has_access_code ? '🔒' : '🔗' }}</span>
              <input :value="shareUrl(s)" readonly class="link-url" @click="$event.target.select()" />
              <button class="btn-sm" @click="copy(s)">{{ copiedId === s.id ? '✓' : 'Copy' }}</button>
              <span v-if="!s.slug" class="badge-token">random token</span>
            </div>

            <!-- Edit mode -->
            <div v-else class="alias-edit">
              <div class="alias-row">
                <span class="alias-prefix">/share/</span>
                <input
                  v-model="editSlug"
                  class="alias-input"
                  :class="aliasInputClass"
                  placeholder="custom-url (blank = random token)"
                  @keyup.enter="saveAlias(s)"
                  @keyup.esc="cancelEdit"
                />
                <button class="btn-sm btn-accent" @click="saveAlias(s)" :disabled="saving">Save</button>
                <button class="btn-sm" @click="cancelEdit">Cancel</button>
              </div>
              <p v-if="checkState.checking" class="alias-status checking">Checking…</p>
              <p v-else-if="checkState.message" class="alias-status" :class="checkState.ok ? 'ok' : 'bad'">
                {{ checkState.message }}
                <button
                  v-if="checkState.suggestion"
                  type="button"
                  class="suggest-btn"
                  @click="editSlug = checkState.suggestion"
                >
                  Use “{{ checkState.suggestion }}”
                </button>
              </p>
              <p v-if="editError" class="alias-status bad">{{ editError }}</p>
            </div>
          </td>

          <td>{{ s.has_access_code ? 'Code required' : 'Public' }}</td>
          <td v-if="auth.isAdmin">{{ s.created_by }}</td>
          <td>{{ formatDate(s.created_at) }}</td>
          <td class="actions-cell">
            <button v-if="editingId !== s.id" class="btn-sm" @click="startEdit(s)">
              {{ s.slug ? 'Edit alias' : 'Add alias' }}
            </button>
            <button class="btn-sm btn-danger" @click="revoke(s)">Revoke</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const api = useApi()
const auth = useAuth()

const shares = ref([])
const loading = ref(true)
const copiedId = ref(null)

const editingId = ref(null)
const editSlug = ref('')
const editError = ref('')
const saving = ref(false)
const checkState = reactive({ checking: false, ok: false, message: '', suggestion: '' })

const origin = ref('')

function shareUrl(s) {
  return `${origin.value}/share/${s.slug || s.token}`
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : ''
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

// Debounced live availability check against the current row's original slug.
let checkTimer = null
watch(editSlug, (val) => {
  resetCheck()
  if (checkTimer) clearTimeout(checkTimer)
  const slug = val.trim()
  if (!slug) return // blank = fall back to random token, nothing to check
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
      // Guard against a stale response after the user kept typing
      if (slug !== editSlug.value.trim()) return
      checkState.checking = false
      if (res.available) {
        checkState.ok = true
        checkState.message = 'Available'
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
h1 { margin-bottom: 0.5rem; }
.hint { color: var(--text2); font-size: 0.9rem; margin-bottom: 1.5rem; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin: 1rem 0; }
.section-header h2 { margin: 0; }
.count { color: var(--text3); font-weight: 400; font-size: 0.9rem; }
.loading { padding: 2rem; color: var(--text3); text-align: center; }

.table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 2px 4px var(--shadow); overflow: hidden; color: var(--text); }
.table th { background: var(--surface2); text-align: left; padding: 0.6rem 0.85rem; font-weight: 600; color: var(--text); font-size: 0.85rem; }
.table td { padding: 0.6rem 0.85rem; border-top: 1px solid var(--border); color: var(--text); vertical-align: middle; font-size: 0.88rem; }

.doc-link { color: var(--accent); text-decoration: none; }
.doc-link:hover { text-decoration: underline; }
.deleted { color: var(--text3); font-style: italic; }

.link-cell { display: flex; gap: 0.4rem; align-items: center; }
.link-icon { flex-shrink: 0; }
.link-url { flex: 1; min-width: 160px; padding: 0.25rem 0.4rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.78rem; font-family: monospace; background: var(--surface2); color: var(--text); cursor: text; }
.badge-token { font-size: 0.7rem; color: var(--text3); white-space: nowrap; }

.alias-edit { display: flex; flex-direction: column; gap: 0.3rem; }
.alias-row { display: flex; gap: 0.3rem; align-items: center; }
.alias-prefix { font-family: monospace; font-size: 0.8rem; color: var(--text3); }
.alias-input { flex: 1; min-width: 160px; padding: 0.28rem 0.45rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.82rem; font-family: monospace; background: var(--surface); color: var(--text); }
.alias-input.input-ok { border-color: var(--success); }
.alias-input.input-bad { border-color: var(--danger); }
.alias-status { font-size: 0.78rem; margin: 0; }
.alias-status.checking { color: var(--text3); }
.alias-status.ok { color: var(--success); }
.alias-status.bad { color: var(--danger); }
.suggest-btn { margin-left: 0.4rem; padding: 0.1rem 0.45rem; font-size: 0.75rem; background: var(--surface2); color: var(--accent); border: 1px solid var(--border2); border-radius: 4px; cursor: pointer; }
.suggest-btn:hover { border-color: var(--accent); }

.actions-cell { white-space: nowrap; }
.btn-sm { padding: 0.25rem 0.6rem; background: var(--surface2); color: var(--text); border: 1px solid var(--border2); border-radius: 4px; cursor: pointer; font-size: 0.78rem; margin-left: 0.3rem; }
.btn-sm:first-child { margin-left: 0; }
.btn-sm:hover { border-color: var(--accent); }
.btn-sm:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-accent { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-accent:hover { background: var(--accent-hover); }
.btn-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn-danger:hover { opacity: 0.9; }
.btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border2); border-radius: 4px; padding: 0.4rem 0.9rem; cursor: pointer; font-size: 0.85rem; }
.btn-secondary:hover { border-color: var(--accent); }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
