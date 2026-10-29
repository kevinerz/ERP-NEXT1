<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { confirmDialog } from '@/composables/useDialog'
import { useRouter, useRoute } from 'vue-router'
import { useHrisStore } from '@/stores/hris'
import { fmtDate as formatDate } from '@/composables/useFormat'

const router = useRouter()
const route = useRoute()
const hris = useHrisStore()

const id = Number(route.params.id)
const showCreateUser = ref(false)
const showResetPw = ref(false)
const showEditRoles = ref(false)
const editRoleIds = ref<number[]>([])

const userForm = ref({ username: '', password: '', role_ids: [] as number[] })
const newPassword = ref('')
const actionLoading = ref(false)
const actionError = ref('')
const actionSuccess = ref('')

let successTimer: ReturnType<typeof setTimeout> | null = null
function setSuccess(msg: string) {
  actionSuccess.value = msg
  if (successTimer) clearTimeout(successTimer)
  successTimer = setTimeout(() => { actionSuccess.value = '' }, 3000)
}
onUnmounted(() => { if (successTimer) clearTimeout(successTimer) })

// Penanda UI: fetch awal selesai (fetchRoles tidak men-set hris.loading,
// jadi tanpa ini state "tidak ditemukan" sempat berkedip saat memuat).
const loaded = ref(false)

onMounted(async () => {
  try {
    await hris.fetchRoles()
    await hris.fetchOne(id)
  } catch { /* error ditampilkan lewat hris.error jika ada */ }
  finally { loaded.value = true }
})

async function handleToggleStatus() {
  actionError.value = ''
  try {
    await hris.toggleStatus(id)
    await hris.fetchOne(id)
    setSuccess('Status karyawan diperbarui')
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal'
  }
}

const deleting = ref(false)

async function handleDelete() {
  if (!hris.current) return
  if (!(await confirmDialog({ title: 'Hapus Karyawan?', message: `Hapus karyawan "${hris.current.nama_lengkap}"? Tindakan ini tidak bisa dibatalkan.`, variant: 'danger', confirmLabel: 'Ya, Hapus' }))) return
  actionError.value = ''
  deleting.value = true
  try {
    await hris.deleteKaryawan(id)
    router.push('/hris/karyawan')
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal menghapus karyawan'
  } finally {
    deleting.value = false
  }
}

async function handleCreateUser() {
  actionError.value = ''
  actionLoading.value = true
  try {
    await hris.createUserAccount(id, userForm.value)
    await hris.fetchOne(id)
    showCreateUser.value = false
    userForm.value = { username: '', password: '', role_ids: [] }
    setSuccess('Akun user berhasil dibuat')
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal membuat akun'
  } finally {
    actionLoading.value = false
  }
}

async function handleResetPw() {
  if (!newPassword.value || newPassword.value.length < 8) {
    actionError.value = 'Password minimal 8 karakter'
    return
  }
  actionLoading.value = true
  actionError.value = ''
  try {
    await hris.resetPassword(id, newPassword.value)
    showResetPw.value = false
    newPassword.value = ''
    setSuccess('Password berhasil direset')
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal reset password'
  } finally {
    actionLoading.value = false
  }
}

function openEditRoles() {
  editRoleIds.value = hris.current?.user?.user_roles.map(ur => ur.role.id_role) ?? []
  showEditRoles.value = true
}

async function handleEditRoles() {
  if (!editRoleIds.value.length) {
    actionError.value = 'Pilih minimal satu role'
    return
  }
  actionLoading.value = true
  actionError.value = ''
  try {
    await hris.updateUserRoles(id, editRoleIds.value)
    await hris.fetchOne(id)
    showEditRoles.value = false
    setSuccess('Role berhasil diperbarui')
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal update role'
  } finally {
    actionLoading.value = false
  }
}

// ─── Modul Akses ──────────────────────────────────────────────
const ALL_MODULS = [
  { key: 'hris',          label: 'HRIS',        icon: '👤' },
  { key: 'master',        label: 'Master Data',  icon: '📦' },
  { key: 'sales',         label: 'Sales',        icon: '💼' },
  { key: 'crm',           label: 'CRM',          icon: '🤝' },
  { key: 'projects',      label: 'Proyek',       icon: '📋' },
  { key: 'operations',    label: 'Operasional',  icon: '🔧' },
  { key: 'instalasi',     label: 'Pemasangan',   icon: '🛠️' },
  { key: 'assets',        label: 'Aset',         icon: '🖥️' },
  { key: 'contracts',     label: 'Kontrak',      icon: '📄' },
  { key: 'finance',       label: 'Finance',      icon: '💰' },
  { key: 'reports',       label: 'Laporan',      icon: '📈' },
  { key: 'notifications', label: 'Notifikasi',   icon: '🔔' },
  { key: 'public-wo',     label: 'Public WO',    icon: '🌐' },
  { key: 'prtg',          label: 'PRTG',         icon: '📡' },
  { key: 'mekari',        label: 'Mekari',       icon: '💳' },
  { key: 'whatsapp',      label: 'WhatsApp',     icon: '💬' },
]

const PRESETS = [
  { key: 'teknisi',   label: 'Teknisi',    icon: '🔧', moduls: ['operations', 'instalasi', 'public-wo', 'assets', 'notifications'] },
  { key: 'noc',       label: 'NOC',        icon: '📺', moduls: ['operations', 'notifications', 'prtg', 'assets', 'public-wo'] },
  { key: 'sales',     label: 'Sales',      icon: '💼', moduls: ['sales', 'crm', 'master', 'contracts', 'reports'] },
  { key: 'presales',  label: 'Pre-Sales',  icon: '🔍', moduls: ['sales', 'master'] },
  { key: 'finance',   label: 'Finance/AR', icon: '💰', moduls: ['finance', 'reports', 'contracts', 'master'] },
  { key: 'helpdesk',  label: 'Helpdesk',   icon: '🤝', moduls: ['crm', 'operations', 'notifications', 'master', 'whatsapp'] },
  { key: 'manager',   label: 'Manager',    icon: '📋', moduls: ['hris', 'master', 'sales', 'crm', 'projects', 'operations', 'instalasi', 'assets', 'contracts', 'finance', 'reports', 'notifications', 'public-wo'] },
]

const showEditModul  = ref(false)
const editModulAkses = ref<string[]>([])
const semuaModul     = ref(false)

function openEditModul() {
  const raw: string[] = hris.current?.user?.modul_akses ?? []
  semuaModul.value     = raw.length === 0
  editModulAkses.value = raw.length ? [...raw] : []
  showEditModul.value  = true
}

function onSemuaModulChange() {
  if (semuaModul.value) editModulAkses.value = []
}

function applyPreset(moduls: string[]) {
  semuaModul.value     = false
  editModulAkses.value = [...moduls]
}

async function handleEditModul() {
  actionLoading.value = true
  actionError.value   = ''
  try {
    // semuaModul = true → kirim [] agar backend simpan null (akses semua)
    await hris.updateModulAkses(id, semuaModul.value ? [] : editModulAkses.value)
    await hris.fetchOne(id)
    showEditModul.value = false
    setSuccess('Akses modul berhasil diperbarui')
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal update modul akses'
  } finally {
    actionLoading.value = false
  }
}

async function handleToggleUserStatus() {
  actionError.value = ''
  try {
    await hris.toggleUserStatus(id)
    await hris.fetchOne(id)
    setSuccess('Status akun diperbarui')
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal'
  }
}
</script>

<template>
  <div class="page" v-if="hris.current">
    <!-- Header -->
    <div class="page-header">
      <button class="btn-back" @click="router.push('/hris/karyawan')">← Daftar Karyawan</button>
      <div class="header-right">
        <button class="btn-secondary" @click="router.push(`/hris/karyawan/${id}/edit`)">Edit</button>
        <button
          :class="hris.current.status_aktif ? 'btn-danger' : 'btn-success'"
          @click="handleToggleStatus"
        >
          {{ hris.current.status_aktif ? 'Nonaktifkan' : 'Aktifkan' }}
        </button>
        <button class="btn-danger" :disabled="deleting" @click="handleDelete">
          {{ deleting ? 'Menghapus...' : 'Hapus Karyawan' }}
        </button>
      </div>
    </div>

    <!-- Notifikasi -->
    <div v-if="actionSuccess" class="alert-success">{{ actionSuccess }}</div>
    <div v-if="actionError" class="alert-error">{{ actionError }}</div>

    <!-- Info Karyawan -->
    <div class="card">
      <div class="card-header">
        <img v-if="hris.current.foto_url" :src="hris.current.foto_url" alt="" class="avatar-photo" />
        <div v-else class="avatar">{{ hris.current.nama_lengkap.charAt(0).toUpperCase() }}</div>
        <div>
          <h3>{{ hris.current.nama_lengkap }}</h3>
          <p>{{ hris.current.jabatan }} · {{ hris.current.departemen }}</p>
          <span :class="hris.current.status_aktif ? 'badge-aktif' : 'badge-nonaktif'">
            {{ hris.current.status_aktif ? 'Aktif' : 'Nonaktif' }}
          </span>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <span class="label">NIP</span>
          <span class="value mono">{{ hris.current.nip }}</span>
        </div>
        <div class="info-item">
          <span class="label">No. HP</span>
          <span class="value">{{ hris.current.no_hp || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Email</span>
          <span class="value">{{ hris.current.email || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Tanggal Bergabung</span>
          <span class="value">{{ formatDate(hris.current.tgl_bergabung) }}</span>
        </div>
      </div>
    </div>

    <!-- Data Pribadi -->
    <div class="card">
      <div class="section-header">
        <h4>Data Pribadi</h4>
      </div>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">Tempat, Tanggal Lahir</span>
          <span class="value">{{ hris.current.tempat_lahir || '—' }}, {{ formatDate(hris.current.tgl_lahir) }}</span>
        </div>
        <div class="info-item">
          <span class="label">Jenis Kelamin</span>
          <span class="value">{{ hris.current.jenis_kelamin === 'L' ? 'Laki-laki' : hris.current.jenis_kelamin === 'P' ? 'Perempuan' : '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Agama</span>
          <span class="value">{{ hris.current.agama || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Status Pernikahan</span>
          <span class="value">{{ hris.current.status_pernikahan || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">No. KTP</span>
          <span class="value mono">{{ hris.current.no_ktp || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">No. NPWP</span>
          <span class="value mono">{{ hris.current.no_npwp || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Pendidikan Terakhir</span>
          <span class="value">{{ hris.current.pendidikan_terakhir || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Alamat (sesuai KTP)</span>
          <span class="value">{{ hris.current.alamat_ktp || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- Kontak Darurat -->
    <div class="card">
      <div class="section-header">
        <h4>Kontak Darurat</h4>
      </div>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">Nama</span>
          <span class="value">{{ hris.current.kontak_darurat_nama || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">No. HP</span>
          <span class="value">{{ hris.current.kontak_darurat_hp || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Hubungan</span>
          <span class="value">{{ hris.current.kontak_darurat_hubungan || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- Rekening Bank -->
    <div class="card">
      <div class="section-header">
        <h4>Rekening Bank (Payroll)</h4>
      </div>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">Nama Bank</span>
          <span class="value">{{ hris.current.bank_nama || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">No. Rekening</span>
          <span class="value mono">{{ hris.current.bank_no_rekening || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Nama Pemilik Rekening</span>
          <span class="value">{{ hris.current.bank_atas_nama || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- Akun User -->
    <div class="card">
      <div class="section-header">
        <h4>Akun Sistem</h4>
        <button
          v-if="!hris.current.user"
          class="btn-primary"
          @click="showCreateUser = true"
        >
          + Buat Akun
        </button>
      </div>

      <!-- Belum punya akun -->
      <div v-if="!hris.current.user" class="empty-user">
        Karyawan ini belum memiliki akun untuk login ke ERP.
      </div>

      <!-- Sudah punya akun -->
      <div v-else class="user-info">
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Username</span>
            <span class="value mono">{{ hris.current.user.username }}</span>
          </div>
          <div class="info-item">
            <span class="label">Status Akun</span>
            <span :class="hris.current.user.is_aktif ? 'badge-aktif' : 'badge-nonaktif'">
              {{ hris.current.user.is_aktif ? 'Aktif' : 'Nonaktif' }}
            </span>
          </div>
          <div class="info-item">
            <span class="label">Role</span>
            <span class="value">
              {{ hris.current.user.user_roles.map(ur => ur.role.nama_role).join(', ') || '—' }}
            </span>
          </div>
          <div class="info-item">
            <span class="label">Akses Modul</span>
            <span class="value">
              <span v-if="!hris.current.user.modul_akses?.length" class="badge-admin">⭐ Semua Modul</span>
              <span v-else>{{ hris.current.user.modul_akses.length }} modul</span>
            </span>
          </div>
          <div class="info-item">
            <span class="label">Login Terakhir</span>
            <span class="value">{{ formatDate(hris.current.user.last_login) }}</span>
          </div>
        </div>
        <div class="user-actions">
          <button class="btn-secondary" @click="openEditRoles">Edit Role</button>
          <button class="btn-secondary" @click="openEditModul">Edit Akses Modul</button>
          <button class="btn-secondary" @click="showResetPw = true">Reset Password</button>
          <button
            :class="hris.current.user.is_aktif ? 'btn-danger' : 'btn-success'"
            @click="handleToggleUserStatus"
          >
            {{ hris.current.user.is_aktif ? 'Nonaktifkan Akun' : 'Aktifkan Akun' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Buat Akun -->
    <div v-if="showCreateUser" class="modal-overlay" @click.self="showCreateUser = false">
      <div class="modal">
        <h3>Buat Akun User</h3>
        <div class="field">
          <label>Username</label>
          <input v-model="userForm.username" type="text" placeholder="username" />
        </div>
        <div class="field">
          <label>Password</label>
          <input v-model="userForm.password" type="password" placeholder="Min. 8 karakter" />
        </div>
        <div class="field">
          <label>Role (pilih satu atau lebih)</label>
          <div class="role-list">
            <label v-for="r in hris.roles" :key="r.id_role" class="role-item">
              <input
                type="checkbox"
                :value="r.id_role"
                v-model="userForm.role_ids"
              />
              {{ r.nama_role }}
              <span class="role-desc">{{ r.deskripsi }}</span>
            </label>
          </div>
        </div>
        <div v-if="actionError" class="error-msg">{{ actionError }}</div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showCreateUser = false">Batal</button>
          <button class="btn-submit" @click="handleCreateUser" :disabled="actionLoading">
            {{ actionLoading ? 'Menyimpan...' : 'Buat Akun' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Reset Password -->
    <div v-if="showResetPw" class="modal-overlay" @click.self="showResetPw = false">
      <div class="modal">
        <h3>Reset Password</h3>
        <div class="field">
          <label>Password Baru</label>
          <input v-model="newPassword" type="password" placeholder="Min. 8 karakter" />
        </div>
        <div v-if="actionError" class="error-msg">{{ actionError }}</div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showResetPw = false">Batal</button>
          <button class="btn-submit" @click="handleResetPw" :disabled="actionLoading">
            {{ actionLoading ? 'Menyimpan...' : 'Reset' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Edit Role -->
    <div v-if="showEditRoles" class="modal-overlay" @click.self="showEditRoles = false">
      <div class="modal">
        <h3>Edit Role Akun</h3>
        <p class="modal-sub">Username: <strong>{{ hris.current.user?.username }}</strong></p>
        <div class="field">
          <label>Role (pilih satu atau lebih)</label>
          <div class="role-list">
            <label v-for="r in hris.roles" :key="r.id_role" class="role-item">
              <input type="checkbox" :value="r.id_role" v-model="editRoleIds" />
              {{ r.nama_role }}
              <span class="role-desc">{{ r.deskripsi }}</span>
            </label>
          </div>
        </div>
        <div v-if="actionError" class="error-msg">{{ actionError }}</div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showEditRoles = false">Batal</button>
          <button class="btn-submit" @click="handleEditRoles" :disabled="actionLoading">
            {{ actionLoading ? 'Menyimpan...' : 'Simpan Role' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Edit Akses Modul -->
    <div v-if="showEditModul" class="modal-overlay" @click.self="showEditModul = false">
      <div class="modal modal-wide">
        <h3>Edit Akses Modul</h3>
        <p class="modal-sub">Username: <strong>{{ hris.current?.user?.username }}</strong></p>

        <!-- Toggle Semua Modul (Administrator) -->
        <label class="modul-admin-toggle" :class="{ active: semuaModul }">
          <input type="checkbox" v-model="semuaModul" @change="onSemuaModulChange" />
          <span>⭐ Administrator — Semua Modul (tidak dibatasi)</span>
        </label>

        <!-- Preset per jabatan -->
        <div class="preset-section" v-if="!semuaModul">
          <span class="preset-label">Preset jabatan:</span>
          <div class="preset-list">
            <button
              v-for="p in PRESETS" :key="p.key"
              class="btn-preset"
              :class="{ active: editModulAkses.join(',') === p.moduls.join(',') }"
              @click="applyPreset(p.moduls)"
              type="button"
            >{{ p.icon }} {{ p.label }}</button>
          </div>
        </div>

        <!-- Daftar modul individual -->
        <div class="field" v-if="!semuaModul">
          <label>Modul yang dapat diakses ({{ editModulAkses.length }} dipilih):</label>
          <div class="modul-grid">
            <label v-for="m in ALL_MODULS" :key="m.key" class="modul-item"
              :class="{ checked: editModulAkses.includes(m.key) }">
              <input type="checkbox" :value="m.key" v-model="editModulAkses" />
              <span class="modul-icon">{{ m.icon }}</span>
              <span class="modul-name">{{ m.label }}</span>
            </label>
          </div>
        </div>

        <div v-if="actionError" class="error-msg">{{ actionError }}</div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showEditModul = false">Batal</button>
          <button class="btn-submit" @click="handleEditModul" :disabled="actionLoading">
            {{ actionLoading ? 'Menyimpan...' : 'Simpan Akses' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="hris.loading || !loaded" class="loading-page">Memuat data karyawan...</div>
  <div v-else class="page">
    <button type="button" class="btn-back" @click="router.push('/hris/karyawan')">← Daftar Karyawan</button>
    <div class="empty-state"><div class="empty-title">{{ hris.error || 'Data karyawan tidak ditemukan.' }}</div></div>
  </div>
</template>

<style scoped>
.page { max-width: 900px; }

.page-header { align-items: center; }
.btn-back {
  background: none; border: none; color: #3b82f6;
  font-size: 14px; font-weight: 600; cursor: pointer; padding: 0;
  align-self: flex-start;
}
.header-right { display: flex; gap: 10px; flex-wrap: wrap; }

.alert-success {
  background: #f0fdf4; border: 1px solid #86efac;
  color: #15803d; border-radius: 8px;
  padding: 10px 16px; font-size: 14px; margin-bottom: 16px;
}
.alert-error {
  background: #fef2f2; border: 1px solid #fecaca;
  color: #dc2626; border-radius: 8px;
  padding: 10px 16px; font-size: 14px; margin-bottom: 16px;
}

.card {
  background: #fff; border-radius: 12px;
  padding: 24px 28px; margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.card-header {
  display: flex; align-items: center; gap: 16px; margin-bottom: 20px;
}
.avatar-photo {
  width: 56px; height: 56px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.avatar {
  width: 56px; height: 56px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 22px; font-weight: 700;
  flex-shrink: 0;
}
.card-header h3 { margin: 0; font-size: 18px; color: #0f172a; }
.card-header p { margin: 2px 0 6px; font-size: 14px; color: #64748b; }

.section-header {
  display: flex; justify-content: space-between;
  align-items: center; margin-bottom: 16px;
}
.section-header h4 { margin: 0; font-size: 16px; color: #0f172a; }

.info-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
}
.info-item { display: flex; flex-direction: column; gap: 3px; }
.label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; }
.value { font-size: 14px; color: var(--text-1); overflow-wrap: anywhere; }
.mono { font-family: monospace; }

.badge-aktif { background: #dcfce7; color: #15803d; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.badge-nonaktif { background: #fee2e2; color: #dc2626; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }

.user-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.empty-user { color: #94a3b8; font-size: 14px; padding: 16px 0; }

.btn-primary { background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-secondary { background: #f1f5f9; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; color: #1e40af; cursor: pointer; }
.btn-danger { background: #fee2e2; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; color: #dc2626; cursor: pointer; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-success { background: #dcfce7; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; color: #15803d; cursor: pointer; }

/* Modal */
.modal { padding: 32px; max-width: 440px; }
@media (max-width: 480px) {
  .modal { padding: 20px 18px; }
  .card { padding: 18px 16px; }
}
.modal h3 { margin: 0 0 4px; font-size: 18px; color: #0f172a; }
.modal-sub { margin: 0 0 20px; font-size: 13px; color: #64748b; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input:not([type="checkbox"]) { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.field input:not([type="checkbox"]):focus { border-color: #3b82f6; }
.error-msg { background: var(--danger-light); border: 1px solid #fecaca; color: var(--danger); border-radius: var(--r); padding: 8px 12px; font-size: 13px; margin-top: 4px; }

.role-list { display: flex; flex-direction: column; gap: 8px; }
.role-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; cursor: pointer;
}
.role-desc { font-size: 12px; color: #94a3b8; }

.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.btn-cancel { background: #f1f5f9; border: none; border-radius: 8px; padding: 9px 18px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

/* Modul akses */
.modal-wide { max-width: 560px; }
.badge-admin { background: #fef3c7; color: #92400e; border-radius: 12px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
.modul-admin-toggle {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: 10px; border: 2px solid #e2e8f0;
  cursor: pointer; font-size: 14px; font-weight: 600; margin-bottom: 14px;
  transition: all 0.15s;
}
.modul-admin-toggle.active { border-color: #f59e0b; background: #fffbeb; color: #92400e; }
.modul-admin-toggle input { width: 16px; height: 16px; accent-color: #f59e0b; }
.modul-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.modul-item {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 10px; border-radius: 8px; border: 1px solid #e2e8f0;
  cursor: pointer; font-size: 13px; transition: all 0.12s;
}
.modul-item.checked { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }
.modul-item input { width: 14px; height: 14px; accent-color: #3b82f6; }
.modul-icon { font-size: 15px; }
.modul-name { font-weight: 500; }
@media (max-width: 500px) { .modul-grid { grid-template-columns: repeat(2, 1fr); } }

/* Preset jabatan */
.preset-section {
  margin-bottom: 14px;
}
.preset-label {
  display: block; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: #94a3b8; margin-bottom: 8px;
}
.preset-list { display: flex; flex-wrap: wrap; gap: 6px; }
.btn-preset {
  background: #f1f5f9; border: 1.5px solid #e2e8f0;
  border-radius: 20px; padding: 5px 12px;
  font-size: 12px; font-weight: 600; color: #475569;
  cursor: pointer; transition: all 0.12s;
}
.btn-preset:hover { border-color: #3b82f6; color: #1d4ed8; background: #eff6ff; }
.btn-preset.active { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }

.loading-page { padding: 60px; text-align: center; color: #94a3b8; }
</style>
