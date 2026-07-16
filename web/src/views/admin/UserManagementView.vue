<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { fmtDateTime } from '@/composables/useFormat'

interface UserRow {
  id_user: number
  username: string
  nama_lengkap: string
  jabatan: string
  departemen: string
  is_aktif: boolean
  last_login?: string
  roles: string[]
  modul_akses: string[]
}

const users = ref<UserRow[]>([])
const loading = ref(true)
const error = ref('')
const togglingId = ref(0)

// Modal edit modul akses
const showModulModal = ref(false)
const selectedUser = ref<UserRow | null>(null)
const selectedModuls = ref<string[]>([])
const submitting = ref(false)
const formError = ref('')

// Modal tambah user
const showCreateModal = ref(false)
const createForm = ref({ id_karyawan: 0, username: '', password: '', modul_akses: [] as string[] })
const karyawanList = ref<any[]>([])

// Modal reset password
const showResetModal = ref(false)
const resetTarget = ref<UserRow | null>(null)
const newPassword = ref('')

const ALL_MODULS: { key: string; label: string; icon: string }[] = [
  { key: 'hris',       label: 'HRIS',        icon: '👤' },
  { key: 'master',     label: 'Master Data',  icon: '📦' },
  { key: 'sales',      label: 'Sales',        icon: '💼' },
  { key: 'projects',   label: 'Proyek',       icon: '📋' },
  { key: 'operations', label: 'Operasional',  icon: '🔧' },
  { key: 'assets',     label: 'Aset',         icon: '🖥️' },
  { key: 'contracts',  label: 'Kontrak',      icon: '📄' },
  { key: 'reports',    label: 'Laporan',      icon: '📈' },
  { key: 'notifications', label: 'Notifikasi', icon: '🔔' },
  { key: 'public-wo',  label: 'Public WO',    icon: '🌐' },
  { key: 'prtg',       label: 'PRTG',         icon: '📡' },
  { key: 'rcms',       label: 'RCMS',         icon: '🛰️' },
  { key: 'ruijie',     label: 'Ruijie',       icon: '📶' },
  { key: 'mekari',     label: 'Mekari',       icon: '💳' },
  { key: 'socialchat', label: 'SocialChat',   icon: '💬' },
]

onMounted(() => {
  fetchUsers()
  fetchKaryawan()
})

async function fetchUsers() {
  loading.value = true; error.value = ''
  try {
    const r = await api.get('/admin/users')
    users.value = r.data.data
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal memuat users' }
  finally { loading.value = false }
}

async function fetchKaryawan() {
  try {
    const r = await api.get('/hris/karyawan', { params: { limit: 200 } })
    karyawanList.value = r.data.data
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal memuat daftar karyawan' }
}

function openModulModal(user: UserRow) {
  selectedUser.value = user
  selectedModuls.value = [...user.modul_akses]
  showModulModal.value = true; formError.value = ''
}

function toggleModul(key: string) {
  const idx = selectedModuls.value.indexOf(key)
  if (idx >= 0) selectedModuls.value.splice(idx, 1)
  else selectedModuls.value.push(key)
}

function selectAll() { selectedModuls.value = ALL_MODULS.map((m) => m.key) }
function clearAll() { selectedModuls.value = [] }

async function saveModuls() {
  if (!selectedUser.value) return
  submitting.value = true; formError.value = ''
  try {
    await api.patch(`/admin/users/${selectedUser.value.id_user}/modul-akses`, {
      modul_akses: selectedModuls.value,
    })
    selectedUser.value.modul_akses = [...selectedModuls.value]
    const u = users.value.find((u) => u.id_user === selectedUser.value!.id_user)
    if (u) u.modul_akses = [...selectedModuls.value]
    showModulModal.value = false
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { submitting.value = false }
}

async function toggleAktif(user: UserRow) {
  togglingId.value = user.id_user
  try {
    const r = await api.patch(`/admin/users/${user.id_user}/toggle-aktif`)
    user.is_aktif = r.data.data.is_aktif
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal mengubah status' }
  finally { togglingId.value = 0 }
}

function openReset(user: UserRow) {
  resetTarget.value = user; newPassword.value = ''; showResetModal.value = true; formError.value = ''
}

async function doReset() {
  if (!newPassword.value || newPassword.value.length < 6) { formError.value = 'Password minimal 6 karakter'; return }
  submitting.value = true; formError.value = ''
  try {
    await api.patch(`/admin/users/${resetTarget.value!.id_user}/reset-password`, { password: newPassword.value })
    showResetModal.value = false
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal reset password' }
  finally { submitting.value = false }
}

async function createUser() {
  if (!createForm.value.id_karyawan || !createForm.value.username || !createForm.value.password) {
    formError.value = 'Karyawan, username, dan password wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    await api.post('/admin/users', createForm.value)
    showCreateModal.value = false
    fetchUsers()
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal membuat user' }
  finally { submitting.value = false }
}

const fmtDt = fmtDateTime

function modulLabel(m: string) {
  return ALL_MODULS.find((x) => x.key === m)?.label || m
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>User Management</h2>
        <p class="sub">Kelola akun & hak akses modul per user</p>
      </div>
      <button class="btn-primary" @click="showCreateModal = true; formError = ''">+ Tambah User</button>
    </div>

    <div v-if="error" class="alert-error">{{ error }}</div>

    <div class="table-card">
      <div v-if="loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Username</th>
            <th>Jabatan</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Modul Akses</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!users.length">
            <td colspan="7" class="empty">Belum ada user</td>
          </tr>
          <tr v-for="u in users" :key="u.id_user">
            <td>
              <div class="fw600">{{ u.nama_lengkap }}</div>
              <div class="text-gray text-sm">{{ u.departemen }}</div>
            </td>
            <td class="mono">{{ u.username }}</td>
            <td class="text-sm text-gray">{{ u.jabatan }}</td>
            <td>
              <span :class="['status-dot', u.is_aktif ? 'aktif' : 'nonaktif']">
                {{ u.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td class="text-sm text-gray">{{ fmtDt(u.last_login) }}</td>
            <td>
              <div v-if="u.modul_akses.length === 0" class="modul-all">Semua Modul</div>
              <div v-else class="modul-tags">
                <span v-for="m in u.modul_akses" :key="m" class="modul-tag">{{ modulLabel(m) }}</span>
              </div>
            </td>
            <td>
              <div class="action-row">
                <button class="btn-action" @click="openModulModal(u)">Modul</button>
                <button class="btn-action" @click="openReset(u)">Password</button>
                <button :class="['btn-action', u.is_aktif ? 'btn-warn' : 'btn-ok']" :disabled="togglingId === u.id_user" @click="toggleAktif(u)">
                  {{ togglingId === u.id_user ? '...' : (u.is_aktif ? 'Nonaktifkan' : 'Aktifkan') }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Edit Modul Akses -->
    <div v-if="showModulModal" class="modal-overlay" @click.self="showModulModal = false">
      <div class="modal">
        <h3>Hak Akses Modul — {{ selectedUser?.nama_lengkap }}</h3>
        <p class="hint">Jika tidak ada modul dipilih, user mendapat akses ke semua modul (superadmin).</p>

        <div class="select-all-row">
          <button class="btn-sm" @click="selectAll">Pilih Semua</button>
          <button class="btn-sm" @click="clearAll">Hapus Semua</button>
        </div>

        <div class="modul-grid">
          <label v-for="m in ALL_MODULS" :key="m.key" class="modul-check"
            :class="{ checked: selectedModuls.includes(m.key) }">
            <input type="checkbox" :value="m.key"
              :checked="selectedModuls.includes(m.key)"
              @change="toggleModul(m.key)" />
            <span class="modul-icon">{{ m.icon }}</span>
            <span class="modul-name">{{ m.label }}</span>
          </label>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModulModal = false">Batal</button>
          <button class="btn-submit" @click="saveModuls" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Reset Password -->
    <div v-if="showResetModal" class="modal-overlay" @click.self="showResetModal = false">
      <div class="modal small">
        <h3>Reset Password — {{ resetTarget?.username }}</h3>
        <div class="field">
          <label>Password Baru <span class="req">*</span></label>
          <input v-model="newPassword" type="password" placeholder="Min. 6 karakter" />
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showResetModal = false">Batal</button>
          <button class="btn-submit" @click="doReset" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Reset Password' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Tambah User -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h3>Tambah User Baru</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Karyawan <span class="req">*</span></label>
            <select v-model.number="createForm.id_karyawan">
              <option :value="0">— Pilih Karyawan —</option>
              <option v-for="k in karyawanList" :key="k.id_karyawan" :value="k.id_karyawan">
                {{ k.nama_lengkap }} — {{ k.jabatan }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Username <span class="req">*</span></label>
            <input v-model="createForm.username" placeholder="username.unik" />
          </div>
          <div class="field">
            <label>Password <span class="req">*</span></label>
            <input v-model="createForm.password" type="password" placeholder="Min. 6 karakter" />
          </div>
          <div class="field full">
            <label>Modul Akses (kosong = semua modul)</label>
            <div class="modul-grid small">
              <label v-for="m in ALL_MODULS" :key="m.key" class="modul-check"
                :class="{ checked: createForm.modul_akses.includes(m.key) }">
                <input type="checkbox" :value="m.key" v-model="createForm.modul_akses" />
                <span class="modul-icon">{{ m.icon }}</span>
                <span class="modul-name">{{ m.label }}</span>
              </label>
            </div>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showCreateModal = false">Batal</button>
          <button class="btn-submit" @click="createUser" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Buat User' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 12px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: top; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.mono { font-family: monospace; font-size: 13px; font-weight: 600; color: #374151; }

.status-dot { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.status-dot.aktif { background: #f0fdf4; color: #15803d; }
.status-dot.nonaktif { background: #f1f5f9; color: #64748b; }

.modul-all { font-size: 12px; color: #1d4ed8; font-weight: 600; background: #eff6ff; padding: 2px 8px; border-radius: 10px; display: inline-block; }
.modul-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.modul-tag { font-size: 11px; padding: 2px 7px; background: #f1f5f9; color: #374151; border-radius: 8px; font-weight: 600; }

.action-row { display: flex; gap: 6px; flex-wrap: wrap; }
.btn-action { padding: 5px 10px; border: 1.5px solid #e2e8f0; background: #fff; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #374151; }
.btn-action:hover { background: #f8fafc; }
.btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-warn { border-color: #fecaca; color: #dc2626; }
.btn-warn:hover { background: #fef2f2; }
.btn-ok { border-color: #bbf7d0; color: #15803d; }
.btn-ok:hover { background: #f0fdf4; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal.small { width: 380px; }
.modal h3 { margin: 0 0 8px; font-size: 18px; color: #0f172a; }
.hint { font-size: 12px; color: #94a3b8; margin: 0 0 16px; }
.select-all-row { display: flex; gap: 8px; margin-bottom: 12px; }
.btn-sm { padding: 5px 12px; border: 1.5px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }

.modul-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
.modul-grid.small { grid-template-columns: 1fr 1fr; }
.modul-check { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1.5px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: all 0.15s; }
.modul-check:hover { border-color: #bfdbfe; background: #eff6ff; }
.modul-check.checked { border-color: #3b82f6; background: #eff6ff; }
.modul-check input { display: none; }
.modul-icon { font-size: 16px; }
.modul-name { font-size: 13px; font-weight: 600; color: #374151; }
.modul-check.checked .modul-name { color: #1d4ed8; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 4px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; }
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
