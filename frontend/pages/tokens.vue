<template>
  <div>
    <div class="workspace-topline">
      <span>DEVELOPER &amp; CLI ACCESS</span>
      <button type="button" class="workspace-topline-link" @click="showCreate = !showCreate">
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-plus"/></svg>
        <span>{{ showCreate ? 'Cancel' : 'Create Token' }}</span>
      </button>
    </div>

    <header class="page-header">
      <div class="page-header-copy">
        <p class="page-eyebrow">AUTOMATION &amp; CLI</p>
        <h1 class="page-title">API Tokens</h1>
        <p class="page-subtitle">
          Mint scoped bearer tokens for <code>md_cli</code> or HTTP automation via the <code>X-Agent-Token</code> header.
        </p>
      </div>
      <div class="catalog-total">
        <strong>{{ tokens.length }}</strong>
        <span>{{ tokens.length === 1 ? 'active token' : 'active tokens' }}</span>
      </div>
    </header>

    <div class="tokens-toolbar">
      <button type="button" class="btn btn-primary" @click="showCreate = !showCreate">
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-plus"/></svg>
        <span>{{ showCreate ? 'Close Form' : 'New API Token' }}</span>
      </button>
    </div>

    <!-- Create form -->
    <form v-if="showCreate" class="surface-card form-card" @submit.prevent="createToken">
      <h3>Create Scoped API Token</h3>
      <div class="form-grid">
        <div class="field">
          <label>Token Name</label>
          <input v-model="newToken.name" class="input-control" required placeholder="e.g., macbook-md-cli" />
        </div>
        <div class="field">
          <label>Expiration Date <span class="label-hint">(optional)</span></label>
          <input v-model="newToken.expires_at" type="date" class="input-control" />
        </div>
      </div>
      <div class="field">
        <label>Permission Scopes</label>
        <div class="scopes">
          <label v-for="s in allScopes" :key="s" class="scope-check">
            <input v-model="newToken.scopes" type="checkbox" :value="s" />
            <span>{{ s }}</span>
          </label>
        </div>
      </div>
      <p v-if="createError" class="error-msg">{{ createError }}</p>
      <div class="form-actions">
        <button type="button" class="btn" @click="showCreate = false">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="creating">
          {{ creating ? 'Creating…' : 'Generate Token' }}
        </button>
      </div>
    </form>

    <!-- Reveal new secret once -->
    <div v-if="newSecret" class="surface-card secret-card">
      <div class="secret-card-head">
        <span class="pill pill-warning">Copy Now — Shown Once</span>
        <button type="button" class="btn btn-xs" @click="newSecret = ''">Dismiss</button>
      </div>
      <h3>Your new API token is ready</h3>
      <p class="secret-hint">
        Store this token securely (for example in your <code>md_cli</code> profile or as <code>MD_BROWSE_TOKEN</code>).
      </p>
      <div class="secret-row">
        <code class="secret">{{ newSecret }}</code>
        <button type="button" class="btn btn-primary" @click="copySecret">
          {{ copied ? '✓ Copied!' : 'Copy Secret' }}
        </button>
      </div>
    </div>

    <!-- Token list -->
    <div v-if="loading" class="surface-card loading">Loading tokens…</div>

    <div v-else-if="tokens.length" class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Prefix</th>
            <th>Scopes</th>
            <th>Created</th>
            <th>Expires</th>
            <th>Last Used</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tokens" :key="t.id">
            <td><strong>{{ t.name }}</strong></td>
            <td><code class="token-prefix">{{ t.token_prefix }}…</code></td>
            <td>
              <div class="scope-pills">
                <span v-for="s in t.scopes" :key="s" class="pill">{{ s }}</span>
              </div>
            </td>
            <td class="td-date">{{ formatDate(t.created_at) }}</td>
            <td class="td-date">{{ formatDate(t.expires_at) || 'Never' }}</td>
            <td class="td-date">{{ formatDate(t.last_used_at) || 'Never' }}</td>
            <td style="text-align:right;">
              <button type="button" class="btn btn-xs btn-danger" @click="revokeToken(t)">Revoke</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="catalog-empty">
      <svg class="ui-icon" aria-hidden="true"><use href="#ui-key"/></svg>
      <strong>No API tokens created yet</strong>
      <span>Generate a token above to connect <code>md_cli</code> or automated workflows.</span>
    </div>
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
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

onMounted(loadTokens)
</script>

<style scoped>
.tokens-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.form-card {
  margin-bottom: 20px;
}

.form-card h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 700;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-weight: 600;
  font-size: 12.5px;
  margin-bottom: 6px;
}

.label-hint {
  font-weight: 450;
  color: var(--muted);
}

.scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scope-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--canvas);
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.error-msg {
  color: var(--danger);
  font-size: 13px;
  margin-bottom: 10px;
}

.secret-card {
  border-color: var(--warning-border);
  background: var(--warning-soft);
  margin-bottom: 20px;
}

.secret-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.secret-card h3 {
  margin: 0 0 4px;
  font-size: 16px;
}

.secret-hint {
  color: var(--ink-secondary);
  font-size: 13px;
  margin-bottom: 12px;
}

.secret-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.secret {
  flex: 1;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  word-break: break-all;
}

.token-prefix {
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--raised);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.scope-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.td-date {
  color: var(--muted);
  font-size: 12.5px;
  white-space: nowrap;
}

.loading {
  text-align: center;
  padding: 48px 24px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
