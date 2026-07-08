<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const router = useRouter()
const auth   = useAuthStore()

const summary  = ref<any>(null)
const revenue  = ref<any[]>([])
const loading  = ref(true)

onMounted(async () => {
  try {
    const [s, r] = await Promise.all([
      api.get('/reports/dashboard'),
      api.get('/reports/revenue'),
    ])
    summary.value = s.data.data
    revenue.value = r.data.data
  } catch {}
  finally { loading.value = false }
})

const kpi = computed(() => summary.value?.kpi || {})
const tiketByStatus = computed(() => summary.value?.tiket_by_status || [])
const pipeline = computed(() => summary.value?.sales_pipeline || {})
const tiketTerbaru = computed(() => summary.value?.tiket_terbaru || [])
const quotationTerbaru = computed(() => summary.value?.quotation_terbaru || [])

// Revenue chart
const maxMrc = computed(() => Math.max(...revenue.value.map((r: any) => r.mrc), 1))
function barH(mrc: number) {
  return Math.max(4, Math.round((mrc / maxMrc.value) * 120))
}

// Tiket status chart
const STATUS_ORDER = ['Open', 'In_Progress', 'Pending', 'Resolved', 'Closed']
const STATUS_COLOR: Record<string, string> = {
  Open:        '#3b82f6',
  In_Progress: '#f59e0b',
  Pending:     '#8b5cf6',
  Resolved:    '#10b981',
  Closed:      '#94a3b8',
}
const maxTiket = computed(() => Math.max(...tiketByStatus.value.map((t: any) => t.count), 1))

function fmt(n: number) {
  if (!n) return 'Rp 0'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  Open:        { bg: '#eff6ff', color: '#1d4ed8' },
  In_Progress: { bg: '#fffbeb', color: '#b45309' },
  Pending:     { bg: '#f5f3ff', color: '#6d28d9' },
  Resolved:    { bg: '#f0fdf4', color: '#15803d' },
  Closed:      { bg: '#f8fafc', color: '#64748b' },
  Draft:       { bg: '#f8fafc', color: '#64748b' },
  Approved:    { bg: '#f0fdf4', color: '#15803d' },
  Rejected:    { bg: '#fef2f2', color: '#dc2626' },
}

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 18) return 'Selamat sore'
  return 'Selamat malam'
})

const today = computed(() =>
  new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
)
</script>

<template>
  <div class="dash">

    <!-- Header -->
    <div class="dash-header">
      <div>
        <div class="dash-greeting">{{ greeting }}, <strong>{{ auth.user?.nama_lengkap }}</strong> 👋</div>
        <div class="dash-date">{{ today }}</div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>Memuat data dashboard...</span>
    </div>

    <template v-else>

      <!-- KPI Cards Row 1 -->
      <div class="kpi-grid">
        <div class="kpi-card blue" @click="router.push('/contracts')">
          <div class="kpi-icon">📋</div>
          <div class="kpi-body">
            <div class="kpi-label">Kontrak Aktif</div>
            <div class="kpi-value">{{ kpi.kontrak_aktif ?? '—' }}</div>
            <div class="kpi-sub">{{ kpi.total_pelanggan }} pelanggan</div>
          </div>
        </div>
        <div class="kpi-card green" @click="router.push('/reports')">
          <div class="kpi-icon">💰</div>
          <div class="kpi-body">
            <div class="kpi-label">Revenue MRC</div>
            <div class="kpi-value">{{ fmt(kpi.total_mrc_aktif) }}</div>
            <div class="kpi-sub">per bulan, kontrak aktif</div>
          </div>
        </div>
        <div class="kpi-card amber" @click="router.push('/operations')">
          <div class="kpi-icon">🎫</div>
          <div class="kpi-body">
            <div class="kpi-label">Tiket Aktif</div>
            <div class="kpi-value">{{ kpi.tiket_aktif ?? '—' }}</div>
            <div class="kpi-sub">{{ kpi.tiket_open }} open · {{ kpi.tiket_in_progress }} in progress</div>
          </div>
        </div>
        <div class="kpi-card purple" @click="router.push('/projects')">
          <div class="kpi-icon">🏗️</div>
          <div class="kpi-body">
            <div class="kpi-label">Proyek Berjalan</div>
            <div class="kpi-value">{{ kpi.proyek_berjalan ?? '—' }}</div>
            <div class="kpi-sub">kickoff, instalasi, testing</div>
          </div>
        </div>
      </div>

      <!-- Alert strip -->
      <div v-if="kpi.kontrak_akan_berakhir > 0" class="alert-strip">
        ⚠️ <strong>{{ kpi.kontrak_akan_berakhir }} kontrak</strong> akan berakhir dalam 30 hari ke depan
        <button class="alert-link" @click="router.push('/contracts')">Lihat →</button>
      </div>

      <!-- Charts row -->
      <div class="charts-row">

        <!-- Revenue bar chart -->
        <div class="chart-card wide">
          <div class="chart-header">
            <div class="chart-title">Revenue MRC — 12 Bulan Terakhir</div>
            <div class="chart-sub">Nilai kontrak aktif per bulan</div>
          </div>
          <div class="bar-chart" v-if="revenue.length">
            <div class="bar-area">
              <div v-for="r in revenue" :key="r.label" class="bar-col">
                <div class="bar-tip">{{ fmt(r.mrc) }}</div>
                <div class="bar-fill" :style="{ height: barH(r.mrc) + 'px' }"></div>
                <div class="bar-label">{{ r.label }}</div>
              </div>
            </div>
          </div>
          <div v-else class="chart-empty">Belum ada data kontrak</div>
        </div>

        <!-- Tiket by status -->
        <div class="chart-card narrow">
          <div class="chart-header">
            <div class="chart-title">Tiket per Status</div>
            <div class="chart-sub">Semua tiket</div>
          </div>
          <div class="status-chart" v-if="tiketByStatus.length">
            <div v-for="s in tiketByStatus" :key="s.status" class="status-row">
              <div class="status-label">{{ s.status.replace('_', ' ') }}</div>
              <div class="status-bar-wrap">
                <div class="status-bar-fill"
                  :style="{ width: Math.round((s.count / maxTiket) * 100) + '%', background: STATUS_COLOR[s.status] || '#94a3b8' }">
                </div>
              </div>
              <div class="status-count">{{ s.count }}</div>
            </div>
          </div>
          <div v-else class="chart-empty">Belum ada tiket</div>

          <!-- Sales pipeline -->
          <div class="pipeline-section">
            <div class="chart-title" style="margin-bottom:12px">Sales Pipeline</div>
            <div class="pipeline-steps">
              <div class="pip-step">
                <div class="pip-val">{{ pipeline.leads ?? 0 }}</div>
                <div class="pip-label">Lead</div>
              </div>
              <div class="pip-arrow">›</div>
              <div class="pip-step">
                <div class="pip-val">{{ pipeline.opportunities ?? 0 }}</div>
                <div class="pip-label">Opportunity</div>
              </div>
              <div class="pip-arrow">›</div>
              <div class="pip-step">
                <div class="pip-val amber-text">{{ pipeline.quotation_draft ?? 0 }}</div>
                <div class="pip-label">Draft</div>
              </div>
              <div class="pip-arrow">›</div>
              <div class="pip-step">
                <div class="pip-val green-text">{{ pipeline.quotation_approved ?? 0 }}</div>
                <div class="pip-label">Approved</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent row -->
      <div class="recent-row">

        <!-- Tiket terbaru -->
        <div class="recent-card">
          <div class="recent-header">
            <div class="recent-title">Tiket Terbaru</div>
            <button class="recent-link" @click="router.push('/operations')">Lihat semua →</button>
          </div>
          <div v-if="!tiketTerbaru.length" class="recent-empty">Belum ada tiket</div>
          <div v-else class="recent-list">
            <div v-for="t in tiketTerbaru" :key="t.id_ticket"
              class="recent-item" @click="router.push(`/operations/${t.id_ticket}`)">
              <div class="ri-top">
                <span class="ri-nomor">{{ t.nomor_tiket }}</span>
                <span class="ri-badge"
                  :style="{ background: STATUS_BADGE[t.status_tiket]?.bg, color: STATUS_BADGE[t.status_tiket]?.color }">
                  {{ t.status_tiket?.replace('_',' ') }}
                </span>
              </div>
              <div class="ri-title">{{ t.judul_tiket }}</div>
              <div class="ri-meta">{{ t.site?.pelanggan?.nama_pelanggan }} · {{ t.site?.nama_site }}</div>
              <div class="ri-time">{{ fmtDate(t.tgl_open) }}</div>
            </div>
          </div>
        </div>

        <!-- Quotation terbaru -->
        <div class="recent-card">
          <div class="recent-header">
            <div class="recent-title">Quotation Terbaru</div>
            <button class="recent-link" @click="router.push('/sales/quotation')">Lihat semua →</button>
          </div>
          <div v-if="!quotationTerbaru.length" class="recent-empty">Belum ada quotation</div>
          <div v-else class="recent-list">
            <div v-for="q in quotationTerbaru" :key="q.id_quotation"
              class="recent-item" @click="router.push(`/sales/quotation/${q.id_quotation}`)">
              <div class="ri-top">
                <span class="ri-nomor">{{ q.nomor_quotation }}</span>
                <span class="ri-badge"
                  :style="{ background: STATUS_BADGE[q.status_approval]?.bg, color: STATUS_BADGE[q.status_approval]?.color }">
                  {{ q.status_approval }}
                </span>
              </div>
              <div class="ri-title">{{ q.opportunity?.nama_opportunity }}</div>
              <div class="ri-meta">{{ q.opportunity?.lead?.nama_prospek }}</div>
              <div class="ri-time">Sales: {{ q.sales_pic?.nama_lengkap }}</div>
            </div>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>

<style scoped>
.dash { padding: 24px 28px; max-width: 1280px; }

/* Header */
.dash-header { margin-bottom: 24px; }
.dash-greeting { font-size: 20px; color: #0f172a; }
.dash-greeting strong { font-weight: 700; }
.dash-date { font-size: 13px; color: #94a3b8; margin-top: 3px; }

/* Loading */
.loading-state { display: flex; align-items: center; gap: 12px; padding: 60px; color: #94a3b8; justify-content: center; }
.spinner { width: 20px; height: 20px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* KPI grid */
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px; }
.kpi-card {
  display: flex; align-items: flex-start; gap: 14px;
  background: #fff; border-radius: 12px; padding: 18px 20px;
  border: 1.5px solid #e9edf2; cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
.kpi-icon { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
.kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 5px; }
.kpi-value { font-size: 22px; font-weight: 800; line-height: 1; margin-bottom: 5px; }
.kpi-sub { font-size: 11px; }

.kpi-card.blue  { border-top: 3px solid #3b82f6; }
.kpi-card.blue  .kpi-label { color: #1d4ed8; }
.kpi-card.blue  .kpi-value { color: #1e40af; }
.kpi-card.blue  .kpi-sub   { color: #64748b; }

.kpi-card.green { border-top: 3px solid #10b981; }
.kpi-card.green .kpi-label { color: #059669; }
.kpi-card.green .kpi-value { color: #065f46; }
.kpi-card.green .kpi-sub   { color: #64748b; }

.kpi-card.amber { border-top: 3px solid #f59e0b; }
.kpi-card.amber .kpi-label { color: #b45309; }
.kpi-card.amber .kpi-value { color: #92400e; }
.kpi-card.amber .kpi-sub   { color: #64748b; }

.kpi-card.purple { border-top: 3px solid #8b5cf6; }
.kpi-card.purple .kpi-label { color: #6d28d9; }
.kpi-card.purple .kpi-value { color: #4c1d95; }
.kpi-card.purple .kpi-sub   { color: #64748b; }

/* Alert strip */
.alert-strip {
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px;
  padding: 11px 16px; font-size: 13px; color: #92400e;
  display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
}
.alert-link { margin-left: auto; background: none; border: none; color: #b45309; font-weight: 700; font-size: 13px; cursor: pointer; }
.alert-link:hover { text-decoration: underline; }

/* Charts row */
.charts-row { display: grid; grid-template-columns: 1fr 340px; gap: 14px; margin-bottom: 14px; }
.chart-card {
  background: #fff; border-radius: 12px; padding: 20px 22px;
  border: 1px solid #e9edf2;
}
.chart-header { margin-bottom: 18px; }
.chart-title { font-size: 14px; font-weight: 700; color: #0f172a; }
.chart-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.chart-empty { color: #94a3b8; font-size: 13px; text-align: center; padding: 30px 0; }

/* Bar chart */
.bar-area {
  display: flex; align-items: flex-end; gap: 6px;
  height: 140px; padding-bottom: 28px; position: relative;
}
.bar-col { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
.bar-tip {
  font-size: 9px; color: #64748b; white-space: nowrap;
  opacity: 0; transition: opacity 0.15s;
}
.bar-col:hover .bar-tip { opacity: 1; }
.bar-fill {
  width: 100%; min-height: 4px; border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%);
  transition: opacity 0.15s;
}
.bar-col:hover .bar-fill { opacity: 0.8; }
.bar-label { font-size: 9px; color: #94a3b8; white-space: nowrap; }

/* Status chart */
.status-chart { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.status-row { display: flex; align-items: center; gap: 8px; }
.status-label { font-size: 12px; color: #374151; width: 80px; flex-shrink: 0; }
.status-bar-wrap { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.status-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.status-count { font-size: 12px; font-weight: 700; color: #374151; width: 28px; text-align: right; flex-shrink: 0; }

/* Pipeline */
.pipeline-section { border-top: 1px solid #f1f5f9; padding-top: 16px; }
.pipeline-steps { display: flex; align-items: center; gap: 4px; }
.pip-step { flex: 1; text-align: center; }
.pip-val { font-size: 18px; font-weight: 800; color: #0f172a; }
.pip-val.amber-text { color: #b45309; }
.pip-val.green-text { color: #059669; }
.pip-label { font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 3px; }
.pip-arrow { color: #cbd5e1; font-size: 18px; flex-shrink: 0; }

/* Recent row */
.recent-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.recent-card { background: #fff; border-radius: 12px; border: 1px solid #e9edf2; overflow: hidden; }
.recent-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 12px; border-bottom: 1px solid #f1f5f9;
}
.recent-title { font-size: 14px; font-weight: 700; color: #0f172a; }
.recent-link { background: none; border: none; font-size: 12px; color: #3b82f6; font-weight: 600; cursor: pointer; }
.recent-link:hover { text-decoration: underline; }
.recent-empty { padding: 32px 18px; text-align: center; font-size: 13px; color: #94a3b8; }
.recent-list { display: flex; flex-direction: column; }
.recent-item {
  padding: 12px 18px; border-bottom: 1px solid #f8fafc;
  cursor: pointer; transition: background 0.12s;
}
.recent-item:last-child { border-bottom: none; }
.recent-item:hover { background: #f8fafc; }
.ri-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.ri-nomor { font-size: 11px; font-weight: 700; color: #3b82f6; font-family: monospace; }
.ri-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 8px; }
.ri-title { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ri-meta { font-size: 11px; color: #64748b; }
.ri-time { font-size: 11px; color: #94a3b8; margin-top: 2px; }

@media (max-width: 1100px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .charts-row { grid-template-columns: 1fr; }
}
</style>
