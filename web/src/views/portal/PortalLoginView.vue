<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePortalAuthStore } from '@/stores/portalAuth'

const router = useRouter()
const auth   = usePortalAuthStore()

const email    = ref('')
const password = ref('')
const showPw   = ref(false)

onMounted(() => {
  if (auth.isLoggedIn) router.replace('/portal/dashboard')
})

async function handleLogin() {
  await auth.login(email.value, password.value)
    .then((ok: boolean) => { if (ok) router.push('/portal/dashboard') })
}
</script>

<template>
  <div class="root">

    <!-- ── Brand panel (kiri) ── -->
    <div class="brand-panel">
      <!-- Dekorasi lingkaran -->
      <div class="circle c1"></div>
      <div class="circle c2"></div>
      <div class="circle c3"></div>

      <div class="brand-inner">
        <!-- Logo mark -->
        <div class="logo-mark">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <rect width="44" height="44" rx="12" fill="rgba(255,255,255,0.15)"/>
            <path d="M10 22 L22 10 L34 22 L22 34 Z" stroke="white" stroke-width="2.5" fill="none"/>
            <circle cx="22" cy="22" r="5" fill="white"/>
          </svg>
          <div>
            <div class="logo-name">NEXT ONE</div>
            <div class="logo-tagline">Network Solutions</div>
          </div>
        </div>

        <div class="brand-headline">
          Portal<br/>Pelanggan
        </div>
        <p class="brand-desc">
          Monitor status jaringan, pantau tiket support, dan akses laporan SLA Anda secara real-time.
        </p>

        <!-- Feature list -->
        <div class="feature-list">
          <div class="feature-item">
            <span class="feat-dot"></span>
            <span>Status site &amp; sensor jaringan</span>
          </div>
          <div class="feature-item">
            <span class="feat-dot"></span>
            <span>Tiket support langsung dari portal</span>
          </div>
          <div class="feature-item">
            <span class="feat-dot"></span>
            <span>Laporan SLA bulanan</span>
          </div>
        </div>
      </div>

      <div class="brand-footer">© 2026 Next One. All rights reserved.</div>
    </div>

    <!-- ── Form panel (kanan) ── -->
    <div class="form-panel">
      <div class="form-wrap">

        <!-- Mobile logo -->
        <div class="mobile-logo">
          <svg width="32" height="32" viewBox="0 0 44 44" fill="none">
            <rect width="44" height="44" rx="12" fill="#0B1D35"/>
            <path d="M10 22 L22 10 L34 22 L22 34 Z" stroke="white" stroke-width="2.5" fill="none"/>
            <circle cx="22" cy="22" r="5" fill="white"/>
          </svg>
          <span class="mobile-logo-name">NEXT ONE</span>
        </div>

        <div class="form-header">
          <h1 class="form-title">Selamat Datang</h1>
          <p class="form-sub">Masuk ke portal pelanggan Anda</p>
        </div>

        <form @submit.prevent="handleLogin" class="form">
          <div class="field">
            <label class="field-lbl">Alamat Email</label>
            <div class="inp-wrap">
              <svg class="inp-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
              </svg>
              <input
                v-model="email"
                type="email"
                class="inp"
                placeholder="email@perusahaan.com"
                required
                autocomplete="email"
              />
            </div>
          </div>

          <div class="field">
            <label class="field-lbl">Password</label>
            <div class="inp-wrap">
              <svg class="inp-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                v-model="password"
                :type="showPw ? 'text' : 'password'"
                class="inp inp-pw"
                placeholder="••••••••"
                required
                autocomplete="current-password"
              />
              <button type="button" class="pw-toggle" @click="showPw = !showPw" tabindex="-1">
                <svg v-if="!showPw" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <div v-if="auth.error" class="alert-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ auth.error }}
          </div>

          <button type="submit" class="btn-submit" :disabled="auth.loading">
            <span v-if="!auth.loading">Masuk ke Portal</span>
            <span v-else class="loading-row">
              <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Memverifikasi…
            </span>
          </button>
        </form>

        <p class="help-text">Lupa password? Hubungi tim support NEXT ONE.</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

* { box-sizing: border-box; }

.root {
  min-height: 100vh;
  display: flex;
  font-family: 'Inter', system-ui, sans-serif;
  background: #f0f4f8;
}

/* ── Brand panel ─────────────────────────────── */
.brand-panel {
  width: 420px;
  flex-shrink: 0;
  background: #0B1D35;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 48px 40px;
}

/* Dekoratif lingkaran */
.circle { position: absolute; border-radius: 50%; }
.c1 { width: 320px; height: 320px; background: rgba(26,86,219,.18); top: -80px; right: -100px; }
.c2 { width: 200px; height: 200px; background: rgba(26,86,219,.12); bottom: 60px; right: -40px; }
.c3 { width: 120px; height: 120px; background: rgba(255,255,255,.04); bottom: 200px; left: -30px; }

.brand-inner { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; }

.logo-mark { display: flex; align-items: center; gap: 14px; margin-bottom: 56px; }
.logo-name { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: .08em; }
.logo-tagline { font-size: 10px; font-weight: 500; color: rgba(255,255,255,.5); letter-spacing: .1em; margin-top: 2px; text-transform: uppercase; }

.brand-headline {
  font-size: 42px;
  font-weight: 800;
  color: #fff;
  line-height: 1.1;
  margin-bottom: 20px;
  letter-spacing: -.01em;
}

.brand-desc {
  font-size: 14px;
  color: rgba(255,255,255,.6);
  line-height: 1.7;
  margin: 0 0 40px;
}

.feature-list { display: flex; flex-direction: column; gap: 12px; }
.feature-item { display: flex; align-items: center; gap: 12px; font-size: 13px; color: rgba(255,255,255,.75); }
.feat-dot { width: 6px; height: 6px; border-radius: 50%; background: #3b82f6; flex-shrink: 0; }

.brand-footer {
  position: relative;
  z-index: 1;
  font-size: 11px;
  color: rgba(255,255,255,.3);
  margin-top: 40px;
}

/* ── Form panel ──────────────────────────────── */
.form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 32px;
  background: #fff;
}

.form-wrap { width: 100%; max-width: 400px; }

.mobile-logo { display: none; align-items: center; gap: 10px; margin-bottom: 32px; }
.mobile-logo-name { font-size: 15px; font-weight: 800; color: #0B1D35; letter-spacing: .06em; }

.form-header { margin-bottom: 32px; }
.form-title { font-size: 30px; font-weight: 800; color: #0B1D35; margin: 0 0 6px; letter-spacing: -.02em; }
.form-sub { font-size: 14px; color: #64748b; margin: 0; }

/* Form */
.form { display: flex; flex-direction: column; gap: 20px; }
.field { display: flex; flex-direction: column; gap: 7px; }
.field-lbl { font-size: 13px; font-weight: 600; color: #334155; }

.inp-wrap { position: relative; display: flex; align-items: center; }
.inp-icon { position: absolute; left: 14px; color: #94a3b8; flex-shrink: 0; pointer-events: none; }

.inp {
  width: 100%;
  padding: 13px 14px 13px 42px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 15px;
  font-family: inherit;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: border-color .15s, background .15s, box-shadow .15s;
}
.inp:focus {
  border-color: #1A56DB;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(26,86,219,.1);
}
.inp-pw { padding-right: 44px; }

.pw-toggle {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}
.pw-toggle:hover { color: #334155; }

/* Error */
.alert-error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 13px;
  font-weight: 500;
  padding: 11px 14px;
}

/* Submit */
.btn-submit {
  padding: 14px;
  background: #0B1D35;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  width: 100%;
  margin-top: 4px;
  transition: background .15s, transform .1s;
  letter-spacing: .01em;
}
.btn-submit:hover:not(:disabled) { background: #162d52; transform: translateY(-1px); }
.btn-submit:active:not(:disabled) { transform: translateY(0); }
.btn-submit:disabled { opacity: .55; cursor: not-allowed; }

.loading-row { display: flex; align-items: center; justify-content: center; gap: 8px; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .8s linear infinite; }

.help-text { text-align: center; font-size: 12px; color: #94a3b8; margin: 24px 0 0; line-height: 1.6; }

/* ── Responsive ──────────────────────────────── */
@media (max-width: 720px) {
  .root { flex-direction: column; }
  .brand-panel { display: none; }
  .form-panel { padding: 32px 20px; background: #f8fafc; }
  .mobile-logo { display: flex; }
  .form-wrap { max-width: 100%; }
}
</style>
