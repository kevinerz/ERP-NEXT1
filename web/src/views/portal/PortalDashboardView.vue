<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePortalAuthStore } from '@/stores/portalAuth'
import portalApi from '@/services/portalApi'

const auth   = usePortalAuthStore()
const router = useRouter()

const sites   = ref<any[]>([])
const loading = ref(true)

// Sensor expand state
const expandedSite   = ref<number | null>(null)
const expandedSensor = ref<number | null>(null)
const sensorData     = ref<{ device_name: string; sensors: any[] } | null>(null)
const sensorLoading  = ref(false)
const graphHours     = ref(0)

onMounted(async () => {
  try {
    const res = await portalApi.get('/portal/sites')
    sites.value = res.data.data
  } finally { loading.value = false }
})

async function toggleSensors(id_site: number) {
  if (expandedSite.value === id_site) {
    expandedSite.value = null; sensorData.value = null; expandedSensor.value = null; histData.value = []
    return
  }
  expandedSite.value = id_site; sensorLoading.value = true; sensorData.value = null; expandedSensor.value = null
  try {
    const r = await portalApi.get(`/portal/sites/${id_site}/sensors`)
    // { device_name, sensors[] } — semua sensor apa adanya dari PRTG
    sensorData.value = r.data.data
  } catch {} finally { sensorLoading.value = false }
}

const histData = ref<any[]>([])

// Modal popup
const modalSensor      = ref<{ id_site: number; objid: number; name: string } | null>(null)
const modalGraphUrl    = ref<string | null>(null)
const modalGraphLoading = ref(false)
const modalHours       = ref(0)

async function openModal(id_site: number, objid: number, name: string) {
  modalSensor.value   = { id_site, objid, name }
  modalHours.value    = graphHours.value
  await fetchModalGraph(id_site, objid, graphHours.value)
}

async function fetchModalGraph(id_site: number, objid: number, graphid: number) {
  if (modalGraphUrl.value) { URL.revokeObjectURL(modalGraphUrl.value); modalGraphUrl.value = null }
  modalGraphLoading.value = true
  try {
    const r = await portalApi.get(`/portal/sites/${id_site}/sensor/${objid}/graph.png`, {
      params: { graphid },
      responseType: 'blob',
    })
    modalGraphUrl.value = URL.createObjectURL(r.data)
  } catch { modalGraphUrl.value = null }
  finally { modalGraphLoading.value = false }
}

async function modalChangeHours(h: number) {
  modalHours.value = h
  if (modalSensor.value) await fetchModalGraph(modalSensor.value.id_site, modalSensor.value.objid, h)
}


function statusMonitor(s: any) {
  if (!s.monitoring) return { label: 'Tidak Dipantau', cls: 'mon-none' }
  const st = (s.monitoring.status || '').toLowerCase()
  if (st === 'up' || st === 'online' || st === '3') return { label: 'Online', cls: 'mon-up' }
  if (st === 'down' || st === 'offline' || st === '4' || st === '5') return { label: 'Down', cls: 'mon-down' }
  return { label: s.monitoring.status, cls: 'mon-warn' }
}

function statusSite(s: string) {
  const map: Record<string, string> = { Aktif: 'site-aktif', Prospek: 'site-prospek', Terminasi: 'site-terminasi' }
  return map[s] || 'site-prospek'
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const totalUp   = () => sites.value.filter(s => statusMonitor(s).cls === 'mon-up').length
const totalDown = () => sites.value.filter(s => statusMonitor(s).cls === 'mon-down').length
const totalTiketAktif = () => sites.value.reduce((a, s) => a + (s.tiket_aktif || 0), 0)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Status Site</h2>
        <p class="sub">{{ auth.user?.pelanggan?.nama_pelanggan }}</p>
      </div>
    </div>

    <!-- Summary cards -->
    <div class="summary-row">
      <div class="summary-card">
        <div class="snum">{{ sites.length }}</div>
        <div class="slabel">Total Site</div>
      </div>
      <div class="summary-card green">
        <div class="snum">{{ totalUp() }}</div>
        <div class="slabel">Online</div>
      </div>
      <div class="summary-card red" v-if="totalDown() > 0">
        <div class="snum">{{ totalDown() }}</div>
        <div class="slabel">Down</div>
      </div>
      <div class="summary-card amber" v-if="totalTiketAktif() > 0">
        <div class="snum">{{ totalTiketAktif() }}</div>
        <div class="slabel">Tiket Aktif</div>
      </div>
    </div>

    <div v-if="loading" class="loading">Memuat data site...</div>

    <div class="site-grid" v-else>
      <div v-for="site in sites" :key="site.id_site" class="site-card">
        <div class="site-card-header">
          <div>
            <div class="site-name">{{ site.nama_site }}</div>
            <div class="site-kode">{{ site.kode_site }} · {{ site.layanan?.nama_layanan }}</div>
          </div>
          <div class="site-badges">
            <span :class="['badge-site', statusSite(site.status_site)]">{{ site.status_site }}</span>
            <span v-if="site.tiket_aktif" class="badge-tiket" @click="router.push({ path: '/portal/tickets', query: { id_site: site.id_site } })">
              {{ site.tiket_aktif }} tiket
            </span>
          </div>
        </div>

        <!-- Monitoring status -->
        <div :class="['monitor-bar', statusMonitor(site).cls]">
          <span class="mon-dot"></span>
          <span class="mon-label">{{ statusMonitor(site).label }}</span>
          <span v-if="site.monitoring?.sensor" class="mon-sensor">· {{ site.monitoring.sensor }}</span>
          <span v-if="site.monitoring?.last_change" class="mon-time">
            sejak {{ fmtDate(site.monitoring.last_change) }}
          </span>
        </div>

        <!-- Alamat -->
        <div class="site-info">
          <span class="info-icon">📍</span>
          <span class="info-text">{{ site.kota || '' }}{{ site.kota && site.provinsi ? ', ' : '' }}{{ site.provinsi || site.alamat }}</span>
        </div>

        <!-- Perangkat utama -->
        <div class="perangkat-list" v-if="site.perangkat?.length">
          <div v-for="(p, i) in site.perangkat.slice(0, 3)" :key="i" class="perangkat-item">
            <span class="p-type">{{ p.jenis_perangkat }}</span>
            <span class="p-name">{{ [p.merk, p.tipe_model].filter(Boolean).join(' ') || '—' }}</span>
            <span v-if="p.ip_address" class="p-ip">{{ p.ip_address }}</span>
            <span :class="['p-status', p.status_perangkat === 'Aktif' ? 'p-aktif' : 'p-na']">{{ p.status_perangkat }}</span>
          </div>
          <div v-if="site.perangkat.length > 3" class="perangkat-more">+{{ site.perangkat.length - 3 }} perangkat lainnya</div>
        </div>
        <div class="no-perangkat" v-else>Tidak ada data perangkat</div>

        <!-- Aktif sejak + tombol sensor -->
        <div class="site-footer">
          <span>Aktif sejak {{ fmtDate(site.tgl_aktif) }}</span>
          <button class="btn-sensor" @click="toggleSensors(site.id_site)">
            {{ expandedSite === site.id_site ? '▲ Sembunyikan' : '📈 Ping & Traffic' }}
          </button>
        </div>

        <!-- Sensor Panel -->
        <div v-if="expandedSite === site.id_site" class="sensor-panel">
          <div v-if="sensorLoading" class="sensor-loading">Memuat sensor...</div>
          <div v-else-if="!sensorData" class="sensor-empty">Tidak ada data sensor</div>
          <template v-else>
            <p class="sensor-device">Device: <strong>{{ sensorData.device_name }}</strong> · {{ sensorData.sensors?.length ?? 0 }} sensor</p>

            <!-- Pilih rentang -->
            <div class="sensor-hours">
              <span>Rentang:</span>
              <button v-for="[gid, lbl] in [[0,'Live'],[1,'48j'],[2,'30h'],[3,'365h']]" :key="(gid as number)"
                :class="['hour-btn', {active: graphHours === (gid as number)}]"
                @click="graphHours = (gid as number); expandedSensor = null; histData = []">
                {{ lbl }}
              </button>
            </div>

            <!-- Semua sensor dynamic dari PRTG -->
            <div v-if="sensorData.sensors?.length" class="sensor-group">
              <div v-for="s in sensorData.sensors" :key="s.objid" class="sensor-item"
                @click="openModal(site.id_site, s.objid, s.sensor)">
                <span class="s-name">{{ s.sensor }}</span>
                <span :class="['s-status', s.status_raw <= 3 ? 'st-up' : 'st-down']">{{ s.status }}</span>
                <span class="s-graph-hint">📈 lihat graph</span>
              </div>
            </div>
            <p v-else class="sensor-empty">Tidak ada sensor terpantau untuk site ini di PRTG</p>
          </template>
        </div>
      </div>
    </div>

    <div v-if="!loading && !sites.length" class="empty">Tidak ada site terdaftar untuk akun ini.</div>
  </div>

  <!-- Modal Graph -->
  <Teleport to="body">
    <div v-if="modalSensor" class="graph-modal-overlay" @click.self="modalSensor = null">
      <div class="graph-modal">
        <div class="graph-modal-header">
          <div>
            <div class="graph-modal-title">{{ modalSensor.name }}</div>
            <div class="graph-modal-sub">Sensor ID: {{ modalSensor.objid }}</div>
          </div>
          <button class="graph-modal-close" @click="modalSensor = null">✕</button>
        </div>

        <div class="graph-modal-hours">
          <button v-for="[gid, label] in [[0,'Live'],[1,'48 jam'],[2,'30 hari'],[3,'365 hari']]" :key="gid"
            :class="['hour-btn', { active: modalHours === gid }]"
            @click="modalChangeHours(gid as number)">
            {{ label }}
          </button>
        </div>

        <div class="graph-modal-body">
          <div v-if="modalGraphLoading" class="graph-modal-loading">Memuat graph dari PRTG...</div>
          <div v-else-if="modalGraphUrl" class="graph-dark-wrap">
            <img :src="modalGraphUrl" class="graph-modal-img" />
          </div>
          <div v-else class="graph-modal-loading">Graph tidak tersedia untuk sensor ini</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page        { padding: 28px 32px; max-width: 1200px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; font-weight: 800; }
.sub         { margin: 0; font-size: 13px; color: #64748b; }
.loading     { padding: 60px; text-align: center; color: #94a3b8; }
.empty       { padding: 60px; text-align: center; color: #94a3b8; }

.summary-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 22px; }
.summary-card { background: #fff; border-radius: 10px; padding: 14px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.summary-card.green { border-left: 4px solid #16a34a; }
.summary-card.red   { border-left: 4px solid #dc2626; }
.summary-card.amber { border-left: 4px solid #d97706; }
.snum  { font-size: 28px; font-weight: 800; color: #0f172a; }
.slabel{ font-size: 12px; color: #64748b; }

.site-grid   { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.site-card   { background: #fff; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); display: flex; flex-direction: column; gap: 12px; }
.site-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.site-name   { font-size: 15px; font-weight: 700; color: #0f172a; }
.site-kode   { font-size: 12px; color: #64748b; margin-top: 2px; }
.site-badges { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.badge-site  { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.site-aktif  { background: #f0fdf4; color: #15803d; }
.site-prospek{ background: #fefce8; color: #854d0e; }
.site-terminasi { background: #fef2f2; color: #991b1b; }
.badge-tiket { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; background: #fef3c7; color: #92400e; cursor: pointer; }
.badge-tiket:hover { opacity: 0.8; }

.monitor-bar { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; font-size: 13px; }
.mon-up      { background: #f0fdf4; }
.mon-down    { background: #fef2f2; }
.mon-warn    { background: #fefce8; }
.mon-none    { background: #f8fafc; }
.mon-dot     { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.mon-up .mon-dot   { color: #16a34a; }
.mon-down .mon-dot { color: #dc2626; }
.mon-warn .mon-dot { color: #d97706; }
.mon-none .mon-dot { color: #94a3b8; }
.mon-label   { font-weight: 700; flex-shrink: 0; }
.mon-up .mon-label   { color: #15803d; }
.mon-down .mon-label { color: #dc2626; }
.mon-warn .mon-label { color: #b45309; }
.mon-none .mon-label { color: #64748b; }
.mon-sensor  { color: #64748b; font-size: 12px; }
.mon-time    { color: #94a3b8; font-size: 11px; margin-left: auto; }

.site-info   { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
.info-icon   { font-size: 14px; }

.perangkat-list { display: flex; flex-direction: column; gap: 4px; }
.perangkat-item { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px 0; border-top: 1px solid #f1f5f9; }
.perangkat-item:first-child { border-top: none; }
.p-type { font-size: 10px; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; }
.p-name { color: #374151; font-weight: 500; flex: 1; }
.p-ip   { color: #94a3b8; font-family: monospace; font-size: 11px; }
.p-status { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
.p-aktif  { background: #f0fdf4; color: #15803d; }
.p-na     { background: #f8fafc; color: #64748b; }
.perangkat-more { font-size: 11px; color: #94a3b8; padding-top: 4px; }
.no-perangkat   { font-size: 12px; color: #94a3b8; font-style: italic; }

.site-footer { font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; }
.btn-sensor { padding: 4px 10px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.btn-sensor:hover { background: #dbeafe; }

.sensor-panel { border-top: 1px solid #f1f5f9; padding-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.sensor-device { margin: 0; font-size: 12px; color: #64748b; }
.sensor-hours  { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
.hour-btn { padding: 3px 8px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 5px; font-size: 11px; font-weight: 600; cursor: pointer; color: #374151; }
.hour-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.sensor-loading { font-size: 12px; color: #94a3b8; text-align: center; padding: 8px; }
.sensor-empty   { font-size: 12px; color: #94a3b8; text-align: center; padding: 8px; }
.sensor-group { display: flex; flex-direction: column; }
.sensor-item  { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-top: 1px solid #f1f5f9; cursor: pointer; border-radius: 8px; transition: background 0.1s; }
.sensor-item:first-child { border-top: none; }
.sensor-item:hover { background: #f0f9ff; }
.s-name       { flex: 1; font-size: 13px; font-weight: 600; color: #0f172a; }
.s-status     { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 8px; flex-shrink: 0; }
.st-up        { background: #dcfce7; color: #15803d; }
.st-down      { background: #fee2e2; color: #dc2626; }
.s-graph-hint { font-size: 11px; color: #3b82f6; font-weight: 600; flex-shrink: 0; }
.graph-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 20px; }
.graph-modal         { background: #ffffff; border-radius: 16px; width: 100%; max-width: 900px; box-shadow: 0 25px 80px rgba(0,0,0,0.35); overflow: hidden; }
.graph-modal-header  { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 24px 14px; border-bottom: 1px solid #e2e8f0; }
.graph-modal-title   { font-size: 18px; font-weight: 800; color: #0f172a; }
.graph-modal-sub     { font-size: 12px; color: #64748b; margin-top: 2px; }
.graph-modal-close   { background: #f1f5f9; border: none; border-radius: 8px; color: #475569; font-size: 14px; padding: 6px 10px; cursor: pointer; flex-shrink: 0; }
.graph-modal-close:hover { background: #e2e8f0; color: #0f172a; }
.graph-modal-hours   { display: flex; gap: 8px; padding: 12px 24px; border-bottom: 1px solid #e2e8f0; }
.hour-btn            { padding: 5px 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: #64748b; }
.hour-btn.active     { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
.graph-modal-body    { padding: 16px 24px 24px; min-height: 200px; display: flex; align-items: center; justify-content: center; }
.graph-dark-wrap     { width: 100%; background: #f8fafc; border-radius: 10px; padding: 8px; border: 1px solid #e2e8f0; }
.graph-modal-img     { width: 100%; display: block; border-radius: 6px; }
.graph-modal-loading { color: #94a3b8; font-size: 14px; text-align: center; padding: 40px; }
</style>
