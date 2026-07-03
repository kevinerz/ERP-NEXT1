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

let timer: ReturnType<typeof setInterval> | null = null

async function fetchData() {
  try {
    const r = await api.get('/operations/noc-board')
    data.value = r.data.data
    now.value = Date.now()
    lastUpdate.value = new Date().toLocaleTimeString('id-ID', { hour12: false })
    error.value = ''
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat data NOC'
  } finally {
    loading.value = false
  }
}

const prioColors: Record<string, string> = {
  Critical: '#dc2626',
  High: '#f97316',
  Medium: '#eab308',
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

interface SlaBadge {
  text: string
  cls: string
}

function slaBadge(t: NocTiket): SlaBadge {
  if (!t.sla_due) return { text: '—', cls: 'sla-none' }
  const diff = new Date(t.sla_due).getTime() - now.value
  const abs = Math.abs(diff)
  const m = Math.floor(abs / 60000)
  const h = Math.floor(m / 60)
  if (diff <= 0 || t.sla_breached) {
    return { text: h > 0 ? `TELAT ${h}j` : `TELAT ${m}m`, cls: 'sla-late' }
  }
  const text = h > 0 ? `sisa ${h}j ${m % 60}m` : `sisa ${m}m`
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
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    /* ignore */
  }
}

function onFsChange() {
  isFullscreen.value = !!document.fullscreenElement
}

onMounted(() => {
  fetchData()
  timer = setInterval(fetchData, 30000)
  document.addEventListener('fullscreenchange', onFsChange)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('fullscreenchange', onFsChange)
})
</script>

<template>
  <div class="noc-board">
    <!-- Header -->
    <div class="noc-header">
      <div class="noc-title">
        <h1>NOC — Papan Pemantauan Operasional</h1>
        <div class="noc-live">
          <span class="live-dot"></span>
          <span v-if="lastUpdate">update terakhir {{ lastUpdate }}</span>
          <span v-else>memuat…</span>
        </div>
      </div>
      <button class="fs-btn" @click="toggleFullscreen">
        {{ isFullscreen ? '✕ Keluar Layar Penuh' : '⛶ Layar Penuh' }}
      </button>
    </div>

    <div v-if="error" class="noc-error">{{ error }}</div>

    <template v-if="data">
      <!-- Stat tiles -->
      <div class="stat-row">
        <div class="stat-tile">
          <div class="stat-num">{{ data.total_aktif }}</div>
          <div class="stat-label">Tiket Aktif</div>
        </div>
        <div class="stat-tile stat-red" :class="{ pulse: data.sla_breach > 0 }">
          <div class="stat-num">{{ data.sla_breach }}</div>
          <div class="stat-label">SLA TELAT</div>
        </div>
        <div class="stat-tile stat-amber">
          <div class="stat-num">{{ data.sla_warning }}</div>
          <div class="stat-label">Hampir Telat</div>
        </div>
        <div class="stat-tile stat-green">
          <div class="stat-num">{{ data.resolved_hari_ini }}</div>
          <div class="stat-label">Selesai Hari Ini</div>
        </div>
        <div class="prio-chips">
          <div v-for="p in prioList" :key="p.label" class="prio-chip" :style="{ borderColor: p.color }">
            <span class="prio-dot" :style="{ background: p.color }"></span>
            <span class="prio-name">{{ p.label }}</span>
            <span class="prio-count" :style="{ color: p.color }">{{ p.count }}</span>
          </div>
        </div>
      </div>

      <!-- Main -->
      <div class="noc-main">
        <!-- Tickets -->
        <div class="panel">
          <div class="panel-title">Tiket Aktif</div>
          <div v-if="data.tiket.length === 0" class="empty-tiket">
            ✓ Tidak ada tiket aktif — semua aman
          </div>
          <table v-else class="tiket-table">
            <thead>
              <tr>
                <th>Tiket</th>
                <th>Pelanggan / Site</th>
                <th>Prioritas</th>
                <th>Teknisi</th>
                <th>Umur</th>
                <th>SLA</th>
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
                  <span class="prio-cell">
                    <span class="prio-dot" :style="{ background: prioColors[t.prioritas] || '#64748b' }"></span>
                    {{ t.prioritas }}
                  </span>
                </td>
                <td>
                  <span v-if="t.teknisi">{{ t.teknisi.nama_lengkap }}</span>
                  <span v-else class="belum-tugas">BELUM DITUGASKAN</span>
                </td>
                <td class="tk-umur">{{ umurTiket(t.tgl_open) }}</td>
                <td>
                  <span class="sla-badge" :class="slaBadge(t).cls">{{ slaBadge(t).text }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Field WO -->
        <div class="panel">
          <div class="panel-title">Teknisi di Lapangan</div>
          <div v-if="data.wo_lapangan.length === 0" class="empty-wo">Tidak ada WO berjalan</div>
          <div v-else class="wo-list">
            <div v-for="(wo, i) in data.wo_lapangan" :key="wo.nomor_wo + i" class="wo-card">
              <div class="wo-top">
                <span class="wo-nama">{{ wo.teknisi?.nama_lengkap || wo.vendor?.nama_vendor || '—' }}</span>
                <span class="wo-status" :class="woStatusCls(wo.status_wo)">{{ wo.status_wo }}</span>
              </div>
              <div class="wo-detail">{{ wo.nomor_wo }} · {{ wo.jenis_wo }}</div>
              <div class="wo-site">{{ wo.site?.nama_site || '—' }}</div>
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
  background: #0b1220;
  color: #e2e8f0;
  border-radius: 12px;
  min-height: calc(100vh - 120px);
  padding: 24px;
  font-size: 15px;
}
.noc-board:fullscreen {
  border-radius: 0;
  min-height: 100vh;
  overflow: auto;
}

/* Header */
.noc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.noc-title h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0 0 4px;
}
.noc-live {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 0.85rem;
}
.live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #22c55e;
  animation: blink 2s ease-in-out infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.fs-btn {
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 0.9rem;
}
.fs-btn:hover {
  background: #334155;
}

.noc-error {
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid #dc2626;
  color: #fca5a5;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}
.noc-loading {
  text-align: center;
  color: #94a3b8;
  padding: 80px 0;
  font-size: 1.2rem;
}

/* Stat tiles */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr) auto;
  gap: 14px;
  margin-bottom: 20px;
}
.stat-tile {
  background: #131c31;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 18px 20px;
  text-align: center;
}
.stat-num {
  font-size: 3rem;
  font-weight: 800;
  line-height: 1.1;
  color: #f1f5f9;
}
.stat-label {
  margin-top: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.stat-red .stat-num { color: #ef4444; }
.stat-amber .stat-num { color: #f59e0b; }
.stat-green .stat-num { color: #22c55e; }
.stat-tile.pulse {
  border-color: #dc2626;
  animation: pulseRed 1.6s ease-in-out infinite;
}
@keyframes pulseRed {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
  50% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
}

.prio-chips {
  display: grid;
  grid-template-rows: repeat(4, 1fr);
  gap: 6px;
  min-width: 170px;
}
.prio-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #131c31;
  border: 1px solid;
  border-radius: 8px;
  padding: 2px 12px;
  font-size: 0.85rem;
}
.prio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.prio-name {
  color: #cbd5e1;
  flex: 1;
}
.prio-count {
  font-weight: 800;
  font-size: 1.05rem;
}

/* Main grid */
.noc-main {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  align-items: start;
}
.panel {
  background: #131c31;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 16px;
}
.panel-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 12px;
  letter-spacing: 0.03em;
}

/* Ticket table */
.tiket-table {
  width: 100%;
  border-collapse: collapse;
}
.tiket-table th {
  text-align: left;
  color: #64748b;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 8px 10px;
  border-bottom: 1px solid #1e293b;
}
.tiket-table td {
  padding: 10px;
  border-bottom: 1px solid #1a2438;
  vertical-align: middle;
}
.tiket-table tbody tr {
  cursor: pointer;
  transition: background 0.15s;
}
.tiket-table tbody tr:hover {
  background: #1a2438;
}
.tiket-table tbody tr.breached {
  background: rgba(220, 38, 38, 0.09);
}
.tiket-table tbody tr.breached:hover {
  background: rgba(220, 38, 38, 0.16);
}
.tk-nomor {
  font-weight: 700;
  color: #93c5fd;
  font-size: 0.9rem;
}
.tk-judul {
  color: #94a3b8;
  font-size: 0.85rem;
  max-width: 280px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tk-pelanggan {
  color: #e2e8f0;
  font-weight: 600;
  font-size: 0.9rem;
}
.tk-site {
  color: #94a3b8;
  font-size: 0.82rem;
}
.prio-cell {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  font-size: 0.88rem;
}
.belum-tugas {
  color: #f59e0b;
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
}
.tk-umur {
  color: #cbd5e1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sla-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.82rem;
  white-space: nowrap;
}
.sla-late {
  background: rgba(220, 38, 38, 0.2);
  color: #f87171;
  animation: blink 1.2s ease-in-out infinite;
}
.sla-warn {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
}
.sla-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}
.sla-none {
  color: #64748b;
}

.empty-tiket {
  text-align: center;
  color: #22c55e;
  font-size: 1.6rem;
  font-weight: 700;
  padding: 70px 0;
}
.empty-wo {
  text-align: center;
  color: #64748b;
  padding: 40px 0;
}

/* WO cards */
.wo-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wo-card {
  background: #0f1728;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 12px 14px;
}
.wo-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.wo-nama {
  font-weight: 700;
  color: #f1f5f9;
}
.wo-status {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}
.wo-dispatch {
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
}
.wo-onsite {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
}
.wo-detail {
  color: #94a3b8;
  font-size: 0.85rem;
}
.wo-site {
  color: #64748b;
  font-size: 0.82rem;
  margin-top: 2px;
}
</style>
