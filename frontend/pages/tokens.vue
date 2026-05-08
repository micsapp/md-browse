<template>
  <div>
    <h1>API Tokens</h1>
    <p class="hint">
      Use API tokens with the <code>md_cli</code> tool or any HTTP client by sending
      <code>X-Agent-Token: &lt;token&gt;</code>. The full secret is shown once at
      creation — copy it now and store it somewhere safe.
    </p>

    <div class="section-header">
      <h2>Your tokens</h2>
      <button class="btn-primary" @click="showCreate = !showCreate">
        {{ showCreate ? 'Cancel' : 'New Token' }}
      </button>
    </div>

    <!-- Create form -->
    <form v-if="showCreate" class="form-card" @submit.prevent="createToken">
      <h3>Create token</h3>
      <div class="field">
        <label>Name</label>
        <input v-model="newToken.name" required placeholder="e.g. my-laptop-cli" />
      </div>
      <div class="field">
        <label>Scopes</label>
        <div class="scopes">
          <label v-for="s in allScopes" :key="s" class="scope-check">
            <input type="checkbox" :value="s" v-model="newToken.scopes" />
            <span>{{ s }}</span>
          </label>
        </div>
      </div>
      <div class="field">
        <label>Expires (optional)</label>
        <input v-model="newToken.expires_at" type="date" />
      </div>
      <p v-if="createError" class="error">{{ createError }}</p>
      <button type="submit" class="btn-primary" :disabled="creating">
        {{ creating ? 'Creating...' : 'Create' }}
      </button>
    </form>

    <!-- Reveal new secret once -->
    <div v-if="newSecret" class="secret-card">
      <h3>Token created — copy now</h3>
      <p class="hint">
        This secret will <strong>not</strong> be shown again. Save it to your
        <code>.env</code> file as <code>MD_BROWSE_TOKEN</code>.
      </p>
      <div class="secret-row">
        <code class="secret">{{ newSecret }}</code>
        <button class="btn-primary" @click="copySecret">{{ copied ? 'Copied!' : 'Copy' }}</button>
      </div>
      <button class="btn-secondary" @click="newSecret = ''">Dismiss</button>
    </div>

    <!-- Token list -->
    <div v-if="loading" class="loading">Loading...</div>
    <table v-else-if="tokens.length" class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Prefix</th>
          <th>Scopes</th>
          <th>Created</th>
          <th>Expires</th>
          <th>Last used</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tokens" :key="t.id">
          <td>{{ t.name }}</td>
          <td><code>{{ t.token_prefix }}…</code></td>
          <td>
            <span v-for="s in t.scopes" :key="s" class="badge">{{ s }}</span>
          </td>
          <td>{{ formatDate(t.created_at) }}</td>
          <td>{{ formatDate(t.expires_at) || '—' }}</td>
          <td>{{ formatDate(t.last_used_at) || 'Never' }}</td>
          <td>
            <button class="btn-danger" @click="revokeToken(t)">Revoke</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="hint">No tokens yet. Click <strong>New Token</strong> to create one.</p>
  </div>
</template>

<script setup>
const auth = useAuth()
const config = useRuntimeConfig()

const allScopes = [
  'documents:read',
  'documents:write',
  'versions:read',
  'search:read',
  'audit:read'
]

const tokens = ref([])
const loading = ref(true)
const showCreate = ref(false)
const creating = ref(false)
const createError = ref('')
const newSecret = ref('')
const copied = ref(false)

const newToken = reactive({
  name: '',
  scopes: ['documents:read', 'documents:write', 'versions:read', 'search:read'],
  expires_at: ''
})

async function loadTokens() {
  loading.value = true
  try {
    const res = await $fetch(`${config.public.apiBase}/v1/agents/tokens`, {
      headers: auth.getAuthHeaders()
    })
    tokens.value = res.data || []
  } catch (err) {
    console.error('Failed to load tokens', err)
  } finally {
    loading.value = false
  }
}

async function createToken() {
  createError.value = ''
  if (!newToken.name.trim()) {
    createError.value = 'Name is required'
    return
  }
  if (!newToken.scopes.length) {
    createError.value = 'Select at least one scope'
    return
  }
  creating.value = true
  try {
    const body = {
      name: newToken.name.trim(),
      scopes: [...newToken.scopes]
    }
    if (newToken.expires_at) {
      body.expires_at = new Date(newToken.expires_at).toISOString()
    }
    const res = await $fetch(`${config.public.apiBase}/v1/agents/tokens`, {
      method: 'POST',
      headers: auth.getAuthHeaders(),
      body
    })
    newSecret.value = res.secret_token
    showCreate.value = false
    newToken.name = ''
    newToken.expires_at = ''
    await loadTokens()
  } catch (err) {
    createError.value = err.data?.error?.message || 'Failed to create token'
  } finally {
    creating.value = false
  }
}

async function revokeToken(t) {
  if (!confirm(`Revoke token "${t.name}"? Any client using it will stop working.`)) return
  try {
    await $fetch(`${config.public.apiBase}/v1/agents/tokens/${t.id}`, {
      method: 'DELETE',
      headers: auth.getAuthHeaders()
    })
    await loadTokens()
  } catch (err) {
    alert(err.data?.error?.message || 'Failed to revoke token')
  }
}

async function copySecret() {
  try {
    await navigator.clipboard.writeText(newSecret.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    alert('Copy failed — select and copy manually')
  }
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : ''
}

onMounted(loadTokens)
</script>

<style scoped>
h1 { margin-bottom: 0.5rem; }
.hint { color: var(--text2); font-size: 0.9rem; margin-bottom: 1.5rem; }
.hint code { background: var(--surface2); padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.85em; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin: 1rem 0; }
.section-header h2 { margin: 0; }
.form-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 2px 4px var(--shadow); color: var(--text); }
.form-card h3 { margin-bottom: 1rem; }
.field { margin-bottom: 1rem; }
.field label { display: block; font-weight: 500; margin-bottom: 0.4rem; color: var(--text); }
.field input[type="text"], .field input[type="date"], .field input:not([type]) {
  width: 100%; max-width: 360px; padding: 0.5rem;
  border: 1px solid var(--border2); border-radius: 4px; font-size: 1rem;
  background: var(--surface2); color: var(--text);
}
.scopes { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.scope-check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
.scope-check input { margin: 0; }
.btn-primary { background: var(--accent); color: #fff; border: none; border-radius: 4px; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.9rem; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border2); border-radius: 4px; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.9rem; margin-top: 0.75rem; }
.btn-danger { background: var(--danger); color: #fff; border: none; border-radius: 4px; padding: 0.35rem 0.75rem; cursor: pointer; font-size: 0.85rem; }
.error { color: var(--danger); margin-bottom: 0.5rem; }
.secret-card { background: var(--surface); border: 2px solid var(--warning); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; color: var(--text); }
.secret-card h3 { color: var(--warning); margin-bottom: 0.5rem; }
.secret-row { display: flex; gap: 0.5rem; align-items: center; margin: 0.75rem 0; flex-wrap: wrap; }
.secret { flex: 1; padding: 0.6rem; background: var(--surface2); border: 1px solid var(--border2); border-radius: 4px; font-family: monospace; font-size: 0.9rem; word-break: break-all; }
.table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 2px 4px var(--shadow); overflow: hidden; color: var(--text); }
.table th { background: var(--surface2); text-align: left; padding: 0.75rem 1rem; font-weight: 600; color: var(--text); }
.table td { padding: 0.75rem 1rem; border-top: 1px solid var(--border); color: var(--text); vertical-align: middle; }
.table code { background: var(--surface2); padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.85em; }
.badge { display: inline-block; background: var(--tag-bg); color: #fff; padding: 0.1rem 0.5rem; border-radius: 3px; font-size: 0.75rem; margin-right: 0.25rem; margin-bottom: 0.15rem; }
.loading { padding: 2rem; color: var(--text3); text-align: center; }
</style>
