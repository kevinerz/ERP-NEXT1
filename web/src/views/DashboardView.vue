<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const router = useRouter()
const auth   = useAuthStore()

const summary   = ref<any>(null)
const revenue   = ref<any[]>([])
const ticketRpt = ref<any>(null)
const projRpt   = ref<any>(null)
const loading   = ref(true)
const error     = ref('')

onMounted(async () => {
  try {
    const [s, r, tr, pr] = await Promise.all([
      api.get('/reports/dashboard'),
      api.get('/reports/revenue'),
      api.get('/reports/tickets'),
      api.get('/reports/projects'),
    ])
    summary.value   = s.data.data
    revenue.value   = r.data.data
    ticketRpt.value = tr.data.data
    projRpt.value   = pr.data.data
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Gagal memuat data dashboard'
  } finally { loading.value = false }
})

const kpi            = computed(() => summary.value?.kpi || {})
const tiketByStatus  = computed(() => summary.value?.tiket_by_status || [])
const pipeline       = computed(() => summary.value?.sales_pipeline || {})
const tiketTerbaru   = computed(() => summary.value?.tiket_terbaru || [])
const quotationTerbaru = computed(() => summary.value?.quotation_terbaru || [])
const woTerbaru      = computed(() => summary.value?.wo_terbaru || [])

// ── Revenue SVG chart ──────────────────────────────────────────
const CHART_W = 620, CHART_H = 150, PAD_L = 52, PAD_B = 28, PAD_T = 12
const plotW   = computed(() => CHART_W - PAD_L - 16)
const plotH   = computed(() => CHART_H - PAD_B - PAD_T)
const maxMrc  = computed(() => Math.max(...revenue.value.map((r: any) => r.mrc), 1))
function barX(i: number) { const n = revenue.value.length || 1; return PAD_L + (i / n) * plotW.value + 3 }
function barW() { const n = revenue.value.length || 1; return Math.max(4, plotW.value / n - 6) }
function barH(mrc: number) { return Math.max(2, (mrc / maxMrc.value) * plotH.value) }
function barY(mrc: number) { return PAD_T + plotH.value - barH(mrc) }
function yLabel(pct: number) { return fmt(maxMrc.value * pct) }
function yPos(pct: number) { return PAD_T + plotH.value * (1 - pct) }

// ── Donut chart tiket ──────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  Open: '#ef4444', In_Progress: '#f59e0b', Pending: '#8b5cf6', Resolved: '#10b981', Closed: '#94a3b8',
}
const donutTotal  = computed(() => tiketByStatus.value.reduce((s: number, t: any) => s + t.count, 0))
const donutSlices = computed(() => {
  let offset = 0
  const R = 38, cx = 50, cy = 50, stroke = 14, circ = 2 * Math.PI * R
  return tiketByStatus.value.map((t: any) => {
    const pct  = donutTotal.value ? t.count / donutTotal.value : 0
    const dash = pct * circ, gap = circ - dash
    const slice = { status: t.status, count: t.count, pct: Math.round(pct * 100), dash, gap, offset, R, cx, cy, stroke, circ, color: STATUS_COLOR[t.status] || '#94a3b8' }
    offset += dash
    return slice
  })
})

// ── Project status bars ────────────────────────────────────────
const PROJ_COLOR: Record<string, string> = {
  Kickoff: '#3b82f6', Perencanaan: '#8b5cf6', Instalasi: '#f59e0b', Testing: '#06b6d4', Selesai: '#10b981', Dibatalkan: '#94a3b8',
}
const projByStatus = computed(() => projRpt.value?.by_status || [])
const maxProj      = computed(() => Math.max(...projByStatus.value.map((p: any) => p.count), 1))

// ── SLA compliance color ───────────────────────────────────────
const slaColor = computed(() => {
  const v = kpi.value.sla_compliance_pct ?? 100
  return v >= 99 ? '#10b981' : v >= 95 ? '#f59e0b' : '#ef4444'
})
const slaBg = computed(() => {
  const v = kpi.value.sla_compliance_pct ?? 100
  return v >= 99 ? '#f0fdf4' : v >= 95 ? '#fffbeb' : '#fef2f2'
})

// ── Formatters ─────────────────────────────────────────────────
function fmt(n: number) {
  if (!n) return 'Rp 0'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}
function fmtShort(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}
function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const TICKET_BADGE: Record<string, { bg: string; color: string }> = {
  Open:        { bg: '#fef2f2', color: '#dc2626' },
  In_Progress: { bg: '#fffbeb', color: '#b45309' },
  Pending:     { bg: '#f5f3ff', color: '#6d28d9' },
  Resolved:    { bg: '#f0fdf4', color: '#15803d' },
  Closed:      { bg: '#f8fafc', color: '#64748b' },
}
const QUOTE_BADGE: Record<string, { bg: string; color: string }> = {
  Draft:    { bg: '#f8fafc', color: '#64748b' },
  Approved: { bg: '#f0fdf4', color: '#15803d' },
  Rejected: { bg: '#fef2f2', color: '#dc2626' },
}
const WO_BADGE: Record<string, { bg: string; color: string }> = {
  Open:        { bg: '#eff6ff', color: '#1d4ed8' },
  In_Progress: { bg: '#fffbeb', color: '#b45309' },
  Dispatched:  { bg: '#f5f3ff', color: '#6d28d9' },
  Done:        { bg: '#f0fdf4', color: '#15803d' },
}

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
})
const today = computed(() =>
  new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
)
const resolutionRate = computed(() => ticketRpt.value?.resolution_rate ?? null)

// combined activity feed
const activity = computed(() => {
  const items: any[] = []
  for (const t of (tiketTerbaru.value || []))
    items.push({ type: 'ticket', id: t.id_ticket, nomor: t.nomor_tiket, title: t.judul_tiket, sub: (t.site?.pelanggan?.nama_pelanggan || '') + ' · ' + (t.site?.nama_site || ''), status: t.status_tiket, date: t.tgl_open, route: `/operations/${t.id_ticket}` })
  for (const q of (quotationTerbaru.value || []))
    items.push({ type: 'quotation', id: q.id_quotation, nomor: q.nomor_quotation, title: q.opportunity?.nama_opportunity, sub: q.opportunity?.lead?.nama_prospek, status: q.status_approval, date: q.created_at, route: `/sales/quotation/${q.id_quotation}` })
  for (const w of (woTerbaru.value || []))
    items.push({ type: 'wo', id: w.id_wo, nomor: w.nomor_wo, title: w.deskripsi_tugas?.slice(0, 60), sub: (w.site?.pelanggan?.nama_pelanggan || '') + ' · ' + (w.site?.nama_site || ''), status: w.status_wo, date: w.created_at, route: `/operations` })
  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12)
})
</script>

<template>
  <div class="dash">

    <!-- ── Header ──────────────────────────────────────────────────── -->
    <div class="dash-header">
      <div class="header-left">
        <div class="header-eyebrow">DASHBOARD UTAMA</div>
        <h1 class="header-title">{{ greeting }}, <span class="header-name">{{ auth.user?.nama_lengkap }}</span></h1>
        <div class="header-date">{{ today }}</div>
      </div>
      <div class="quick-actions">
        <button class="qa-btn" @click="router.push('/operations')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Buat Tiket
        </button>
        <button class="qa-btn qa-outline" @click="router.push('/sales/lead')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Tambah Lead
        </button>
        <button class="qa-btn qa-outline" @click="router.push('/reports')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Laporan
        </button>
        <button class="qa-btn qa-outline" @click="router.push('/master/pelanggan')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          Pelanggan
        </button>
      </div>
    </div>

    <!-- Loading / Error -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>Memuat data dashboard…</span>
    </div>
    <div v-else-if="error" class="alert-error-box">{{ error }}</div>

    <template v-else>

      <!-- ── Alert Banners ───────────────────────────────────────────── -->
      <div class="alert-banners">
        <div v-if="kpi.kontrak_akan_berakhir > 0" class="banner amber">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <strong>{{ kpi.kontrak_akan_berakhir }} kontrak</strong> akan berakhir dalam 30 hari ke depan
          <button class="banner-link" @click="router.push('/contracts')">Lihat detail →</button>
        </div>
        <div v-if="kpi.invoice_overdue > 0" class="banner red">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <strong>{{ kpi.invoice_overdue }} invoice</strong> sudah jatuh tempo dan belum dibayar
          <button class="banner-link" @click="router.push('/finance')">Lihat invoice →</button>
        </div>
        <div v-if="resolutionRate !== null && resolutionRate < 50" class="banner red">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Resolusi tiket bulan ini hanya <strong>{{ resolutionRate }}%</strong> — perlu perhatian
          <button class="banner-link" @click="router.push('/operations')">Lihat tiket →</button>
        </div>
      </div>

      <!-- ── KPI Row 1: Pelanggan & Infrastruktur ────────────────────── -->
      <div class="section-label">Pelanggan & Infrastruktur</div>
      <div class="kpi-grid">

        <div class="kpi-card" @click="router.push('/master/pelanggan')">
          <div class="kpi-icon" style="background:#eff6ff">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Total Pelanggan</div>
            <div class="kpi-value" style="color:#1e40af">{{ kpi.total_pelanggan ?? '—' }}</div>
            <div class="kpi-sub">{{ kpi.kontrak_aktif ?? 0 }} kontrak aktif</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

        <div class="kpi-card" @click="router.push('/master/pelanggan')">
          <div class="kpi-icon" style="background:#ecfdf5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Total Site</div>
            <div class="kpi-value" style="color:#065f46">{{ kpi.total_site ?? '—' }}</div>
            <div class="kpi-sub">site aktif terdeploy</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

        <div class="kpi-card" @click="router.push('/reports')">
          <div class="kpi-icon" style="background:#f0fdf4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Revenue MRC</div>
            <div class="kpi-value" style="color:#065f46">{{ fmt(kpi.total_mrc_aktif) }}</div>
            <div class="kpi-sub">per bulan, kontrak aktif</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

        <div class="kpi-card" @click="router.push('/contracts')">
          <div class="kpi-icon" style="background:#f5f3ff">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Kontrak Aktif</div>
            <div class="kpi-value" style="color:#4c1d95">{{ kpi.kontrak_aktif ?? '—' }}</div>
            <div class="kpi-sub">{{ kpi.kontrak_akan_berakhir ?? 0 }} akan berakhir 30hr</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

        <div class="kpi-card" @click="router.push('/finance')">
          <div class="kpi-icon" :style="{ background: (kpi.invoice_overdue ?? 0) > 0 ? '#fef2f2' : '#f8fafc' }">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" :stroke="(kpi.invoice_overdue ?? 0) > 0 ? '#dc2626' : '#64748b'" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Invoice Overdue</div>
            <div class="kpi-value" :style="{ color: (kpi.invoice_overdue ?? 0) > 0 ? '#b91c1c' : '#64748b' }">{{ kpi.invoice_overdue ?? 0 }}</div>
            <div class="kpi-sub">belum terbayar · jatuh tempo</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

      </div>

      <!-- ── KPI Row 2: Operasional ──────────────────────────────────── -->
      <div class="section-label">Operasional</div>
      <div class="kpi-grid">

        <div class="kpi-card" @click="router.push('/operations')">
          <div class="kpi-icon" style="background:#fffbeb">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Tiket Aktif</div>
            <div class="kpi-value" style="color:#92400e">{{ kpi.tiket_aktif ?? '—' }}</div>
            <div class="kpi-sub">{{ kpi.tiket_open ?? 0 }} open · {{ kpi.tiket_in_progress ?? 0 }} proses · {{ kpi.tiket_pending ?? 0 }} pending</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

        <div class="kpi-card" @click="router.push('/reports/sla')">
          <div class="kpi-icon" :style="{ background: slaBg }">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" :stroke="slaColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">SLA Bulan Ini</div>
            <div class="kpi-value" :style="{ color: slaColor }">{{ kpi.sla_compliance_pct ?? '—' }}%</div>
            <div class="kpi-sub">{{ kpi.sla_breach_bulan_ini ?? 0 }} breach · {{ kpi.tiket_bulan_ini ?? 0 }} tiket</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

        <div class="kpi-card" @click="router.push('/projects')">
          <div class="kpi-icon" style="background:#ecfeff">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Proyek Berjalan</div>
            <div class="kpi-value" style="color:#0e7490">{{ kpi.proyek_berjalan ?? '—' }}</div>
            <div class="kpi-sub">kickoff, instalasi, testing</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

        <div class="kpi-card" @click="router.push('/operations/noc')">
          <div class="kpi-icon" style="background:#faf5ff">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Work Order Aktif</div>
            <div class="kpi-value" style="color:#7c3aed">{{ kpi.wo_aktif ?? '—' }}</div>
            <div class="kpi-sub">open, dispatched, in progress</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

        <div class="kpi-card" @click="router.push('/assets')">
          <div class="kpi-icon" style="background:#fff1f2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">Aset di Gudang</div>
            <div class="kpi-value" style="color:#9f1239">{{ kpi.aset_di_gudang ?? '—' }}</div>
            <div class="kpi-sub">unit tersedia</div>
          </div>
          <div class="kpi-arrow">›</div>
        </div>

      </div>

      <!-- ── Charts row ─────────────────────────────────────────────── -->
      <div class="charts-row">

        <!-- Revenue SVG Chart -->
        <div class="chart-card wide">
          <div class="chart-header">
            <div>
              <div class="chart-title">Revenue MRC — 12 Bulan Terakhir</div>
              <div class="chart-sub">Nilai kontrak aktif per bulan (IDR)</div>
            </div>
            <div class="chart-badge">{{ revenue.length }} bulan</div>
          </div>
          <div v-if="revenue.length" class="svg-wrap">
            <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" width="100%" :height="CHART_H" preserveAspectRatio="none">
              <line v-for="p in [0, 0.25, 0.5, 0.75, 1]" :key="p"
                :x1="PAD_L" :x2="CHART_W - 10" :y1="yPos(p)" :y2="yPos(p)"
                stroke="#f1f5f9" stroke-width="1"/>
              <text v-for="p in [0, 0.5, 1]" :key="'y'+p"
                :x="PAD_L - 4" :y="yPos(p) + 4"
                text-anchor="end" font-size="9" fill="#94a3b8">{{ yLabel(p) }}</text>
              <g v-for="(r, i) in revenue" :key="r.label">
                <rect :x="barX(i)" :y="barY(r.mrc)" :width="barW()" :height="barH(r.mrc)" rx="3" fill="url(#barGrad)" opacity="0.9"/>
                <text :x="barX(i) + barW() / 2" :y="CHART_H - PAD_B + 14" text-anchor="middle" font-size="8.5" fill="#94a3b8">{{ r.label }}</text>
              </g>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#3b82f6"/>
                  <stop offset="100%" stop-color="#1d4ed8"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div v-else class="chart-empty">Belum ada data kontrak</div>
        </div>

        <!-- Right col -->
        <div class="right-col">

          <!-- SLA Compliance mini panel -->
          <div class="chart-card sla-mini" @click="router.push('/reports/sla')" style="cursor:pointer">
            <div class="chart-header" style="margin-bottom:10px">
              <div class="chart-title">SLA Bulan Ini</div>
              <div class="sla-pct-big" :style="{ color: slaColor }">{{ kpi.sla_compliance_pct ?? '—' }}%</div>
            </div>
            <div class="sla-bar-wrap">
              <div class="sla-bar" :style="{ width: Math.min(kpi.sla_compliance_pct ?? 0, 100) + '%', background: slaColor }"></div>
            </div>
            <div class="sla-row-stats">
              <div class="sla-stat">
                <div class="sla-stat-val" style="color:#374151">{{ kpi.tiket_bulan_ini ?? 0 }}</div>
                <div class="sla-stat-lbl">Total tiket</div>
              </div>
              <div class="sla-stat">
                <div class="sla-stat-val" :style="{ color: (kpi.sla_breach_bulan_ini ?? 0) > 0 ? '#dc2626' : '#374151' }">{{ kpi.sla_breach_bulan_ini ?? 0 }}</div>
                <div class="sla-stat-lbl">SLA breach</div>
              </div>
              <div class="sla-stat">
                <div class="sla-stat-val" style="color:#374151">{{ resolutionRate ?? '—' }}%</div>
                <div class="sla-stat-lbl">Resolusi</div>
              </div>
            </div>
          </div>

          <!-- Tiket Donut -->
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">Distribusi Tiket</div>
              <div class="chart-badge total-badge">{{ donutTotal }} total</div>
            </div>
            <div v-if="donutTotal > 0" class="donut-wrap">
              <svg viewBox="0 0 100 100" width="80" height="80" style="flex-shrink:0">
                <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" stroke-width="14"/>
                <circle v-for="sl in donutSlices" :key="sl.status"
                  cx="50" cy="50" r="38" fill="none"
                  :stroke="sl.color" :stroke-width="sl.stroke"
                  :stroke-dasharray="`${sl.dash} ${sl.gap}`"
                  :stroke-dashoffset="-sl.offset + sl.circ * 0.25"
                  style="transform-origin: 50px 50px"/>
                <text x="50" y="53" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">{{ donutTotal }}</text>
              </svg>
              <div class="donut-legend">
                <div v-for="sl in donutSlices" :key="sl.status" class="legend-row">
                  <span class="legend-dot" :style="{ background: sl.color }"></span>
                  <span class="legend-label">{{ sl.status.replace('_', ' ') }}</span>
                  <span class="legend-count">{{ sl.count }}</span>
                </div>
              </div>
            </div>
            <div v-else class="chart-empty">Belum ada tiket</div>
          </div>

        </div>
      </div>

      <!-- ── Middle row: Pipeline + Projects ───────────────────────── -->
      <div class="mid-row">

        <!-- Sales Pipeline -->
        <div class="chart-card pipeline-card">
          <div class="chart-header">
            <div class="chart-title">Sales Pipeline</div>
            <button class="chart-link" @click="router.push('/sales')">Lihat semua →</button>
          </div>
          <div class="pipeline-funnel">
            <div class="pip-item" @click="router.push('/sales/lead')">
              <div class="pip-bar-wrap"><div class="pip-bar" style="background:#e0e7ff; width:100%"></div></div>
              <div class="pip-info"><span class="pip-stage">Lead</span><span class="pip-n" style="color:#3730a3">{{ pipeline.leads ?? 0 }}</span></div>
            </div>
            <div class="pip-arrow-down">↓</div>
            <div class="pip-item" @click="router.push('/sales/opportunity')">
              <div class="pip-bar-wrap"><div class="pip-bar" :style="{ background: '#bfdbfe', width: pipeline.leads ? (pipeline.opportunities / pipeline.leads * 100)+'%' : '0%' }"></div></div>
              <div class="pip-info"><span class="pip-stage">Opportunity</span><span class="pip-n" style="color:#1d4ed8">{{ pipeline.opportunities ?? 0 }}</span></div>
            </div>
            <div class="pip-arrow-down">↓</div>
            <div class="pip-item" @click="router.push('/sales/quotation')">
              <div class="pip-bar-wrap"><div class="pip-bar" :style="{ background: '#fde68a', width: pipeline.leads ? ((pipeline.quotation_draft + pipeline.quotation_approved) / pipeline.leads * 100)+'%' : '0%' }"></div></div>
              <div class="pip-info"><span class="pip-stage">Quotation</span><span class="pip-n" style="color:#b45309">{{ (pipeline.quotation_draft ?? 0) + (pipeline.quotation_approved ?? 0) }}</span></div>
            </div>
            <div class="pip-arrow-down">↓</div>
            <div class="pip-item" @click="router.push('/contracts')">
              <div class="pip-bar-wrap"><div class="pip-bar" :style="{ background: '#bbf7d0', width: pipeline.leads ? (pipeline.quotation_approved / pipeline.leads * 100)+'%' : '0%' }"></div></div>
              <div class="pip-info"><span class="pip-stage">Approved</span><span class="pip-n" style="color:#059669">{{ pipeline.quotation_approved ?? 0 }}</span></div>
            </div>
          </div>
        </div>

        <!-- Project Status -->
        <div class="chart-card proj-card">
          <div class="chart-header">
            <div class="chart-title">Status Proyek</div>
            <button class="chart-link" @click="router.push('/projects')">Lihat semua →</button>
          </div>
          <div v-if="projByStatus.length" class="proj-bars">
            <div v-for="p in projByStatus" :key="p.status" class="proj-row">
              <div class="proj-lbl">{{ p.status.replace('_', ' ') }}</div>
              <div class="proj-bar-wrap"><div class="proj-bar" :style="{ width: Math.round(p.count / maxProj * 100)+'%', background: PROJ_COLOR[p.status] || '#94a3b8' }"></div></div>
              <div class="proj-count">{{ p.count }}</div>
            </div>
          </div>
          <div v-else class="chart-empty">Belum ada proyek</div>
        </div>

        <!-- HRIS & WO summary -->
        <div class="right-mini-col">

          <!-- Karyawan pill -->
          <div class="chart-card mini-stat-card" @click="router.push('/hris')" style="cursor:pointer">
            <div class="mini-stat-icon" style="background:#faf5ff">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div class="mini-stat-body">
              <div class="mini-stat-label">Karyawan Aktif</div>
              <div class="mini-stat-val" style="color:#7c3aed">{{ kpi.karyawan_aktif ?? '—' }}</div>
            </div>
          </div>

          <!-- WO terbaru list -->
          <div class="chart-card" style="flex:1">
            <div class="chart-header" style="margin-bottom:8px">
              <div class="chart-title">WO Aktif</div>
              <button class="chart-link" @click="router.push('/operations/noc')">Lihat →</button>
            </div>
            <div v-if="woTerbaru.length" class="wo-list">
              <div v-for="w in woTerbaru" :key="w.id_wo" class="wo-row">
                <div class="wo-dot" :style="{ background: WO_BADGE[w.status_wo]?.bg, color: WO_BADGE[w.status_wo]?.color }">{{ w.status_wo?.replace('_', ' ') }}</div>
                <div class="wo-info">
                  <div class="wo-nomor">{{ w.nomor_wo }}</div>
                  <div class="wo-site">{{ w.site?.nama_site }}</div>
                </div>
              </div>
            </div>
            <div v-else class="chart-empty">Tidak ada WO aktif</div>
          </div>

        </div>
      </div>

      <!-- ── Activity Feed ────────────────────────────────────────────── -->
      <div class="activity-section">
        <div class="activity-header">
          <div class="chart-title">Aktivitas Terbaru</div>
          <div class="activity-tabs">
            <span class="act-chip chip-ticket">Tiket</span>
            <span class="act-chip chip-quotation">Quotation</span>
            <span class="act-chip chip-wo">Work Order</span>
          </div>
        </div>
        <div class="activity-list">
          <div v-for="item in activity" :key="item.type + item.id" class="activity-item" @click="router.push(item.route)">
            <div class="act-type-icon" :class="item.type === 'ticket' ? 'act-ticket' : item.type === 'quotation' ? 'act-quotation' : 'act-wo'">
              <svg v-if="item.type === 'ticket'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <svg v-else-if="item.type === 'quotation'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div class="act-body">
              <div class="act-top">
                <span class="act-nomor">{{ item.nomor }}</span>
                <span class="act-badge"
                  :style="{ background: (item.type === 'ticket' ? TICKET_BADGE : item.type === 'quotation' ? QUOTE_BADGE : WO_BADGE)[item.status]?.bg, color: (item.type === 'ticket' ? TICKET_BADGE : item.type === 'quotation' ? QUOTE_BADGE : WO_BADGE)[item.status]?.color }">
                  {{ item.status?.replace('_',' ') }}
                </span>
              </div>
              <div class="act-title">{{ item.title }}</div>
              <div class="act-sub">{{ item.sub }}</div>
            </div>
            <div class="act-date">{{ fmtShort(item.date) }}</div>
          </div>
          <div v-if="!activity.length" class="chart-empty" style="padding:24px">Belum ada aktivitas</div>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.dash { font-family: 'Inter', system-ui, sans-serif; padding: 24px 28px; max-width: 1400px; background: #f8fafc; box-sizing: border-box; }

/* Header */
.dash-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.header-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .12em; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
.header-title { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
.header-name { color: #0B1D35; }
.header-date { font-size: 12px; color: #94a3b8; }

.quick-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.qa-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  background: #0B1D35; color: #fff; border: none; transition: background .15s;
}
.qa-btn:hover { background: #162d52; }
.qa-outline { background: #fff; color: #334155; border: 1.5px solid #e2e8f0; }
.qa-outline:hover { background: #f8fafc; border-color: #cbd5e1; }

/* Loading */
.loading-state { display: flex; align-items: center; gap: 12px; padding: 60px; color: #94a3b8; justify-content: center; font-size: 13px; }
.spinner { width: 20px; height: 20px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.alert-error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 16px 20px; color: #b91c1c; font-size: 13px; }

/* Alert banners */
.alert-banners { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.banner { display: flex; align-items: center; gap: 8px; border-radius: 8px; padding: 10px 14px; font-size: 13px; }
.banner.amber { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.banner.red   { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.banner-link { margin-left: auto; background: none; border: none; font-size: 12px; font-weight: 700; cursor: pointer; color: inherit; }
.banner-link:hover { text-decoration: underline; }

/* Section labels */
.section-label { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; margin-top: 4px; }

/* KPI Grid */
.kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
.kpi-card {
  display: flex; align-items: center; gap: 11px;
  background: #fff; border-radius: 10px; padding: 13px 13px;
  border: 1px solid #e2e8f0; cursor: pointer;
  transition: box-shadow .15s, transform .12s;
}
.kpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.07); transform: translateY(-1px); }
.kpi-icon { width: 36px; height: 36px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-body { flex: 1; min-width: 0; }
.kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 2px; }
.kpi-value { font-size: 20px; font-weight: 800; line-height: 1; margin-bottom: 3px; font-variant-numeric: tabular-nums; }
.kpi-sub { font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpi-arrow { font-size: 16px; color: #cbd5e1; flex-shrink: 0; }

/* Charts row */
.charts-row { display: grid; grid-template-columns: 1fr 260px; gap: 12px; margin-bottom: 12px; }
.right-col { display: flex; flex-direction: column; gap: 10px; }

.chart-card { background: #fff; border-radius: 10px; padding: 16px 18px; border: 1px solid #e2e8f0; }
.chart-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.chart-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.chart-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.chart-link { background: none; border: none; font-size: 11px; font-weight: 600; color: #3b82f6; cursor: pointer; padding: 0; }
.chart-link:hover { text-decoration: underline; }
.chart-badge { font-size: 10px; background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 8px; font-weight: 600; }
.total-badge { background: #eff6ff; color: #1d4ed8; }
.chart-empty { color: #94a3b8; font-size: 12px; text-align: center; padding: 20px 0; }
.svg-wrap { overflow: hidden; }

/* SLA mini panel */
.sla-mini { }
.sla-pct-big { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.sla-bar-wrap { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
.sla-bar { height: 100%; border-radius: 3px; transition: width .5s ease; }
.sla-row-stats { display: flex; gap: 0; }
.sla-stat { flex: 1; text-align: center; }
.sla-stat-val { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
.sla-stat-lbl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; }

/* Donut */
.donut-wrap { display: flex; align-items: center; gap: 12px; }
.donut-legend { display: flex; flex-direction: column; gap: 5px; }
.legend-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.legend-label { color: #334155; flex: 1; }
.legend-count { font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }

/* Mid row: now 3 cols */
.mid-row { display: grid; grid-template-columns: 1fr 1fr 220px; gap: 12px; margin-bottom: 12px; }
.right-mini-col { display: flex; flex-direction: column; gap: 10px; }

/* Mini stat card */
.mini-stat-card { display: flex; align-items: center; gap: 10px; }
.mini-stat-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.mini-stat-body { flex: 1; }
.mini-stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; }
.mini-stat-val { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }

/* WO list */
.wo-list { display: flex; flex-direction: column; gap: 8px; }
.wo-row { display: flex; align-items: flex-start; gap: 8px; }
.wo-dot { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 6px; white-space: nowrap; flex-shrink: 0; margin-top: 2px; }
.wo-info { flex: 1; min-width: 0; }
.wo-nomor { font-size: 11px; font-weight: 700; color: #3b82f6; font-family: 'Courier New', monospace; }
.wo-site { font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Pipeline funnel */
.pipeline-funnel { display: flex; flex-direction: column; gap: 0; }
.pip-item { cursor: pointer; padding: 5px 0; }
.pip-item:hover .pip-bar { opacity: .7; }
.pip-bar-wrap { height: 18px; background: #f8fafc; border-radius: 4px; overflow: hidden; margin-bottom: 3px; }
.pip-bar { height: 100%; border-radius: 4px; min-width: 8px; transition: width .4s ease; }
.pip-info { display: flex; justify-content: space-between; }
.pip-stage { font-size: 11px; color: #64748b; font-weight: 500; }
.pip-n { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pip-arrow-down { text-align: center; color: #cbd5e1; font-size: 12px; line-height: 1; padding: 1px 0; }

/* Project bars */
.proj-bars { display: flex; flex-direction: column; gap: 9px; }
.proj-row { display: flex; align-items: center; gap: 8px; }
.proj-lbl { font-size: 12px; color: #374151; width: 90px; flex-shrink: 0; }
.proj-bar-wrap { flex: 1; height: 7px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.proj-bar { height: 100%; border-radius: 4px; transition: width .4s ease; min-width: 4px; }
.proj-count { font-size: 12px; font-weight: 700; color: #374151; width: 24px; text-align: right; flex-shrink: 0; }

/* Activity feed */
.activity-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.activity-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 10px; border-bottom: 1px solid #f1f5f9; }
.activity-tabs { display: flex; gap: 6px; }
.act-chip { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px; }
.chip-ticket    { background: #fffbeb; color: #b45309; }
.chip-quotation { background: #eff6ff; color: #1d4ed8; }
.chip-wo        { background: #faf5ff; color: #7c3aed; }

.activity-list { display: flex; flex-direction: column; }
.activity-item { display: flex; align-items: flex-start; gap: 11px; padding: 10px 16px; border-bottom: 1px solid #f8fafc; cursor: pointer; transition: background .1s; }
.activity-item:last-child { border-bottom: none; }
.activity-item:hover { background: #f8fafc; }

.act-type-icon { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
.act-ticket    { background: #fffbeb; color: #b45309; }
.act-quotation { background: #eff6ff; color: #1d4ed8; }
.act-wo        { background: #faf5ff; color: #7c3aed; }

.act-body { flex: 1; min-width: 0; }
.act-top { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.act-nomor { font-size: 11px; font-weight: 700; color: #3b82f6; font-family: 'Courier New', monospace; }
.act-badge { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 8px; }
.act-title { font-size: 13px; font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.act-sub { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.act-date { font-size: 11px; color: #94a3b8; white-space: nowrap; flex-shrink: 0; margin-top: 3px; }

/* Responsive */
@media (max-width: 1300px) {
  .mid-row { grid-template-columns: 1fr 1fr; }
  .right-mini-col { flex-direction: row; }
  .mini-stat-card { flex: none; }
}
@media (max-width: 1100px) {
  .kpi-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 900px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .charts-row { grid-template-columns: 1fr; }
  .mid-row { grid-template-columns: 1fr; }
  .right-mini-col { flex-direction: row; }
  .quick-actions { display: none; }
}
</style>
