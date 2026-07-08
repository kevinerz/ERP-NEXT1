<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useMasterStore } from '@/stores/master'
import { useProyekStore } from '@/stores/proyek'
import { fmtRupiah, fmtDateShort as fmtDate, statusLabel } from '@/composables/useFormat'
import api from '@/services/api'

const router = useRouter()
const contracts = useContractsStore()
const master = useMasterStore()
const proyek = useProyekStore()

const page = ref(1)
const filterStatus = ref('')
const search = ref('')

const showModal = ref(false)
const submitting = ref(false)
const formError = ref('')
const form = ref({
  id_quotation: '' as number | '',
  id_site: 0,
  id_layanan: 0,
  tgl_mulai: '',
  durasi_bulan: 12,
  harga_mrc: 0,
  harga_otc: 0,
})

interface ApprovedQuotation {
  id_quotation: number
  nomor_quotation: string
  opportunity?: { nama_opportunity?: string; id_layanan?: number; lead?: { nama_prospek?: string } }
}
const approvedQuotations = ref<ApprovedQuotation[]>([])

async function fetchApprovedQuotations() {
  try {
    const r = await api.get('/sales/quotation', { params: { status_approval: 'Approved', limit: 100 } })
    approvedQuotations.value = r.data.data
  } catch { /* diamkan; quotation opsional */ }
}

function onQuotationChange() {
  const q = approvedQuotations.value.find(x => x.id_quotation === form.value.id_quotation)
  if (q?.opportunity?.id_layanan) form.value.id_layanan = q.opportunity.id_layanan
}

const STATUS_LIST = ['Aktif', 'Akan_Berakhir', 'Berakhir', 'Terminasi']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Aktif:          { bg: '#f0fdf4', color: '#15803d' },
  Akan_Berakhir:  { bg: '#fef9c3', color: '#a16207' },
  Berakhir:       { bg: '#f1f5f9', color: '#64748b' },
  Terminasi:      { bg: '#fef2f2', color: '#dc2626' },
}

onMounted(async () => {
  await Promise.all([contracts.fetchSummary(), master.fetchLayanan(), proyek.fetchSiteList(), fetchApprovedQuotations()])
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (filterStatus.value) params.status_kontrak = filterStatus.value
  if (search.value) params.search = search.value
  contracts.fetchList(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

async function handleSubmit() {
  if (!form.value.id_site || !form.value.id_layanan || !form.value.tgl_mulai || !form.value.harga_mrc) {
    formError.value = 'Site, layanan, tanggal mulai, dan harga MRC wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...form.value }
    if (payload.id_quotation === '' || !payload.id_quotation) delete payload.id_quotation
    const result = await contracts.create(payload)
    showModal.value = false
    await contracts.fetchSummary()
    router.push(`/contracts/${result.id_kontrak}`)
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal membuat kontrak' }
  finally { submitting.value = false }
}

function sisaHari(d?: string) {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  return diff
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Kontrak Layanan</h2>
        <p class="sub">Manajemen kontrak & recurring revenue</p>
      </div>
      <button class="btn-primary" @click="showModal = true; formError = ''">+ Buat Kontrak</button>
    </div>

    <!-- Summary -->
    <div class="summary-row" v-if="contracts.summary">
      <div v-for="s in contracts.summary.statuses" :key="s.status" class="summary-chip"
        :style="{ borderLeftColor: STATUS_COLOR[s.status]?.color || '#94a3b8' }"
        @click="filterStatus = filterStatus === s.status ? '' : s.status; doFilter()">
        <div class="sc-count">{{ s.count }}</div>
        <div class="sc-label">{{ statusLabel(s.status) }}</div>
      </div>
      <div class="summary-chip mrc-chip">
        <div class="sc-count mrc-val">{{ fmtRupiah(contracts.summary.total_mrc_aktif) }}</div>
        <div class="sc-label">Total MRC Aktif</div>
      </div>
      <div v-if="contracts.summary.akan_berakhir > 0" class="summary-chip warn-chip">
        <div class="sc-count warn-val">{{ contracts.summary.akan_berakhir }}</div>
        <div class="sc-label">Berakhir ≤30 hari</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input v-model="search" @keyup.enter="doFilter" placeholder="Cari nomor kontrak / site / pelanggan..." class="search-input" />
      <select v-model="filterStatus" @change="doFilter" class="filter-select">
        <option value="">Semua Status</option>
        <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
      </select>
      <button class="btn-search" @click="doFilter">Cari</button>
    </div>

    <div v-if="contracts.error" class="alert-error">{{ contracts.error }}</div>

    <div class="table-card">
      <div v-if="contracts.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>No. Kontrak</th>
            <th>Pelanggan / Site</th>
            <th>Layanan</th>
            <th>MRC</th>
            <th>Mulai</th>
            <th>Berakhir</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!contracts.list.length">
            <td colspan="7" class="empty">Belum ada data kontrak</td>
          </tr>
          <tr v-for="k in contracts.list" :key="k.id_kontrak" class="row-link"
            @click="router.push(`/contracts/${k.id_kontrak}`)">
            <td class="nomor">{{ k.nomor_kontrak }}</td>
            <td>
              <div class="fw600">{{ k.site?.pelanggan?.nama_pelanggan }}</div>
              <div class="text-gray text-sm">{{ k.site?.nama_site }}</div>
            </td>
            <td class="text-gray">{{ k.layanan?.nama_layanan }}</td>
            <td class="fw600">{{ fmtRupiah(k.harga_mrc) }}</td>
            <td class="text-sm text-gray">{{ fmtDate(k.tgl_mulai) }}</td>
            <td>
              <div class="text-sm" v-if="k.tgl_berakhir">{{ fmtDate(k.tgl_berakhir) }}</div>
              <div v-if="k.tgl_berakhir && k.status_kontrak === 'Aktif'" class="sisa"
                :class="{ warn: (sisaHari(k.tgl_berakhir) ?? 999) <= 30 }">
                {{ sisaHari(k.tgl_berakhir) !== null ? sisaHari(k.tgl_berakhir) + ' hari' : '' }}
              </div>
            </td>
            <td>
              <span class="status-badge"
                :style="{ background: STATUS_COLOR[k.status_kontrak]?.bg, color: STATUS_COLOR[k.status_kontrak]?.color }">
                {{ statusLabel(k.status_kontrak) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="contracts.meta.total_pages > 1" class="pagination">
        <button v-for="p in contracts.meta.total_pages" :key="p"
          :class="['page-btn', { active: p === contracts.meta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="contracts.meta.total">Total: {{ contracts.meta.total }} kontrak</div>
    </div>

    <!-- Modal Buat Kontrak -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Buat Kontrak Baru</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Quotation (Approved)</label>
            <select v-model.number="form.id_quotation" @change="onQuotationChange">
              <option value="">— Tanpa Quotation —</option>
              <option v-for="q in approvedQuotations" :key="q.id_quotation" :value="q.id_quotation">
                {{ q.nomor_quotation }} — {{ q.opportunity?.lead?.nama_prospek }}
              </option>
            </select>
          </div>
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
            <label>Layanan <span class="req">*</span></label>
            <select v-model="form.id_layanan">
              <option :value="0">— Pilih Layanan —</option>
              <option v-for="l in master.layananList" :key="l.id_layanan" :value="l.id_layanan">
                {{ l.nama_layanan }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Tanggal Mulai <span class="req">*</span></label>
            <input v-model="form.tgl_mulai" type="date" />
          </div>
          <div class="field">
            <label>Durasi (bulan)</label>
            <input v-model.number="form.durasi_bulan" type="number" min="1" />
          </div>
          <div class="field">
            <label>Harga MRC / bulan (Rp) <span class="req">*</span></label>
            <input v-model.number="form.harga_mrc" type="number" min="0" placeholder="0" />
          </div>
          <div class="field">
            <label>Harga OTC (Rp)</label>
            <input v-model.number="form.harga_otc" type="number" min="0" placeholder="0" />
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Buat Kontrak' }}
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

.summary-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.summary-chip { background: #fff; border-radius: 8px; padding: 12px 16px; border-left: 4px solid #94a3b8; box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer; min-width: 110px; }
.summary-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.sc-count { font-size: 22px; font-weight: 800; color: #0f172a; }
.sc-label { font-size: 11px; color: #64748b; }
.mrc-chip { border-left-color: #1d4ed8; cursor: default; }
.mrc-val { font-size: 16px; color: #1d4ed8; }
.warn-chip { border-left-color: #f97316; cursor: default; }
.warn-val { color: #ea580c; }

.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.search-input { flex: 1; min-width: 260px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.filter-select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.btn-search { padding: 9px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: top; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.nomor { font-weight: 700; color: #1d4ed8; font-size: 13px; white-space: nowrap; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.sisa { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.sisa.warn { color: #ea580c; font-weight: 700; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
