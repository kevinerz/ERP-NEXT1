<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOperationsStore } from '@/stores/operations'
import { useProyekStore } from '@/stores/proyek'
import { printLaporanTiket } from '@/composables/usePrint'
import { fmtDateTime as fmtDt, statusLabel } from '@/composables/useFormat'
import api from '@/services/api'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

const router = useRouter()
const route = useRoute()
const ops = useOperationsStore()
const proyek = useProyekStore()
const id = Number(route.params.id)

const showEditModal = ref(false)
const editForm = ref<any>({})
const editSubmitting = ref(false)
const editError = ref('')

const showLogModal = ref(false)
const logForm = ref({ status_ke: '', catatan: '' })
const logSubmitting = ref(false)

const showWoModal = ref(false)
const woForm = ref({ jenis_wo: 'Troubleshoot', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '' })
const woSubmitting = ref(false)
const woError = ref('')

const showTimeline = ref(false)
const successMsg = ref('')

// ── FOTOS ────────────────────────────────────────────────────
const fotos = ref<any[]>([])
const previewUrl = ref('')

async function fetchFotos() {
  try {
    const { data } = await api.get(`/operations/${id}/fotos`)
    fotos.value = data.data ?? data
  } catch { /* silent */ }
}

function fotosOf(stage: string) { return fotos.value.filter(f => f.stage === stage) }
function stageLabel(s: string) {
  return s === 'before' ? 'Sebelum Pekerjaan' : s === 'proses' ? 'Proses Pengerjaan' : s === 'after' ? 'Sesudah Pekerjaan' : s
}

// ── ACTIVITY FEED (log + foto merged & sorted) ────────────────
const activityFeed = computed(() => {
  const items: any[] = []
  for (const log of ops.current?.logs || []) {
    items.push({ kind: 'log', time: log.created_at, log })
  }
  for (const stage of ['before', 'proses', 'after'] as const) {
    const sf = fotos.value.filter(f => f.stage === stage)
    if (sf.length) items.push({ kind: 'foto', time: sf[0].created_at, stage, fotos: sf, label: stageLabel(stage) })
  }
  return items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
})

// ── TIMELINE POPUP EVENTS ─────────────────────────────────────
const timelineEvents = computed(() => {
  const t = ops.current
  if (!t) return []
  const seen = new Set<string>()
  const events: any[] = []

  function push(e: any) {
    const key = `${e.type}:${e.time}`
    if (!seen.has(key)) { seen.add(key); events.push(e) }
  }

  push({ type: 'open', time: t.tgl_open, title: 'Tiket Dibuka', desc: t.judul_tiket, icon: '📋', color: '#3b82f6' })
  if (t.tgl_berangkat) push({ type: 'berangkat', time: t.tgl_berangkat, title: 'Teknisi Berangkat', desc: t.teknisi?.nama_lengkap, gps: teknisiLokasi.value, icon: '🚗', color: '#f59e0b' })
  if (t.tgl_sampai) push({ type: 'sampai', time: t.tgl_sampai, title: 'Tiba di Lokasi', desc: t.site?.nama_site, icon: '📍', color: '#8b5cf6' })

  for (const item of activityFeed.value) {
    if (item.kind === 'log') {
      push({ type: 'log', time: item.time, title: item.log.catatan || statusLabel(item.log.status_ke), statusKe: item.log.status_ke, by: item.log.user?.karyawan?.nama_lengkap || 'System', icon: '💬', color: '#64748b' })
    } else {
      push({ type: 'foto', time: item.time, title: item.label, fotos: item.fotos, icon: '📷', color: '#16a34a' })
    }
  }

  if (t.tgl_resolved) push({ type: 'resolved', time: t.tgl_resolved, title: 'Tiket Diselesaikan', icon: '✅', color: '#16a34a' })

  return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
})

// ── PRTG ─────────────────────────────────────────────────────
const prtgDeviceName = ref('')
const prtgSensors = ref<any[]>([])
const prtgLoading = ref(false)
const prtgError = ref('')
const selectedSensorId = ref<number | null>(null)
const selectedGraphId = ref(0) // 0=live,1=48h,2=30d,3=365d
const graphCacheKey = ref(Date.now())
const graphBlobUrl = ref('')
const graphLoading = ref(false)
const graphLoadError = ref(false)
let graphRefreshTimer: ReturnType<typeof setInterval> | null = null

// Rincian waktu down-up untuk tiket ini
const prtgEvents = ref<any>(null)

async function fetchPrtgTicketEvents() {
  try {
    const { data } = await api.get(`/prtg/ticket/${id}/events`)
    prtgEvents.value = data.data ?? null
  } catch { /* silent */ }
}

async function fetchPrtgSensors() {
  const siteId = ops.current?.site?.id_site
  if (!siteId) return
  prtgLoading.value = true
  prtgError.value = ''
  try {
    const { data } = await api.get(`/prtg/site/${siteId}/sensors`)
    const r = data.data ?? data
    prtgDeviceName.value = r.device_name || ''
    prtgSensors.value = r.sensors || []
    if (prtgSensors.value.length && !selectedSensorId.value) {
      const ping = prtgSensors.value.find((s: any) => s.sensor?.toLowerCase().includes('ping'))
      selectedSensorId.value = ping?.objid ?? prtgSensors.value[0]?.objid
    }
    if (selectedSensorId.value) loadGraphBlob(selectedSensorId.value, selectedGraphId.value)
  } catch (e: any) {
    prtgError.value = e?.response?.data?.message || 'Gagal memuat sensor'
  } finally {
    prtgLoading.value = false
  }
}

function prtgStatusColor(raw: number) {
  return { 3: '#16a34a', 4: '#f59e0b', 5: '#ef4444', 13: '#f97316', 14: '#f97316' }[raw] ?? '#64748b'
}
function prtgStatusLabel(raw: number) {
  return { 3: 'Up', 4: 'Warning', 5: 'Down', 13: 'Down (Ack)', 14: 'Partial Down' }[raw] ?? '?'
}
async function loadGraphBlob(sensorId: number, graphId: number) {
  if (!sensorId) return
  graphLoading.value = true
  graphLoadError.value = false
  if (graphBlobUrl.value) { URL.revokeObjectURL(graphBlobUrl.value); graphBlobUrl.value = '' }
  try {
    const resp = await api.get(`/prtg/sensor/${sensorId}/graph.png`, {
      params: { graphid: graphId },
      responseType: 'blob',
      timeout: 20000,
    })
    graphBlobUrl.value = URL.createObjectURL(resp.data)
  } catch {
    graphLoadError.value = true
  } finally {
    graphLoading.value = false
  }
}

function refreshGraph() {
  graphCacheKey.value = Date.now()
  if (selectedSensorId.value) loadGraphBlob(selectedSensorId.value, selectedGraphId.value)
}

function startGraphRefresh() {
  if (graphRefreshTimer) clearInterval(graphRefreshTimer)
  graphRefreshTimer = setInterval(() => {
    if (selectedGraphId.value === 0 && selectedSensorId.value) loadGraphBlob(selectedSensorId.value, 0)
  }, 60_000)
}

// ── MAP ──────────────────────────────────────────────────────
const mapContainer = ref<HTMLDivElement | null>(null)
let mapInstance: L.Map | null = null
let teknisiMarker: L.Marker | null = null
let siteMarker: L.Marker | null = null
let polyline: L.Polyline | null = null
const teknisiLokasi = ref<any>(null)
let lokasiInterval: ReturnType<typeof setInterval> | null = null

const iconTeknisi = L.divIcon({
  html: `<div style="background:#16a34a;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #16a34a,0 2px 6px rgba(0,0,0,0.3)"></div>`,
  className: '', iconSize: [14, 14], iconAnchor: [7, 7],
})
const iconSite = L.divIcon({
  html: `<div style="background:#3b82f6;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #3b82f6,0 2px 6px rgba(0,0,0,0.3)"></div>`,
  className: '', iconSize: [14, 14], iconAnchor: [7, 7],
})

async function fetchTeknisiLokasi() {
  if (!ops.current?.teknisi) return
  try {
    const { data } = await api.get('/mobile/lokasi/all')
    const list: any[] = data.data ?? data
    const match = list.find((l: any) => l.id_karyawan === ops.current!.teknisi!.id_karyawan)
    if (match) {
      teknisiLokasi.value = { ...match, ...match.karyawan }
      updateTeknisiMarker(match.latitude, match.longitude)
    }
  } catch { /* silent */ }
}

function initMap() {
  if (!mapContainer.value || mapInstance) return
  const site = ops.current?.site
  const siteLatLng = parseSiteLatLng(site?.koordinat_gps)
  const center = siteLatLng ?? [-6.2, 106.8]
  mapInstance = L.map(mapContainer.value, { zoomControl: true, scrollWheelZoom: true }).setView(center, 13)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapInstance)
  if (siteLatLng) {
    siteMarker = L.marker(siteLatLng, { icon: iconSite }).addTo(mapInstance).bindPopup(`<b>${site?.nama_site}</b><br>${site?.kota || ''}`)
  }
}

function parseSiteLatLng(koordinat?: string): [number, number] | null {
  if (!koordinat) return null
  const parts = koordinat.split(',').map(s => parseFloat(s.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return [parts[0], parts[1]]
  return null
}

function updateTeknisiMarker(lat: number, lng: number) {
  if (!mapInstance) return
  const latlng: L.LatLngExpression = [lat, lng]
  if (teknisiMarker) teknisiMarker.setLatLng(latlng)
  else teknisiMarker = L.marker(latlng, { icon: iconTeknisi }).addTo(mapInstance).bindPopup(`<b>${ops.current?.teknisi?.nama_lengkap}</b><br>Lokasi Teknisi`)
  const siteLatLng = parseSiteLatLng(ops.current?.site?.koordinat_gps)
  if (siteLatLng) {
    if (polyline) polyline.setLatLngs([latlng, siteLatLng])
    else polyline = L.polyline([latlng, siteLatLng], { color: '#16a34a', weight: 2, dashArray: '6 4', opacity: 0.6 }).addTo(mapInstance)
    mapInstance.fitBounds(L.latLngBounds([latlng, siteLatLng]).pad(0.2))
  } else {
    mapInstance.setView(latlng, 14)
  }
}

function destroyMap() {
  if (lokasiInterval) clearInterval(lokasiInterval)
  if (mapInstance) { mapInstance.remove(); mapInstance = null }
  teknisiMarker = null; siteMarker = null; polyline = null
}

const STATUS_LIST = ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed']
const PRIORITAS_LIST = ['Low', 'Medium', 'High', 'Critical']
const JENIS_WO = ['Troubleshoot', 'Maintenance', 'Instalasi', 'Survey', 'Upgrade']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Open:             { bg: '#eff6ff', color: '#1d4ed8' },
  In_Progress:      { bg: '#fef9c3', color: '#a16207' },
  Pending_Customer: { bg: '#fff7ed', color: '#c2410c' },
  Resolved:         { bg: '#f0fdf4', color: '#15803d' },
  Closed:           { bg: '#f1f5f9', color: '#64748b' },
}
const PRIORITAS_COLOR: Record<string, string> = {
  Low: '#64748b', Medium: '#3b82f6', High: '#f97316', Critical: '#ef4444',
}
const WO_STATUS_COLOR: Record<string, string> = {
  Open: '#64748b', Dispatch: '#3b82f6', 'On-Site': '#f59e0b',
  Selesai: '#22c55e', Ditunda: '#f97316', Dibatalkan: '#ef4444',
}

onMounted(async () => {
  await Promise.all([ops.fetchOne(id), ops.fetchTeknisiList(), proyek.fetchSiteList()])
  await fetchFotos()
  await nextTick()
  initMap()
  await fetchTeknisiLokasi()
  lokasiInterval = setInterval(fetchTeknisiLokasi, 15000)
  await Promise.all([fetchPrtgSensors(), fetchPrtgTicketEvents()])
  startGraphRefresh()
})

onUnmounted(() => {
  destroyMap()
  if (graphRefreshTimer) clearInterval(graphRefreshTimer)
  if (graphBlobUrl.value) URL.revokeObjectURL(graphBlobUrl.value)
})

function openEdit() {
  const t = ops.current!
  editForm.value = {
    judul_tiket: t.judul_tiket,
    deskripsi_masalah: t.deskripsi_masalah || '',
    prioritas: t.prioritas,
    status_tiket: t.status_tiket,
    id_teknisi_pic: t.teknisi?.id_karyawan || 0,
  }
  editError.value = ''; showEditModal.value = true
}

async function handleEdit() {
  editSubmitting.value = true; editError.value = ''
  try {
    const payload: any = { ...editForm.value }
    if (!payload.id_teknisi_pic) payload.id_teknisi_pic = null
    await ops.update(id, payload)
    await ops.fetchOne(id)
    showEditModal.value = false; flash('Tiket diperbarui')
  } catch (e: any) { editError.value = e.response?.data?.message || 'Gagal' }
  finally { editSubmitting.value = false }
}

async function handleAddLog() {
  logSubmitting.value = true
  try {
    await ops.addLog({ id_ticket: id, status_ke: logForm.value.status_ke || undefined, catatan: logForm.value.catatan || undefined })
    await ops.fetchOne(id)
    showLogModal.value = false
    logForm.value = { status_ke: '', catatan: '' }
    flash('Log ditambahkan')
  } catch { flash('Gagal tambah log') }
  finally { logSubmitting.value = false }
}

async function handleAddWo() {
  if (!woForm.value.tgl_jadwal || !woForm.value.deskripsi_tugas) {
    woError.value = 'Jadwal dan deskripsi wajib diisi'; return
  }
  woSubmitting.value = true; woError.value = ''
  try {
    await proyek.createWo({
      jenis_wo: woForm.value.jenis_wo,
      id_ticket: id,
      id_site: ops.current!.site!.id_site,
      tipe_eksekutor: woForm.value.tipe_eksekutor,
      id_teknisi_internal: woForm.value.tipe_eksekutor === 'Internal_NEXT1' && woForm.value.id_teknisi_internal ? woForm.value.id_teknisi_internal : undefined,
      fee_vendor: woForm.value.fee_vendor || undefined,
      tgl_jadwal: new Date(woForm.value.tgl_jadwal).toISOString(),
      deskripsi_tugas: woForm.value.deskripsi_tugas,
    })
    await ops.fetchOne(id)
    showWoModal.value = false
    woForm.value = { jenis_wo: 'Troubleshoot', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '' }
    flash('Work Order dibuat')
  } catch (e: any) { woError.value = e.response?.data?.message || 'Gagal' }
  finally { woSubmitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }

async function hapusTiket() {
  if (!confirm('Hapus tiket ini?')) return
  try {
    await api.delete(`/operations/${id}`)
    router.push('/operations')
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal menghapus tiket') }
}

function slaInfo(t: any): { label: string; cls: string } {
  if (['Resolved', 'Closed'].includes(t.status_tiket)) {
    return t.sla_breached ? { label: 'Selesai (telat)', cls: 'sla-late-done' } : { label: 'Terpenuhi ✓', cls: 'sla-ok' }
  }
  if (!t.sla_due) return { label: '—', cls: 'sla-none' }
  const sisaMs = new Date(t.sla_due).getTime() - Date.now()
  if (sisaMs <= 0) {
    const jam = Math.floor(-sisaMs / 3600_000)
    return { label: `TELAT ${jam >= 1 ? jam + ' jam' : '<1 jam'}`, cls: 'sla-late' }
  }
  const jam = Math.floor(sisaMs / 3600_000)
  const menit = Math.floor((sisaMs % 3600_000) / 60_000)
  return { label: `sisa ${jam >= 1 ? jam + 'j ' : ''}${menit}m`, cls: sisaMs < 2 * 3600_000 ? 'sla-warning' : 'sla-safe' }
}

function ageHours(d: string) {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
  return h < 24 ? `${h} jam` : `${Math.floor(h / 24)} hari`
}

function journeyStep(t: any) {
  if (t.tgl_resolved || t.status_tiket === 'Resolved' || t.status_tiket === 'Closed') return 3
  if (t.tgl_sampai) return 2
  if (t.tgl_berangkat) return 1
  return 0
}
</script>

<template>
  <div class="page">
    <div v-if="ops.loading && !ops.current" class="loading-page">Memuat...</div>
    <div v-else-if="ops.error" class="alert-error">{{ ops.error }}</div>
    <template v-else-if="ops.current">

      <!-- Header -->
      <div class="page-header">
        <div>
          <button class="btn-back" @click="router.push('/operations')">← Operasional</button>
          <h2>{{ ops.current.nomor_tiket }}</h2>
          <p class="sub">{{ ops.current.judul_tiket }}</p>
        </div>
        <div class="header-right">
          <span :class="['sla-badge-lg', slaInfo(ops.current).cls]">SLA: {{ slaInfo(ops.current).label }}</span>
          <span class="prioritas-badge" :style="{ color: PRIORITAS_COLOR[ops.current.prioritas], background: PRIORITAS_COLOR[ops.current.prioritas] + '20' }">
            ● {{ ops.current.prioritas }}
          </span>
          <span class="status-big" :style="{ background: STATUS_COLOR[ops.current.status_tiket]?.bg, color: STATUS_COLOR[ops.current.status_tiket]?.color }">
            {{ statusLabel(ops.current.status_tiket) }}
          </span>
          <button class="btn-timeline" @click="showTimeline = true">📊 Timeline</button>
          <button class="btn-print" @click="printLaporanTiket(ops.current)">🖨 Laporan</button>
          <button class="btn-edit" @click="openEdit">Edit</button>
          <button v-if="ops.current.status_tiket === 'Open' || ops.current.status_tiket === 'Closed'" class="btn-hapus" @click="hapusTiket">Hapus</button>
        </div>
      </div>

      <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>

      <!-- Info bar -->
      <div class="info-bar">
        <div class="info-chip">
          <span class="ic-label">Pelanggan</span>
          <span class="ic-value fw">{{ ops.current.site?.pelanggan?.nama_pelanggan }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Site</span>
          <span class="ic-value">{{ ops.current.site?.nama_site }} <span class="text-gray">· {{ ops.current.site?.kota }}</span></span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Layanan</span>
          <span class="ic-value">{{ ops.current.site?.layanan?.nama_layanan || '—' }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Teknisi PIC</span>
          <span class="ic-value fw">{{ ops.current.teknisi?.nama_lengkap || 'Belum assigned' }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Durasi</span>
          <span class="ic-value" style="color:#f97316;font-weight:700">{{ ageHours(ops.current.tgl_open) }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Sumber</span>
          <span class="ic-value">{{ ops.current.sumber_tiket }}</span>
        </div>
      </div>

      <div v-if="ops.current.deskripsi_masalah" class="deskripsi-box">
        <strong>Deskripsi:</strong> {{ ops.current.deskripsi_masalah }}
      </div>

      <!-- ── MAIN GRID 2-COL ────────────────────────────────── -->
      <div class="main-grid">

        <!-- LEFT: Map + Foto -->
        <div class="col-left">

          <!-- Peta Lokasi -->
          <div class="map-card">
            <div class="map-header">
              <div class="map-title"><span>📍</span> Lokasi Real-time</div>
              <div class="map-legend">
                <span class="legend-item"><span class="dot green"></span> Teknisi</span>
                <span class="legend-item"><span class="dot blue"></span> Site</span>
                <span v-if="teknisiLokasi" class="map-lastseen">Update: {{ fmtDt(teknisiLokasi.updated_at) }}</span>
                <span v-else-if="ops.current.teknisi" class="map-nodata">Belum ada GPS teknisi</span>
                <span v-else class="map-nodata">Belum ada teknisi</span>
              </div>
            </div>
            <div ref="mapContainer" class="map-container" />
            <div v-if="ops.current.site?.koordinat_gps" class="map-footer">
              <a :href="`https://maps.google.com/?q=${ops.current.site.koordinat_gps}`" target="_blank" class="map-link">🗺 Google Maps</a>
              <span class="map-coords">{{ ops.current.site.koordinat_gps }}</span>
            </div>
          </div>

          <!-- Foto Gallery -->
          <div class="foto-card" v-if="fotos.length">
            <div class="foto-card-header">
              <span class="foto-card-title">📷 Dokumentasi Foto</span>
              <span class="foto-badge">{{ fotos.length }} foto</span>
            </div>
            <div class="foto-stages-grid">
              <template v-for="stage in ['before','proses','after']" :key="stage">
                <div v-if="fotosOf(stage).length" class="foto-stage-col">
                  <div class="stage-label">{{ stageLabel(stage) }}</div>
                  <div class="stage-row-grid">
                    <div v-for="f in fotosOf(stage)" :key="f.id_foto" class="foto-thumb-wrap" @click="previewUrl = f.url">
                      <img :src="f.url" class="foto-thumb" loading="lazy" />
                      <div class="foto-time">{{ fmtDt(f.created_at) }}</div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Work Orders -->
          <div class="section-card">
            <div class="section-header">
              <span class="card-title">Surat Tugas ({{ ops.current.work_orders?.length ?? 0 }})</span>
              <button class="btn-add-small" @click="showWoModal = true; woError = ''">+ Surat Tugas</button>
            </div>
            <div v-if="!ops.current.work_orders?.length" class="empty-section">Belum ada surat tugas</div>
            <div v-for="wo in ops.current.work_orders" :key="wo.id_wo" class="wo-item">
              <div class="wo-left">
                <div class="wo-nomor">{{ wo.nomor_wo }}</div>
                <div class="wo-jenis">{{ wo.jenis_wo }}</div>
                <div class="wo-date">{{ fmtDt(wo.tgl_jadwal) }}</div>
              </div>
              <div class="wo-mid">
                <div class="wo-desc">{{ wo.deskripsi_tugas }}</div>
                <div class="wo-exec text-gray">{{ wo.teknisi?.nama_lengkap || wo.vendor?.nama_vendor || '—' }}</div>
              </div>
              <div class="wo-status" :style="{ color: WO_STATUS_COLOR[wo.status_wo] }">{{ wo.status_wo }}</div>
            </div>
          </div>

          <!-- ── PRTG SENSOR STATUS ───────────────────────────── -->
          <div class="prtg-card">
            <div class="prtg-hdr">
              <div class="prtg-hdr-left">
                <span class="prtg-icon">📡</span>
                <div>
                  <div class="prtg-title">Status Sensor Perangkat</div>
                  <div class="prtg-device-name" v-if="prtgDeviceName">{{ prtgDeviceName }}</div>
                  <div class="prtg-device-name text-gray" v-else-if="!prtgLoading">Belum ada mapping device untuk site ini</div>
                </div>
              </div>
              <button class="btn-refresh-prtg" @click="fetchPrtgSensors" :disabled="prtgLoading" title="Refresh">
                <span :class="{ spinning: prtgLoading }">↻</span>
              </button>
            </div>
            <div v-if="prtgLoading" class="prtg-loading">Memuat data sensor PRTG...</div>
            <div v-else-if="prtgError" class="prtg-err">{{ prtgError }}</div>
            <div v-else-if="!prtgSensors.length" class="prtg-empty">Tidak ada sensor ditemukan untuk device ini</div>
            <div v-else class="sensor-grid">
              <div
                v-for="s in prtgSensors"
                :key="s.objid"
                class="sensor-card"
                :class="{ 'sensor-selected': selectedSensorId === s.objid }"
                @click="selectedSensorId = s.objid; loadGraphBlob(s.objid, selectedGraphId)"
              >
                <div class="sensor-status-dot" :style="{ background: prtgStatusColor(s.status_raw) }"></div>
                <div class="sensor-body">
                  <div class="sensor-name">{{ s.sensor }}</div>
                  <div class="sensor-device text-gray">{{ s.device }}</div>
                  <div v-if="s.message_raw" class="sensor-msg">{{ s.message_raw }}</div>
                </div>
                <div class="sensor-badge" :style="{ background: prtgStatusColor(s.status_raw) + '20', color: prtgStatusColor(s.status_raw) }">
                  {{ prtgStatusLabel(s.status_raw) }}
                </div>
              </div>
            </div>
          </div>

          <!-- ── PRTG GRAPH LIVE ─────────────────────────────── -->
          <div v-if="selectedSensorId && prtgSensors.length" class="prtg-graph-card">
            <div class="prtg-graph-hdr">
              <div class="prtg-graph-title">
                📊 PRTG Graph —
                <span class="prtg-live-dot" v-if="selectedGraphId === 0"><span class="blink-dot"></span> Live</span>
                <span v-else>{{ ['Live','48 Jam','30 Hari','365 Hari'][selectedGraphId] }}</span>
                <span class="prtg-sensor-lbl">· {{ prtgSensors.find(s => s.objid === selectedSensorId)?.sensor }}</span>
              </div>
              <div class="prtg-graph-tabs">
                <button v-for="(lbl, gid) in ['Live','48 Jam','30 Hari','365 Hari']" :key="gid"
                  :class="['prtg-tab', { active: selectedGraphId === gid }]"
                  @click="selectedGraphId = gid; loadGraphBlob(selectedSensorId!, gid)">{{ lbl }}</button>
                <button class="prtg-refresh-btn" @click="refreshGraph" title="Refresh grafik">↻</button>
              </div>
            </div>
            <div class="prtg-graph-wrap">
              <div v-if="graphLoading" class="prtg-graph-spinner">
                <svg class="spin-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#3b82f6" stroke-width="3" stroke-dasharray="31" stroke-dashoffset="10"/></svg>
                Memuat grafik...
              </div>
              <img
                v-else-if="graphBlobUrl && !graphLoadError"
                :src="graphBlobUrl"
                class="prtg-graph-img"
                alt="PRTG Graph"
              />
              <div v-else class="prtg-graph-err">
                Gagal memuat grafik — sensor mungkin tidak aktif atau PRTG tidak terkonfigurasi
              </div>
            </div>
            <div class="prtg-graph-footer">
              <span class="prtg-graph-id">Sensor ID: {{ selectedSensorId }}</span>
              <span v-if="selectedGraphId === 0" class="prtg-auto-refresh">Auto-refresh setiap 60 detik</span>
            </div>

          </div>

          <!-- ── Rincian Downtime ──────────────────────────── -->
          <div v-if="prtgEvents" class="prtg-downup">
            <div class="pdu-section-title">⏱ Rincian Downtime Tiket Ini</div>
            <div class="prtg-downup-row">
              <div class="prtg-downup-item">
                <div class="pdu-icon down">▼</div>
                <div>
                  <div class="pdu-label">Mulai Down</div>
                  <div class="pdu-val">{{ fmtDt(prtgEvents.waktu_down) }}</div>
                  <div v-if="prtgEvents.pesan_down" class="pdu-msg">{{ prtgEvents.pesan_down }}</div>
                </div>
              </div>
              <div class="prtg-downup-arrow">→</div>
              <div class="prtg-downup-item">
                <div class="pdu-icon" :class="prtgEvents.sudah_up ? 'up' : 'pending'">
                  {{ prtgEvents.sudah_up ? '▲' : '?' }}
                </div>
                <div>
                  <div class="pdu-label">{{ prtgEvents.sudah_up ? 'Kembali Up' : 'Belum Up' }}</div>
                  <div class="pdu-val">{{ prtgEvents.sudah_up ? fmtDt(prtgEvents.waktu_up) : '—' }}</div>
                  <div v-if="prtgEvents.pesan_up" class="pdu-msg">{{ prtgEvents.pesan_up }}</div>
                </div>
              </div>
              <div class="prtg-downup-duration" :class="prtgEvents.sudah_up ? 'dur-card-done' : 'dur-card-live'">
                <div class="pdu-dur-label">Total Downtime</div>
                <div class="pdu-dur-val" :class="prtgEvents.sudah_up ? 'dur-done' : 'dur-live'">
                  {{ prtgEvents.sudah_up ? prtgEvents.durasi_label : 'Masih down...' }}
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- RIGHT: Journey + Activity Feed -->
        <div class="col-right">

          <!-- Journey Progress Card -->
          <div class="journey-card">
            <div class="journey-header">
              <span class="journey-title">🚦 Perjalanan Teknisi</span>
              <button class="btn-timeline-sm" @click="showTimeline = true">Lihat Lengkap →</button>
            </div>
            <div class="journey-steps">
              <div class="journey-step" :class="{ done: journeyStep(ops.current) >= 0, active: journeyStep(ops.current) === 0 }">
                <div class="jstep-dot"><span>📋</span></div>
                <div class="jstep-body">
                  <div class="jstep-label">Tiket Dibuka</div>
                  <div class="jstep-time">{{ fmtDt(ops.current.tgl_open) }}</div>
                </div>
              </div>
              <div class="journey-line" :class="{ done: journeyStep(ops.current) >= 1 }"></div>
              <div class="journey-step" :class="{ done: journeyStep(ops.current) >= 1, active: journeyStep(ops.current) === 1 }">
                <div class="jstep-dot"><span>🚗</span></div>
                <div class="jstep-body">
                  <div class="jstep-label">Berangkat</div>
                  <div class="jstep-time" v-if="ops.current.tgl_berangkat">{{ fmtDt(ops.current.tgl_berangkat) }}</div>
                  <div class="jstep-time pending" v-else>—</div>
                  <div v-if="teknisiLokasi && ops.current.tgl_berangkat" class="jstep-gps">
                    📡 {{ Number(teknisiLokasi.latitude).toFixed(5) }}, {{ Number(teknisiLokasi.longitude).toFixed(5) }}
                  </div>
                </div>
              </div>
              <div class="journey-line" :class="{ done: journeyStep(ops.current) >= 2 }"></div>
              <div class="journey-step" :class="{ done: journeyStep(ops.current) >= 2, active: journeyStep(ops.current) === 2 }">
                <div class="jstep-dot"><span>📍</span></div>
                <div class="jstep-body">
                  <div class="jstep-label">Tiba di Lokasi</div>
                  <div class="jstep-time" v-if="ops.current.tgl_sampai">{{ fmtDt(ops.current.tgl_sampai) }}</div>
                  <div class="jstep-time pending" v-else>—</div>
                </div>
              </div>
              <div class="journey-line" :class="{ done: journeyStep(ops.current) >= 3 }"></div>
              <div class="journey-step" :class="{ done: journeyStep(ops.current) >= 3, active: journeyStep(ops.current) === 3 }">
                <div class="jstep-dot"><span>✅</span></div>
                <div class="jstep-body">
                  <div class="jstep-label">Selesai</div>
                  <div class="jstep-time" v-if="ops.current.tgl_resolved">{{ fmtDt(ops.current.tgl_resolved) }}</div>
                  <div class="jstep-time pending" v-else>—</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Activity Feed (Log + Foto merged) -->
          <div class="section-card feed-card">
            <div class="section-header">
              <span class="card-title">Log Aktivitas ({{ activityFeed.length }})</span>
              <button class="btn-add-small" @click="showLogModal = true">+ Log</button>
            </div>
            <div v-if="!activityFeed.length" class="empty-section">Belum ada aktivitas</div>
            <div class="feed-list">
              <div v-for="(item, idx) in activityFeed" :key="idx" class="feed-item">
                <!-- Log entry -->
                <template v-if="item.kind === 'log'">
                  <div class="feed-dot log-dot-c" :style="{ background: item.log.status_ke ? STATUS_COLOR[item.log.status_ke]?.color || '#64748b' : '#94a3b8' }"></div>
                  <div class="feed-body">
                    <div v-if="item.log.status_ke" class="feed-badge-row">
                      <span class="log-badge" :style="{ background: STATUS_COLOR[item.log.status_ke]?.bg, color: STATUS_COLOR[item.log.status_ke]?.color }">
                        {{ statusLabel(item.log.status_ke) }}
                      </span>
                    </div>
                    <div v-if="item.log.catatan" class="feed-text">{{ item.log.catatan }}</div>
                    <div class="feed-meta">{{ item.log.user?.karyawan?.nama_lengkap || 'System' }} · {{ fmtDt(item.time) }}</div>
                  </div>
                </template>
                <!-- Foto entry -->
                <template v-else>
                  <div class="feed-dot foto-dot-c"></div>
                  <div class="feed-body">
                    <div class="feed-foto-label">📷 {{ item.label }}</div>
                    <div class="feed-meta">{{ fmtDt(item.time) }}</div>
                    <div class="feed-thumbs">
                      <img v-for="f in item.fotos" :key="f.id_foto" :src="f.url" class="feed-thumb" @click="previewUrl = f.url" loading="lazy" />
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Tiket Lain di Site -->
          <template v-if="ops.current.related_tickets?.length">
            <div class="section-card">
              <div class="section-header">
                <span class="card-title">Tiket lain di {{ ops.current.site?.nama_site }}</span>
              </div>
              <div v-for="t in ops.current.related_tickets" :key="t.id_ticket"
                class="related-item" @click="router.push(`/operations/${t.id_ticket}`)">
                <div class="rel-left">
                  <div class="rel-nomor">{{ t.nomor_tiket }}</div>
                  <div class="rel-judul">{{ t.judul_tiket }}</div>
                </div>
                <div class="rel-right">
                  <span class="prio-dot" :style="{ color: PRIORITAS_COLOR[t.prioritas] }">● {{ t.prioritas }}</span>
                  <span class="rel-status" :style="{ background: STATUS_COLOR[t.status_tiket]?.bg, color: STATUS_COLOR[t.status_tiket]?.color }">{{ statusLabel(t.status_tiket) }}</span>
                  <span class="rel-arrow">›</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- ── MODAL PREVIEW FOTO ─────────────────────────────── -->
      <div v-if="previewUrl" class="modal-overlay" @click.self="previewUrl = ''" style="z-index:3000">
        <div class="foto-preview-modal">
          <button class="foto-preview-close" @click="previewUrl = ''">✕</button>
          <img :src="previewUrl" class="foto-preview-img" />
        </div>
      </div>

      <!-- ── MODAL TIMELINE ─────────────────────────────────── -->
      <div v-if="showTimeline" class="modal-overlay" @click.self="showTimeline = false" style="z-index:2500">
        <div class="timeline-modal">
          <div class="tl-header">
            <div>
              <div class="tl-title">📊 Timeline Lengkap</div>
              <div class="tl-sub">{{ ops.current.nomor_tiket }} · {{ ops.current.judul_tiket }}</div>
            </div>
            <button class="tl-close" @click="showTimeline = false">✕</button>
          </div>
          <div class="tl-body">
            <div class="tl-list">
              <div v-for="(ev, idx) in timelineEvents" :key="idx" class="tl-item">
                <div class="tl-line-wrap">
                  <div class="tl-dot" :style="{ background: ev.color }">{{ ev.icon }}</div>
                  <div class="tl-connector" v-if="idx < timelineEvents.length - 1"></div>
                </div>
                <div class="tl-content">
                  <div class="tl-ev-title">{{ ev.title }}</div>
                  <div class="tl-ev-time">{{ fmtDt(ev.time) }}</div>
                  <div v-if="ev.desc" class="tl-ev-desc">{{ ev.desc }}</div>
                  <div v-if="ev.by" class="tl-ev-by">oleh {{ ev.by }}</div>
                  <div v-if="ev.statusKe" class="tl-badge-wrap">
                    <span class="log-badge" :style="{ background: STATUS_COLOR[ev.statusKe]?.bg, color: STATUS_COLOR[ev.statusKe]?.color }">
                      {{ statusLabel(ev.statusKe) }}
                    </span>
                  </div>
                  <!-- GPS info on berangkat -->
                  <div v-if="ev.type === 'berangkat' && ev.gps" class="tl-gps-card">
                    <div class="tl-gps-row">
                      <span class="tl-gps-label">📡 Lokasi Terakhir GPS</span>
                    </div>
                    <div class="tl-gps-row">
                      <span class="tl-gps-coord">{{ Number(ev.gps.latitude).toFixed(6) }}, {{ Number(ev.gps.longitude).toFixed(6) }}</span>
                    </div>
                    <div v-if="ev.gps.akurasi" class="tl-gps-row">
                      <span class="tl-gps-acc">Akurasi ±{{ ev.gps.akurasi }}m</span>
                    </div>
                    <div class="tl-gps-row">
                      <a :href="`https://maps.google.com/?q=${ev.gps.latitude},${ev.gps.longitude}`" target="_blank" class="tl-gps-link">Buka di Maps ↗</a>
                    </div>
                  </div>
                  <!-- Fotos in timeline -->
                  <div v-if="ev.type === 'foto' && ev.fotos?.length" class="tl-fotos">
                    <img v-for="f in ev.fotos" :key="f.id_foto" :src="f.url" class="tl-foto-thumb" @click="previewUrl = f.url; showTimeline = false" loading="lazy" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── MODAL EDIT ──────────────────────────────────────── -->
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal">
          <h3>Edit Tiket</h3>
          <div class="form-grid">
            <div class="field full"><label>Judul Tiket</label><input v-model="editForm.judul_tiket" /></div>
            <div class="field">
              <label>Status</label>
              <select v-model="editForm.status_tiket">
                <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
              </select>
            </div>
            <div class="field">
              <label>Prioritas</label>
              <select v-model="editForm.prioritas">
                <option v-for="p in PRIORITAS_LIST" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Assign Teknisi</label>
              <select v-model="editForm.id_teknisi_pic">
                <option :value="0">— Belum di-assign —</option>
                <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field full"><label>Deskripsi Masalah</label><textarea v-model="editForm.deskripsi_masalah" rows="3"></textarea></div>
          </div>
          <p v-if="editError" class="form-error">{{ editError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showEditModal = false">Batal</button>
            <button class="btn-submit" @click="handleEdit" :disabled="editSubmitting">{{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}</button>
          </div>
        </div>
      </div>

      <!-- ── MODAL LOG ───────────────────────────────────────── -->
      <div v-if="showLogModal" class="modal-overlay" @click.self="showLogModal = false">
        <div class="modal">
          <h3>Tambah Log</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Update Status (opsional)</label>
              <select v-model="logForm.status_ke">
                <option value="">— Tidak ubah status —</option>
                <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
              </select>
            </div>
            <div class="field full"><label>Catatan</label><textarea v-model="logForm.catatan" rows="3" placeholder="Update kondisi, tindakan yang dilakukan..."></textarea></div>
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showLogModal = false">Batal</button>
            <button class="btn-submit" @click="handleAddLog" :disabled="logSubmitting">{{ logSubmitting ? 'Menyimpan...' : 'Tambah' }}</button>
          </div>
        </div>
      </div>

      <!-- ── MODAL SURAT TUGAS ────────────────────────────────── -->
      <div v-if="showWoModal" class="modal-overlay" @click.self="showWoModal = false">
        <div class="modal">
          <h3>Buat Surat Tugas</h3>
          <div class="form-grid">
            <div class="field">
              <label>Jenis Tugas</label>
              <select v-model="woForm.jenis_wo">
                <option v-for="j in JENIS_WO" :key="j" :value="j">{{ j }}</option>
              </select>
            </div>
            <div class="field">
              <label>Eksekutor</label>
              <select v-model="woForm.tipe_eksekutor">
                <option value="Internal_NEXT1">Internal NEXT1</option>
                <option value="Vendor_Ketiga">Vendor Ketiga</option>
              </select>
            </div>
            <div class="field" v-if="woForm.tipe_eksekutor === 'Internal_NEXT1'">
              <label>Teknisi</label>
              <select v-model="woForm.id_teknisi_internal">
                <option :value="0">— Pilih —</option>
                <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field" v-if="woForm.tipe_eksekutor === 'Vendor_Ketiga'">
              <label>Fee Vendor (Rp)</label>
              <input v-model.number="woForm.fee_vendor" type="number" placeholder="0" />
            </div>
            <div class="field full"><label>Jadwal <span class="req">*</span></label><input v-model="woForm.tgl_jadwal" type="datetime-local" /></div>
            <div class="field full"><label>Deskripsi Tugas <span class="req">*</span></label><textarea v-model="woForm.deskripsi_tugas" rows="3" placeholder="Tugas teknisi..."></textarea></div>
          </div>
          <p v-if="woError" class="form-error">{{ woError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showWoModal = false">Batal</button>
            <button class="btn-submit" @click="handleAddWo" :disabled="woSubmitting">{{ woSubmitting ? 'Membuat...' : 'Buat Surat Tugas' }}</button>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
.page { padding: 24px 28px; max-width: 1280px; }
.loading-page { padding: 60px; text-align: center; color: #94a3b8; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 14px; padding: 14px 18px; margin: 20px 0; }
.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }

/* ── HEADER ─────────────────────────────────── */
.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; display: block; margin-bottom: 4px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; gap: 12px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
.sla-badge-lg { padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.sla-safe { background: #f0fdf4; color: #15803d; }
.sla-warning { background: #fefce8; color: #a16207; }
.sla-late { background: #dc2626; color: #fff; animation: slaPulse 1.2s infinite; }
.sla-late-done { background: #fef2f2; color: #dc2626; }
.sla-ok { background: #f0fdf4; color: #15803d; }
.sla-none { color: #cbd5e1; }
@keyframes slaPulse { 50% { opacity: 0.6; } }
.prioritas-badge { padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; }
.status-big { padding: 5px 14px; border-radius: 20px; font-size: 14px; font-weight: 700; }
.btn-timeline { padding: 8px 14px; background: #ede9fe; color: #6d28d9; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-timeline:hover { background: #ddd6fe; }
.btn-print { padding: 8px 14px; background: #f0fdf4; color: #15803d; border: 1.5px solid #bbf7d0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-print:hover { background: #dcfce7; }
.btn-edit { padding: 8px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }

/* ── INFO BAR ────────────────────────────────── */
.info-bar { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; }
.info-chip { background: #fff; border-radius: 10px; padding: 10px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.ic-label { display: block; font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-bottom: 3px; letter-spacing: 0.4px; }
.ic-value { font-size: 13px; color: #0f172a; }
.fw { font-weight: 700; }
.text-gray { color: #64748b; }

.deskripsi-box { background: #f8fafc; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #475569; margin-bottom: 14px; }

/* ── MAIN GRID ───────────────────────────────── */
.main-grid { display: grid; grid-template-columns: 1fr 400px; gap: 16px; align-items: start; }
.col-left { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.col-right { display: flex; flex-direction: column; gap: 16px; }

/* ── MAP ─────────────────────────────────────── */
.map-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
.map-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px 8px; flex-wrap: wrap; gap: 8px; }
.map-title { font-size: 13px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px; }
.map-legend { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #64748b; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot.green { background: #16a34a; }
.dot.blue  { background: #3b82f6; }
.map-lastseen { font-size: 11px; color: #64748b; }
.map-nodata { font-size: 11px; color: #94a3b8; font-style: italic; }
.map-container { height: 280px; width: 100%; }
.map-footer { display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
.map-link { font-size: 12px; color: #3b82f6; text-decoration: none; font-weight: 600; }
.map-link:hover { text-decoration: underline; }
.map-coords { font-size: 11px; color: #94a3b8; font-family: monospace; }

/* ── FOTO GALLERY ────────────────────────────── */
.foto-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
.foto-card-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 10px; }
.foto-card-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.foto-badge { background: #f0fdf4; color: #15803d; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }
.foto-stages-grid { padding: 0 16px 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.foto-stage-col { min-width: 0; }
.stage-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; }
.stage-row-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.foto-thumb-wrap { cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.foto-thumb { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid #e2e8f0; transition: transform 0.15s, border-color 0.15s; }
.foto-thumb:hover { transform: scale(1.06); border-color: #3b82f6; }
.foto-time { font-size: 10px; color: #94a3b8; }

.foto-preview-modal { position: relative; max-width: 90vw; max-height: 90vh; }
.foto-preview-img { max-width: 90vw; max-height: 85vh; object-fit: contain; border-radius: 12px; display: block; }
.foto-preview-close { position: absolute; top: -14px; right: -14px; width: 32px; height: 32px; border-radius: 50%; background: #fff; border: none; cursor: pointer; font-size: 16px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 1; }

/* ── SECTION CARD ────────────────────────────── */
.section-card { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.card-title { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
.btn-add-small { padding: 4px 10px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.empty-section { color: #94a3b8; font-size: 13px; padding: 10px 0; }

/* ── WORK ORDERS ─────────────────────────────── */
.wo-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
.wo-left { min-width: 110px; }
.wo-nomor { font-size: 12px; font-weight: 700; color: #1d4ed8; }
.wo-jenis { font-size: 11px; color: #64748b; }
.wo-date { font-size: 11px; color: #94a3b8; }
.wo-mid { flex: 1; min-width: 0; }
.wo-desc { font-size: 13px; color: #0f172a; margin-bottom: 2px; }
.wo-exec { font-size: 11px; }
.wo-status { font-size: 12px; font-weight: 700; min-width: 60px; text-align: right; flex-shrink: 0; }

/* ── JOURNEY CARD ────────────────────────────── */
.journey-card { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.journey-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.journey-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.btn-timeline-sm { font-size: 12px; color: #6d28d9; background: none; border: none; cursor: pointer; font-weight: 600; padding: 0; }
.btn-timeline-sm:hover { text-decoration: underline; }

.journey-steps { display: flex; flex-direction: column; gap: 0; }
.journey-step { display: flex; gap: 12px; align-items: flex-start; }
.jstep-dot { width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; border: 2px solid #e2e8f0; transition: all 0.2s; }
.journey-step.done .jstep-dot { background: #f0fdf4; border-color: #16a34a; }
.journey-step.active .jstep-dot { background: #eff6ff; border-color: #3b82f6; box-shadow: 0 0 0 3px #bfdbfe; }
.jstep-body { padding: 6px 0 4px; flex: 1; }
.jstep-label { font-size: 13px; font-weight: 600; color: #374151; }
.jstep-time { font-size: 11px; color: #64748b; margin-top: 1px; }
.jstep-time.pending { color: #cbd5e1; }
.jstep-gps { font-size: 10px; color: #94a3b8; font-family: monospace; margin-top: 2px; }

.journey-line { width: 2px; height: 20px; background: #e2e8f0; margin: 2px 0 2px 17px; transition: background 0.2s; border-radius: 2px; }
.journey-line.done { background: #86efac; }

/* ── ACTIVITY FEED ───────────────────────────── */
.feed-card { }
.feed-list { display: flex; flex-direction: column; gap: 0; max-height: 520px; overflow-y: auto; }
.feed-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
.feed-item:last-child { border-bottom: none; }
.feed-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.log-dot-c { }
.foto-dot-c { background: #16a34a; }
.feed-body { flex: 1; min-width: 0; }
.feed-badge-row { margin-bottom: 3px; }
.log-badge { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
.feed-text { font-size: 13px; color: #374151; margin-bottom: 2px; }
.feed-meta { font-size: 11px; color: #94a3b8; }
.feed-foto-label { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 2px; }
.feed-thumbs { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.feed-thumb { width: 58px; height: 58px; object-fit: cover; border-radius: 6px; border: 1.5px solid #e2e8f0; cursor: pointer; transition: transform 0.15s; }
.feed-thumb:hover { transform: scale(1.07); border-color: #3b82f6; }

/* ── RELATED TICKETS ─────────────────────────── */
.related-item { display: flex; align-items: center; gap: 14px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; cursor: pointer; transition: border-color 0.15s; margin-bottom: 6px; }
.related-item:last-child { margin-bottom: 0; }
.related-item:hover { border-color: #3b82f6; }
.rel-left { flex: 1; min-width: 0; }
.rel-nomor { font-size: 13px; font-weight: 700; color: #0f172a; }
.rel-judul { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rel-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.prio-dot { font-size: 11px; font-weight: 700; }
.rel-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.rel-arrow { color: #94a3b8; font-size: 16px; }

/* ── MODAL OVERLAY ───────────────────────────── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── TIMELINE MODAL ──────────────────────────── */
.timeline-modal { background: #fff; border-radius: 16px; width: 560px; max-width: 95vw; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(0,0,0,0.22); overflow: hidden; }
.tl-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 22px 24px 16px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
.tl-title { font-size: 17px; font-weight: 800; color: #0f172a; margin-bottom: 2px; }
.tl-sub { font-size: 12px; color: #64748b; }
.tl-close { width: 30px; height: 30px; border-radius: 50%; background: #f1f5f9; border: none; cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tl-close:hover { background: #e2e8f0; }
.tl-body { overflow-y: auto; padding: 20px 24px 24px; flex: 1; }

.tl-list { display: flex; flex-direction: column; }
.tl-item { display: flex; gap: 14px; }
.tl-line-wrap { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.tl-dot { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.tl-connector { width: 2px; flex: 1; min-height: 16px; background: linear-gradient(#e2e8f0, #e2e8f0); margin: 4px 0; border-radius: 2px; }

.tl-content { padding: 6px 0 20px; flex: 1; min-width: 0; }
.tl-ev-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
.tl-ev-time { font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
.tl-ev-desc { font-size: 13px; color: #475569; margin-bottom: 2px; word-break: break-word; }
.tl-ev-by { font-size: 11px; color: #94a3b8; }
.tl-badge-wrap { margin-top: 4px; }

.tl-gps-card { margin-top: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px; }
.tl-gps-row { margin-bottom: 3px; }
.tl-gps-row:last-child { margin-bottom: 0; }
.tl-gps-label { font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.3px; }
.tl-gps-coord { font-size: 12px; font-family: monospace; color: #0f172a; font-weight: 600; }
.tl-gps-acc { font-size: 11px; color: #64748b; }
.tl-gps-link { font-size: 12px; color: #3b82f6; text-decoration: none; font-weight: 600; }
.tl-gps-link:hover { text-decoration: underline; }

.tl-fotos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tl-foto-thumb { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; border: 2px solid #e2e8f0; cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
.tl-foto-thumb:hover { transform: scale(1.06); border-color: #3b82f6; }

/* ── PRTG SECTION ────────────────────────────── */
/* Status Card */
.prtg-card { background: #fff; border-radius: 14px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.prtg-hdr { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; gap: 12px; }
.prtg-hdr-left { display: flex; align-items: flex-start; gap: 12px; }
.prtg-icon { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
.prtg-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 3px; }
.prtg-device-name { font-size: 12px; color: #3b82f6; font-weight: 600; font-family: monospace; }
.prtg-loading { font-size: 13px; color: #94a3b8; padding: 10px 0; }
.prtg-err { font-size: 13px; color: #ef4444; padding: 10px 0; }
.prtg-empty { font-size: 13px; color: #94a3b8; padding: 10px 0; }
.btn-refresh-prtg {
  background: #f1f5f9; border: none; border-radius: 8px; padding: 6px 10px;
  font-size: 18px; cursor: pointer; color: #64748b; flex-shrink: 0;
  transition: background 0.15s;
}
.btn-refresh-prtg:hover { background: #e2e8f0; }
.btn-refresh-prtg:disabled { opacity: 0.5; cursor: not-allowed; }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Down-Up rincian */
.prtg-downup { background: #f8fafc; border-radius: 10px; padding: 16px; margin-top: 14px; border: 1px solid #e2e8f0; }
.pdu-section-title { font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 12px; letter-spacing: 0.3px; }
.prtg-downup-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.prtg-downup-item { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 130px; }
.pdu-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; flex-shrink: 0; margin-top: 2px; }
.pdu-icon.down    { background: #fee2e2; color: #dc2626; }
.pdu-icon.up      { background: #dcfce7; color: #16a34a; }
.pdu-icon.pending { background: #fef9c3; color: #a16207; }
.pdu-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 3px; }
.pdu-val   { font-size: 13px; font-weight: 700; color: #0f172a; }
.pdu-msg   { font-size: 11px; color: #64748b; margin-top: 2px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.prtg-downup-arrow { font-size: 20px; color: #cbd5e1; flex-shrink: 0; }
.prtg-downup-duration { border-radius: 10px; padding: 12px 18px; text-align: center; flex-shrink: 0; min-width: 130px; border: 1.5px solid; }
.prtg-downup-duration.dur-card-done { background: #f0fdf4; border-color: #bbf7d0; }
.prtg-downup-duration.dur-card-live { background: #fff1f2; border-color: #fecdd3; }
.pdu-dur-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 6px; }
.pdu-dur-val { font-size: 18px; font-weight: 900; line-height: 1; }
.pdu-dur-val.dur-done { color: #16a34a; }
.pdu-dur-val.dur-live { color: #ef4444; }

/* Sensor Grid */
.sensor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.sensor-card {
  display: flex; align-items: flex-start; gap: 10px;
  border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px 14px;
  cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
  background: #fafafa;
}
.sensor-card:hover { border-color: #93c5fd; background: #f0f9ff; }
.sensor-card.sensor-selected { border-color: #3b82f6; background: #eff6ff; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
.sensor-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; box-shadow: 0 0 0 3px rgba(0,0,0,0.07); }
.sensor-body { flex: 1; min-width: 0; }
.sensor-name { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
.sensor-device { font-size: 11px; }
.sensor-msg { font-size: 11px; color: #64748b; margin-top: 2px; font-style: italic; }
.sensor-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; flex-shrink: 0; white-space: nowrap; align-self: flex-start; }

/* Graph Card */
.prtg-graph-card { background: #fff; border-radius: 14px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.prtg-graph-hdr { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.prtg-graph-title { font-size: 15px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.prtg-live-dot { display: flex; align-items: center; gap: 5px; color: #16a34a; }
.blink-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #16a34a;
  animation: blink 1.2s ease-in-out infinite;
  display: inline-block;
}
@keyframes blink {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(22,163,74,0.4); }
  50% { opacity: 0.5; box-shadow: 0 0 0 5px rgba(22,163,74,0); }
}
.prtg-sensor-lbl { font-size: 13px; color: #64748b; font-weight: 500; }

.prtg-graph-tabs { display: flex; align-items: center; gap: 4px; }
.prtg-tab {
  padding: 5px 12px; border-radius: 7px; border: 1.5px solid #e2e8f0;
  font-size: 12px; font-weight: 600; cursor: pointer; background: #f8fafc; color: #64748b;
  transition: all 0.15s;
}
.prtg-tab.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.prtg-tab:hover:not(.active) { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
.prtg-refresh-btn {
  margin-left: 4px; padding: 5px 10px; border-radius: 7px;
  border: 1.5px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 16px; cursor: pointer; transition: background 0.15s;
}
.prtg-refresh-btn:hover { background: #e2e8f0; }

.prtg-graph-wrap { background: #f8fafc; border-radius: 10px; overflow: hidden; min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.prtg-graph-img { width: 100%; display: block; border-radius: 10px; }
.prtg-graph-err { font-size: 13px; color: #94a3b8; padding: 32px; text-align: center; }
.prtg-graph-spinner { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 32px; color: #94a3b8; font-size: 13px; }
.spin-svg { width: 28px; height: 28px; animation: spin 0.9s linear infinite; }

.prtg-graph-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.prtg-graph-id { font-size: 11px; color: #94a3b8; font-family: monospace; }
.prtg-auto-refresh { font-size: 11px; color: #16a34a; font-weight: 600; }

@media (max-width: 900px) {
  .main-grid { grid-template-columns: 1fr; }
  .foto-stages-grid { grid-template-columns: 1fr; }
  .prtg-graph-hdr { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 600px) {
  .page { padding: 16px; }
  .info-bar { grid-template-columns: 1fr 1fr; }
  .sensor-grid { grid-template-columns: 1fr; }
  .prtg-graph-tabs { flex-wrap: wrap; }
}
</style>
