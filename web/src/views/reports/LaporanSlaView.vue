<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'

const BULAN_LIST = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
]
const TAHUN_LIST = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i)

const filterBulan = ref(new Date().getMonth() + 1)
const filterTahun = ref(new Date().getFullYear())
const modeTahun = ref(false)
const loading = ref(false)
const data = ref<any>(null)

onMounted(() => loadData())

async function loadData() {
  loading.value = true
  try {
    const params: any = { tahun: filterTahun.value }
    if (modeTahun.value) {
      params.mode = 'year'
    } else {
      params.bulan = filterBulan.value
    }
    data.value = (await api.get('/reports/sla', { params })).data.data
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function fmtPct(n: number) {
  if (n === null || n === undefined) return '—'
  return Number(n).toFixed(1) + '%'
}

function fmtMenit(m: number | null) {
  if (m === null || m === undefined) return '—'
  const mm = Math.abs(Math.round(m))
  if (mm < 60) return `${mm}m`
  const j = Math.floor(mm / 60)
  if (j < 24) return `${j}j ${mm % 60}m`
  return `${Math.floor(j / 24)}hr ${j % 24}j`
}

function fmtDate(d: string | Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── SVG Chart ────────────────────────────────────────────────────
const SVG_W = 800
const SVG_H = 220
const PAD_L = 40
const PAD_R = 16
const PAD_T = 20
const PAD_B = 40
const chartW = SVG_W - PAD_L - PAD_R
const chartH = SVG_H - PAD_T - PAD_B

const trendData = computed(() => data.value?.trend ?? [])

function yToSvg(pct: number) {
  return PAD_T + chartH - (pct / 100) * chartH
}

const groupW = computed(() => chartW / 12)
const barW = computed(() => groupW.value * 0.35)

function barX(i: number, which: 0 | 1) {
  const gx = PAD_L + i * groupW.value + groupW.value * 0.08
  return gx + which * (barW.value + 2)
}
function barY(pct: number) { return yToSvg(pct) }
function barH(pct: number) { return (Math.min(pct, 100) / 100) * chartH }

const yTicks = [0, 25, 50, 75, 100]

// ── Export CSV ───────────────────────────────────────────────────
function exportCsv() {
  if (!data.value) return
  const d = data.value
  const rows: string[] = []

  rows.push(`LAPORAN SLA — ${d.periode}`)
  rows.push('')
  rows.push('RINGKASAN')
  rows.push('Total Tiket,Total Resolved,Total Breach,Kepatuhan SLA,Kepatuhan FO,Avg MTTR')
  const s = d.summary
  rows.push(`${s.total_tiket},${s.total_resolved},${s.total_breach},${fmtPct(s.compliance_pct)},${fmtPct(s.compliance_fo_pct)},${fmtMenit(s.avg_mttr_menit)}`)

  rows.push('')
  rows.push('PER LAYANAN')
  rows.push('Kode Layanan,Nama Layanan,FO,Target,Kepatuhan,Total Tiket,Breach,Status')
  for (const l of d.per_layanan) {
    rows.push(`${l.kode_layanan},"${l.nama_layanan}",${l.is_fo ? 'Ya' : 'Tidak'},${l.target_pct}%,${fmtPct(l.compliance_pct)},${l.total_tiket},${l.breach},${l.status}`)
  }

  rows.push('')
  rows.push('PER PELANGGAN')
  rows.push('Kode,Nama Pelanggan,Total Tiket,Breach,Target,Kepatuhan,Status')
  for (const p of d.per_pelanggan) {
    rows.push(`${p.kode_pelanggan},"${p.nama_pelanggan}",${p.total_tiket},${p.breach},${p.target_pct}%,${fmtPct(p.compliance_pct)},${p.status}`)
  }

  rows.push('')
  rows.push('DETAIL BREACH')
  rows.push('No Tiket,Pelanggan,Site,Layanan,Prioritas,Tgl Open,SLA Due,Terlambat,Status')
  for (const b of d.breach_detail) {
    rows.push(`${b.nomor_tiket},"${b.nama_pelanggan}","${b.nama_site}",${b.kode_layanan},${b.prioritas},${fmtDate(b.tgl_open)},${fmtDate(b.sla_due)},${fmtMenit(b.terlambat_menit)},${b.status_tiket}`)
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `SLA-${d.periode.replace(/\s+/g, '-')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2>Laporan SLA</h2>
        <p class="sub">{{ data ? data.periode : 'Pilih periode dan klik Tampilkan' }}</p>
      </div>
      <div class="header-actions">
        <div class="filter-row">
          <select v-model.number="filterBulan" class="filter-sm" :disabled="modeTahun">
            <option v-for="(b, i) in BULAN_LIST" :key="i" :value="i + 1">{{ b }}</option>
          </select>
          <select v-model.number="filterTahun" class="filter-sm">
            <option v-for="y in TAHUN_LIST" :key="y" :value="y">{{ y }}</option>
          </select>
          <button class="btn-toggle" :class="{ active: modeTahun }" @click="modeTahun = !modeTahun">
            {{ modeTahun ? 'Per Tahun' : 'Per Bulan' }}
          </button>
          <button class="btn-load" @click="loadData" :disabled="loading">
            {{ loading ? 'Memuat...' : 'Tampilkan' }}
          </button>
        </div>
        <button class="btn-export" @click="exportCsv" :disabled="!data || loading">⬇ Export CSV</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">Memuat laporan SLA...</div>

    <template v-else-if="data">
      <!-- Summary Cards -->
      <div class="kpi-row">
        <div class="kpi-card blue">
          <div class="kpi-val">{{ data.summary.total_tiket }}</div>
          <div class="kpi-label">Total Tiket</div>
          <div class="kpi-sub">{{ data.summary.total_resolved }} resolved</div>
        </div>
        <div class="kpi-card" :class="data.summary.compliance_pct >= 95 ? 'green' : 'red'">
          <div class="kpi-val">{{ fmtPct(data.summary.compliance_pct) }}</div>
          <div class="kpi-label">Kepatuhan SLA</div>
          <div class="kpi-sub">Target {{ data.target_umum }}%</div>
        </div>
        <div class="kpi-card" :class="data.summary.compliance_fo_pct >= 99 ? 'green' : 'red'">
          <div class="kpi-val">{{ fmtPct(data.summary.compliance_fo_pct) }}</div>
          <div class="kpi-label">Kepatuhan FO</div>
          <div class="kpi-sub">Target {{ data.target_fo }}%</div>
        </div>
        <div class="kpi-card" :class="data.summary.total_breach > 0 ? 'red' : 'green'">
          <div class="kpi-val">{{ data.summary.total_breach }}</div>
          <div class="kpi-label">Total Breach</div>
          <div class="kpi-sub">tiket melewati SLA</div>
        </div>
        <div class="kpi-card gray">
          <div class="kpi-val">{{ fmtMenit(data.summary.avg_mttr_menit) }}</div>
          <div class="kpi-label">Avg MTTR</div>
          <div class="kpi-sub">rata-rata waktu resolve</div>
        </div>
      </div>

      <!-- Trend Chart -->
      <div class="card">
        <div class="card-header">
          <h3>Tren Kepatuhan SLA (12 Bulan Terakhir)</h3>
          <div class="legend-inline">
            <span class="leg-dot" style="background:#3b82f6"></span><span>Umum</span>
            <span class="leg-dot ml8" style="background:#22c55e"></span><span>FO</span>
            <span class="leg-line amber ml8"></span><span>95%</span>
            <span class="leg-line blue-line ml8"></span><span>99%</span>
          </div>
        </div>
        <div class="chart-wrap">
          <svg :viewBox="`0 0 ${SVG_W} ${SVG_H}`" class="trend-svg" xmlns="http://www.w3.org/2000/svg">
            <!-- Grid lines & Y labels -->
            <g v-for="tick in yTicks" :key="tick">
              <line :x1="PAD_L" :y1="yToSvg(tick)" :x2="SVG_W - PAD_R" :y2="yToSvg(tick)"
                stroke="#f1f5f9" stroke-width="1" />
              <text :x="PAD_L - 4" :y="yToSvg(tick) + 4" text-anchor="end" font-size="10" fill="#94a3b8">{{ tick }}%</text>
            </g>
            <!-- Threshold lines -->
            <line :x1="PAD_L" :y1="yToSvg(95)" :x2="SVG_W - PAD_R" :y2="yToSvg(95)"
              stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5,3" />
            <text :x="SVG_W - PAD_R + 2" :y="yToSvg(95) + 4" font-size="9" fill="#f59e0b">95%</text>
            <line :x1="PAD_L" :y1="yToSvg(99)" :x2="SVG_W - PAD_R" :y2="yToSvg(99)"
              stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="5,3" />
            <text :x="SVG_W - PAD_R + 2" :y="yToSvg(99) + 4" font-size="9" fill="#3b82f6">99%</text>
            <!-- Bars per month -->
            <g v-for="(m, i) in trendData" :key="m.bulan">
              <rect :x="barX(i, 0)" :y="barY(m.compliance_pct)" :width="barW" :height="barH(m.compliance_pct)"
                fill="#3b82f6" rx="2" opacity="0.85" />
              <rect :x="barX(i, 1)" :y="barY(m.fo_compliance_pct)" :width="barW" :height="barH(m.fo_compliance_pct)"
                fill="#22c55e" rx="2" opacity="0.85" />
              <text :x="barX(i, 0) + barW" :y="SVG_H - PAD_B + 14" text-anchor="middle" font-size="9" fill="#64748b">
                {{ m.bulan }}
              </text>
            </g>
          </svg>
        </div>
      </div>

      <!-- Per Layanan -->
      <div class="card">
        <h3>Kepatuhan SLA per Layanan</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Layanan</th>
                <th>FO</th>
                <th>Target</th>
                <th>Total Tiket</th>
                <th>Breach</th>
                <th>Kepatuhan</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in data.per_layanan" :key="l.id_layanan">
                <td class="mono">{{ l.kode_layanan }}</td>
                <td>{{ l.nama_layanan }}</td>
                <td><span v-if="l.is_fo" class="badge-fo">FO</span></td>
                <td>{{ l.target_pct }}%</td>
                <td>{{ l.total_tiket }}</td>
                <td :class="{ 'red-text': l.breach > 0 }">{{ l.breach }}</td>
                <td>
                  <div class="pct-cell">
                    <div class="pct-bar-wrap">
                      <div class="pct-bar-fill"
                        :style="{ width: Math.min(l.compliance_pct, 100) + '%', background: l.status === 'OK' ? '#22c55e' : '#ef4444' }"></div>
                    </div>
                    <span>{{ fmtPct(l.compliance_pct) }}</span>
                  </div>
                </td>
                <td><span class="status-badge" :class="l.status.toLowerCase()">{{ l.status }}</span></td>
              </tr>
              <tr v-if="!data.per_layanan.length">
                <td colspan="8" class="empty">Tidak ada data layanan pada periode ini</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per Pelanggan -->
      <div class="card">
        <h3>Kepatuhan SLA per Pelanggan</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Pelanggan</th>
                <th>Total Tiket</th>
                <th>Breach</th>
                <th>Target</th>
                <th>Kepatuhan</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data.per_pelanggan" :key="p.id_pelanggan">
                <td class="mono">{{ p.kode_pelanggan }}</td>
                <td>{{ p.nama_pelanggan }}</td>
                <td>{{ p.total_tiket }}</td>
                <td :class="{ 'red-text': p.breach > 0 }">{{ p.breach }}</td>
                <td>{{ p.target_pct }}%</td>
                <td>
                  <div class="pct-cell">
                    <div class="pct-bar-wrap">
                      <div class="pct-bar-fill"
                        :style="{ width: Math.min(p.compliance_pct, 100) + '%', background: p.status === 'OK' ? '#22c55e' : '#ef4444' }"></div>
                    </div>
                    <span>{{ fmtPct(p.compliance_pct) }}</span>
                  </div>
                </td>
                <td><span class="status-badge" :class="p.status.toLowerCase()">{{ p.status }}</span></td>
              </tr>
              <tr v-if="!data.per_pelanggan.length">
                <td colspan="7" class="empty">Tidak ada data pelanggan pada periode ini</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Breach Detail -->
      <div class="card">
        <h3>Detail Breach SLA <span class="card-note">(maks 100, diurutkan terlama)</span></h3>
        <div class="table-wrap">
          <table class="data-table breach-table">
            <thead>
              <tr>
                <th>No Tiket</th>
                <th>Judul</th>
                <th>Pelanggan</th>
                <th>Site</th>
                <th>Layanan</th>
                <th>Prioritas</th>
                <th>Tgl Open</th>
                <th>SLA Due</th>
                <th>Terlambat</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in data.breach_detail" :key="b.id_ticket">
                <td class="mono">{{ b.nomor_tiket }}</td>
                <td class="judul-cell" :title="b.judul_tiket">{{ b.judul_tiket }}</td>
                <td>{{ b.nama_pelanggan }}</td>
                <td>{{ b.nama_site }}</td>
                <td class="mono">{{ b.kode_layanan }}</td>
                <td><span class="prio-badge" :class="b.prioritas.toLowerCase()">{{ b.prioritas }}</span></td>
                <td class="date-cell">{{ fmtDate(b.tgl_open) }}</td>
                <td class="date-cell">{{ fmtDate(b.sla_due) }}</td>
                <td class="red-text">{{ fmtMenit(b.terlambat_menit) }}</td>
                <td><span class="status-tiket">{{ b.status_tiket.replace('_', ' ') }}</span></td>
              </tr>
              <tr v-if="!data.breach_detail.length">
                <td colspan="10" class="empty">Tidak ada breach pada periode ini</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-else-if="!loading" class="empty-state">
      <p>Pilih periode dan klik <strong>Tampilkan</strong> untuk memuat laporan SLA.</p>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1280px; }

/* Header */
.page-header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.filter-row { display: flex; gap: 6px; align-items: center; }
.filter-sm { padding: 6px 8px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 12px; outline: none; background: #fff; }
.filter-sm:disabled { opacity: 0.5; }
.btn-toggle { padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1.5px solid #e2e8f0; background: #f8fafc; color: #475569; transition: all 0.15s; }
.btn-toggle.active { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.btn-load { padding: 6px 18px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; background: #1d4ed8; color: #fff; transition: background 0.15s; }
.btn-load:hover:not(:disabled) { background: #1e40af; }
.btn-load:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-export { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #a7f3d0; background: #ecfdf5; color: #15803d; transition: background 0.15s; }
.btn-export:hover:not(:disabled) { background: #d1fae5; }
.btn-export:disabled { opacity: 0.5; cursor: not-allowed; }

/* KPI Cards */
.kpi-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.kpi-card { flex: 1; min-width: 150px; background: #fff; border-radius: 12px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); border-top: 4px solid #e2e8f0; }
.kpi-card.blue { border-top-color: #3b82f6; }
.kpi-card.green { border-top-color: #22c55e; }
.kpi-card.red { border-top-color: #ef4444; }
.kpi-card.gray { border-top-color: #94a3b8; }
.kpi-val { font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1.1; }
.kpi-label { font-size: 12px; color: #64748b; margin-top: 4px; }
.kpi-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }

/* Card */
.card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; margin-bottom: 16px; }
.card h3 { margin: 0 0 16px; font-size: 15px; color: #0f172a; font-weight: 700; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h3 { margin: 0; }
.card-note { font-size: 12px; font-weight: 400; color: #94a3b8; }

/* Chart */
.chart-wrap { width: 100%; overflow-x: auto; }
.trend-svg { width: 100%; min-width: 560px; display: block; }
.legend-inline { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #64748b; flex-wrap: wrap; }
.leg-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.leg-line { display: inline-block; width: 20px; height: 0; border-top: 2px dashed; vertical-align: middle; flex-shrink: 0; }
.leg-line.amber { border-color: #f59e0b; }
.leg-line.blue-line { border-color: #3b82f6; }
.ml8 { margin-left: 8px; }

/* Table */
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 600px; }
.data-table th { text-align: left; padding: 8px 10px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
.data-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
.data-table tr:hover td { background: #f8fafc; }
.empty { text-align: center; color: #94a3b8; padding: 28px !important; font-size: 13px; }

.mono { font-family: monospace; font-size: 12px; color: #475569; }
.date-cell { white-space: nowrap; font-size: 12px; }
.red-text { color: #ef4444; font-weight: 700; }
.judul-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Badges */
.status-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px; white-space: nowrap; display: inline-block; }
.status-badge.ok { background: #dcfce7; color: #15803d; }
.status-badge.breach { background: #fee2e2; color: #dc2626; }
.badge-fo { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: #eff6ff; color: #1d4ed8; display: inline-block; }
.prio-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; display: inline-block; }
.prio-badge.low { background: #f1f5f9; color: #64748b; }
.prio-badge.medium { background: #eff6ff; color: #1d4ed8; }
.prio-badge.high { background: #fff7ed; color: #c2410c; }
.prio-badge.critical { background: #fef2f2; color: #dc2626; }
.status-tiket { font-size: 12px; color: #475569; }

/* Progress bar */
.pct-cell { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.pct-bar-wrap { flex-shrink: 0; width: 56px; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
.pct-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }

/* States */
.loading-state { padding: 60px; text-align: center; color: #94a3b8; font-size: 15px; }
.empty-state { padding: 60px; text-align: center; color: #94a3b8; font-size: 14px; }
.empty-state strong { color: #475569; }

@media (max-width: 768px) {
  .page { padding: 16px; }
  .page-header { flex-direction: column; }
  .header-actions { flex-direction: column; align-items: flex-start; }
  .kpi-row { gap: 8px; }
  .kpi-card { min-width: 140px; }
}
</style>
