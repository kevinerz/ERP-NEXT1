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
      <button type="button" class="btn btn-primary" @click="openAdd">+ Tambah</button>
    </div>

    <div v-if="successMsg" class="alert alert-success">{{ successMsg }}</div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div v-if="loading" class="table-card"><div class="loading-state">Memuat...</div></div>
    <div v-else-if="!rows.length" class="table-card">
      <div class="empty-state">
        <div class="empty-icon">⚡</div>
        <div class="empty-title">Belum ada jenis gangguan</div>
        <div class="empty-desc">Klik "+ Tambah" untuk menambahkan.</div>
      </div>
    </div>
    <div v-else class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:80px" class="center">Urutan</th>
            <th>Nama</th>
            <th>Deskripsi</th>
            <th style="width:90px" class="center">Status</th>
            <th style="width:220px">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id_jenis" :class="{ inactive: !row.is_aktif }">
            <td class="center text-muted">{{ row.urutan }}</td>
            <td class="fw">{{ row.nama }}</td>
            <td class="text-muted">{{ row.deskripsi || '—' }}</td>
            <td class="center">
              <span :class="['badge', row.is_aktif ? 'badge-green' : 'badge-gray']">{{ row.is_aktif ? 'Aktif' : 'Nonaktif' }}</span>
            </td>
            <td>
              <div class="actions">
                <button type="button" class="btn btn-sm btn-secondary" @click="openEdit(row)">Edit</button>
                <button type="button" :class="['btn btn-sm', row.is_aktif ? 'btn-secondary btn-muted' : 'btn-soft-success']" @click="toggleAktif(row)">
                  {{ row.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}
                </button>
                <button type="button" class="btn btn-sm btn-soft-danger" @click="confirmDelete = row">Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Tambah/Edit -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ isEdit ? 'Edit' : 'Tambah' }} Jenis Gangguan</h3>
          <button type="button" class="btn-modal-close" @click="showModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label form-required">Nama</label>
            <input v-model="form.nama" class="form-input" placeholder="cth: FO Cut, Listrik Mati, ..." maxlength="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Deskripsi</label>
            <input v-model="form.deskripsi" class="form-input" placeholder="Keterangan singkat (opsional)" maxlength="255" />
          </div>
          <div class="form-group">
            <label class="form-label">Urutan</label>
            <input v-model.number="form.urutan" class="form-input" type="number" min="0" placeholder="0" />
            <span class="form-hint">Angka kecil tampil lebih atas di dropdown</span>
          </div>
          <div v-if="formError" class="alert alert-danger">{{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showModal = false">Batal</button>
          <button type="button" class="btn btn-primary" @click="handleSubmit" :disabled="submitting">{{ submitting ? 'Menyimpan...' : 'Simpan' }}</button>
        </div>
      </div>
    </div>

    <!-- Confirm Delete -->
    <div v-if="confirmDelete" class="modal-overlay" @click.self="confirmDelete = null">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3 class="modal-title">Hapus Jenis Gangguan?</h3>
          <button type="button" class="btn-modal-close" @click="confirmDelete = null">×</button>
        </div>
        <div class="modal-body">
          <p class="confirm-text">Hapus <strong>{{ confirmDelete.nama }}</strong>? Tiket yang sudah memakai kategori ini tidak terpengaruh.</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="confirmDelete = null">Batal</button>
          <button type="button" class="btn btn-danger" @click="doDelete">Ya, Hapus</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 960px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--text-1); }
.sub { margin: 0; font-size: 13px; color: var(--text-3); }

.alert { margin-bottom: 12px; }
.modal-body .alert { margin-bottom: 0; }
.modal-body { display: flex; flex-direction: column; gap: 14px; }
.confirm-text { font-size: 13.5px; color: var(--text-2); line-height: 1.6; }

.data-table tbody tr.inactive { opacity: 0.55; }
.center { text-align: center; }
.fw { font-weight: 600; color: var(--text-1); }
.text-muted { color: var(--text-3); }

.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.btn-muted { color: var(--text-3); }
.btn-soft-success { background: var(--success-light); color: var(--success); border: 1px solid #bbf7d0; }
.btn-soft-success:hover { background: #dcfce7; }
.btn-soft-danger { background: var(--danger-light); color: var(--danger); border: 1px solid #fecaca; }
.btn-soft-danger:hover { background: #fee2e2; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
</style>
