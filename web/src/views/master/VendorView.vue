<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { confirmDialog, alertError } from '@/composables/useDialog'
import { useMasterStore, type Vendor } from '@/stores/master'
import api from '@/services/api'
import BasePagination from '@/components/BasePagination.vue'

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
  email_pic: '', no_telp: '', alamat: '',
  bank_nama: '', bank_no_rekening: '', bank_atas_nama: '',
  catatan: '', is_aktif: true,
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
  form.value = { nama_vendor: '', tipe_vendor: '', kontak_pic: '', email_pic: '', no_telp: '', alamat: '', bank_nama: '', bank_no_rekening: '', bank_atas_nama: '', catatan: '', is_aktif: true }
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
    alamat: (v as any).alamat || '',
    bank_nama: (v as any).bank_nama || '',
    bank_no_rekening: (v as any).bank_no_rekening || '',
    bank_atas_nama: (v as any).bank_atas_nama || '',
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
      alamat: form.value.alamat || undefined,
      bank_nama: form.value.bank_nama || undefined,
      bank_no_rekening: form.value.bank_no_rekening || undefined,
      bank_atas_nama: form.value.bank_atas_nama || undefined,
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
  if (!(await confirmDialog({ title: 'Hapus Vendor?', message: 'Hapus vendor ' + vendor.nama_vendor + '?', variant: 'danger', confirmLabel: 'Ya, Hapus' }))) return
  try {
    await api.delete('/master/vendor/' + vendor.id_vendor)
    master.vendorList = master.vendorList.filter((v: Vendor) => v.id_vendor !== vendor.id_vendor)
    successMsg.value = 'Vendor dihapus'
    setTimeout(() => successMsg.value = '', 3000)
  } catch (e: any) {
    await alertError(e, 'Gagal menghapus vendor')
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
      <button type="button" class="btn btn-primary" @click="openAdd">+ Tambah Vendor</button>
    </div>

    <!-- Filter -->
    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama vendor..." class="search-input" />
      <div class="filter-group">
        <label class="filter-label">Tipe:</label>
        <select v-model="filterTipe" @change="doSearch" class="filter-select">
          <option value="">Semua Tipe</option>
          <option v-for="t in TIPE_OPTIONS" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Status:</label>
        <select v-model="filterAktif" @change="doSearch" class="filter-select">
          <option value="">Semua</option>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </div>
      <button type="button" class="btn btn-secondary" @click="doSearch">Cari</button>
    </div>

    <div v-if="successMsg" class="alert alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert alert-danger">{{ master.error }}</div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="master.vendorLoading" class="loading-state">Memuat...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Nama Vendor</th>
            <th style="width:110px">Tipe</th>
            <th>PIC</th>
            <th style="width:130px">HP / WA</th>
            <th>Rekening Bank</th>
            <th style="width:100px">Status</th>
            <th style="width:220px">Aksi</th>
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
          <tr v-for="v in master.vendorList" :key="v.id_vendor">
            <td class="fw600">{{ v.nama_vendor }}</td>
            <td>
              <span
                class="tipe-badge"
                :style="{ background: TIPE_COLOR[v.tipe_vendor]?.bg, color: TIPE_COLOR[v.tipe_vendor]?.color }"
              >{{ v.tipe_vendor }}</span>
            </td>
            <td>
              <div>{{ v.kontak_pic || '—' }}</div>
              <div class="text-gray text-sm" v-if="v.email_pic">{{ v.email_pic }}</div>
            </td>
            <td>{{ v.no_telp || '—' }}</td>
            <td>
              <template v-if="(v as any).bank_no_rekening">
                <div class="fw600">{{ (v as any).bank_nama }} · {{ (v as any).bank_no_rekening }}</div>
                <div class="text-gray text-sm">a.n. {{ (v as any).bank_atas_nama || '—' }}</div>
              </template>
              <span v-else class="text-gray">—</span>
            </td>
            <td>
              <span :class="['badge', v.is_aktif ? 'badge-green' : 'badge-red']">
                {{ v.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td>
              <div class="actions">
                <button type="button" class="btn btn-sm btn-soft-blue" @click="openEdit(v)">Edit</button>
                <button
                  type="button"
                  :class="['btn btn-sm', v.is_aktif ? 'btn-soft-warning' : 'btn-soft-success']"
                  @click="handleToggle(v)"
                >{{ v.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                <button
                  v-if="!v.is_aktif"
                  type="button"
                  class="btn btn-sm btn-soft-danger"
                  @click="hapusVendor(v)"
                >Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <BasePagination :page="page" :total-pages="master.vendorMeta.total_pages" @change="goPage" />
      <div class="table-footer" v-if="master.vendorMeta.total">
        Total: {{ Number(master.vendorMeta.total).toLocaleString('id-ID') }} vendor
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ isEdit ? 'Edit Vendor' : 'Tambah Vendor' }}</h3>
          <button type="button" class="btn-modal-close" @click="showModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group full">
              <label class="form-label form-required">Nama Vendor</label>
              <input v-model="form.nama_vendor" class="form-input" placeholder="Nama vendor / ISP" />
            </div>
            <div class="form-group">
              <label class="form-label form-required">Tipe</label>
              <select v-model="form.tipe_vendor" class="form-select">
                <option value="">Pilih tipe</option>
                <option v-for="t in TIPE_OPTIONS" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="form-group" v-if="isEdit">
              <label class="form-label">Status</label>
              <select v-model="form.is_aktif" class="form-select">
                <option :value="true">Aktif</option>
                <option :value="false">Nonaktif</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Nama PIC</label>
              <input v-model="form.kontak_pic" class="form-input" placeholder="Nama kontak" />
            </div>
            <div class="form-group">
              <label class="form-label">Email PIC</label>
              <input v-model="form.email_pic" class="form-input" type="email" placeholder="email@vendor.com" />
            </div>
            <div class="form-group">
              <label class="form-label">No. HP / WA</label>
              <input v-model="form.no_telp" class="form-input" placeholder="08xx-xxxx" />
            </div>
            <div class="form-group full">
              <label class="form-label">Alamat</label>
              <textarea v-model="form.alamat" class="form-textarea" rows="2" placeholder="Alamat lengkap vendor"></textarea>
            </div>

            <div class="full bank-divider">🏦 Rekening Bank (untuk pembayaran)</div>
            <div class="form-group">
              <label class="form-label">Bank</label>
              <input v-model="form.bank_nama" class="form-input" placeholder="BCA / Mandiri / BNI ..." />
            </div>
            <div class="form-group">
              <label class="form-label">No. Rekening</label>
              <input v-model="form.bank_no_rekening" class="form-input" placeholder="1234567890" />
            </div>
            <div class="form-group full">
              <label class="form-label">Atas Nama</label>
              <input v-model="form.bank_atas_nama" class="form-input" placeholder="Nama pemilik rekening" />
            </div>

            <div class="form-group full">
              <label class="form-label">Catatan</label>
              <textarea v-model="form.catatan" class="form-textarea" rows="2" placeholder="Opsional"></textarea>
            </div>
          </div>
          <div v-if="formError" class="alert alert-danger modal-alert">{{ formError }}</div>
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
.page { max-width: 1100px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--text-1); }
.sub { margin: 0; font-size: 13px; color: var(--text-3); }

.filter-group { display: flex; align-items: center; gap: 6px; }
.filter-label { font-size: 13px; color: var(--text-3); font-weight: 500; white-space: nowrap; }
.filter-bar .search-input { flex: 1; min-width: 180px; }

.alert { margin-bottom: 12px; }
.modal-alert { margin: 14px 0 0; }

.fw600 { font-weight: 600; color: var(--text-1); }
.text-sm { font-size: 12px; }
.bank-divider {
  font-size: 12px; font-weight: 700; color: var(--text-3);
  text-transform: uppercase; letter-spacing: 0.05em;
  border-top: 1px solid var(--border-light); padding-top: 12px; margin-top: 4px;
}
.text-gray { color: var(--text-3); }

.tipe-badge { display: inline-block; padding: 3px 10px; border-radius: var(--r-sm); font-size: 12px; font-weight: 700; white-space: nowrap; }

.actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.btn-soft-blue { background: var(--primary-light); color: var(--primary); }
.btn-soft-blue:hover { background: #dbeafe; }
.btn-soft-warning { background: #fff7ed; color: #c2410c; }
.btn-soft-warning:hover { background: #ffedd5; }
.btn-soft-success { background: var(--success-light); color: var(--success); }
.btn-soft-success:hover { background: #dcfce7; }
.btn-soft-danger { background: var(--danger-light); color: var(--danger); border: 1px solid #fecaca; }
.btn-soft-danger:hover { background: #fee2e2; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

.table-footer { padding: 10px 16px; font-size: 12px; color: var(--text-muted); text-align: right; border-top: 1px solid var(--border-light); }

/* Modal */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-group.full, .bank-divider.full { grid-column: 1 / -1; }

@media (max-width: 768px) {
  .filter-group { flex: 1 1 140px; }
  .filter-group .filter-select { flex: 1; width: 100%; }
}
</style>
