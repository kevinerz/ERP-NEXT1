<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFinanceStore } from '@/stores/finance'
import { fmtRupiah, fmtDateShort as fmtDate, statusLabel } from '@/composables/useFormat'

const router = useRouter()
const finance = useFinanceStore()

const loadError = ref('')

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Draft:       { bg: '#f1f5f9', color: '#64748b' },
  Terkirim:    { bg: '#eff6ff', color: '#1d4ed8' },
  Sebagian:    { bg: '#fff7ed', color: '#c2410c' },
  Lunas:       { bg: '#f0fdf4', color: '#15803d' },
  Jatuh_Tempo: { bg: '#fef2f2', color: '#dc2626' },
  Batal:       { bg: '#e2e8f0', color: '#475569' },
}

const showBulkModal = ref(false)
const submitting = ref(false)
const formError = ref('')
const bulkForm = ref({
  periode: new Date().toISOString().slice(0, 7),
  tgl_invoice: new Date().toISOString().slice(0, 10),
  tgl_jatuh_tempo: '',
  ppn_persen: 11,
})

onMounted(load)

async function load() {
  loadError.value = ''
  try {
    await Promise.all([finance.fetchSummary(), finance.fetchAging()])
  } catch (err: any) {
    loadError.value = err?.response?.data?.message ?? 'Gagal memuat data finance'
  }
}

async function handleBulk() {
  if (!bulkForm.value.periode || !bulkForm.value.tgl_invoice || !bulkForm.value.tgl_jatuh_tempo) {
    formError.value = 'Periode, tanggal invoice, dan jatuh tempo wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const res = await finance.generateBulk({ ...bulkForm.value })
    showBulkModal.value = false
    alert(`${res.dibuat} invoice dibuat, ${res.dilewati} dilewati (dari ${res.total_kontrak} kontrak)`)
    await load()
  } catch (err: any) {
    formError.value = err?.response?.data?.message ?? 'Gagal generate invoice'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Finance</h2>
        <p class="sub">Ringkasan tagihan, pembayaran & piutang</p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="router.push('/finance/invoice')">Kelola Invoice</button>
        <button class="btn-primary" @click="showBulkModal = true; formError = ''">Generate Invoice Bulanan</button>
      </div>
    </div>

    <div v-if="loadError" class="alert-error">{{ loadError }}</div>

    <!-- Summary cards -->
    <div class="kpi-row" v-if="finance.summary">
      <div class="kpi-card blue">
        <div class="kpi-icon">📄</div>
        <div class="kpi-val mrc">{{ fmtRupiah(finance.summary.total_tagihan) }}</div>
        <div class="kpi-label">Total Tagihan</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-icon">💰</div>
        <div class="kpi-val mrc">{{ fmtRupiah(finance.summary.total_dibayar) }}</div>
        <div class="kpi-label">Total Dibayar</div>
      </div>
      <div class="kpi-card yellow">
        <div class="kpi-icon">📊</div>
        <div class="kpi-val mrc">{{ fmtRupiah(finance.summary.piutang) }}</div>
        <div class="kpi-label">Piutang (Outstanding)</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-icon">⏰</div>
        <div class="kpi-val">{{ finance.summary.jatuh_tempo_count }}</div>
        <div class="kpi-label">Invoice Jatuh Tempo</div>
      </div>
    </div>

    <!-- Status breakdown -->
    <div class="card" v-if="finance.summary?.by_status?.length">
      <h3>Breakdown per Status</h3>
      <div class="chip-row">
        <div v-for="s in finance.summary.by_status" :key="s.status" class="status-chip"
          :style="{ background: STATUS_COLOR[s.status]?.bg, color: STATUS_COLOR[s.status]?.color }">
          <span class="chip-label">{{ statusLabel(s.status) }}</span>
          <span class="chip-count">{{ s.count }}</span>
          <span class="chip-total">{{ fmtRupiah(s.total) }}</span>
        </div>
      </div>
    </div>

    <!-- Aging -->
    <div class="card" v-if="finance.aging">
      <div class="card-header">
        <h3>Aging Piutang</h3>
        <div class="total-piutang">Total Piutang: <strong>{{ fmtRupiah(finance.aging.total_piutang) }}</strong></div>
      </div>
      <div class="aging-grid">
        <div class="aging-cell">
          <div class="ag-label">Belum Jatuh Tempo</div>
          <div class="ag-val">{{ fmtRupiah(finance.aging.buckets.belum_jatuh_tempo) }}</div>
        </div>
        <div class="aging-cell">
          <div class="ag-label">1–30 hari</div>
          <div class="ag-val warn">{{ fmtRupiah(finance.aging.buckets.d1_30) }}</div>
        </div>
        <div class="aging-cell">
          <div class="ag-label">31–60 hari</div>
          <div class="ag-val warn">{{ fmtRupiah(finance.aging.buckets.d31_60) }}</div>
        </div>
        <div class="aging-cell">
          <div class="ag-label">61–90 hari</div>
          <div class="ag-val danger">{{ fmtRupiah(finance.aging.buckets.d61_90) }}</div>
        </div>
        <div class="aging-cell">
          <div class="ag-label">90+ hari</div>
          <div class="ag-val danger">{{ fmtRupiah(finance.aging.buckets.d90_plus) }}</div>
        </div>
      </div>
    </div>

    <!-- Outstanding invoices -->
    <div class="card" v-if="finance.aging">
      <h3>Invoice Outstanding</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pelanggan / Site</th>
              <th>No. Invoice</th>
              <th>Jatuh Tempo</th>
              <th>Umur</th>
              <th style="text-align:right">Sisa</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!finance.aging.invoices.length">
              <td colspan="6" class="empty">Tidak ada invoice outstanding 🎉</td>
            </tr>
            <tr v-for="inv in finance.aging.invoices" :key="inv.id_invoice" class="row-link"
              @click="router.push(`/finance/invoice/${inv.id_invoice}`)">
              <td>
                <div class="fw600">{{ inv.pelanggan }}</div>
                <div class="text-gray text-sm">{{ inv.site }}</div>
              </td>
              <td class="nomor">{{ inv.nomor_invoice }}</td>
              <td class="text-sm text-gray">{{ fmtDate(inv.tgl_jatuh_tempo) }}</td>
              <td>
                <span class="umur" :class="{ warn: inv.umur_hari > 0, danger: inv.umur_hari > 60 }">
                  {{ inv.umur_hari > 0 ? inv.umur_hari + ' hari' : 'belum' }}
                </span>
              </td>
              <td class="fw600" style="text-align:right">{{ fmtRupiah(inv.sisa) }}</td>
              <td>
                <span class="status-badge"
                  :style="{ background: STATUS_COLOR[inv.status]?.bg, color: STATUS_COLOR[inv.status]?.color }">
                  {{ statusLabel(inv.status) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Generate Bulk -->
    <div v-if="showBulkModal" class="modal-overlay" @click.self="showBulkModal = false">
      <div class="modal">
        <h3>Generate Invoice Bulanan</h3>
        <p class="hint-text">Membuat invoice untuk semua kontrak aktif pada periode terpilih. Kontrak yang sudah punya invoice periode ini akan dilewati.</p>
        <div class="form-grid">
          <div class="field">
            <label>Periode <span class="req">*</span></label>
            <input v-model="bulkForm.periode" type="month" />
          </div>
          <div class="field">
            <label>PPN (%)</label>
            <input v-model.number="bulkForm.ppn_persen" type="number" min="0" />
          </div>
          <div class="field">
            <label>Tanggal Invoice <span class="req">*</span></label>
            <input v-model="bulkForm.tgl_invoice" type="date" />
          </div>
          <div class="field">
            <label>Jatuh Tempo <span class="req">*</span></label>
            <input v-model="bulkForm.tgl_jatuh_tempo" type="date" />
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showBulkModal = false">Batal</button>
          <button class="btn-submit" @click="handleBulk" :disabled="submitting">
            {{ submitting ? 'Memproses...' : 'Generate' }}
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
.btn-secondary { padding: 10px 20px; background: #f1f5f9; color: #374151; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.kpi-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.kpi-card { flex: 1; min-width: 190px; background: #fff; border-radius: 12px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); border-top: 4px solid #e2e8f0; }
.kpi-card.blue { border-top-color: #3b82f6; }
.kpi-card.green { border-top-color: #22c55e; }
.kpi-card.yellow { border-top-color: #f59e0b; }
.kpi-card.red { border-top-color: #ef4444; }
.kpi-icon { font-size: 20px; margin-bottom: 8px; }
.kpi-val { font-size: 24px; font-weight: 800; color: #0f172a; }
.kpi-val.mrc { font-size: 18px; }
.kpi-label { font-size: 12px; color: #64748b; margin-top: 4px; }

.card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; margin-bottom: 16px; }
.card h3 { margin: 0 0 16px; font-size: 15px; color: #0f172a; font-weight: 700; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.card-header h3 { margin: 0; }
.total-piutang { font-size: 13px; color: #64748b; }
.total-piutang strong { color: #dc2626; }

.chip-row { display: flex; gap: 10px; flex-wrap: wrap; }
.status-chip { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-radius: 10px; min-width: 120px; }
.chip-label { font-size: 12px; font-weight: 700; }
.chip-count { font-size: 20px; font-weight: 800; }
.chip-total { font-size: 11px; opacity: 0.85; }

.aging-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
@media (max-width: 768px) { .aging-grid { grid-template-columns: repeat(2, 1fr); } }
.aging-cell { background: #f8fafc; border-radius: 10px; padding: 12px 14px; }
.ag-label { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
.ag-val { font-size: 15px; font-weight: 700; color: #0f172a; }
.ag-val.warn { color: #c2410c; }
.ag-val.danger { color: #dc2626; }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 10px 12px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 12px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: top; }
.empty { text-align: center; color: #94a3b8; padding: 30px; }
.nomor { font-weight: 700; color: #1d4ed8; font-size: 13px; white-space: nowrap; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.umur { font-size: 12px; color: #64748b; font-weight: 600; }
.umur.warn { color: #c2410c; }
.umur.danger { color: #dc2626; font-weight: 700; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 16px; font-size: 18px; color: #0f172a; }
.hint-text { font-size: 13px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
