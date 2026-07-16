<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFinanceStore } from '@/stores/finance'
import { exportCsv, type CsvSection } from '@/composables/useExport'
import { fmtRupiah, fmtDateShort as fmtDate, statusLabel } from '@/composables/useFormat'
import api from '@/services/api'

const router = useRouter()
const finance = useFinanceStore()

const page = ref(1)
const search = ref('')
const filterStatus = ref('')
const filterPeriode = ref('')
const listError = ref('')
const processingId = ref(0)

const STATUS_LIST = ['Draft', 'Terkirim', 'Sebagian', 'Lunas', 'Jatuh_Tempo', 'Batal']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Draft:       { bg: '#f1f5f9', color: '#64748b' },
  Terkirim:    { bg: '#eff6ff', color: '#1d4ed8' },
  Sebagian:    { bg: '#fff7ed', color: '#c2410c' },
  Lunas:       { bg: '#f0fdf4', color: '#15803d' },
  Jatuh_Tempo: { bg: '#fef2f2', color: '#dc2626' },
  Batal:       { bg: '#e2e8f0', color: '#475569' },
}

interface SiteOption {
  id_site: number
  kode_site: string
  nama_site: string
  pelanggan?: { nama_pelanggan: string }
}
const siteList = ref<SiteOption[]>([])

const showModal = ref(false)
const submitting = ref(false)
const formError = ref('')
const form = ref({
  id_site: 0,
  periode: new Date().toISOString().slice(0, 7),
  tgl_invoice: new Date().toISOString().slice(0, 10),
  tgl_jatuh_tempo: '',
  subtotal: 0,
  ppn_persen: 11,
  catatan: '',
})

onMounted(async () => {
  fetchData()
  fetchSites()
})

async function fetchSites() {
  try {
    const r = await api.get('/master/site', { params: { limit: 500 } })
    siteList.value = r.data.data
  } catch { /* dropdown opsional */ }
}

async function fetchData() {
  listError.value = ''
  const params: any = { page: page.value }
  if (search.value) params.search = search.value
  if (filterStatus.value) params.status = filterStatus.value
  if (filterPeriode.value) params.periode = filterPeriode.value
  try {
    await finance.fetchAll(params)
  } catch (err: any) {
    listError.value = err?.response?.data?.message ?? 'Gagal memuat invoice'
  }
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

async function handleSubmit() {
  if (!form.value.id_site || !form.value.periode || !form.value.tgl_invoice || !form.value.tgl_jatuh_tempo) {
    formError.value = 'Site, periode, tanggal invoice, dan jatuh tempo wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const payload: any = { ...form.value }
    if (!payload.catatan) delete payload.catatan
    const result = await finance.create(payload)
    showModal.value = false
    router.push(`/finance/invoice/${result.id_invoice}`)
  } catch (err: any) {
    formError.value = err?.response?.data?.message ?? 'Gagal membuat invoice'
  } finally {
    submitting.value = false
  }
}

async function handleKirim(id: number, ev: Event) {
  ev.stopPropagation()
  if (!confirm('Kirim invoice ini? Status akan berubah menjadi Terkirim.')) return
  processingId.value = id
  try {
    await finance.kirim(id)
    fetchData()
  } catch (err: any) {
    alert(err?.response?.data?.message ?? 'Gagal mengirim invoice')
  } finally {
    processingId.value = 0
  }
}

async function handleHapus(id: number, nomor: string, ev: Event) {
  ev.stopPropagation()
  if (!confirm(`Hapus invoice ${nomor}? Tindakan ini tidak dapat dibatalkan.`)) return
  processingId.value = id
  try {
    await finance.remove(id)
    fetchData()
  } catch (err: any) {
    alert(err?.response?.data?.message ?? 'Gagal menghapus invoice')
  } finally {
    processingId.value = 0
  }
}

function handleExport() {
  if (!finance.invoices.length) { alert('Tidak ada data untuk diekspor.'); return }
  const sections: CsvSection[] = [{
    title: 'DAFTAR INVOICE',
    headers: ['Nomor', 'Pelanggan', 'Periode', 'Total', 'Dibayar', 'Sisa', 'Status', 'Jatuh Tempo'],
    rows: finance.invoices.map((inv) => [
      inv.nomor_invoice,
      inv.site?.pelanggan?.nama_pelanggan ?? '',
      inv.periode,
      inv.total,
      inv.jumlah_dibayar,
      (Number(inv.total) || 0) - (Number(inv.jumlah_dibayar) || 0),
      statusLabel(inv.status),
      fmtDate(inv.tgl_jatuh_tempo),
    ]),
  }]
  exportCsv(`Invoice-${new Date().toISOString().slice(0, 10)}.csv`, sections)
}

function sisa(inv: { total: number; jumlah_dibayar: number }) {
  return (Number(inv.total) || 0) - (Number(inv.jumlah_dibayar) || 0)
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Invoice</h2>
        <p class="sub">Daftar tagihan pelanggan</p>
      </div>
      <div class="header-actions">
        <button class="btn-export" @click="handleExport">⬇ Export Excel</button>
        <button class="btn-primary" @click="showModal = true; formError = ''">+ Buat Invoice</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input v-model="search" @keyup.enter="doFilter" placeholder="Cari nomor invoice / pelanggan..." class="search-input" />
      <select v-model="filterStatus" @change="doFilter" class="filter-select">
        <option value="">Semua Status</option>
        <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
      </select>
      <input v-model="filterPeriode" @keyup.enter="doFilter" placeholder="Periode (YYYY-MM)" class="periode-input" />
      <button class="btn-search" @click="doFilter">Cari</button>
    </div>

    <div v-if="listError" class="alert-error">{{ listError }}</div>

    <div class="table-card">
      <div v-if="finance.loading" class="loading">Memuat...</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No. Invoice</th>
              <th>Pelanggan</th>
              <th>Periode</th>
              <th style="text-align:right">Total</th>
              <th style="text-align:right">Dibayar</th>
              <th style="text-align:right">Sisa</th>
              <th>Jatuh Tempo</th>
              <th>Status</th>
              <th>Mekari</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!finance.invoices.length">
              <td colspan="10" class="empty">Belum ada data invoice</td>
            </tr>
            <tr v-for="inv in finance.invoices" :key="inv.id_invoice" class="row-link"
              @click="router.push(`/finance/invoice/${inv.id_invoice}`)">
              <td class="nomor">{{ inv.nomor_invoice }}</td>
              <td>
                <div class="fw600">{{ inv.site?.pelanggan?.nama_pelanggan }}</div>
                <div class="text-gray text-sm">{{ inv.site?.nama_site }}</div>
              </td>
              <td class="text-sm text-gray">{{ inv.periode }}</td>
              <td class="fw600" style="text-align:right">{{ fmtRupiah(inv.total) }}</td>
              <td class="text-gray" style="text-align:right">{{ fmtRupiah(inv.jumlah_dibayar) }}</td>
              <td class="fw600" style="text-align:right"
                :class="{ 'sisa-danger': sisa(inv) > 0 }">{{ fmtRupiah(sisa(inv)) }}</td>
              <td class="text-sm text-gray">{{ fmtDate(inv.tgl_jatuh_tempo) }}</td>
              <td>
                <span class="status-badge"
                  :style="{ background: STATUS_COLOR[inv.status]?.bg, color: STATUS_COLOR[inv.status]?.color }">
                  {{ statusLabel(inv.status) }}
                </span>
              </td>
              <td>
                <span class="mekari-tag" :class="'mk-' + (inv.mekari_status || 'Belum').toLowerCase()">
                  {{ inv.mekari_status || 'Belum' }}
                </span>
              </td>
              <td class="actions" @click.stop>
                <button v-if="inv.status === 'Draft'" class="mini-btn kirim" :disabled="processingId === inv.id_invoice" @click="handleKirim(inv.id_invoice, $event)">Kirim</button>
                <button v-if="inv.status === 'Draft'" class="mini-btn hapus" :disabled="processingId === inv.id_invoice" @click="handleHapus(inv.id_invoice, inv.nomor_invoice, $event)">Hapus</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="finance.meta.total_pages > 1" class="pagination">
        <button v-for="p in finance.meta.total_pages" :key="p"
          :class="['page-btn', { active: p === finance.meta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="finance.meta.total">Total: {{ finance.meta.total }} invoice</div>
    </div>

    <!-- Modal Buat Invoice -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Buat Invoice Baru</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Site <span class="req">*</span></label>
            <select v-model.number="form.id_site">
              <option :value="0">— Pilih Site —</option>
              <option v-for="s in siteList" :key="s.id_site" :value="s.id_site">
                [{{ s.kode_site }}] {{ s.nama_site }} — {{ s.pelanggan?.nama_pelanggan }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Periode <span class="req">*</span></label>
            <input v-model="form.periode" type="month" />
          </div>
          <div class="field">
            <label>PPN (%)</label>
            <input v-model.number="form.ppn_persen" type="number" min="0" />
          </div>
          <div class="field">
            <label>Tanggal Invoice <span class="req">*</span></label>
            <input v-model="form.tgl_invoice" type="date" />
          </div>
          <div class="field">
            <label>Jatuh Tempo <span class="req">*</span></label>
            <input v-model="form.tgl_jatuh_tempo" type="date" />
          </div>
          <div class="field full">
            <label>Subtotal (Rp) <span class="req">*</span></label>
            <input v-model.number="form.subtotal" type="number" min="0" placeholder="0" />
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="form.catatan" rows="2" placeholder="Catatan (opsional)..."></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Buat Invoice' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-export { padding: 10px 16px; background: #ecfdf5; color: #15803d; border: 1px solid #a7f3d0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-export:hover { background: #d1fae5; }

.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.search-input { flex: 1; min-width: 240px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.filter-select, .periode-input { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.periode-input { width: 160px; }
.btn-search { padding: 9px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: top; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.nomor { font-weight: 700; color: #1d4ed8; font-size: 13px; white-space: nowrap; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.sisa-danger { color: #dc2626; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.mekari-tag { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.mk-belum { background: #f1f5f9; color: #94a3b8; }
.mk-tersinkron { background: #f0fdf4; color: #15803d; }
.mk-simulasi { background: #fefce8; color: #a16207; }
.mk-gagal { background: #fef2f2; color: #dc2626; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.actions { white-space: nowrap; }
.mini-btn { padding: 5px 10px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; margin-right: 4px; }
.mini-btn.kirim { background: #eff6ff; color: #1d4ed8; }
.mini-btn.kirim:hover { background: #dbeafe; }
.mini-btn.hapus { background: #fef2f2; color: #dc2626; }
.mini-btn.hapus:hover { background: #fee2e2; }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
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
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
