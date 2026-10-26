<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { confirmDialog, alertError } from '@/composables/useDialog'
import api from '@/services/api'

export interface Gudang {
  id_gudang: number
  kode_gudang: string
  nama_gudang: string
  kota?: string | null
  alamat?: string | null
  is_aktif: boolean
  _count?: { aset: number }
}

const list = ref<Gudang[]>([])
const loading = ref(false)
const error = ref('')

// Modal state
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const form = ref({ kode_gudang: '', nama_gudang: '', kota: '', alamat: '', is_aktif: true })
const submitting = ref(false)
const formError = ref('')
const successMsg = ref('')

onMounted(fetchData)

async function fetchData() {
  loading.value = true
  error.value = ''
  try {
    const r = await api.get('/master/gudang')
    list.value = r.data.data
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Gagal memuat data gudang'
  } finally {
    loading.value = false
  }
}

function openAdd() {
  isEdit.value = false
  editId.value = null
  form.value = { kode_gudang: '', nama_gudang: '', kota: '', alamat: '', is_aktif: true }
  formError.value = ''
  showModal.value = true
}

function openEdit(g: Gudang) {
  isEdit.value = true
  editId.value = g.id_gudang
  form.value = {
    kode_gudang: g.kode_gudang,
    nama_gudang: g.nama_gudang,
    kota: g.kota || '',
    alamat: g.alamat || '',
    is_aktif: g.is_aktif,
  }
  formError.value = ''
  showModal.value = true
}

async function handleSubmit() {
  if (!form.value.kode_gudang || !form.value.nama_gudang) {
    formError.value = 'Kode dan Nama wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    if (isEdit.value && editId.value) {
      await api.patch(`/master/gudang/${editId.value}`, form.value)
    } else {
      const { is_aktif, ...payload } = form.value
      await api.post('/master/gudang', payload)
    }
    showModal.value = false
    successMsg.value = isEdit.value ? 'Gudang diperbarui' : 'Gudang ditambahkan'
    setTimeout(() => (successMsg.value = ''), 3000)
    fetchData()
  } catch (e: any) {
    formError.value = e.response?.data?.message ?? 'Terjadi kesalahan'
  } finally {
    submitting.value = false
  }
}

async function hapusGudang(g: Gudang) {
  if (!(await confirmDialog({ title: 'Hapus Gudang?', message: 'Hapus gudang ' + g.nama_gudang + '?', variant: 'danger', confirmLabel: 'Ya, Hapus' }))) return
  try {
    await api.delete(`/master/gudang/${g.id_gudang}`)
    list.value = list.value.filter((x) => x.id_gudang !== g.id_gudang)
    successMsg.value = 'Gudang dihapus'
    setTimeout(() => (successMsg.value = ''), 3000)
  } catch (e: any) {
    await alertError(e, 'Gagal menghapus gudang')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Gudang</h2>
        <p class="sub">Lokasi gudang fisik penyimpanan aset</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openAdd">+ Tambah Gudang</button>
    </div>

    <!-- Alert -->
    <div v-if="successMsg" class="alert alert-success">{{ successMsg }}</div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading-state">Memuat...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th style="width:100px">Kode</th>
            <th>Nama Gudang</th>
            <th>Kota</th>
            <th style="width:110px">Jumlah Aset</th>
            <th style="width:110px">Status</th>
            <th style="width:140px">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!list.length">
            <td colspan="6">
              <div class="empty-state">
                <div class="empty-icon">🏬</div>
                <div class="empty-title">Belum ada gudang</div>
                <div class="empty-desc">Tambahkan gudang fisik pertama Anda</div>
              </div>
            </td>
          </tr>
          <tr v-for="g in list" :key="g.id_gudang">
            <td><span class="kode-badge">{{ g.kode_gudang }}</span></td>
            <td>
              <div class="fw600">{{ g.nama_gudang }}</div>
              <div v-if="g.alamat" class="text-gray text-sm">{{ g.alamat }}</div>
            </td>
            <td class="text-gray">{{ g.kota || '—' }}</td>
            <td class="center">{{ (g._count?.aset ?? 0).toLocaleString('id-ID') }}</td>
            <td>
              <span :class="['badge', g.is_aktif ? 'badge-green' : 'badge-red']">
                {{ g.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td>
              <div class="actions">
                <button type="button" class="btn btn-sm btn-soft-blue" @click="openEdit(g)">Edit</button>
                <button type="button" class="btn btn-sm btn-soft-danger" @click="hapusGudang(g)">Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ isEdit ? 'Edit Gudang' : 'Tambah Gudang' }}</h3>
          <button type="button" class="btn-modal-close" @click="showModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label form-required">Kode Gudang</label>
            <input v-model="form.kode_gudang" class="form-input" placeholder="Contoh: GDG-JKT" />
          </div>
          <div class="form-group">
            <label class="form-label form-required">Nama Gudang</label>
            <input v-model="form.nama_gudang" class="form-input" placeholder="Gudang Jakarta" />
          </div>
          <div class="form-group">
            <label class="form-label">Kota</label>
            <input v-model="form.kota" class="form-input" placeholder="Jakarta" />
          </div>
          <div class="form-group">
            <label class="form-label">Alamat</label>
            <textarea v-model="form.alamat" class="form-textarea" rows="3" placeholder="Alamat lengkap (opsional)"></textarea>
          </div>
          <div class="form-group" v-if="isEdit">
            <label class="form-label">Status</label>
            <select v-model="form.is_aktif" class="form-select">
              <option :value="true">Aktif</option>
              <option :value="false">Nonaktif</option>
            </select>
          </div>
          <div v-if="formError" class="alert alert-danger">{{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showModal = false">Batal</button>
          <button type="button" class="btn btn-primary" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
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

.fw600 { font-weight: 600; color: var(--text-1); }
.text-gray { color: var(--text-3); }
.text-sm { font-size: 12px; }
.center { text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }

.kode-badge { display: inline-block; background: var(--info-light); color: var(--info); padding: 3px 8px; border-radius: var(--r-sm); font-size: 12px; font-weight: 700; white-space: nowrap; }

.actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.btn-soft-blue { background: var(--primary-light); color: var(--primary); }
.btn-soft-blue:hover { background: #dbeafe; }
.btn-soft-danger { background: var(--danger-light); color: var(--danger); border: 1px solid #fecaca; }
.btn-soft-danger:hover { background: #fee2e2; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
</style>
