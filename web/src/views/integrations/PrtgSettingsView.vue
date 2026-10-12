<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from 'vue'
import { useProyekStore } from '@/stores/proyek'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const proyek = useProyekStore()
const auth = useAuthStore()
const bisaKelolaKoneksi = computed(() => auth.hasRole('Admin') || auth.hasRole('Director'))
const tab = ref<'monitor' | 'koneksi' | 'mapping' | 'audit' | 'graph' | 'provision'>('monitor')

// ─── STATUS ───────────────────────────────────────────────────
const status = ref<any>(null)
async function fetchStatus() {
  try { status.value = (await api.get('/prtg/status')).data.data } catch {}
}

const toggling = ref(false)
async function toggleAktif() {
  if (!status.value || toggling.value) return
  const mauAktif = !status.value.is_aktif
  if (!mauAktif && !confirm('Jeda polling PRTG? Tidak ada pengecekan otomatis (tiket auto) sampai diaktifkan lagi.')) return
  toggling.value = true
  try {
    await api.patch('/prtg/toggle', { aktif: mauAktif })
    await fetchStatus()
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal mengubah status polling')
  } finally { toggling.value = false }
}

// ─── KONEKSI ──────────────────────────────────────────────────
const configForm = ref({ base_url: '', username: '', passhash: '', durasi_konfirmasi_menit: 10, cooldown_flapping_menit: 60 })
const configHasPasshash = ref(false)
const savingConfig = ref(false)
const configMsg = ref('')

const DURASI_OPTIONS = [
  { value: 3,  label: '3 menit — koneksi sangat stabil' },
  { value: 5,  label: '5 menit — cukup untuk VPN reconnect singkat' },
  { value: 10, label: '10 menit — rekomendasi (VPN bisa reconnect ~5 menit)' },
  { value: 15, label: '15 menit — koneksi sering flap' },
  { value: 20, label: '20 menit — koneksi sangat tidak stabil' },
]

const COOLDOWN_OPTIONS = [
  { value: 0,   label: '0 menit — nonaktif (tiket baru setiap down)' },
  { value: 30,  label: '30 menit' },
  { value: 60,  label: '60 menit — rekomendasi (1 jam)' },
  { value: 120, label: '2 jam' },
  { value: 240, label: '4 jam' },
]

async function fetchConfig() {
  try {
    const d = (await api.get('/prtg/config')).data.data
    configForm.value.base_url = d.base_url
    configForm.value.username = d.username
    configHasPasshash.value = d.has_passhash
    configForm.value.durasi_konfirmasi_menit = d.durasi_konfirmasi_menit ?? 10
    configForm.value.cooldown_flapping_menit = d.cooldown_flapping_menit ?? 60
  } catch {}
}
async function saveConfig() {
  savingConfig.value = true; configMsg.value = ''
  try {
    await api.patch('/prtg/config', configForm.value)
    configForm.value.passhash = ''
    configMsg.value = 'Konfigurasi disimpan.'
    await Promise.all([fetchConfig(), fetchStatus()])
  } catch (e: any) { configMsg.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { savingConfig.value = false }
}

// ─── PENDING (grace period) ───────────────────────────────────
const pendingList = ref<any[]>([])
const pendingLoading = ref(false)
let pendingInterval: ReturnType<typeof setInterval> | null = null

async function fetchPending() {
  pendingLoading.value = true
  try { pendingList.value = (await api.get('/prtg/pending')).data.data ?? [] }
  catch {} finally { pendingLoading.value = false }
}

function fmtSisa(sisa: number) {
  if (sisa <= 0) return 'Segera diproses...'
  const m = Math.floor(sisa / 60), s = sisa % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}
function fmtTime(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── SITE SEARCH COMBOBOX (reusable helper) ───────────────────
function makeSiteCombo(idRef: { value: number }) {
  const query = ref('')
  const open = ref(false)
  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase()
    if (!q) return proyek.siteList.slice(0, 50)
    return proyek.siteList.filter((s: any) =>
      s.nama_site.toLowerCase().includes(q) ||
      (s.kode_site ?? '').toLowerCase().includes(q) ||
      (s.nama_pelanggan ?? '').toLowerCase().includes(q)
    ).slice(0, 50)
  })
  const display = computed(() => {
    if (!idRef.value) return ''
    const s = proyek.siteList.find((x: any) => x.id_site === idRef.value) as any
    return s ? `[${s.kode_site}] ${s.nama_site}` : ''
  })
  function select(s: any) { idRef.value = s.id_site; query.value = ''; open.value = false }
  function blur() { setTimeout(() => { open.value = false }, 200) }
  function clear() { idRef.value = 0; query.value = '' }
  return { query, open, filtered, display, select, blur, clear }
}

// ─── MAPPING ──────────────────────────────────────────────────
const mappingList = ref<any[]>([])
const unmatchedList = ref<any[]>([])
const mappingLoading = ref(false)
const mapForm = ref({ device_name: '', id_site: 0 })
const mapSubmitting = ref(false)
const mapMsg = ref('')
const hapusMappingId = ref(0)

const mapSite = makeSiteCombo(mapForm.value)

async function fetchMapping() {
  mappingLoading.value = true
  try {
    const [m, u] = await Promise.all([api.get('/prtg/mapping'), api.get('/prtg/mapping/unmatched')])
    mappingList.value = m.data.data
    unmatchedList.value = u.data.data
  } catch {} finally { mappingLoading.value = false }
}

function pilihUnmatched(deviceName: string) {
  mapForm.value.device_name = deviceName
  mapSite.clear()
}

async function submitMapping() {
  if (!mapForm.value.device_name || !mapForm.value.id_site) {
    mapMsg.value = 'Nama device dan site wajib diisi'; return
  }
  mapSubmitting.value = true; mapMsg.value = ''
  try {
    const r = await api.post('/prtg/mapping', mapForm.value)
    mapMsg.value = r.data.message
    mapForm.value = { device_name: '', id_site: 0 }
    mapSite.clear()
    await fetchMapping()
  } catch (e: any) { mapMsg.value = e.response?.data?.message || 'Gagal menyimpan mapping' }
  finally { mapSubmitting.value = false }
}

async function hapusMapping(id: number, nama: string) {
  if (!confirm(`Hapus mapping "${nama}"? Device ini akan balik ke matching otomatis (nama).`)) return
  hapusMappingId.value = id; mapMsg.value = ''
  try { await api.delete(`/prtg/mapping/${id}`); await fetchMapping() }
  catch (e: any) { mapMsg.value = e.response?.data?.message || 'Gagal menghapus mapping' }
  finally { hapusMappingId.value = 0 }
}

// ─── AUDIT SENSOR ─────────────────────────────────────────────
const devices = ref<any[]>([])
const auditLoading = ref(false)
const auditError = ref('')
const onlyUnmatched = ref(false)
const searchDevice = ref('')
const auditPage = ref(1)
const AUDIT_PAGE_SIZE = 100

async function fetchDevices() {
  auditLoading.value = true; auditError.value = ''
  try { devices.value = (await api.get('/prtg/devices')).data.data }
  catch (e: any) { auditError.value = e.response?.data?.message || 'Gagal memuat daftar sensor' }
  finally { auditLoading.value = false }
}
const filteredDevices = computed(() => {
  let list = devices.value
  if (onlyUnmatched.value) list = list.filter((d) => !d.matched)
  const q = searchDevice.value.trim().toLowerCase()
  if (q) list = list.filter((d) => d.device_name.toLowerCase().includes(q))
  return list
})
const auditTotalPages = computed(() => Math.max(1, Math.ceil(filteredDevices.value.length / AUDIT_PAGE_SIZE)))
const pagedDevices = computed(() => {
  const start = (auditPage.value - 1) * AUDIT_PAGE_SIZE
  return filteredDevices.value.slice(start, start + AUDIT_PAGE_SIZE)
})
watch([searchDevice, onlyUnmatched], () => { auditPage.value = 1 })
watch(filteredDevices, () => { if (auditPage.value > auditTotalPages.value) auditPage.value = auditTotalPages.value })
watch(auditPage, (v) => {
  const clamped = Math.min(Math.max(1, Math.trunc(v) || 1), auditTotalPages.value)
  if (clamped !== v) auditPage.value = clamped
})

function mapDariAudit(deviceName: string) {
  tab.value = 'mapping'
  mapForm.value.device_name = deviceName
  mapSite.clear()
}

// ─── GRAPH PING & ETHER ───────────────────────────────────────
const graphSiteId  = ref<number | null>(null)
const graphHours   = ref(0)
const graphDevices = ref<{ device_name: string; sensors: any[] }[] | null>(null)
const graphLoading = ref(false)
const graphError   = ref('')
const openSensorId = ref<number | null>(null)

async function fetchGraphSensors() {
  if (!graphSiteId.value) return
  graphLoading.value = true; graphError.value = ''; graphDevices.value = null
  try {
    const r = await api.get(`/prtg/site/${graphSiteId.value}/sensors`)
    const d = r.data.data
    if (Array.isArray(d)) graphDevices.value = d
    else if (d?.device_name) graphDevices.value = [d]
    else graphDevices.value = []
  } catch (e: any) { graphError.value = e.response?.data?.message || 'Gagal memuat sensor' }
  finally { graphLoading.value = false }
}

const graphBlobUrl     = ref<string | null>(null)
const graphBlobLoading = ref(false)

async function openSensorHistory(objid: number) {
  if (openSensorId.value === objid) {
    if (graphBlobUrl.value) { URL.revokeObjectURL(graphBlobUrl.value); graphBlobUrl.value = null }
    openSensorId.value = null; return
  }
  openSensorId.value = objid
  await loadGraph()
}

async function loadGraph() {
  if (!openSensorId.value) return
  if (graphBlobUrl.value) { URL.revokeObjectURL(graphBlobUrl.value); graphBlobUrl.value = null }
  graphBlobLoading.value = true
  try {
    const r = await api.get(`/prtg/sensor/${openSensorId.value}/graph.png`, {
      params: { graphid: graphHours.value },
      responseType: 'blob',
    })
    graphBlobUrl.value = URL.createObjectURL(r.data)
  } catch {}
  finally { graphBlobLoading.value = false }
}

async function onGraphHoursChange() {
  if (openSensorId.value) await loadGraph()
}

// ─── MONITOR ──────────────────────────────────────────────────
const monitorData    = ref<any[]>([])
const monitorLoading = ref(false)
const monitorError   = ref('')
const monitorLastAt  = ref<Date | null>(null)
let   monitorTimer: ReturnType<typeof setInterval> | null = null

async function fetchMonitor() {
  monitorLoading.value = true; monitorError.value = ''
  try {
    monitorData.value = (await api.get('/prtg/monitor')).data.data ?? []
    monitorLastAt.value = new Date()
  } catch (e: any) { monitorError.value = e.response?.data?.message || 'Gagal memuat data monitor' }
  finally { monitorLoading.value = false }
}

function fmtRelative(d: Date | null) {
  if (!d) return '—'
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 5) return 'baru saja'
  if (s < 60) return `${s} detik lalu`
  return `${Math.floor(s / 60)} menit lalu`
}

const monitorTick = ref(0)
let   monitorTickInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await Promise.all([fetchStatus(), fetchConfig(), fetchMapping(), proyek.fetchSiteList(), fetchPending(), fetchMonitor()])
  pendingInterval = setInterval(fetchPending, 15_000)
  monitorTimer = setInterval(fetchMonitor, 60_000)
  monitorTickInterval = setInterval(() => monitorTick.value++, 5_000)
})

import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (pendingInterval) clearInterval(pendingInterval)
  if (monitorTimer) clearInterval(monitorTimer)
  if (monitorTickInterval) clearInterval(monitorTickInterval)
})

// ─── PROVISION ────────────────────────────────────────────────
const provisionList     = ref<any[]>([])
const provisionLoading  = ref(false)
const provisionError    = ref('')
const provisionSearch   = ref('')

const bulkSubmitting  = ref(false)
const bulkResult      = ref<any>(null)

const provModal           = ref(false)
const provSelected        = ref<any>(null)
const provSiteId          = ref<number>(0)
const provForm            = ref({ jenis_perangkat: 'CPE', merk: '', tipe_model: '', serial_number: '', ip_address: '' })
const provSubmitting      = ref(false)
const provMsg             = ref('')
const provAsetFound       = ref<any>(null)
const provAsetLookupLoad  = ref(false)
const linkAset            = ref(false)

const JENIS_OPTIONS = ['CPE', 'Router', 'Switch', 'ONU', 'ONT', 'Server', 'Access Point', 'Firewall', 'Lainnya']

// Site combobox untuk modal provision
const modalSite = makeSiteCombo(provSiteId as any)

// Inline site search untuk baris "Tidak Cocok"
const inlineSiteId    = ref<Record<string, number>>({})
const inlineSiteQuery = ref<Record<string, string>>({})
const inlineSiteOpen  = ref<Record<string, boolean>>({})
const quickProvLoading = ref<Record<string, boolean>>({})

function getInlineSiteFiltered(deviceName: string) {
  const q = (inlineSiteQuery.value[deviceName] ?? '').trim().toLowerCase()
  if (!q) return proyek.siteList.slice(0, 40)
  return (proyek.siteList as any[]).filter((s: any) =>
    s.nama_site.toLowerCase().includes(q) ||
    (s.kode_site ?? '').toLowerCase().includes(q)
  ).slice(0, 40)
}

function setInlineSite(deviceName: string, site: any) {
  inlineSiteId.value[deviceName] = site.id_site
  inlineSiteQuery.value[deviceName] = `[${site.kode_site}] ${site.nama_site}`
  inlineSiteOpen.value[deviceName] = false
}

function clearInlineSite(deviceName: string) {
  delete inlineSiteId.value[deviceName]
  inlineSiteQuery.value[deviceName] = ''
}

async function quickProvision(device: any) {
  const siteId = inlineSiteId.value[device.device_name]
  if (!siteId) return
  quickProvLoading.value[device.device_name] = true
  try {
    await api.post('/prtg/provision', {
      device_name: device.device_name,
      id_site: siteId,
      ip_address: device.ip_address,
      jenis_perangkat: 'CPE',
    })
    const fresh = (await api.get('/prtg/provision/preview')).data.data ?? []
    provisionList.value = fresh
    clearInlineSite(device.device_name)
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal provision')
  } finally {
    delete quickProvLoading.value[device.device_name]
  }
}

async function fetchProvision() {
  provisionLoading.value = true; provisionError.value = ''; bulkResult.value = null
  try {
    provisionList.value = (await api.get('/prtg/provision/preview')).data.data ?? []
    if (bulkCandidates.value.length) await doBulkProvision()
  } catch (e: any) { provisionError.value = e.response?.data?.message || 'Gagal memuat data provision' }
  finally { provisionLoading.value = false }
}

const bulkCandidates = computed(() =>
  provisionList.value.filter((d: any) => d.match_score === 100 && !d.sudah_ada && d.ip_address && d.id_site)
)

const partialCandidates = computed(() =>
  filterBySearch(provisionList.value.filter((d: any) =>
    d.match_score !== null && d.match_score < 100 && !d.sudah_ada && d.ip_address && d.id_site
  ))
)

const unmatchedCandidates = computed(() =>
  filterBySearch(provisionList.value.filter((d: any) => !d.id_site && d.ip_address))
)

const doneList = computed(() =>
  filterBySearch(provisionList.value.filter((d: any) => d.sudah_ada))
)

// Stats ringkasan
const provStats = computed(() => ({
  total: provisionList.value.length,
  done: provisionList.value.filter((d: any) => d.sudah_ada).length,
  partial: provisionList.value.filter((d: any) => !d.sudah_ada && d.match_score !== null && d.match_score < 100 && d.id_site).length,
  unmatched: provisionList.value.filter((d: any) => !d.sudah_ada && !d.id_site && d.ip_address).length,
  auto: provisionList.value.filter((d: any) => !d.sudah_ada && d.match_score === 100 && d.id_site).length,
}))

function filterBySearch(list: any[]) {
  const q = provisionSearch.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((d: any) =>
    d.device_name.toLowerCase().includes(q) ||
    (d.nama_site ?? '').toLowerCase().includes(q) ||
    (d.nama_pelanggan ?? '').toLowerCase().includes(q) ||
    (d.ip_address ?? '').includes(q)
  )
}

const filteredBulk = computed(() => filterBySearch(bulkCandidates.value))

async function doBulkProvision() {
  if (!bulkCandidates.value.length) return
  bulkSubmitting.value = true; bulkResult.value = null
  try {
    const items = bulkCandidates.value.map((d: any) => ({
      device_name: d.device_name,
      id_site: d.id_site,
      ip_address: d.ip_address,
      jenis_perangkat: 'CPE',
    }))
    const r = await api.post('/prtg/provision/bulk', { items })
    bulkResult.value = r.data
    const fresh = (await api.get('/prtg/provision/preview')).data.data ?? []
    provisionList.value = fresh
  } catch (e: any) {
    bulkResult.value = { error: e.response?.data?.message || 'Gagal bulk provision' }
  } finally { bulkSubmitting.value = false }
}

function openProvModal(device: any) {
  provSelected.value = device
  provSiteId.value = device.id_site ?? inlineSiteId.value[device.device_name] ?? 0
  provForm.value = { jenis_perangkat: 'CPE', merk: '', tipe_model: '', serial_number: '', ip_address: device.ip_address ?? '' }
  provAsetFound.value = null
  linkAset.value = false
  provMsg.value = ''
  modalSite.query.value = ''
  modalSite.open.value = false
  provModal.value = true
}

async function lookupAset() {
  if (!provForm.value.serial_number) return
  provAsetLookupLoad.value = true; provAsetFound.value = null
  try {
    const r = await api.get('/prtg/aset/lookup', { params: { sn: provForm.value.serial_number } })
    provAsetFound.value = r.data.data
    if (provAsetFound.value) linkAset.value = true
  } catch {} finally { provAsetLookupLoad.value = false }
}

async function submitProvision() {
  if (!provSelected.value || !provForm.value.jenis_perangkat) {
    provMsg.value = 'Jenis perangkat wajib dipilih'; return
  }
  if (!provSiteId.value) {
    provMsg.value = 'Site pelanggan wajib dipilih'; return
  }
  provSubmitting.value = true; provMsg.value = ''
  try {
    const payload: any = {
      device_name: provSelected.value.device_name,
      id_site: provSiteId.value,
      ip_address: provForm.value.ip_address,
      jenis_perangkat: provForm.value.jenis_perangkat,
      merk: provForm.value.merk || undefined,
      tipe_model: provForm.value.tipe_model || undefined,
      serial_number: provForm.value.serial_number || undefined,
    }
    if (linkAset.value && provAsetFound.value) payload.id_aset = provAsetFound.value.id_aset
    await api.post('/prtg/provision', payload)
    provModal.value = false
    clearInlineSite(provSelected.value.device_name)
    await fetchProvision()
  } catch (e: any) {
    provMsg.value = e.response?.data?.message || 'Gagal menambahkan perangkat'
  } finally { provSubmitting.value = false }
}

// Export CSV semua device provision
function exportProvisionCSV() {
  if (!provisionList.value.length) return
  const header = ['Device PRTG', 'IP Address', 'Status', 'Site', 'Skor Match (%)', 'Pelanggan', 'Sudah Provision']
  const rows = provisionList.value.map((d: any) => {
    let status = 'Tidak Cocok'
    if (d.sudah_ada) status = 'Sudah Provision'
    else if (d.match_score === 100) status = '100% Match (Auto)'
    else if (d.match_score != null && d.match_score >= 50) status = `Partial ${d.match_score}%`
    else if (!d.ip_address) status = 'No IP'
    return [d.device_name, d.ip_address ?? '', status, d.nama_site ?? '', d.match_score ?? '', d.nama_pelanggan ?? '', d.sudah_ada ? 'Ya' : 'Tidak']
  })
  const csv = [header, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `prtg-provision-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>📡 PRTG — Monitoring</h2>
      <p class="sub">Koneksi API, mapping device ↔ site pelanggan, dan audit sensor</p>
    </div>

    <div class="status-bar" v-if="status">
      <span class="status-dot" :class="(status.is_aktif && status.configured) ? 'ok' : 'off'"></span>
      <span class="status-text">{{ status.pesan }}</span>
      <button v-if="bisaKelolaKoneksi" class="toggle-btn" :class="{ paused: !status.is_aktif }"
        :disabled="toggling" @click="toggleAktif">
        {{ toggling ? '...' : (status.is_aktif ? '⏸ Jeda' : '▶ Aktifkan') }}
      </button>
    </div>

    <div class="tabs-wrap">
      <div class="tabs">
        <button :class="['tab', { active: tab === 'monitor' }]" @click="tab = 'monitor'; fetchMonitor()">🔴 Monitor Down</button>
        <button :class="['tab', { active: tab === 'mapping' }]" @click="tab = 'mapping'">🔗 Mapping</button>
        <button :class="['tab', { active: tab === 'audit' }]" @click="tab = 'audit'; fetchDevices()">🔍 Audit Sensor</button>
        <button :class="['tab', { active: tab === 'graph' }]" @click="tab = 'graph'">📈 Ping & Traffic</button>
        <button :class="['tab', { active: tab === 'provision' }]" @click="tab = 'provision'; fetchProvision()">⚡ Provision</button>
        <button v-if="bisaKelolaKoneksi" :class="['tab', { active: tab === 'koneksi' }]" @click="tab = 'koneksi'">⚙️ Koneksi</button>
      </div>
    </div>

    <!-- ─── TAB: MONITOR ─── -->
    <div v-if="tab === 'monitor'" class="tab-content">
      <div class="monitor-header">
        <div class="monitor-meta">
          <span class="mon-count" :class="monitorData.length ? 'count-red' : 'count-green'">{{ monitorData.length }}</span>
          <div>
            <div class="mon-label">{{ monitorData.length === 0 ? 'Semua device UP ✓' : 'device sedang DOWN' }}</div>
            <div class="mon-time">Diperbarui: {{ fmtRelative(monitorLastAt) }}</div>
          </div>
        </div>
        <button class="btn-refresh" :disabled="monitorLoading" @click="fetchMonitor">
          <span v-if="monitorLoading">⏳</span><span v-else>🔄</span> Refresh
        </button>
      </div>

      <div v-if="monitorError" class="alert-err">{{ monitorError }}</div>
      <div v-if="monitorLoading && !monitorData.length" class="loading-state">Mengambil data dari PRTG...</div>

      <div v-else-if="!monitorData.length && !monitorLoading" class="empty-monitor">
        <div class="empty-icon">✅</div>
        <div class="empty-title">Semua Device UP</div>
        <div class="empty-sub">Tidak ada sensor Down, DownAck, atau DownPartial di PRTG saat ini.</div>
      </div>

      <div v-else class="monitor-list">
        <div v-for="d in monitorData" :key="d.device" class="mon-card">
          <div class="mon-card-top">
            <div class="mon-device-name">{{ d.device }}</div>
            <div class="mon-badges">
              <span v-if="d.site" class="badge-site">{{ d.site.nama_site }}</span>
              <span v-else class="badge-nosite">Belum termapping</span>
              <router-link v-if="d.tiket" :to="`/operations/${d.tiket.id_ticket}`" class="badge-tiket">
                🎫 {{ d.tiket.nomor_tiket }} · {{ d.tiket.status_tiket }}
              </router-link>
              <template v-else-if="d.site">
                <span v-if="d.sisa_grace_ms !== null && d.sisa_grace_ms > 0" class="badge-grace">
                  ⏳ Tiket dalam {{ Math.ceil(d.sisa_grace_ms / 60000) }} mnt
                </span>
                <span v-else-if="d.sisa_grace_ms === 0" class="badge-grace badge-grace-soon">⚡ Tiket segera dibuat...</span>
                <span v-else class="badge-notiket">Menunggu konfirmasi</span>
              </template>
            </div>
          </div>
          <div class="mon-sensors">
            <div v-for="s in d.sensors" :key="s.id" class="mon-sensor-row">
              <span class="sensor-dot"></span>
              <span class="sensor-name">{{ s.nama }}</span>
              <span class="sensor-status">{{ s.status }}</span>
              <span v-if="s.pesan" class="sensor-msg">{{ s.pesan }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── TAB: MAPPING ─── -->
    <div v-if="tab === 'mapping'" class="tab-content">
      <div class="card" v-if="unmatchedList.length">
        <h3>⚠️ Belum Termapping (24 jam terakhir)</h3>
        <p class="hint">Device ini pernah down tapi tidak cocok dengan site manapun. Klik untuk isi form mapping di bawah.</p>
        <div class="unmatched-list">
          <button v-for="u in unmatchedList" :key="u.id_webhook" class="unmatched-chip" @click="pilihUnmatched(u.prtg_device_name)">
            {{ u.prtg_device_name }}
          </button>
        </div>
      </div>

      <div class="card">
        <h3>Tambah / Ubah Mapping</h3>
        <div class="form-row">
          <div class="field">
            <label>Nama Device PRTG (persis)</label>
            <input v-model="mapForm.device_name" placeholder="Nama device sesuai PRTG" />
          </div>
          <div class="field">
            <label>Site Pelanggan</label>
            <div class="site-combo">
              <div class="site-combo-val" :class="{ 'has-val': mapForm.id_site }" @click="mapSite.open.value = true">
                <span v-if="mapSite.display.value">{{ mapSite.display.value }}</span>
                <span v-else class="combo-ph">— Ketik nama site / kode —</span>
                <span v-if="mapForm.id_site" class="combo-clear" @click.stop="mapSite.clear()">✕</span>
              </div>
              <input v-if="mapSite.open.value" class="combo-input" v-model="mapSite.query.value"
                placeholder="Cari nama site..." @blur="mapSite.blur()" autofocus />
              <div v-if="mapSite.open.value" class="combo-dropdown">
                <div v-for="s in mapSite.filtered.value" :key="s.id_site" class="combo-option"
                  @mousedown.prevent="mapSite.select(s)">
                  <span class="opt-code">{{ s.kode_site }}</span>
                  <span class="opt-name">{{ s.nama_site }}</span>
                </div>
                <div v-if="!mapSite.filtered.value.length" class="combo-empty">Site tidak ditemukan</div>
              </div>
            </div>
          </div>
          <button class="btn-submit" @click="submitMapping" :disabled="mapSubmitting">
            {{ mapSubmitting ? 'Menyimpan...' : 'Simpan Mapping' }}
          </button>
        </div>
        <p v-if="mapMsg" class="msg">{{ mapMsg }}</p>
      </div>

      <div class="card">
        <h3>Mapping Tersimpan</h3>
        <div v-if="mappingLoading" class="loading">Memuat...</div>
        <div class="table-wrap">
          <table v-if="!mappingLoading">
            <thead><tr><th>Nama Device PRTG</th><th>Site</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!mappingList.length"><td colspan="3" class="empty">Belum ada mapping manual</td></tr>
              <tr v-for="m in mappingList" :key="m.id_mapping">
                <td class="mono">{{ m.device_name }}</td>
                <td>[{{ m.site.kode_site }}] {{ m.site.nama_site }}</td>
                <td><button class="btn-hapus" :disabled="hapusMappingId === m.id_mapping" @click="hapusMapping(m.id_mapping, m.device_name)">{{ hapusMappingId === m.id_mapping ? '...' : 'Hapus' }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ─── TAB: AUDIT ─── -->
    <div v-if="tab === 'audit'" class="tab-content">
      <div class="card">
        <div class="audit-toolbar">
          <input v-model="searchDevice" class="search-input" placeholder="🔍 Cari nama device..." />
          <label class="chk"><input type="checkbox" v-model="onlyUnmatched" /> Hanya belum match</label>
          <button class="btn-secondary" @click="fetchDevices">🔄 Muat Ulang</button>
        </div>
        <p v-if="auditError" class="msg err">{{ auditError }}</p>
        <div v-if="auditLoading" class="loading">Memuat dari PRTG...</div>
        <template v-else>
          <p class="result-count">{{ filteredDevices.length }} dari {{ devices.length }} device</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Device PRTG</th><th>Sensor</th><th>Down</th><th>Status Match</th><th>Site</th><th></th></tr></thead>
              <tbody>
                <tr v-if="!filteredDevices.length"><td colspan="6" class="empty">{{ devices.length ? 'Tidak ada hasil' : 'Belum ada data — klik Muat Ulang' }}</td></tr>
                <tr v-for="d in pagedDevices" :key="d.device_name">
                  <td class="mono">{{ d.device_name }}</td>
                  <td class="center">{{ d.jumlah_sensor }}</td>
                  <td class="center">{{ d.ada_down ? '🔴' : '—' }}</td>
                  <td>
                    <span class="badge" :class="d.matched ? (d.mapped_manual ? 'badge-manual' : 'badge-auto') : 'badge-none'">
                      {{ d.matched ? (d.mapped_manual ? 'Manual' : 'Otomatis') : 'Belum Match' }}
                    </span>
                  </td>
                  <td>{{ d.site ? `[${d.site.nama_site}]` : '—' }}</td>
                  <td>
                    <button v-if="!d.matched" class="btn-map" @click="mapDariAudit(d.device_name)">Map ke Site</button>
                    <button v-else class="btn-map-add" @click="mapDariAudit(d.device_name)" title="Tambah / timpa dengan mapping manual">+ Manual</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="auditTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="auditPage === 1" @click="auditPage = 1">«</button>
            <button class="page-btn" :disabled="auditPage === 1" @click="auditPage--">‹</button>
            <span class="page-info">
              Hal <input type="number" class="page-jump" min="1" :max="auditTotalPages" v-model.number="auditPage" /> / {{ auditTotalPages }}
            </span>
            <button class="page-btn" :disabled="auditPage === auditTotalPages" @click="auditPage++">›</button>
            <button class="page-btn" :disabled="auditPage === auditTotalPages" @click="auditPage = auditTotalPages">»</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ─── TAB: KONEKSI ─── -->
    <div v-if="tab === 'koneksi' && bisaKelolaKoneksi" class="tab-content">
      <div class="card">
        <h3>Koneksi API PRTG</h3>
        <div class="field"><label>Base URL</label><input v-model="configForm.base_url" placeholder="http://103.238.202.58:8081" /></div>
        <div class="field"><label>Username</label><input v-model="configForm.username" placeholder="root" /></div>
        <div class="field">
          <label>Passhash {{ configHasPasshash ? '(sudah tersimpan — isi hanya jika ingin ganti)' : '' }}</label>
          <input v-model="configForm.passhash" type="password" :placeholder="configHasPasshash ? '••••••••' : 'Passhash PRTG'" />
        </div>
      </div>

      <div class="card">
        <h3>Anti False Alarm — Grace Period</h3>
        <p class="hint">Sensor harus bertahan Down selama durasi ini sebelum tiket dibuat. Jika UP dalam waktu ini → false alarm.</p>
        <div class="field">
          <label>Durasi Konfirmasi Down</label>
          <select v-model.number="configForm.durasi_konfirmasi_menit">
            <option v-for="o in DURASI_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
        <div class="durasi-preview">
          <div class="durasi-flow">
            <div class="dp-step dp-warn">Sensor Down Terdeteksi</div>
            <div class="dp-arrow">→ tunggu {{ configForm.durasi_konfirmasi_menit }} menit →</div>
            <div class="dp-split">
              <div class="dp-step dp-ok">Masih Down ✓<br><small>Buat tiket + kirim WA</small></div>
              <div class="dp-step dp-silent">Sudah Up ✗<br><small>False alarm — tidak ada notif</small></div>
            </div>
          </div>
        </div>

        <div class="field" style="margin-top:20px">
          <label>Cooldown Anti-Flapping</label>
          <select v-model.number="configForm.cooldown_flapping_menit">
            <option v-for="o in COOLDOWN_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <p class="field-hint">Jika device kembali DOWN dalam waktu ini setelah tiket di-resolve, tiket lama akan <strong>dibuka kembali</strong> (bukan tiket baru).</p>
        </div>

        <div v-if="configForm.cooldown_flapping_menit > 0" class="durasi-preview">
          <div class="durasi-flow">
            <div class="dp-step dp-ok">Tiket Resolved</div>
            <div class="dp-arrow-split">
              <div>
                <div class="dp-arrow">→ DOWN dalam {{ configForm.cooldown_flapping_menit }} menit →</div>
                <div class="dp-step dp-warn">Reopen tiket lama<br><small>Log flapping #N ditambahkan</small></div>
              </div>
              <div>
                <div class="dp-arrow">→ DOWN setelah {{ configForm.cooldown_flapping_menit }} menit →</div>
                <div class="dp-step dp-ok">Tiket baru dibuat<br><small>Outage berbeda</small></div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="durasi-preview">
          <p class="hint" style="margin:0;color:#f97316">⚠️ Cooldown nonaktif — setiap down akan membuat tiket baru, termasuk saat flapping.</p>
        </div>

        <button class="btn-submit" @click="saveConfig" :disabled="savingConfig">{{ savingConfig ? 'Menyimpan...' : 'Simpan Konfigurasi' }}</button>
        <p v-if="configMsg" class="msg">{{ configMsg }}</p>
      </div>
    </div>

    <!-- ─── TAB: PING & TRAFFIC GRAPH ─── -->
    <div v-if="tab === 'graph'" class="tab-content">
      <div class="card">
        <div class="graph-toolbar">
          <div class="field" style="min-width:220px;margin:0">
            <label>Pilih Site</label>
            <select v-model="graphSiteId" @change="fetchGraphSensors()">
              <option :value="null" disabled>-- pilih site --</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">{{ s.nama_site }} ({{ s.kode_site }})</option>
            </select>
          </div>
          <div class="field" style="min-width:140px;margin:0">
            <label>Rentang Waktu</label>
            <select v-model="graphHours" @change="onGraphHoursChange()">
              <option :value="0">Live</option>
              <option :value="1">48 jam</option>
              <option :value="2">30 hari</option>
              <option :value="3">365 hari</option>
            </select>
          </div>
        </div>
        <div v-if="graphLoading" class="loading">Memuat sensor...</div>
        <div v-if="graphError" class="msg err">{{ graphError }}</div>
        <div v-if="!graphSiteId && !graphLoading" class="empty">Pilih site untuk melihat data Ping & Traffic</div>
      </div>

      <template v-if="graphDevices !== null">
        <div v-if="!graphDevices.length" class="card"><p class="empty">Tidak ada device PRTG yang cocok untuk site ini. Buat mapping di tab Mapping.</p></div>
        <template v-for="dev in graphDevices" :key="dev.device_name">
          <p class="device-header">
            <span class="device-label">📡 {{ dev.device_name }}</span>
            <span class="sensor-count">{{ dev.sensors?.length ?? 0 }} sensor</span>
          </p>
          <div class="card" v-if="dev.sensors?.length">
            <div v-for="s in dev.sensors" :key="s.objid" class="sensor-block">
              <div class="sensor-row" @click="openSensorHistory(s.objid)">
                <span class="sensor-name">{{ s.sensor }}</span>
                <span :class="['sensor-status', s.status_raw <= 3 ? 'st-up' : 'st-down']">{{ s.status }}</span>
                <span class="sensor-toggle">{{ openSensorId === s.objid ? '▲' : '▼' }}</span>
              </div>
              <div v-if="openSensorId === s.objid" class="sensor-detail">
                <p class="graph-label">PRTG Graph — {{ ['Live','48 jam','30 hari','365 hari'][graphHours] ?? 'Live' }}</p>
                <div v-if="graphBlobLoading" class="loading" style="padding:12px">Memuat graph...</div>
                <img v-else-if="graphBlobUrl" :src="graphBlobUrl" class="prtg-graph-img" />
                <p v-else class="empty" style="padding:12px">Graph tidak tersedia</p>
              </div>
            </div>
          </div>
          <div class="card" v-else><p class="empty">Tidak ada sensor untuk device ini</p></div>
        </template>
      </template>
    </div>

    <!-- ─── TAB: PROVISION ─── -->
    <div v-if="tab === 'provision'" class="tab-content">

      <!-- Toolbar -->
      <div class="prov-toolbar-bar">
        <input class="search-prov" v-model="provisionSearch" placeholder="🔍 Cari device / site / IP..." />
        <button class="btn-export" @click="exportProvisionCSV" :disabled="!provisionList.length" title="Export semua status provision ke CSV">
          ⬇ Export CSV
        </button>
        <button class="btn-refresh" @click="fetchProvision" :disabled="provisionLoading">
          {{ provisionLoading ? '⏳' : '🔄' }} Refresh
        </button>
      </div>

      <!-- Summary stats -->
      <div v-if="provisionList.length && !provisionLoading" class="prov-stats">
        <div class="stat-item stat-total"><div class="stat-n">{{ provStats.total }}</div><div class="stat-l">Total Device</div></div>
        <div class="stat-item stat-done"><div class="stat-n">{{ provStats.done }}</div><div class="stat-l">Sudah Provision</div></div>
        <div class="stat-item stat-auto"><div class="stat-n">{{ provStats.auto }}</div><div class="stat-l">Siap Auto</div></div>
        <div class="stat-item stat-partial"><div class="stat-n">{{ provStats.partial }}</div><div class="stat-l">Perlu Konfirmasi</div></div>
        <div class="stat-item" :class="provStats.unmatched ? 'stat-unmatched' : 'stat-done'">
          <div class="stat-n">{{ provStats.unmatched }}</div>
          <div class="stat-l">Belum Cocok</div>
        </div>
      </div>

      <div v-if="provisionLoading" class="loading">Memuat data PRTG...</div>
      <div v-else-if="provisionError" class="card"><p class="msg err">{{ provisionError }}</p></div>
      <template v-else>

        <!-- SECTION 1: 100% MATCH — AUTO PROVISIONED -->
        <div v-if="bulkSubmitting || bulkResult" class="card section-bulk">
          <div class="section-head">
            <div>
              <span class="section-badge badge-bulk">100% cocok</span>
              <strong>Auto-Provision</strong>
              <span v-if="bulkSubmitting" class="section-sub"> — sedang memproses...</span>
            </div>
            <span v-if="bulkSubmitting" class="bulk-spinner">⏳</span>
          </div>
          <div v-if="bulkResult" class="bulk-result">
            <div v-if="bulkResult.error" class="br-row br-err">❌ {{ bulkResult.error }}</div>
            <template v-else>
              <div v-if="bulkResult.provisioned_count" class="br-row br-ok">✓ {{ bulkResult.provisioned_count }} device berhasil di-provision otomatis</div>
              <div v-if="bulkResult.skipped_count" class="br-row br-skip">⟳ {{ bulkResult.skipped_count }} dilewati (IP sudah terdaftar)</div>
              <div v-if="bulkResult.error_count" class="br-row br-err">❌ {{ bulkResult.error_count }} error</div>
              <div v-if="!bulkResult.provisioned_count && !bulkResult.error_count" class="br-row br-skip">Semua device 100% sudah ter-provision sebelumnya</div>
            </template>
          </div>
        </div>

        <!-- SECTION 2: PARTIAL MATCH — PERLU KONFIRMASI -->
        <div v-if="partialCandidates.length" class="card">
          <div class="section-head">
            <div>
              <span class="section-badge badge-partial">50–99% cocok</span>
              <strong>Perlu Konfirmasi Site</strong>
              <span class="section-sub"> — {{ partialCandidates.length }} device, site sudah di-tebak, periksa sebelum provision</span>
            </div>
          </div>
          <div class="table-wrap">
            <table class="prov-table">
              <thead><tr><th>Device PRTG</th><th>IP</th><th>Site Tebakan</th><th>Skor</th><th></th></tr></thead>
              <tbody>
                <tr v-for="d in partialCandidates" :key="d.device_name">
                  <td>
                    <span class="mono">{{ d.device_name }}</span>
                    <span v-if="d.prtg_status" :class="['prtg-st', d.prtg_status?.toLowerCase().includes('up') ? 'prtg-up' : 'prtg-dn']">{{ d.prtg_status }}</span>
                  </td>
                  <td class="mono ip-cell">{{ d.ip_address }}</td>
                  <td>
                    <span class="site-name">{{ d.nama_site }}</span>
                    <span v-if="d.nama_pelanggan" class="pelanggan-sub">{{ d.nama_pelanggan }}</span>
                  </td>
                  <td><span class="badge-auto-match">~{{ d.match_score }}%</span></td>
                  <td><button class="btn-prov" @click="openProvModal(d)">Provision</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECTION 3: TIDAK COCOK — PILIH SITE MANUAL -->
        <div v-if="unmatchedCandidates.length" class="card">
          <div class="section-head">
            <div>
              <span class="section-badge badge-no-map">Tidak cocok</span>
              <strong>Pilih Site Manual</strong>
              <span class="section-sub"> — {{ unmatchedCandidates.length }} device, cari site lalu klik ⚡ Provision</span>
            </div>
          </div>
          <div class="table-wrap">
            <table class="prov-table">
              <thead>
                <tr>
                  <th>Device PRTG</th>
                  <th>IP</th>
                  <th style="min-width:220px">Cari Site</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in unmatchedCandidates" :key="d.device_name">
                  <td>
                    <span class="mono">{{ d.device_name }}</span>
                    <span v-if="d.prtg_status" :class="['prtg-st', d.prtg_status?.toLowerCase().includes('up') ? 'prtg-up' : 'prtg-dn']">{{ d.prtg_status }}</span>
                  </td>
                  <td class="mono ip-cell">{{ d.ip_address }}</td>
                  <td>
                    <!-- Inline site search per row -->
                    <div class="site-combo site-combo-sm">
                      <div class="site-combo-val" :class="{ 'has-val': inlineSiteId[d.device_name] }"
                        @click="inlineSiteOpen[d.device_name] = true">
                        <span v-if="inlineSiteId[d.device_name]" class="combo-selected-text">{{ inlineSiteQuery[d.device_name] }}</span>
                        <span v-else class="combo-ph">Ketik nama site...</span>
                        <span v-if="inlineSiteId[d.device_name]" class="combo-clear"
                          @click.stop="clearInlineSite(d.device_name)">✕</span>
                      </div>
                      <input v-if="inlineSiteOpen[d.device_name]" class="combo-input"
                        :value="inlineSiteId[d.device_name] ? '' : inlineSiteQuery[d.device_name]"
                        @input="(e: any) => { inlineSiteQuery[d.device_name] = e.target.value; inlineSiteOpen[d.device_name] = true }"
                        placeholder="Cari nama site / kode..."
                        @blur="() => setTimeout(() => { inlineSiteOpen[d.device_name] = false }, 200)"
                        autofocus />
                      <div v-if="inlineSiteOpen[d.device_name]" class="combo-dropdown">
                        <div v-for="s in getInlineSiteFiltered(d.device_name)" :key="s.id_site"
                          class="combo-option" @mousedown.prevent="setInlineSite(d.device_name, s)">
                          <span class="opt-code">{{ s.kode_site }}</span>
                          <span class="opt-name">{{ s.nama_site }}</span>
                        </div>
                        <div v-if="!getInlineSiteFiltered(d.device_name).length" class="combo-empty">Site tidak ditemukan</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="btn-row-inline">
                      <button class="btn-prov"
                        :disabled="!inlineSiteId[d.device_name] || quickProvLoading[d.device_name]"
                        @click="quickProvision(d)">
                        {{ quickProvLoading[d.device_name] ? '...' : '⚡ Provision' }}
                      </button>
                      <button class="btn-prov-sm" @click="openProvModal(d)" title="Isi detail lengkap (merk, model, S/N)">Detail</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="hint" style="margin:12px 0 0">
            ⚡ Provision langsung menyimpan sebagai <strong>CPE</strong>. Gunakan <strong>Detail</strong> untuk mengisi merk, tipe model, dan serial number.
          </p>
        </div>

        <!-- SECTION 4: SUDAH TER-PROVISION -->
        <details v-if="doneList.length" class="card done-section">
          <summary class="done-summary">✓ Sudah ter-provision ({{ doneList.length }})</summary>
          <div class="table-wrap">
            <table class="prov-table">
              <thead><tr><th>Device PRTG</th><th>IP</th><th>Site</th><th></th></tr></thead>
              <tbody>
                <tr v-for="d in doneList" :key="d.device_name" class="row-done">
                  <td class="mono">{{ d.device_name }}</td>
                  <td class="mono ip-cell">{{ d.ip_address }}</td>
                  <td>
                    <span class="site-name">{{ d.nama_site || '—' }}</span>
                    <span v-if="d.nama_pelanggan" class="pelanggan-sub">{{ d.nama_pelanggan }}</span>
                  </td>
                  <td><button class="btn-prov-sm" @click="openProvModal(d)">+ Lagi</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>

        <div v-if="!filteredBulk.length && !partialCandidates.length && !unmatchedCandidates.length && !doneList.length" class="card">
          <p class="empty-prov">Tidak ada device PRTG ditemukan. Periksa koneksi PRTG di tab Koneksi.</p>
        </div>

      </template>
    </div>

    <!-- Modal Provision -->
    <div v-if="provModal" class="modal-overlay" @click.self="provModal = false">
      <div class="modal-box">
        <div class="modal-head">
          <h4>⚡ Provision Perangkat</h4>
          <button class="modal-close" @click="provModal = false">✕</button>
        </div>

        <div class="modal-info">
          <div class="info-row"><span>Device PRTG</span><span class="mono">{{ provSelected?.device_name }}</span></div>
          <div class="info-row"><span>IP Address</span><span class="mono ip-cell">{{ provSelected?.ip_address || '—' }}</span></div>
          <div v-if="provSelected?.match_source === 'auto'" class="info-row auto-match-note">
            <span>Auto-match</span>
            <span class="badge-auto-match">~{{ provSelected?.match_score }}% mirip "{{ provSelected?.nama_site }}"</span>
          </div>
        </div>

        <div class="modal-form">
          <!-- Searchable site selector -->
          <div class="field">
            <label>Site Pelanggan <span class="req">*</span>
              <span v-if="provSelected?.match_source === 'auto'" class="field-hint"> — terisi otomatis, periksa sebelum provision</span>
            </label>
            <div class="site-combo">
              <div class="site-combo-val" :class="{ 'has-val': provSiteId }" @click="modalSite.open.value = !modalSite.open.value">
                <span v-if="modalSite.display.value">{{ modalSite.display.value }}</span>
                <span v-else class="combo-ph">— Ketik nama site / kode —</span>
                <span v-if="provSiteId" class="combo-clear" @click.stop="provSiteId = 0; modalSite.clear()">✕</span>
              </div>
              <input v-if="modalSite.open.value" class="combo-input"
                v-model="modalSite.query.value"
                placeholder="Cari nama site atau kode..."
                @blur="modalSite.blur()"
                autofocus />
              <div v-if="modalSite.open.value" class="combo-dropdown combo-dropdown-up">
                <div v-for="s in modalSite.filtered.value" :key="s.id_site" class="combo-option"
                  @mousedown.prevent="modalSite.select(s)">
                  <span class="opt-code">{{ s.kode_site }}</span>
                  <span class="opt-name">{{ s.nama_site }}</span>
                  <span v-if="s.nama_pelanggan" class="opt-cust">{{ s.nama_pelanggan }}</span>
                </div>
                <div v-if="!modalSite.filtered.value.length" class="combo-empty">Site tidak ditemukan</div>
              </div>
            </div>
          </div>

          <div class="field">
            <label>IP Address <span class="req">*</span></label>
            <input v-model="provForm.ip_address" placeholder="IP dari PRTG (bisa diubah)" />
          </div>
          <div class="field">
            <label>Jenis Perangkat <span class="req">*</span></label>
            <select v-model="provForm.jenis_perangkat">
              <option v-for="j in JENIS_OPTIONS" :key="j" :value="j">{{ j }}</option>
            </select>
          </div>
          <div class="form-row2">
            <div class="field">
              <label>Merk / Vendor</label>
              <input v-model="provForm.merk" placeholder="MikroTik, Huawei..." />
            </div>
            <div class="field">
              <label>Tipe / Model</label>
              <input v-model="provForm.tipe_model" placeholder="RB4011, MA5671A..." />
            </div>
          </div>

          <div class="field">
            <label>Serial Number</label>
            <div class="sn-row">
              <input v-model="provForm.serial_number" placeholder="S/N untuk lookup aset di gudang" />
              <button class="btn-lookup" @click="lookupAset" :disabled="provAsetLookupLoad || !provForm.serial_number">
                {{ provAsetLookupLoad ? '...' : 'Cari Aset' }}
              </button>
            </div>
          </div>

          <div v-if="provAsetFound !== null" class="aset-result">
            <div v-if="provAsetFound" class="aset-found">
              <span class="aset-icon">📦</span>
              <div>
                <div class="aset-name">{{ provAsetFound.nama_aset }}</div>
                <div class="aset-sub">{{ provAsetFound.merk }} {{ provAsetFound.tipe_model }} — S/N: {{ provAsetFound.serial_number }}</div>
                <div class="aset-sub">Status: {{ provAsetFound.status_aset }}</div>
              </div>
              <label class="link-label"><input type="checkbox" v-model="linkAset" /> Update status → <strong>Terpasang</strong></label>
            </div>
            <div v-else class="aset-notfound">S/N tidak ditemukan di Gudang Aset</div>
          </div>

          <p v-if="provMsg" class="msg err">{{ provMsg }}</p>

          <div class="modal-actions">
            <button class="btn-secondary" @click="provModal = false">Batal</button>
            <button class="btn-submit" @click="submitProvision" :disabled="provSubmitting">
              {{ provSubmitting ? 'Menyimpan...' : '⚡ Provision Sekarang' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1180px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0 0 16px; font-size: 13px; color: #64748b; }

@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:.4 } }

/* ── Status bar ── */
.status-bar { display: flex; align-items: center; gap: 8px; background: #fff; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px; color: #334155; box-shadow: 0 1px 3px rgba(0,0,0,0.07); flex-wrap: wrap; }
.status-text { flex: 1; min-width: 120px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status-dot.ok { background: #22c55e; }
.status-dot.off { background: #ef4444; }
.toggle-btn { padding: 6px 14px; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; background: #fef2f2; color: #dc2626; }
.toggle-btn.paused { background: #f0fdf4; color: #15803d; }
.toggle-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── Tabs ── */
.tabs-wrap { overflow-x: auto; margin-bottom: 16px; -webkit-overflow-scrolling: touch; }
.tabs { display: flex; gap: 4px; border-bottom: 1.5px solid #e2e8f0; min-width: max-content; }
.tab { padding: 10px 16px; background: none; border: none; border-bottom: 2px solid transparent; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; white-space: nowrap; }
.tab.active { color: #1e40af; border-bottom-color: #1e40af; }

/* ── Common ── */
.tab-content { display: flex; flex-direction: column; gap: 16px; }
.card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; }
.card h3 { margin: 0 0 6px; font-size: 15px; color: #0f172a; }
.hint { margin: 0 0 12px; font-size: 12px; color: #94a3b8; }
.loading-state, .loading { padding: 24px; text-align: center; color: #94a3b8; }
.empty { text-align: center; color: #94a3b8; padding: 24px; }
.alert-err { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
.msg { font-size: 13px; color: #15803d; margin: 8px 0 0; }
.msg.err { color: #dc2626; }
.table-wrap { overflow-x: auto; }

/* ── Fields ── */
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; min-width: 200px; flex: 1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input, .field select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }
.field-hint { font-size: 12px; color: #64748b; margin-top: 6px; line-height: 1.5; }

.form-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.form-row2 { display: flex; gap: 12px; flex-wrap: wrap; }
.form-row2 .field { flex: 1; min-width: 150px; }

/* ── Buttons ── */
.btn-submit { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; margin-bottom: 10px; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { padding: 8px 14px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-refresh { padding: 9px 14px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-refresh:disabled { opacity: 0.5; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-map  { padding: 4px 10px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-map-add { padding: 4px 10px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-prov { padding: 5px 12px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-prov:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-prov-sm { padding: 4px 10px; background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-export { padding: 9px 14px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-export:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-lookup { padding: 8px 14px; background: #eff6ff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; color: #1d4ed8; cursor: pointer; white-space: nowrap; }
.btn-lookup:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-row-inline { display: flex; gap: 6px; align-items: center; }

/* ── Tables ── */
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
td { padding: 10px 12px; font-size: 13px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: middle; }
.mono { font-family: 'Consolas', monospace; font-size: 12px; }
.center { text-align: center; }
.ip-cell { color: #1d4ed8; }
.site-name { display: block; font-weight: 600; }
.pelanggan-sub { display: block; font-size: 11px; color: #94a3b8; }

/* ── Badges ── */
.badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge-auto    { background: #eff6ff; color: #1d4ed8; }
.badge-manual  { background: #f0fdf4; color: #15803d; }
.badge-none    { background: #fef2f2; color: #dc2626; }
.badge-site    { background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.badge-nosite  { background: #fef9c3; color: #92400e; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.badge-tiket   { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-decoration: none; }
.badge-tiket:hover { background: #bbf7d0; }
.badge-notiket { background: #ffedd5; color: #9a3412; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.badge-grace   { background: #fef9c3; color: #92400e; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.badge-grace-soon { background: #fed7aa; color: #9a3412; animation: pulse-grace 1s ease-in-out infinite; }
@keyframes pulse-grace { 0%,100% { opacity:1; } 50% { opacity:.6; } }
.prtg-st { display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px; }
.prtg-up { background: #dcfce7; color: #15803d; }
.prtg-dn { background: #fef2f2; color: #dc2626; }
.badge-auto-match { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; background: #ede9fe; color: #6d28d9; }
.section-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; margin-right: 8px; }
.badge-bulk    { background: #dcfce7; color: #15803d; }
.badge-partial { background: #ede9fe; color: #6d28d9; }
.badge-no-map  { background: #f1f5f9; color: #64748b; }

/* ── Monitor tab ── */
.monitor-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.monitor-meta { display: flex; align-items: center; gap: 12px; }
.mon-count { font-size: 36px; font-weight: 800; line-height: 1; }
.count-red   { color: #dc2626; }
.count-green { color: #16a34a; }
.mon-label { font-size: 15px; font-weight: 600; color: #0f172a; }
.mon-time  { font-size: 12px; color: #94a3b8; }
.empty-monitor { text-align: center; padding: 60px 20px; }
.empty-icon  { font-size: 48px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 700; color: #16a34a; margin-bottom: 6px; }
.empty-sub   { font-size: 13px; color: #64748b; }
.monitor-list { display: flex; flex-direction: column; gap: 10px; }
.mon-card { background: #fff; border-radius: 12px; border: 1.5px solid #fee2e2; box-shadow: 0 1px 3px rgba(0,0,0,0.06); overflow: hidden; }
.mon-card-top { display: flex; align-items: flex-start; gap: 12px; padding: 14px 18px 10px; flex-wrap: wrap; }
.mon-device-name { font-size: 14px; font-weight: 700; color: #0f172a; flex: 1; min-width: 180px; }
.mon-badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mon-sensors { padding: 6px 18px 12px; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #fef2f2; background: #fff9f9; }
.mon-sensor-row { display: flex; align-items: center; gap: 8px; font-size: 12px; flex-wrap: wrap; }
.sensor-dot    { width: 7px; height: 7px; border-radius: 50%; background: #ef4444; flex-shrink: 0; }
.sensor-name   { font-weight: 600; color: #334155; min-width: 120px; }
.sensor-status { color: #dc2626; font-weight: 700; font-size: 11px; background: #fee2e2; padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
.sensor-msg    { color: #64748b; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 360px; }

/* ── Mapping tab ── */
.unmatched-list { display: flex; gap: 8px; flex-wrap: wrap; }
.unmatched-chip { padding: 6px 12px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 16px; font-size: 12px; cursor: pointer; }
.unmatched-chip:hover { background: #fef3c7; }

/* ── Audit toolbar ── */
.audit-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.search-input { flex: 1; min-width: 180px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.search-input:focus { border-color: #3b82f6; background: #fff; }
.chk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; white-space: nowrap; }
.result-count { margin: 0 0 10px; font-size: 12px; color: #94a3b8; }

/* ── Pagination ── */
.pagination { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px 0 4px; flex-wrap: wrap; }
.page-btn { padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; }
.page-jump { width: 48px; padding: 5px 6px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; text-align: center; outline: none; }
.page-jump:focus { border-color: #3b82f6; }

/* ── Graph tab ── */
.graph-toolbar { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 4px; }
.sensor-block { border-top: 1px solid #f1f5f9; }
.sensor-block:first-of-type { border-top: none; }
.sensor-row { display: flex; align-items: center; gap: 10px; padding: 12px 4px; cursor: pointer; }
.sensor-row:hover { background: #f8fafc; border-radius: 6px; }
.sensor-name   { flex: 1; font-size: 14px; font-weight: 600; color: #0f172a; }
.sensor-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
.st-up   { background: #f0fdf4; color: #15803d; }
.st-down { background: #fef2f2; color: #dc2626; }
.sensor-toggle { color: #94a3b8; font-size: 12px; }
.sensor-detail { padding: 0 4px 16px; }
.graph-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin: 0 0 6px; }
.prtg-graph-img { width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 100%; }
.device-header { display: flex; align-items: center; gap: 10px; margin: 12px 0 4px; }
.device-label  { font-size: 14px; font-weight: 700; color: #0f172a; }
.sensor-count  { font-size: 12px; color: #94a3b8; }

/* ── Provision tab ── */
.prov-toolbar-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.search-prov { flex: 1; min-width: 180px; padding: 9px 14px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.search-prov:focus { border-color: #3b82f6; background: #fff; }
.empty-prov { text-align: center; padding: 32px; color: #94a3b8; font-size: 14px; }

/* Stats banner */
.prov-stats { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.stat-item { flex: 1; min-width: 100px; background: #fff; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); text-align: center; border-top: 3px solid #e2e8f0; }
.stat-n { font-size: 26px; font-weight: 800; line-height: 1; margin-bottom: 3px; }
.stat-l { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; }
.stat-total    { border-top-color: #94a3b8; }
.stat-total .stat-n { color: #334155; }
.stat-done     { border-top-color: #22c55e; }
.stat-done .stat-n { color: #15803d; }
.stat-auto     { border-top-color: #3b82f6; }
.stat-auto .stat-n { color: #1e40af; }
.stat-partial  { border-top-color: #a855f7; }
.stat-partial .stat-n { color: #6d28d9; }
.stat-unmatched { border-top-color: #f97316; }
.stat-unmatched .stat-n { color: #c2410c; }

.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.section-sub  { font-size: 12px; font-weight: 400; color: #64748b; }
.section-bulk { border-left: 3px solid #22c55e; }
.bulk-spinner { font-size: 18px; animation: spin 1s linear infinite; display: inline-block; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.bulk-result { margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
.br-row  { padding: 7px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; }
.br-ok   { background: #f0fdf4; color: #15803d; }
.br-skip { background: #fef9c3; color: #a16207; }
.br-err  { background: #fef2f2; color: #dc2626; }

.prov-table { width: 100%; border-collapse: collapse; }
.prov-table th { padding: 9px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; background: #f8fafc; text-align: left; white-space: nowrap; }
.prov-table td { padding: 9px 12px; font-size: 13px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: middle; }
.row-done td { background: #f0fdf4; }
.done-section  { border: none; box-shadow: none; background: #f8fafc; }
.done-summary  { font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; padding: 12px 24px; }

/* ── Site Combobox ── */
.site-combo { position: relative; }
.site-combo-val {
  display: flex; align-items: center; gap: 6px; padding: 9px 12px;
  border: 1.5px solid #e2e8f0; border-radius: 8px; cursor: pointer;
  background: #f8fafc; min-height: 42px; font-size: 14px; color: #0f172a;
}
.site-combo-val:hover { border-color: #94a3b8; }
.site-combo-val.has-val { border-color: #3b82f6; background: #eff6ff; }
.combo-ph { color: #94a3b8; font-size: 13px; flex: 1; }
.combo-selected-text { flex: 1; font-size: 13px; font-weight: 600; color: #1e40af; }
.combo-clear { margin-left: auto; font-size: 12px; color: #94a3b8; padding: 2px 4px; border-radius: 4px; line-height: 1; }
.combo-clear:hover { background: #fee2e2; color: #dc2626; }
.combo-input {
  width: 100%; padding: 9px 12px; border: 1.5px solid #3b82f6;
  border-radius: 8px; font-size: 14px; outline: none; background: #fff;
  color: #0f172a; margin-top: 4px; box-sizing: border-box;
}
.combo-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 200;
  background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12); max-height: 240px;
  overflow-y: auto; margin-top: 4px;
}
.combo-dropdown-up { top: auto; bottom: 100%; margin-top: 0; margin-bottom: 4px; }
.combo-option { display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; }
.combo-option:hover { background: #eff6ff; }
.opt-code { font-size: 11px; font-weight: 700; color: #1e40af; background: #dbeafe; padding: 1px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0; }
.opt-name { font-size: 13px; color: #0f172a; flex: 1; }
.opt-cust { font-size: 11px; color: #94a3b8; white-space: nowrap; }
.combo-empty { padding: 12px 14px; text-align: center; color: #94a3b8; font-size: 13px; }

.site-combo-sm .site-combo-val { min-height: 36px; padding: 6px 10px; font-size: 13px; }
.site-combo-sm .combo-input { font-size: 13px; }

/* ── Durasi preview ── */
.durasi-preview { margin: 16px 0; }
.durasi-flow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.dp-step { padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; text-align: center; }
.dp-warn   { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.dp-ok     { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
.dp-silent { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
.dp-arrow  { font-size: 12px; color: #94a3b8; white-space: nowrap; font-weight: 600; }
.dp-split  { display: flex; flex-direction: column; gap: 6px; }
.dp-arrow-split { display: flex; gap: 20px; flex-wrap: wrap; }
.dp-arrow-split > div { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.dp-arrow-split .dp-arrow { white-space: normal; text-align: center; max-width: 160px; }
.dp-step small { font-weight: 400; display: block; margin-top: 2px; }

/* ── Modal ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; z-index: 999; padding: 16px; }
.modal-box { background: #fff; border-radius: 14px; padding: 24px; width: 540px; max-width: 100%; box-shadow: 0 8px 40px rgba(0,0,0,0.15); max-height: 90vh; overflow-y: auto; }
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.modal-head h4 { margin: 0; font-size: 16px; color: #0f172a; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-info { background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
.info-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #374151; flex-wrap: wrap; gap: 4px; }
.auto-match-note { background: #faf5ff; border-radius: 6px; padding: 4px 8px; }
.modal-form { display: flex; flex-direction: column; gap: 8px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.modal-actions .btn-submit { margin-bottom: 0; }
.req { color: #dc2626; }
.sn-row { display: flex; gap: 8px; }
.sn-row input { flex: 1; }
.aset-result { margin: 4px 0 8px; }
.aset-found { display: flex; align-items: flex-start; gap: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 14px; flex-wrap: wrap; }
.aset-icon { font-size: 20px; }
.aset-name { font-size: 13px; font-weight: 700; color: #0f172a; }
.aset-sub  { font-size: 12px; color: #64748b; }
.link-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; margin-top: 6px; cursor: pointer; }
.aset-notfound { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #c2410c; }

/* ── Responsive ── */
@media (max-width: 640px) {
  .page { padding: 14px 16px; }
  .card { padding: 14px 16px; }
  .tabs { gap: 2px; }
  .tab { padding: 9px 12px; font-size: 13px; }
  .prov-stats { gap: 8px; }
  .stat-item { min-width: 80px; padding: 10px 12px; }
  .stat-n { font-size: 22px; }
  .audit-toolbar { flex-direction: column; align-items: stretch; }
  .search-input { min-width: unset; }
  .mon-card-top { gap: 8px; }
  .mon-device-name { font-size: 13px; }
  .form-row { flex-direction: column; }
  .form-row .btn-submit { width: 100%; }
  .prov-toolbar-bar { flex-direction: column; align-items: stretch; }
  .search-prov { min-width: unset; }
  .btn-export, .btn-refresh { width: 100%; }
  .modal-box { padding: 16px; border-radius: 12px; }
  .modal-actions { flex-direction: column-reverse; }
  .modal-actions button { width: 100%; }
  .sn-row { flex-direction: column; }
  .sn-row input, .sn-row .btn-lookup { width: 100%; }
  .prov-table td, .prov-table th { padding: 8px; }
  .prov-table .mono { font-size: 11px; }
  .combo-dropdown { max-height: 180px; }
  .btn-row-inline { flex-direction: column; align-items: stretch; }
  .btn-row-inline button { width: 100%; text-align: center; }
  .graph-toolbar { flex-direction: column; }
  .graph-toolbar .field { min-width: unset !important; width: 100%; }
}

@media (max-width: 900px) {
  .page { max-width: 100%; }
  .prov-stats .stat-item { min-width: 80px; }
  .mon-sensor-row { flex-wrap: wrap; }
  .sensor-msg { max-width: 100%; }
}
</style>
