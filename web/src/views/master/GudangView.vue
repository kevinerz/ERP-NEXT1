<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
  if (!confirm('Hapus gudang ' + g.nama_gudang + '?')) return
  try {
    await api.delete(`/master/gudang/${g.id_gudang}`)
    list.value = list.value.filter((x) => x.id_gudang !== g.id_gudang)
    successMsg.value = 'Gudang dihapus'
    setTimeout(() => (successMsg.value = ''), 3000)
  } catch (e: any) {
    alert(e.response?.data?.message ?? 'Gagal menghapus gudang')
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
      <button class="btn-primary" @click="openAdd">+ Tambah Gudang</button>
    </div>

    <!-- Alert -->
    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="error" class="alert-error">{{ error }}</div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Memuat...</div>
      <table v-else>
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
          <tr v-for="g in list" :key="g.id_gudang" class="table-row">
            <td><span class="kode-badge">{{ g.kode_gudang }}</span></td>
            <td>
              <div class="fw600">{{ g.nama_gudang }}</div>
              <div v-if="g.alamat" class="text-gray text-sm">{{ g.alamat }}</div>
            </td>
            <td class="text-gray">{{ g.kota || '—' }}</td>
            <td class="center">{{ g._count?.aset ?? 0 }}</td>
            <td>
              <span :class="g.is_aktif ? 'badge-aktif' : 'badge-nonaktif'">
                {{ g.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-edit" @click="openEdit(g)">Edit</button>
              <button class="btn-hapus" @click="hapusGudang(g)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ isEdit ? 'Edit Gudang' : 'Tambah Gudang' }}</h3>
        <div class="field">
          <label>Kode Gudang <span class="req">*</span></label>
          <input v-model="form.kode_gudang" placeholder="Contoh: GDG-JKT" />
        </div>
        <div class="field">
          <label>Nama Gudang <span class="req">*</span></label>
          <input v-model="form.nama_gudang" placeholder="Gudang Jakarta" />
        </div>
        <div class="field">
          <label>Kota</label>
          <input v-model="form.kota" placeholder="Jakarta" />
        </div>
        <div class="field">
          <label>Alamat</label>
          <textarea v-model="form.alamat" rows="3" placeholder="Alamat lengkap (opsional)"></textarea>
        </div>
        <div class="field" v-if="isEdit">
          <label>Status</label>
          <select v-model="form.is_aktif">
            <option :value="true">Aktif</option>
            <option :value="false">Nonaktif</option>
          </select>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 960px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

.alert-success {
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;
  color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 12px;
}
.alert-error {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px;
}

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 16px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 16px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.table-row { transition: background 0.15s; }
.table-row:hover { background: #f8fafc; }
.empty-state { text-align: center; padding: 52px 20px; }
.empty-icon { font-size: 36px; margin-bottom: 12px; }
.empty-title { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: #94a3b8; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.center { text-align: center; font-weight: 700; }

.kode-badge { background: #f0f9ff; color: #0369a1; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }
.badge-aktif { background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-nonaktif { background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 12px; }

.actions { display: flex; gap: 6px; align-items: center; }
.btn-edit { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-hapus { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 0.8rem; }

.btn-primary {
  padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
}

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: #fff; border-radius: 14px; padding: 28px 32px;
  width: 480px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea {
  padding: 9px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a;
}
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  color: #dc2626; font-size: 13px; padding: 8px 12px; margin-bottom: 12px;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
