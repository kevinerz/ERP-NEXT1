<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const users    = ref<any[]>([])
const loading  = ref(true)
const showAdd  = ref(false)
const addForm  = ref({ id_pelanggan: 0, email: '', password: '', nama: '' })
const addError = ref('')
const addSave  = ref(false)
const pelList  = ref<any[]>([])

onMounted(async () => {
  const [u, p] = await Promise.all([
    api.get('/portal/admin/users'),
    api.get('/master/pelanggan', { params: { limit: 500 } }),
  ])
  users.value  = u.data.data
  pelList.value = p.data.data
  loading.value = false
})

async function handleAdd() {
  if (!addForm.value.id_pelanggan || !addForm.value.email || !addForm.value.password) {
    addError.value = 'Pelanggan, email, dan password wajib diisi'; return
  }
  addSave.value = true; addError.value = ''
  try {
    const res = await api.post('/portal/admin/users', addForm.value)
    users.value.unshift(res.data.data)
    showAdd.value = false
  } catch (e: any) { addError.value = e.response?.data?.message || 'Gagal' }
  finally { addSave.value = false }
}

async function toggleUser(u: any) {
  const res = await api.patch(`/portal/admin/users/${u.id_user}/toggle`)
  u.is_aktif = res.data.data.is_aktif
}

async function resetPw(u: any) {
  const pw = prompt(`Reset password untuk ${u.email}:\nMasukkan password baru (min 8 karakter)`)
  if (!pw || pw.length < 8) { if (pw !== null) alert('Password min 8 karakter'); return }
  await api.patch(`/portal/admin/users/${u.id_user}/reset-password`, { password: pw })
  alert('Password berhasil direset')
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Akun Portal Pelanggan</h2>
        <p class="sub">Kelola akun login untuk dashboard monitoring pelanggan</p>
      </div>
      <button class="btn-primary" @click="showAdd = true; addForm = { id_pelanggan: 0, email: '', password: '', nama: '' }; addError = ''">+ Tambah Akun</button>
    </div>

    <div v-if="loading" class="loading">Memuat...</div>

    <div class="table-card" v-else>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Nama</th>
            <th>Pelanggan</th>
            <th>Status</th>
            <th>Login Terakhir</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!users.length">
            <td colspan="6" class="empty">Belum ada akun portal</td>
          </tr>
          <tr v-for="u in users" :key="u.id_user">
            <td class="fw">{{ u.email }}</td>
            <td class="text-gray">{{ u.nama || '—' }}</td>
            <td>
              <div class="fw">{{ u.pelanggan?.nama_pelanggan }}</div>
              <div class="text-sm text-gray">{{ u.pelanggan?.kode_pelanggan }}</div>
            </td>
            <td>
              <span :class="['badge', u.is_aktif ? 'badge-aktif' : 'badge-inaktif']">{{ u.is_aktif ? 'Aktif' : 'Nonaktif' }}</span>
            </td>
            <td class="text-gray text-sm">{{ fmtDate(u.last_login) }}</td>
            <td>
              <div style="display:flex;gap:6px">
                <button class="act-btn" @click="toggleUser(u)">{{ u.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                <button class="act-btn" @click="resetPw(u)">Reset PW</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal tambah -->
    <div v-if="showAdd" class="modal-overlay" @click.self="showAdd = false">
      <div class="modal">
        <h3>Tambah Akun Portal</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Pelanggan <span class="req">*</span></label>
            <select v-model="addForm.id_pelanggan">
              <option :value="0">— Pilih Pelanggan —</option>
              <option v-for="p in pelList" :key="p.id_pelanggan" :value="p.id_pelanggan">{{ p.nama_pelanggan }}</option>
            </select>
          </div>
          <div class="field">
            <label>Email <span class="req">*</span></label>
            <input v-model="addForm.email" type="email" placeholder="pic@perusahaan.com" />
          </div>
          <div class="field">
            <label>Nama (opsional)</label>
            <input v-model="addForm.nama" placeholder="Nama kontak" />
          </div>
          <div class="field full">
            <label>Password <span class="req">*</span></label>
            <input v-model="addForm.password" type="password" placeholder="Min 8 karakter" />
          </div>
        </div>
        <p v-if="addError" class="form-error">{{ addError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showAdd = false">Batal</button>
          <button class="btn-submit" @click="handleAdd" :disabled="addSave">{{ addSave ? 'Menyimpan...' : 'Buat Akun' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1000px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.loading { color: #94a3b8; padding: 40px; text-align: center; }
.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 11px 14px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; }
td { padding: 12px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.fw { font-weight: 600; }
.text-sm { font-size: 12px; }
.text-gray { color: #64748b; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.badge-aktif  { background: #f0fdf4; color: #15803d; }
.badge-inaktif{ background: #f8fafc; color: #94a3b8; }
.act-btn { padding: 5px 10px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #374151; }
.act-btn:hover { background: #e2e8f0; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 480px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 18px; font-size: 18px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
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
