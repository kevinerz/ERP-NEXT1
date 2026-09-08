<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePortalAuthStore } from '@/stores/portalAuth'
import portalApi from '@/services/portalApi'

const auth   = usePortalAuthStore()
const router = useRouter()

const sites     = ref<any[]>([])
const loading   = ref(true)
const loadError = ref('')

// Sensor state — expanded per site, sensorDevices is the array from API
const expandedSite    = ref<number | null>(null)
const sensorDevices   = ref<{ device_name: string; sensors: any[] }[]>([])
const sensorLoading   = ref(false)
const graphHours      = ref(0)

// Modal
const modalSensor       = ref<{ id_site: number; objid: number; name: string } | null>(null)
const modalHours        = ref(0)
const modalGraphUrl     = ref<string | null>(null)
const modalGraphLoading = ref(false)

onMounted(async () => {
  try {
    const res = await portalApi.get('/portal/sites')
    sites.value = res.data.data
  } catch (e: any) {
    loadError.value = e?.response?.data?.message || 'Gagal memuat data site.'
  } finally { loading.value = false }
})

async function toggleSensors(id_site: number) {
  if (expandedSite.value === id_site) {
    expandedSite.value = null; sensorDevices.value = []
    return
  }
  expandedSite.value = id_site; sensorLoading.value = true; sensorDevices.value = []
  try {
    const r = await portalApi.get(`/portal/sites/${id_site}/sensors`)
    // API returns { data: [{device_name, sensors}] } — array of devices
    sensorDevices.value = Array.isArray(r.data.data) ? r.data.data : []
  } catch { sensorDevices.value = [] }
  finally { sensorLoading.value = false }
}

async function openModal(id_site: number, objid: number, name: string) {
  modalSensor.value = { id_site, objid, name }
  modalHours.value  = graphHours.value
  await fetchModalGraph(id_site, objid, graphHours.value)
}

async function fetchModalGraph(id_site: number, objid: number, graphid: number) {
  if (modalGraphUrl.value) { URL.revokeObjectURL(modalGraphUrl.value); modalGraphUrl.value = null }
  modalGraphLoading.value = true
  try {
    const r = await portalApi.get(`/portal/sites/${id_site}/sensor/${objid}/graph.png`, {
      params: { graphid }, responseType: 'blob',
    })
    modalGraphUrl.value = URL.createObjectURL(r.data)
  } catch { modalGraphUrl.value = null }
  finally { modalGraphLoading.value = false }
}

async function modalChangeHours(h: number) {
  modalHours.value = h
  if (modalSensor.value) await fetchModalGraph(modalSensor.value.id_site, modalSensor.value.objid, h)
}

function monitorStatus(site: any): 'up' | 'down' | 'warn' | 'none' {
  if (!site.monitoring) return 'none'
  const st = (site.monitoring.status || '').toLowerCase()
  if (st === 'up' || st === 'online' || st === '3') return 'up'
  if (st === 'down' || st === 'offline' || st === '4' || st === '5') return 'down'
  return 'warn'
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const totalSite  = computed(() => sites.value.length)
const totalUp    = computed(() => sites.value.filter(s => monitorStatus(s) === 'up').length)
const totalDown  = computed(() => sites.value.filter(s => monitorStatus(s) === 'down').length)
const totalTiket = computed(() => sites.value.reduce((a, s) => a + (s.tiket_aktif || 0), 0))

const totalSensors = computed(() => sensorDevices.value.reduce((a, d) => a + (d.sensors?.length || 0), 0))
</script>

<template>
  <div class="dashboard">

    <!-- Page title -->
    <div class="page-title-bar">
      <div class="page-title-inner">
        <div>
          <div class="page-eyebrow">PORTAL MONITORING</div>
          <h1 class="page-heading">{{ auth.user?.pelanggan?.nama_pelanggan || 'Dashboard' }}</h1>
        </div>
        <div class="page-meta">Kode: <strong>{{ auth.user?.pelanggan?.kode_pelanggan }}</strong></div>
      </div>
    </div>

    <!-- KPI Strip -->
    <div class="kpi-strip">
      <div class="kpi-card">
        <div class="kpi-value">{{ totalSite }}</div>
        <div class="kpi-label">Total Site</div>
      </div>
      <div class="kpi-card kpi-up">
        <div class="kpi-value">{{ totalUp }}</div>
        <div class="kpi-label">Online</div>
      </div>
      <div class="kpi-card" :class="totalDown > 0 ? 'kpi-down' : ''">
        <div class="kpi-value">{{ totalDown }}</div>
        <div class="kpi-label">Down</div>
      </div>
      <div class="kpi-card" :class="totalTiket > 0 ? 'kpi-warn' : ''">
        <div class="kpi-value">{{ totalTiket }}</div>
        <div class="kpi-label">Tiket Aktif</div>
      </div>
    </div>

    <div v-if="loadError" class="alert-error">{{ loadError }}</div>
    <div v-if="loading" class="state-loading">
      <span class="spinner"></span> Memuat data…
    </div>

    <!-- Site grid -->
    <div class="site-grid" v-else-if="sites.length">
      <div
        v-for="site in sites" :key="site.id_site"
        :class="['site-card', `stripe-${monitorStatus(site)}`]"
      >
        <!-- Card header -->
        <div class="card-head">
          <div class="card-head-left">
            <div class="site-name">{{ site.nama_site }}</div>
            <div class="site-meta">{{ site.kode_site }}&ensp;·&ensp;{{ site.layanan?.nama_layanan }}</div>
          </div>
          <div class="card-head-right">
            <span :class="['pill-status', `pill-${site.status_site?.toLowerCase()}`]">{{ site.status_site }}</span>
            <span
              v-if="site.tiket_aktif"
              class="pill-tiket"
              @click="router.push({ path: '/portal/tickets', query: { id_site: site.id_site } })"
            >{{ site.tiket_aktif }} Tiket</span>
          </div>
        </div>

        <!-- Monitor status row -->
        <div :class="['monitor-row', `mon-${monitorStatus(site)}`]">
          <span class="mon-indicator"></span>
          <span class="mon-text">
            <template v-if="monitorStatus(site) === 'up'">Jaringan Online</template>
            <template v-else-if="monitorStatus(site) === 'down'">Jaringan Down</template>
            <template v-else-if="monitorStatus(site) === 'warn'">Perhatian — {{ site.monitoring?.status }}</template>
            <template v-else>Tidak Dipantau</template>
          </span>
          <span v-if="site.monitoring?.last_change" class="mon-since">
            sejak {{ fmtDate(site.monitoring.last_change) }}
          </span>
        </div>

        <!-- Info rows -->
        <div class="info-section">
          <div class="info-row" v-if="site.kota || site.provinsi || site.alamat">
            <span class="info-key">Lokasi</span>
            <span class="info-val">{{ [site.kota, site.provinsi].filter(Boolean).join(', ') || site.alamat || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">Aktif Sejak</span>
            <span class="info-val">{{ fmtDate(site.tgl_aktif) }}</span>
          </div>
        </div>

        <!-- Device table -->
        <div class="device-section" v-if="site.perangkat?.length">
          <table class="device-table">
            <tbody>
              <tr v-for="(p, i) in site.perangkat.slice(0, 3)" :key="i">
                <td><span class="dev-type">{{ p.jenis_perangkat }}</span></td>
                <td class="dev-name">{{ [p.merk, p.tipe_model].filter(Boolean).join(' ') || '—' }}</td>
                <td class="dev-ip">{{ p.ip_address || '' }}</td>
                <td><span :class="['dev-status', p.status_perangkat === 'Aktif' ? 'dev-aktif' : 'dev-na']">{{ p.status_perangkat }}</span></td>
              </tr>
            </tbody>
          </table>
          <div v-if="site.perangkat.length > 3" class="dev-more">+{{ site.perangkat.length - 3 }} perangkat lainnya</div>
        </div>
        <div class="device-empty" v-else>Tidak ada data perangkat terdaftar</div>

        <!-- Sensor toggle -->
        <div class="card-footer">
          <button
            :class="['btn-sensor', expandedSite === site.id_site ? 'btn-sensor-active' : '']"
            @click="toggleSensors(site.id_site)"
          >
            <span class="sensor-icon">{{ expandedSite === site.id_site ? '▲' : '▼' }}</span>
            {{ expandedSite === site.id_site ? 'Sembunyikan Monitor' : 'Lihat Monitor PRTG' }}
          </button>
        </div>

        <!-- Sensor panel -->
        <div v-if="expandedSite === site.id_site" class="sensor-panel">
          <div v-if="sensorLoading" class="sensor-state">Memuat data sensor dari PRTG…</div>
          <div v-else-if="!sensorDevices.length" class="sensor-state sensor-empty-state">
            Tidak ada perangkat PRTG yang terdaftar untuk site ini.<br>
            <span class="sensor-empty-hint">Hubungi tim teknis untuk pengaturan monitoring.</span>
          </div>
          <template v-else>
            <!-- Rentang waktu -->
            <div class="sensor-toolbar">
              <span class="sensor-toolbar-label">RENTANG</span>
              <div class="time-tabs">
                <button v-for="[gid, lbl] in [[0,'Live'],[1,'48 Jam'],[2,'30 Hari'],[3,'1 Tahun']]" :key="(gid as number)"
                  :class="['time-tab', { active: graphHours === (gid as number) }]"
                  @click="graphHours = (gid as number)">{{ lbl }}</button>
              </div>
              <span class="sensor-summary">{{ totalSensors }} sensor · {{ sensorDevices.length }} device</span>
            </div>

            <!-- Per device -->
            <div v-for="dev in sensorDevices" :key="dev.device_name" class="sensor-device-block">
              <div class="sensor-device-name">{{ dev.device_name }}</div>
              <div v-if="dev.sensors?.length" class="sensor-list">
                <div
                  v-for="s in dev.sensors" :key="s.objid"
                  class="sensor-row"
                  @click="openModal(site.id_site, s.objid, s.sensor)"
                >
                  <span :class="['sensor-dot', s.status_raw <= 3 ? 'dot-up' : 'dot-down']"></span>
                  <span class="sensor-name">{{ s.sensor }}</span>
                  <span :class="['sensor-status-label', s.status_raw <= 3 ? 'lbl-up' : 'lbl-down']">{{ s.status }}</span>
                  <span class="sensor-cta">Lihat Grafik →</span>
                </div>
              </div>
              <div v-else class="sensor-state">Tidak ada sensor untuk device ini</div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-else-if="!loading" class="state-empty">
      Tidak ada site yang terdaftar pada akun ini.
    </div>
  </div>

  <!-- Graph Modal -->
  <Teleport to="body">
    <div v-if="modalSensor" class="modal-overlay" @click.self="modalSensor = null">
      <div class="modal-box">
        <div class="modal-head">
          <div>
            <div class="modal-sensor-name">{{ modalSensor.name }}</div>
            <div class="modal-sensor-id">Sensor ID {{ modalSensor.objid }}</div>
          </div>
          <button class="modal-close" @click="modalSensor = null">✕</button>
        </div>
        <div class="modal-time-bar">
          <button v-for="[gid, label] in [[0,'Live'],[1,'48 Jam'],[2,'30 Hari'],[3,'1 Tahun']]" :key="gid"
            :class="['time-tab', { active: modalHours === gid }]"
            @click="modalChangeHours(gid as number)">{{ label }}</button>
        </div>
        <div class="modal-body">
          <div v-if="modalGraphLoading" class="modal-loading">Memuat grafik dari PRTG…</div>
          <img v-else-if="modalGraphUrl" :src="modalGraphUrl" class="modal-graph-img" />
          <div v-else class="modal-loading">Grafik tidak tersedia untuk sensor ini.</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

/* ── Reset / base ─────────────────────────────────────────── */
* { box-sizing: border-box; }
.dashboard {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #F0F4F9;
  min-height: 100vh;
  padding: 0 0 48px;
  color: #0B1D35;
}

/* ── Page title bar ───────────────────────────────────────── */
.page-title-bar {
  background: #0B1D35;
  padding: 24px 0 20px;
  margin-bottom: 0;
}
.page-title-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}
.page-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #5A8ED4;
  margin-bottom: 6px;
}
.page-heading {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: -0.3px;
}
.page-meta {
  font-size: 12px;
  color: #7A9EC4;
}
.page-meta strong { color: #A8C4E0; }

/* ── KPI Strip ────────────────────────────────────────────── */
.kpi-strip {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  gap: 0;
  background: #ffffff;
  border-bottom: 1px solid #E3EAF3;
  box-shadow: 0 1px 3px rgba(11,29,53,0.06);
}
.kpi-card {
  flex: 1;
  padding: 18px 24px;
  border-right: 1px solid #E3EAF3;
  border-left: 3px solid transparent;
  transition: background 0.15s;
}
.kpi-card:last-child { border-right: none; }
.kpi-up   { border-left-color: #0B7C4B; }
.kpi-down { border-left-color: #C41E1E; }
.kpi-warn { border-left-color: #B45309; }
.kpi-value {
  font-size: 28px;
  font-weight: 800;
  color: #0B1D35;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
}
.kpi-up   .kpi-value { color: #0B7C4B; }
.kpi-down .kpi-value { color: #C41E1E; }
.kpi-warn .kpi-value { color: #B45309; }
.kpi-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #7A8FA6;
  margin-top: 5px;
}

/* ── Layout ───────────────────────────────────────────────── */
.site-grid {
  max-width: 1200px;
  margin: 28px auto 0;
  padding: 0 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
  gap: 16px;
}

/* ── Site card ────────────────────────────────────────────── */
.site-card {
  background: #fff;
  border: 1px solid #E3EAF3;
  border-radius: 4px;
  border-left: 4px solid #CBD5E1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(11,29,53,0.05);
}
.stripe-up   { border-left-color: #0B7C4B; }
.stripe-down { border-left-color: #C41E1E; }
.stripe-warn { border-left-color: #D97706; }
.stripe-none { border-left-color: #CBD5E1; }

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #F0F4F9;
}
.card-head-left { flex: 1; min-width: 0; }
.site-name {
  font-size: 15px;
  font-weight: 700;
  color: #0B1D35;
  letter-spacing: -0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.site-meta {
  font-size: 11px;
  color: #7A8FA6;
  margin-top: 2px;
  letter-spacing: 0.2px;
}
.card-head-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 12px;
}
.pill-status {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 2px;
}
.pill-aktif      { background: #ECFDF5; color: #065F46; }
.pill-prospek    { background: #FFFBEB; color: #92400E; }
.pill-terminasi  { background: #FEF2F2; color: #991B1B; }
.pill-tiket {
  font-size: 10px;
  font-weight: 700;
  background: #FEF3C7;
  color: #92400E;
  padding: 2px 8px;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.5px;
}
.pill-tiket:hover { background: #FDE68A; }

/* ── Monitor row ──────────────────────────────────────────── */
.monitor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  font-size: 12px;
  font-weight: 600;
}
.mon-up   { background: #F0FDF4; color: #065F46; }
.mon-down { background: #FEF2F2; color: #991B1B; }
.mon-warn { background: #FFFBEB; color: #92400E; }
.mon-none { background: #F8FAFC; color: #7A8FA6; }
.mon-indicator {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: currentColor;
}
.mon-text { flex: 1; }
.mon-since {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.7;
  margin-left: auto;
  flex-shrink: 0;
}

/* ── Info section ─────────────────────────────────────────── */
.info-section {
  padding: 10px 18px;
  border-bottom: 1px solid #F0F4F9;
  display: flex;
  gap: 24px;
}
.info-row { display: flex; flex-direction: column; gap: 2px; }
.info-key {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #9EB3C9;
}
.info-val { font-size: 12px; font-weight: 500; color: #2D4A6A; }

/* ── Device table ─────────────────────────────────────────── */
.device-section { padding: 0 18px 2px; }
.device-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.device-table tr { border-top: 1px solid #F0F4F9; }
.device-table tr:first-child { border-top: none; }
.device-table td { padding: 7px 4px; vertical-align: middle; }
.dev-type {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #5A7184;
  background: #EEF2F7;
  padding: 2px 6px;
  border-radius: 2px;
  white-space: nowrap;
}
.dev-name { color: #1E3A5C; font-weight: 500; padding-left: 8px; }
.dev-ip   { color: #9EB3C9; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; padding-left: 8px; }
.dev-status {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 2px;
  white-space: nowrap;
}
.dev-aktif { background: #ECFDF5; color: #065F46; }
.dev-na    { background: #F1F5F9; color: #64748B; }
.dev-more  { font-size: 11px; color: #9EB3C9; padding: 4px 0 8px; }
.device-empty { padding: 10px 18px 12px; font-size: 11px; color: #9EB3C9; font-style: italic; }

/* ── Card footer ──────────────────────────────────────────── */
.card-footer {
  padding: 10px 18px;
  border-top: 1px solid #F0F4F9;
  margin-top: auto;
}
.btn-sensor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 6px 14px;
  border-radius: 3px;
  border: 1.5px solid #C5D4E8;
  background: #fff;
  color: #1456A6;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-sensor:hover { background: #EEF4FF; border-color: #1456A6; }
.btn-sensor-active { background: #EEF4FF; border-color: #1456A6; }
.sensor-icon { font-size: 8px; }

/* ── Sensor panel ─────────────────────────────────────────── */
.sensor-panel {
  border-top: 2px solid #EEF2F7;
  background: #F8FAFC;
}
.sensor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid #E3EAF3;
}
.sensor-toolbar-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #9EB3C9;
}
.time-tabs { display: flex; gap: 4px; }
.time-tab {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border: 1.5px solid #D1DCE8;
  border-radius: 2px;
  background: #fff;
  color: #5A7184;
  cursor: pointer;
  transition: all 0.12s;
}
.time-tab.active {
  background: #0B1D35;
  border-color: #0B1D35;
  color: #fff;
}
.time-tab:not(.active):hover { border-color: #1456A6; color: #1456A6; }
.sensor-summary {
  margin-left: auto;
  font-size: 11px;
  color: #9EB3C9;
  font-variant-numeric: tabular-nums;
}

.sensor-device-block { border-bottom: 1px solid #E3EAF3; }
.sensor-device-block:last-child { border-bottom: none; }
.sensor-device-name {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #5A7184;
  padding: 8px 18px 4px;
  background: #EEF2F7;
  border-bottom: 1px solid #E3EAF3;
}

.sensor-list { display: flex; flex-direction: column; }
.sensor-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid #F0F4F9;
  cursor: pointer;
  transition: background 0.1s;
}
.sensor-row:last-child { border-bottom: none; }
.sensor-row:hover { background: #EEF4FF; }
.sensor-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-up   { background: #0B7C4B; }
.dot-down { background: #C41E1E; }
.sensor-name { flex: 1; font-size: 13px; font-weight: 500; color: #1E3A5C; }
.sensor-status-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 2px;
  flex-shrink: 0;
}
.lbl-up   { background: #ECFDF5; color: #065F46; }
.lbl-down { background: #FEF2F2; color: #991B1B; }
.sensor-cta {
  font-size: 11px;
  font-weight: 600;
  color: #1456A6;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}

.sensor-state {
  padding: 20px 18px;
  font-size: 12px;
  color: #9EB3C9;
  text-align: center;
  line-height: 1.6;
}
.sensor-empty-state { color: #7A8FA6; }
.sensor-empty-hint  { font-size: 11px; color: #9EB3C9; display: block; margin-top: 4px; }

/* ── State: loading / empty / error ──────────────────────── */
.alert-error {
  max-width: 1200px;
  margin: 20px auto 0;
  padding: 0 32px;
}
.alert-error > * {
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-left: 4px solid #C41E1E;
  border-radius: 3px;
  padding: 12px 16px;
  font-size: 13px;
  color: #7F1D1D;
  font-weight: 500;
}
.alert-error {
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-left: 4px solid #C41E1E;
  border-radius: 3px;
  padding: 12px 16px;
  font-size: 13px;
  color: #7F1D1D;
  font-weight: 500;
  max-width: 1200px;
  margin: 20px auto 0;
}
.state-loading, .state-empty {
  max-width: 1200px;
  margin: 60px auto;
  padding: 0 32px;
  text-align: center;
  font-size: 13px;
  color: #9EB3C9;
  font-weight: 500;
  letter-spacing: 0.3px;
}
.spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid #C5D4E8;
  border-top-color: #1456A6;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Graph Modal ──────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(11,29,53,0.7);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  backdrop-filter: blur(2px);
}
.modal-box {
  background: #fff;
  border-radius: 4px;
  width: 100%;
  max-width: 920px;
  box-shadow: 0 24px 80px rgba(11,29,53,0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px;
  background: #0B1D35;
}
.modal-sensor-name { font-size: 16px; font-weight: 700; color: #fff; }
.modal-sensor-id   { font-size: 11px; color: #7A9EC4; margin-top: 3px; }
.modal-close {
  background: rgba(255,255,255,0.1);
  border: none;
  border-radius: 3px;
  color: #A8C4E0;
  font-size: 14px;
  padding: 6px 10px;
  cursor: pointer;
  line-height: 1;
}
.modal-close:hover { background: rgba(255,255,255,0.2); color: #fff; }
.modal-time-bar {
  display: flex;
  gap: 6px;
  padding: 12px 24px;
  background: #F0F4F9;
  border-bottom: 1px solid #E3EAF3;
}
.modal-body {
  padding: 20px 24px 24px;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FAFBFC;
}
.modal-graph-img {
  width: 100%;
  display: block;
  border-radius: 3px;
  border: 1px solid #E3EAF3;
}
.modal-loading {
  font-size: 13px;
  color: #9EB3C9;
  text-align: center;
  padding: 40px;
}
</style>
