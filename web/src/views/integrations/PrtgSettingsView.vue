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
const configForm = ref({ base_url: '', username: '', passhash: '' })
const configHasPasshash = ref(false)
const savingConfig = ref(false)
const configMsg = ref('')

async function fetchConfig() {
  try {
    const d = (await api.get('/prtg/config')).data.data
    configForm.value.base_url = d.base_url
    configForm.value.username = d.username
    configHasPasshash.value = d.has_passhash
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
const graphHours   = ref(24)
const graphSensors = ref<{ device_name: string; ping: any[]; ether: any[]; other: any[] } | null>(null)
const graphLoading = ref(false)
const graphError   = ref('')
const openSensorId = ref<number | null>(null)

async function fetchGraphSensors() {
  if (!graphSiteId.value) return
  graphLoading.value = true; graphError.value = ''; graphSensors.value = null
  try {
    const r = await api.get(`/prtg/site/${graphSiteId.value}/sensors`)
    // Normalise: backend sekarang return { device_name, sensors[] }
    const d = r.data.data
    graphSensors.value = d
  } catch (e: any) { graphError.value = e.response?.data?.message || 'Gagal memuat sensor' }
  finally { graphLoading.value = false }
}

const graphBlobUrls2 = ref<Record<string, string>>({})
const graphBlobLoading2 = ref<Record<string, boolean>>({})

async function openSensorHistory(objid: number) {
  if (openSensorId.value === objid) { openSensorId.value = null; return }
  openSensorId.value = objid
  const key = `${objid}_${graphHours.value}`
  if (graphBlobUrls2.value[key] || graphBlobLoading2.value[key]) return
  graphBlobLoading2.value[key] = true
  try {
    const r = await api.get(`/prtg/sensor/${objid}/graph.png`, {
      params: { hours: graphHours.value },
      responseType: 'blob',
    })
    graphBlobUrls2.value[key] = URL.createObjectURL(r.data)
  } catch {} finally { delete graphBlobLoading2.value[key] }
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
  await Promise.all([fetchStatus(), fetchConfig(), fetchMapping(), proyek.fetchSiteList()])
})
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
                <td><button v-if="!d.matched" class="btn-map" @click="mapDariAudit(d.device_name)">Map ke Site</button></td>
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
        <button class="btn-submit" @click="saveConfig" :disabled="savingConfig">
          {{ savingConfig ? 'Menyimpan...' : 'Simpan Koneksi' }}
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
            <select v-model="graphHours" @change="graphSiteId && fetchGraphSensors()">
              <option :value="6">6 jam</option>
              <option :value="24">24 jam</option>
              <option :value="48">48 jam</option>
              <option :value="168">7 hari</option>
            </select>
          </div>
        </div>
        <div v-if="graphLoading" class="loading">Memuat sensor...</div>
        <div v-if="graphError" class="msg err">{{ graphError }}</div>
        <div v-if="!graphSiteId && !graphLoading" class="empty">Pilih site untuk melihat data Ping & Traffic</div>
      </div>

      <template v-if="graphSensors">
        <p class="hint" style="margin:0">
          Device: <strong>{{ graphSensors.device_name }}</strong>
          — {{ graphSensors.sensors?.length ?? 0 }} sensor
        </p>

        <div class="card" v-if="graphSensors.sensors?.length">
          <div v-for="s in graphSensors.sensors" :key="s.objid" class="sensor-block">
            <div class="sensor-row" @click="openSensorHistory(s.objid)">
              <span class="sensor-name">{{ s.sensor }}</span>
              <span :class="['sensor-status', s.status_raw <= 3 ? 'st-up' : 'st-down']">{{ s.status }}</span>
              <span class="sensor-toggle">{{ openSensorId === s.objid ? '▲' : '▼' }}</span>
            </div>

            <div v-if="openSensorId === s.objid" class="sensor-detail">
              <p class="graph-label">PRTG Graph — {{ graphHours }} jam terakhir</p>
              <div v-if="graphBlobLoading2[`${s.objid}_${graphHours}`]" class="loading" style="padding:12px">Memuat graph...</div>
              <img v-else-if="graphBlobUrls2[`${s.objid}_${graphHours}`]"
                :src="graphBlobUrls2[`${s.objid}_${graphHours}`]" class="prtg-graph-img" />
              <p v-else class="empty" style="padding:12px">Graph tidak tersedia</p>
            </div>
          </div>
        </div>
        <div class="card" v-else>
          <p class="empty">Tidak ada sensor ditemukan untuk device ini di PRTG</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0 0 16px; font-size: 13px; color: #64748b; }

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
