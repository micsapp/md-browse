<template>
  <div>
    <h1>Admin Panel</h1>
    <div class="tabs">
      <button :class="{ active: tab === 'users' }" @click="tab = 'users'">Users</button>
      <button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">Settings</button>
    </div>

    <!-- Users Tab -->
    <div v-if="tab === 'users'" class="section">
      <div class="section-header">
        <h2>Users</h2>
        <button class="btn-primary" @click="showAddUser = !showAddUser">
          {{ showAddUser ? 'Cancel' : 'Add User' }}
        </button>
      </div>

      <!-- Add User Form -->
      <form v-if="showAddUser" class="form-card" @submit.prevent="createUser">
        <h3>New User</h3>
        <div class="field">
          <label>Username</label>
          <input v-model="newUser.username" required />
        </div>
        <div class="field">
          <label>Password</label>
          <input v-model="newUser.password" type="password" required />
        </div>
        <div class="field">
          <label>Role</label>
          <select v-model="newUser.role">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <p v-if="userError" class="error">{{ userError }}</p>
        <button type="submit" class="btn-primary">Create</button>
      </form>

      <!-- Users Table -->
      <div v-if="usersLoading" class="loading">Loading...</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.username">
            <td>{{ u.username }}</td>
            <td>
              <select
                :value="u.role"
                :disabled="u.username === auth.user"
                @change="updateRole(u.username, $event.target.value)"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </td>
            <td>{{ formatDate(u.created_at) }}</td>
            <td>
              <button
                class="btn-danger"
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

    <!-- Settings Tab -->
    <div v-if="tab === 'settings'" class="section">
      <h2>Settings</h2>
      <div v-if="settingsLoading" class="loading">Loading...</div>
      <div v-else class="form-card">
        <div class="toggle-row">
          <div>
            <strong>Allow Registration</strong>
            <p class="hint">When disabled, only admins can create new accounts.</p>
          </div>
          <label class="toggle">
            <input v-model="settings.registration_enabled" type="checkbox" @change="saveSettings" />
            <span class="slider"></span>
          </label>
        </div>
        <p v-if="settingsMsg" class="success">{{ settingsMsg }}</p>
      </div>
    </div>
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

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : ''
}

onMounted(() => {
  loadUsers()
  loadSettings()
})
</script>

<style scoped>
h1 { margin-bottom: 1.5rem; }
.tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid #e0e0e0; }
.tabs button { padding: 0.5rem 1.25rem; border: none; background: none; cursor: pointer; font-size: 1rem; border-bottom: 2px solid transparent; margin-bottom: -2px; }
.tabs button.active { border-bottom-color: #3498db; color: #3498db; font-weight: 600; }
.section { }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.section-header h2 { margin: 0; }
.form-card { background: #fff; border-radius: 8px; box-shadow: 0 2px 4px #0000001a; padding: 1.5rem; margin-bottom: 1.5rem; }
.form-card h3 { margin-bottom: 1rem; }
.field { margin-bottom: 1rem; }
.field label { display: block; font-weight: 500; margin-bottom: 0.25rem; }
.field input, .field select { width: 100%; max-width: 320px; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
.btn-primary { background: #3498db; color: #fff; border: none; border-radius: 4px; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.9rem; }
.btn-primary:hover { background: #2980b9; }
.btn-danger { background: #e74c3c; color: #fff; border: none; border-radius: 4px; padding: 0.35rem 0.75rem; cursor: pointer; font-size: 0.85rem; }
.btn-danger:disabled { background: #ccc; cursor: not-allowed; }
.table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px #0000001a; overflow: hidden; }
.table th { background: #f0f0f0; text-align: left; padding: 0.75rem 1rem; font-weight: 600; }
.table td { padding: 0.75rem 1rem; border-top: 1px solid #f0f0f0; }
.table select { padding: 0.25rem 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
.loading { padding: 2rem; color: #666; text-align: center; }
.error { color: #e74c3c; margin-bottom: 0.5rem; }
.success { color: #27ae60; margin-top: 0.5rem; }
.toggle-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; }
.hint { color: #666; font-size: 0.875rem; margin-top: 0.25rem; }
.toggle { position: relative; display: inline-block; width: 48px; height: 26px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; inset: 0; background: #ccc; border-radius: 26px; transition: 0.3s; }
.slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 4px; bottom: 4px; background: #fff; border-radius: 50%; transition: 0.3s; }
.toggle input:checked + .slider { background: #3498db; }
.toggle input:checked + .slider::before { transform: translateX(22px); }
</style>
