<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useProyekStore } from '@/stores/proyek'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const proyek = useProyekStore()
const auth = useAuthStore()
const bisaKelolaKoneksi = computed(() => auth.hasRole('Admin') || auth.hasRole('Director'))
const tab = ref<'koneksi' | 'mapping' | 'audit' | 'graph'>('mapping')

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
const configForm = ref({ base_url: '', username: '', passhash: '', durasi_konfirmasi_menit: 10 })
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

async function fetchConfig() {
  try {
    const d = (await api.get('/prtg/config')).data.data
    configForm.value.base_url = d.base_url
    configForm.value.username = d.username
    configHasPasshash.value = d.has_passhash
    configForm.value.durasi_konfirmasi_menit = d.durasi_konfirmasi_menit ?? 10
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

// ─── MAPPING ──────────────────────────────────────────────────
const mappingList = ref<any[]>([])
const unmatchedList = ref<any[]>([])
const mappingLoading = ref(false)
const mapForm = ref({ device_name: '', id_site: 0 })
const mapSubmitting = ref(false)
const mapMsg = ref('')
const hapusMappingId = ref(0)

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
// Filter/search berubah -> balik ke halaman 1, dan jangan sampai nyangkut di halaman kosong/invalid
watch([searchDevice, onlyUnmatched], () => { auditPage.value = 1 })
watch(filteredDevices, () => { if (auditPage.value > auditTotalPages.value) auditPage.value = auditTotalPages.value })
watch(auditPage, (v) => {
  const clamped = Math.min(Math.max(1, Math.trunc(v) || 1), auditTotalPages.value)
  if (clamped !== v) auditPage.value = clamped
})

function mapDariAudit(deviceName: string) {
  tab.value = 'mapping'
  mapForm.value.device_name = deviceName
}

// ─── GRAPH PING & ETHER ───────────────────────────────────────
const graphSiteId  = ref<number | null>(null)
const graphHours   = ref(0)  // graphid: 0=live, 1=48jam, 2=30hari, 3=365hari
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
    // Support format baru (array) dan lama (single object)
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

const isPing = (name: string) => /ping|icmp/i.test(name)

// Base URL API untuk src gambar graph (token ikut cookie/auth header)
function graphImgUrl(objid: number, graphid = 0) {
  return `/api/prtg/sensor/${objid}/graph.png?graphid=${graphid}&hours=${graphHours.value}&t=${Date.now()}`
}

// Simple SVG line chart dari data historis PRTG
function buildSparkline(points: any[], key: string, color: string, w = 600, h = 80): string {
  const vals = points.map(p => {
    const v = p[key]
    return typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')) || null
  }).filter(v => v !== null) as number[]
  if (vals.length < 2) return ''
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const xs = vals.map((_, i) => (i / (vals.length - 1)) * w)
  const ys = vals.map(v => h - ((v - min) / range) * (h - 6) - 3)
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const area = `M${xs[0].toFixed(1)},${h} ` + xs.map((x, i) => `L${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ') + ` L${xs[xs.length-1].toFixed(1)},${h} Z`
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${h}px">
    <path d="${area}" fill="${color}" opacity="0.15"/>
    <path d="${d}" stroke="${color}" stroke-width="1.5" fill="none"/>
  </svg>`
}

// Ambil nilai numerik channel terakhir dari histdata
function lastVal(points: any[], key: string) {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i][key]
    if (v !== null && v !== undefined && v !== '') return v
  }
  return null
}

onMounted(async () => {
  await Promise.all([fetchStatus(), fetchConfig(), fetchMapping(), proyek.fetchSiteList(), fetchPending()])
  // Refresh pending list tiap 15 detik (tampilkan countdown live)
  pendingInterval = setInterval(fetchPending, 15_000)
})

import { onUnmounted } from 'vue'
onUnmounted(() => { if (pendingInterval) clearInterval(pendingInterval) })
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>📡 PRTG — Monitoring</h2>
      <p class="sub">Koneksi API, mapping device ↔ site pelanggan, dan audit sensor</p>
    </div>

    <div class="status-bar" v-if="status">
      <span class="status-dot" :class="(status.is_aktif && status.configured) ? 'ok' : 'off'"></span>
      <span>{{ status.pesan }}</span>
      <button v-if="bisaKelolaKoneksi" class="toggle-btn" :class="{ paused: !status.is_aktif }"
        :disabled="toggling" @click="toggleAktif">
        {{ toggling ? '...' : (status.is_aktif ? '⏸ Jeda Polling' : '▶ Aktifkan Polling') }}
      </button>
    </div>

    <!-- Grace period banner -->
    <div v-if="pendingList.length" class="pending-banner">
      <div class="pending-banner-head">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <strong>{{ pendingList.length }} device dalam grace period</strong>
        <span class="pending-sub"> — menunggu konfirmasi sebelum tiket & WA dibuat (anti false alarm)</span>
      </div>
      <div class="pending-items">
        <div v-for="p in pendingList" :key="p.device_name" class="pending-item">
          <span class="pending-device">{{ p.device_name }}</span>
          <span class="pending-sensor">{{ p.sensor_name }}</span>
          <span class="pending-dot"></span>
          <span class="pending-since">Down sejak {{ fmtTime(p.first_seen_at) }}</span>
          <span class="pending-sisa" :class="p.sisa_detik <= 0 ? 'sisa-segera' : ''">
            {{ p.sisa_detik <= 0 ? '⚡ Segera diproses...' : `⏱ ${fmtSisa(p.sisa_detik)} lagi` }}
          </span>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button :class="['tab', { active: tab === 'mapping' }]" @click="tab = 'mapping'">🔗 Mapping Device → Site</button>
      <button :class="['tab', { active: tab === 'audit' }]" @click="tab = 'audit'; fetchDevices()">🔍 Audit Sensor</button>
      <button :class="['tab', { active: tab === 'graph' }]" @click="tab = 'graph'">📈 Ping & Traffic</button>
      <button v-if="bisaKelolaKoneksi" :class="['tab', { active: tab === 'koneksi' }]" @click="tab = 'koneksi'">⚙️ Koneksi</button>
    </div>

    <!-- ─── TAB: MAPPING ─── -->
    <div v-if="tab === 'mapping'" class="tab-content">
      <div class="card" v-if="unmatchedList.length">
        <h3>⚠️ Belum Termapping (24 jam terakhir)</h3>
        <p class="hint">Device ini pernah down tapi tidak cocok dengan site manapun secara otomatis. Klik untuk isi form mapping.</p>
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
            <select v-model.number="mapForm.id_site">
              <option :value="0">— Pilih site —</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">[{{ s.kode_site }}] {{ s.nama_site }}</option>
            </select>
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
        <table v-else>
          <thead><tr><th>Nama Device PRTG</th><th>Site</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!mappingList.length"><td colspan="3" class="empty">Belum ada mapping manual</td></tr>
            <tr v-for="m in mappingList" :key="m.id_mapping">
              <td class="mono">{{ m.device_name }}</td>
              <td>[{{ m.site.kode_site }}] {{ m.site.nama_site }}</td>
              <td><button class="btn-hapus" :disabled="hapusMappingId === m.id_mapping" @click="hapusMapping(m.id_mapping, m.device_name)">{{ hapusMappingId === m.id_mapping ? 'Menghapus...' : 'Hapus' }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── TAB: AUDIT ─── -->
    <div v-if="tab === 'audit'" class="tab-content">
      <div class="card">
        <div class="audit-toolbar">
          <input v-model="searchDevice" class="search-input" placeholder="🔍 Cari nama device..." />
          <label class="chk"><input type="checkbox" v-model="onlyUnmatched" /> Hanya yang belum match</label>
          <button class="btn-secondary" @click="fetchDevices">🔄 Muat Ulang</button>
        </div>
        <p v-if="auditError" class="msg err">{{ auditError }}</p>
        <div v-if="auditLoading" class="loading">Memuat dari PRTG...</div>
        <template v-else>
          <p class="result-count">{{ filteredDevices.length }} dari {{ devices.length }} device</p>
          <table>
            <thead><tr><th>Device PRTG</th><th>Sensor</th><th>Ada Down</th><th>Status Match</th><th>Site</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!filteredDevices.length"><td colspan="6" class="empty">{{ devices.length ? 'Tidak ada device yang cocok pencarian' : 'Tidak ada data — klik Muat Ulang' }}</td></tr>
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
          <div v-if="auditTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="auditPage === 1" @click="auditPage = 1">« Awal</button>
            <button class="page-btn" :disabled="auditPage === 1" @click="auditPage--">‹ Sebelumnya</button>
            <span class="page-info">
              Halaman
              <input type="number" class="page-jump" min="1" :max="auditTotalPages" v-model.number="auditPage" />
              / {{ auditTotalPages }}
            </span>
            <button class="page-btn" :disabled="auditPage === auditTotalPages" @click="auditPage++">Berikutnya ›</button>
            <button class="page-btn" :disabled="auditPage === auditTotalPages" @click="auditPage = auditTotalPages">Akhir »</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ─── TAB: KONEKSI ─── -->
    <div v-if="tab === 'koneksi' && bisaKelolaKoneksi" class="tab-content">
      <div class="card">
        <h3>Koneksi API PRTG</h3>
        <div class="field">
          <label>Base URL</label>
          <input v-model="configForm.base_url" placeholder="http://103.238.202.58:8081" />
        </div>
        <div class="field">
          <label>Username</label>
          <input v-model="configForm.username" placeholder="root" />
        </div>
        <div class="field">
          <label>Passhash {{ configHasPasshash ? '(sudah tersimpan — isi hanya jika ingin ganti)' : '' }}</label>
          <input v-model="configForm.passhash" type="password" :placeholder="configHasPasshash ? '••••••••' : 'Passhash PRTG'" />
        </div>
      </div>

      <div class="card">
        <h3>Anti False Alarm — Grace Period</h3>
        <p class="hint">
          Sensor harus bertahan Down selama durasi ini sebelum tiket dibuat dan notifikasi WA dikirim.
          Jika sensor kembali Up dalam waktu ini, dianggap false alarm — tidak ada tiket, tidak ada WA.
          Ideal untuk kondisi akses VPN ke perangkat site yang bisa disconnect singkat.
        </p>
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

        <button class="btn-submit" @click="saveConfig" :disabled="savingConfig">
          {{ savingConfig ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
        </button>
        <p v-if="configMsg" class="msg">{{ configMsg }}</p>
      </div>
    </div>

    <!-- ─── TAB: PING & TRAFFIC GRAPH ─── -->
    <div v-if="tab === 'graph'" class="tab-content">
      <div class="card">
        <div class="graph-toolbar">
          <div class="field" style="min-width:260px;margin:0">
            <label>Pilih Site</label>
            <select v-model="graphSiteId" @change="fetchGraphSensors()">
              <option :value="null" disabled>-- pilih site --</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">
                {{ s.nama_site }} ({{ s.kode_site }})
              </option>
            </select>
          </div>
          <div class="field" style="min-width:160px;margin:0">
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
        <div v-if="!graphDevices.length" class="card">
          <p class="empty">Tidak ada device PRTG yang cocok untuk site ini. Buat mapping manual di tab Mapping.</p>
        </div>

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
          <div class="card" v-else>
            <p class="empty">Tidak ada sensor ditemukan untuk device ini</p>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0 0 16px; font-size: 13px; color: #64748b; }

/* Grace period banner */
.pending-banner { background: #fffbeb; border: 1px solid #fde68a; border-left: 3px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; }
.pending-banner-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #92400e; margin-bottom: 8px; }
.pending-sub { font-weight: 400; }
.pending-items { display: flex; flex-direction: column; gap: 5px; }
.pending-item { display: flex; align-items: center; gap: 8px; font-size: 12px; background: rgba(255,255,255,.7); border-radius: 6px; padding: 6px 10px; }
.pending-device { font-weight: 700; color: #334155; font-family: monospace; }
.pending-sensor { color: #64748b; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pending-dot { width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; animation: blink 1s infinite; }
.pending-since { color: #94a3b8; white-space: nowrap; }
.pending-sisa { font-weight: 700; color: #b45309; white-space: nowrap; }
.sisa-segera { color: #dc2626; animation: blink .5s infinite; }
@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:.4 } }

/* Durasi flow preview */
.durasi-preview { margin: 16px 0; }
.durasi-flow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.dp-step { padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; text-align: center; }
.dp-warn { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.dp-ok { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
.dp-silent { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
.dp-arrow { font-size: 12px; color: #94a3b8; white-space: nowrap; font-weight: 600; }
.dp-split { display: flex; flex-direction: column; gap: 6px; }
.dp-step small { font-weight: 400; display: block; margin-top: 2px; }

.status-bar { display: flex; align-items: center; gap: 8px; background: #fff; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #334155; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot.ok { background: #22c55e; }
.status-dot.off { background: #ef4444; }
.toggle-btn { margin-left: auto; padding: 6px 14px; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; background: #fef2f2; color: #dc2626; }
.toggle-btn.paused { background: #f0fdf4; color: #15803d; }
.toggle-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.tabs { display: flex; gap: 6px; margin-bottom: 16px; border-bottom: 1.5px solid #e2e8f0; }
.tab { padding: 10px 16px; background: none; border: none; border-bottom: 2px solid transparent; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.tab.active { color: #1e40af; border-bottom-color: #1e40af; }

.tab-content { display: flex; flex-direction: column; gap: 16px; }
.card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; }
.card h3 { margin: 0 0 6px; font-size: 15px; color: #0f172a; }
.hint { margin: 0 0 12px; font-size: 12px; color: #94a3b8; }

.unmatched-list { display: flex; gap: 8px; flex-wrap: wrap; }
.unmatched-chip { padding: 6px 12px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 16px; font-size: 12px; cursor: pointer; }
.unmatched-chip:hover { background: #fef3c7; }

.form-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; min-width: 220px; flex: 1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input, .field select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }

.btn-submit { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; margin-bottom: 10px; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { padding: 8px 14px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.msg { font-size: 13px; color: #15803d; margin: 8px 0 0; }
.msg.err { color: #dc2626; }

table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 11px 12px; font-size: 13px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.mono { font-family: 'Consolas', monospace; font-size: 12px; }
.center { text-align: center; }
.empty { text-align: center; color: #94a3b8; padding: 24px; }
.loading { padding: 24px; text-align: center; color: #94a3b8; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-map { padding: 4px 10px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-map-add { padding: 4px 10px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.device-header { display: flex; align-items: center; gap: 10px; margin: 12px 0 4px; }
.device-label { font-size: 14px; font-weight: 700; color: #0f172a; }
.sensor-count { font-size: 12px; color: #94a3b8; }

.audit-toolbar { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.search-input { flex: 1; min-width: 200px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.search-input:focus { border-color: #3b82f6; background: #fff; }
.chk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; white-space: nowrap; }
.result-count { margin: 0 0 10px; font-size: 12px; color: #94a3b8; }

.pagination { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 16px 0 4px; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; }
.page-jump { width: 52px; padding: 5px 6px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; text-align: center; outline: none; }
.page-jump:focus { border-color: #3b82f6; }

.badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge-auto { background: #eff6ff; color: #1d4ed8; }
.badge-manual { background: #f0fdf4; color: #15803d; }
.badge-none { background: #fef2f2; color: #dc2626; }

/* ─── Graph tab ─── */
.graph-toolbar { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 4px; }

.sensor-block { border-top: 1px solid #f1f5f9; }
.sensor-block:first-of-type { border-top: none; }
.sensor-row { display: flex; align-items: center; gap: 10px; padding: 12px 4px; cursor: pointer; }
.sensor-row:hover { background: #f8fafc; border-radius: 6px; }
.sensor-name { flex: 1; font-size: 14px; font-weight: 600; color: #0f172a; }
.sensor-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
.st-up   { background: #f0fdf4; color: #15803d; }
.st-down { background: #fef2f2; color: #dc2626; }
.sensor-toggle { color: #94a3b8; font-size: 12px; }

.sensor-detail { padding: 0 4px 16px; }
.graph-wrap { margin-bottom: 14px; }
.graph-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin: 0 0 6px; }
.prtg-graph-img { width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; }

.sparkline-wrap { display: flex; flex-direction: column; gap: 8px; }
.spark-row { display: grid; grid-template-columns: 180px 80px 1fr; align-items: center; gap: 8px; }
.spark-label { font-size: 12px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spark-last  { font-size: 12px; font-weight: 700; color: #0f172a; font-family: monospace; text-align: right; }
.spark-chart { overflow: hidden; border-radius: 4px; }
</style>
