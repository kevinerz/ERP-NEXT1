<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/master'

const router = useRouter()
const master = useMasterStore()
const page = ref(1)
const search = ref('')
const filterPelanggan = ref(0)

const showModal = ref(false)
const editId = ref(0)
const form = ref({
  id_pelanggan: 0, id_layanan: 0, kode_site: '', nama_site: '',
  alamat_lengkap: '', kota: '', provinsi: '', koordinat_gps: '',
  status_site: 'Aktif', tgl_aktif: '', catatan: '',
})
const submitting = ref(false)
const formError = ref('')
const successMsg = ref('')

const STATUS_SITE = ['Prospek', 'Aktif', 'Terminasi', 'Suspend']

onMounted(async () => {
  await Promise.all([master.fetchPelangganDropdown(), master.fetchLayanan()])
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (search.value) params.search = search.value
  if (filterPelanggan.value) params.id_pelanggan = filterPelanggan.value
  master.fetchSite(params)
}
function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function openAdd() {
  editId.value = 0
  form.value = { id_pelanggan: filterPelanggan.value || 0, id_layanan: 0, kode_site: '', nama_site: '', alamat_lengkap: '', kota: '', provinsi: '', koordinat_gps: '', status_site: 'Aktif', tgl_aktif: '', catatan: '' }
  formError.value = ''; showModal.value = true
}

function openEdit(s: any) {
  editId.value = s.id_site
  form.value = {
    id_pelanggan: s.id_pelanggan,
    id_layanan: s.id_layanan,
    kode_site: s.kode_site,
    nama_site: s.nama_site,
    alamat_lengkap: s.alamat_lengkap,
    kota: s.kota || '',
    provinsi: s.provinsi || '',
    koordinat_gps: s.koordinat_gps || '',
    status_site: s.status_site,
    tgl_aktif: s.tgl_aktif ? s.tgl_aktif.substring(0, 10) : '',
    catatan: s.catatan || '',
  }
  formError.value = ''; showModal.value = true
}

async function handleSubmit() {
  if (!form.value.id_pelanggan || !form.value.id_layanan || !form.value.kode_site || !form.value.nama_site || !form.value.alamat_lengkap) {
    formError.value = 'Pelanggan, Layanan, Kode, Nama, dan Alamat wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...form.value }
    Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] === 0) delete payload[k] })
    if (editId.value) {
      delete payload.id_pelanggan; delete payload.kode_site; delete payload.id_layanan
      await master.updateSite(editId.value, { ...form.value, id_layanan: form.value.id_layanan || undefined })
    } else {
      await master.createSite(payload)
    }
    showModal.value = false
    flash(editId.value ? 'Site diperbarui' : 'Site ditambahkan')
    fetchData()
    // Refresh proyek site cache
    const { useProyekStore } = await import('@/stores/proyek')
    useProyekStore().siteList = []
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { submitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }
function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Aktif: { bg: '#f0fdf4', color: '#15803d' },
  Prospek: { bg: '#eff6ff', color: '#1d4ed8' },
  Terminasi: { bg: '#fef2f2', color: '#dc2626' },
  Suspend: { bg: '#fef9c3', color: '#a16207' },
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Site Pelanggan</h2>
        <p class="sub">Lokasi instalasi layanan</p>
      </div>
      <button class="btn-primary" @click="openAdd">+ Tambah Site</button>
    </div>

    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert-error">{{ master.error }}</div>

    <div class="toolbar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari site / kode..." class="search-input" />
      <select v-model="filterPelanggan" @change="doSearch" class="filter-select">
        <option :value="0">Semua Pelanggan</option>
        <option v-for="p in master.pelangganDropdown" :key="p.id_pelanggan" :value="p.id_pelanggan">
          {{ p.nama_pelanggan }}
        </option>
      </select>
      <button class="btn-search" @click="doSearch">Cari</button>
    </div>

    <div class="table-card">
      <div v-if="master.siteLoading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Kode Site</th>
            <th>Nama Site</th>
            <th>Pelanggan</th>
            <th>Layanan</th>
            <th>Kota</th>
            <th>Status</th>
            <th>Tgl Aktif</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!master.siteList.length">
            <td colspan="8" class="empty">Belum ada site</td>
          </tr>
          <tr v-for="s in master.siteList" :key="s.id_site">
            <td class="fw700">{{ s.kode_site }}</td>
            <td>{{ s.nama_site }}</td>
            <td class="text-gray">{{ s.pelanggan?.nama_pelanggan }}</td>
            <td class="text-gray">{{ s.layanan?.kode_layanan }}</td>
            <td class="text-gray">{{ s.kota || '—' }}</td>
            <td>
              <span class="status-badge"
                :style="{ background: STATUS_COLOR[s.status_site]?.bg, color: STATUS_COLOR[s.status_site]?.color }">
                {{ s.status_site }}
              </span>
            </td>
            <td class="text-gray text-sm">{{ fmtDate(s.tgl_aktif) }}</td>
            <td>
              <div class="row-actions">
                <button class="btn-detail-sm" @click="router.push('/master/site/' + s.id_site)">Detail</button>
                <button class="btn-edit-sm" @click="openEdit(s)">Edit</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="master.siteMeta.total_pages > 1" class="pagination">
        <button v-for="p in master.siteMeta.total_pages" :key="p"
          :class="['page-btn', { active: p === master.siteMeta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="master.siteMeta.total">Total: {{ master.siteMeta.total }} site</div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ editId ? 'Edit Site' : 'Tambah Site' }}</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Pelanggan <span class="req">*</span></label>
            <select v-model="form.id_pelanggan" :disabled="!!editId">
              <option :value="0">— Pilih Pelanggan —</option>
              <option v-for="p in master.pelangganDropdown" :key="p.id_pelanggan" :value="p.id_pelanggan">
                [{{ p.kode_pelanggan }}] {{ p.nama_pelanggan }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Layanan <span class="req">*</span></label>
            <select v-model="form.id_layanan">
              <option :value="0">— Pilih Layanan —</option>
              <option v-for="l in master.layananList" :key="l.id_layanan" :value="l.id_layanan">
                [{{ l.kode_layanan }}] {{ l.nama_layanan }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Kode Site <span class="req">*</span></label>
            <input v-model="form.kode_site" placeholder="SITE-001" :disabled="!!editId" />
          </div>
          <div class="field full">
            <label>Nama Site <span class="req">*</span></label>
            <input v-model="form.nama_site" placeholder="Kantor Pusat / Gedung A..." />
          </div>
          <div class="field full">
            <label>Alamat Lengkap <span class="req">*</span></label>
            <textarea v-model="form.alamat_lengkap" rows="2" placeholder="Jl. ..."></textarea>
          </div>
          <div class="field">
            <label>Kota</label>
            <input v-model="form.kota" placeholder="Jakarta" />
          </div>
          <div class="field">
            <label>Provinsi</label>
            <input v-model="form.provinsi" placeholder="DKI Jakarta" />
          </div>
          <div class="field">
            <label>Koordinat GPS</label>
            <input v-model="form.koordinat_gps" placeholder="-6.123456, 106.123456" />
          </div>
          <div class="field">
            <label>Status Site</label>
            <select v-model="form.status_site">
              <option v-for="s in STATUS_SITE" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="field">
            <label>Tgl Aktif</label>
            <input v-model="form.tgl_aktif" type="date" />
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="form.catatan" rows="2"></textarea>
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
.toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input { flex: 1; max-width: 260px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.filter-select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
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
.text-sm { font-size: 12px; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.row-actions { display: flex; gap: 4px; }
.btn-edit-sm { padding: 4px 12px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-detail-sm { padding: 4px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 580px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.field input:disabled, .field select:disabled { background: #f1f5f9; color: #94a3b8; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
