<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMasterStore } from '@/stores/master'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import api from '@/services/api'
import BasePagination from '@/components/BasePagination.vue'

const master = useMasterStore()
const page = ref(1)
const search = ref('')

const showModal = ref(false)
const editId = ref(0)

function emptyForm() {
  return {
    kode_pelanggan: '',
    nama_pelanggan: '',
    jenis_usaha: '',
    alamat_kantor: '',
    kota: '',
    no_telp: '',
    npwp: '',
    nama_pemilik: '',
    jabatan_pemilik: '',
    no_ktp_pemilik: '',
    no_ponsel_pemilik: '',
    // PJ Teknis
    nama_pic_teknis: '',
    jabatan_pic_teknis: '',
    no_telp_pic_teknis: '',
    no_ponsel_pic_teknis: '',
    email_pic_teknis: '',
    // PJ Keuangan
    nama_pic_keuangan: '',
    jabatan_pic_keuangan: '',
    no_telp_pic_keuangan: '',
    no_ponsel_pic_keuangan: '',
    email_pic_keuangan: '',
    alamat_penagihan: '',
    email_billing: '',
    nama_pic_utama: '',
    no_hp_pic_utama: '',
  }
}

const form = ref(emptyForm())
const submitting = ref(false)
const formError = ref('')
const successMsg = ref('')

onMounted(() => fetchData())

function fetchData() {
  const params: any = { page: page.value }
  if (search.value) params.search = search.value
  master.fetchPelanggan(params)
}
function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function openAdd() {
  editId.value = 0
  form.value = emptyForm()
  formError.value = ''
  showModal.value = true
}

function openEdit(p: any) {
  editId.value = p.id_pelanggan
  form.value = {
    kode_pelanggan: p.kode_pelanggan || '',
    nama_pelanggan: p.nama_pelanggan || '',
    jenis_usaha: p.jenis_usaha || '',
    alamat_kantor: p.alamat_kantor || '',
    kota: p.kota || '',
    no_telp: p.no_telp || '',
    npwp: p.npwp || '',
    nama_pemilik: p.nama_pemilik || '',
    jabatan_pemilik: p.jabatan_pemilik || '',
    no_ktp_pemilik: p.no_ktp_pemilik || '',
    no_ponsel_pemilik: p.no_ponsel_pemilik || '',
    nama_pic_teknis: p.nama_pic_teknis || '',
    jabatan_pic_teknis: p.jabatan_pic_teknis || '',
    no_telp_pic_teknis: p.no_telp_pic_teknis || '',
    no_ponsel_pic_teknis: p.no_ponsel_pic_teknis || '',
    email_pic_teknis: p.email_pic_teknis || '',
    nama_pic_keuangan: p.nama_pic_keuangan || '',
    jabatan_pic_keuangan: p.jabatan_pic_keuangan || '',
    no_telp_pic_keuangan: p.no_telp_pic_keuangan || '',
    no_ponsel_pic_keuangan: p.no_ponsel_pic_keuangan || '',
    email_pic_keuangan: p.email_pic_keuangan || '',
    alamat_penagihan: p.alamat_penagihan || '',
    email_billing: p.email_billing || '',
    nama_pic_utama: p.nama_pic_utama || '',
    no_hp_pic_utama: p.no_hp_pic_utama || '',
  }
  formError.value = ''
  showModal.value = true
}

async function handleSubmit() {
  if (!form.value.kode_pelanggan || !form.value.nama_pelanggan) {
    formError.value = 'Kode dan Nama Perusahaan wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const payload: any = { ...form.value }
    Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k] })
    if (editId.value) {
      await master.updatePelanggan(editId.value, payload)
      flash('Data pelanggan diperbarui')
    } else {
      await master.createPelanggan(payload)
      flash('Pelanggan berhasil ditambahkan')
    }
    showModal.value = false
    fetchData()
    master.pelangganDropdown = []
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Gagal menyimpan'
  } finally {
    submitting.value = false
  }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3500) }

const confirmHapus = ref(false)
const hapusTarget = ref<{ id: number; nama: string } | null>(null)
const hapusError = ref('')

function hapusPelanggan(id: number, nama: string) {
  hapusTarget.value = { id, nama }
  hapusError.value = ''
  confirmHapus.value = true
}

async function doHapusPelanggan() {
  if (!hapusTarget.value) return
  try {
    await api.delete(`/master/pelanggan/${hapusTarget.value.id}`)
    confirmHapus.value = false
    flash('Pelanggan dihapus')
    fetchData()
  } catch (e: any) {
    hapusError.value = e.response?.data?.message || 'Gagal menghapus pelanggan'
    confirmHapus.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Pelanggan</h2>
        <p class="sub">Manajemen data perusahaan pelanggan</p>
      </div>
      <button class="btn btn-primary" @click="openAdd">+ Tambah Pelanggan</button>
    </div>

    <div v-if="successMsg" class="alert alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert alert-danger">{{ master.error }}</div>
    <div v-if="hapusError" class="alert alert-danger">{{ hapusError }}</div>

    <div class="toolbar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama / kode..." class="search-input" />
      <button class="btn btn-secondary" @click="doSearch">Cari</button>
    </div>

    <div class="table-card">
      <div v-if="master.pelangganLoading" class="loading-state">Memuat data...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Kode</th>
            <th>Nama Perusahaan</th>
            <th>Kota</th>
            <th>Jenis Usaha</th>
            <th>PJ Teknis</th>
            <th>PJ Keuangan</th>
            <th>Site</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!master.pelangganList.length">
            <td colspan="8" class="empty">Belum ada pelanggan</td>
          </tr>
          <tr v-for="p in master.pelangganList" :key="p.id_pelanggan">
            <td class="kode-cell">{{ p.kode_pelanggan }}</td>
            <td>
              <div class="nama-perusahaan">{{ p.nama_pelanggan }}</div>
              <div v-if="p.npwp" class="meta-text">NPWP: {{ p.npwp }}</div>
            </td>
            <td class="text-muted">{{ p.kota || '—' }}</td>
            <td class="text-muted">{{ p.jenis_usaha || '—' }}</td>
            <td class="text-muted">{{ p.nama_pic_teknis || p.nama_pic_utama || '—' }}</td>
            <td class="text-muted">{{ p.nama_pic_keuangan || '—' }}</td>
            <td class="center-cell">{{ p._count?.sites ?? 0 }}</td>
            <td>
              <div class="action-btns">
                <button class="btn-edit-sm" @click="openEdit(p)">Edit</button>
                <button class="btn-hapus" @click="hapusPelanggan(p.id_pelanggan, p.nama_pelanggan)">Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <BasePagination :page="page" :total-pages="master.pelangganMeta.total_pages" @change="goPage" />
      <div class="table-footer" v-if="master.pelangganMeta.total">
        Total: {{ master.pelangganMeta.total }} pelanggan
      </div>
    </div>

    <ConfirmDialog
      v-model="confirmHapus"
      title="Hapus Pelanggan?"
      :message="`Pelanggan &quot;${hapusTarget?.nama}&quot; akan dihapus permanen.`"
      confirm-label="Ya, Hapus"
      variant="danger"
      @confirm="doHapusPelanggan"
      @cancel="confirmHapus = false"
    />

    <!-- Modal Form -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>{{ editId ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru' }}</h3>
          <button class="modal-close" @click="showModal = false">✕</button>
        </div>

        <!-- SEKSI 1: INFORMASI PERUSAHAAN -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-num">1</span>
            Informasi Perusahaan
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Kode Pelanggan <span class="req">*</span></label>
              <input v-model="form.kode_pelanggan" placeholder="PLG-001" :disabled="!!editId" />
            </div>
            <div class="field">
              <label>Nama Perusahaan <span class="req">*</span></label>
              <input v-model="form.nama_pelanggan" placeholder="PT. ABC Indonesia" />
            </div>
            <div class="field">
              <label>Jenis Usaha</label>
              <input v-model="form.jenis_usaha" placeholder="ISP / Distributor / dll" />
            </div>
            <div class="field">
              <label>Kota</label>
              <input v-model="form.kota" placeholder="Jakarta" />
            </div>
            <div class="field full">
              <label>Alamat Kantor Pusat</label>
              <textarea v-model="form.alamat_kantor" rows="2" placeholder="Jl. Sudirman No. 1..."></textarea>
            </div>
            <div class="field">
              <label>Telepon / Fax Kantor</label>
              <input v-model="form.no_telp" placeholder="021-..." />
            </div>
            <div class="field">
              <label>No. NPWP</label>
              <input v-model="form.npwp" placeholder="00.000.000.0-000.000" />
            </div>
            <div class="field">
              <label>Nama Pemilik Perusahaan</label>
              <input v-model="form.nama_pemilik" placeholder="Nama lengkap pemilik" />
            </div>
            <div class="field">
              <label>Jabatan Pemilik</label>
              <input v-model="form.jabatan_pemilik" placeholder="Direktur Utama" />
            </div>
            <div class="field">
              <label>No. Kartu Identitas (KTP)</label>
              <input v-model="form.no_ktp_pemilik" placeholder="3271..." />
            </div>
            <div class="field">
              <label>No. Ponsel Pemilik</label>
              <input v-model="form.no_ponsel_pemilik" placeholder="08..." />
            </div>
          </div>
        </div>

        <!-- SEKSI 2: PENANGGUNG JAWAB TEKNIS -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-num">2</span>
            Penanggung Jawab Teknis
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Nama</label>
              <input v-model="form.nama_pic_teknis" placeholder="Nama PJ Teknis" />
            </div>
            <div class="field">
              <label>Jabatan</label>
              <input v-model="form.jabatan_pic_teknis" placeholder="Network Engineer" />
            </div>
            <div class="field">
              <label>Telepon / Fax</label>
              <input v-model="form.no_telp_pic_teknis" placeholder="021-..." />
            </div>
            <div class="field">
              <label>No. Ponsel</label>
              <input v-model="form.no_ponsel_pic_teknis" placeholder="08..." />
            </div>
            <div class="field">
              <label>Email</label>
              <input v-model="form.email_pic_teknis" type="email" placeholder="teknis@perusahaan.com" />
            </div>
          </div>
        </div>

        <!-- SEKSI 3: PENANGGUNG JAWAB KEUANGAN -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-num">3</span>
            Penanggung Jawab Keuangan
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Nama</label>
              <input v-model="form.nama_pic_keuangan" placeholder="Nama PJ Keuangan" />
            </div>
            <div class="field">
              <label>Jabatan</label>
              <input v-model="form.jabatan_pic_keuangan" placeholder="Finance Manager" />
            </div>
            <div class="field">
              <label>Telepon / Fax</label>
              <input v-model="form.no_telp_pic_keuangan" placeholder="021-..." />
            </div>
            <div class="field">
              <label>No. Ponsel</label>
              <input v-model="form.no_ponsel_pic_keuangan" placeholder="08..." />
            </div>
            <div class="field">
              <label>Email Billing</label>
              <input v-model="form.email_pic_keuangan" type="email" placeholder="billing@perusahaan.com" />
            </div>
            <div class="field full">
              <label>Alamat Penagihan</label>
              <textarea v-model="form.alamat_penagihan" rows="2" placeholder="Alamat pengiriman invoice / tagihan"></textarea>
            </div>
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal = false">Batal</button>
          <button class="btn btn-primary" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan Data' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; font-weight: 700; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

.toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
.search-input { flex: 1; max-width: 320px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table thead tr { background: #f8fafc; }
.data-table th { padding: 11px 13px; font-size: 11.5px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.04em; }
.data-table td { padding: 12px 13px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 48px; }
.loading-state { padding: 48px; text-align: center; color: #94a3b8; }

.kode-cell { font-weight: 700; color: #1d4ed8; font-size: 13px; white-space: nowrap; }
.nama-perusahaan { font-weight: 600; }
.meta-text { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.text-muted { color: #64748b; }
.center-cell { text-align: center; font-weight: 700; }

.btn-edit-sm { padding: 4px 12px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #334155; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.action-btns { display: flex; gap: 6px; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: flex-start; justify-content: center; z-index: 100; padding: 24px 16px; overflow-y: auto; }
.modal { background: #fff; border-radius: 14px; width: 680px; max-width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 22px 28px 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; }
.modal-close { background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.modal-close:hover { background: #f1f5f9; color: #475569; }

/* Form sections */
.form-section { padding: 20px 28px; border-top: 1px solid #f1f5f9; }
.form-section:first-of-type { border-top: none; padding-top: 18px; }
.section-title { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
.section-num { width: 22px; height: 22px; background: #1d4ed8; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 12.5px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field textarea, .field select {
  padding: 8px 11px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 13.5px; outline: none; background: #f8fafc; color: #0f172a;
  font-family: inherit;
}
.field input:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.field input:disabled { background: #f1f5f9; color: #94a3b8; cursor: not-allowed; }

.form-error { margin: 4px 28px 0; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 18px 28px; border-top: 1px solid #f1f5f9; }

/* Buttons */
.btn { padding: 9px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.btn-primary { background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; }
.btn-secondary { background: #f1f5f9; color: #475569; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* Alerts */
.alert { border-radius: 8px; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }
.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
.alert-danger { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }

@media (max-width: 768px) {
  .page { padding: 16px !important; }
  .modal { border-radius: 14px 14px 0 0; }
  .form-grid { grid-template-columns: 1fr !important; }
  .field.full { grid-column: 1; }
}
@media (max-width: 600px) {
  .col-hide-sm { display: none; }
}
</style>
