<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'

interface NocTiket {
  id_ticket: number
  nomor_tiket: string
  judul_tiket: string
  prioritas: string
  status_tiket: string
  tgl_open: string
  sla_due: string | null
  sla_breached: boolean
  site: { nama_site: string; kota?: string | null; pelanggan?: { nama_pelanggan: string } | null } | null
  teknisi: { nama_lengkap: string } | null
}

interface NocWo {
  nomor_wo: string
  status_wo: string
  jenis_wo: string
  teknisi: { nama_lengkap: string } | null
  vendor: { nama_vendor: string } | null
  site: { nama_site: string } | null
}

interface NocData {
  waktu_server: string
  total_aktif: number
  by_prioritas: Record<string, number>
  sla_breach: number
  sla_warning: number
  resolved_hari_ini: number
  tiket: NocTiket[]
  wo_lapangan: NocWo[]
}

const router = useRouter()

const data = ref<NocData | null>(null)
const loading = ref(true)
const error = ref('')
const lastUpdate = ref('')
const now = ref(Date.now())
const isFullscreen = ref(false)

let fetchTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

const jamDinding = computed(() =>
  new Date(now.value).toLocaleTimeString('id-ID', { hour12: false })
)
const tglDinding = computed(() =>
  new Date(now.value).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
)

async function fetchData() {
  try {
    const r = await api.get('/operations/noc-board')
    data.value = r.data.data
    lastUpdate.value = new Date().toLocaleTimeString('id-ID', { hour12: false })
    error.value = ''
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat data NOC'
  } finally {
    loading.value = false
  }
}

const prioColors: Record<string, string> = {
  Critical: '#f87171',
  High: '#fb923c',
  Medium: '#facc15',
  Low: '#64748b',
}

const prioList = computed(() =>
  (['Critical', 'High', 'Medium', 'Low'] as const).map((p) => ({
    label: p,
    count: data.value?.by_prioritas?.[p] ?? 0,
    color: prioColors[p],
  }))
)

function umurTiket(tglOpen: string): string {
  const diff = now.value - new Date(tglOpen).getTime()
  if (isNaN(diff) || diff < 0) return '—'
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}h ${h % 24}j`
  return `${h}j ${m % 60}m`
}

function slaBadge(t: NocTiket): { text: string; cls: string } {
  if (!t.sla_due) return { text: '—', cls: 'sla-none' }
  const diff = new Date(t.sla_due).getTime() - now.value
  const abs = Math.abs(diff)
  const m = Math.floor(abs / 60000)
  const h = Math.floor(m / 60)
  if (diff <= 0 || t.sla_breached) {
    return { text: h > 0 ? `TELAT ${h}j` : `TELAT ${m}m`, cls: 'sla-late' }
  }
  const text = h > 0 ? `${h}j ${m % 60}m` : `${m}m`
  return { text, cls: diff < 2 * 3600 * 1000 ? 'sla-warn' : 'sla-ok' }
}

function woStatusCls(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.includes('on-site') || s.includes('onsite') || s.includes('on site')) return 'wo-onsite'
  return 'wo-dispatch'
}

function openTicket(id: number) {
  router.push('/operations/' + id)
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch { /* ignore */ }
}

function onFsChange() {
  isFullscreen.value = !!document.fullscreenElement
}

onMounted(() => {
  fetchData()
  fetchTimer = setInterval(fetchData, 30000)
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
  document.addEventListener('fullscreenchange', onFsChange)
})

onUnmounted(() => {
  if (fetchTimer) clearInterval(fetchTimer)
  if (clockTimer) clearInterval(clockTimer)
  document.removeEventListener('fullscreenchange', onFsChange)
})
</script>

<template>
  <div class="noc-board">
    <!-- Header -->
    <div class="noc-header">
      <div class="noc-title">
        <div class="noc-brand">
          <span class="brand-mark">NOC</span>
          <h1>Papan Pemantauan Operasional</h1>
        </div>
        <div class="noc-live">
          <span class="live-dot"></span>
          <span>LIVE</span>
          <span class="live-sep">·</span>
          <span v-if="lastUpdate">sinkron {{ lastUpdate }}</span>
          <span v-else>memuat…</span>
        </div>
      </div>
      <div class="noc-clockbox">
        <div class="noc-clock">{{ jamDinding }}</div>
        <div class="noc-date">{{ tglDinding }}</div>
      </div>
      <button class="fs-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'">
        {{ isFullscreen ? '✕' : '⛶' }}
      </button>
    </div>

    <div v-if="error" class="noc-error">{{ error }}</div>

    <template v-if="data">
      <!-- Stat strip -->
      <div class="stat-row">
        <div class="stat-tile accent-blue">
          <div class="stat-body">
            <div class="stat-num">{{ data.total_aktif }}</div>
            <div class="stat-label">Tiket Aktif</div>
          </div>
        </div>
        <div class="stat-tile accent-red" :class="{ alarm: data.sla_breach > 0 }">
          <div class="stat-body">
            <div class="stat-num" :class="{ 'num-red': data.sla_breach > 0 }">{{ data.sla_breach }}</div>
            <div class="stat-label">SLA Telat</div>
          </div>
        </div>
        <div class="stat-tile accent-amber">
          <div class="stat-body">
            <div class="stat-num" :class="{ 'num-amber': data.sla_warning > 0 }">{{ data.sla_warning }}</div>
            <div class="stat-label">Hampir Telat</div>
          </div>
        </div>
        <div class="stat-tile accent-green">
          <div class="stat-body">
            <div class="stat-num num-green">{{ data.resolved_hari_ini }}</div>
            <div class="stat-label">Selesai Hari Ini</div>
          </div>
        </div>
        <div class="stat-tile prio-tile">
          <div class="stat-label prio-title">Per Prioritas</div>
          <div class="prio-grid">
            <div v-for="p in prioList" :key="p.label" class="prio-item" :class="{ dim: p.count === 0 }">
              <span class="prio-dot" :style="{ background: p.color }"></span>
              <span class="prio-name">{{ p.label }}</span>
              <span class="prio-count" :style="{ color: p.count > 0 ? p.color : '#334155' }">{{ p.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Main -->
      <div class="noc-main">
        <!-- Tickets -->
        <div class="panel">
          <div class="panel-head">
            <span class="panel-title">Tiket Aktif</span>
            <span class="panel-count" v-if="data.tiket.length">{{ data.tiket.length }}</span>
          </div>
          <div v-if="data.tiket.length === 0" class="empty-tiket">
            <div class="empty-icon">✓</div>
            <div class="empty-text">Semua aman</div>
            <div class="empty-sub">Tidak ada tiket aktif saat ini</div>
          </div>
          <table v-else class="tiket-table">
            <thead>
              <tr>
                <th>Tiket</th>
                <th>Pelanggan / Site</th>
                <th>Prioritas</th>
                <th>Teknisi</th>
                <th class="th-right">Umur</th>
                <th class="th-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in data.tiket"
                :key="t.id_ticket"
                :class="{ breached: t.sla_breached }"
                @click="openTicket(t.id_ticket)"
              >
                <td>
                  <div class="tk-nomor">{{ t.nomor_tiket }}</div>
                  <div class="tk-judul">{{ t.judul_tiket }}</div>
                </td>
                <td>
                  <div class="tk-pelanggan">{{ t.site?.pelanggan?.nama_pelanggan || '—' }}</div>
                  <div class="tk-site">{{ t.site?.nama_site || '—' }}<span v-if="t.site?.kota"> · {{ t.site.kota }}</span></div>
                </td>
                <td>
                  <span class="prio-cell" :style="{ color: prioColors[t.prioritas] || '#64748b' }">
                    <span class="prio-dot" :style="{ background: prioColors[t.prioritas] || '#64748b' }"></span>
                    {{ t.prioritas }}
                  </span>
                </td>
                <td>
                  <span v-if="t.teknisi" class="tk-teknisi">{{ t.teknisi.nama_lengkap }}</span>
                  <span v-else class="belum-tugas">⚠ Belum ditugaskan</span>
                </td>
                <td class="tk-umur">{{ umurTiket(t.tgl_open) }}</td>
                <td class="td-right">
                  <span class="sla-badge" :class="slaBadge(t).cls">{{ slaBadge(t).text }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Field WO -->
        <div class="panel">
          <div class="panel-head">
            <span class="panel-title">Teknisi di Lapangan</span>
            <span class="panel-count" v-if="data.wo_lapangan.length">{{ data.wo_lapangan.length }}</span>
          </div>
          <div v-if="data.wo_lapangan.length === 0" class="empty-wo">
            <div class="empty-icon-sm">🛠</div>
            <div>Tidak ada WO berjalan</div>
          </div>
          <div v-else class="wo-list">
            <div v-for="(wo, i) in data.wo_lapangan" :key="wo.nomor_wo + i" class="wo-card">
              <div class="wo-top">
                <span class="wo-nama">{{ wo.teknisi?.nama_lengkap || wo.vendor?.nama_vendor || '—' }}</span>
                <span class="wo-status" :class="woStatusCls(wo.status_wo)">{{ wo.status_wo }}</span>
              </div>
              <div class="wo-detail">{{ wo.nomor_wo }} · {{ wo.jenis_wo }}</div>
              <div class="wo-site">📍 {{ wo.site?.nama_site || '—' }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="loading" class="noc-loading">Memuat data NOC…</div>
  </div>
</template>

<style scoped>
.noc-board {
  background: linear-gradient(160deg, #0a1020 0%, #0d1528 60%, #0a1222 100%);
  color: #e2e8f0;
  border-radius: 14px;
  min-height: calc(100vh - 120px);
  padding: 22px 26px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.noc-board:fullscreen {
  border-radius: 0;
  min-height: 100vh;
  overflow: auto;
  padding: 32px 40px;
}

/* ── Header ─────────────────────────────── */
.noc-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 22px;
}
.noc-title { flex: 1; }
.noc-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-mark {
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  color: #fff;
  font-weight: 800;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
  padding: 5px 12px;
  border-radius: 8px;
}
.noc-brand h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
  letter-spacing: 0.01em;
}
.noc-live {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #64748b;
  font-size: 0.8rem;
  margin-top: 7px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.noc-live > span:nth-child(2) { color: #4ade80; }
.live-sep { color: #334155; }
.live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.8);
  animation: blink 2s ease-in-out infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.noc-clockbox { text-align: right; }
.noc-clock {
  font-size: 2.1rem;
  font-weight: 800;
  color: #f8fafc;
  line-height: 1;
  letter-spacing: 0.04em;
}
.noc-date {
  color: #64748b;
  font-size: 0.8rem;
  margin-top: 4px;
}
.fs-btn {
  background: rgba(30, 41, 59, 0.6);
  color: #94a3b8;
  border: 1px solid #253347;
  border-radius: 10px;
  width: 42px; height: 42px;
  cursor: pointer;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.fs-btn:hover { background: #253347; color: #e2e8f0; }

.noc-error {
  background: rgba(220, 38, 38, 0.12);
  border: 1px solid rgba(220, 38, 38, 0.4);
  color: #fca5a5;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
}
.noc-loading { text-align: center; color: #64748b; padding: 80px 0; font-size: 1.1rem; }

/* ── Stat strip ─────────────────────────── */
.stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1.4fr;
  gap: 12px;
  margin-bottom: 18px;
}
.stat-tile {
  position: relative;
  background: rgba(17, 26, 46, 0.85);
  border: 1px solid #1c2a44;
  border-radius: 12px;
  padding: 16px 18px 14px;
  overflow: hidden;
}
.stat-tile::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
}
.accent-blue::before  { background: #3b82f6; }
.accent-red::before   { background: #ef4444; }
.accent-amber::before { background: #f59e0b; }
.accent-green::before { background: #22c55e; }

.stat-num {
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1;
  color: #f8fafc;
}
.num-red   { color: #f87171; }
.num-amber { color: #fbbf24; }
.num-green { color: #4ade80; }
.stat-label {
  margin-top: 7px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #64748b;
}
.stat-tile.alarm {
  border-color: rgba(239, 68, 68, 0.6);
  animation: alarmGlow 1.6s ease-in-out infinite;
}
@keyframes alarmGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.35); }
  50% { box-shadow: 0 0 18px 2px rgba(239, 68, 68, 0.25); }
}

/* Prioritas tile — 2×2 grid di dalam satu kartu */
.prio-tile { padding: 12px 16px; }
.prio-title { margin: 0 0 8px; }
.prio-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 14px;
}
.prio-item {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.82rem;
}
.prio-item.dim { opacity: 0.45; }
.prio-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.prio-name { color: #94a3b8; flex: 1; }
.prio-count { font-weight: 800; font-size: 1rem; }

/* ── Main grid ──────────────────────────── */
.noc-main {
  display: grid;
  grid-template-columns: 2.2fr 1fr;
  gap: 12px;
  align-items: start;
}
.panel {
  background: rgba(17, 26, 46, 0.85);
  border: 1px solid #1c2a44;
  border-radius: 12px;
  padding: 14px 16px;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #1c2a44;
}
.panel-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.panel-count {
  background: #1d4ed8;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 1px 9px;
  border-radius: 999px;
}

/* ── Ticket table ───────────────────────── */
.tiket-table { width: 100%; border-collapse: collapse; }
.tiket-table th {
  text-align: left;
  color: #475569;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 6px 10px;
}
.th-right, .td-right { text-align: right; }
.tiket-table td {
  padding: 10px;
  border-top: 1px solid #16213a;
  vertical-align: middle;
}
.tiket-table tbody tr { cursor: pointer; transition: background 0.15s; }
.tiket-table tbody tr:hover { background: rgba(30, 41, 59, 0.5); }
.tiket-table tbody tr.breached { background: rgba(220, 38, 38, 0.08); box-shadow: inset 3px 0 0 #dc2626; }
.tiket-table tbody tr.breached:hover { background: rgba(220, 38, 38, 0.14); }

.tk-nomor { font-weight: 700; color: #93c5fd; font-size: 0.88rem; }
.tk-judul {
  color: #64748b; font-size: 0.8rem; max-width: 300px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tk-pelanggan { color: #e2e8f0; font-weight: 600; font-size: 0.88rem; }
.tk-site { color: #64748b; font-size: 0.78rem; }
.prio-cell { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 0.84rem; }
.tk-teknisi { color: #cbd5e1; font-size: 0.88rem; }
.belum-tugas { color: #fbbf24; font-weight: 700; font-size: 0.78rem; }
.tk-umur { color: #94a3b8; white-space: nowrap; text-align: right; font-size: 0.88rem; }

.sla-badge {
  display: inline-block;
  min-width: 76px;
  text-align: center;
  padding: 4px 10px;
  border-radius: 7px;
  font-weight: 700;
  font-size: 0.8rem;
  white-space: nowrap;
}
.sla-late { background: #dc2626; color: #fff; animation: blink 1.2s ease-in-out infinite; }
.sla-warn { background: rgba(245, 158, 11, 0.16); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); }
.sla-ok   { background: rgba(34, 197, 94, 0.12);  color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.28); }
.sla-none { color: #475569; }

/* ── Empty states ───────────────────────── */
.empty-tiket { text-align: center; padding: 44px 0 40px; }
.empty-icon {
  width: 58px; height: 58px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #4ade80;
  font-size: 1.7rem;
  font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.empty-text { color: #4ade80; font-size: 1.25rem; font-weight: 700; }
.empty-sub { color: #475569; font-size: 0.85rem; margin-top: 4px; }
.empty-wo { text-align: center; color: #475569; padding: 32px 0; font-size: 0.9rem; }
.empty-icon-sm { font-size: 1.6rem; margin-bottom: 8px; opacity: 0.5; }

/* ── WO cards ───────────────────────────── */
.wo-list { display: flex; flex-direction: column; gap: 8px; }
.wo-card {
  background: rgba(13, 20, 38, 0.8);
  border: 1px solid #1c2a44;
  border-left: 3px solid #3b82f6;
  border-radius: 10px;
  padding: 10px 13px;
}
.wo-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 3px; }
.wo-nama { font-weight: 700; color: #f1f5f9; font-size: 0.9rem; }
.wo-status { padding: 2px 9px; border-radius: 999px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
.wo-dispatch { background: rgba(59, 130, 246, 0.16); color: #60a5fa; }
.wo-onsite   { background: rgba(245, 158, 11, 0.16); color: #fbbf24; }
.wo-detail { color: #64748b; font-size: 0.8rem; }
.wo-site   { color: #475569; font-size: 0.78rem; margin-top: 2px; }
</style>
