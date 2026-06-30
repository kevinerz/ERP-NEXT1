<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMasterStore, type Vendor } from '@/stores/master'
import api from '@/services/api'

const master = useMasterStore()

const search = ref('')
const filterTipe = ref('')
const filterAktif = ref('')
const page = ref(1)

// Modal
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const form = ref({
  nama_vendor: '', tipe_vendor: '', kontak_pic: '',
  email_pic: '', no_telp: '', catatan: '', is_aktif: true,
})
const submitting = ref(false)
const formError = ref('')
const successMsg = ref('')

const TIPE_OPTIONS = ['ISP', 'VENDOR', 'PARTNER', 'CLOUD', 'HARDWARE', 'LAINNYA']

const TIPE_COLOR: Record<string, { bg: string; color: string }> = {
  ISP:      { bg: '#eff6ff', color: '#1d4ed8' },
  VENDOR:   { bg: '#f0fdf4', color: '#15803d' },
  PARTNER:  { bg: '#faf5ff', color: '#7c3aed' },
  CLOUD:    { bg: '#f0f9ff', color: '#0369a1' },
  HARDWARE: { bg: '#fff7ed', color: '#c2410c' },
  LAINNYA:  { bg: '#f8fafc', color: '#475569' },
}

onMounted(async () => {
  await master.fetchTipeVendor()
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (search.value) params.search = search.value
  if (filterTipe.value) params.tipe_vendor = filterTipe.value
  if (filterAktif.value !== '') params.is_aktif = filterAktif.value
  master.fetchVendor(params)
}

function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function openAdd() {
  isEdit.value = false
  editId.value = null
  form.value = { nama_vendor: '', tipe_vendor: '', kontak_pic: '', email_pic: '', no_telp: '', catatan: '', is_aktif: true }
  formError.value = ''
  showModal.value = true
}

function openEdit(v: Vendor) {
  isEdit.value = true
  editId.value = v.id_vendor
  form.value = {
    nama_vendor: v.nama_vendor,
    tipe_vendor: v.tipe_vendor,
    kontak_pic: v.kontak_pic || '',
    email_pic: v.email_pic || '',
    no_telp: v.no_telp || '',
    catatan: v.catatan || '',
    is_aktif: v.is_aktif,
  }
  formError.value = ''
  showModal.value = true
}

async function handleSubmit() {
  if (!form.value.nama_vendor || !form.value.tipe_vendor) {
    formError.value = 'Nama vendor dan tipe wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const payload: any = {
      nama_vendor: form.value.nama_vendor,
      tipe_vendor: form.value.tipe_vendor,
      kontak_pic: form.value.kontak_pic || undefined,
      email_pic: form.value.email_pic || undefined,
      no_telp: form.value.no_telp || undefined,
      catatan: form.value.catatan || undefined,
      is_aktif: form.value.is_aktif,
    }
    if (isEdit.value && editId.value) {
      await master.updateVendor(editId.value, payload)
    } else {
      await master.createVendor(payload)
    }
    showModal.value = false
    successMsg.value = isEdit.value ? 'Vendor diperbarui' : 'Vendor ditambahkan'
    setTimeout(() => successMsg.value = '', 3000)
    fetchData()
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Terjadi kesalahan'
  } finally {
    submitting.value = false
  }
}

async function handleToggle(v: Vendor) {
  try {
    await master.toggleVendor(v.id_vendor)
    successMsg.value = `Vendor ${!v.is_aktif ? 'diaktifkan' : 'dinonaktifkan'}`
    setTimeout(() => successMsg.value = '', 3000)
  } catch (e: any) {
    master.error = e.response?.data?.message || 'Gagal ubah status'
  }
}

async function hapusVendor(vendor: Vendor) {
  if (!confirm('Hapus vendor ' + vendor.nama_vendor + '?')) return
  try {
    await api.delete('/master/vendor/' + vendor.id_vendor)
    master.vendorList = master.vendorList.filter((v: Vendor) => v.id_vendor !== vendor.id_vendor)
    successMsg.value = 'Vendor dihapus'
    setTimeout(() => successMsg.value = '', 3000)
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal menghapus vendor')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Vendor ISP</h2>
        <p class="sub">Daftar vendor, ISP, dan mitra jaringan</p>
      </div>
      <button class="btn-primary" @click="openAdd">+ Tambah Vendor</button>
    </div>

    <!-- Filter -->
    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama vendor..." class="input-search" />
      <div class="filter-group">
        <label class="filter-label">Tipe:</label>
        <select v-model="filterTipe" @change="doSearch" class="select-filter">
          <option value="">Semua Tipe</option>
          <option v-for="t in TIPE_OPTIONS" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Status:</label>
        <select v-model="filterAktif" @change="doSearch" class="select-filter">
          <option value="">Semua</option>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </div>
      <button class="btn-search" @click="doSearch">Cari</button>
    </div>

    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert-error">{{ master.error }}</div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="master.vendorLoading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Nama Vendor</th>
            <th style="width:110px">Tipe</th>
            <th>PIC</th>
            <th>Email</th>
            <th style="width:130px">No. Telp</th>
            <th style="width:100px">Status</th>
            <th style="width:180px">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!master.vendorList.length">
            <td colspan="7">
              <div class="empty-state">
                <div class="empty-icon">🏢</div>
                <div class="empty-title">Belum ada vendor</div>
                <div class="empty-desc">Tambahkan vendor atau ISP pertama Anda</div>
              </div>
            </td>
          </tr>
          <tr v-for="v in master.vendorList" :key="v.id_vendor" class="table-row">
            <td class="fw600">{{ v.nama_vendor }}</td>
            <td>
              <span
                class="tipe-badge"
                :style="{ background: TIPE_COLOR[v.tipe_vendor]?.bg, color: TIPE_COLOR[v.tipe_vendor]?.color }"
              >{{ v.tipe_vendor }}</span>
            </td>
            <td>{{ v.kontak_pic || '—' }}</td>
            <td class="text-gray">{{ v.email_pic || '—' }}</td>
            <td>{{ v.no_telp || '—' }}</td>
            <td>
              <span :class="v.is_aktif ? 'badge-aktif' : 'badge-nonaktif'">
                {{ v.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-edit" @click="openEdit(v)">Edit</button>
              <button
                :class="v.is_aktif ? 'btn-nonaktif' : 'btn-aktif'"
                @click="handleToggle(v)"
              >{{ v.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}</button>
              <button
                v-if="!v.is_aktif"
                class="btn-hapus"
                @click="hapusVendor(v)"
              >Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="master.vendorMeta.total_pages > 1" class="pagination">
        <button
          v-for="p in master.vendorMeta.total_pages"
          :key="p"
          :class="['page-btn', { active: p === master.vendorMeta.page }]"
          @click="goPage(p)"
        >{{ p }}</button>
      </div>
      <div class="table-footer" v-if="master.vendorMeta.total">
        Total: {{ master.vendorMeta.total }} vendor
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ isEdit ? 'Edit Vendor' : 'Tambah Vendor' }}</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Nama Vendor <span class="req">*</span></label>
            <input v-model="form.nama_vendor" placeholder="Nama vendor / ISP" />
          </div>
          <div class="field">
            <label>Tipe <span class="req">*</span></label>
            <select v-model="form.tipe_vendor">
              <option value="">Pilih tipe</option>
              <option v-for="t in TIPE_OPTIONS" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="field" v-if="isEdit">
            <label>Status</label>
            <select v-model="form.is_aktif">
              <option :value="true">Aktif</option>
              <option :value="false">Nonaktif</option>
            </select>
          </div>
          <div class="field">
            <label>Nama PIC</label>
            <input v-model="form.kontak_pic" placeholder="Nama kontak" />
          </div>
          <div class="field">
            <label>Email PIC</label>
            <input v-model="form.email_pic" type="email" placeholder="email@vendor.com" />
          </div>
          <div class="field">
            <label>No. Telp</label>
            <input v-model="form.no_telp" placeholder="08xx-xxxx" />
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="form.catatan" rows="2" placeholder="Opsional"></textarea>
          </div>
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
.page { padding: 28px 32px; max-width: 1100px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.filter-group { display: flex; align-items: center; gap: 6px; }
.filter-label { font-size: 13px; color: #64748b; font-weight: 500; white-space: nowrap; }
.input-search {
  flex: 1; min-width: 180px; padding: 9px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc;
}
.input-search:focus { border-color: #3b82f6; background: #fff; }
.select-filter { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; }
.btn-search { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

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

.tipe-badge { padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; }
.badge-aktif { background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-nonaktif { background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 12px; }

.actions { display: flex; gap: 6px; align-items: center; }
.btn-edit { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-nonaktif { padding: 5px 12px; background: #fff7ed; color: #c2410c; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-aktif { padding: 5px 12px; background: #f0fdf4; color: #15803d; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-hapus { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 0.8rem; }

.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.pagination { display: flex; gap: 6px; padding: 16px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 540px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea {
  padding: 9px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a;
}
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 4px 0 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
