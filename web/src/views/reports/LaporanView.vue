<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { exportCsv, type CsvSection } from '@/composables/useExport'
import { printLaporan } from '@/composables/usePrint'

// KPI
const kpi = ref<any>(null)
const kpiLoading = ref(true)

// Revenue chart
const revenue = ref<any[]>([])
const revenueLoading = ref(true)

// Ticket
const ticketReport = ref<any>(null)
const ticketLoading = ref(true)
const filterBulan = ref(new Date().getMonth() + 1)
const filterTahun = ref(new Date().getFullYear())

// Proyek
const proyekReport = ref<any>(null)
const proyekLoading = ref(true)

// Aset
const asetReport = ref<any>(null)
const asetLoading = ref(true)

// Metrik NOC (MTTA/MTTR/SLA)
const nocMetrics = ref<any>(null)
const nocLoading = ref(true)

const BULAN_LIST = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
]

const TAHUN_LIST = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i)

onMounted(() => {
  loadKpi()
  loadRevenue()
  loadTickets()
  loadProyek()
  loadAset()
  loadNocMetrics()
})

async function loadNocMetrics() {
  nocLoading.value = true
  try {
    nocMetrics.value = (await api.get('/operations/metrics', {
      params: { bulan: filterBulan.value, tahun: filterTahun.value }
    })).data.data
  } catch {}
  finally { nocLoading.value = false }
}

function fmtMenit(m: number | null) {
  if (m === null || m === undefined) return '—'
  if (m < 60) return `${m} mnt`
  const j = Math.floor(m / 60)
  if (j < 24) return `${j}j ${m % 60}m`
  return `${Math.floor(j / 24)}h ${j % 24}j`
}

async function loadKpi() {
  kpiLoading.value = true
  try { kpi.value = (await api.get('/reports/kpi')).data.data } catch {}
  finally { kpiLoading.value = false }
}
async function loadRevenue() {
  revenueLoading.value = true
  try { revenue.value = (await api.get('/reports/revenue')).data.data } catch {}
  finally { revenueLoading.value = false }
}
async function loadTickets() {
  ticketLoading.value = true
  try {
    ticketReport.value = (await api.get('/reports/tickets', {
      params: { bulan: filterBulan.value, tahun: filterTahun.value }
    })).data.data
  } catch {}
  finally { ticketLoading.value = false }
}
async function loadProyek() {
  proyekLoading.value = true
  try { proyekReport.value = (await api.get('/reports/projects')).data.data } catch {}
  finally { proyekLoading.value = false }
}
async function loadAset() {
  asetLoading.value = true
  try { asetReport.value = (await api.get('/reports/assets')).data.data } catch {}
  finally { asetLoading.value = false }
}

function fmtRupiah(n: number) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID')
}

const periodeLabel = () => `${BULAN_LIST[filterBulan.value - 1]} ${filterTahun.value}`

function handleExportExcel() {
  const sections: CsvSection[] = []
  const k = kpi.value
  if (k) {
    sections.push({
      title: 'RINGKASAN KPI',
      headers: ['Metrik', 'Nilai'],
      rows: [
        ['Kontrak Aktif', k.kontrak_aktif],
        ['Kontrak Akan Berakhir', k.kontrak_akan_berakhir],
        ['Total MRC Aktif', k.total_mrc_aktif],
        ['Tiket Open', k.tiket_open],
        ['Tiket In Progress', k.tiket_in_progress],
        ['Proyek Berjalan', k.proyek_berjalan],
        ['Aset di Gudang', k.aset_di_gudang],
      ],
    })
  }
  if (revenue.value.length) {
    sections.push({
      title: 'TREN MRC BULANAN',
      headers: ['Bulan', 'MRC'],
      rows: revenue.value.map((m: any) => [m.label, m.mrc]),
    })
  }
  if (ticketReport.value) {
    sections.push({
      title: `LAPORAN TIKET — ${periodeLabel()}`,
      headers: ['Keterangan', 'Nilai'],
      rows: [
        ['Total Tiket', ticketReport.value.total],
        ['Selesai', ticketReport.value.resolved],
        ['Resolution Rate (%)', ticketReport.value.resolution_rate],
      ],
    })
    sections.push({
      headers: ['Status Tiket', 'Jumlah'],
      rows: (ticketReport.value.by_status || []).map((s: any) => [String(s.status).replace('_', ' '), s.count]),
    })
  }
  if (proyekReport.value) {
    sections.push({
      title: 'LAPORAN PROYEK',
      headers: ['Status Proyek', 'Jumlah'],
      rows: (proyekReport.value.by_status || []).map((s: any) => [s.status, s.count]),
    })
  }
  if (asetReport.value) {
    sections.push({
      title: 'LAPORAN ASET',
      headers: ['Status Aset', 'Jumlah'],
      rows: (asetReport.value.by_status || []).map((s: any) => [String(s.status).replace('_', ' '), s.count]),
    })
    sections.push({
      headers: ['Kategori Aset', 'Jumlah'],
      rows: (asetReport.value.by_kategori || []).map((k: any) => [k.kategori, k.count]),
    })
  }
  if (!sections.length) { alert('Data laporan belum siap.'); return }
  exportCsv(`Laporan-${filterTahun.value}-${String(filterBulan.value).padStart(2, '0')}.csv`, sections)
}

function handleExportPdf() {
  printLaporan({
    periode: periodeLabel(),
    kpi: kpi.value,
    revenue: revenue.value,
    tiket: ticketReport.value,
    proyek: proyekReport.value,
    aset: asetReport.value,
  })
}

// Bar chart helper — max width 100% dari nilai tertinggi
function barWidth(val: number, data: any[]) {
  const max = Math.max(...data.map((d: any) => d.mrc || d.count || 1))
  return Math.round((val / max) * 100)
}

const STATUS_TIKET_COLOR: Record<string, string> = {
  Open: '#1d4ed8', In_Progress: '#a16207', Pending_Customer: '#c2410c',
  Resolved: '#15803d', Closed: '#64748b',
}
const STATUS_PROYEK_COLOR: Record<string, string> = {
  Kickoff: '#3b82f6', Instalasi: '#8b5cf6', Testing: '#f97316',
  Selesai: '#22c55e', Cancelled: '#ef4444',
}
const STATUS_ASET_COLOR: Record<string, string> = {
  Di_Gudang: '#15803d', Terpasang: '#1d4ed8', Dipinjam: '#a16207',
  Rusak: '#dc2626', Disposed: '#64748b',
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Laporan</h2>
        <p class="sub">Ringkasan operasional & bisnis</p>
      </div>
      <div class="export-actions">
        <button class="btn-export excel" @click="handleExportExcel">⬇ Export Excel</button>
        <button class="btn-export pdf" @click="handleExportPdf">🖨 Cetak PDF</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-row" v-if="!kpiLoading && kpi">
      <div class="kpi-card blue">
        <div class="kpi-icon">📄</div>
        <div class="kpi-val">{{ kpi.kontrak_aktif }}</div>
        <div class="kpi-label">Kontrak Aktif</div>
        <div class="kpi-sub" v-if="kpi.kontrak_akan_berakhir">⚠️ {{ kpi.kontrak_akan_berakhir }} akan berakhir</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-icon">💰</div>
        <div class="kpi-val mrc">{{ fmtRupiah(kpi.total_mrc_aktif) }}</div>
        <div class="kpi-label">Total MRC Aktif</div>
      </div>
      <div class="kpi-card yellow">
        <div class="kpi-icon">🎫</div>
        <div class="kpi-val">{{ kpi.tiket_open + kpi.tiket_in_progress }}</div>
        <div class="kpi-label">Tiket Open / In Progress</div>
        <div class="kpi-sub">{{ kpi.tiket_open }} open · {{ kpi.tiket_in_progress }} in progress</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-icon">📋</div>
        <div class="kpi-val">{{ kpi.proyek_berjalan }}</div>
        <div class="kpi-label">Proyek Berjalan</div>
      </div>
      <div class="kpi-card gray">
        <div class="kpi-icon">🖥️</div>
        <div class="kpi-val">{{ kpi.aset_di_gudang }}</div>
        <div class="kpi-label">Aset di Gudang</div>
      </div>
    </div>
    <div v-else-if="kpiLoading" class="loading-row">Memuat KPI...</div>

    <div class="two-col">
      <!-- Revenue Chart -->
      <div class="card">
        <h3>Tren MRC Bulanan (12 bulan)</h3>
        <div v-if="revenueLoading" class="loading-sm">Memuat...</div>
        <div v-else class="bar-chart">
          <div v-for="m in revenue" :key="m.label" class="bar-row">
            <div class="bar-label">{{ m.label }}</div>
            <div class="bar-track">
              <div class="bar-fill blue-fill"
                :style="{ width: barWidth(m.mrc, revenue) + '%' }"></div>
            </div>
            <div class="bar-val">{{ fmtRupiah(m.mrc) }}</div>
          </div>
        </div>
      </div>

      <!-- Tiket Report -->
      <div class="card">
        <div class="card-header">
          <h3>Laporan Tiket</h3>
          <div class="filter-row">
            <select v-model.number="filterBulan" @change="loadTickets(); loadNocMetrics()" class="filter-sm">
              <option v-for="(b, i) in BULAN_LIST" :key="i" :value="i+1">{{ b }}</option>
            </select>
            <select v-model.number="filterTahun" @change="loadTickets" class="filter-sm">
              <option v-for="y in TAHUN_LIST" :key="y" :value="y">{{ y }}</option>
            </select>
          </div>
        </div>
        <div v-if="ticketLoading" class="loading-sm">Memuat...</div>
        <template v-else-if="ticketReport">
          <div class="metric-row">
            <div class="metric">
              <div class="metric-val">{{ ticketReport.total }}</div>
              <div class="metric-label">Total Tiket</div>
            </div>
            <div class="metric">
              <div class="metric-val green-val">{{ ticketReport.resolved }}</div>
              <div class="metric-label">Selesai</div>
            </div>
            <div class="metric">
              <div class="metric-val blue-val">{{ ticketReport.resolution_rate }}%</div>
              <div class="metric-label">Resolution Rate</div>
            </div>
          </div>
          <div class="donut-legend">
            <div v-for="s in ticketReport.by_status" :key="s.status" class="legend-item">
              <span class="legend-dot" :style="{ background: STATUS_TIKET_COLOR[s.status] || '#94a3b8' }"></span>
              <span class="legend-label">{{ s.status.replace('_', ' ') }}</span>
              <span class="legend-val">{{ s.count }}</span>
            </div>
          </div>
          <div class="donut-legend mt8">
            <div v-for="p in ticketReport.by_prioritas" :key="p.prioritas" class="legend-item">
              <span class="prio-badge" :class="p.prioritas.toLowerCase()">{{ p.prioritas }}</span>
              <span class="legend-val">{{ p.count }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Metrik NOC / SLA -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h3>Metrik NOC — {{ BULAN_LIST[filterBulan - 1] }} {{ filterTahun }}</h3>
      </div>
      <div v-if="nocLoading" class="loading-sm">Memuat...</div>
      <template v-else-if="nocMetrics">
        <div class="metric-row">
          <div class="metric">
            <div class="metric-val">{{ nocMetrics.total_tiket }}</div>
            <div class="metric-label">Total Tiket</div>
          </div>
          <div class="metric">
            <div class="metric-val blue-val">{{ fmtMenit(nocMetrics.mtta_menit) }}</div>
            <div class="metric-label">MTTA (rata-rata respon)</div>
          </div>
          <div class="metric">
            <div class="metric-val blue-val">{{ fmtMenit(nocMetrics.mttr_menit) }}</div>
            <div class="metric-label">MTTR (rata-rata resolve)</div>
          </div>
          <div class="metric">
            <div class="metric-val" :class="(nocMetrics.sla_compliance ?? 100) >= 90 ? 'green-val' : 'red-val'">
              {{ nocMetrics.sla_compliance ?? '—' }}{{ nocMetrics.sla_compliance !== null ? '%' : '' }}
            </div>
            <div class="metric-label">Kepatuhan SLA ({{ nocMetrics.sla_breach }} telat)</div>
          </div>
        </div>
        <div class="noc-tables">
          <div>
            <div class="section-title-sm">Per Prioritas</div>
            <table class="mini-table">
              <thead><tr><th>Prioritas</th><th>Tiket</th><th>Selesai</th><th>MTTR</th><th>Telat SLA</th></tr></thead>
              <tbody>
                <tr v-for="p in nocMetrics.per_prioritas" :key="p.prioritas">
                  <td>{{ p.prioritas }}</td><td>{{ p.total }}</td><td>{{ p.resolved }}</td>
                  <td>{{ fmtMenit(p.mttr_menit) }}</td>
                  <td :class="{ 'red-text': p.sla_breach > 0 }">{{ p.sla_breach }}</td>
                </tr>
                <tr v-if="!nocMetrics.per_prioritas.length"><td colspan="5" class="empty-sm">Belum ada tiket periode ini</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <div class="section-title-sm">Per Teknisi</div>
            <table class="mini-table">
              <thead><tr><th>Teknisi</th><th>Selesai</th><th>MTTR</th></tr></thead>
              <tbody>
                <tr v-for="t in nocMetrics.per_teknisi" :key="t.nama">
                  <td>{{ t.nama }}</td><td>{{ t.resolved }}</td><td>{{ fmtMenit(t.mttr_menit) }}</td>
                </tr>
                <tr v-if="!nocMetrics.per_teknisi.length"><td colspan="3" class="empty-sm">Belum ada tiket selesai</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>

    <div class="two-col">
      <!-- Proyek -->
      <div class="card">
        <h3>Laporan Proyek</h3>
        <div v-if="proyekLoading" class="loading-sm">Memuat...</div>
        <template v-else-if="proyekReport">
          <div class="metric-row">
            <div class="metric">
              <div class="metric-val">{{ proyekReport.total_proyek }}</div>
              <div class="metric-label">Total Proyek</div>
            </div>
          </div>
          <div class="section-title-sm">Status Proyek</div>
          <div class="bar-chart compact">
            <div v-for="s in proyekReport.by_status" :key="s.status" class="bar-row">
              <div class="bar-label">{{ s.status }}</div>
              <div class="bar-track">
                <div class="bar-fill"
                  :style="{ width: barWidth(s.count, proyekReport.by_status) + '%', background: STATUS_PROYEK_COLOR[s.status] || '#94a3b8' }"></div>
              </div>
              <div class="bar-val-sm">{{ s.count }}</div>
            </div>
          </div>
          <div class="section-title-sm mt8">Status Surat Tugas</div>
          <div class="donut-legend">
            <div v-for="w in proyekReport.wo_by_status" :key="w.status" class="legend-item">
              <span class="legend-dot gray-dot"></span>
              <span class="legend-label">{{ w.status }}</span>
              <span class="legend-val">{{ w.count }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Aset -->
      <div class="card">
        <h3>Laporan Aset</h3>
        <div v-if="asetLoading" class="loading-sm">Memuat...</div>
        <template v-else-if="asetReport">
          <div class="metric-row">
            <div class="metric">
              <div class="metric-val">{{ fmtRupiah(asetReport.total_nilai) }}</div>
              <div class="metric-label">Total Nilai Aset</div>
            </div>
          </div>
          <div class="section-title-sm">Status Aset</div>
          <div class="donut-legend">
            <div v-for="s in asetReport.by_status" :key="s.status" class="legend-item">
              <span class="legend-dot" :style="{ background: STATUS_ASET_COLOR[s.status] || '#94a3b8' }"></span>
              <span class="legend-label">{{ s.status.replace('_', ' ') }}</span>
              <span class="legend-val">{{ s.count }} unit</span>
            </div>
          </div>
          <div class="section-title-sm mt8">Per Kategori</div>
          <div class="bar-chart compact">
            <div v-for="k in asetReport.by_kategori" :key="k.kategori" class="bar-row">
              <div class="bar-label">{{ k.kategori }}</div>
              <div class="bar-track">
                <div class="bar-fill"
                  :style="{ width: barWidth(k.count, asetReport.by_kategori) + '%', background: '#1d4ed8' }"></div>
              </div>
              <div class="bar-val-sm">{{ k.count }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.export-actions { display: flex; gap: 8px; flex-shrink: 0; }
.btn-export { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: background 0.15s; }
.btn-export.excel { background: #ecfdf5; color: #15803d; border-color: #a7f3d0; }
.btn-export.excel:hover { background: #d1fae5; }
.btn-export.pdf { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.btn-export.pdf:hover { background: #dbeafe; }

/* KPI */
.kpi-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
.kpi-card { flex: 1; min-width: 160px; background: #fff; border-radius: 12px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); border-top: 4px solid #e2e8f0; }
.kpi-card.blue { border-top-color: #3b82f6; }
.kpi-card.green { border-top-color: #22c55e; }
.kpi-card.yellow { border-top-color: #f59e0b; }
.kpi-card.purple { border-top-color: #8b5cf6; }
.kpi-card.gray { border-top-color: #94a3b8; }
.kpi-icon { font-size: 20px; margin-bottom: 8px; }
.kpi-val { font-size: 24px; font-weight: 800; color: #0f172a; }
.kpi-val.mrc { font-size: 16px; }
.kpi-label { font-size: 12px; color: #64748b; margin-top: 4px; }
.kpi-sub { font-size: 11px; color: #f97316; margin-top: 4px; }
.loading-row { color: #94a3b8; padding: 20px; font-size: 14px; }

/* Layout */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }

.card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; }
.card h3 { margin: 0 0 16px; font-size: 15px; color: #0f172a; font-weight: 700; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h3 { margin: 0; }
.filter-row { display: flex; gap: 6px; }
.filter-sm { padding: 5px 8px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 12px; outline: none; }
.loading-sm { color: #94a3b8; font-size: 13px; padding: 20px 0; text-align: center; }

/* Bar chart */
.bar-chart { display: flex; flex-direction: column; gap: 6px; }
.bar-chart.compact { gap: 4px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 56px; font-size: 11px; color: #64748b; text-align: right; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { flex: 1; background: #f1f5f9; border-radius: 4px; height: 16px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; min-width: 4px; }
.blue-fill { background: #3b82f6; }
.bar-val { width: 110px; font-size: 11px; color: #475569; font-weight: 600; flex-shrink: 0; }
.bar-val-sm { width: 28px; font-size: 11px; color: #475569; font-weight: 700; text-align: right; flex-shrink: 0; }

/* Metrics */
.metric-row { display: flex; gap: 16px; margin-bottom: 16px; }
.metric { flex: 1; }
.metric-val { font-size: 22px; font-weight: 800; color: #0f172a; }
.metric-val.green-val { color: #15803d; }
.metric-val.blue-val { color: #1d4ed8; }
.metric-label { font-size: 11px; color: #64748b; margin-top: 2px; }

/* Legend */
.donut-legend { display: flex; flex-direction: column; gap: 6px; }
.legend-item { display: flex; align-items: center; gap: 8px; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.gray-dot { background: #94a3b8; }
.legend-label { flex: 1; font-size: 13px; color: #374151; }
.legend-val { font-size: 13px; font-weight: 700; color: #0f172a; }
.prio-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
.prio-badge.low { background: #f1f5f9; color: #64748b; }
.prio-badge.medium { background: #eff6ff; color: #1d4ed8; }
.prio-badge.high { background: #fff7ed; color: #c2410c; }
.prio-badge.critical { background: #fef2f2; color: #dc2626; }

.section-title-sm { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.metric-val.red-val { color: #dc2626; }
.red-text { color: #dc2626; font-weight: 700; }
.noc-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 8px; }
@media (max-width: 768px) { .noc-tables { grid-template-columns: 1fr; } }
.mini-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mini-table th { text-align: left; padding: 6px 8px; color: #94a3b8; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
.mini-table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; color: #334155; }
.empty-sm { color: #94a3b8; text-align: center; padding: 12px !important; }
.mt8 { margin-top: 12px; }
</style>
