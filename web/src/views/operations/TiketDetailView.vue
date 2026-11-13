<script setup lang="ts">
// Detail tiket gangguan — hero status live, stepper status, tab Ringkasan / Monitoring / Lapangan / Aktivitas,
// sidebar site & kontak, catatan cepat, form "Tutup gangguan" (status + jenis + root cause sekaligus).
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOperationsStore } from '@/stores/operations'
import { useProyekStore } from '@/stores/proyek'
import { useAuthStore } from '@/stores/auth'
import { printLaporanTiket } from '@/composables/usePrint'
import { fmtDateTime as fmtDt, statusLabel, escapeHtml } from '@/composables/useFormat'
import { confirmDialog, alertError, toast, toastGalat } from '@/composables/useDialog'
import { useFilterUrl } from '@/composables/useFilterUrl'
import { SERI } from '@/components/grafik/warna'
import api from '@/services/api'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const router = useRouter()
async function bukaDiskusi() {
  try {
    const r: any = await api.post('/chat/diskusi', { jenis: 'tiket', id: t.value.id_ticket })
    router.push(`/chat/${r.data?.data?.id_ruang ?? r.data?.id_ruang}`)
  } catch (e) { toastGalat(e) }
}
const route = useRoute()
const ops = useOperationsStore()
const proyek = useProyekStore()
const auth = useAuthStore()
const id = Number(route.params.id)
const t = computed<any>(() => ops.current)

// ── Konstanta ────────────────────────────────────────────────────────────────
const AKTIF = ['Open', 'In_Progress', 'Pending_Customer']
const LANGKAH = [
  { s: 'Open', label: 'Open', ikon: '🆕' },
  { s: 'In_Progress', label: 'Dikerjakan', ikon: '🔧' },
  { s: 'Pending_Customer', label: 'Menunggu pelanggan', ikon: '⏳' },
  { s: 'Resolved', label: 'Selesai', ikon: '✅' },
  { s: 'Closed', label: 'Ditutup', ikon: '🔒' },
]
const STATUS_WARNA: Record<string, string> = { Open: '#2563eb', In_Progress: '#d97706', Pending_Customer: '#7c3aed', Resolved: '#16a34a', Closed: '#64748b' }
const PRIO: Record<string, { ikon: string; warna: string; sla: number }> = {
  Critical: { ikon: '🔥', warna: '#dc2626', sla: 4 }, High: { ikon: '⚠️', warna: '#ea580c', sla: 8 },
  Medium: { ikon: '🔷', warna: '#2563eb', sla: 24 }, Low: { ikon: '🌿', warna: '#64748b', sla: 72 },
}
const SUMBER_IKON: Record<string, string> = { PRTG: '📡', NOCaaS: '🛰️', Internal: '🏢', WhatsApp: '💬', WA: '💬', Email: '✉️', Telepon: '📞', Portal: '🌐', UptimeKuma: '📈' }
const WO_STATUS_COLOR: Record<string, string> = { Open: '#64748b', Dispatch: '#2563eb', 'On-Site': '#d97706', Selesai: '#16a34a', Ditunda: '#ea580c', Dibatalkan: '#dc2626' }
const JENIS_WO = ['Troubleshoot', 'Maintenance', 'Instalasi', 'Survey', 'Upgrade']
const CATATAN_CEPAT = ['📞 Sudah menghubungi pelanggan', '🔄 Perangkat di-restart', '⏳ Menunggu konfirmasi pelanggan', '🏢 Eskalasi ke ISP / vendor', '🚗 Teknisi dalam perjalanan', '✅ Koneksi kembali normal']
const TAB = [
  { k: 'ringkasan', label: 'Ringkasan', ikon: '🧭' },
  { k: 'monitoring', label: 'Monitoring', ikon: '📡' },
  { k: 'lapangan', label: 'Lapangan', ikon: '🗺️' },
  { k: 'aktivitas', label: 'Aktivitas', ikon: '💬' },
]
const tab = ref('ringkasan')
useFilterUrl({ tab })

// ── Jam berjalan ─────────────────────────────────────────────────────────────
const sekarang = ref(Date.now())
let tJam: ReturnType<typeof setInterval> | undefined
function durasi(menit: number) {
  if (menit < 1) return 'baru saja'
  const h = Math.floor(menit / 1440), j = Math.floor((menit % 1440) / 60), m = Math.floor(menit % 60)
  return h ? `${h} hari ${j} jam` : j ? `${j} jam ${m} mnt` : `${m} menit`
}
const aktif = computed(() => !!t.value && AKTIF.includes(t.value.status_tiket))
const umurMenit = computed(() => {
  if (!t.value) return 0
  const akhir = !aktif.value && t.value.tgl_resolved ? +new Date(t.value.tgl_resolved) : sekarang.value
  return (akhir - +new Date(t.value.tgl_open)) / 60000
})
const sla = computed(() => {
  const x = t.value
  if (!x) return { pct: 0, label: '—', nada: 'none', sub: '' }
  if (!aktif.value) return x.sla_breached
    ? { pct: 100, label: 'SLA terlewati', nada: 'telat', sub: x.sla_due ? `target ${fmtDt(x.sla_due)}` : '' }
    : { pct: 100, label: 'SLA terpenuhi', nada: 'selesai', sub: x.sla_due ? `target ${fmtDt(x.sla_due)}` : '' }
  if (!x.sla_due) return { pct: 0, label: 'Tanpa SLA', nada: 'none', sub: '' }
  const mulai = +new Date(x.tgl_open), due = +new Date(x.sla_due)
  const pct = Math.max(0, ((sekarang.value - mulai) / Math.max(1, due - mulai)) * 100)
  const sisa = (due - sekarang.value) / 60000
  if (sisa <= 0) return { pct: 100, label: `Lewat ${durasi(-sisa)}`, nada: 'lewat', sub: `target ${fmtDt(x.sla_due)}` }
  return { pct, label: `Sisa ${durasi(sisa)}`, nada: pct >= 75 ? 'waspada' : 'aman', sub: `target ${fmtDt(x.sla_due)}` }
})
const inisial = (n?: string) => (n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
const warnaNama = (n?: string) => SERI[[...(n || '?')].reduce((s, c) => s + c.charCodeAt(0), 0) % SERI.length]
const waLink = (no?: string | null) => (no ? `https://wa.me/${String(no).replace(/\D/g, '').replace(/^0/, '62')}` : '')
const namaPic = computed(() => t.value?.teknisi?.nama_lengkap ?? t.value?.kontak_teknisi?.nama ?? null)
const indeksLangkah = computed(() => LANGKAH.findIndex((l) => l.s === t.value?.status_tiket))

// ── Foto ─────────────────────────────────────────────────────────────────────
const fotos = ref<any[]>([])
const preview = ref<{ list: any[]; i: number } | null>(null)
async function fetchFotos() {
  try { const { data } = await api.get(`/operations/${id}/fotos`); fotos.value = data.data ?? [] } catch { /* opsional */ }
}
const fotosOf = (stage: string) => fotos.value.filter((f) => f.stage === stage)
const stageLabel = (s: string) => (s === 'before' ? 'Sebelum' : s === 'proses' ? 'Proses' : s === 'after' ? 'Sesudah' : s)
function bukaFoto(list: any[], f: any) { preview.value = { list, i: Math.max(0, list.indexOf(f)) } }
function geserFoto(d: number) {
  if (!preview.value) return
  const n = preview.value.list.length
  preview.value = { ...preview.value, i: (preview.value.i + d + n) % n }
}

// ── Aktivitas & timeline ─────────────────────────────────────────────────────
const activityFeed = computed(() => {
  const items: any[] = []
  for (const log of t.value?.logs || []) items.push({ kind: 'log', time: log.created_at, log })
  for (const stage of ['before', 'proses', 'after'] as const) {
    const sf = fotosOf(stage)
    if (sf.length) items.push({ kind: 'foto', time: sf[0].created_at, stage, fotos: sf, label: `Foto ${stageLabel(stage).toLowerCase()} pekerjaan` })
  }
  return items.sort((a, b) => +new Date(b.time) - +new Date(a.time))
})
const timelineEvents = computed(() => {
  const x = t.value
  if (!x) return []
  const seen = new Set<string>()
  const events: any[] = []
  const push = (e: any) => { const k = `${e.type}:${e.time}`; if (!seen.has(k)) { seen.add(k); events.push(e) } }
  if (x.tgl_sensor_down) push({ type: 'down', time: x.tgl_sensor_down, title: 'Perangkat terdeteksi down', icon: '🔻', color: '#dc2626' })
  push({ type: 'open', time: x.tgl_open, title: 'Tiket dibuka', desc: x.judul_tiket, icon: '📋', color: '#2563eb' })
  if (x.tgl_berangkat) push({ type: 'berangkat', time: x.tgl_berangkat, title: 'Teknisi berangkat', desc: x.teknisi?.nama_lengkap, gps: teknisiLokasi.value, icon: '🚗', color: '#d97706' })
  if (x.tgl_sampai) push({ type: 'sampai', time: x.tgl_sampai, title: 'Tiba di lokasi', desc: x.site?.nama_site, icon: '📍', color: '#7c3aed' })
  for (const it of activityFeed.value) {
    if (it.kind === 'log') push({ type: 'log', time: it.time, title: it.log.catatan || statusLabel(it.log.status_ke), statusKe: it.log.status_ke, by: it.log.user?.karyawan?.nama_lengkap || 'Sistem', icon: '💬', color: '#64748b' })
    else push({ type: 'foto', time: it.time, title: it.label, fotos: it.fotos, icon: '📷', color: '#16a34a' })
  }
  if (x.tgl_resolved) push({ type: 'resolved', time: x.tgl_resolved, title: 'Tiket diselesaikan', icon: '✅', color: '#16a34a' })
  return events.sort((a, b) => +new Date(a.time) - +new Date(b.time))
})
const showTimeline = ref(false)

// ── NOCaaS ───────────────────────────────────────────────────────────────────
const noc = ref<any>(null)
const nocLoading = ref(false)
const nocError = ref('')
const nocKejadian = ref<Record<string, any[] | 'memuat' | string>>({})
const NOC_WARNA: Record<string, string> = { online: '#16a34a', partial: '#d97706', internet_ok: '#7c3aed', macet: '#ea580c', offline: '#dc2626', tidak_ada: '#64748b' }
const NOC_KEJADIAN: Record<string, string> = { tunnel_up: 'VPN tersambung', tunnel_down: 'VPN putus', link_up: 'Port naik', link_down: 'Port turun', reboot: 'Reboot' }
async function fetchNoc() {
  nocLoading.value = true; nocError.value = ''
  try { const { data } = await api.get(`/nocaas/tiket/${id}`); noc.value = data.data }
  catch (e: any) { nocError.value = e?.response?.data?.message || 'Gagal memuat status NOCaaS' }
  finally { nocLoading.value = false }
}
async function toggleNocKejadian(key: string) {
  if (nocKejadian.value[key]) { delete nocKejadian.value[key]; return }
  nocKejadian.value[key] = 'memuat'
  try { const { data } = await api.get(`/nocaas/router/${encodeURIComponent(key)}/kejadian`, { params: { jam: 72 } }); nocKejadian.value[key] = data.data }
  catch (e: any) { nocKejadian.value[key] = e?.response?.data?.message || 'Gagal memuat riwayat' }
}
const tunnelKelas = (sesi: boolean | null, p?: { diterima: number } | null) => (!sesi ? 'off' : p && p.diterima === 0 ? 'macet' : 'on')
const tunnelJudul = (sesi: boolean | null, p?: { diterima: number } | null) => (!sesi ? 'Sesi VPN putus' : p && p.diterima === 0 ? 'Sesi VPN tersambung, tapi tidak bisa di-ping dari ERP' : 'Sesi VPN tersambung')
function pingTeks(p: { terkirim: number; diterima: number; rtt_ms: number | null }) {
  if (!p.diterima) return 'ping gagal'
  const hilang = Math.round((1 - p.diterima / p.terkirim) * 100)
  return `ping ${p.rtt_ms ?? '?'} ms${hilang ? ` · hilang ${hilang}%` : ''}`
}
function nocSejak(d?: string | null) {
  if (!d) return ''
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  return m < 1 ? 'baru saja' : m < 60 ? `${m} menit` : m < 2880 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${Math.floor(m / 1440)} hari`
}

// ── PRTG ─────────────────────────────────────────────────────────────────────
const prtgDeviceName = ref('')
const prtgSensors = ref<any[]>([])
const prtgLoading = ref(false)
const prtgError = ref('')
const selectedSensorId = ref<number | null>(null)
const selectedGraphId = ref(0)
const graphBlobUrl = ref('')
const graphLoading = ref(false)
const graphLoadError = ref(false)
let graphRefreshTimer: ReturnType<typeof setInterval> | null = null
const prtgEvents = ref<any>(null)
async function fetchPrtgTicketEvents() {
  try { const { data } = await api.get(`/prtg/ticket/${id}/events`); prtgEvents.value = data.data ?? null } catch { /* opsional */ }
}
const downtimeInfo = computed(() => {
  const x = t.value
  if (!x || !['PRTG', 'NOCaaS'].includes(x.sumber_tiket)) return null
  const waktuDown = prtgEvents.value?.waktu_down ?? x.tgl_sensor_down ?? null
  if (!waktuDown) return null
  const waktuUp = prtgEvents.value?.waktu_up ?? x.tgl_resolved ?? null
  const sudahUp = !!waktuUp && ['Resolved', 'Closed'].includes(x.status_tiket ?? '')
  const menit = ((sudahUp ? +new Date(waktuUp) : sekarang.value) - +new Date(waktuDown)) / 60000
  return { waktu_down: waktuDown, waktu_up: waktuUp, sudah_up: sudahUp, durasi_label: durasi(menit), pesan_down: prtgEvents.value?.pesan_down ?? null }
})
async function fetchPrtgSensors() {
  const siteId = t.value?.site?.id_site
  if (!siteId) return
  prtgLoading.value = true; prtgError.value = ''
  try {
    const { data } = await api.get(`/prtg/site/${siteId}/sensors`)
    const results: any[] = Array.isArray(data.data) ? data.data : data.data ? [data.data] : []
    prtgDeviceName.value = results.map((r: any) => r.device_name).filter(Boolean).join(', ')
    prtgSensors.value = results.flatMap((r: any) => r.sensors || [])
    if (prtgSensors.value.length && !selectedSensorId.value) {
      const ping = prtgSensors.value.find((s: any) => s.sensor?.toLowerCase().includes('ping'))
      selectedSensorId.value = ping?.objid ?? prtgSensors.value[0]?.objid
    }
    if (selectedSensorId.value && tab.value === 'monitoring') loadGraphBlob(selectedSensorId.value, selectedGraphId.value)
  } catch (e: any) { prtgError.value = e?.response?.data?.message || 'Gagal memuat sensor' }
  finally { prtgLoading.value = false }
}
const prtgStatusColor = (raw: number) => ({ 3: '#16a34a', 4: '#f59e0b', 5: '#ef4444', 13: '#f97316', 14: '#f97316' } as Record<number, string>)[raw] ?? '#64748b'
const prtgStatusLabel = (raw: number) => ({ 3: 'Up', 4: 'Warning', 5: 'Down', 13: 'Down (Ack)', 14: 'Partial Down' } as Record<number, string>)[raw] ?? '?'
const sensorDown = computed(() => prtgSensors.value.filter((s) => [5, 13, 14].includes(s.status_raw)).length)
// Nomor urut: grafik sensor/rentang yang dipilih belakangan tidak boleh tertimpa jawaban lama
let urutGrafik = 0
async function loadGraphBlob(sensorId: number, graphId: number, latar = false) {
  if (!sensorId) return
  const no = ++urutGrafik
  if (!latar) {
    graphLoading.value = true
    if (graphBlobUrl.value) { URL.revokeObjectURL(graphBlobUrl.value); graphBlobUrl.value = '' }
  }
  try {
    const resp = await api.get(`/prtg/sensor/${sensorId}/graph.png`, { params: { graphid: graphId }, responseType: 'blob', timeout: 20000, senyap: latar })
    if (unmounted || no !== urutGrafik) return
    if (graphBlobUrl.value) URL.revokeObjectURL(graphBlobUrl.value)
    graphBlobUrl.value = URL.createObjectURL(resp.data)
    graphLoadError.value = false
  } catch { if (no === urutGrafik && (!latar || !graphBlobUrl.value)) graphLoadError.value = true }
  finally { if (no === urutGrafik) graphLoading.value = false }
}
function pilihSensor(s: any) { selectedSensorId.value = s.objid; loadGraphBlob(s.objid, selectedGraphId.value) }

// ── Peta ─────────────────────────────────────────────────────────────────────
const mapContainer = ref<HTMLDivElement | null>(null)
let mapInstance: L.Map | null = null
let teknisiMarker: L.Marker | null = null
let polyline: L.Polyline | null = null
const teknisiLokasi = ref<any>(null)
let lokasiInterval: ReturnType<typeof setInterval> | null = null
const ikon = (warna: string, emoji: string) => L.divIcon({ className: 'td-pin', html: `<span style="--w:${warna}">${emoji}</span>`, iconSize: [34, 34], iconAnchor: [17, 30] })
function parseLatLng(k?: string | null): [number, number] | null {
  if (!k) return null
  const p = k.split(',').map((s) => parseFloat(s.trim()))
  return p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0]!, p[1]!] : null
}
const siteLatLng = computed(() => parseLatLng(t.value?.site?.koordinat_gps))
const jarakKm = computed(() => {
  const a = siteLatLng.value, l = teknisiLokasi.value
  if (!a || !l) return null
  return L.latLng(a).distanceTo(L.latLng(Number(l.latitude), Number(l.longitude))) / 1000
})
function initMap() {
  if (!mapContainer.value || mapInstance) return
  const ll = siteLatLng.value
  mapInstance = L.map(mapContainer.value, { zoomControl: true, scrollWheelZoom: false }).setView(ll ?? [-6.2, 106.8], ll ? 15 : 10)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapInstance)
  if (ll) L.marker(ll, { icon: ikon('#2563eb', '📍') }).addTo(mapInstance).bindPopup(`<b>${escapeHtml(t.value?.site?.nama_site)}</b><br>${escapeHtml(t.value?.site?.kota)}`)
  if (teknisiLokasi.value) updateTeknisiMarker(teknisiLokasi.value.latitude, teknisiLokasi.value.longitude)
}
async function fetchTeknisiLokasi() {
  if (!t.value?.teknisi) return
  try {
    const { data } = await api.get('/mobile/lokasi/all', { senyap: true })
    const list: any[] = data.data ?? data
    const match = list.find((l: any) => l.id_karyawan === t.value!.teknisi!.id_karyawan)
    if (match) { teknisiLokasi.value = { ...match, ...match.karyawan }; updateTeknisiMarker(match.latitude, match.longitude) }
  } catch { /* opsional */ }
}
function updateTeknisiMarker(lat: number, lng: number) {
  if (!mapInstance) return
  const latlng: L.LatLngExpression = [Number(lat), Number(lng)]
  if (teknisiMarker) teknisiMarker.setLatLng(latlng)
  else teknisiMarker = L.marker(latlng, { icon: ikon('#16a34a', '🛵') }).addTo(mapInstance).bindPopup(`<b>${escapeHtml(t.value?.teknisi?.nama_lengkap)}</b><br>Lokasi teknisi`)
  const s = siteLatLng.value
  if (s) {
    if (polyline) polyline.setLatLngs([latlng, s])
    else polyline = L.polyline([latlng, s], { color: '#16a34a', weight: 3, dashArray: '6 6', opacity: 0.7 }).addTo(mapInstance)
    mapInstance.fitBounds(L.latLngBounds([latlng, s]).pad(0.25))
  } else mapInstance.setView(latlng, 14)
}
function destroyMap() {
  if (lokasiInterval) clearInterval(lokasiInterval)
  if (mapInstance) { mapInstance.remove(); mapInstance = null }
  teknisiMarker = null; polyline = null
}
watch(tab, async (v) => {
  if (v === 'lapangan') { await nextTick(); if (!mapInstance) initMap(); setTimeout(() => mapInstance?.invalidateSize(), 60) }
  if (v === 'monitoring' && selectedSensorId.value && !graphBlobUrl.value && !graphLoading.value) loadGraphBlob(selectedSensorId.value, selectedGraphId.value)
})

// ── Muat data ────────────────────────────────────────────────────────────────
const jenisGangguanList = ref<string[]>([])
async function fetchJenisGangguan() {
  try { const r = await api.get('/master/jenis-gangguan', { params: { is_aktif: 'true' } }); jenisGangguanList.value = (r.data.data as any[]).map((j) => j.nama) } catch { /* opsional */ }
}
// Muat ulang setelah aksi: bila gagal, tiket yang sedang tampil dipertahankan (bukan diganti layar galat)
async function muatUlang() {
  try { const { data } = await api.get(`/operations/${id}`); ops.current = data.data }
  catch (e) { toastGalat(e, 'Gagal memuat ulang data tiket') }
}
let unmounted = false
async function muatAwal() {
  await Promise.all([ops.fetchOne(id), ops.fetchTeknisiList(), ops.fetchKontakTeknisiList(), fetchJenisGangguan()])
  if (unmounted || !t.value) return
  fetchFotos()
  fetchTeknisiLokasi()
  if (lokasiInterval) clearInterval(lokasiInterval)
  lokasiInterval = setInterval(fetchTeknisiLokasi, 15000)
  await nextTick()
  if (tab.value === 'lapangan') initMap()
  await Promise.all([fetchPrtgSensors(), fetchPrtgTicketEvents(), fetchNoc()])
  if (unmounted) return
  if (graphRefreshTimer) clearInterval(graphRefreshTimer)
  graphRefreshTimer = setInterval(() => { if (tab.value === 'monitoring' && selectedGraphId.value === 0 && selectedSensorId.value) loadGraphBlob(selectedSensorId.value, 0, true) }, 60_000)
}
onMounted(() => {
  ops.current = null
  window.addEventListener('keydown', tombol)
  tJam = setInterval(() => { sekarang.value = Date.now() }, 15_000)
  muatAwal()
})
onUnmounted(() => {
  unmounted = true
  destroyMap()
  clearInterval(tJam)
  if (graphRefreshTimer) clearInterval(graphRefreshTimer)
  if (graphBlobUrl.value) URL.revokeObjectURL(graphBlobUrl.value)
  window.removeEventListener('keydown', tombol)
})

// ── Aksi status ──────────────────────────────────────────────────────────────
const sibuk = ref(false)
async function keStatus(s: string) {
  const x = t.value
  if (!x || x.status_tiket === s || sibuk.value) return
  if (s === 'Resolved' || (s === 'Closed' && x.status_tiket !== 'Resolved')) return bukaTutup(s)
  if (!(await confirmDialog({ title: `Ubah status ke "${statusLabel(s)}"?`, message: 'Pelanggan menerima notifikasi WhatsApp perubahan status.', confirmLabel: statusLabel(s) }))) return
  sibuk.value = true
  try { await ops.update(id, { status_tiket: s }); await muatUlang(); toast(`Status → ${statusLabel(s)}`) }
  catch (e) { alertError(e, 'Gagal mengubah status') }
  finally { sibuk.value = false }
}
async function handleTangani() {
  if (!auth.user?.id_karyawan) return alertError(null, 'Akun Anda belum terhubung ke data karyawan')
  if (sibuk.value) return
  sibuk.value = true
  try {
    await ops.update(id, { id_teknisi_pic: auth.user.id_karyawan, ...(t.value?.status_tiket === 'Open' ? { status_tiket: 'In_Progress' } : {}) })
    await muatUlang(); toast('Tiket sekarang milik Anda 💪')
    fetchTeknisiLokasi()
  } catch (e) { alertError(e, 'Gagal menangani tiket') }
  finally { sibuk.value = false }
}

// Tutup gangguan: status + jenis + root cause + catatan sekaligus
const tutup = ref({ buka: false, status: 'Resolved', jenis: '', root_cause: '', catatan: '', simpan: false })
function bukaTutup(s = 'Resolved') {
  tutup.value = { buka: true, status: s, jenis: t.value?.jenis_gangguan || '', root_cause: t.value?.root_cause || '', catatan: '', simpan: false }
}
async function simpanTutup() {
  if (tutup.value.simpan) return
  if (!tutup.value.root_cause.trim()) return alertError(null, 'Isi root cause / tindakan perbaikan dulu — penting untuk laporan RCA')
  tutup.value.simpan = true
  try {
    await ops.update(id, { status_tiket: tutup.value.status, root_cause: tutup.value.root_cause.trim(), ...(tutup.value.jenis ? { jenis_gangguan: tutup.value.jenis } : {}) })
    // Tiket sudah tertutup; kegagalan menyimpan catatan tambahan tidak boleh dilaporkan sebagai "gagal menutup"
    let logGagal = false
    if (tutup.value.catatan.trim()) {
      try { await ops.addLog({ id_ticket: id, catatan: tutup.value.catatan.trim() }) } catch (e) { logGagal = true; toastGalat(e, 'Tiket ditutup, tetapi catatan tambahan gagal disimpan') }
    }
    await muatUlang()
    tutup.value.buka = false
    if (!logGagal) toast('🎉 Gangguan ditutup — kerja bagus!')
  } catch (e) { alertError(e, 'Gagal menutup tiket') }
  finally { tutup.value.simpan = false }
}

// ── Catatan cepat (composer) ─────────────────────────────────────────────────
const catatan = ref('')
const catatanStatus = ref('')
const kirimLog = ref(false)
const inputCatatan = ref<HTMLTextAreaElement | null>(null)
async function kirimCatatan() {
  if (!catatan.value.trim() && !catatanStatus.value) return
  if (kirimLog.value) return
  if (catatanStatus.value === 'Resolved') { bukaTutup('Resolved'); tutup.value.catatan = catatan.value; return }
  kirimLog.value = true
  try {
    await ops.addLog({ id_ticket: id, status_ke: catatanStatus.value || undefined, catatan: catatan.value.trim() || undefined })
    catatan.value = ''; catatanStatus.value = ''
    await muatUlang(); toast('Catatan ditambahkan', 'success', 2500)
  } catch (e) { alertError(e, 'Gagal menambah catatan') }
  finally { kirimLog.value = false }
}

// ── Edit ─────────────────────────────────────────────────────────────────────
const edit = ref<any>({ buka: false })
const editSimpan = ref(false)
function openEdit() {
  const x = t.value!
  const tipe = x.kontak_teknisi ? 'vendor' : 'internal'
  edit.value = {
    buka: true, judul_tiket: x.judul_tiket, deskripsi_masalah: x.deskripsi_masalah || '', prioritas: x.prioritas, tipe_assign: tipe,
    id_teknisi_pic: tipe === 'internal' ? x.teknisi?.id_karyawan || 0 : 0, id_kontak_teknisi: tipe === 'vendor' ? x.kontak_teknisi?.id_kontak || 0 : 0,
    jenis_gangguan: x.jenis_gangguan || '', root_cause: x.root_cause || '',
  }
}
async function simpanEdit() {
  if (editSimpan.value) return
  if (!String(edit.value.judul_tiket ?? '').trim()) return alertError(null, 'Judul tiket wajib diisi')
  editSimpan.value = true
  try {
    const e = edit.value
    const payload: any = { judul_tiket: e.judul_tiket.trim(), deskripsi_masalah: e.deskripsi_masalah, prioritas: e.prioritas, jenis_gangguan: e.jenis_gangguan || undefined, root_cause: e.root_cause || undefined }
    if (e.tipe_assign === 'internal') payload.id_teknisi_pic = e.id_teknisi_pic || null
    else payload.id_kontak_teknisi = e.id_kontak_teknisi || null
    await ops.update(id, payload)
    await muatUlang(); edit.value.buka = false; toast('Tiket diperbarui')
  } catch (err) { alertError(err, 'Gagal menyimpan') }
  finally { editSimpan.value = false }
}

// ── Surat tugas & visit ──────────────────────────────────────────────────────
const wo = ref({ buka: false, jenis_wo: 'Troubleshoot', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '', simpan: false })
function bukaWo() { wo.value = { buka: true, jenis_wo: 'Troubleshoot', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: t.value?.teknisi?.id_karyawan || 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: t.value?.judul_tiket || '', simpan: false } }
async function simpanWo() {
  const w = wo.value
  if (w.simpan) return
  if (!w.tgl_jadwal || !w.deskripsi_tugas.trim()) return alertError(null, 'Jadwal dan deskripsi tugas wajib diisi')
  if (!t.value?.site?.id_site) return alertError(null, 'Tiket ini belum terhubung ke site')
  w.simpan = true
  try {
    await proyek.createWo({
      jenis_wo: w.jenis_wo, id_ticket: id, id_site: t.value!.site!.id_site, tipe_eksekutor: w.tipe_eksekutor,
      id_teknisi_internal: w.tipe_eksekutor === 'Internal_NEXT1' && w.id_teknisi_internal ? w.id_teknisi_internal : undefined,
      fee_vendor: w.fee_vendor || undefined, tgl_jadwal: new Date(w.tgl_jadwal).toISOString(), deskripsi_tugas: w.deskripsi_tugas,
    })
    await muatUlang(); w.buka = false; toast('Surat tugas dibuat')
  } catch (e) { alertError(e, 'Gagal membuat surat tugas') }
  finally { w.simpan = false }
}
const antreVisitProses = ref(false)
async function antreVisit() {
  const x = t.value
  if (!x?.site?.id_site || antreVisitProses.value) return
  antreVisitProses.value = true
  try {
    const { data } = await api.post('/visit', { id_site: x.site.id_site, id_ticket: id, jenis_wo: 'Perbaikan', prioritas: ['Critical', 'High'].includes(x.prioritas) ? 'Tinggi' : 'Normal', deskripsi_tugas: x.judul_tiket })
    await muatUlang(); toast(`${data.message} — masuk antrean Jadwal Visit`)
  } catch (e) { alertError(e, 'Gagal memasukkan ke antrean visit') }
  finally { antreVisitProses.value = false }
}
const journeySaving = ref(false)
async function setJourneyTime(field: 'tgl_berangkat' | 'tgl_sampai') {
  if (journeySaving.value) return
  journeySaving.value = true
  try { await ops.update(id, { [field]: new Date().toISOString() }); await muatUlang(); toast(field === 'tgl_berangkat' ? '🚗 Waktu berangkat dicatat' : '📍 Waktu tiba dicatat') }
  catch (e) { alertError(e, 'Gagal mencatat waktu') }
  finally { journeySaving.value = false }
}
const journeyStep = computed(() => {
  const x = t.value
  if (!x) return 0
  if (x.tgl_resolved || !AKTIF.includes(x.status_tiket)) return 3
  return x.tgl_sampai ? 2 : x.tgl_berangkat ? 1 : 0
})

// ── Lain-lain ────────────────────────────────────────────────────────────────
const menghapus = ref(false)
async function hapusTiket() {
  if (menghapus.value) return
  if (!(await confirmDialog({ title: `Hapus tiket ${t.value?.nomor_tiket}?`, message: 'Semua log & data terkait tiket ini ikut terhapus dan tidak bisa dikembalikan.', confirmLabel: 'Ya, hapus', variant: 'danger' }))) return
  menghapus.value = true
  try { await api.delete(`/operations/${id}`); toast('Tiket dihapus'); router.push('/operations') }
  catch (e) { alertError(e, 'Gagal menghapus tiket') }
  finally { menghapus.value = false }
}
async function salin(teks: string, pesan = 'Disalin') {
  try { await navigator.clipboard.writeText(teks); toast(pesan, 'default', 2000) } catch { toast('Tidak bisa menyalin — izin clipboard ditolak browser', 'warning') }
}
const ringkasanTeks = computed(() => {
  const x = t.value
  if (!x) return ''
  return [`🎫 ${x.nomor_tiket} — ${x.judul_tiket}`, `📍 ${x.site?.nama_site ?? '-'} (${x.site?.pelanggan?.nama_pelanggan ?? '-'})`,
    `⚡ ${x.prioritas} · ${statusLabel(x.status_tiket)} · ${durasi(umurMenit.value)}`, `👷 PIC: ${namaPic.value ?? 'belum ada'}`, `🔗 ${asal}/operations/${x.id_ticket}`].join('\n')
})
const menuLain = ref(false)
const asal = window.location.origin
function bukaTiketLain(idLain: number) { window.location.assign(`/operations/${idLain}`) }
function tombol(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (preview.value) {
    if (e.key === 'ArrowRight') geserFoto(1)
    else if (e.key === 'ArrowLeft') geserFoto(-1)
    else if (e.key === 'Escape') preview.value = null
    return
  }
  if (document.querySelector('.modal-overlay, .dh-overlay')) return
  if (e.key === 'e') { e.preventDefault(); openEdit() }
  else if (e.key === 'c') { e.preventDefault(); tab.value = 'aktivitas'; nextTick(() => inputCatatan.value?.focus()) }
  else if (e.key === 't') { e.preventDefault(); showTimeline.value = true }
  else if (/^[1-4]$/.test(e.key)) tab.value = TAB[Number(e.key) - 1]!.k
}
</script>

<template>
  <div class="page td">
    <div v-if="ops.loading && !t" class="td-skeleton"><div class="sk h" /><div class="sk" /><div class="sk" /></div>
    <div v-else-if="ops.error && !t" class="alert alert-danger">{{ ops.error }} <button type="button" class="btn btn-sm btn-secondary" :disabled="ops.loading" @click="muatAwal">Coba lagi</button> <RouterLink to="/operations">← Kembali</RouterLink></div>

    <template v-else-if="t">
      <!-- ── HERO ─────────────────────────────────────────────────────── -->
      <section class="td-hero" :style="{ '--st': STATUS_WARNA[t.status_tiket] ?? '#64748b', '--pr': PRIO[t.prioritas]?.warna ?? '#64748b' }">
        <div class="td-hero-atas">
          <button type="button" class="td-kembali" @click="router.push('/operations')">← Pusat Gangguan</button>
          <div class="td-hero-aksi-kecil">
            <button type="button" title="Salin ringkasan untuk dibagikan" aria-label="Salin ringkasan" @click="salin(ringkasanTeks, 'Ringkasan tiket disalin 📋')">📋</button>
            <button type="button" title="Timeline lengkap (T)" aria-label="Timeline lengkap" @click="showTimeline = true">🕒</button>
            <button type="button" title="Diskusi tim untuk tiket ini" aria-label="Diskusi tim" @click="bukaDiskusi">🗨️</button>
            <button type="button" title="Cetak laporan" aria-label="Cetak laporan" @click="printLaporanTiket(t)">🖨️</button>
            <button type="button" title="Muat ulang" aria-label="Muat ulang" @click="muatUlang(); fetchNoc(); fetchFotos()">🔄</button>
          </div>
        </div>
        <div class="td-hero-isi">
          <div class="td-hero-kiri">
            <div class="td-chips">
              <span class="td-chip prio" :class="{ denyut: t.prioritas === 'Critical' && aktif }">{{ PRIO[t.prioritas]?.ikon }} {{ t.prioritas }}</span>
              <span class="td-chip">{{ SUMBER_IKON[t.sumber_tiket] ?? '•' }} {{ t.sumber_tiket }}</span>
              <span v-if="t.jenis_gangguan" class="td-chip">🧩 {{ t.jenis_gangguan }}</span>
              <button type="button" class="td-chip nomor" title="Salin nomor tiket" @click="salin(t.nomor_tiket, 'Nomor tiket disalin')">{{ t.nomor_tiket }} ⧉</button>
            </div>
            <h1>{{ t.judul_tiket }}</h1>
            <p class="td-hero-site">
              <RouterLink v-if="t.site" :to="`/master/site/${t.site.id_site}`">📍 {{ t.site.nama_site }}</RouterLink>
              <span v-if="t.site?.pelanggan"> · 🏢 {{ t.site.pelanggan.nama_pelanggan }}</span>
              <span v-if="t.site?.kota"> · {{ t.site.kota }}</span>
            </p>
          </div>
          <div class="td-hero-angka">
            <div class="td-durasi">
              <small>{{ aktif ? 'Sudah berlangsung' : 'Total durasi' }}</small>
              <b>{{ durasi(umurMenit) }}</b>
              <em>dibuka {{ fmtDt(t.tgl_open) }}</em>
            </div>
            <div class="td-sla" :class="`s-${sla.nada}`">
              <small>SLA {{ PRIO[t.prioritas]?.sla }} jam</small>
              <b>{{ sla.nada === 'lewat' ? '⏰ ' : sla.nada === 'selesai' ? '✓ ' : '' }}{{ sla.label }}</b>
              <span class="trek"><i :style="{ width: `${Math.min(100, sla.pct)}%` }" /></span>
              <em>{{ sla.sub }}</em>
            </div>
          </div>
        </div>

        <!-- Stepper status -->
        <div class="td-stepper" role="group" aria-label="Status tiket">
          <button v-for="(l, i) in LANGKAH" :key="l.s" type="button" class="td-step"
            :class="{ lewat: i < indeksLangkah, kini: i === indeksLangkah }" :disabled="sibuk || i === indeksLangkah"
            :title="i === indeksLangkah ? 'Status saat ini' : `Ubah ke ${l.label}`" @click="keStatus(l.s)">
            <span class="td-step-bulat">{{ i < indeksLangkah ? '✓' : l.ikon }}</span>
            <span class="td-step-label">{{ l.label }}</span>
          </button>
        </div>

        <!-- Aksi utama -->
        <div class="td-aksi">
          <div class="td-pic">
            <span class="ava" :style="{ background: namaPic ? warnaNama(namaPic) : '#94a3b8' }">{{ namaPic ? inisial(namaPic) : '?' }}</span>
            <span><small>PIC</small><b>{{ namaPic ?? 'Belum ada' }}</b><em v-if="t.kontak_teknisi">{{ t.kontak_teknisi.asal_vendor || 'vendor' }}</em></span>
          </div>
          <div class="td-aksi-tombol">
            <button v-if="aktif && auth.user?.id_karyawan && t.teknisi?.id_karyawan !== auth.user.id_karyawan" type="button" class="td-btn ungu" :disabled="sibuk" @click="handleTangani">🙋 Tangani</button>
            <button v-if="aktif" type="button" class="td-btn hijau" :disabled="sibuk" @click="bukaTutup('Resolved')">✅ Tutup gangguan</button>
            <button type="button" class="td-btn" @click="tab = 'aktivitas'; $nextTick(() => inputCatatan?.focus())">💬 Catatan <kbd>C</kbd></button>
            <button type="button" class="td-btn" @click="openEdit">✏️ Edit <kbd>E</kbd></button>
            <div class="td-menu">
              <button type="button" class="td-btn" :aria-expanded="menuLain" aria-label="Aksi lainnya" title="Aksi lainnya" @click="menuLain = !menuLain">⋯</button>
              <div v-if="menuLain" class="td-menu-isi" @click="menuLain = false">
                <button type="button" @click="bukaWo">🛠️ Buat surat tugas</button>
                <button type="button" :disabled="antreVisitProses" @click="antreVisit">🗓️ Masukkan antrean visit</button>
                <button type="button" @click="salin(`${asal}/operations/${t.id_ticket}`, 'Tautan disalin')">🔗 Salin tautan</button>
                <button type="button" @click="printLaporanTiket(t)">🖨️ Cetak laporan</button>
                <button v-if="auth.hasRole('Admin')" type="button" class="bahaya" :disabled="menghapus" @click="hapusTiket">🗑️ Hapus tiket</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="td-grid">
        <!-- ── KOLOM UTAMA ─────────────────────────────────────────────── -->
        <main class="td-utama">
          <nav class="td-tab" role="tablist">
            <button v-for="(x, i) in TAB" :key="x.k" type="button" role="tab" :aria-selected="tab === x.k" :class="{ on: tab === x.k }" :title="`Pintasan: ${i + 1}`" @click="tab = x.k">
              {{ x.ikon }} {{ x.label }}
              <span v-if="x.k === 'aktivitas' && activityFeed.length" class="td-tab-n">{{ activityFeed.length }}</span>
              <span v-if="x.k === 'monitoring' && sensorDown" class="td-tab-n merah">{{ sensorDown }}</span>
              <span v-if="x.k === 'lapangan' && fotos.length" class="td-tab-n">📷 {{ fotos.length }}</span>
            </button>
          </nav>

          <!-- RINGKASAN -->
          <div v-show="tab === 'ringkasan'" class="td-panel">
            <div v-if="noc" class="td-kesimpulan" :style="{ '--nw': NOC_WARNA[noc.kesimpulan.status] ?? '#64748b' }">
              <span class="td-kesimpulan-ikon">🛰️</span>
              <div>
                <small>Kondisi router sekarang (NOCaaS)</small>
                <b>{{ noc.kesimpulan.label }}</b>
                <p>{{ noc.kesimpulan.saran }}</p>
              </div>
              <button type="button" class="td-link" @click="tab = 'monitoring'">Detail →</button>
            </div>

            <div v-if="downtimeInfo" class="td-kartu td-downtime">
              <div class="td-dt-titik">
                <span class="bulat merah">▼</span>
                <div><small>Mulai down</small><b>{{ fmtDt(downtimeInfo.waktu_down) }}</b><em v-if="downtimeInfo.pesan_down" :title="downtimeInfo.pesan_down">{{ downtimeInfo.pesan_down }}</em></div>
              </div>
              <div class="td-dt-garis" :class="{ hidup: !downtimeInfo.sudah_up }"><span>{{ downtimeInfo.durasi_label }}</span></div>
              <div class="td-dt-titik">
                <span class="bulat" :class="downtimeInfo.sudah_up ? 'hijau' : 'abu'">{{ downtimeInfo.sudah_up ? '▲' : '…' }}</span>
                <div><small>{{ downtimeInfo.sudah_up ? 'Kembali up' : 'Belum up' }}</small><b>{{ downtimeInfo.sudah_up ? fmtDt(downtimeInfo.waktu_up) : 'masih down' }}</b></div>
              </div>
            </div>

            <div class="td-dua">
              <div class="td-kartu">
                <h4>📝 Deskripsi masalah</h4>
                <p class="td-teks">{{ t.deskripsi_masalah || 'Belum ada deskripsi.' }}</p>
              </div>
              <div class="td-kartu" :class="{ kosong: !t.root_cause }">
                <h4>🔬 Analisis (RCA)</h4>
                <div class="td-rca">
                  <span><small>Jenis gangguan</small><b>{{ t.jenis_gangguan || '—' }}</b></span>
                  <span><small>Root cause / tindakan</small><b class="td-teks">{{ t.root_cause || 'Belum diisi' }}</b></span>
                </div>
                <button v-if="!t.root_cause" type="button" class="td-link" @click="aktif ? bukaTutup('Resolved') : openEdit()">+ Isi analisis</button>
              </div>
            </div>

            <div class="td-kartu">
              <div class="td-kartu-kepala">
                <h4>🛠️ Surat tugas <span class="muted">({{ t.work_orders?.length ?? 0 }})</span></h4>
                <span class="td-kanan">
                  <button type="button" class="td-btn kecil" :disabled="antreVisitProses" @click="antreVisit">🗓️ Perlu visit</button>
                  <button type="button" class="td-btn kecil biru" @click="bukaWo">＋ Surat tugas</button>
                </span>
              </div>
              <div v-if="!t.work_orders?.length" class="td-kosong-kecil">Belum ada surat tugas — buat bila perlu kunjungan teknisi.</div>
              <button v-for="w in t.work_orders" :key="w.id_wo" type="button" class="td-wo" @click="router.push({ path: '/jadwal-visit', query: { wo: w.id_wo } })">
                <span class="td-wo-ikon">🛠️</span>
                <span class="td-wo-isi"><b>{{ w.nomor_wo }} · {{ w.jenis_wo }}</b><small>{{ w.deskripsi_tugas }}</small><small>{{ w.tgl_jadwal ? fmtDt(w.tgl_jadwal) : 'Antrean visit' }} · {{ w.teknisi?.nama_lengkap || w.vendor?.nama_vendor || 'belum ada eksekutor' }}</small></span>
                <span class="td-wo-st" :style="{ color: WO_STATUS_COLOR[w.status_wo], borderColor: WO_STATUS_COLOR[w.status_wo] }">{{ w.status_wo }}</span>
              </button>
            </div>

            <div class="td-kartu">
              <div class="td-kartu-kepala"><h4>💬 Aktivitas terbaru</h4><button type="button" class="td-link" @click="tab = 'aktivitas'">Semua ({{ activityFeed.length }}) →</button></div>
              <div v-if="!activityFeed.length" class="td-kosong-kecil">Belum ada aktivitas.</div>
              <ul class="td-feed mini">
                <li v-for="it in activityFeed.slice(0, 3)" :key="it.kind === 'log' ? `l${it.log.id_log}` : `f${it.stage}`">
                  <span class="td-feed-titik" :style="{ background: it.kind === 'foto' ? '#16a34a' : STATUS_WARNA[it.log.status_ke] ?? '#94a3b8' }" />
                  <div>
                    <b>{{ it.kind === 'log' ? it.log.catatan || statusLabel(it.log.status_ke) : `📷 ${it.label}` }}</b>
                    <small>{{ it.kind === 'log' ? it.log.user?.karyawan?.nama_lengkap || 'Sistem' : `${it.fotos.length} foto` }} · {{ fmtDt(it.time) }}</small>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- MONITORING -->
          <div v-show="tab === 'monitoring'" class="td-panel">
            <div class="td-kartu">
              <div class="td-kartu-kepala">
                <h4>🛰️ Pembanding NOCaaS</h4>
                <button type="button" class="td-ikon-btn" :disabled="nocLoading" title="Muat ulang" aria-label="Muat ulang status NOCaaS" @click="fetchNoc"><span :class="{ putar: nocLoading }">↻</span></button>
              </div>
              <small class="muted">Status router dari NOCaaS (VPN NS/UN + heartbeat syslog) + ping tunnel dari ERP</small>
              <div v-if="nocLoading && !noc" class="td-kosong-kecil">Memuat status NOCaaS…</div>
              <div v-else-if="nocError" class="alert alert-danger">{{ nocError }}</div>
              <template v-else-if="noc">
                <div class="td-kesimpulan datar" :style="{ '--nw': NOC_WARNA[noc.kesimpulan.status] ?? '#64748b' }">
                  <div><b>{{ noc.kesimpulan.label }}</b><p>{{ noc.kesimpulan.saran }}</p></div>
                </div>
                <RouterLink v-if="!noc.routers.length" to="/nocaas" class="td-link">Petakan router ke site ini →</RouterLink>
                <div v-for="r in noc.routers" :key="r.site_key" class="td-router">
                  <div class="td-router-baris">
                    <span class="td-router-dot" :style="{ background: NOC_WARNA[r.status] }" />
                    <div class="td-router-info">
                      <b>{{ r.site_key }}<span v-if="r.jenis && r.jenis !== 'mikrotik'" class="td-tag">{{ r.jenis.toUpperCase() }}{{ r.model ? ` · ${r.model}` : '' }}</span></b>
                      <small><b :style="{ color: NOC_WARNA[r.status] }">{{ r.label }}</b> · sejak {{ nocSejak(r.status === 'macet' ? r.macet_sejak : r.status === 'offline' && r.offline_since ? r.offline_since : r.status_sejak) }}</small>
                      <div class="td-tunnel">
                        <span v-if="r.ns_ip" :class="tunnelKelas(r.ns_online, r.ping?.ns)" :title="tunnelJudul(r.ns_online, r.ping?.ns)">NS {{ r.ns_ip }}<small v-if="r.ping?.ns"> · {{ pingTeks(r.ping.ns) }}</small></span>
                        <span v-if="r.un_ip" :class="tunnelKelas(r.un_online, r.ping?.un)" :title="tunnelJudul(r.un_online, r.ping?.un)">UN {{ r.un_ip }}<small v-if="r.ping?.un"> · {{ pingTeks(r.ping.un) }}</small></span>
                      </div>
                      <small>🌐 {{ r.access_isp || '—' }}<template v-if="r.public_ip"> · {{ r.public_ip }}</template><template v-if="r.hb_at"> · heartbeat {{ nocSejak(r.hb_at) }} lalu</template></small>
                      <small>📉 Putus 7 hari: <b>{{ r.downs7 }}×</b> · flapping 24 jam: <b>{{ r.flaps24 }}×</b></small>
                    </div>
                    <button v-if="r.nama_utama" type="button" class="td-btn kecil" @click="toggleNocKejadian(r.site_key)">{{ nocKejadian[r.site_key] ? 'Tutup' : '📜 Riwayat 72 jam' }}</button>
                  </div>
                  <div v-if="nocKejadian[r.site_key]" class="td-kejadian">
                    <div v-if="nocKejadian[r.site_key] === 'memuat'" class="td-kosong-kecil">Memuat…</div>
                    <div v-else-if="typeof nocKejadian[r.site_key] === 'string'" class="alert alert-danger">{{ nocKejadian[r.site_key] }}</div>
                    <div v-else-if="!(nocKejadian[r.site_key] as any[]).length" class="td-kosong-kecil">Tidak ada kejadian dalam 72 jam.</div>
                    <template v-else>
                      <div v-for="(k, i) in (nocKejadian[r.site_key] as any[])" :key="i" class="td-kj">
                        <span class="at">{{ fmtDt(k.at) }}</span>
                        <span :class="['jenis', /down/.test(k.kind) ? 'off' : 'on']">{{ NOC_KEJADIAN[k.kind] || k.kind }}</span>
                        <span class="det">{{ k.iface }}{{ k.detail ? ` · ${k.detail}` : '' }}</span>
                      </div>
                    </template>
                  </div>
                </div>
                <div v-if="noc.sinkron && !noc.sinkron.ok" class="alert alert-danger">Sinkron NOCaaS terakhir gagal: {{ noc.sinkron.pesan }}</div>
              </template>
            </div>

            <div class="td-kartu">
              <div class="td-kartu-kepala">
                <h4>📡 Sensor PRTG <small v-if="prtgDeviceName" class="muted">· {{ prtgDeviceName }}</small></h4>
                <button type="button" class="td-ikon-btn" :disabled="prtgLoading" title="Muat ulang" aria-label="Muat ulang sensor PRTG" @click="fetchPrtgSensors"><span :class="{ putar: prtgLoading }">↻</span></button>
              </div>
              <div v-if="prtgLoading" class="td-kosong-kecil">Memuat sensor PRTG…</div>
              <div v-else-if="prtgError" class="alert alert-danger">{{ prtgError }}</div>
              <div v-else-if="!prtgSensors.length" class="td-kosong-kecil">Belum ada device PRTG yang dipetakan ke site ini.</div>
              <div v-else class="td-sensor-grid">
                <button v-for="s in prtgSensors" :key="s.objid" type="button" class="td-sensor" :class="{ on: selectedSensorId === s.objid }" :style="{ '--sw': prtgStatusColor(s.status_raw) }" @click="pilihSensor(s)">
                  <span class="dot" />
                  <span class="isi"><b>{{ s.sensor }}</b><small>{{ s.device }}</small><small v-if="s.message_raw" class="pesan">{{ s.message_raw }}</small></span>
                  <span class="lbl">{{ prtgStatusLabel(s.status_raw) }}</span>
                </button>
              </div>
            </div>

            <div v-if="selectedSensorId && prtgSensors.length" class="td-kartu">
              <div class="td-kartu-kepala">
                <h4>📊 Grafik · {{ prtgSensors.find((s) => s.objid === selectedSensorId)?.sensor }} <span v-if="selectedGraphId === 0" class="td-live">● Live</span></h4>
                <div class="td-seg">
                  <button v-for="(lbl, gid) in ['Live', '48 Jam', '30 Hari', '365 Hari']" :key="gid" type="button" :class="{ on: selectedGraphId === gid }" @click="selectedGraphId = gid; loadGraphBlob(selectedSensorId!, gid)">{{ lbl }}</button>
                </div>
              </div>
              <div class="td-grafik">
                <div v-if="graphLoading" class="td-kosong-kecil">⏳ Memuat grafik…</div>
                <img v-else-if="graphBlobUrl && !graphLoadError" :src="graphBlobUrl" alt="Grafik sensor PRTG" />
                <div v-else class="td-kosong-kecil">Gagal memuat grafik — sensor mungkin tidak aktif atau PRTG belum terkonfigurasi.</div>
              </div>
              <small class="muted">Sensor ID {{ selectedSensorId }}<template v-if="selectedGraphId === 0"> · diperbarui otomatis tiap 60 detik</template></small>
            </div>
          </div>

          <!-- LAPANGAN -->
          <div v-show="tab === 'lapangan'" class="td-panel">
            <div class="td-kartu td-journey">
              <div class="td-kartu-kepala"><h4>🚦 Perjalanan teknisi</h4><button type="button" class="td-link" @click="showTimeline = true">Timeline lengkap →</button></div>
              <div class="td-jalan">
                <div v-for="(j, i) in [
                  { ikon: '📋', label: 'Tiket dibuka', waktu: t.tgl_open },
                  { ikon: '🚗', label: 'Berangkat', waktu: t.tgl_berangkat, aksi: 'tgl_berangkat' },
                  { ikon: '📍', label: 'Tiba di lokasi', waktu: t.tgl_sampai, aksi: 'tgl_sampai' },
                  { ikon: '✅', label: 'Selesai', waktu: t.tgl_resolved },
                ]" :key="j.label" class="td-jalan-step" :class="{ lewat: i <= journeyStep, kini: i === journeyStep && aktif }">
                  <span class="bulat">{{ j.ikon }}</span>
                  <b>{{ j.label }}</b>
                  <small>{{ j.waktu ? fmtDt(j.waktu) : '—' }}</small>
                  <button v-if="!j.waktu && j.aksi && aktif && (j.aksi === 'tgl_berangkat' || t.tgl_berangkat)" type="button" class="td-btn kecil biru" :disabled="journeySaving" @click="setJourneyTime(j.aksi as any)">Catat sekarang</button>
                </div>
              </div>
            </div>

            <div class="td-kartu td-peta-kartu">
              <div class="td-kartu-kepala">
                <h4>🗺️ Lokasi</h4>
                <small class="muted">
                  <template v-if="teknisiLokasi">🛵 teknisi diperbarui {{ fmtDt(teknisiLokasi.updated_at) }}<template v-if="jarakKm != null"> · <b>{{ jarakKm.toFixed(1) }} km</b> dari site</template></template>
                  <template v-else-if="t.teknisi">GPS teknisi belum tersedia</template>
                  <template v-else>Belum ada teknisi</template>
                </small>
              </div>
              <div ref="mapContainer" class="td-peta" />
              <div class="td-peta-kaki">
                <span v-if="t.site?.koordinat_gps" class="muted">📍 {{ t.site.koordinat_gps }}</span>
                <span v-else class="muted">Koordinat site belum diisi — <RouterLink :to="`/master/site/${t.site?.id_site}`">lengkapi di data site</RouterLink></span>
                <a v-if="t.site?.koordinat_gps" :href="`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t.site.koordinat_gps)}`" target="_blank" rel="noopener" class="td-btn kecil biru">🧭 Rute ke site</a>
              </div>
            </div>

            <div class="td-kartu">
              <div class="td-kartu-kepala"><h4>📷 Dokumentasi foto <span class="muted">({{ fotos.length }})</span></h4></div>
              <div v-if="!fotos.length" class="td-kosong-kecil">Belum ada foto — teknisi mengunggah lewat aplikasi mobile.</div>
              <template v-else>
              <div v-for="stage in ['before', 'proses', 'after']" :key="stage">
                <div v-if="fotosOf(stage).length" class="td-foto-grup">
                  <small class="td-foto-lbl">{{ stageLabel(stage) }} pekerjaan</small>
                  <div class="td-foto-grid">
                    <button v-for="f in fotosOf(stage)" :key="f.id_foto" type="button" class="td-foto" @click="bukaFoto(fotos, f)">
                      <img :src="f.url" loading="lazy" :alt="`Foto ${stageLabel(stage)} ${fmtDt(f.created_at)}`" />
                      <small>{{ fmtDt(f.created_at) }}</small>
                    </button>
                  </div>
                </div>
              </div>
              </template>
            </div>
          </div>

          <!-- AKTIVITAS -->
          <div v-show="tab === 'aktivitas'" class="td-panel">
            <div class="td-kartu td-composer">
              <textarea ref="inputCatatan" v-model="catatan" rows="2" placeholder="Tulis update pekerjaan… (Ctrl+Enter untuk kirim)" @keydown.ctrl.enter="kirimCatatan" @keydown.meta.enter="kirimCatatan" />
              <div class="td-cepat">
                <button v-for="c in CATATAN_CEPAT" :key="c" type="button" @click="catatan = catatan ? `${catatan}\n${c}` : c">{{ c }}</button>
              </div>
              <div class="td-composer-bawah">
                <select v-model="catatanStatus" class="form-select" aria-label="Ubah status bersama catatan">
                  <option value="">Status tetap ({{ statusLabel(t.status_tiket) }})</option>
                  <option v-for="l in LANGKAH.filter((x) => x.s !== t.status_tiket)" :key="l.s" :value="l.s">→ {{ l.ikon }} {{ l.label }}</option>
                </select>
                <button type="button" class="td-btn biru" :disabled="kirimLog || (!catatan.trim() && !catatanStatus)" @click="kirimCatatan">{{ kirimLog ? 'Mengirim…' : '📨 Kirim' }}</button>
              </div>
            </div>
            <div class="td-kartu">
              <div v-if="!activityFeed.length" class="td-kosong-kecil">Belum ada aktivitas.</div>
              <ul class="td-feed">
                <li v-for="it in activityFeed" :key="it.kind === 'log' ? `l${it.log.id_log}` : `f${it.stage}`">
                  <span class="td-feed-titik" :style="{ background: it.kind === 'foto' ? '#16a34a' : STATUS_WARNA[it.log.status_ke] ?? '#94a3b8' }">{{ it.kind === 'foto' ? '📷' : it.log.status_ke ? '🔁' : '💬' }}</span>
                  <div class="td-feed-isi">
                    <div class="td-feed-atas">
                      <b>{{ it.kind === 'log' ? it.log.user?.karyawan?.nama_lengkap || 'Sistem' : it.label }}</b>
                      <small>{{ fmtDt(it.time) }}</small>
                    </div>
                    <span v-if="it.kind === 'log' && it.log.status_ke" class="td-status-kecil" :style="{ '--st': STATUS_WARNA[it.log.status_ke] ?? '#64748b' }">{{ it.log.status_dari ? `${statusLabel(it.log.status_dari)} → ` : '' }}{{ statusLabel(it.log.status_ke) }}</span>
                    <p v-if="it.kind === 'log' && it.log.catatan" class="td-teks">{{ it.log.catatan }}</p>
                    <div v-if="it.kind === 'foto'" class="td-foto-mini">
                      <img v-for="f in it.fotos" :key="f.id_foto" :src="f.url" loading="lazy" alt="Foto lampiran" @click="bukaFoto(it.fotos, f)" />
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </main>

        <!-- ── SIDEBAR ─────────────────────────────────────────────────── -->
        <aside class="td-samping">
          <div class="td-kartu td-site">
            <h4>🏢 Pelanggan & site</h4>
            <dl>
              <dt>Pelanggan</dt><dd><b>{{ t.site?.pelanggan?.nama_pelanggan || '—' }}</b><small v-if="t.site?.pelanggan?.kode_pelanggan"> {{ t.site.pelanggan.kode_pelanggan }}</small></dd>
              <dt>Site</dt><dd><RouterLink v-if="t.site" :to="`/master/site/${t.site.id_site}`">{{ t.site.nama_site }}</RouterLink><small v-if="t.site?.kode_site"> {{ t.site.kode_site }}</small></dd>
              <dt>Layanan</dt><dd>{{ t.site?.layanan?.nama_layanan || '—' }}</dd>
              <dt v-if="t.site?.alamat_lengkap">Alamat</dt><dd v-if="t.site?.alamat_lengkap" class="td-teks">{{ t.site.alamat_lengkap }}</dd>
            </dl>
          </div>

          <div class="td-kartu">
            <h4>📞 Kontak cepat</h4>
            <div v-if="t.site?.pelanggan?.no_hp_pic_utama || t.site?.pelanggan?.no_telp" class="td-kontak">
              <span class="ava kecil" :style="{ background: warnaNama(t.site.pelanggan.nama_pic_utama) }">{{ inisial(t.site.pelanggan.nama_pic_utama || t.site.pelanggan.nama_pelanggan) }}</span>
              <span class="nm"><b>{{ t.site.pelanggan.nama_pic_utama || t.site.pelanggan.nama_pelanggan }}</b><small>PIC pelanggan</small></span>
              <a v-if="t.site.pelanggan.no_hp_pic_utama" :href="waLink(t.site.pelanggan.no_hp_pic_utama)" target="_blank" rel="noopener" class="td-k wa" :title="`WhatsApp ${t.site.pelanggan.no_hp_pic_utama}`">💬</a>
              <a v-if="t.site.pelanggan.no_telp || t.site.pelanggan.no_hp_pic_utama" :href="`tel:${t.site.pelanggan.no_telp || t.site.pelanggan.no_hp_pic_utama}`" class="td-k tel" title="Telepon">📞</a>
            </div>
            <div v-for="p in t.site?.pic ?? []" :key="p.id_pic" class="td-kontak">
              <span class="ava kecil" :style="{ background: warnaNama(p.nama_pic) }">{{ inisial(p.nama_pic) }}</span>
              <span class="nm"><b>{{ p.nama_pic }} <em v-if="p.is_utama">utama</em></b><small>{{ p.jabatan || 'PIC site' }}<template v-if="p.no_kontak"> · {{ p.no_kontak }}</template></small></span>
              <a v-if="p.no_kontak" :href="waLink(p.no_kontak)" target="_blank" rel="noopener" class="td-k wa" title="WhatsApp">💬</a>
              <a v-if="p.no_kontak" :href="`tel:${p.no_kontak}`" class="td-k tel" title="Telepon">📞</a>
              <a v-if="p.email" :href="`mailto:${p.email}`" class="td-k mail" :title="p.email">✉️</a>
            </div>
            <div v-if="t.kontak_teknisi" class="td-kontak">
              <span class="ava kecil" :style="{ background: warnaNama(t.kontak_teknisi.nama) }">{{ inisial(t.kontak_teknisi.nama) }}</span>
              <span class="nm"><b>{{ t.kontak_teknisi.nama }}</b><small>Teknisi vendor · {{ t.kontak_teknisi.asal_vendor || '-' }}</small></span>
              <a v-if="t.kontak_teknisi.no_hp" :href="waLink(t.kontak_teknisi.no_hp)" target="_blank" rel="noopener" class="td-k wa" title="WhatsApp">💬</a>
            </div>
            <div v-if="!t.site?.pelanggan?.no_hp_pic_utama && !t.site?.pelanggan?.no_telp && !t.site?.pic?.length" class="td-kosong-kecil">Belum ada kontak PIC di data site.</div>
          </div>

          <div class="td-kartu">
            <h4>🌐 Provider / ISP</h4>
            <div v-if="!t.site?.sumber_internet?.length" class="td-kosong-kecil">Belum ada data ISP aktif.</div>
            <div v-for="isp in t.site?.sumber_internet ?? []" :key="isp.id_sumber" class="td-isp">
              <div class="td-isp-atas">
                <span class="td-tag" :class="isp.peruntukan_link === 'Main' ? 'main' : 'backup'">{{ isp.peruntukan_link === 'Main' ? '▶ Main' : '⬡ Backup' }}</span>
                <b>{{ isp.vendor?.nama_vendor || '—' }}</b>
                <small v-if="isp.bandwidth_mbps">{{ isp.bandwidth_mbps }} Mbps</small>
              </div>
              <small v-if="isp.nomor_pelanggan_isp" class="td-isp-no">
                No. pelanggan ISP: <b>{{ isp.nomor_pelanggan_isp }}</b>
                <button type="button" class="td-salin" title="Salin" aria-label="Salin nomor pelanggan ISP" @click="salin(isp.nomor_pelanggan_isp, 'Nomor pelanggan ISP disalin')">⧉</button>
              </small>
              <div v-if="isp.vendor?.no_telp || isp.vendor?.email_pic" class="td-isp-kontak">
                <small v-if="isp.vendor?.kontak_pic">PIC {{ isp.vendor.kontak_pic }}</small>
                <a v-if="isp.vendor?.no_telp" :href="waLink(isp.vendor.no_telp)" target="_blank" rel="noopener" class="td-k wa" title="WhatsApp vendor">💬</a>
                <a v-if="isp.vendor?.no_telp" :href="`tel:${isp.vendor.no_telp}`" class="td-k tel" title="Telepon vendor">📞</a>
                <a v-if="isp.vendor?.email_pic" :href="`mailto:${isp.vendor.email_pic}`" class="td-k mail" :title="isp.vendor.email_pic">✉️</a>
              </div>
            </div>
          </div>

          <div v-if="t.related_tickets?.length" class="td-kartu">
            <h4>🔁 Riwayat gangguan site ini</h4>
            <button v-for="rt in t.related_tickets" :key="rt.id_ticket" type="button" class="td-rel" @click="bukaTiketLain(rt.id_ticket)">
              <span class="td-rel-dot" :style="{ background: STATUS_WARNA[rt.status_tiket] ?? '#94a3b8' }" />
              <span class="isi"><b>{{ rt.judul_tiket }}</b><small>{{ rt.nomor_tiket }} · {{ fmtDt(rt.tgl_open) }}</small></span>
              <span class="prio" :style="{ color: PRIO[rt.prioritas]?.warna }">{{ PRIO[rt.prioritas]?.ikon }}</span>
            </button>
          </div>
        </aside>
      </div>

      <!-- ── PREVIEW FOTO ──────────────────────────────────────────────── -->
      <div v-if="preview" class="td-lightbox" @click.self="preview = null">
        <button type="button" class="td-lb-x" aria-label="Tutup" @click="preview = null">✕</button>
        <button v-if="preview.list.length > 1" type="button" class="td-lb-nav kiri" aria-label="Sebelumnya" @click="geserFoto(-1)">‹</button>
        <figure>
          <img :src="preview.list[preview.i]?.url" alt="Pratinjau foto" />
          <figcaption>{{ stageLabel(preview.list[preview.i]?.stage) }} · {{ fmtDt(preview.list[preview.i]?.created_at) }} · {{ preview.i + 1 }}/{{ preview.list.length }}</figcaption>
        </figure>
        <button v-if="preview.list.length > 1" type="button" class="td-lb-nav kanan" aria-label="Berikutnya" @click="geserFoto(1)">›</button>
      </div>

      <!-- ── TIMELINE ──────────────────────────────────────────────────── -->
      <div v-if="showTimeline" class="modal-overlay" @click.self="showTimeline = false">
        <div class="modal td-modal" v-focus-trap>
          <div class="td-modal-kepala"><div><h3>🕒 Timeline lengkap</h3><small>{{ t.nomor_tiket }} · {{ t.judul_tiket }}</small></div><button type="button" class="btn-modal-close" aria-label="Tutup" @click="showTimeline = false">✕</button></div>
          <div class="modal-body">
            <ol class="td-tl">
              <li v-for="ev in timelineEvents" :key="`${ev.type}:${ev.time}`" :style="{ '--tc': ev.color }">
                <span class="td-tl-ikon">{{ ev.icon }}</span>
                <div>
                  <b>{{ ev.title }}</b>
                  <small>{{ fmtDt(ev.time) }}<template v-if="ev.by"> · {{ ev.by }}</template></small>
                  <p v-if="ev.desc" class="td-teks">{{ ev.desc }}</p>
                  <span v-if="ev.statusKe" class="td-status-kecil" :style="{ '--st': STATUS_WARNA[ev.statusKe] ?? '#64748b' }">{{ statusLabel(ev.statusKe) }}</span>
                  <a v-if="ev.type === 'berangkat' && ev.gps" :href="`https://maps.google.com/?q=${ev.gps.latitude},${ev.gps.longitude}`" target="_blank" rel="noopener" class="td-link">📡 {{ Number(ev.gps.latitude).toFixed(5) }}, {{ Number(ev.gps.longitude).toFixed(5) }} ↗</a>
                  <div v-if="ev.type === 'foto'" class="td-foto-mini"><img v-for="f in ev.fotos" :key="f.id_foto" :src="f.url" loading="lazy" alt="Foto" @click="showTimeline = false; bukaFoto(ev.fotos, f)" /></div>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>

      <!-- ── TUTUP GANGGUAN ────────────────────────────────────────────── -->
      <div v-if="tutup.buka" class="modal-overlay" @click.self="tutup.buka = false">
        <div class="modal td-modal" v-focus-trap>
          <div class="td-modal-kepala hijau"><div><h3>✅ Tutup gangguan</h3><small>{{ t.nomor_tiket }} · {{ t.site?.nama_site }} · {{ durasi(umurMenit) }}</small></div><button type="button" class="btn-modal-close" aria-label="Tutup" @click="tutup.buka = false">✕</button></div>
          <div class="modal-body td-form">
            <div class="td-seg lebar">
              <button type="button" :class="{ on: tutup.status === 'Resolved' }" @click="tutup.status = 'Resolved'">✅ Selesai (Resolved)</button>
              <button type="button" :class="{ on: tutup.status === 'Closed' }" @click="tutup.status = 'Closed'">🔒 Tutup permanen (Closed)</button>
            </div>
            <label><span class="form-label">Jenis gangguan</span>
              <select v-model="tutup.jenis" class="form-select">
                <option value="">— Belum dikategorikan —</option>
                <option v-for="j in jenisGangguanList" :key="j" :value="j">{{ j }}</option>
                <option v-if="tutup.jenis && !jenisGangguanList.includes(tutup.jenis)" :value="tutup.jenis">{{ tutup.jenis }}</option>
              </select>
            </label>
            <label><span class="form-label form-required">Root cause / tindakan perbaikan</span>
              <textarea v-model="tutup.root_cause" class="form-textarea" rows="3" placeholder="Contoh: Adaptor modem rusak, sudah diganti unit baru. Koneksi normal kembali." />
            </label>
            <label><span class="form-label">Catatan tambahan (opsional)</span>
              <textarea v-model="tutup.catatan" class="form-textarea" rows="2" placeholder="Masuk ke log aktivitas" />
            </label>
            <p v-if="noc && ['offline', 'macet'].includes(noc.kesimpulan.status)" class="td-info td-peringatan">
              ⚠️ Menurut NOCaaS router site ini <b>masih {{ noc.kesimpulan.label.toLowerCase() }}</b>. Tiket tetap bisa ditutup — sistem <b>tidak</b> akan membuka ulang
              atau membuat tiket baru untuk gangguan yang sama. Tiket baru hanya muncul bila router sempat hidup lalu mati lagi.
            </p>
            <p class="td-info">📱 Pelanggan akan menerima notifikasi WhatsApp bahwa gangguan telah {{ tutup.status === 'Closed' ? 'ditutup' : 'diselesaikan' }}.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="tutup.buka = false">Batal</button>
            <button type="button" class="btn btn-success" :disabled="tutup.simpan" @click="simpanTutup">{{ tutup.simpan ? 'Menyimpan…' : '🎉 Tutup gangguan' }}</button>
          </div>
        </div>
      </div>

      <!-- ── EDIT ──────────────────────────────────────────────────────── -->
      <div v-if="edit.buka" class="modal-overlay" @click.self="edit.buka = false">
        <div class="modal td-modal" v-focus-trap>
          <div class="td-modal-kepala"><div><h3>✏️ Edit tiket</h3><small>{{ t.nomor_tiket }}</small></div><button type="button" class="btn-modal-close" aria-label="Tutup" @click="edit.buka = false">✕</button></div>
          <div class="modal-body td-form">
            <label><span class="form-label">Judul</span><input v-model="edit.judul_tiket" class="form-input" maxlength="255" /></label>
            <div class="td-field"><span class="form-label">Prioritas</span>
              <div class="td-prio-pilih">
                <button v-for="(p, k) in PRIO" :key="k" type="button" :class="{ on: edit.prioritas === k }" :style="{ '--pw': p.warna }" @click="edit.prioritas = k"><span>{{ p.ikon }}</span><b>{{ k }}</b><small>SLA {{ p.sla }} jam</small></button>
              </div>
            </div>
            <div class="td-field"><span class="form-label">Ditangani oleh</span>
              <div class="td-seg lebar">
                <button type="button" :class="{ on: edit.tipe_assign === 'internal' }" @click="edit.tipe_assign = 'internal'">👷 Teknisi internal</button>
                <button type="button" :class="{ on: edit.tipe_assign === 'vendor' }" @click="edit.tipe_assign = 'vendor'">🤝 Vendor / mitra</button>
              </div>
              <select v-if="edit.tipe_assign === 'internal'" v-model="edit.id_teknisi_pic" class="form-select">
                <option :value="0">— Belum ditugaskan —</option>
                <option v-for="k in ops.teknisiList" :key="k.id_karyawan" :value="k.id_karyawan">{{ k.nama_lengkap }}</option>
              </select>
              <select v-else v-model="edit.id_kontak_teknisi" class="form-select">
                <option :value="0">— Belum ditugaskan —</option>
                <option v-for="k in ops.kontakTeknisiList" :key="k.id_kontak" :value="k.id_kontak">{{ k.nama }}{{ k.asal_vendor ? ` · ${k.asal_vendor}` : '' }}</option>
              </select>
            </div>
            <label><span class="form-label">Deskripsi masalah</span><textarea v-model="edit.deskripsi_masalah" class="form-textarea" rows="3" /></label>
            <label><span class="form-label">Jenis gangguan</span>
              <select v-model="edit.jenis_gangguan" class="form-select">
                <option value="">— Belum dikategorikan —</option>
                <option v-for="j in jenisGangguanList" :key="j" :value="j">{{ j }}</option>
                <option v-if="edit.jenis_gangguan && !jenisGangguanList.includes(edit.jenis_gangguan)" :value="edit.jenis_gangguan">{{ edit.jenis_gangguan }}</option>
              </select>
            </label>
            <label><span class="form-label">Root cause / catatan teknis</span><textarea v-model="edit.root_cause" class="form-textarea" rows="3" /></label>
            <p class="td-info">Status diubah lewat langkah status di bagian atas halaman.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="edit.buka = false">Batal</button>
            <button type="button" class="btn btn-primary" :disabled="editSimpan" @click="simpanEdit">{{ editSimpan ? 'Menyimpan…' : 'Simpan' }}</button>
          </div>
        </div>
      </div>

      <!-- ── SURAT TUGAS ───────────────────────────────────────────────── -->
      <div v-if="wo.buka" class="modal-overlay" @click.self="wo.buka = false">
        <div class="modal td-modal" v-focus-trap>
          <div class="td-modal-kepala"><div><h3>🛠️ Surat tugas baru</h3><small>{{ t.site?.nama_site }}</small></div><button type="button" class="btn-modal-close" aria-label="Tutup" @click="wo.buka = false">✕</button></div>
          <div class="modal-body td-form">
            <div class="td-dua">
              <label><span class="form-label">Jenis tugas</span><select v-model="wo.jenis_wo" class="form-select"><option v-for="j in JENIS_WO" :key="j" :value="j">{{ j }}</option></select></label>
              <label><span class="form-label">Eksekutor</span><select v-model="wo.tipe_eksekutor" class="form-select"><option value="Internal_NEXT1">Internal NEXT1</option><option value="Vendor_Ketiga">Vendor ketiga</option></select></label>
            </div>
            <label v-if="wo.tipe_eksekutor === 'Internal_NEXT1'"><span class="form-label">Teknisi</span>
              <select v-model="wo.id_teknisi_internal" class="form-select"><option :value="0">— Pilih —</option><option v-for="k in ops.teknisiList" :key="k.id_karyawan" :value="k.id_karyawan">{{ k.nama_lengkap }}</option></select>
            </label>
            <label v-else><span class="form-label">Fee vendor (Rp)</span><input v-model.number="wo.fee_vendor" type="number" min="0" class="form-input" /></label>
            <label><span class="form-label form-required">Jadwal</span><input v-model="wo.tgl_jadwal" type="datetime-local" class="form-input" /></label>
            <label><span class="form-label form-required">Deskripsi tugas</span><textarea v-model="wo.deskripsi_tugas" class="form-textarea" rows="3" /></label>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="wo.buka = false">Batal</button>
            <button type="button" class="btn btn-primary" :disabled="wo.simpan" @click="simpanWo">{{ wo.simpan ? 'Membuat…' : 'Buat surat tugas' }}</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.td { padding-bottom: 40px; }
.muted { color: #94a3b8; }
kbd { display: inline-block; min-width: 16px; padding: 0 4px; border-radius: 4px; border: 1px solid #cbd5e1; border-bottom-width: 2px; font: 700 10px/14px ui-monospace, monospace; color: #475569; background: #fff; margin-left: 2px; }
.td-teks { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
.ava { width: 34px; height: 34px; border-radius: 50%; color: #fff; font-weight: 800; font-size: 12px; display: inline-grid; place-items: center; flex-shrink: 0; box-shadow: 0 0 0 2px #fff; }
.ava.kecil { width: 28px; height: 28px; font-size: 10.5px; }

/* SKELETON */
.td-skeleton { display: flex; flex-direction: column; gap: 12px; }
.sk { height: 120px; border-radius: 18px; background: linear-gradient(90deg, #f1f5f9 25%, #fafafa 50%, #f1f5f9 75%); background-size: 200% 100%; animation: td-kilau 1.2s infinite; }
.sk.h { height: 230px; }
@keyframes td-kilau { to { background-position: -200% 0; } }

/* HERO */
.td-hero { --st: #2563eb; --pr: #dc2626; position: relative; overflow: hidden; border-radius: 22px; padding: 16px 22px 18px; color: #fff; margin-bottom: 16px;
  background: radial-gradient(circle at 90% -10%, rgba(255, 255, 255, .22), transparent 45%), linear-gradient(125deg, color-mix(in srgb, var(--pr) 85%, #000) 0%, var(--pr) 35%, color-mix(in srgb, var(--st) 80%, var(--pr)) 100%);
  box-shadow: 0 16px 36px -18px var(--pr); animation: td-muncul .4s both; }
.td-hero-atas { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.td-kembali { border: 0; background: rgba(255, 255, 255, .16); color: #fff; font-weight: 700; font-size: 12.5px; padding: 5px 12px; border-radius: 99px; cursor: pointer; }
.td-kembali:hover { background: rgba(255, 255, 255, .28); }
.td-hero-aksi-kecil { display: flex; gap: 6px; }
.td-hero-aksi-kecil button { width: 34px; height: 34px; border-radius: 11px; border: 1px solid rgba(255, 255, 255, .3); background: rgba(255, 255, 255, .14); cursor: pointer; font-size: 14px; transition: transform .15s, background .15s; }
.td-hero-aksi-kecil button:hover { background: rgba(255, 255, 255, .3); transform: translateY(-2px); }
.td-hero-isi { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; margin-top: 12px; }
.td-hero-kiri { flex: 1 1 380px; min-width: 0; }
.td-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.td-chip { border: 0; font: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 99px; font-size: 11.5px; font-weight: 800; background: rgba(255, 255, 255, .18); color: #fff; }
.td-chip.prio { background: #fff; color: var(--pr); }
.td-chip.nomor { font-family: ui-monospace, monospace; cursor: pointer; }
.td-chip.denyut { animation: td-denyut 1.5s infinite; }
@keyframes td-denyut { 50% { box-shadow: 0 0 0 5px rgba(255, 255, 255, .3); } }
.td-hero h1 { margin: 10px 0 4px; font-size: 23px; font-weight: 900; line-height: 1.25; letter-spacing: -.4px; color: #fff; overflow-wrap: anywhere; }
.td-hero-site { margin: 0; font-size: 13px; opacity: .95; }
.td-hero-site a { color: #fff; font-weight: 800; text-decoration: underline; text-decoration-color: rgba(255, 255, 255, .4); text-underline-offset: 3px; }
.td-hero-angka { display: flex; gap: 10px; flex-wrap: wrap; }
.td-durasi, .td-sla { background: rgba(255, 255, 255, .14); border: 1px solid rgba(255, 255, 255, .25); border-radius: 16px; padding: 10px 14px; display: flex; flex-direction: column; min-width: 170px; backdrop-filter: blur(6px); }
.td-durasi small, .td-sla small { font-size: 11px; opacity: .85; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }
.td-durasi b, .td-sla b { font-size: 20px; font-weight: 900; line-height: 1.2; }
.td-durasi em, .td-sla em { font-style: normal; font-size: 11px; opacity: .8; }
.td-sla .trek { height: 7px; border-radius: 99px; background: rgba(255, 255, 255, .25); overflow: hidden; margin: 5px 0 3px; }
.td-sla .trek i { display: block; height: 100%; border-radius: 99px; background: #fff; transition: width .6s; }
.td-sla.s-lewat { background: rgba(0, 0, 0, .22); }
.td-sla.s-lewat .trek i { background: repeating-linear-gradient(45deg, #fff 0 6px, #fecaca 6px 12px); }
.td-sla.s-waspada .trek i { background: #fde68a; }

.td-stepper { display: flex; gap: 0; margin-top: 16px; background: rgba(0, 0, 0, .14); border-radius: 16px; padding: 4px; overflow-x: auto; }
.td-step { flex: 1; min-width: 110px; border: 0; background: none; color: rgba(255, 255, 255, .75); display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 700; transition: background .15s, color .15s; }
.td-step:hover:not(:disabled) { background: rgba(255, 255, 255, .14); color: #fff; }
.td-step:disabled { cursor: default; }
.td-step-bulat { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, .16); font-size: 12px; flex-shrink: 0; }
.td-step.lewat { color: #fff; }
.td-step.lewat .td-step-bulat { background: rgba(255, 255, 255, .9); color: var(--pr); font-weight: 900; }
.td-step.kini { background: #fff; color: var(--st); box-shadow: 0 6px 16px -8px rgba(0, 0, 0, .4); }
.td-step.kini .td-step-bulat { background: color-mix(in srgb, var(--st) 14%, #fff); }
.td-step-label { white-space: nowrap; }

.td-aksi { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; }
.td-pic { display: flex; align-items: center; gap: 9px; }
.td-pic > span:last-child { display: flex; flex-direction: column; line-height: 1.2; }
.td-pic small { font-size: 10.5px; opacity: .8; text-transform: uppercase; font-weight: 700; }
.td-pic b { font-size: 14px; }
.td-pic em { font-style: normal; font-size: 11px; opacity: .8; }
.td-aksi-tombol { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.td-btn { border: 1px solid #e2e8f0; background: #fff; color: #0f172a; border-radius: 11px; padding: 8px 13px; font-weight: 800; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: transform .15s, box-shadow .15s, background .15s; white-space: nowrap; text-decoration: none; }
.td-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 14px -8px rgba(15, 23, 42, .4); }
.td-btn:disabled { opacity: .55; cursor: not-allowed; }
.td-btn.hijau { background: #16a34a; border-color: #16a34a; color: #fff; }
.td-btn.ungu { background: #7c3aed; border-color: #7c3aed; color: #fff; }
.td-btn.biru { background: #2563eb; border-color: #2563eb; color: #fff; }
.td-btn.kecil { padding: 5px 10px; font-size: 12px; border-radius: 9px; }
.td-hero .td-btn:not(.hijau):not(.ungu) { background: rgba(255, 255, 255, .92); border-color: transparent; }
.td-menu { position: relative; }
.td-menu-isi { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; background: #fff; border-radius: 14px; box-shadow: 0 18px 40px -12px rgba(15, 23, 42, .4); padding: 6px; min-width: 220px; display: flex; flex-direction: column; animation: td-muncul .15s both; }
.td-menu-isi button { border: 0; background: none; text-align: left; padding: 9px 12px; border-radius: 9px; font-size: 13px; font-weight: 600; color: #0f172a; cursor: pointer; }
.td-menu-isi button:hover { background: #f1f5f9; }
.td-menu-isi .bahaya { color: #dc2626; }

/* GRID */
.td-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.td-utama { min-width: 0; }
.td-samping { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; }
.td-tab { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 12px; scrollbar-width: none; }
.td-tab button { border: 1px solid #e2e8f0; background: #fff; border-radius: 12px; padding: 9px 14px; font-weight: 800; font-size: 13px; color: #475569; cursor: pointer; white-space: nowrap; display: inline-flex; gap: 6px; align-items: center; transition: all .15s; }
.td-tab button:hover { color: #0f172a; border-color: #cbd5e1; }
.td-tab button.on { background: #0f172a; color: #fff; border-color: #0f172a; box-shadow: 0 8px 18px -10px rgba(15, 23, 42, .6); }
.td-tab-n { font-size: 10.5px; padding: 0 6px; border-radius: 99px; background: #f1f5f9; color: #334155; line-height: 17px; }
.td-tab button.on .td-tab-n { background: rgba(255, 255, 255, .2); color: #fff; }
.td-tab-n.merah { background: #dc2626 !important; color: #fff !important; }
.td-panel { display: flex; flex-direction: column; gap: 12px; animation: td-muncul .3s both; }
@keyframes td-muncul { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.td-kartu { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 14px 16px; min-width: 0; }
.td-kartu h4 { margin: 0 0 8px; font-size: 14px; font-weight: 800; color: #0f172a; }
.td-kartu.kosong { border-style: dashed; border-color: #fdba74; background: #fffbf5; }
.td-kartu-kepala { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.td-kartu-kepala h4 { margin: 0; }
.td-kanan { display: flex; gap: 6px; }
.td-kosong-kecil { padding: 18px 6px; text-align: center; color: #94a3b8; font-size: 12.5px; }
.td-link { border: 0; background: none; color: #2563eb; font-weight: 700; font-size: 12.5px; cursor: pointer; padding: 0; text-decoration: none; }
.td-link:hover { text-decoration: underline; }
.td-dua { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.td-ikon-btn { width: 30px; height: 30px; border-radius: 9px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 15px; }
.putar { display: inline-block; animation: td-putar .8s linear infinite; }
@keyframes td-putar { to { transform: rotate(360deg); } }
.td-tag { display: inline-block; font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 6px; background: #f1f5f9; color: #475569; margin-left: 6px; }
.td-tag.main { background: #dbeafe; color: #1d4ed8; margin-left: 0; } .td-tag.backup { background: #f1f5f9; color: #64748b; margin-left: 0; }

.td-kesimpulan { --nw: #64748b; display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 18px; border: 1.5px solid color-mix(in srgb, var(--nw) 40%, #fff); background: linear-gradient(120deg, color-mix(in srgb, var(--nw) 12%, #fff), #fff); }
.td-kesimpulan.datar { margin: 10px 0; padding: 10px 12px; border-radius: 12px; }
.td-kesimpulan-ikon { font-size: 26px; }
.td-kesimpulan > div { flex: 1; min-width: 0; }
.td-kesimpulan small { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }
.td-kesimpulan b { display: block; color: var(--nw); font-size: 16px; font-weight: 900; }
.td-kesimpulan p { margin: 2px 0 0; font-size: 12.5px; color: #334155; }

.td-downtime { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.td-dt-titik { display: flex; gap: 9px; align-items: center; min-width: 0; }
.td-dt-titik > div { display: flex; flex-direction: column; min-width: 0; }
.td-dt-titik small { font-size: 11px; color: #64748b; font-weight: 700; }
.td-dt-titik b { font-size: 13.5px; }
.td-dt-titik em { font-style: normal; font-size: 11px; color: #94a3b8; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bulat { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; flex-shrink: 0; }
.bulat.merah { background: #fee2e2; color: #dc2626; } .bulat.hijau { background: #dcfce7; color: #16a34a; } .bulat.abu { background: #f1f5f9; color: #94a3b8; }
.td-dt-garis { flex: 1; min-width: 100px; height: 4px; border-radius: 99px; background: linear-gradient(90deg, #dc2626, #16a34a); position: relative; }
.td-dt-garis.hidup { background: repeating-linear-gradient(90deg, #dc2626 0 10px, #fecaca 10px 20px); background-size: 20px 4px; animation: td-alir 1s linear infinite; }
@keyframes td-alir { to { background-position: 20px 0; } }
.td-dt-garis span { position: absolute; left: 50%; top: -24px; transform: translateX(-50%); background: #0f172a; color: #fff; font-size: 11.5px; font-weight: 800; padding: 2px 9px; border-radius: 99px; white-space: nowrap; }

.td-rca { display: flex; flex-direction: column; gap: 8px; }
.td-rca span { display: flex; flex-direction: column; }
.td-rca small { font-size: 11px; color: #94a3b8; font-weight: 700; }
.td-rca b { font-size: 13px; font-weight: 600; color: #0f172a; }

.td-wo { width: 100%; display: flex; gap: 10px; align-items: center; border: 1px solid #f1f5f9; background: #fafafa; border-radius: 13px; padding: 9px 11px; margin-top: 6px; cursor: pointer; font: inherit; text-align: left; transition: background .15s, transform .15s; }
.td-wo:hover { background: #f1f5f9; transform: translateX(2px); }
.td-wo-ikon { font-size: 20px; }
.td-wo-isi { flex: 1; display: flex; flex-direction: column; min-width: 0; font-size: 12.5px; }
.td-wo-isi small { color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-wo-st { font-size: 11px; font-weight: 800; border: 1.5px solid; border-radius: 99px; padding: 2px 9px; white-space: nowrap; }

.td-feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.td-feed li { display: flex; gap: 11px; position: relative; padding-bottom: 14px; }
.td-feed li:not(:last-child)::before { content: ''; position: absolute; left: 14px; top: 30px; bottom: 0; width: 2px; background: #f1f5f9; }
.td-feed-titik { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; flex-shrink: 0; color: #fff; box-shadow: 0 0 0 3px #fff; }
.td-feed.mini li { padding-bottom: 8px; gap: 9px; }
.td-feed.mini li::before { display: none; }
.td-feed.mini .td-feed-titik { width: 9px; height: 9px; margin-top: 5px; }
.td-feed.mini b { display: block; font-size: 12.5px; font-weight: 600; white-space: pre-wrap; overflow-wrap: anywhere; }
.td-feed.mini small { font-size: 11px; color: #94a3b8; }
.td-feed-isi { flex: 1; min-width: 0; background: #f8fafc; border-radius: 13px; padding: 9px 12px; }
.td-feed-atas { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.td-feed-atas b { font-size: 12.5px; }
.td-feed-atas small { font-size: 11px; color: #94a3b8; }
.td-feed-isi p { font-size: 13px; color: #334155; margin-top: 4px; }
.td-status-kecil { --st: #64748b; display: inline-block; margin-top: 4px; font-size: 11px; font-weight: 800; padding: 1px 9px; border-radius: 99px; background: color-mix(in srgb, var(--st) 12%, #fff); color: var(--st); }
.td-foto-mini { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.td-foto-mini img { width: 64px; height: 64px; object-fit: cover; border-radius: 9px; cursor: zoom-in; transition: transform .15s; }
.td-foto-mini img:hover { transform: scale(1.06); }

.td-composer textarea { width: 100%; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; font: inherit; font-size: 13.5px; resize: vertical; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; }
.td-composer textarea:focus { border-color: #93c5fd; box-shadow: 0 0 0 4px rgba(59, 130, 246, .12); }
.td-cepat { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0; }
.td-cepat button { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 99px; padding: 3px 10px; font-size: 11.5px; font-weight: 600; color: #334155; cursor: pointer; transition: all .12s; }
.td-cepat button:hover { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.td-composer-bawah { display: flex; gap: 8px; justify-content: space-between; flex-wrap: wrap; }
.td-composer-bawah select { max-width: 280px; }

/* Monitoring */
.td-router { border: 1px solid #f1f5f9; border-radius: 14px; padding: 10px 12px; margin-top: 8px; }
.td-router-baris { display: flex; gap: 10px; align-items: flex-start; }
.td-router-dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 0%, #f1f5f9); }
.td-router-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.td-router-info small { font-size: 11.5px; color: #64748b; }
.td-tunnel { display: flex; flex-wrap: wrap; gap: 5px; margin: 3px 0; }
.td-tunnel span { font: 700 11px ui-monospace, monospace; padding: 2px 8px; border-radius: 7px; }
.td-tunnel .on { background: #dcfce7; color: #15803d; } .td-tunnel .off { background: #fee2e2; color: #b91c1c; } .td-tunnel .macet { background: #ffedd5; color: #c2410c; }
.td-tunnel small { font-weight: 500; }
.td-kejadian { margin-top: 8px; max-height: 260px; overflow-y: auto; border-top: 1px dashed #e2e8f0; padding-top: 6px; }
.td-kj { display: grid; grid-template-columns: 130px 110px 1fr; gap: 8px; font-size: 11.5px; padding: 3px 0; align-items: center; }
.td-kj .at { color: #64748b; }
.td-kj .jenis { font-weight: 800; padding: 1px 7px; border-radius: 6px; text-align: center; }
.td-kj .jenis.on { background: #dcfce7; color: #15803d; } .td-kj .jenis.off { background: #fee2e2; color: #b91c1c; }
.td-kj .det { color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-sensor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
.td-sensor { --sw: #64748b; display: flex; gap: 9px; align-items: flex-start; border: 1.5px solid #e2e8f0; background: #fff; border-radius: 13px; padding: 9px 11px; cursor: pointer; font: inherit; text-align: left; transition: all .15s; }
.td-sensor:hover { border-color: var(--sw); }
.td-sensor.on { border-color: var(--sw); background: color-mix(in srgb, var(--sw) 7%, #fff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sw) 15%, transparent); }
.td-sensor .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--sw); margin-top: 4px; flex-shrink: 0; }
.td-sensor .isi { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12.5px; }
.td-sensor .isi small { color: #94a3b8; font-size: 11px; }
.td-sensor .isi .pesan { color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-sensor .lbl { font-size: 10.5px; font-weight: 800; color: var(--sw); background: color-mix(in srgb, var(--sw) 12%, #fff); border-radius: 99px; padding: 1px 8px; white-space: nowrap; }
.td-seg { display: inline-flex; background: #f1f5f9; border-radius: 11px; padding: 3px; gap: 2px; }
.td-seg button { border: 0; background: none; border-radius: 8px; padding: 5px 11px; font-size: 12px; font-weight: 700; color: #64748b; cursor: pointer; }
.td-seg button.on { background: #fff; color: #0f172a; box-shadow: 0 1px 4px rgba(15, 23, 42, .12); }
.td-seg.lebar { display: flex; }
.td-seg.lebar button { flex: 1; padding: 9px; font-size: 12.5px; }
.td-live { color: #dc2626; font-size: 11.5px; animation: td-kedip 1.2s infinite; }
@keyframes td-kedip { 50% { opacity: .3; } }
.td-grafik { background: #f8fafc; border-radius: 12px; min-height: 180px; display: grid; place-items: center; margin-bottom: 6px; overflow: hidden; }
.td-grafik img { max-width: 100%; display: block; }

/* Lapangan */
.td-jalan { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; position: relative; }
.td-jalan-step { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; position: relative; padding: 4px; }
.td-jalan-step:not(:last-child)::after { content: ''; position: absolute; top: 22px; left: calc(50% + 24px); right: calc(-50% + 24px); height: 3px; border-radius: 99px; background: #e2e8f0; }
.td-jalan-step.lewat:not(:last-child)::after { background: #22c55e; }
.td-jalan-step .bulat { width: 44px; height: 44px; font-size: 19px; background: #f1f5f9; transition: transform .2s; }
.td-jalan-step.lewat .bulat { background: #dcfce7; }
.td-jalan-step.kini .bulat { background: #fef3c7; animation: td-loncat 1.6s infinite; }
@keyframes td-loncat { 50% { transform: translateY(-4px); } }
.td-jalan-step b { font-size: 12.5px; }
.td-jalan-step small { font-size: 11px; color: #94a3b8; }
.td-peta { height: 340px; border-radius: 14px; overflow: hidden; z-index: 0; }
.td-peta-kaki { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; font-size: 12px; }
:deep(.td-pin) { background: none; border: 0; }
:deep(.td-pin span) { display: block; font-size: 28px; line-height: 1; filter: drop-shadow(0 3px 3px rgba(0, 0, 0, .35)); }
.td-foto-grup { margin-bottom: 10px; }
.td-foto-lbl { display: block; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 6px; }
.td-foto-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.td-foto { border: 0; padding: 0; background: #f1f5f9; border-radius: 12px; overflow: hidden; cursor: zoom-in; position: relative; aspect-ratio: 1; }
.td-foto img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s; }
.td-foto:hover img { transform: scale(1.08); }
.td-foto small { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 6px 4px; font-size: 10px; color: #fff; background: linear-gradient(transparent, rgba(0, 0, 0, .65)); }

/* Sidebar */
.td-site dl { margin: 0; display: grid; grid-template-columns: 78px 1fr; gap: 6px 10px; font-size: 12.5px; }
.td-site dt { color: #94a3b8; font-weight: 700; font-size: 11.5px; }
.td-site dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.td-site dd small { color: #94a3b8; font-family: ui-monospace, monospace; font-size: 10.5px; margin-left: 6px; white-space: nowrap; }
.td-site a { color: #2563eb; font-weight: 700; text-decoration: none; }
.td-kontak { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f8fafc; }
.td-kontak:last-child { border-bottom: 0; }
.td-kontak .nm { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12.5px; line-height: 1.25; }
.td-kontak .nm small { font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-kontak .nm em { font-style: normal; font-size: 9.5px; background: #dbeafe; color: #1d4ed8; padding: 0 5px; border-radius: 4px; vertical-align: middle; }
.td-k { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; text-decoration: none; font-size: 14px; flex-shrink: 0; transition: transform .15s; }
.td-k:hover { transform: scale(1.12); }
.td-k.wa { background: #dcfce7; } .td-k.tel { background: #dbeafe; } .td-k.mail { background: #f3e8ff; }
.td-isp { padding: 8px 0; border-bottom: 1px solid #f8fafc; display: flex; flex-direction: column; gap: 3px; }
.td-isp:last-child { border-bottom: 0; }
.td-isp-atas { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; }
.td-isp-atas small { color: #64748b; font-size: 11px; }
.td-isp-no { font-size: 11.5px; color: #64748b; }
.td-salin { border: 0; background: none; cursor: pointer; color: #2563eb; }
.td-isp-kontak { display: flex; align-items: center; gap: 5px; }
.td-isp-kontak small { flex: 1; font-size: 11.5px; color: #64748b; }
.td-rel { width: 100%; display: flex; gap: 8px; align-items: center; border: 0; background: none; padding: 7px 4px; border-radius: 10px; cursor: pointer; font: inherit; text-align: left; }
.td-rel:hover { background: #f8fafc; }
.td-rel-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.td-rel .isi { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12.5px; }
.td-rel .isi b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-rel .isi small { font-size: 10.5px; color: #94a3b8; }

/* Lightbox */
.td-lightbox { position: fixed; inset: 0; z-index: 3000; background: rgba(15, 23, 42, .92); display: flex; align-items: center; justify-content: center; gap: 12px; padding: 20px; animation: td-muncul .2s both; }
.td-lightbox figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 90vw; }
.td-lightbox img { max-width: 100%; max-height: 80vh; border-radius: 12px; box-shadow: 0 20px 50px rgba(0, 0, 0, .5); }
.td-lightbox figcaption { color: #cbd5e1; font-size: 12.5px; }
.td-lb-x { position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%; border: 0; background: rgba(255, 255, 255, .14); color: #fff; font-size: 16px; cursor: pointer; }
.td-lb-nav { width: 46px; height: 46px; border-radius: 50%; border: 0; background: rgba(255, 255, 255, .14); color: #fff; font-size: 26px; cursor: pointer; flex-shrink: 0; }
.td-lb-nav:hover, .td-lb-x:hover { background: rgba(255, 255, 255, .28); }

/* Modal */
.td-modal { max-width: 600px; }
.td-modal-kepala { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 16px 20px 12px; border-bottom: 1px solid #f1f5f9; background: linear-gradient(120deg, #eff6ff, #fff); border-top-left-radius: inherit; border-top-right-radius: inherit; }
.td-modal-kepala.hijau { background: linear-gradient(120deg, #dcfce7, #fff); }
.td-modal-kepala h3 { margin: 0; font-size: 17px; font-weight: 900; }
.td-modal-kepala small { color: #64748b; font-size: 12px; }
.td-form { display: flex; flex-direction: column; gap: 12px; }
.td-form label, .td-field { display: flex; flex-direction: column; gap: 5px; }
.td-info { margin: 0; font-size: 12px; color: #64748b; background: #f8fafc; border-radius: 10px; padding: 8px 10px; }
.td-peringatan { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.td-prio-pilih { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.td-prio-pilih button { --pw: #64748b; border: 2px solid #e2e8f0; background: #fff; border-radius: 13px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all .15s; }
.td-prio-pilih button span { font-size: 19px; }
.td-prio-pilih button b { font-size: 12px; color: var(--pw); }
.td-prio-pilih button small { font-size: 10px; color: #94a3b8; }
.td-prio-pilih button.on { border-color: var(--pw); background: color-mix(in srgb, var(--pw) 9%, #fff); transform: translateY(-2px); }
.td-tl { list-style: none; margin: 0; padding: 0; }
.td-tl li { --tc: #64748b; display: flex; gap: 12px; position: relative; padding-bottom: 16px; }
.td-tl li:not(:last-child)::before { content: ''; position: absolute; left: 17px; top: 36px; bottom: 0; width: 2px; background: color-mix(in srgb, var(--tc) 30%, #f1f5f9); }
.td-tl-ikon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--tc) 15%, #fff); border: 2px solid var(--tc); font-size: 15px; flex-shrink: 0; }
.td-tl li > div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.td-tl b { font-size: 13.5px; }
.td-tl small { font-size: 11.5px; color: #94a3b8; }
.td-tl p { font-size: 12.5px; color: #475569; }

@media (max-width: 1100px) {
  .td-grid { grid-template-columns: minmax(0, 1fr); }
  .td-samping { position: static; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
}
@media (max-width: 768px) {
  .td-hero { padding: 14px 14px 16px; border-radius: 18px; }
  .td-hero h1 { font-size: 19px; }
  .td-durasi, .td-sla { min-width: 0; flex: 1; }
  .td-btn kbd { display: none; }
  .td-dua { grid-template-columns: 1fr; }
  .td-jalan { grid-template-columns: repeat(2, 1fr); row-gap: 14px; }
  .td-jalan-step::after { display: none; }
  .td-kj { grid-template-columns: 1fr; gap: 2px; padding: 6px 0; border-bottom: 1px solid #f8fafc; }
  .td-prio-pilih { grid-template-columns: repeat(2, 1fr); }
  .td-peta { height: 260px; }
  .td-lb-nav { position: absolute; bottom: 20px; }
  .td-lb-nav.kiri { left: 20px; } .td-lb-nav.kanan { right: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .td *, .td *::before, .td *::after { animation: none !important; transition: none !important; }
}
</style>
