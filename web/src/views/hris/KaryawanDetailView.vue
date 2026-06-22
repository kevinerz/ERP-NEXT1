<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHrisStore } from '@/stores/hris'

const router = useRouter()
const route = useRoute()
const hris = useHrisStore()

const id = Number(route.params.id)
const showCreateUser = ref(false)
const showResetPw = ref(false)

const userForm = ref({ username: '', password: '', role_ids: [] as number[] })
const newPassword = ref('')
const actionLoading = ref(false)
const actionError = ref('')
const actionSuccess = ref('')

onMounted(async () => {
  await hris.fetchRoles()
  await hris.fetchOne(id)
})

const k = hris.current

function formatDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

async function handleToggleStatus() {
  actionError.value = ''
  try {
    await hris.toggleStatus(id)
    await hris.fetchOne(id)
    actionSuccess.value = 'Status karyawan diperbarui'
    setTimeout(() => actionSuccess.value = '', 3000)
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal'
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
    actionSuccess.value = 'Akun user berhasil dibuat'
    setTimeout(() => actionSuccess.value = '', 3000)
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
    actionSuccess.value = 'Password berhasil direset'
    setTimeout(() => actionSuccess.value = '', 3000)
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal reset password'
  } finally {
    actionLoading.value = false
  }
}

async function handleToggleUserStatus() {
  actionError.value = ''
  try {
    await hris.toggleUserStatus(id)
    await hris.fetchOne(id)
    actionSuccess.value = 'Status akun diperbarui'
    setTimeout(() => actionSuccess.value = '', 3000)
  } catch (e: any) {
    actionError.value = e.response?.data?.message || 'Gagal'
  }
}
</script>

<template>
  <div class="page" v-if="hris.current">
    <!-- Header -->
    <div class="page-header">
      <button class="btn-back" @click="window.location.href='/hris/karyawan'">← Daftar Karyawan</button>
      <div class="header-right">
        <button class="btn-secondary" @click="window.location.href=`/hris/karyawan/${id}/edit`">Edit</button>
        <button
          :class="hris.current.status_aktif ? 'btn-danger' : 'btn-success'"
          @click="handleToggleStatus"
        >
          {{ hris.current.status_aktif ? 'Nonaktifkan' : 'Aktifkan' }}
        </button>
      </div>
    </div>

    <!-- Notifikasi -->
    <div v-if="actionSuccess" class="alert-success">{{ actionSuccess }}</div>
    <div v-if="actionError" class="alert-error">{{ actionError }}</div>

    <!-- Info Karyawan -->
    <div class="card">
      <div class="card-header">
        <div class="avatar">{{ hris.current.nama_lengkap.charAt(0).toUpperCase() }}</div>
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
              {{ hris.current.user.user_roles.map(ur => ur.role.nama_role).join(', ') }}
            </span>
          </div>
          <div class="info-item">
            <span class="label">Login Terakhir</span>
            <span class="value">{{ formatDate(hris.current.user.last_login) }}</span>
          </div>
        </div>
        <div class="user-actions">
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
        <div class="modal-actions">
          <button class="btn-cancel" @click="showResetPw = false">Batal</button>
          <button class="btn-submit" @click="handleResetPw" :disabled="actionLoading">
            {{ actionLoading ? 'Menyimpan...' : 'Reset' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="hris.loading" class="loading-page">Memuat data karyawan...</div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 900px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.btn-back {
  background: none; border: none; color: #3b82f6;
  font-size: 14px; font-weight: 600; cursor: pointer; padding: 0;
}
.header-right { display: flex; gap: 10px; }

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
.value { font-size: 14px; color: #0f172a; }
.mono { font-family: monospace; }

.badge-aktif { background: #dcfce7; color: #15803d; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.badge-nonaktif { background: #fee2e2; color: #dc2626; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }

.user-actions { display: flex; gap: 10px; margin-top: 20px; }
.empty-user { color: #94a3b8; font-size: 14px; padding: 16px 0; }

.btn-primary { background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-secondary { background: #f1f5f9; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; color: #1e40af; cursor: pointer; }
.btn-danger { background: #fee2e2; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; color: #dc2626; cursor: pointer; }
.btn-success { background: #dcfce7; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; color: #15803d; cursor: pointer; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal {
  background: #fff; border-radius: 16px;
  padding: 32px; width: 100%; max-width: 440px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.field input:focus { border-color: #3b82f6; }

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

.loading-page { padding: 60px; text-align: center; color: #94a3b8; }
</style>
