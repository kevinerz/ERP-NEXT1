<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'

interface Device {
  id_perangkat: number
  ip_address: string
  jenis_perangkat: string
  merk: string | null
  tipe_model: string | null
  site: { nama_site: string; kota?: string | null; pelanggan?: { nama_pelanggan: string } | null } | null
}

type PingStatus = 'unknown' | 'checking' | 'up' | 'down'

interface RunResult {
  ip: string
  success: boolean
  output: string
  duration: number
  error?: string
}

const devices = ref<Device[]>([])
const selected = ref<Set<string>>(new Set())
const search = ref('')
const command = ref('/ip address print')
const running = ref(false)
const results = ref<RunResult[]>([])
const loadingDevices = ref(true)
const devError = ref('')

const pingStatus = ref<Map<string, PingStatus>>(new Map())
const pingLatency = ref<Map<string, number>>(new Map())

// Config
const showConfig = ref(false)
const cfgUser = ref('admin')
const cfgPass = ref('')
const cfgPort = ref(22)
const cfgHasPass = ref(false)
const cfgSaving = ref(false)
const cfgMsg = ref('')

// Quick commands
const quickCmds = [
  { label: 'IP Address', cmd: '/ip address print' },
  { label: 'Interface', cmd: '/interface print' },
  { label: 'Resource', cmd: '/system resource print' },
  { label: 'RouterBoard', cmd: '/system routerboard print' },
  { label: 'Identity', cmd: '/system identity print' },
  { label: 'Routes', cmd: '/ip route print' },
  { label: 'ARP', cmd: '/ip arp print' },
  { label: 'DNS', cmd: '/ip dns print' },
  { label: 'Firewall', cmd: '/ip firewall filter print' },
  { label: 'NAT', cmd: '/ip firewall nat print' },
  { label: 'DHCP Leases', cmd: '/ip dhcp-server lease print' },
  { label: 'PPP', cmd: '/ppp secret print' },
  { label: 'Uptime', cmd: '/system clock print' },
]

const filteredDevices = computed(() =>
  devices.value.filter(d => {
    const q = search.value.toLowerCase()
    if (!q) return true
    return (
      (d.ip_address || '').includes(q) ||
      (d.site?.nama_site || '').toLowerCase().includes(q) ||
      (d.site?.pelanggan?.nama_pelanggan || '').toLowerCase().includes(q) ||
      (d.merk || '').toLowerCase().includes(q)
    )
  })
)

const allSelected = computed(() =>
  filteredDevices.value.length > 0 &&
  filteredDevices.value.every(d => selected.value.has(d.ip_address || ''))
)

function toggleDevice(ip: string) {
  if (selected.value.has(ip)) selected.value.delete(ip)
  else selected.value.add(ip)
  selected.value = new Set(selected.value)
}

function toggleAll() {
  if (allSelected.value) {
    filteredDevices.value.forEach(d => selected.value.delete(d.ip_address || ''))
  } else {
    filteredDevices.value.forEach(d => { if (d.ip_address) selected.value.add(d.ip_address) })
  }
  selected.value = new Set(selected.value)
}

async function loadDevices() {
  loadingDevices.value = true
  devError.value = ''
  try {
    const r = await api.get('/mikrotik/devices')
    devices.value = r.data.data ?? []
    pingAllDevices()
  } catch (e: any) {
    devError.value = e?.response?.data?.message || 'Gagal memuat perangkat'
  } finally {
    loadingDevices.value = false
  }
}

async function pingAllDevices() {
  const ips = devices.value.map(d => d.ip_address).filter(Boolean) as string[]
  if (!ips.length) return

  // Mark all as checking
  const map = new Map<string, PingStatus>()
  ips.forEach(ip => map.set(ip, 'checking'))
  pingStatus.value = new Map(map)

  // Batch in chunks of 30 to avoid flooding
  const CHUNK = 30
  for (let i = 0; i < ips.length; i += CHUNK) {
    const batch = ips.slice(i, i + CHUNK)
    try {
      const r = await api.post('/mikrotik/ping', { ips: batch })
      const results: { ip: string; reachable: boolean; latency: number }[] = r.data.data ?? []
      for (const res of results) {
        map.set(res.ip, res.reachable ? 'up' : 'down')
        if (res.reachable) pingLatency.value.set(res.ip, res.latency)
      }
      pingStatus.value = new Map(map)
    } catch {
      batch.forEach(ip => map.set(ip, 'unknown'))
      pingStatus.value = new Map(map)
    }
  }
}

async function loadConfig() {
  try {
    const r = await api.get('/mikrotik/config')
    cfgUser.value = r.data.data?.user || 'admin'
    cfgPort.value = r.data.data?.port || 22
    cfgHasPass.value = r.data.data?.hasPassword || false
  } catch {}
}

async function saveConfig() {
  cfgSaving.value = true
  cfgMsg.value = ''
  try {
    const r = await api.put('/mikrotik/config', {
      user: cfgUser.value,
      password: cfgPass.value || undefined,
      port: cfgPort.value,
    })
    cfgMsg.value = r.data.data?.message || 'Disimpan'
    cfgHasPass.value = !!(cfgPass.value || cfgHasPass.value)
    cfgPass.value = ''
  } catch (e: any) {
    cfgMsg.value = 'Error: ' + (e?.response?.data?.message || e.message)
  } finally {
    cfgSaving.value = false
  }
}

async function runCommand() {
  if (!selected.value.size) return
  if (!command.value.trim()) return
  running.value = true
  results.value = []
  try {
    const r = await api.post('/mikrotik/run', {
      ips: Array.from(selected.value),
      command: command.value.trim(),
    })
    results.value = r.data.data ?? []
  } catch (e: any) {
    results.value = Array.from(selected.value).map(ip => ({
      ip, success: false, output: '', duration: 0,
      error: e?.response?.data?.message || 'Request gagal',
    }))
  } finally {
    running.value = false
  }
}

function deviceName(ip: string): string {
  const d = devices.value.find(x => x.ip_address === ip)
  if (!d) return ip
  return d.site?.nama_site ? `${d.site.nama_site} (${ip})` : ip
}

onMounted(() => {
  loadDevices()
  loadConfig()
})
</script>

<template>
  <div class="mtk-page">
    <!-- Header -->
    <div class="mtk-header">
      <div>
        <h2 class="mtk-title">🔌 Remote Mikrotik</h2>
        <p class="mtk-sub">Konfigurasi massal perangkat Mikrotik via SSH</p>
      </div>
      <button class="btn-cfg" @click="showConfig = !showConfig">⚙ Kredensial</button>
    </div>

    <!-- Config panel -->
    <div v-if="showConfig" class="cfg-panel">
      <div class="cfg-row">
        <div class="field">
          <label>SSH User</label>
          <input v-model="cfgUser" placeholder="admin" class="inp" />
        </div>
        <div class="field">
          <label>SSH Password {{ cfgHasPass ? '(sudah diset)' : '' }}</label>
          <input v-model="cfgPass" type="password" :placeholder="cfgHasPass ? '••••••••' : 'password'" class="inp" />
        </div>
        <div class="field" style="max-width:120px">
          <label>Port</label>
          <input v-model.number="cfgPort" type="number" class="inp" />
        </div>
        <div class="field" style="align-self:flex-end">
          <button class="btn-save" @click="saveConfig" :disabled="cfgSaving">
            {{ cfgSaving ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
      <div v-if="cfgMsg" :class="['cfg-msg', cfgMsg.startsWith('Error') ? 'cfg-err' : 'cfg-ok']">{{ cfgMsg }}</div>
    </div>

    <!-- Main layout -->
    <div class="mtk-main">
      <!-- Left: device list -->
      <div class="device-panel">
        <div class="dp-header">
          <span class="dp-title">PERANGKAT</span>
          <span class="dp-count" v-if="selected.size">{{ selected.size }} dipilih</span>
        </div>

        <div class="dp-search">
          <input v-model="search" placeholder="Cari IP / site / pelanggan..." class="inp search-inp" />
        </div>

        <div v-if="loadingDevices" class="dp-empty">Memuat perangkat...</div>
        <div v-else-if="devError" class="dp-empty dp-err">{{ devError }}</div>
        <div v-else-if="!filteredDevices.length" class="dp-empty">
          Tidak ada perangkat Mikrotik terdaftar.<br/>
          <small>Tambahkan perangkat dengan jenis 'Mikrotik' atau 'Router' di Master Site.</small>
        </div>
        <template v-else>
          <div class="dp-select-all" @click="toggleAll">
            <input type="checkbox" :checked="allSelected" readonly />
            <span>{{ allSelected ? 'Batalkan Semua' : 'Pilih Semua' }} ({{ filteredDevices.length }})</span>
          </div>
          <div class="dp-list">
            <div
              v-for="d in filteredDevices"
              :key="d.id_perangkat"
              :class="['device-item', { selected: selected.has(d.ip_address || '') }]"
              @click="toggleDevice(d.ip_address || '')"
            >
              <input type="checkbox" :checked="selected.has(d.ip_address || '')" readonly class="dev-chk" />
              <span
                :class="['ping-dot', `ping-${pingStatus.get(d.ip_address || '') ?? 'unknown'}`]"
                :title="pingStatus.get(d.ip_address || '') === 'up'
                  ? `SSH OK (${pingLatency.get(d.ip_address || '')}ms)`
                  : pingStatus.get(d.ip_address || '') === 'down' ? 'Tidak bisa diremote'
                  : pingStatus.get(d.ip_address || '') === 'checking' ? 'Mengecek...' : 'Belum dicek'"
              ></span>
              <div class="dev-info">
                <div class="dev-ip">{{ d.ip_address }}</div>
                <div class="dev-site">{{ d.site?.nama_site || '—' }}</div>
                <div class="dev-pelanggan">{{ d.site?.pelanggan?.nama_pelanggan || '' }}</div>
                <div class="dev-model" v-if="d.merk">{{ d.merk }} {{ d.tipe_model }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Right: command + results -->
      <div class="cmd-panel">
        <!-- Quick commands -->
        <div class="quick-row">
          <button
            v-for="q in quickCmds"
            :key="q.cmd"
            class="quick-btn"
            :class="{ active: command === q.cmd }"
            @click="command = q.cmd"
          >{{ q.label }}</button>
        </div>

        <!-- Command editor -->
        <div class="cmd-box">
          <label class="cmd-label">Command RouterOS</label>
          <textarea
            v-model="command"
            class="cmd-ta"
            placeholder="/ip address print&#10;/interface print"
            spellcheck="false"
          ></textarea>
          <div class="cmd-actions">
            <button
              class="btn-run"
              @click="runCommand"
              :disabled="running || !selected.size || !command.trim()"
            >
              <span v-if="running">⏳ Menjalankan...</span>
              <span v-else>▶ Jalankan ({{ selected.size }} device)</span>
            </button>
            <button class="btn-clear" @click="results = []" v-if="results.length">✕ Clear</button>
          </div>
        </div>

        <!-- Results -->
        <div v-if="results.length" class="results-section">
          <div class="res-header">
            HASIL
            <span class="res-ok">{{ results.filter(r => r.success).length }} OK</span>
            <span class="res-err" v-if="results.filter(r => !r.success).length">
              {{ results.filter(r => !r.success).length }} Error
            </span>
          </div>
          <div v-for="r in results" :key="r.ip" :class="['res-card', r.success ? 'res-ok-card' : 'res-err-card']">
            <div class="res-top">
              <span class="res-ip">{{ deviceName(r.ip) }}</span>
              <span :class="['res-status', r.success ? 'st-ok' : 'st-err']">
                {{ r.success ? '✓ OK' : '✗ Error' }}
              </span>
              <span class="res-dur">{{ r.duration }}ms</span>
            </div>
            <pre v-if="r.success && r.output" class="res-output">{{ r.output.trim() }}</pre>
            <div v-if="!r.success" class="res-errmsg">{{ r.error }}</div>
          </div>
        </div>

        <div v-else-if="!running && !selected.size" class="cmd-hint">
          Pilih perangkat di sebelah kiri, lalu jalankan command
        </div>
        <div v-else-if="!running && selected.size && !results.length" class="cmd-hint">
          {{ selected.size }} device dipilih · klik Jalankan
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mtk-page {
  padding: 24px 28px;
  max-width: 1400px;
}

/* Header */
.mtk-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}
.mtk-title { font-size: 1.2rem; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
.mtk-sub   { font-size: 13px; color: #64748b; margin: 0; }
.btn-cfg {
  padding: 8px 16px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px; font-weight: 600; color: #475569;
  cursor: pointer; white-space: nowrap;
}
.btn-cfg:hover { background: #e2e8f0; }

/* Config panel */
.cfg-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.cfg-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
}
.field { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 160px; }
.field label { font-size: 12px; font-weight: 600; color: #64748b; }
.inp {
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  font-size: 13.5px;
  color: #0f172a;
  background: #fff;
  outline: none;
}
.inp:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
.btn-save {
  padding: 9px 20px;
  background: #1d4ed8;
  color: #fff;
  border: none;
  border-radius: 7px;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-save:hover:not(:disabled) { background: #1e40af; }
.cfg-msg { font-size: 12.5px; margin-top: 8px; font-weight: 600; }
.cfg-ok  { color: #16a34a; }
.cfg-err { color: #dc2626; }

/* Main layout */
.mtk-main {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 14px;
  align-items: start;
}

/* Device panel */
.device-panel {
  background: #fff;
  border: 1px solid #e8edf5;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 220px);
}
.dp-list {
  flex: 1;
  overflow-y: auto;
}
.dp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  border-bottom: 1px solid #f1f5f9;
}
.dp-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #64748b;
  text-transform: uppercase;
}
.dp-count {
  background: #2563eb;
  color: #fff;
  font-size: 10px; font-weight: 800;
  padding: 1px 8px;
  border-radius: 999px;
}
.dp-search { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
.search-inp { width: 100%; }
.dp-empty {
  padding: 24px 14px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.6;
}
.dp-err { color: #dc2626; }
.dp-select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  font-size: 12.5px;
  color: #475569;
  font-weight: 600;
}
.dp-select-all:hover { background: #f1f5f9; }
.device-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #f8fafc;
  cursor: pointer;
  transition: background 0.12s;
}
.device-item:hover { background: #f8fafc; }
.device-item.selected { background: #eff6ff; }
.device-item:last-child { border-bottom: none; }
.dev-chk { margin-top: 2px; flex-shrink: 0; }

/* Ping status dot */
.ping-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
  transition: background 0.3s;
}
.ping-unknown  { background: #cbd5e1; }
.ping-checking { background: #fbbf24; animation: blink-ping 0.8s infinite; }
.ping-up       { background: #22c55e; box-shadow: 0 0 4px rgba(34,197,94,.5); }
.ping-down     { background: #ef4444; }

@keyframes blink-ping {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.dev-info { flex: 1; min-width: 0; }
.dev-ip { font-weight: 700; color: #1d4ed8; font-family: monospace; font-size: 13px; }
.dev-site { font-size: 12.5px; color: #0f172a; margin-top: 1px; }
.dev-pelanggan { font-size: 11.5px; color: #94a3b8; }
.dev-model { font-size: 11.5px; color: #64748b; }

/* Command panel */
.cmd-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.quick-btn {
  padding: 5px 11px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12px; font-weight: 600; color: #475569;
  cursor: pointer;
  transition: all 0.12s;
}
.quick-btn:hover { background: #e2e8f0; }
.quick-btn.active { background: #dbeafe; color: #1d4ed8; border-color: #93c5fd; }

.cmd-box {
  background: #fff;
  border: 1px solid #e8edf5;
  border-radius: 12px;
  padding: 14px 16px;
}
.cmd-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #64748b;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.cmd-ta {
  width: 100%;
  min-height: 100px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 13.5px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}
.cmd-ta:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.12); }

.cmd-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.btn-run {
  flex: 1;
  padding: 10px 20px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px; font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-run:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-run:hover:not(:disabled) { opacity: 0.9; }
.btn-clear {
  padding: 10px 16px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px; color: #64748b; font-weight: 600;
  cursor: pointer;
}
.btn-clear:hover { background: #e2e8f0; }

.cmd-hint {
  text-align: center;
  color: #94a3b8;
  padding: 32px 0;
  font-size: 13.5px;
}

/* Results */
.results-section { display: flex; flex-direction: column; gap: 8px; }
.res-header {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #64748b;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
}
.res-ok  { color: #16a34a; font-weight: 800; }
.res-err { color: #dc2626; font-weight: 800; }

.res-card {
  background: #fff;
  border: 1px solid #e8edf5;
  border-radius: 10px;
  overflow: hidden;
}
.res-ok-card  { border-left: 3px solid #22c55e; }
.res-err-card { border-left: 3px solid #ef4444; }

.res-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
}
.res-ip { font-weight: 700; color: #0f172a; font-size: 13.5px; flex: 1; }
.res-status { font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 999px; }
.st-ok  { background: #f0fdf4; color: #15803d; }
.st-err { background: #fef2f2; color: #dc2626; }
.res-dur { font-size: 11px; color: #94a3b8; }

.res-output {
  margin: 0;
  padding: 12px 14px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12.5px;
  color: #1e293b;
  background: #f8fafc;
  white-space: pre;
  max-height: 350px;
  overflow-x: auto;
  overflow-y: auto;
  line-height: 1.5;
}
.res-errmsg {
  padding: 10px 14px;
  color: #dc2626;
  font-size: 13px;
}

@media (max-width: 768px) {
  .mtk-page { padding: 16px; }
  .mtk-main { grid-template-columns: 1fr; }
  .device-panel { max-height: 300px; }
  .dp-list { max-height: 200px; }
}
</style>
