<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { confirmDialog, alertDialog, promptDialog, alertError, toast, pesanGalat } from '@/composables/useDialog'

const users    = ref<any[]>([])
const loading  = ref(true)
const showAdd  = ref(false)
const addForm  = ref({ id_pelanggan: 0, email: '', password: '', nama: '' })
const addError = ref('')
const addSave  = ref(false)
const pelList  = ref<any[]>([])
const loadError = ref('')
const busyId   = ref<number | null>(null)

// daftar pelanggan hanya untuk form tambah — gagalnya tidak boleh mengosongkan tabel akun
const pelError = ref('')
async function muatPelanggan() {
  pelError.value = ''
  try { pelList.value = (await api.get('/master/pelanggan', { params: { limit: 500 } })).data.data ?? [] }
  catch (e: any) { pelError.value = pesanGalat(e, 'Gagal memuat daftar pelanggan') }
}
async function muat() {
  loading.value = true; loadError.value = ''
  try {
    users.value = (await api.get('/portal/admin/users')).data.data ?? []
  } catch (e: any) {
    loadError.value = pesanGalat(e, 'Gagal memuat akun portal')
  } finally {
    loading.value = false
  }
}
onMounted(() => { muat(); muatPelanggan() })
function bukaTambah() {
  showAdd.value = true
  addForm.value = { id_pelanggan: 0, email: '', password: '', nama: '' }
  addError.value = ''
  if (pelError.value || !pelList.value.length) muatPelanggan()
}

async function handleAdd() {
  if (addSave.value) return
  const f = addForm.value
  if (!f.id_pelanggan || !f.email.trim() || !f.password) {
    addError.value = 'Pelanggan, email, dan password wajib diisi'; return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { addError.value = 'Format email tidak valid'; return }
  if (f.password.length < 8) { addError.value = 'Password minimal 8 karakter'; return }
  addSave.value = true; addError.value = ''
  try {
    const res = await api.post('/portal/admin/users', { ...f, email: f.email.trim(), nama: f.nama.trim() || undefined })
    // respons create tidak menyertakan relasi pelanggan → lengkapi dari daftar agar kolom Pelanggan tidak "—"
    const pel = pelList.value.find((p) => p.id_pelanggan === f.id_pelanggan)
    users.value.unshift({ ...res.data.data, pelanggan: res.data.data?.pelanggan ?? (pel ? { nama_pelanggan: pel.nama_pelanggan, kode_pelanggan: pel.kode_pelanggan } : null) })
    showAdd.value = false
    toast('Akun portal dibuat')
  } catch (e: any) { addError.value = pesanGalat(e, 'Gagal membuat akun portal') }
  finally { addSave.value = false }
}

async function toggleUser(u: any) {
  if (busyId.value !== null) return
  // nonaktifkan = pelanggan tidak bisa login portal → minta konfirmasi
  if (u.is_aktif && !(await confirmDialog({
    title: 'Nonaktifkan Akun Portal',
    message: `Nonaktifkan akun portal "${u.email}"? Pelanggan tidak bisa login sampai diaktifkan lagi.`,
    variant: 'warning',
    confirmLabel: 'Ya, Nonaktifkan',
  }))) return
  busyId.value = u.id_user
  try {
    const res = await api.patch(`/portal/admin/users/${u.id_user}/toggle`)
    u.is_aktif = res.data.data.is_aktif
    toast(u.is_aktif ? 'Akun portal diaktifkan' : 'Akun portal dinonaktifkan')
  } catch (e: any) {
    alertError(e, 'Gagal mengubah status akun')
  } finally { busyId.value = null }
}

async function resetPw(u: any) {
  const pw = await promptDialog({
    title: 'Reset Password',
    message: `Untuk ${u.email}`,
    label: 'Password baru',
    inputType: 'password',
    validate: v => v.length < 8 ? 'Minimal 8 karakter' : null,
    confirmLabel: 'Reset',
    variant: 'warning',
  })
  if (!pw || busyId.value !== null) return
  busyId.value = u.id_user
  try {
    await api.patch(`/portal/admin/users/${u.id_user}/reset-password`, { password: pw })
    await alertDialog({ message: 'Password berhasil direset', variant: 'success' })
  } catch (e: any) {
    alertError(e, 'Gagal mereset password')
  } finally { busyId.value = null }
}

async function deleteUser(u: any) {
  if (busyId.value !== null) return
  if (!(await confirmDialog({
    title: 'Hapus Akun Portal',
    message: `Hapus akun portal "${u.email}"?\nAksi ini tidak dapat dibatalkan.`,
    variant: 'danger',
    confirmLabel: 'Ya, Hapus',
  }))) return
  busyId.value = u.id_user
  try {
    await api.delete(`/portal/admin/users/${u.id_user}`)
    users.value = users.value.filter(x => x.id_user !== u.id_user)
    toast('Akun portal dihapus')
  } catch (e: any) {
    alertError(e, 'Gagal menghapus akun')
  } finally { busyId.value = null }
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
      <button type="button" class="btn btn-primary" @click="bukaTambah">+ Tambah Akun</button>
    </div>

    <div v-if="loading" class="loading">Memuat...</div>
    <div v-else-if="loadError" class="form-error" role="alert">{{ loadError }} <button type="button" class="act-btn" @click="muat">↻ Coba lagi</button></div>

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
            <td class="fw td-email">{{ u.email }}</td>
            <td class="text-gray">{{ u.nama || '—' }}</td>
            <td>
              <div class="fw">{{ u.pelanggan?.nama_pelanggan || '—' }}</div>
              <div class="text-sm text-gray">{{ u.pelanggan?.kode_pelanggan }}</div>
            </td>
            <td>
              <span :class="['badge', u.is_aktif ? 'badge-green' : 'badge-gray']">{{ u.is_aktif ? 'Aktif' : 'Nonaktif' }}</span>
            </td>
            <td class="text-gray text-sm">{{ fmtDate(u.last_login) }}</td>
            <td>
              <div class="act-group">
                <button type="button" class="act-btn" :disabled="busyId === u.id_user" @click="toggleUser(u)">{{ u.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                <button type="button" class="act-btn" :disabled="busyId === u.id_user" @click="resetPw(u)">Reset PW</button>
                <button type="button" class="act-btn act-btn-danger" :disabled="busyId === u.id_user" @click="deleteUser(u)">Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal tambah -->
    <div v-if="showAdd" class="modal-overlay" @click.self="showAdd = false" @keydown.esc="showAdd = false">
      <div class="modal" v-focus-trap aria-labelledby="portal-add-title">
        <h3 id="portal-add-title">Tambah Akun Portal</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Pelanggan <span class="req">*</span></label>
            <select v-model="addForm.id_pelanggan">
              <option :value="0">— Pilih Pelanggan —</option>
              <option v-for="p in pelList" :key="p.id_pelanggan" :value="p.id_pelanggan">{{ p.nama_pelanggan }}</option>
            </select>
            <small v-if="pelError" class="form-error">{{ pelError }} — <a href="#" @click.prevent="muatPelanggan">coba lagi</a></small>
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
        <p v-if="addError" class="form-error" role="alert">{{ addError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="showAdd = false">Batal</button>
          <button type="button" class="btn-submit" @click="handleAdd" :disabled="addSave">{{ addSave ? 'Menyimpan...' : 'Buat Akun' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1000px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.loading { color: #94a3b8; padding: 40px; text-align: center; }
.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 11px 14px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; }
td { padding: 12px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.fw { font-weight: 600; }
.text-sm { font-size: 12px; }
.text-gray { color: #64748b; }
.td-email { overflow-wrap: anywhere; }
.act-group { display: flex; gap: 6px; flex-wrap: nowrap; }
.act-btn { padding: 5px 10px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #374151; }
.act-btn:hover { background: #e2e8f0; }
.act-btn-danger { color: #dc2626; }
.act-btn-danger:hover { background: #fee2e2; }
.act-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.act-btn { white-space: nowrap; }

/* .modal-overlay pakai global (z-index 200, blur). Padding lokal tetap. */
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 480px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
@media (max-width: 768px) { .modal { padding: 20px 18px; } }
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
