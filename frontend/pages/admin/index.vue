<template>
  <div>
    <div class="workspace-topline">
      <span>SYSTEM ADMINISTRATION</span>
      <NuxtLink to="/" class="workspace-topline-link">
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-arrow-left"/></svg>
        <span>Back to Workspace</span>
      </NuxtLink>
    </div>

    <header class="page-header">
      <div class="page-header-copy">
        <p class="page-eyebrow">ACCESS &amp; GOVERNANCE</p>
        <h1 class="page-title">Admin Panel</h1>
        <p class="page-subtitle">Manage workspace accounts, registration policies, and audit activity.</p>
      </div>
    </header>

    <!-- Summary Cards -->
    <div class="admin-stats">
      <div class="surface-card stat-card">
        <span class="stat-label">Total Accounts</span>
        <strong class="stat-value">{{ users.length }}</strong>
      </div>
      <div class="surface-card stat-card">
        <span class="stat-label">Administrators</span>
        <strong class="stat-value">{{ users.filter(u => u.role === 'admin').length }}</strong>
      </div>
      <div class="surface-card stat-card">
        <span class="stat-label">Self-Registration</span>
        <strong class="stat-value">{{ settings.registration_enabled ? 'Enabled' : 'Disabled' }}</strong>
      </div>
    </div>

    <div class="admin-tabs" role="tablist">
      <button type="button" :class="{ active: tab === 'users' }" @click="tab = 'users'">Users</button>
      <button type="button" :class="{ active: tab === 'settings' }" @click="tab = 'settings'">Settings</button>
      <button type="button" :class="{ active: tab === 'audit' }" @click="tab = 'audit'; loadAuditLogs()">Audit Log</button>
    </div>

    <!-- Users Tab -->
    <section v-if="tab === 'users'" class="section">
      <div class="section-header">
        <h2>Workspace Users</h2>
        <button type="button" class="btn btn-sm btn-primary" @click="showAddUser = !showAddUser">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-plus"/></svg>
          <span>{{ showAddUser ? 'Cancel' : 'Add User' }}</span>
        </button>
      </div>

      <!-- Add User Form -->
      <form v-if="showAddUser" class="surface-card form-card" @submit.prevent="createUser">
        <h3>Create New User</h3>
        <div class="form-grid">
          <div class="field">
            <label>Username</label>
            <input v-model="newUser.username" class="input-control" required placeholder="Username" />
          </div>
          <div class="field">
            <label>Password</label>
            <input v-model="newUser.password" type="password" class="input-control" required placeholder="Password" />
          </div>
          <div class="field">
            <label>Role</label>
            <select v-model="newUser.role" class="select-control">
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <p v-if="userError" class="error">{{ userError }}</p>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn btn-sm" @click="showAddUser = false">Cancel</button>
          <button type="submit" class="btn btn-sm btn-primary">Create Account</button>
        </div>
      </form>

      <!-- Users Table -->
      <div v-if="usersLoading" class="surface-card loading">Loading users…</div>
      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.username">
              <td>
                <strong>{{ u.username }}</strong>
                <span v-if="u.username === auth.user" class="pill pill-accent" style="margin-left:8px;">You</span>
              </td>
              <td>
                <select
                  :value="u.role"
                  :disabled="u.username === auth.user"
                  class="select-control role-select"
                  @change="updateRole(u.username, $event.target.value)"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td class="td-date">{{ formatDate(u.created_at) }}</td>
              <td style="text-align:right;">
                <button
                  type="button"
                  class="btn btn-xs btn-danger"
                  :disabled="u.username === auth.user"
                  @click="deleteUser(u.username)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Settings Tab -->
    <section v-if="tab === 'settings'" class="section">
      <div v-if="settingsLoading" class="surface-card loading">Loading settings…</div>
      <div v-else class="surface-card form-card">
        <div class="toggle-row">
          <div>
            <strong>Allow Public Account Registration</strong>
            <p class="hint">When disabled, only administrators can create new user accounts.</p>
          </div>
          <label class="toggle">
            <input v-model="settings.registration_enabled" type="checkbox" @change="saveSettings" />
            <span class="slider"></span>
          </label>
        </div>
        <p v-if="settingsMsg" class="success">{{ settingsMsg }}</p>
      </div>
    </section>

    <!-- Audit Log Tab -->
    <section v-if="tab === 'audit'" class="section">
      <div class="section-header">
        <h2>Recent Audit Events</h2>
        <button type="button" class="btn btn-sm" :disabled="auditLoading" @click="loadAuditLogs">Refresh</button>
      </div>
      <div v-if="auditLoading" class="surface-card loading">Loading audit events…</div>
      <div v-else-if="auditLogs.length" class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in auditLogs" :key="item.id">
              <td class="td-date">{{ formatDateTime(item.created_at) }}</td>
              <td>
                <strong>{{ item.actor_id }}</strong>
                <span class="pill" style="margin-left:6px;">{{ item.actor_type }}</span>
              </td>
              <td><span class="pill pill-accent">{{ item.action }}</span></td>
              <td class="td-date">{{ item.resource_type }}: {{ item.resource_id }}</td>
              <td class="td-date">{{ formatMeta(item.metadata) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="catalog-empty">
        <strong>No audit events recorded</strong>
      </div>
    </section>
  </div>
</template>

<script setup>
definePageMeta({ middleware: 'admin' })

const auth = useAuth()
const config = useRuntimeConfig()

const tab = ref('users')

// ── Users ────────────────────────────────────────────────────────────────────
const users = ref([])
const usersLoading = ref(true)
const showAddUser = ref(false)
const userError = ref('')
const newUser = reactive({ username: '', password: '', role: 'viewer' })

async function loadUsers() {
  usersLoading.value = true
  try {
    users.value = await $fetch(`${config.public.apiBase}/v1/admin/users`, {
      headers: auth.getAuthHeaders()
    })
  } finally {
    usersLoading.value = false
  }
}

async function createUser() {
  userError.value = ''
  try {
    await $fetch(`${config.public.apiBase}/v1/admin/users`, {
      method: 'POST',
      headers: auth.getAuthHeaders(),
      body: { ...newUser }
    })
    newUser.username = ''
    newUser.password = ''
    newUser.role = 'viewer'
    showAddUser.value = false
    await loadUsers()
  } catch (err) {
    userError.value = err.data?.error?.message || 'Failed to create user'
  }
}

async function updateRole(username, role) {
  try {
    await $fetch(`${config.public.apiBase}/v1/admin/users/${username}`, {
      method: 'PUT',
      headers: auth.getAuthHeaders(),
      body: { role }
    })
    await loadUsers()
  } catch (err) {
    alert(err.data?.error?.message || 'Failed to update role')
  }
}

async function deleteUser(username) {
  if (!confirm(`Delete user "${username}"?`)) return
  try {
    await $fetch(`${config.public.apiBase}/v1/admin/users/${username}`, {
      method: 'DELETE',
      headers: auth.getAuthHeaders()
    })
    await loadUsers()
  } catch (err) {
    alert(err.data?.error?.message || 'Failed to delete user')
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────
const settings = reactive({ registration_enabled: true })
const settingsLoading = ref(true)
const settingsMsg = ref('')

async function loadSettings() {
  settingsLoading.value = true
  try {
    const data = await $fetch(`${config.public.apiBase}/v1/admin/settings`, {
      headers: auth.getAuthHeaders()
    })
    Object.assign(settings, data)
  } finally {
    settingsLoading.value = false
  }
}

async function saveSettings() {
  settingsMsg.value = ''
  try {
    await $fetch(`${config.public.apiBase}/v1/admin/settings`, {
      method: 'PUT',
      headers: auth.getAuthHeaders(),
      body: { ...settings }
    })
    settingsMsg.value = 'Settings saved.'
    setTimeout(() => { settingsMsg.value = '' }, 2000)
  } catch (err) {
    alert(err.data?.error?.message || 'Failed to save settings')
  }
}

// ── Audit Log ────────────────────────────────────────────────────────────────
const auditLogs = ref([])
const auditLoading = ref(false)

async function loadAuditLogs() {
  auditLoading.value = true
  try {
    const res = await $fetch(`${config.public.apiBase}/v1/audit-logs?page_size=50`, {
      headers: auth.getAuthHeaders()
    })
    auditLogs.value = res.data || []
  } catch (err) {
    console.error('Failed to load audit logs', err)
  } finally {
    auditLoading.value = false
  }
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

function formatDateTime(iso) {
  return iso ? new Date(iso).toLocaleString() : ''
}

function formatMeta(meta) {
  if (!meta || !Object.keys(meta).length) return '—'
  return Object.entries(meta).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : v}`).join(' · ')
}

onMounted(() => {
  loadUsers()
  loadSettings()
})
</script>

<style scoped>
.admin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}

.stat-card {
  display: grid;
  gap: 6px;
}

.stat-label {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stat-value {
  font-size: 26px;
  font-weight: 750;
  color: var(--ink);
  letter-spacing: -0.03em;
}

.admin-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--line);
}

.admin-tabs button {
  padding: 10px 18px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 650;
  color: var(--muted);
  margin-bottom: -1px;
}

.admin-tabs button:hover {
  color: var(--ink);
}

.admin-tabs button.active {
  border-bottom-color: var(--accent-solid);
  color: var(--accent);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.section-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.form-card {
  margin-bottom: 18px;
}

.form-card h3 {
  margin: 0 0 14px;
  font-size: 15.5px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.field label {
  display: block;
  font-weight: 600;
  font-size: 12.5px;
  margin-bottom: 6px;
}

.role-select {
  width: auto;
  min-width: 120px;
  padding: 5px 10px;
}

.td-date {
  color: var(--muted);
  font-size: 12.5px;
}

.loading {
  padding: 48px 24px;
  color: var(--muted);
  text-align: center;
}

.error {
  color: var(--danger);
  margin-bottom: 10px;
  font-size: 13px;
}

.success {
  color: var(--success);
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.hint {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  flex-shrink: 0;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--line-strong);
  border-radius: 26px;
  transition: 0.25s;
}

.slider::before {
  content: '';
  position: absolute;
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.25s;
}

.toggle input:checked + .slider {
  background: var(--accent-solid);
}

.toggle input:checked + .slider::before {
  transform: translateX(22px);
}
</style>
