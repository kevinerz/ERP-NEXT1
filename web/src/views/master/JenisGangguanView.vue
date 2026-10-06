<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

interface JenisGangguan {
  id_jenis: number
  nama: string
  deskripsi: string | null
  urutan: number
  is_aktif: boolean
  created_at: string
}

const rows = ref<JenisGangguan[]>([])
const loading = ref(false)
const error = ref('')
const successMsg = ref('')

const showModal = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const form = ref({ nama: '', deskripsi: '', urutan: 0 })
const submitting = ref(false)
const formError = ref('')

onMounted(() => fetchData())

async function fetchData() {
  loading.value = true; error.value = ''
  try {
    const r = await api.get('/master/jenis-gangguan')
    rows.value = r.data.data
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Gagal memuat data'
  } finally { loading.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }

function openAdd() {
  isEdit.value = false; editId.value = null
  form.value = { nama: '', deskripsi: '', urutan: rows.value.length * 10 }
  formError.value = ''; showModal.value = true
}

function openEdit(row: JenisGangguan) {
  isEdit.value = true; editId.value = row.id_jenis
  form.value = { nama: row.nama, deskripsi: row.deskripsi || '', urutan: row.urutan }
  formError.value = ''; showModal.value = true
}

async function handleSubmit() {
  if (!form.value.nama.trim()) { formError.value = 'Nama wajib diisi'; return }
  submitting.value = true; formError.value = ''
  try {
    const payload = { nama: form.value.nama.trim(), deskripsi: form.value.deskripsi || undefined, urutan: Number(form.value.urutan) || 0 }
    if (isEdit.value && editId.value) {
      await api.patch(`/master/jenis-gangguan/${editId.value}`, payload)
      flash('Jenis gangguan diperbarui')
    } else {
      await api.post('/master/jenis-gangguan', payload)
      flash('Jenis gangguan ditambahkan')
    }
    showModal.value = false
    await fetchData()
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { submitting.value = false }
}

async function toggleAktif(row: JenisGangguan) {
  try {
    await api.patch(`/master/jenis-gangguan/${row.id_jenis}/toggle`)
    await fetchData()
    flash(row.is_aktif ? 'Dinonaktifkan' : 'Diaktifkan')
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal' }
}

const confirmDelete = ref<JenisGangguan | null>(null)
async function doDelete() {
  if (!confirmDelete.value) return
  try {
    await api.delete(`/master/jenis-gangguan/${confirmDelete.value.id_jenis}`)
    flash(`"${confirmDelete.value.nama}" dihapus`)
    confirmDelete.value = null
    await fetchData()
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal hapus' }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>⚡ Jenis Gangguan</h2>
        <p class="sub">Kategori gangguan yang digunakan pada tiket operasional</p>
      </div>
      <button class="btn-add" @click="openAdd">+ Tambah</button>
    </div>

    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="error" class="alert-error">{{ error }}</div>

    <div v-if="loading" class="loading">Memuat...</div>
    <div v-else-if="!rows.length" class="empty">Belum ada jenis gangguan. Klik "+ Tambah" untuk menambahkan.</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:50px">Urutan</th>
            <th>Nama</th>
            <th>Deskripsi</th>
            <th style="width:90px">Status</th>
            <th style="width:130px">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id_jenis" :class="{ inactive: !row.is_aktif }">
            <td class="center text-muted">{{ row.urutan }}</td>
            <td class="fw">{{ row.nama }}</td>
            <td class="text-muted">{{ row.deskripsi || '—' }}</td>
            <td class="center">
              <span :class="['pill', row.is_aktif ? 'pill-green' : 'pill-gray']">{{ row.is_aktif ? 'Aktif' : 'Nonaktif' }}</span>
            </td>
            <td>
              <div class="action-btns">
                <button class="btn-sm" @click="openEdit(row)">Edit</button>
                <button :class="['btn-sm', row.is_aktif ? 'btn-muted' : 'btn-green']" @click="toggleAktif(row)">
                  {{ row.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}
                </button>
                <button class="btn-sm btn-danger" @click="confirmDelete = row">Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Tambah/Edit -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ isEdit ? 'Edit' : 'Tambah' }} Jenis Gangguan</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Nama <span class="required">*</span></label>
            <input v-model="form.nama" placeholder="cth: FO Cut, Listrik Mati, ..." maxlength="100" />
          </div>
          <div class="field full">
            <label>Deskripsi</label>
            <input v-model="form.deskripsi" placeholder="Keterangan singkat (opsional)" maxlength="255" />
          </div>
          <div class="field">
            <label>Urutan</label>
            <input v-model.number="form.urutan" type="number" min="0" placeholder="0" />
            <small>Angka kecil tampil lebih atas di dropdown</small>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">{{ submitting ? 'Menyimpan...' : 'Simpan' }}</button>
        </div>
      </div>
    </div>

    <!-- Confirm Delete -->
    <div v-if="confirmDelete" class="modal-overlay" @click.self="confirmDelete = null">
      <div class="modal modal-sm">
        <h3>Hapus Jenis Gangguan?</h3>
        <p>Hapus <strong>{{ confirmDelete.nama }}</strong>? Tiket yang sudah memakai kategori ini tidak terpengaruh.</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="confirmDelete = null">Batal</button>
          <button class="btn-danger-full" @click="doDelete">Ya, Hapus</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px 24px; max-width: 860px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.page-header h2 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; }
.sub { font-size: 13px; color: #64748b; margin: 2px 0 0; }
.btn-add { padding: 8px 18px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-add:hover { background: #1e40af; }

.alert-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; }
.alert-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; }
.loading { text-align: center; padding: 40px; color: #64748b; }
.empty { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }

.table-wrap { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th { background: #f8fafc; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; }
tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.15s; }
tbody tr:hover { background: #f8fafc; }
tbody tr.inactive { opacity: 0.5; }
tbody td { padding: 10px 14px; color: #334155; }
.center { text-align: center; }
.fw { font-weight: 600; }
.text-muted { color: #64748b; }

.pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
.pill-green { background: #dcfce7; color: #166534; }
.pill-gray { background: #f1f5f9; color: #64748b; }

.action-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.btn-sm { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #e2e8f0; background: #f8fafc; color: #334155; }
.btn-sm:hover { background: #e2e8f0; }
.btn-muted { color: #64748b; }
.btn-green { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
.btn-green:hover { background: #dcfce7; }
.btn-danger { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
.btn-danger:hover { background: #fee2e2; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: #fff; border-radius: 14px; padding: 24px; width: 100%; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-sm { max-width: 380px; }
.modal h3 { font-size: 17px; font-weight: 700; color: #0f172a; margin: 0 0 18px; }
.form-grid { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field.full { }
label { font-size: 12px; font-weight: 600; color: #475569; }
.required { color: #dc2626; }
input, select { padding: 8px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; color: #0f172a; outline: none; }
input:focus, select:focus { border-color: #3b82f6; }
small { font-size: 11px; color: #94a3b8; }
.form-error { color: #dc2626; font-size: 12px; margin: 8px 0 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.btn-cancel { padding: 8px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-submit { padding: 8px 18px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-danger-full { padding: 8px 18px; background: #dc2626; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
</style>
