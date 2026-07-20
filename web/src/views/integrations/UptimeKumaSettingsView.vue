<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useProyekStore } from '@/stores/proyek'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const proyek = useProyekStore()
const auth = useAuthStore()
const bisaKelolaKoneksi = computed(() => auth.hasRole('Admin') || auth.hasRole('Director'))
const tab = ref<'koneksi' | 'mapping' | 'audit'>('koneksi')

// ─── STATUS ───────────────────────────────────────────────────
const status = ref<any>(null)
async function fetchStatus() {
  try { status.value = (await api.get('/uptime-kuma/status')).data.data } catch {}
}

// ─── KONEKSI ──────────────────────────────────────────────────
const configForm = ref({ base_url: '', status_page_slug: '' })
const webhookPath = ref<string | null>(null)
const savingConfig = ref(false)
const configMsg = ref('')
const regenerating = ref(false)

const webhookUrl = computed(() => webhookPath.value ? `${window.location.origin}${webhookPath.value}` : null)

async function fetchConfig() {
  try {
    const d = (await api.get('/uptime-kuma/config')).data.data
    configForm.value.base_url = d.base_url
    configForm.value.status_page_slug = d.status_page_slug
    webhookPath.value = d.webhook_path
  } catch {}
}
async function saveConfig() {
  savingConfig.value = true; configMsg.value = ''
  try {
    await api.patch('/uptime-kuma/config', configForm.value)
    configMsg.value = 'Konfigurasi disimpan.'
    await Promise.all([fetchConfig(), fetchStatus()])
  } catch (e: any) { configMsg.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { savingConfig.value = false }
}
async function buatTokenBaru() {
  if (webhookPath.value && !confirm('Buat token baru? URL webhook lama tidak akan berlaku lagi — kamu harus update di Uptime Kuma.')) return
  regenerating.value = true; configMsg.value = ''
  try {
    const r = await api.post('/uptime-kuma/config/regenerate-token')
    webhookPath.value = r.data.data.webhook_path
    configMsg.value = r.data.message
    await fetchStatus()
  } catch (e: any) { configMsg.value = e.response?.data?.message || 'Gagal membuat token' }
  finally { regenerating.value = false }
}
function salinUrl() {
  if (!webhookUrl.value) return
  navigator.clipboard?.writeText(webhookUrl.value)
  configMsg.value = 'URL disalin ke clipboard.'
}

// ─── MAPPING ──────────────────────────────────────────────────
const mappingList = ref<any[]>([])
const unmatchedList = ref<any[]>([])
const mappingLoading = ref(false)
const mapForm = ref({ monitor_id: '', monitor_name: '', id_site: 0 })
const mapSubmitting = ref(false)
const mapMsg = ref('')
const hapusMappingId = ref(0)

async function fetchMapping() {
  mappingLoading.value = true
  try {
    const [m, u] = await Promise.all([api.get('/uptime-kuma/mapping'), api.get('/uptime-kuma/mapping/unmatched')])
    mappingList.value = m.data.data
    unmatchedList.value = u.data.data
  } catch {} finally { mappingLoading.value = false }
}

async function submitMapping() {
  if (!mapForm.value.monitor_id || !mapForm.value.monitor_name || !mapForm.value.id_site) {
    mapMsg.value = 'ID monitor, nama monitor, dan site wajib diisi'; return
  }
  mapSubmitting.value = true; mapMsg.value = ''
  try {
    const r = await api.post('/uptime-kuma/mapping', mapForm.value)
    mapMsg.value = r.data.message
    mapForm.value = { monitor_id: '', monitor_name: '', id_site: 0 }
    await fetchMapping()
  } catch (e: any) { mapMsg.value = e.response?.data?.message || 'Gagal menyimpan mapping' }
  finally { mapSubmitting.value = false }
}

async function hapusMapping(id: number, nama: string) {
  if (!confirm(`Hapus mapping "${nama}"? Monitor ini akan balik ke matching otomatis (nama).`)) return
  hapusMappingId.value = id; mapMsg.value = ''
  try { await api.delete(`/uptime-kuma/mapping/${id}`); await fetchMapping() }
  catch (e: any) { mapMsg.value = e.response?.data?.message || 'Gagal menghapus mapping' }
  finally { hapusMappingId.value = 0 }
}

// ─── AUDIT MONITOR ─────────────────────────────────────────────
const monitors = ref<any[]>([])
const auditLoading = ref(false)
const auditError = ref('')
const onlyUnmatched = ref(false)
const searchMonitor = ref('')

async function fetchMonitors() {
  auditLoading.value = true; auditError.value = ''
  try {
    const r = (await api.get('/uptime-kuma/devices')).data
    monitors.value = r.data
    if (!r.data.length && r.message) auditError.value = r.message
  } catch (e: any) { auditError.value = e.response?.data?.message || 'Gagal memuat daftar monitor' }
  finally { auditLoading.value = false }
}
const filteredMonitors = computed(() => {
  let list = monitors.value
  if (onlyUnmatched.value) list = list.filter((m) => !m.matched)
  const q = searchMonitor.value.trim().toLowerCase()
  if (q) list = list.filter((m) => m.monitor_name.toLowerCase().includes(q))
  return list
})

function mapDariAudit(m: any) {
  tab.value = 'mapping'
  mapForm.value.monitor_id = m.monitor_id
  mapForm.value.monitor_name = m.monitor_name
}

onMounted(async () => {
  await Promise.all([fetchStatus(), fetchConfig(), fetchMapping(), proyek.fetchSiteList()])
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>🟢 Uptime Kuma — Monitoring</h2>
      <p class="sub">Webhook self-hosted, mapping monitor ↔ site pelanggan, dan audit monitor</p>
    </div>

    <div class="status-bar" v-if="status">
      <span class="status-dot" :class="status.configured ? 'ok' : 'off'"></span>
      <span>{{ status.pesan }}</span>
    </div>

    <div class="tabs">
      <button v-if="bisaKelolaKoneksi" :class="['tab', { active: tab === 'koneksi' }]" @click="tab = 'koneksi'">⚙️ Koneksi</button>
      <button :class="['tab', { active: tab === 'mapping' }]" @click="tab = 'mapping'">🔗 Mapping Monitor → Site</button>
      <button :class="['tab', { active: tab === 'audit' }]" @click="tab = 'audit'; fetchMonitors()">🔍 Audit Monitor</button>
    </div>

    <!-- ─── TAB: KONEKSI ─── -->
    <div v-if="tab === 'koneksi' && bisaKelolaKoneksi" class="tab-content">
      <div class="card">
        <h3>1. Token Webhook</h3>
        <p class="hint">Buat token, lalu daftarkan URL di bawah sebagai notifikasi <strong>Webhook</strong> di Uptime Kuma (Settings → Notifications → Setup Notification → tipe Webhook), Content Type: JSON. Pasang notifikasi ini di setiap monitor yang mau di-track ke ERP.</p>
        <div v-if="webhookUrl" class="webhook-box">
          <code>{{ webhookUrl }}</code>
          <button class="btn-secondary" @click="salinUrl">📋 Salin</button>
        </div>
        <button class="btn-submit" @click="buatTokenBaru" :disabled="regenerating">
          {{ regenerating ? 'Membuat...' : (webhookUrl ? 'Buat Ulang Token' : 'Buat Token Webhook') }}
        </button>
      </div>

      <div class="card">
        <h3>2. Status Page (opsional — untuk fitur Audit Monitor)</h3>
        <p class="hint">Buat 1 status page di Uptime Kuma berisi semua monitor yang mau dipantau ERP, lalu isi slug-nya di sini. Tidak wajib — webhook tetap jalan tanpa ini, cuma tab Audit Monitor butuh data ini untuk menampilkan daftar monitor.</p>
        <div class="field">
          <label>Base URL Uptime Kuma</label>
          <input v-model="configForm.base_url" placeholder="https://uptime.namadomainkamu.com" />
        </div>
        <div class="field">
          <label>Slug Status Page</label>
          <input v-model="configForm.status_page_slug" placeholder="mis. semua-site" />
        </div>
        <button class="btn-submit" @click="saveConfig" :disabled="savingConfig">
          {{ savingConfig ? 'Menyimpan...' : 'Simpan' }}
        </button>
        <p v-if="configMsg" class="msg">{{ configMsg }}</p>
      </div>
    </div>

    <!-- ─── TAB: MAPPING ─── -->
    <div v-if="tab === 'mapping'" class="tab-content">
      <div class="card" v-if="unmatchedList.length">
        <h3>⚠️ Belum Termapping (24 jam terakhir)</h3>
        <p class="hint">Monitor ini pernah down tapi tidak cocok dengan site manapun secara otomatis.</p>
        <div class="unmatched-list">
          <span v-for="u in unmatchedList" :key="u.id_webhook" class="unmatched-chip">
            {{ u.monitor_name || u.monitor_id }}
          </span>
        </div>
      </div>

      <div class="card">
        <h3>Tambah / Ubah Mapping</h3>
        <p class="hint">Buka tab Audit Monitor untuk isi otomatis, atau isi manual ID monitor sesuai Uptime Kuma.</p>
        <div class="form-row">
          <div class="field">
            <label>ID Monitor</label>
            <input v-model="mapForm.monitor_id" placeholder="ID monitor di Uptime Kuma" />
          </div>
          <div class="field">
            <label>Nama Monitor</label>
            <input v-model="mapForm.monitor_name" placeholder="Nama (buat tampilan)" />
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
          <thead><tr><th>Monitor</th><th>Site</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!mappingList.length"><td colspan="3" class="empty">Belum ada mapping manual</td></tr>
            <tr v-for="m in mappingList" :key="m.id_mapping">
              <td class="mono">{{ m.monitor_name }} <span class="text-gray">({{ m.monitor_id }})</span></td>
              <td>[{{ m.site.kode_site }}] {{ m.site.nama_site }}</td>
              <td><button class="btn-hapus" :disabled="hapusMappingId === m.id_mapping" @click="hapusMapping(m.id_mapping, m.monitor_name)">{{ hapusMappingId === m.id_mapping ? 'Menghapus...' : 'Hapus' }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── TAB: AUDIT ─── -->
    <div v-if="tab === 'audit'" class="tab-content">
      <div class="card">
        <div class="audit-toolbar">
          <input v-model="searchMonitor" class="search-input" placeholder="🔍 Cari nama monitor..." />
          <label class="chk"><input type="checkbox" v-model="onlyUnmatched" /> Hanya yang belum match</label>
          <button class="btn-secondary" @click="fetchMonitors">🔄 Muat Ulang</button>
        </div>
        <p v-if="auditError" class="msg err">{{ auditError }}</p>
        <div v-if="auditLoading" class="loading">Memuat dari Uptime Kuma...</div>
        <template v-else>
          <p class="result-count">{{ filteredMonitors.length }} dari {{ monitors.length }} monitor</p>
          <table>
            <thead><tr><th>Monitor</th><th>Status Terakhir</th><th>Status Match</th><th>Site</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!filteredMonitors.length"><td colspan="5" class="empty">{{ monitors.length ? 'Tidak ada monitor yang cocok pencarian' : 'Tidak ada data — isi status page di tab Koneksi lalu Muat Ulang' }}</td></tr>
              <tr v-for="m in filteredMonitors" :key="m.monitor_id">
                <td class="mono">{{ m.monitor_name }}</td>
                <td class="center">{{ m.status_terakhir === 'down' ? '🔴 Down' : m.status_terakhir === 'up' ? '🟢 Up' : '—' }}</td>
                <td>
                  <span class="badge" :class="m.matched ? (m.mapped_manual ? 'badge-manual' : 'badge-auto') : 'badge-none'">
                    {{ m.matched ? (m.mapped_manual ? 'Manual' : 'Otomatis') : 'Belum Match' }}
                  </span>
                </td>
                <td>{{ m.site ? `[${m.site.nama_site}]` : '—' }}</td>
                <td><button v-if="!m.matched" class="btn-map" @click="mapDariAudit(m)">Map ke Site</button></td>
              </tr>
            </tbody>
          </table>
        </template>
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
.hint { margin: 0 0 12px; font-size: 12px; color: #94a3b8; line-height: 1.6; }

.webhook-box { display: flex; align-items: center; gap: 10px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; }
.webhook-box code { flex: 1; font-size: 12.5px; color: #0f172a; word-break: break-all; }

.unmatched-list { display: flex; gap: 8px; flex-wrap: wrap; }
.unmatched-chip { padding: 6px 12px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 16px; font-size: 12px; }

.form-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; min-width: 220px; flex: 1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input, .field select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }

.btn-submit { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; margin-bottom: 10px; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { padding: 8px 14px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.msg { font-size: 13px; color: #15803d; margin: 8px 0 0; }
.msg.err { color: #dc2626; }

table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 11px 12px; font-size: 13px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.mono { font-family: 'Consolas', monospace; font-size: 12px; }
.text-gray { color: #94a3b8; }
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

.badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge-auto { background: #eff6ff; color: #1d4ed8; }
.badge-manual { background: #f0fdf4; color: #15803d; }
.badge-none { background: #fef2f2; color: #dc2626; }
</style>
