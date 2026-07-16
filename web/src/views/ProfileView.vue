<template>
  <div class="profile-page">
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>Memuat profil...</span>
    </div>

    <template v-else>
    <!-- Header Card -->
    <div class="profile-hero">
      <div class="avatar-circle">{{ initials }}</div>
      <div class="hero-info">
        <h1>{{ profile?.nama_lengkap }}</h1>
        <p class="hero-sub">{{ profile?.jabatan }} · {{ profile?.departemen }}</p>
        <div class="role-badges">
          <span v-for="r in profile?.roles" :key="r" class="badge">{{ r }}</span>
        </div>
      </div>
    </div>

    <div class="profile-body">
      <!-- Kiri: Info + Edit -->
      <div class="card info-card">
        <div class="card-header">
          <span class="card-title">Informasi Akun</span>
          <button class="btn-edit" @click="toggleEdit">
            {{ editMode ? 'Batal' : 'Edit' }}
          </button>
        </div>

        <div class="info-grid">
          <div class="info-row">
            <span class="info-label">Username</span>
            <span class="info-value mono">{{ profile?.username }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">NIP</span>
            <span class="info-value mono">{{ profile?.nip }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Bergabung</span>
            <span class="info-value">{{ formatDate(profile?.tgl_bergabung) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Login Terakhir</span>
            <span class="info-value">{{ formatDateTime(profile?.last_login) }}</span>
          </div>

          <!-- Email -->
          <div class="info-row">
            <span class="info-label">Email</span>
            <span v-if="!editMode" class="info-value">{{ profile?.email || '—' }}</span>
            <input v-else v-model="form.email" class="info-input" type="email" placeholder="email@next1.co.id" />
          </div>

          <!-- No HP -->
          <div class="info-row">
            <span class="info-label">No. HP</span>
            <span v-if="!editMode" class="info-value">{{ profile?.no_hp || '—' }}</span>
            <input v-else v-model="form.no_hp" class="info-input" type="text" placeholder="08xx-xxxx-xxxx" />
          </div>
        </div>

        <div v-if="editMode" class="edit-actions">
          <button class="btn-primary" :disabled="saving" @click="saveProfile">
            {{ saving ? 'Menyimpan…' : 'Simpan' }}
          </button>
        </div>
        <p v-if="profileMsg" class="msg" :class="profileMsgType">{{ profileMsg }}</p>
      </div>

      <!-- Kanan: Ganti Password -->
      <div class="card pass-card">
        <div class="card-header">
          <span class="card-title">Ganti Password</span>
        </div>

        <div class="pass-form">
          <label>Password Lama</label>
          <div class="input-wrap">
            <input
              v-model="pass.lama"
              :type="showPass.lama ? 'text' : 'password'"
              placeholder="••••••••"
            />
            <button class="eye" @click="showPass.lama = !showPass.lama">
              {{ showPass.lama ? '🙈' : '👁️' }}
            </button>
          </div>

          <label>Password Baru</label>
          <div class="input-wrap">
            <input
              v-model="pass.baru"
              :type="showPass.baru ? 'text' : 'password'"
              placeholder="Min. 8 karakter"
            />
            <button class="eye" @click="showPass.baru = !showPass.baru">
              {{ showPass.baru ? '🙈' : '👁️' }}
            </button>
          </div>

          <!-- strength bar -->
          <div v-if="pass.baru" class="strength-wrap">
            <div class="strength-bar" :style="{ width: strengthPct + '%', background: strengthColor }"></div>
            <span class="strength-label" :style="{ color: strengthColor }">{{ strengthLabel }}</span>
          </div>

          <label>Konfirmasi Password Baru</label>
          <div class="input-wrap">
            <input
              v-model="pass.konfirmasi"
              :type="showPass.konfirmasi ? 'text' : 'password'"
              placeholder="Ulangi password baru"
              :class="{ mismatch: pass.konfirmasi && pass.baru !== pass.konfirmasi }"
            />
            <button class="eye" @click="showPass.konfirmasi = !showPass.konfirmasi">
              {{ showPass.konfirmasi ? '🙈' : '👁️' }}
            </button>
          </div>
          <p v-if="pass.konfirmasi && pass.baru !== pass.konfirmasi" class="hint-error">
            Password tidak cocok
          </p>

          <button
            class="btn-primary btn-full"
            :disabled="changingPass || !canSubmitPass"
            @click="changePassword"
          >
            {{ changingPass ? 'Menyimpan…' : 'Ubah Password' }}
          </button>
        </div>
        <p v-if="passMsg" class="msg" :class="passMsgType">{{ passMsg }}</p>
      </div>
    </div>

    <!-- Akses Modul -->
    <div class="card modul-card">
      <div class="card-header">
        <span class="card-title">Akses Modul</span>
      </div>
      <div class="modul-grid">
        <div
          v-for="m in ALL_MODULS"
          :key="m"
          class="modul-chip"
          :class="{ active: canAccess(m) }"
        >
          <span class="modul-dot"></span>
          {{ MODUL_LABEL[m] || m }}
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'
import { useAuthStore, ALL_MODULS } from '@/stores/auth'
import { fmtDate as formatDate, fmtDateTime as formatDateTime } from '@/composables/useFormat'

const auth = useAuthStore()

const MODUL_LABEL: Record<string, string> = {
  hris: 'HRIS',
  master: 'Master Data',
  sales: 'Sales',
  projects: 'Proyek',
  operations: 'Operations',
  assets: 'Aset',
  contracts: 'Kontrak',
  reports: 'Reports',
}

// ─── STATE ────────────────────────────────────────────
const profile = ref<any>(null)
const loading = ref(true)
const editMode = ref(false)
const saving = ref(false)
const profileMsg = ref('')
const profileMsgType = ref('success')

const form = ref({ email: '', no_hp: '' })

const pass = ref({ lama: '', baru: '', konfirmasi: '' })
const showPass = ref({ lama: false, baru: false, konfirmasi: false })
const changingPass = ref(false)
const passMsg = ref('')
const passMsgType = ref('success')

// ─── COMPUTED ─────────────────────────────────────────
const initials = computed(() => {
  if (!profile.value?.nama_lengkap) return '?'
  return profile.value.nama_lengkap
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
})

const canAccess = (m: string) => auth.canAccess(m)

const strengthScore = computed(() => {
  const p = pass.value.baru
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[A-Z]/.test(p)) s++
  if (/[0-9]/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return s
})
const strengthPct = computed(() => (strengthScore.value / 5) * 100)
const strengthColor = computed(() => {
  const s = strengthScore.value
  if (s <= 1) return '#ef4444'
  if (s <= 2) return '#f97316'
  if (s <= 3) return '#eab308'
  if (s <= 4) return '#22c55e'
  return '#16a34a'
})
const strengthLabel = computed(() => {
  const s = strengthScore.value
  if (s <= 1) return 'Sangat Lemah'
  if (s <= 2) return 'Lemah'
  if (s <= 3) return 'Cukup'
  if (s <= 4) return 'Kuat'
  return 'Sangat Kuat'
})

const canSubmitPass = computed(() =>
  pass.value.lama && pass.value.baru.length >= 8 && pass.value.baru === pass.value.konfirmasi
)

// ─── METHODS ──────────────────────────────────────────
async function fetchProfile() {
  loading.value = true
  try {
    const r = await api.get('/auth/me')
    profile.value = r.data.data
    form.value.email = profile.value?.email || ''
    form.value.no_hp = profile.value?.no_hp || ''
  } catch (e) {
    console.error('[Profile] fetchProfile error:', (e as any)?.message ?? 'unknown')
  } finally {
    loading.value = false
  }
}

function toggleEdit() {
  if (editMode.value) {
    form.value.email = profile.value?.email || ''
    form.value.no_hp = profile.value?.no_hp || ''
  }
  editMode.value = !editMode.value
}

async function saveProfile() {
  saving.value = true
  profileMsg.value = ''
  try {
    await api.patch('/auth/me', { email: form.value.email, no_hp: form.value.no_hp })
    profile.value.email = form.value.email
    profile.value.no_hp = form.value.no_hp
    editMode.value = false
    profileMsg.value = 'Profil berhasil diperbarui'
    profileMsgType.value = 'success'
  } catch (e: any) {
    profileMsg.value = e.response?.data?.message || 'Gagal menyimpan'
    profileMsgType.value = 'error'
  } finally {
    saving.value = false
    setTimeout(() => { profileMsg.value = '' }, 4000)
  }
}

async function changePassword() {
  changingPass.value = true
  passMsg.value = ''
  try {
    const r = await api.post('/auth/change-password', {
      password_lama: pass.value.lama,
      password_baru: pass.value.baru,
      konfirmasi: pass.value.konfirmasi,
    })
    passMsg.value = r.data.message
    passMsgType.value = 'success'
    pass.value = { lama: '', baru: '', konfirmasi: '' }
  } catch (e: any) {
    passMsg.value = e.response?.data?.message || 'Gagal mengubah password'
    passMsgType.value = 'error'
  } finally {
    changingPass.value = false
    setTimeout(() => { passMsg.value = '' }, 5000)
  }
}

onMounted(fetchProfile)
</script>

<style scoped>
.profile-page { max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }

.loading-state { display: flex; align-items: center; gap: 12px; padding: 60px; color: #94a3b8; justify-content: center; }
.spinner { width: 20px; height: 20px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Hero */
.profile-hero {
  background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
  border-radius: 16px;
  padding: 32px;
  display: flex;
  align-items: center;
  gap: 28px;
  color: #fff;
}
.avatar-circle {
  width: 80px; height: 80px;
  background: rgba(255,255,255,0.25);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 700;
  flex-shrink: 0;
}
.hero-info h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
.hero-sub { margin: 0 0 10px; opacity: .85; font-size: 14px; }
.role-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.badge {
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.35);
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 12px;
}

/* Body layout */
.profile-body { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 700px) { .profile-body { grid-template-columns: 1fr; } }

/* Cards */
.card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 24px;
}
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px;
}
.card-title { font-size: 15px; font-weight: 600; color: var(--color-text, #111); }

/* Info grid */
.info-grid { display: flex; flex-direction: column; gap: 14px; }
.info-row { display: grid; grid-template-columns: 130px 1fr; align-items: center; gap: 8px; }
.info-label { font-size: 13px; color: var(--color-text-muted, #6b7280); }
.info-value { font-size: 14px; color: var(--color-text, #111); }
.info-value.mono { font-family: monospace; }
.info-input {
  padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; outline: none; width: 100%; box-sizing: border-box;
}
.info-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }

.edit-actions { margin-top: 20px; display: flex; justify-content: flex-end; }
.btn-edit {
  background: none; border: 1px solid #d1d5db; border-radius: 6px;
  padding: 4px 12px; font-size: 13px; cursor: pointer; color: #374151;
}
.btn-edit:hover { background: #f3f4f6; }

/* Password form */
.pass-form { display: flex; flex-direction: column; gap: 8px; }
.pass-form label { font-size: 13px; font-weight: 500; color: var(--color-text-muted, #6b7280); margin-top: 4px; }
.input-wrap { position: relative; }
.input-wrap input {
  width: 100%; box-sizing: border-box;
  padding: 8px 36px 8px 10px;
  border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; outline: none;
}
.input-wrap input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
.input-wrap input.mismatch { border-color: #ef4444; }
.eye {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; font-size: 14px; padding: 0;
}
.hint-error { font-size: 12px; color: #ef4444; margin: 0; }

/* Strength bar */
.strength-wrap { position: relative; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; margin: 2px 0 4px; }
.strength-bar { height: 100%; border-radius: 2px; transition: width .3s, background .3s; }
.strength-label { font-size: 11px; display: block; margin-top: 2px; }

/* Buttons */
.btn-primary {
  background: #2563eb; color: #fff; border: none; border-radius: 8px;
  padding: 9px 20px; font-size: 14px; font-weight: 500; cursor: pointer;
  transition: background .15s;
}
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-full { width: 100%; margin-top: 8px; }

/* Modul card */
.modul-card { }
.modul-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.modul-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 20px;
  border: 1px solid #e5e7eb;
  font-size: 13px; color: #6b7280;
  background: #f9fafb;
}
.modul-chip.active { border-color: #bfdbfe; background: #eff6ff; color: #1d4ed8; }
.modul-dot { width: 7px; height: 7px; border-radius: 50%; background: #d1d5db; }
.modul-chip.active .modul-dot { background: #2563eb; }

/* Messages */
.msg { font-size: 13px; margin-top: 10px; padding: 8px 12px; border-radius: 6px; }
.msg.success { background: #f0fdf4; color: #166534; }
.msg.error { background: #fef2f2; color: #991b1b; }
</style>
