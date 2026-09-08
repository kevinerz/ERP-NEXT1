<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const cfg = useSettingsStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const appVersion = __APP_VERSION__

const showForgot = ref(false)

onMounted(() => { cfg.fetch() })

async function handleLogin() {
  if (!username.value || !password.value) return
  const ok = await auth.login(username.value, password.value)
  // Kalau tadinya diarahkan ke sini dari halaman lain (mis. scan QR label
  // aset saat belum login), balik ke sana — bukan selalu ke Dashboard.
  if (ok) router.push((route.query.redirect as string) || '/dashboard')
}
</script>

<template>
  <div class="login-page">
    <!-- Panel kiri: hero jaringan -->
    <div class="hero-panel">
      <div class="hero-glow glow-a"></div>
      <div class="hero-glow glow-b"></div>

      <svg class="network-svg" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice">
        <g class="net-lines" stroke="#38bdf8" stroke-width="1" fill="none" opacity="0.35">
          <line x1="80" y1="120" x2="240" y2="200" />
          <line x1="240" y1="200" x2="420" y2="140" />
          <line x1="240" y1="200" x2="220" y2="360" />
          <line x1="220" y1="360" x2="90" y2="440" />
          <line x1="220" y1="360" x2="380" y2="420" />
          <line x1="380" y1="420" x2="520" y2="360" />
          <line x1="420" y1="140" x2="520" y2="360" />
          <line x1="420" y1="140" x2="500" y2="230" />
          <line x1="500" y1="230" x2="520" y2="360" />
        </g>
        <g class="net-pulse" stroke="#7dd3fc" stroke-width="2" fill="none" stroke-linecap="round">
          <line class="pulse-line p1" x1="80" y1="120" x2="240" y2="200" stroke-dasharray="14 200" />
          <line class="pulse-line p2" x1="240" y1="200" x2="220" y2="360" stroke-dasharray="14 200" />
          <line class="pulse-line p3" x1="220" y1="360" x2="380" y2="420" stroke-dasharray="14 200" />
          <line class="pulse-line p4" x1="420" y1="140" x2="500" y2="230" stroke-dasharray="14 200" />
        </g>
        <g class="net-nodes" fill="#e0f2fe">
          <circle class="node n1" cx="80" cy="120" r="6" />
          <circle class="node n2" cx="240" cy="200" r="8" />
          <circle class="node n3" cx="420" cy="140" r="6" />
          <circle class="node n4" cx="220" cy="360" r="9" />
          <circle class="node n5" cx="90" cy="440" r="5" />
          <circle class="node n6" cx="380" cy="420" r="6" />
          <circle class="node n7" cx="520" cy="360" r="7" />
          <circle class="node n8" cx="500" cy="230" r="5" />
        </g>
      </svg>

      <div class="hero-brand">
        <img src="/logo-nextone.png" alt="NextOne" class="hero-logo-img" />
        <span class="hero-brand-name">ERP <span style="color:#13c2c2">NEXT</span><span style="opacity:.7">ONE</span></span>
      </div>

      <div class="hero-content">
        <h1 class="hero-title">Satu platform,<br />seluruh jaringan Anda.</h1>
        <p class="hero-sub">Kelola aset, tiket, proyek, dan pelanggan {{ cfg.settings.company_name || 'PT. Perdana Global Internet' }} dalam satu tempat.</p>

        <ul class="hero-features">
          <li><span class="feat-dot"></span>Monitoring NOC &amp; Helpdesk real-time</li>
          <li><span class="feat-dot"></span>Manajemen aset &amp; inventaris jaringan</li>
          <li><span class="feat-dot"></span>HRIS, Sales, dan Finance terintegrasi</li>
        </ul>
      </div>
    </div>

    <!-- Panel kanan: form login -->
    <div class="form-panel">
      <div class="login-card">
        <div class="login-header">
          <div class="logo-box logo-box-mobile">
            <img v-if="cfg.settings.company_logo_url" :src="cfg.settings.company_logo_url" alt="logo" class="logo-img" />
            <span v-else class="logo-text">{{ (cfg.settings.company_brand || 'N1').slice(0, 2).toUpperCase() }}</span>
          </div>
          <h1>Selamat Datang Kembali</h1>
          <p>Masuk untuk melanjutkan ke ERP {{ cfg.settings.company_brand || 'NEXT1' }}</p>
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

        <button class="forgot-link" @click="showForgot = true">Lupa password?</button>

        <router-link to="/daftar" class="daftar-link">Karyawan baru? Daftar Akun Baru →</router-link>

        <!-- Modal lupa password -->
        <div v-if="showForgot" class="forgot-overlay" @click.self="showForgot = false">
          <div class="forgot-box">
            <h3>🔑 Lupa Password?</h3>
            <p>Hubungi administrator atau IT Support untuk mereset password akun Anda.</p>
            <p v-if="cfg.settings.company_name" class="forgot-company">{{ cfg.settings.company_name }}</p>
            <p v-if="cfg.settings.company_phone || cfg.settings.company_email" class="forgot-contact">
              <span v-if="cfg.settings.company_phone">📞 {{ cfg.settings.company_phone }}</span>
              <span v-if="cfg.settings.company_email">✉️ {{ cfg.settings.company_email }}</span>
            </p>
            <p v-else class="forgot-hint">Info kontak dapat ditemukan di halaman Settings aplikasi.</p>
            <button class="forgot-close" @click="showForgot = false">Tutup</button>
          </div>
        </div>

        <p class="version">v{{ appVersion }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }

.login-page {
  min-height: 100vh;
  display: flex;
  font-family: 'Segoe UI', sans-serif;
  background: #f8fafc;
}

/* ─── Panel kiri: hero jaringan ─────────────────────────── */
.hero-panel {
  position: relative;
  flex: 1.1;
  min-width: 0;
  overflow: hidden;
  background: radial-gradient(circle at 20% 20%, #1e3a8a 0%, #0f172a 55%, #0b1120 100%);
  display: flex;
  align-items: center;
  padding: 60px;
}
.hero-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.35;
  pointer-events: none;
}
.glow-a { width: 380px; height: 380px; background: #3b82f6; top: -80px; left: -100px; }
.glow-b { width: 320px; height: 320px; background: #06b6d4; bottom: -100px; right: -60px; }

.network-svg { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.9; }
.node { animation: nodePulse 3.6s ease-in-out infinite; transform-origin: center; }
.n1 { animation-delay: 0s; } .n2 { animation-delay: .3s; } .n3 { animation-delay: .6s; }
.n4 { animation-delay: .9s; } .n5 { animation-delay: 1.2s; } .n6 { animation-delay: 1.5s; }
.n7 { animation-delay: 1.8s; } .n8 { animation-delay: 2.1s; }
@keyframes nodePulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.35); }
}
.pulse-line { animation: flow 3s linear infinite; }
.p1 { animation-delay: 0s; } .p2 { animation-delay: .8s; } .p3 { animation-delay: 1.6s; } .p4 { animation-delay: 2.4s; }
@keyframes flow {
  0% { stroke-dashoffset: 220; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}

.hero-content { position: relative; z-index: 1; max-width: 460px; color: #fff; }
.hero-brand {
  position: absolute; top: 44px; left: 60px; z-index: 2;
  display: flex; align-items: center; gap: 12px;
}
.hero-logo-img { height: 38px; width: auto; object-fit: contain; filter: brightness(0) invert(1); }
.hero-brand-name { font-size: 15px; font-weight: 700; letter-spacing: 0.3px; color: #e2e8f0; }
.hero-title {
  font-size: 34px; font-weight: 800; line-height: 1.25; margin: 0 0 16px;
  letter-spacing: -0.5px;
}
.hero-sub { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 32px; }
.hero-features { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.hero-features li { display: flex; align-items: center; gap: 12px; font-size: 13.5px; color: #cbd5e1; }
.feat-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, #38bdf8, #3b82f6);
  box-shadow: 0 0 10px rgba(56,189,248,0.8);
}

/* ─── Panel kanan: form ─────────────────────────────────── */
.form-panel {
  flex: 1;
  min-width: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: #fff;
}
.login-card { width: 100%; max-width: 380px; }
.login-header { text-align: center; margin-bottom: 32px; }
.logo-box {
  width: 60px; height: 60px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 16px;
  padding: 8px;
  box-shadow: 0 8px 20px rgba(59,130,246,0.25);
}
.logo-box-mobile { display: none; }
.logo-box-hero {
  width: 40px; height: 40px;
  margin: 0;
  padding: 6px;
  border-radius: 11px;
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(4px);
  box-shadow: none;
}
.logo-text { color: #fff; font-size: 22px; font-weight: 800; letter-spacing: -1px; }
.logo-text-hero { font-size: 15px; }
.logo-img { width: 100%; height: 100%; object-fit: contain; }
.login-header h1 { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; }
.login-header p { margin: 6px 0 0; font-size: 13px; color: #64748b; }
.login-form { display: flex; flex-direction: column; gap: 20px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input {
  padding: 11px 14px; border: 1.5px solid #e2e8f0; border-radius: 9px;
  font-size: 15px; outline: none; color: #0f172a; background: #f8fafc;
  width: 100%; transition: border-color .15s, background .15s;
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
  padding: 13px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff; border: none; border-radius: 9px;
  font-size: 15px; font-weight: 600; cursor: pointer;
  box-shadow: 0 8px 20px rgba(59,130,246,0.3);
  transition: opacity .15s, transform .15s;
}
.btn-login:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
.btn-login:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.forgot-link {
  display: block; width: 100%; text-align: center; margin-top: 10px;
  font-size: 12.5px; color: #94a3b8; background: none; border: none;
  cursor: pointer; padding: 4px;
}
.forgot-link:hover { color: #64748b; text-decoration: underline; }
.daftar-link {
  display: block; text-align: center; margin-top: 16px;
  font-size: 13px; color: #3b82f6; font-weight: 600; text-decoration: none;
}
.daftar-link:hover { text-decoration: underline; }
.forgot-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 999; padding: 20px;
}
.forgot-box {
  background: #fff; border-radius: 14px; padding: 28px 28px 24px;
  width: 100%; max-width: 380px; text-align: center;
  box-shadow: 0 12px 40px rgba(0,0,0,0.18);
}
.forgot-box h3 { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 10px; }
.forgot-box p { font-size: 13.5px; color: #4b5563; line-height: 1.6; margin: 0 0 6px; }
.forgot-company { font-weight: 700; color: #0f172a !important; }
.forgot-contact { display: flex; flex-direction: column; gap: 4px; color: #1d4ed8 !important; font-size: 13px !important; }
.forgot-hint { color: #94a3b8 !important; font-size: 12px !important; }
.forgot-close {
  margin-top: 18px; padding: 9px 24px; background: #1e40af; color: #fff;
  border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.forgot-close:hover { background: #1e3a8a; }
.version { text-align: center; color: #94a3b8; font-size: 11px; margin: 24px 0 0; }

@media (max-width: 900px) {
  .hero-panel { display: none; }
  .form-panel { min-width: 0; }
  .logo-box-mobile { display: flex; }
}

@media (prefers-reduced-motion: reduce) {
  .node, .pulse-line { animation: none; }
}
</style>
