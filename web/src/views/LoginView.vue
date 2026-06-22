<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)

async function handleLogin() {
  if (!username.value || !password.value) return
  const ok = await auth.login(username.value, password.value)
  if (ok) router.push('/dashboard')
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-box">
          <span class="logo-text">N1</span>
        </div>
        <h1>ERP NEXT1</h1>
        <p>PT. Perdana Global Internet</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="field">
          <label>Username</label>
          <input
            v-model="username"
            type="text"
            placeholder="Masukkan username"
            autocomplete="username"
            autofocus
            :disabled="auth.loading"
          />
        </div>

        <div class="field">
          <label>Password</label>
          <div class="input-wrapper">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Masukkan password"
              autocomplete="current-password"
              :disabled="auth.loading"
            />
            <button type="button" class="toggle-pw" @click="showPassword = !showPassword" tabindex="-1">
              {{ showPassword ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <p v-if="auth.error" class="error-msg">{{ auth.error }}</p>

        <button type="submit" class="btn-login" :disabled="auth.loading || !username || !password">
          <span v-if="auth.loading">Memproses...</span>
          <span v-else>Masuk</span>
        </button>
      </form>

      <p class="version">v1.0.0</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
  font-family: 'Segoe UI', sans-serif;
}
.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 48px 40px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 25px 50px rgba(0,0,0,0.4);
}
.login-header { text-align: center; margin-bottom: 36px; }
.logo-box {
  width: 64px; height: 64px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 16px;
}
.logo-text { color: #fff; font-size: 24px; font-weight: 800; letter-spacing: -1px; }
.login-header h1 { margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; }
.login-header p { margin: 4px 0 0; font-size: 13px; color: #64748b; }
.login-form { display: flex; flex-direction: column; gap: 20px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input {
  padding: 10px 14px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 15px; outline: none; color: #0f172a; background: #f8fafc;
  width: 100%; box-sizing: border-box;
}
.field input:focus { border-color: #3b82f6; background: #fff; }
.field input:disabled { opacity: 0.6; }
.input-wrapper { position: relative; }
.input-wrapper input { padding-right: 44px; }
.toggle-pw {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; font-size: 16px; padding: 0;
}
.error-msg {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  color: #dc2626; font-size: 13px; padding: 10px 14px; margin: 0;
}
.btn-login {
  padding: 12px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff; border: none; border-radius: 8px;
  font-size: 15px; font-weight: 600; cursor: pointer;
}
.btn-login:hover:not(:disabled) { opacity: 0.92; }
.btn-login:disabled { opacity: 0.5; cursor: not-allowed; }
.version { text-align: center; color: #94a3b8; font-size: 11px; margin: 24px 0 0; }
</style>
