<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import portalApi from '@/services/portalApi'

// ── Period selector ───────────────────────────────────────
const BULAN_LIST = [
  { value: 1, label: 'Januari' }, { value: 2,  label: 'Februari' },
  { value: 3, label: 'Maret'   }, { value: 4,  label: 'April'    },
  { value: 5, label: 'Mei'     }, { value: 6,  label: 'Juni'     },
  { value: 7, label: 'Juli'    }, { value: 8,  label: 'Agustus'  },
  { value: 9, label: 'September' }, { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' }, { value: 12, label: 'Desember' },
]
const now      = new Date()
const TAHUN_LIST = [now.getFullYear() - 1, now.getFullYear()]

const bulan    = ref(now.getMonth() + 1)
const tahun    = ref(now.getFullYear())
const perTahun = ref(false)

// ── Data ─────────────────────────────────────────────────
const loading = ref(true)
const data    = ref<any>(null)
const error   = ref('')

async function fetchSla() {
  loading.value = true
  error.value   = ''
  try {
    const params: any = { tahun: tahun.value }
    if (perTahun.value) { params.mode = 'year' }
    else                { params.bulan = bulan.value }
    const res  = await portalApi.get('/portal/sla', { params })
    data.value = res.data.data
  } catch (e: any) {
    error.value = 'Gagal memuat data SLA. Silakan coba lagi.'
  } finally {
    loading.value = false
  }
}

onMounted(fetchSla)

// ── Computed helpers ──────────────────────────────────────
const summary      = computed(() => data.value?.summary)
const targetPct    = computed(() => data.value?.target_pct ?? 99)
const compliance   = computed(() => summary.value?.compliance_pct ?? 100)
const isOk         = computed(() => compliance.value >= targetPct.value)
const statusMsg    = computed(() =>
  isOk.value
    ? 'Kami berhasil memenuhi target SLA Anda pada periode ini.'
    : 'Bulan ini SLA kami di bawah target — kami sedang bekerja keras memperbaikinya.'
)

// ── SVG Trend Chart ───────────────────────────────────────
const CHART_W   = 560
const CHART_H   = 160
const BAR_W     = 48
const GAP       = 26
const AXIS_B    = 30 // bottom axis height
const AXIS_L    = 38 // left axis width

const chartInnerH = CHART_H - AXIS_B
const chartInnerW = CHART_W - AXIS_L

const trend = computed(() => data.value?.trend ?? [])

function barX(i: number) {
  const total = trend.value.length
  const step  = chartInnerW / total
  return AXIS_L + step * i + (step - BAR_W) / 2
}

function barHeight(comp: number) {
  const ratio = Math.min(comp, 100) / 100
  return ratio * (chartInnerH - 20)
}

function barY(comp: number) {
  return chartInnerH - barHeight(comp)
}

function barColor(comp: number) {
  return comp >= targetPct.value ? '#22c55e' : '#ef4444'
}

function thresholdY() {
  const ratio = Math.min(targetPct.value, 100) / 100
  return chartInnerH - ratio * (chartInnerH - 20)
}

function labelX(i: number) {
  const total = trend.value.length
  const step  = chartInnerW / total
  return AXIS_L + step * i + step / 2
}

// ── Formatting ────────────────────────────────────────────
function fmtPct(n: number) { return n.toFixed(1) + '%' }
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtMttr(menit: number) {
  if (menit < 60) return `${menit} mnt`
  const h = Math.floor(menit / 60)
  const m = menit % 60
  return m === 0 ? `${h} jam` : `${h} jam ${m} mnt`
}
function prioritasCls(p: string) {
  if (p === 'Critical') return 'pri-critical'
  if (p === 'High')     return 'pri-high'
  if (p === 'Medium')   return 'pri-medium'
  return 'pri-low'
}
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <h2>Laporan SLA Layanan Anda</h2>
      <p class="page-sub">Pantau kepatuhan tingkat layanan (SLA) untuk semua site Anda.</p>
    </div>

    <!-- Period selector -->
    <div class="filters">
      <div class="filter-row">
        <div class="filter-group" v-if="!perTahun">
          <label>Bulan</label>
          <select v-model="bulan" class="sel">
            <option v-for="b in BULAN_LIST" :key="b.value" :value="b.value">{{ b.label }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Tahun</label>
          <select v-model="tahun" class="sel">
            <option v-for="y in TAHUN_LIST" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>
        <label class="toggle-wrap">
          <input type="checkbox" v-model="perTahun" />
          <span class="toggle-label">Per Tahun</span>
        </label>
        <button class="btn-show" @click="fetchSla">Tampilkan</button>
      </div>
    </div>

    <!-- Loading / Error -->
    <div v-if="loading" class="loading">Memuat data SLA...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <!-- Content -->
    <template v-else-if="data">
      <!-- Status banner -->
      <div :class="['status-banner', isOk ? 'banner-ok' : 'banner-breach']">
        <span class="banner-icon">{{ isOk ? '✅' : '⚠️' }}</span>
        <span class="banner-text">{{ statusMsg }}</span>
        <span class="banner-periode">Periode: {{ data.periode }}</span>
      </div>

      <!-- Big compliance badge + summary cards -->
      <div class="top-row">
        <!-- Big circle -->
        <div class="compliance-circle-wrap">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="68" fill="none" stroke="#e2e8f0" stroke-width="12" />
            <circle
              cx="80" cy="80" r="68"
              fill="none"
              :stroke="isOk ? '#22c55e' : '#ef4444'"
              stroke-width="12"
              stroke-linecap="round"
              stroke-dasharray="427"
              :stroke-dashoffset="427 - (427 * compliance / 100)"
              transform="rotate(-90 80 80)"
            />
            <text x="80" y="75" text-anchor="middle" font-size="26" font-weight="800" :fill="isOk ? '#16a34a' : '#dc2626'" font-family="Inter,sans-serif">
              {{ fmtPct(compliance) }}
            </text>
            <text x="80" y="98" text-anchor="middle" font-size="11" fill="#64748b" font-family="Inter,sans-serif">Compliance</text>
          </svg>
          <div class="circle-target">Target: {{ fmtPct(targetPct) }}</div>
        </div>

        <!-- Summary cards -->
        <div class="summary-cards">
          <div class="card">
            <div class="card-val">{{ summary.total_tiket }}</div>
            <div class="card-lbl">Total Tiket</div>
          </div>
          <div class="card" :class="{ 'card-red': summary.total_breach > 0 }">
            <div class="card-val">{{ summary.total_breach }}</div>
            <div class="card-lbl">Tiket Breach</div>
          </div>
          <div class="card">
            <div class="card-val">{{ fmtMttr(summary.avg_mttr_menit) }}</div>
            <div class="card-lbl">Rata-rata Waktu Penyelesaian</div>
          </div>
        </div>
      </div>

      <!-- Trend Chart -->
      <div class="section">
        <h3 class="section-title">Tren SLA 6 Bulan Terakhir</h3>
        <div class="chart-wrap">
          <svg :width="CHART_W" :height="CHART_H" class="trend-chart">
            <!-- Y-axis labels -->
            <text x="2" :y="chartInnerH - (chartInnerH - 20) * 1 + 5" font-size="10" fill="#94a3b8" font-family="Inter,sans-serif">100%</text>
            <text x="2" :y="chartInnerH - (chartInnerH - 20) * 0.5 + 5" font-size="10" fill="#94a3b8" font-family="Inter,sans-serif">50%</text>
            <text x="2" y="15" font-size="10" fill="#94a3b8" font-family="Inter,sans-serif">0%</text>

            <!-- Grid lines -->
            <line :x1="AXIS_L" :y1="chartInnerH - (chartInnerH - 20)" :x2="CHART_W" :y2="chartInnerH - (chartInnerH - 20)" stroke="#f1f5f9" stroke-width="1" />
            <line :x1="AXIS_L" :y1="chartInnerH - (chartInnerH - 20) * 0.5" :x2="CHART_W" :y2="chartInnerH - (chartInnerH - 20) * 0.5" stroke="#f1f5f9" stroke-width="1" />

            <!-- Bars -->
            <g v-for="(m, i) in trend" :key="m.bulan">
              <rect
                :x="barX(i)"
                :y="barY(m.compliance_pct)"
                :width="BAR_W"
                :height="barHeight(m.compliance_pct)"
                :fill="barColor(m.compliance_pct)"
                rx="3"
              />
              <text
                :x="barX(i) + BAR_W / 2"
                :y="barY(m.compliance_pct) - 4"
                text-anchor="middle"
                font-size="9"
                :fill="barColor(m.compliance_pct)"
                font-family="Inter,sans-serif"
                font-weight="700"
              >{{ m.compliance_pct.toFixed(1) }}%</text>
              <!-- X label -->
              <text
                :x="labelX(i)"
                :y="CHART_H - 8"
                text-anchor="middle"
                font-size="10"
                fill="#64748b"
                font-family="Inter,sans-serif"
              >{{ m.bulan }}</text>
            </g>

            <!-- Threshold line -->
            <line
              :x1="AXIS_L"
              :y1="thresholdY()"
              :x2="CHART_W"
              :y2="thresholdY()"
              stroke="#f59e0b"
              stroke-width="1.5"
              stroke-dasharray="5 4"
            />
            <text
              :x="CHART_W - 4"
              :y="thresholdY() - 4"
              text-anchor="end"
              font-size="9"
              fill="#d97706"
              font-family="Inter,sans-serif"
            >Target {{ fmtPct(targetPct) }}</text>
          </svg>
        </div>
      </div>

      <!-- Per-site table -->
      <div class="section">
        <h3 class="section-title">SLA per Site</h3>
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Nama Site</th>
                <th>Layanan</th>
                <th class="tc">Target</th>
                <th class="tc">Compliance</th>
                <th class="tc">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in data.per_site" :key="s.id_site">
                <td>
                  <div class="site-name">{{ s.nama_site }}</div>
                  <div class="site-kode">{{ s.kode_site }}</div>
                </td>
                <td>
                  <div class="layanan-name">{{ s.nama_layanan || '—' }}</div>
                  <div v-if="s.kode_layanan" class="layanan-kode">{{ s.kode_layanan }}</div>
                </td>
                <td class="tc">{{ fmtPct(s.target_pct) }}</td>
                <td class="tc">
                  <span v-if="s.total_tiket === 0" class="muted">Tidak ada insiden</span>
                  <span v-else :class="s.status === 'OK' ? 'pct-ok' : 'pct-breach'">{{ fmtPct(s.compliance_pct) }}</span>
                </td>
                <td class="tc">
                  <span :class="['badge-st', s.status === 'OK' ? 'st-ok' : 'st-breach']">
                    {{ s.status === 'OK' ? '✓ OK' : '✗ BREACH' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Breach detail -->
      <div class="section" v-if="data.breach_detail?.length">
        <h3 class="section-title">Detail Tiket Breach</h3>
        <p class="section-sub">Tiket yang melampaui batas waktu SLA pada periode ini.</p>
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>No. Tiket</th>
                <th>Judul</th>
                <th>Site</th>
                <th class="tc">Prioritas</th>
                <th>Dibuka</th>
                <th>SLA Due</th>
                <th class="tc">Terlambat</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in data.breach_detail" :key="t.nomor_tiket">
                <td class="mono">{{ t.nomor_tiket }}</td>
                <td class="tiket-judul">{{ t.judul_tiket }}</td>
                <td>{{ t.nama_site }}</td>
                <td class="tc"><span :class="['badge-pri', prioritasCls(t.prioritas)]">{{ t.prioritas }}</span></td>
                <td class="ts">{{ fmtDate(t.tgl_open) }}</td>
                <td class="ts">{{ fmtDate(t.sla_due) }}</td>
                <td class="tc terlambat">+{{ fmtMttr(t.terlambat_menit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- No breach message -->
      <div class="section" v-else-if="summary.total_tiket > 0 && summary.total_breach === 0">
        <div class="no-breach">
          <span class="no-breach-icon">🎉</span>
          <div>
            <div class="no-breach-title">Tidak ada pelanggaran SLA!</div>
            <div class="no-breach-sub">Semua tiket pada periode ini diselesaikan tepat waktu.</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page        { padding: 28px 32px; max-width: 960px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; font-weight: 800; }
.page-sub    { margin: 0; font-size: 14px; color: #64748b; }
.loading     { padding: 60px; text-align: center; color: #94a3b8; }
.error-msg   { padding: 20px; background: #fef2f2; border-radius: 10px; color: #dc2626; font-size: 14px; }

/* Filters */
.filters     { margin-bottom: 24px; }
.filter-row  { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 4px; }
.filter-group label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.sel         { padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 7px; font-size: 13px; background: #fff; color: #0f172a; cursor: pointer; }
.toggle-wrap { display: flex; align-items: center; gap: 7px; cursor: pointer; font-size: 13px; font-weight: 500; color: #374151; align-self: flex-end; padding-bottom: 2px; }
.toggle-label { user-select: none; }
.btn-show    { padding: 8px 20px; background: #1d4ed8; color: #fff; border: none; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer; align-self: flex-end; }
.btn-show:hover { background: #1e40af; }

/* Status banner */
.status-banner { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-radius: 10px; margin-bottom: 24px; font-size: 14px; flex-wrap: wrap; }
.banner-ok     { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
.banner-breach { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }
.banner-icon   { font-size: 20px; flex-shrink: 0; }
.banner-text   { flex: 1; font-weight: 500; }
.banner-periode { font-size: 12px; opacity: 0.75; white-space: nowrap; }

/* Top row */
.top-row       { display: flex; align-items: center; gap: 32px; margin-bottom: 32px; flex-wrap: wrap; }
.compliance-circle-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.circle-target { font-size: 12px; color: #64748b; font-weight: 600; }

.summary-cards { display: flex; gap: 16px; flex-wrap: wrap; }
.card          { background: #fff; border-radius: 12px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); min-width: 140px; }
.card-red      { border-left: 3px solid #ef4444; }
.card-val      { font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
.card-lbl      { font-size: 12px; color: #64748b; font-weight: 500; }

/* Section */
.section       { margin-bottom: 32px; }
.section-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 8px; }
.section-sub   { font-size: 13px; color: #64748b; margin: 0 0 12px; }

/* Chart */
.chart-wrap    { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); overflow-x: auto; }
.trend-chart   { display: block; }

/* Table */
.table-wrap    { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); overflow: hidden; overflow-x: auto; }
.tbl           { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th        { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e2e8f0; }
.tbl td        { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }
.tbl tr:hover td { background: #f8fafc; }
.tc            { text-align: center; }
.site-name     { font-weight: 600; color: #0f172a; }
.site-kode     { font-size: 11px; color: #94a3b8; font-family: monospace; }
.layanan-name  { font-weight: 500; color: #374151; }
.layanan-kode  { font-size: 11px; color: #94a3b8; }
.muted         { color: #94a3b8; font-style: italic; font-size: 12px; }
.pct-ok        { color: #16a34a; font-weight: 700; }
.pct-breach    { color: #dc2626; font-weight: 700; }
.badge-st      { padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.st-ok         { background: #f0fdf4; color: #15803d; }
.st-breach     { background: #fef2f2; color: #dc2626; }

.mono          { font-family: monospace; font-size: 12px; color: #64748b; white-space: nowrap; }
.tiket-judul   { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #0f172a; font-weight: 500; }
.ts            { font-size: 12px; color: #64748b; white-space: nowrap; }
.terlambat     { color: #dc2626; font-weight: 700; }

.badge-pri     { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.pri-critical  { background: #fef2f2; color: #dc2626; }
.pri-high      { background: #fff7ed; color: #c2410c; }
.pri-medium    { background: #fffbeb; color: #b45309; }
.pri-low       { background: #f8fafc; color: #64748b; }

/* No breach box */
.no-breach     { display: flex; align-items: center; gap: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px 24px; }
.no-breach-icon { font-size: 32px; }
.no-breach-title { font-size: 15px; font-weight: 700; color: #15803d; }
.no-breach-sub   { font-size: 13px; color: #16a34a; margin-top: 2px; }
</style>
