<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { confirmDialog, alertError } from '@/composables/useDialog'
import { useMasterStore, type Layanan } from '@/stores/master'
import api from '@/services/api'

const master = useMasterStore()

const search = ref('')
const filterAktif = ref('')

// Modal state
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const form = ref({ kode_layanan: '', nama_layanan: '', deskripsi: '', sla_target_pct: 95, is_managed: true, is_aktif: true })
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
  form.value = { kode_layanan: '', nama_layanan: '', deskripsi: '', sla_target_pct: 95, is_managed: true, is_aktif: true }
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
    sla_target_pct: Number(l.sla_target_pct) || 95,
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
  if (!(await confirmDialog({ title: 'Hapus Layanan?', message: 'Hapus layanan ' + layanan.nama_layanan + '?', variant: 'danger', confirmLabel: 'Ya, Hapus' }))) return
  try {
    await api.delete('/master/layanan/' + layanan.id_layanan)
    master.layananList = master.layananList.filter((l: Layanan) => l.id_layanan !== layanan.id_layanan)
    successMsg.value = 'Layanan dihapus'
    setTimeout(() => successMsg.value = '', 3000)
  } catch (e: any) {
    await alertError(e, 'Gagal menghapus layanan')
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
      <button type="button" class="btn btn-primary" @click="openAdd">+ Tambah Layanan</button>
    </div>

    <!-- Filter -->
    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari kode / nama..." class="search-input" />
      <select v-model="filterAktif" @change="doSearch" class="filter-select">
        <option value="">Semua Status</option>
        <option value="true">Aktif</option>
        <option value="false">Nonaktif</option>
      </select>
      <button type="button" class="btn btn-secondary" @click="doSearch">Cari</button>
    </div>

    <!-- Alert -->
    <div v-if="successMsg" class="alert alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert alert-danger">{{ master.error }}</div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="master.layananLoading" class="loading-state">Memuat...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th style="width:100px">Kode</th>
            <th>Nama Layanan</th>
            <th>Deskripsi</th>
            <th style="width:110px">Target SLA</th>
            <th style="width:120px">Tipe</th>
            <th style="width:110px">Status</th>
            <th style="width:220px">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!master.layananList.length">
            <td colspan="7">
              <div class="empty-state">
                <div class="empty-icon">🌐</div>
                <div class="empty-title">Belum ada layanan</div>
                <div class="empty-desc">Tambahkan layanan internet pertama Anda</div>
              </div>
            </td>
          </tr>
          <tr v-for="l in master.layananList" :key="l.id_layanan">
            <td><span class="kode-badge">{{ l.kode_layanan }}</span></td>
            <td class="fw600">{{ l.nama_layanan }}</td>
            <td class="text-gray">{{ l.deskripsi || '—' }}</td>
            <td><span class="sla-badge">{{ Number(l.sla_target_pct).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}%</span></td>
            <td>
              <span :class="['badge', l.is_managed ? 'badge-sky' : 'badge-gray']">
                {{ l.is_managed ? 'Managed' : 'Unmanaged' }}
              </span>
            </td>
            <td>
              <span :class="['badge', l.is_aktif ? 'badge-green' : 'badge-red']">
                {{ l.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td>
              <div class="actions">
                <button type="button" class="btn btn-sm btn-soft-blue" @click="openEdit(l)">Edit</button>
                <button
                  type="button"
                  :class="['btn btn-sm', l.is_aktif ? 'btn-soft-warning' : 'btn-soft-success']"
                  @click="handleToggle(l)"
                >{{ l.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                <button
                  v-if="!l.is_aktif"
                  type="button"
                  class="btn btn-sm btn-soft-danger"
                  @click="hapusLayanan(l)"
                >Hapus</button>
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
          <h3 class="modal-title">{{ isEdit ? 'Edit Layanan' : 'Tambah Layanan' }}</h3>
          <button type="button" class="btn-modal-close" @click="showModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label form-required">Kode Layanan</label>
            <input v-model="form.kode_layanan" class="form-input" :disabled="isEdit" placeholder="Contoh: FO, M2M" />
          </div>
          <div class="form-group">
            <label class="form-label form-required">Nama Layanan</label>
            <input v-model="form.nama_layanan" class="form-input" placeholder="Nama layanan" />
          </div>
          <div class="form-group">
            <label class="form-label">Deskripsi</label>
            <textarea v-model="form.deskripsi" class="form-textarea" rows="3" placeholder="Opsional"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Target SLA (%)</label>
            <input v-model.number="form.sla_target_pct" class="form-input" type="number" min="0" max="100" step="0.1" placeholder="Contoh: 95, 99, 99.5" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Managed Service?</label>
              <select v-model="form.is_managed" class="form-select">
                <option :value="true">Ya (Managed)</option>
                <option :value="false">Tidak (Unmanaged)</option>
              </select>
            </div>
            <div class="form-group" v-if="isEdit">
              <label class="form-label">Status</label>
              <select v-model="form.is_aktif" class="form-select">
                <option :value="true">Aktif</option>
                <option :value="false">Nonaktif</option>
              </select>
            </div>
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

.filter-bar .search-input { flex: 1; min-width: 200px; }

.alert { margin-bottom: 12px; }
.modal-body .alert { margin-bottom: 0; }
.modal-body { display: flex; flex-direction: column; gap: 14px; }
.form-input:disabled { opacity: 0.6; cursor: not-allowed; background: var(--border-light); }

.fw600 { font-weight: 600; color: var(--text-1); }
.text-gray { color: var(--text-3); }

.kode-badge { display: inline-block; background: var(--primary-light); color: var(--primary); padding: 3px 8px; border-radius: var(--r-sm); font-size: 12px; font-weight: 700; white-space: nowrap; }
.sla-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 700; background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary-border); white-space: nowrap; font-variant-numeric: tabular-nums; }

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
</style>
