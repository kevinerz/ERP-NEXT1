<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useProyekStore } from '@/stores/proyek'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const proyek = useProyekStore()
const auth = useAuthStore()
const bisaKelolaKoneksi = computed(() => auth.hasRole('Admin') || auth.hasRole('Director'))
const tab = ref<'koneksi' | 'mapping' | 'audit'>('mapping')

// ─── STATUS ───────────────────────────────────────────────────
const status = ref<any>(null)
async function fetchStatus() {
  try { status.value = (await api.get('/prtg/status')).data.data } catch {}
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
  try { await api.delete(`/prtg/mapping/${id}`); await fetchMapping() }
  catch (e: any) { alert(e.response?.data?.message || 'Gagal menghapus mapping') }
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
      <span class="status-dot" :class="status.configured ? 'ok' : 'off'"></span>
      <span>{{ status.pesan }}</span>
    </div>

    <div class="tabs">
      <button :class="['tab', { active: tab === 'mapping' }]" @click="tab = 'mapping'">🔗 Mapping Device → Site</button>
      <button :class="['tab', { active: tab === 'audit' }]" @click="tab = 'audit'; fetchDevices()">🔍 Audit Sensor</button>
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
              <td><button class="btn-hapus" @click="hapusMapping(m.id_mapping, m.device_name)">Hapus</button></td>
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
</style>
