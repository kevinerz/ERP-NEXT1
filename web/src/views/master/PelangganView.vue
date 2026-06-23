<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMasterStore } from '@/stores/master'

const master = useMasterStore()
const page = ref(1)
const search = ref('')

const showModal = ref(false)
const editId = ref(0)
const form = ref({ kode_pelanggan: '', nama_pelanggan: '', npwp: '', alamat_kantor: '', email_billing: '', no_telp: '', nama_pic_utama: '', no_hp_pic_utama: '' })
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
  form.value = { kode_pelanggan: '', nama_pelanggan: '', npwp: '', alamat_kantor: '', email_billing: '', no_telp: '', nama_pic_utama: '', no_hp_pic_utama: '' }
  formError.value = ''; showModal.value = true
}

function openEdit(p: any) {
  editId.value = p.id_pelanggan
  form.value = {
    kode_pelanggan: p.kode_pelanggan,
    nama_pelanggan: p.nama_pelanggan,
    npwp: p.npwp || '',
    alamat_kantor: p.alamat_kantor || '',
    email_billing: p.email_billing || '',
    no_telp: p.no_telp || '',
    nama_pic_utama: p.nama_pic_utama || '',
    no_hp_pic_utama: p.no_hp_pic_utama || '',
  }
  formError.value = ''; showModal.value = true
}

async function handleSubmit() {
  if (!form.value.kode_pelanggan || !form.value.nama_pelanggan) {
    formError.value = 'Kode dan Nama wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...form.value }
    Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k] })
    if (editId.value) {
      await master.updatePelanggan(editId.value, payload)
      flash('Pelanggan diperbarui')
    } else {
      await master.createPelanggan(payload)
      flash('Pelanggan ditambahkan')
    }
    showModal.value = false; fetchData()
    master.pelangganDropdown = [] // reset dropdown cache
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { submitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Pelanggan</h2>
        <p class="sub">Manajemen data pelanggan</p>
      </div>
      <button class="btn-primary" @click="openAdd">+ Tambah Pelanggan</button>
    </div>

    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert-error">{{ master.error }}</div>

    <div class="toolbar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama / kode..." class="search-input" />
      <button class="btn-search" @click="doSearch">Cari</button>
    </div>

    <div class="table-card">
      <div v-if="master.pelangganLoading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Kode</th>
            <th>Nama Pelanggan</th>
            <th>PIC Utama</th>
            <th>No. Telp</th>
            <th>Email Billing</th>
            <th>Site</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!master.pelangganList.length">
            <td colspan="7" class="empty">Belum ada pelanggan</td>
          </tr>
          <tr v-for="p in master.pelangganList" :key="p.id_pelanggan">
            <td class="fw700">{{ p.kode_pelanggan }}</td>
            <td>{{ p.nama_pelanggan }}</td>
            <td class="text-gray">{{ p.nama_pic_utama || '—' }}</td>
            <td class="text-gray">{{ p.no_telp || '—' }}</td>
            <td class="text-gray">{{ p.email_billing || '—' }}</td>
            <td class="center">{{ p._count?.sites ?? 0 }}</td>
            <td><button class="btn-edit-sm" @click="openEdit(p)">Edit</button></td>
          </tr>
        </tbody>
      </table>
      <div v-if="master.pelangganMeta.total_pages > 1" class="pagination">
        <button v-for="p in master.pelangganMeta.total_pages" :key="p"
          :class="['page-btn', { active: p === master.pelangganMeta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="master.pelangganMeta.total">Total: {{ master.pelangganMeta.total }} pelanggan</div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ editId ? 'Edit Pelanggan' : 'Tambah Pelanggan' }}</h3>
        <div class="form-grid">
          <div class="field">
            <label>Kode Pelanggan <span class="req">*</span></label>
            <input v-model="form.kode_pelanggan" placeholder="PLG-001" :disabled="!!editId" />
          </div>
          <div class="field">
            <label>Nama Pelanggan <span class="req">*</span></label>
            <input v-model="form.nama_pelanggan" placeholder="PT. ABC..." />
          </div>
          <div class="field">
            <label>NPWP</label>
            <input v-model="form.npwp" placeholder="00.000.000.0-000.000" />
          </div>
          <div class="field">
            <label>No. Telp Kantor</label>
            <input v-model="form.no_telp" placeholder="021-..." />
          </div>
          <div class="field full">
            <label>Alamat Kantor</label>
            <textarea v-model="form.alamat_kantor" rows="2" placeholder="Alamat lengkap kantor"></textarea>
          </div>
          <div class="field">
            <label>Email Billing</label>
            <input v-model="form.email_billing" type="email" placeholder="billing@..." />
          </div>
          <div class="field">
            <label>Nama PIC Utama</label>
            <input v-model="form.nama_pic_utama" placeholder="Nama PIC" />
          </div>
          <div class="field">
            <label>No. HP PIC</label>
            <input v-model="form.no_hp_pic_utama" placeholder="08..." />
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
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }
.toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
.search-input { flex: 1; max-width: 300px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.btn-search { padding: 9px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw700 { font-weight: 700; color: #1d4ed8; font-size: 13px; }
.text-gray { color: #64748b; }
.center { text-align: center; font-weight: 700; }
.btn-edit-sm { padding: 4px 12px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 560px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.field input:disabled { background: #f1f5f9; color: #94a3b8; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
