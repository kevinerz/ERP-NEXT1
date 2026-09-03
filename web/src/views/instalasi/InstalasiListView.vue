<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useInstalasiStore } from '@/stores/instalasi'
import { useProyekStore } from '@/stores/proyek'
import { fmtDateTime as fmtDt } from '@/composables/useFormat'
import api from '@/services/api'

const router = useRouter()
const ins = useInstalasiStore()
const proyek = useProyekStore()

const page = ref(1)
const filterStatus = ref('')
const filterJenis = ref('')
const search = ref('')

const showModal = ref(false)
const submitting = ref(false)
const formError = ref('')
const form = ref({
  id_site: 0,
  id_layanan: 0,
  jenis_pelaksana: 'Internal',
  id_teknisi_internal: 0,
  id_kontak_teknisi: 0,
  tgl_jadwal: '',
  catatan: '',
})

const layananList = ref<any[]>([])
const teknisiList = ref<any[]>([])
const kontakTeknisiList = ref<any[]>([])

const STATUS_LIST = ['Draft', 'Dijadwalkan', 'Dalam_Proses', 'Selesai', 'Dibatalkan']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Draft:        { bg: '#f1f5f9', color: '#64748b' },
  Dijadwalkan:  { bg: '#eff6ff', color: '#1d4ed8' },
  Dalam_Proses: { bg: '#fef9c3', color: '#a16207' },
  Selesai:      { bg: '#f0fdf4', color: '#15803d' },
  Dibatalkan:   { bg: '#fef2f2', color: '#dc2626' },
}
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft', Dijadwalkan: 'Dijadwalkan', Dalam_Proses: 'Dalam Proses', Selesai: 'Selesai', Dibatalkan: 'Dibatalkan',
}

onMounted(async () => {
  await Promise.all([
    proyek.fetchSiteList(),
    api.get('/master/layanan').then(r => { layananList.value = r.data.data ?? [] }),
    api.get('/operations/teknisi-list').then(r => { teknisiList.value = r.data.data ?? [] }),
    api.get('/master/kontak-teknisi', { params: { limit: 200 } }).then(r => { kontakTeknisiList.value = r.data.data ?? [] }),
  ])
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (filterStatus.value) params.status_instalasi = filterStatus.value
  if (filterJenis.value) params.jenis_pelaksana = filterJenis.value
  if (search.value) params.search = search.value
  ins.fetchList(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function openModal() {
  form.value = { id_site: 0, id_layanan: 0, jenis_pelaksana: 'Internal', id_teknisi_internal: 0, id_kontak_teknisi: 0, tgl_jadwal: '', catatan: '' }
  formError.value = ''
  showModal.value = true
}

async function handleSubmit() {
  if (!form.value.id_site) { formError.value = 'Site wajib dipilih'; return }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { id_site: form.value.id_site, jenis_pelaksana: form.value.jenis_pelaksana }
    if (form.value.id_layanan) payload.id_layanan = form.value.id_layanan
    if (form.value.tgl_jadwal) payload.tgl_jadwal = form.value.tgl_jadwal
    if (form.value.catatan) payload.catatan = form.value.catatan
    if (form.value.jenis_pelaksana === 'Internal' && form.value.id_teknisi_internal)
      payload.id_teknisi_internal = form.value.id_teknisi_internal
    if (form.value.jenis_pelaksana === 'Vendor' && form.value.id_kontak_teknisi)
      payload.id_kontak_teknisi = form.value.id_kontak_teknisi
    const result = await ins.create(payload)
    showModal.value = false
    router.push(`/instalasi/${result.id_instalasi}`)
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal membuat order' }
  finally { submitting.value = false }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Instalasi</h2>
        <p class="sub">Manajemen order pemasangan layanan</p>
      </div>
      <button class="btn-primary" @click="openModal">+ Buat Order</button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input v-model="search" @keyup.enter="doFilter" placeholder="Cari nomor / site / pelanggan..." class="search-input" />
      <select v-model="filterStatus" @change="doFilter" class="filter-select">
        <option value="">Semua Status</option>
        <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
      </select>
      <select v-model="filterJenis" @change="doFilter" class="filter-select">
        <option value="">Semua Pelaksana</option>
        <option value="Internal">Internal</option>
        <option value="Vendor">Vendor</option>
      </select>
      <button class="btn-search" @click="doFilter">Cari</button>
    </div>

    <div v-if="ins.error" class="alert-error">{{ ins.error }}</div>

    <div class="table-card">
      <div v-if="ins.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Nomor</th>
            <th>Site / Pelanggan</th>
            <th>Layanan</th>
            <th>Pelaksana</th>
            <th>Jadwal</th>
            <th>Status</th>
            <th>Foto</th>
            <th>Dibuat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!ins.list.length">
            <td colspan="8" class="empty">Belum ada order instalasi</td>
          </tr>
          <tr v-for="item in ins.list" :key="item.id_instalasi" class="row-link"
              @click="router.push(`/instalasi/${item.id_instalasi}`)">
            <td class="fw700">{{ item.nomor_instalasi }}</td>
            <td>
              <div class="fw600">{{ item.site?.nama_site }}</div>
              <div class="text-gray text-sm">{{ item.site?.pelanggan?.nama_pelanggan }}</div>
            </td>
            <td class="text-gray text-sm">{{ item.layanan?.nama_layanan || '—' }}</td>
            <td>
              <span :class="['jenis-badge', item.jenis_pelaksana === 'Vendor' ? 'vendor' : 'internal']">
                {{ item.jenis_pelaksana }}
              </span>
              <div class="text-gray text-sm" style="margin-top:2px">
                {{ item.jenis_pelaksana === 'Vendor'
                  ? (item.kontak_teknisi?.nama || '—')
                  : (item.teknisi_internal?.nama_lengkap || '—') }}
              </div>
            </td>
            <td class="text-gray text-sm">{{ item.tgl_jadwal ? item.tgl_jadwal.slice(0,10) : '—' }}</td>
            <td>
              <span class="status-badge"
                :style="{ background: STATUS_COLOR[item.status_instalasi]?.bg, color: STATUS_COLOR[item.status_instalasi]?.color }">
                {{ STATUS_LABEL[item.status_instalasi] || item.status_instalasi }}
              </span>
            </td>
            <td class="center text-gray">{{ item._count?.photos ?? 0 }}</td>
            <td class="text-gray text-sm">{{ fmtDt(item.created_at) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="ins.meta.total_pages > 1" class="pagination">
        <button v-for="p in ins.meta.total_pages" :key="p"
          :class="['page-btn', { active: p === ins.meta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="ins.meta.total">Total: {{ ins.meta.total }} order</div>
    </div>

    <!-- Modal Buat Order -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Buat Order Instalasi</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Site <span class="req">*</span></label>
            <select v-model="form.id_site">
              <option :value="0">— Pilih Site —</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">
                [{{ s.kode_site }}] {{ s.nama_site }} — {{ s.pelanggan?.nama_pelanggan }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Layanan</label>
            <select v-model="form.id_layanan">
              <option :value="0">— Pilih Layanan —</option>
              <option v-for="l in layananList" :key="l.id_layanan" :value="l.id_layanan">{{ l.nama_layanan }}</option>
            </select>
          </div>
          <div class="field">
            <label>Jenis Pelaksana</label>
            <select v-model="form.jenis_pelaksana">
              <option value="Internal">Internal</option>
              <option value="Vendor">Vendor Pihak 3</option>
            </select>
          </div>
          <div class="field">
            <label>Jadwal</label>
            <input type="date" v-model="form.tgl_jadwal" />
          </div>
          <div v-if="form.jenis_pelaksana === 'Internal'" class="field full">
            <label>Teknisi Internal</label>
            <select v-model="form.id_teknisi_internal">
              <option :value="0">— Belum di-assign —</option>
              <option v-for="t in teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
            </select>
          </div>
          <div v-if="form.jenis_pelaksana === 'Vendor'" class="field full">
            <label>Kontak Teknisi Vendor</label>
            <select v-model="form.id_kontak_teknisi">
              <option :value="0">— Belum di-assign —</option>
              <option v-for="k in kontakTeknisiList" :key="k.id_kontak" :value="k.id_kontak">
                {{ k.nama }} {{ k.asal_vendor ? '(' + k.asal_vendor + ')' : '' }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="form.catatan" rows="2" placeholder="Catatan awal..."></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Membuat...' : 'Buat Order' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.search-input { flex: 1; min-width: 220px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.filter-select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.btn-search { padding: 9px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }
.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw700 { font-weight: 700; color: #1d4ed8; font-size: 13px; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.center { text-align: center; font-weight: 700; }
.jenis-badge { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; }
.jenis-badge.internal { background: #eff6ff; color: #1d4ed8; }
.jenis-badge.vendor { background: #f5f3ff; color: #6d28d9; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 540px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
