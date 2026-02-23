<template>
  <div class="login-page">
    <div class="login-box">
      <h1>{{ isRegister ? 'Register' : 'Login' }}</h1>
      <form @submit.prevent="submit">
        <div class="field">
          <label>Username</label>
          <input v-model="form.username" required />
        </div>
        <div class="field">
          <label>Password</label>
          <input v-model="form.password" type="password" required />
        </div>
        <button type="submit">{{ isRegister ? 'Register' : 'Login' }}</button>
        <p class="switch">
          {{ isRegister ? 'Already have an account?' : "Don't have an account?" }}
          <a href="#" @click.prevent="isRegister = !isRegister">{{ isRegister ? 'Login' : 'Register' }}</a>
        </p>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
const auth = useAuth()
const router = useRouter()
const route = useRoute()

const isRegister = ref(false)
const form = ref({ username: '', password: '' })
const error = ref('')

async function submit() {
  error.value = ''
  try {
    if (isRegister.value) {
      await auth.register(form.value.username, form.value.password)
    } else {
      await auth.login(form.value.username, form.value.password)
    }
    router.push(route.query.redirect || '/')
  } catch (e) {
    error.value = e.data?.error || 'An error occurred'
  }
}
</script>

<style scoped>
.login-page { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
.login-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
.login-box h1 { text-align: center; margin-bottom: 1.5rem; }
.field { margin-bottom: 1rem; }
.field label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
.field input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; }
button { width: 100%; padding: 0.75rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
button:hover { background: #2980b9; }
.switch { text-align: center; margin-top: 1rem; color: #666; }
.switch a { color: #3498db; }
.error { color: #e74c3c; text-align: center; margin-top: 1rem; }
</style>
