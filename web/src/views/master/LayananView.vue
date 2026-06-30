<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMasterStore, type Layanan } from '@/stores/master'
import api from '@/services/api'

const master = useMasterStore()

const search = ref('')
const filterAktif = ref('')

// Modal state
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const form = ref({ kode_layanan: '', nama_layanan: '', deskripsi: '', is_managed: true, is_aktif: true })
const submitting = ref(false)
const formError = ref('')
const successMsg = ref('')

onMounted(() => master.fetchLayanan())

function doSearch() {
  const params: any = {}
  if (search.value) params.search = search.value
  if (filterAktif.value !== '') params.is_aktif = filterAktif.value
  master.fetchLayanan(params)
}

function openAdd() {
  isEdit.value = false
  editId.value = null
  form.value = { kode_layanan: '', nama_layanan: '', deskripsi: '', is_managed: true, is_aktif: true }
  formError.value = ''
  showModal.value = true
}

function openEdit(l: Layanan) {
  isEdit.value = true
  editId.value = l.id_layanan
  form.value = {
    kode_layanan: l.kode_layanan,
    nama_layanan: l.nama_layanan,
    deskripsi: l.deskripsi || '',
    is_managed: l.is_managed,
    is_aktif: l.is_aktif,
  }
  formError.value = ''
  showModal.value = true
}

async function handleSubmit() {
  if (!form.value.kode_layanan || !form.value.nama_layanan) {
    formError.value = 'Kode dan Nama wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    if (isEdit.value && editId.value) {
      const { kode_layanan, ...payload } = form.value
      await master.updateLayanan(editId.value, payload)
    } else {
      await master.createLayanan(form.value)
    }
    showModal.value = false
    successMsg.value = isEdit.value ? 'Layanan diperbarui' : 'Layanan ditambahkan'
    setTimeout(() => successMsg.value = '', 3000)
    doSearch()
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Terjadi kesalahan'
  } finally {
    submitting.value = false
  }
}

async function handleToggle(l: Layanan) {
  try {
    await master.toggleLayanan(l.id_layanan)
    successMsg.value = `Layanan ${!l.is_aktif ? 'diaktifkan' : 'dinonaktifkan'}`
    setTimeout(() => successMsg.value = '', 3000)
  } catch (e: any) {
    master.error = e.response?.data?.message || 'Gagal ubah status'
  }
}

async function hapusLayanan(layanan: Layanan) {
  if (!confirm('Hapus layanan ' + layanan.nama_layanan + '?')) return
  try {
    await api.delete('/master/layanan/' + layanan.id_layanan)
    master.layananList = master.layananList.filter((l: Layanan) => l.id_layanan !== layanan.id_layanan)
    successMsg.value = 'Layanan dihapus'
    setTimeout(() => successMsg.value = '', 3000)
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal menghapus layanan')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Layanan</h2>
        <p class="sub">Daftar layanan internet yang dikelola</p>
      </div>
      <button class="btn-primary" @click="openAdd">+ Tambah Layanan</button>
    </div>

    <!-- Filter -->
    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari kode / nama..." class="input-search" />
      <select v-model="filterAktif" @change="doSearch" class="select-filter">
        <option value="">Semua Status</option>
        <option value="true">Aktif</option>
        <option value="false">Nonaktif</option>
      </select>
      <button class="btn-search" @click="doSearch">Cari</button>
    </div>

    <!-- Alert -->
    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert-error">{{ master.error }}</div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="master.layananLoading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th style="width:100px">Kode</th>
            <th>Nama Layanan</th>
            <th>Deskripsi</th>
            <th style="width:120px">Tipe</th>
            <th style="width:110px">Status</th>
            <th style="width:180px">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!master.layananList.length">
            <td colspan="6">
              <div class="empty-state">
                <div class="empty-icon">🌐</div>
                <div class="empty-title">Belum ada layanan</div>
                <div class="empty-desc">Tambahkan layanan internet pertama Anda</div>
              </div>
            </td>
          </tr>
          <tr v-for="l in master.layananList" :key="l.id_layanan" class="table-row">
            <td><span class="kode-badge">{{ l.kode_layanan }}</span></td>
            <td class="fw600">{{ l.nama_layanan }}</td>
            <td class="text-gray">{{ l.deskripsi || '—' }}</td>
            <td>
              <span :class="l.is_managed ? 'badge-managed' : 'badge-unmanaged'">
                {{ l.is_managed ? 'Managed' : 'Unmanaged' }}
              </span>
            </td>
            <td>
              <span :class="l.is_aktif ? 'badge-aktif' : 'badge-nonaktif'">
                {{ l.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-edit" @click="openEdit(l)">Edit</button>
              <button
                :class="l.is_aktif ? 'btn-nonaktif' : 'btn-aktif'"
                @click="handleToggle(l)"
              >{{ l.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}</button>
              <button
                v-if="!l.is_aktif"
                class="btn-hapus"
                @click="hapusLayanan(l)"
              >Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ isEdit ? 'Edit Layanan' : 'Tambah Layanan' }}</h3>
        <div class="field">
          <label>Kode Layanan <span class="req">*</span></label>
          <input v-model="form.kode_layanan" :disabled="isEdit" placeholder="Contoh: FO, M2M" />
        </div>
        <div class="field">
          <label>Nama Layanan <span class="req">*</span></label>
          <input v-model="form.nama_layanan" placeholder="Nama layanan" />
        </div>
        <div class="field">
          <label>Deskripsi</label>
          <textarea v-model="form.deskripsi" rows="3" placeholder="Opsional"></textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Managed Service?</label>
            <select v-model="form.is_managed">
              <option :value="true">Ya (Managed)</option>
              <option :value="false">Tidak (Unmanaged)</option>
            </select>
          </div>
          <div class="field" v-if="isEdit">
            <label>Status</label>
            <select v-model="form.is_aktif">
              <option :value="true">Aktif</option>
              <option :value="false">Nonaktif</option>
            </select>
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
.page { padding: 28px 32px; max-width: 960px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; }
.input-search {
  flex: 1; padding: 9px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc;
}
.input-search:focus { border-color: #3b82f6; background: #fff; }
.select-filter {
  padding: 9px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc;
}
.btn-search {
  padding: 9px 18px; background: #f1f5f9; border: none;
  border-radius: 8px; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer;
}

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

.kode-badge { background: #eff6ff; color: #1d4ed8; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }
.badge-managed { background: #f0f9ff; color: #0369a1; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; border: 1px solid #bae6fd; }
.badge-unmanaged { background: #f8fafc; color: #64748b; padding: 3px 10px; border-radius: 12px; font-size: 12px; border: 1px solid #e2e8f0; }
.badge-aktif { background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-nonaktif { background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 12px; }

.actions { display: flex; gap: 6px; align-items: center; }
.btn-edit { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-nonaktif { padding: 5px 12px; background: #fff7ed; color: #c2410c; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-aktif { padding: 5px 12px; background: #f0fdf4; color: #15803d; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
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
.field input:disabled { opacity: 0.6; cursor: not-allowed; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-error {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  color: #dc2626; font-size: 13px; padding: 8px 12px; margin-bottom: 12px;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
