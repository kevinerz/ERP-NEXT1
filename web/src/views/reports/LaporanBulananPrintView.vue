<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '@/services/api'

// expose window.print for template
const printPage = () => window.print()

const route_query = new URLSearchParams(window.location.search)
const pelanggan_id = route_query.get('pelanggan_id') || ''
const bulan = Number(route_query.get('bulan')) || new Date().getMonth() + 1
const tahun = Number(route_query.get('tahun')) || new Date().getFullYear()

const loading = ref(true)
const error = ref('')
const data = ref<any>(null)

onMounted(async () => {
  try {
    const res = await api.get('/reports/laporan-bulanan', {
      params: { pelanggan_id, bulan, tahun },
    })
    data.value = res.data
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat laporan'
  } finally {
    loading.value = false
  }
})

// ── Format helpers ────────────────────────────────────────────────
const BULAN_LABEL = ['Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember']

function fmtDate(d: string | Date | null, short = false): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (short) return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(d: string | Date | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  return Number(n).toFixed(3) + '%'
}

function fmtPct1(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  return Number(n).toFixed(1) + '%'
}

// ── Daily distribution for bar chart ────────────────────────────
const dailyData = computed(() => {
  if (!data.value) return []
  const days = new Date(tahun, bulan, 0).getDate()
  const counts: number[] = new Array(days).fill(0)
  for (const t of data.value.tickets ?? []) {
    const d = new Date(t.tgl_open)
    if (d.getFullYear() === tahun && d.getMonth() + 1 === bulan) {
      const day = d.getDate() - 1
      if (day >= 0 && day < days) counts[day]++
    }
  }
  return counts
})

const dailyMax = computed(() => Math.max(1, ...dailyData.value))

// ── Sites grouped by layanan ──────────────────────────────────────
const sitesByLayanan = computed(() => {
  if (!data.value?.sites) return []
  const map = new Map<string, any[]>()
  for (const s of data.value.sites) {
    if (!map.has(s.kode_layanan)) map.set(s.kode_layanan, [])
    map.get(s.kode_layanan)!.push(s)
  }
  return Array.from(map.entries()).map(([kode, siteList]) => ({
    kode,
    nama: siteList[0]?.nama_layanan ?? kode,
    target: siteList[0]?.target_sla ?? 95,
    sites: siteList,
  }))
})

const sitesNotMeetSla = computed(() =>
  (data.value?.sites ?? []).filter((s: any) => !s.sla_ok)
    .sort((a: any, b: any) => a.uptime_pct - b.uptime_pct)
)

// ── Auto-generated summary paragraph ─────────────────────────────
const summaryParagraf = computed(() => {
  if (!data.value) return ''
  const s = data.value.summary
  const p = data.value.pelanggan
  return `Selama periode ${data.value.periode}, layanan internet ${p.nama_pelanggan} mencapai `
    + `rata-rata uptime sebesar ${fmtPct(s.rata_rata_uptime)} dari ${s.total_site} site yang terpantau. `
    + `Sebanyak ${s.site_memenuhi_sla} site (${Math.round(s.site_memenuhi_sla / Math.max(s.total_site, 1) * 100)}%) `
    + `memenuhi target SLA yang disepakati, dengan ${s.site_tanpa_gangguan} site tidak mengalami gangguan sama sekali. `
    + `Total gangguan yang tercatat sebanyak ${s.total_tiket} tiket dengan rata-rata waktu penanganan (MTTR) `
    + `${s.avg_mttr_menit < 60 ? s.avg_mttr_menit + ' menit' : Math.floor(s.avg_mttr_menit / 60) + ' jam ' + (s.avg_mttr_menit % 60) + ' menit'}.`
})

// ── Ticket chunks for pages 6-8 ──────────────────────────────────
const TICKETS_PER_PAGE = 30
const ticketPages = computed(() => {
  const all = data.value?.tickets ?? []
  const pages = []
  for (let i = 0; i < all.length; i += TICKETS_PER_PAGE) {
    pages.push(all.slice(i, i + TICKETS_PER_PAGE))
  }
  if (pages.length === 0) pages.push([])
  return pages
})
</script>

<template>
  <div class="print-root">
    <!-- Loading -->
    <div v-if="loading" class="loading-screen">
      <div class="loading-spinner"></div>
      <p>Memuat laporan...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-screen">
      <h2>Gagal Memuat Laporan</h2>
      <p>{{ error }}</p>
    </div>

    <template v-else-if="data">
      <!-- Print button (hidden in print) -->
      <div class="no-print print-bar">
        <span class="print-bar-title">Laporan Bulanan — {{ data.pelanggan?.nama_pelanggan }} — {{ data.periode }}</span>
        <button class="btn-print" @click="printPage()">🖨 Print / Simpan PDF</button>
      </div>

      <!-- ═══════════════════════════════════════════════════════════ -->
      <!-- PAGE 1 — COVER                                             -->
      <!-- ═══════════════════════════════════════════════════════════ -->
      <div class="print-page cover-page">
        <div class="cover-inner">
          <div class="cover-top">
            <div class="cover-eyebrow">LAPORAN BULANAN LAYANAN INTERNET</div>
            <h1 class="cover-title">{{ data.pelanggan?.nama_pelanggan }}</h1>
            <p class="cover-subtitle">Laporan Gangguan &amp; Pencapaian SLA — Periode {{ data.periode }}</p>
            <div class="cover-divider"></div>
          </div>

          <div class="cover-toc">
            <div class="toc-item"><span class="toc-num">1</span><span>Ringkasan &amp; Analisa Bulan Berjalan</span></div>
            <div class="toc-item"><span class="toc-num">2</span><span>List All Site &amp; Status SLA</span></div>
            <div class="toc-item"><span class="toc-num">3</span><span>Top 10 Site Perlu Perhatian</span></div>
            <div class="toc-item"><span class="toc-num">4</span><span>List Problem Bulan {{ data.periode }}</span></div>
          </div>

          <div class="cover-kpi-row">
            <div class="cover-kpi">
              <div class="ckpi-val">{{ data.summary.total_site }}</div>
              <div class="ckpi-label">Site Terlayani</div>
            </div>
            <div class="cover-kpi">
              <div class="ckpi-val">{{ data.summary.site_memenuhi_sla }}<span class="ckpi-of">/{{ data.summary.total_site }}</span></div>
              <div class="ckpi-label">Site Memenuhi SLA</div>
            </div>
            <div class="cover-kpi">
              <div class="ckpi-val">{{ fmtPct1(data.summary.rata_rata_uptime) }}</div>
              <div class="ckpi-label">Rata-rata Uptime</div>
            </div>
            <div class="cover-kpi">
              <div class="ckpi-val">{{ data.summary.site_tanpa_gangguan }}</div>
              <div class="ckpi-label">Site Tanpa Gangguan</div>
            </div>
            <div class="cover-kpi">
              <div class="ckpi-val">{{ data.summary.total_tiket }}</div>
              <div class="ckpi-label">Total Gangguan</div>
            </div>
          </div>

          <div class="cover-footer">
            <span>Disiapkan oleh: PT. Perdana Global Internet (NEXT1) — Network Operation Center</span>
            <span>Periode {{ data.periode_range }}</span>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════ -->
      <!-- PAGE 2 — RINGKASAN & ANALISA                               -->
      <!-- ═══════════════════════════════════════════════════════════ -->
      <div class="print-page body-page">
        <div class="page-header-bar">
          <div class="phb-title">Ringkasan &amp; Analisa Bulan Berjalan</div>
          <div class="phb-meta">{{ data.pelanggan?.nama_pelanggan }} · {{ data.periode }}</div>
        </div>

        <!-- KPI Cards -->
        <div class="kpi-grid">
          <div class="kpi-card navy">
            <div class="kv">{{ data.summary.site_memenuhi_sla }}<span class="kv-of">/{{ data.summary.total_site }}</span></div>
            <div class="kl">Site Memenuhi SLA</div>
          </div>
          <div class="kpi-card" :class="data.summary.rata_rata_uptime >= 99 ? 'green' : data.summary.rata_rata_uptime >= 95 ? 'orange' : 'red'">
            <div class="kv">{{ fmtPct1(data.summary.rata_rata_uptime) }}</div>
            <div class="kl">Rata-rata Uptime</div>
          </div>
          <div class="kpi-card teal">
            <div class="kv">{{ data.summary.site_tanpa_gangguan }}</div>
            <div class="kl">Site Tanpa Gangguan</div>
          </div>
          <div class="kpi-card blue">
            <div class="kv">{{ data.summary.total_tiket }}</div>
            <div class="kl">Total Tiket Gangguan</div>
          </div>
          <div class="kpi-card gray">
            <div class="kv">{{ data.summary.avg_mttr_menit < 60 ? data.summary.avg_mttr_menit + 'm' : Math.floor(data.summary.avg_mttr_menit / 60) + 'j ' + (data.summary.avg_mttr_menit % 60) + 'm' }}</div>
            <div class="kl">Avg MTTR</div>
          </div>
          <div class="kpi-card gray">
            <div class="kv">{{ data.generated_at ? new Date(data.generated_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '—' }}</div>
            <div class="kl">Tanggal Laporan</div>
          </div>
        </div>

        <!-- SLA Per Segmen table -->
        <div class="section-title">PENCAPAIAN SLA PER SEGMEN LAYANAN</div>
        <table class="rpt-table">
          <thead>
            <tr>
              <th>Segmen</th>
              <th class="tc">Jml Site</th>
              <th class="tc">Target SLA</th>
              <th class="tc">Rata-rata Uptime</th>
              <th class="tc">Avg Downtime/Site</th>
              <th class="tc">Memenuhi</th>
              <th class="tc">Belum</th>
              <th class="tc">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="seg in data.per_segmen" :key="seg.kode_layanan">
              <td><strong>{{ seg.kode_layanan }}</strong> — {{ seg.nama_layanan }}</td>
              <td class="tc">{{ seg.jumlah_site }}</td>
              <td class="tc">{{ seg.target_sla }}%</td>
              <td class="tc" :class="seg.rata_rata_uptime >= seg.target_sla ? 'green-txt' : 'red-txt'">
                {{ fmtPct(seg.rata_rata_uptime) }}
              </td>
              <td class="tc">{{ seg.rata_rata_downtime_menit }}m</td>
              <td class="tc green-txt">{{ seg.memenuhi_sla }}</td>
              <td class="tc" :class="seg.belum_memenuhi > 0 ? 'red-txt' : ''">{{ seg.belum_memenuhi }}</td>
              <td class="tc">
                <span :class="seg.status === 'TERCAPAI' ? 'badge-ok' : 'badge-warn'">{{ seg.status }}</span>
              </td>
            </tr>
            <tr v-if="!data.per_segmen?.length">
              <td colspan="8" class="empty-row">Tidak ada data segmen</td>
            </tr>
          </tbody>
        </table>

        <!-- Daily bar chart -->
        <div class="section-title" style="margin-top:18px">DISTRIBUSI GANGGUAN HARIAN — {{ data.periode }}</div>
        <div class="chart-container">
          <svg :viewBox="`0 0 ${Math.max(dailyData.length * 22 + 48, 400)} 120`"
               class="daily-chart" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
            <!-- Y gridlines -->
            <line v-for="n in [0.25,0.5,0.75,1]" :key="n"
              x1="40" :y1="8 + (1 - n) * 80" :x2="dailyData.length * 22 + 44" :y2="8 + (1 - n) * 80"
              stroke="#e2e8f0" stroke-width="0.5" />
            <!-- Bars -->
            <g v-for="(cnt, idx) in dailyData" :key="idx">
              <rect
                :x="40 + idx * 22"
                :y="8 + (1 - cnt / dailyMax) * 80"
                :width="16"
                :height="cnt / dailyMax * 80"
                :fill="cnt >= 6 ? '#ef4444' : cnt >= 4 ? '#f97316' : '#3b82f6'"
                rx="2" />
              <text
                :x="40 + idx * 22 + 8"
                y="104"
                text-anchor="middle"
                font-size="7"
                fill="#64748b">{{ idx + 1 }}</text>
              <text v-if="cnt > 0"
                :x="40 + idx * 22 + 8"
                :y="8 + (1 - cnt / dailyMax) * 80 - 2"
                text-anchor="middle"
                font-size="7"
                fill="#334155">{{ cnt }}</text>
            </g>
            <!-- Y axis label -->
            <text x="4" y="48" text-anchor="middle" font-size="7" fill="#94a3b8" transform="rotate(-90,4,48)">Tiket</text>
          </svg>
        </div>
        <div class="chart-legend">
          <span class="leg-item"><span class="leg-dot" style="background:#3b82f6"></span>1–3 tiket</span>
          <span class="leg-item"><span class="leg-dot" style="background:#f97316"></span>4–5 tiket</span>
          <span class="leg-item"><span class="leg-dot" style="background:#ef4444"></span>≥6 tiket</span>
        </div>

        <!-- Summary paragraph -->
        <div class="summary-box">
          <div class="summary-box-title">Ringkasan Eksekutif</div>
          <p class="summary-txt">{{ summaryParagraf }}</p>
        </div>

        <div class="page-footer">
          PT. Perdana Global Internet (NEXT1) — Network Operation Center &nbsp;|&nbsp; {{ data.periode_range }}
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════ -->
      <!-- PAGE 3-4 — LIST ALL SITE & STATUS SLA                      -->
      <!-- ═══════════════════════════════════════════════════════════ -->
      <div class="print-page body-page">
        <div class="page-header-bar">
          <div class="phb-title">List All Site &amp; Status SLA</div>
          <div class="phb-meta">{{ data.pelanggan?.nama_pelanggan }} · {{ data.periode }}</div>
        </div>

        <!-- Sites not meeting SLA -->
        <div v-if="sitesNotMeetSla.length > 0">
          <div class="section-title warn-section">SITE YANG BELUM MEMENUHI TARGET SLA</div>
          <table class="rpt-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Segmen</th>
                <th class="tc">Downtime (mnt)</th>
                <th>Durasi</th>
                <th class="tc">Uptime</th>
                <th class="tc">Target</th>
                <th class="tc">Selisih</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sitesNotMeetSla" :key="s.id_site">
                <td><strong>{{ s.nama_site }}</strong><br/><span class="mono-sm">{{ s.kode_site }}</span></td>
                <td class="mono-sm">{{ s.kode_layanan }}</td>
                <td class="tc red-txt">{{ s.downtime_menit }}</td>
                <td class="mono-sm">{{ s.durasi_str }}</td>
                <td class="tc red-txt">{{ fmtPct(s.uptime_pct) }}</td>
                <td class="tc">{{ s.target_sla }}%</td>
                <td class="tc red-txt">-{{ fmtPct1(s.target_sla - s.uptime_pct) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="all-ok-banner">
          ✅ Semua site memenuhi target SLA pada periode ini.
        </div>

        <!-- Sites grouped by layanan -->
        <div v-for="seg in sitesByLayanan" :key="seg.kode" class="layanan-group">
          <div class="layanan-group-header">
            <span class="layanan-kode">{{ seg.kode }}</span>
            <span class="layanan-nama">{{ seg.nama }}</span>
            <span class="layanan-info">{{ seg.sites.length }} site · target SLA {{ seg.target }}%</span>
          </div>
          <table class="rpt-table site-grid-table">
            <thead>
              <tr>
                <th style="width:28px">#</th>
                <th>Nama Site</th>
                <th class="tc" style="width:90px">Downtime (mnt)</th>
                <th class="tc" style="width:80px">Uptime</th>
                <th class="tc" style="width:70px">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, idx) in seg.sites" :key="s.id_site">
                <td class="tc muted">{{ idx + 1 }}</td>
                <td>{{ s.nama_site }} <span class="mono-sm muted">· {{ s.kode_site }}</span></td>
                <td class="tc" :class="s.downtime_menit > 0 ? 'red-txt' : 'muted'">{{ s.downtime_menit }}</td>
                <td class="tc" :class="s.sla_ok ? 'green-txt' : 'red-txt'">{{ fmtPct(s.uptime_pct) }}</td>
                <td class="tc">
                  <span :class="s.sla_ok ? 'badge-pass' : 'badge-not'">{{ s.sla_ok ? 'PASS' : 'NOT' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="page-footer">
          PT. Perdana Global Internet (NEXT1) — Network Operation Center &nbsp;|&nbsp; {{ data.periode_range }}
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════ -->
      <!-- PAGE 5 — TOP 10 SITE PERLU PERHATIAN                       -->
      <!-- ═══════════════════════════════════════════════════════════ -->
      <div class="print-page body-page">
        <div class="page-header-bar">
          <div class="phb-title">Top 10 Site Perlu Perhatian</div>
          <div class="phb-meta">{{ data.pelanggan?.nama_pelanggan }} · {{ data.periode }}</div>
        </div>

        <!-- Table A: by frequency -->
        <div class="section-title">TABEL A — BERDASARKAN FREKUENSI GANGGUAN</div>
        <table class="rpt-table">
          <thead>
            <tr>
              <th style="width:28px">#</th>
              <th>Site / Outlet</th>
              <th>Layanan</th>
              <th class="tc">Jml Gangguan</th>
              <th class="tc">Total Durasi (mnt)</th>
              <th class="tc">Durasi (jam)</th>
              <th class="tc">Rata-rata (mnt)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, idx) in data.top10_frekuensi" :key="idx">
              <td class="tc muted">{{ idx + 1 }}</td>
              <td>{{ s.nama_site }}</td>
              <td class="mono-sm">{{ s.kode_layanan }}</td>
              <td class="tc"><strong>{{ s.jumlah_tiket }}</strong></td>
              <td class="tc">{{ s.total_durasi_menit }}</td>
              <td class="tc mono-sm">{{ s.durasi_str }}</td>
              <td class="tc">{{ s.rata_durasi_menit }}</td>
            </tr>
            <tr v-if="!data.top10_frekuensi?.length">
              <td colspan="7" class="empty-row">Tidak ada data gangguan pada periode ini</td>
            </tr>
          </tbody>
        </table>

        <!-- Table B: by duration -->
        <div class="section-title" style="margin-top:24px">TABEL B — BERDASARKAN TOTAL DURASI GANGGUAN</div>
        <table class="rpt-table">
          <thead>
            <tr>
              <th style="width:28px">#</th>
              <th>Site / Outlet</th>
              <th>Layanan</th>
              <th class="tc">Jml Gangguan</th>
              <th class="tc">Total Durasi (mnt)</th>
              <th class="tc">Durasi (jam)</th>
              <th class="tc">Rata-rata (mnt)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, idx) in data.top10_durasi" :key="idx">
              <td class="tc muted">{{ idx + 1 }}</td>
              <td>{{ s.nama_site }}</td>
              <td class="mono-sm">{{ s.kode_layanan }}</td>
              <td class="tc">{{ s.jumlah_tiket }}</td>
              <td class="tc"><strong>{{ s.total_durasi_menit }}</strong></td>
              <td class="tc mono-sm">{{ s.durasi_str }}</td>
              <td class="tc">{{ s.rata_durasi_menit }}</td>
            </tr>
            <tr v-if="!data.top10_durasi?.length">
              <td colspan="7" class="empty-row">Tidak ada data gangguan pada periode ini</td>
            </tr>
          </tbody>
        </table>

        <div class="note-box">
          <strong>Catatan:</strong> Tabel A mengurutkan site berdasarkan jumlah kejadian gangguan terbanyak.
          Tabel B mengurutkan berdasarkan total akumulasi durasi downtime. Site yang muncul di kedua tabel
          memerlukan perhatian dan investigasi lebih lanjut dari tim NOC.
        </div>

        <div class="page-footer">
          PT. Perdana Global Internet (NEXT1) — Network Operation Center &nbsp;|&nbsp; {{ data.periode_range }}
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════ -->
      <!-- PAGE 6-8 — LIST PROBLEM                                    -->
      <!-- ═══════════════════════════════════════════════════════════ -->
      <div v-for="(pageTickets, pageIdx) in ticketPages" :key="pageIdx"
           class="print-page body-page">
        <div class="page-header-bar">
          <div class="phb-title">
            List Problem Bulan {{ data.periode }}
            <span v-if="ticketPages.length > 1" class="page-part"> ({{ pageIdx + 1 }}/{{ ticketPages.length }})</span>
          </div>
          <div class="phb-meta">{{ data.pelanggan?.nama_pelanggan }} · {{ data.periode }}</div>
        </div>

        <table class="rpt-table ticket-table">
          <thead>
            <tr>
              <th style="width:24px">#</th>
              <th style="width:110px">No Tiket</th>
              <th style="width:70px">Status</th>
              <th style="width:110px">Mulai</th>
              <th style="width:110px">Selesai</th>
              <th>Site/Outlet</th>
              <th style="width:50px">Lay.</th>
              <th>Keluhan</th>
              <th class="tc" style="width:55px">Dur (mnt)</th>
              <th style="width:55px">Jam</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(t, ti) in pageTickets" :key="t.nomor_tiket"
                :class="(pageIdx * 30 + ti) % 2 === 1 ? 'row-stripe' : ''">
              <td class="tc muted">{{ pageIdx * 30 + ti + 1 }}</td>
              <td class="mono-sm">{{ t.nomor_tiket }}</td>
              <td>
                <span :class="{
                  'badge-resolved': t.status_tiket === 'Resolved' || t.status_tiket === 'Closed',
                  'badge-open': t.status_tiket === 'Open',
                  'badge-progress': t.status_tiket === 'In_Progress',
                }">{{ t.status_tiket?.replace('_', ' ') }}</span>
              </td>
              <td class="date-sm">{{ fmtDateTime(t.tgl_open) }}</td>
              <td class="date-sm">{{ t.tgl_resolved ? fmtDateTime(t.tgl_resolved) : '—' }}</td>
              <td class="site-cell">{{ t.nama_site }}</td>
              <td class="mono-sm">{{ t.kode_layanan }}</td>
              <td class="keluhan-cell">{{ t.judul_tiket }}</td>
              <td class="tc">{{ t.durasi_menit }}</td>
              <td class="mono-sm">{{ t.durasi_str }}</td>
            </tr>
            <tr v-if="!pageTickets.length">
              <td colspan="10" class="empty-row">Tidak ada tiket gangguan pada periode ini</td>
            </tr>
          </tbody>
        </table>

        <div class="page-footer">
          PT. Perdana Global Internet (NEXT1) — Network Operation Center &nbsp;|&nbsp; {{ data.periode_range }}
        </div>
      </div>

    </template>
  </div>
</template>

<style>
/* ── Reset & base ─────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; background: #f1f5f9; }

/* ── Print root wrapper ───────────────────────────────────────────── */
.print-root { max-width: 900px; margin: 0 auto; }

/* ── Print bar ────────────────────────────────────────────────────── */
.print-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px; background: #0f2540; color: #fff;
  position: sticky; top: 0; z-index: 100; gap: 12px;
}
.print-bar-title { font-size: 13px; font-weight: 600; }
.btn-print {
  padding: 7px 20px; background: #f97316; color: #fff; border: none;
  border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer;
  white-space: nowrap;
}
.btn-print:hover { background: #ea6c00; }

/* ── Page container ───────────────────────────────────────────────── */
.print-page {
  width: 100%;
  min-height: 297mm;
  background: #fff;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  position: relative;
  overflow: hidden;
}

/* ── Page footer ──────────────────────────────────────────────────── */
.page-footer {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 8px 28px;
  font-size: 9px; color: #94a3b8;
  border-top: 1px solid #e2e8f0;
  display: flex; justify-content: center;
  background: #fff;
}

/* ═══════════════════════════════════════════════════════════════════ */
/* COVER PAGE                                                          */
/* ═══════════════════════════════════════════════════════════════════ */
.cover-page { background: #0f2540; color: #fff; display: flex; flex-direction: column; }
.cover-inner { padding: 56px 56px 28px; display: flex; flex-direction: column; flex: 1; }

.cover-top { flex: 1; }
.cover-eyebrow {
  font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
  color: #93c5fd; margin-bottom: 24px;
}
.cover-title { font-size: 42px; font-weight: 800; line-height: 1.1; color: #fff; margin-bottom: 16px; }
.cover-subtitle { font-size: 16px; color: #cbd5e1; margin-bottom: 28px; }
.cover-divider { height: 4px; width: 80px; background: #f97316; border-radius: 2px; margin-bottom: 40px; }

.cover-toc { margin-bottom: 48px; }
.toc-item { display: flex; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; color: #cbd5e1; }
.toc-num { width: 28px; height: 28px; background: #f97316; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; color: #fff; flex-shrink: 0; }

.cover-kpi-row { display: flex; gap: 12px; margin-bottom: 40px; }
.cover-kpi {
  flex: 1; background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px; padding: 16px 12px; text-align: center;
  min-width: 0;
}
.ckpi-val { font-size: 28px; font-weight: 800; color: #fff; line-height: 1; }
.ckpi-of { font-size: 16px; font-weight: 400; color: #93c5fd; }
.ckpi-label { font-size: 10px; color: #93c5fd; margin-top: 6px; }

.cover-footer {
  display: flex; justify-content: space-between;
  font-size: 9px; color: #475569;
  border-top: 1px solid rgba(255,255,255,0.1);
  padding-top: 12px;
}

/* ═══════════════════════════════════════════════════════════════════ */
/* BODY PAGES                                                          */
/* ═══════════════════════════════════════════════════════════════════ */
.body-page { padding: 20px 28px 52px; }

.page-header-bar {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 16px; padding-bottom: 10px;
  border-bottom: 2px solid #0f2540;
}
.phb-title { font-size: 15px; font-weight: 800; color: #0f2540; }
.phb-meta { font-size: 10px; color: #64748b; text-align: right; }
.page-part { font-size: 12px; color: #64748b; font-weight: 400; }

/* ── KPI grid ─────────────────────────────────────────────────────── */
.kpi-grid { display: grid; grid-template-columns: repeat(6,1fr); gap: 8px; margin-bottom: 20px; }
.kpi-card {
  border-radius: 8px; padding: 12px 10px; text-align: center;
  border-top: 3px solid #e2e8f0;
}
.kpi-card.navy { background: #0f2540; border-top-color: #f97316; }
.kpi-card.navy .kv { color: #fff; }
.kpi-card.navy .kl { color: #93c5fd; }
.kpi-card.green { background: #f0fdf4; border-top-color: #22c55e; }
.kpi-card.green .kv { color: #15803d; }
.kpi-card.orange { background: #fff7ed; border-top-color: #f97316; }
.kpi-card.orange .kv { color: #c2410c; }
.kpi-card.red { background: #fef2f2; border-top-color: #ef4444; }
.kpi-card.red .kv { color: #dc2626; }
.kpi-card.teal { background: #f0fdfa; border-top-color: #14b8a6; }
.kpi-card.teal .kv { color: #0f766e; }
.kpi-card.blue { background: #eff6ff; border-top-color: #3b82f6; }
.kpi-card.blue .kv { color: #1d4ed8; }
.kpi-card.gray { background: #f8fafc; border-top-color: #94a3b8; }
.kpi-card.gray .kv { color: #334155; }
.kv { font-size: 22px; font-weight: 800; line-height: 1; }
.kv-of { font-size: 13px; font-weight: 400; color: #64748b; }
.kl { font-size: 9px; color: #64748b; margin-top: 4px; }

/* ── Section title ────────────────────────────────────────────────── */
.section-title {
  font-size: 10px; font-weight: 700; letter-spacing: 1.2px;
  text-transform: uppercase; color: #0f2540;
  padding: 6px 0 6px; border-bottom: 1.5px solid #0f2540;
  margin-bottom: 8px;
}
.warn-section { color: #b91c1c; border-bottom-color: #b91c1c; }

/* ── Table ────────────────────────────────────────────────────────── */
.rpt-table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 4px; }
.rpt-table th {
  text-align: left; padding: 6px 7px;
  color: #0f2540; font-size: 9.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.3px;
  background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1;
  white-space: nowrap;
}
.rpt-table td { padding: 5px 7px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.rpt-table tbody tr:hover td { background: #f8fafc; }
.row-stripe td { background: #fafbfc; }
.tc { text-align: center; }
.empty-row { text-align: center; color: #94a3b8; padding: 20px !important; }

.green-txt { color: #15803d; font-weight: 700; }
.red-txt { color: #dc2626; font-weight: 700; }
.muted { color: #94a3b8; }
.mono-sm { font-family: 'Courier New', monospace; font-size: 9.5px; color: #475569; }
.date-sm { font-size: 9.5px; white-space: nowrap; }
.site-cell { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.keluhan-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Badges ───────────────────────────────────────────────────────── */
.badge-pass { background: #22c55e; color: #fff; font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 10px; display: inline-block; white-space: nowrap; }
.badge-not  { background: #ef4444; color: #fff; font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 10px; display: inline-block; white-space: nowrap; }
.badge-ok   { background: #22c55e; color: #fff; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 10px; display: inline-block; white-space: nowrap; }
.badge-warn { background: #f97316; color: #fff; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 10px; display: inline-block; white-space: nowrap; }
.badge-resolved { background: #dcfce7; color: #15803d; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 10px; display: inline-block; }
.badge-open { background: #fee2e2; color: #dc2626; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 10px; display: inline-block; }
.badge-progress { background: #fff7ed; color: #c2410c; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 10px; display: inline-block; }

/* ── Chart ────────────────────────────────────────────────────────── */
.chart-container { overflow-x: auto; margin-bottom: 6px; }
.daily-chart { display: block; min-height: 120px; width: 100%; }
.chart-legend { display: flex; gap: 16px; margin-bottom: 14px; }
.leg-item { display: flex; align-items: center; gap: 5px; font-size: 9px; color: #64748b; }
.leg-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }

/* ── Layanan group ────────────────────────────────────────────────── */
.layanan-group { margin-bottom: 14px; }
.layanan-group-header {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; background: #0f2540; border-radius: 6px 6px 0 0;
  color: #fff; margin-bottom: 0;
}
.layanan-kode { font-size: 12px; font-weight: 800; color: #f97316; font-family: monospace; }
.layanan-nama { font-size: 11px; color: #e2e8f0; }
.layanan-info { margin-left: auto; font-size: 9.5px; color: #93c5fd; }

/* ── All ok banner ────────────────────────────────────────────────── */
.all-ok-banner {
  background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;
  padding: 14px 18px; color: #15803d; font-size: 12px; font-weight: 600;
  margin-bottom: 18px;
}

/* ── Summary & note boxes ────────────────────────────────────────── */
.summary-box { background: #f8fafc; border-left: 4px solid #0f2540; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-top: 16px; }
.summary-box-title { font-size: 10px; font-weight: 700; color: #0f2540; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
.summary-txt { font-size: 11px; color: #334155; line-height: 1.6; }
.note-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; margin-top: 20px; font-size: 10px; color: #92400e; line-height: 1.5; }

/* ── Ticket table ─────────────────────────────────────────────────── */
.ticket-table { font-size: 9.5px; }
.ticket-table th { font-size: 8.5px; padding: 5px 5px; }
.ticket-table td { padding: 4px 5px; }

/* ── Loading/error screens ───────────────────────────────────────── */
.loading-screen, .error-screen {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: 60vh; gap: 16px;
  font-size: 15px; color: #475569;
}
.error-screen h2 { color: #dc2626; }
.loading-spinner {
  width: 40px; height: 40px; border: 4px solid #e2e8f0;
  border-top-color: #0f2540; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ═══════════════════════════════════════════════════════════════════ */
/* PRINT MEDIA                                                         */
/* ═══════════════════════════════════════════════════════════════════ */
@media print {
  @page { size: A4; margin: 0; }

  body { background: #fff; font-size: 10px; }
  .print-root { max-width: 100%; }

  .no-print { display: none !important; }

  .print-page {
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    padding: 14mm 14mm 18mm;
    box-shadow: none;
    page-break-after: always;
    page-break-inside: avoid;
    overflow: visible;
  }

  .cover-inner { padding: 40mm 20mm 14mm; }

  .rpt-table { page-break-inside: auto; }
  .rpt-table tr { page-break-inside: avoid; }

  .page-footer { position: fixed; bottom: 0; left: 0; right: 0; }

  .layanan-group { page-break-inside: avoid; }
  .summary-box, .note-box { page-break-inside: avoid; }

  .cover-page { background: #0f2540 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-kpi { background: rgba(255,255,255,0.07) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .layanan-group-header { background: #0f2540 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kpi-card.navy { background: #0f2540 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge-pass, .badge-not, .badge-ok, .badge-warn,
  .badge-resolved, .badge-open, .badge-progress { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rpt-table th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
