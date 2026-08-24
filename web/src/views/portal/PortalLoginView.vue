<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePortalAuthStore } from '@/stores/portalAuth'

const router = useRouter()
const auth   = usePortalAuthStore()

const email    = ref('')
const password = ref('')

onMounted(() => {
  if (auth.isLoggedIn) router.replace('/portal/dashboard')
})

async function handleLogin() {
  const ok = await auth.login(email.value, password.value)
  if (ok) router.push('/portal/dashboard')
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo">
        <span class="logo-icon">🌐</span>
        <div>
          <div class="logo-title">Portal Pelanggan</div>
          <div class="logo-sub">NEXT ONE</div>
        </div>
      </div>

      <h2>Masuk ke Portal</h2>
      <p class="hint">Monitor site dan tiket support Anda</p>

      <form @submit.prevent="handleLogin" class="form">
        <div class="field">
          <label>Email</label>
          <input v-model="email" type="email" placeholder="email@perusahaan.com" required autocomplete="email" />
        </div>
        <div class="field">
          <label>Password</label>
          <input v-model="password" type="password" placeholder="••••••••" required autocomplete="current-password" />
        </div>

        <p v-if="auth.error" class="error">{{ auth.error }}</p>

        <button type="submit" class="btn-login" :disabled="auth.loading">
          {{ auth.loading ? 'Memuat...' : 'Masuk' }}
        </button>
      </form>

      <p class="footer-note">Lupa password? Hubungi tim NEXT ONE.</p>
    </div>
  </div>
</template>

<style scoped>
.login-page  { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); }
.login-card  { background: #fff; border-radius: 16px; padding: 40px 36px; width: 380px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.logo        { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
.logo-icon   { font-size: 32px; }
.logo-title  { font-size: 16px; font-weight: 800; color: #0f172a; }
.logo-sub    { font-size: 11px; font-weight: 700; color: #3b82f6; letter-spacing: 0.1em; }
h2           { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 4px; }
.hint        { font-size: 13px; color: #64748b; margin: 0 0 24px; }
.form        { display: flex; flex-direction: column; gap: 16px; }
.field       { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input { padding: 11px 14px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 15px; outline: none; background: #f8fafc; }
.field input:focus { border-color: #3b82f6; background: #fff; }
.error       { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 0; }
.btn-login   { padding: 12px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 4px; }
.btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-login:hover:not(:disabled) { opacity: 0.9; }
.footer-note { text-align: center; font-size: 12px; color: #94a3b8; margin: 20px 0 0; }
</style>
