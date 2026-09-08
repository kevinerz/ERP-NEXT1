<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '@/services/api'

type Tab = 'config' | 'internal-groups' | 'pelanggan-groups' | 'templates'
const tab = ref<Tab>('config')

// ── Config ───────────────────────────────────────────────────────
const config   = ref<{ configured: boolean; is_active: boolean; api_key_masked: string | null }>({ configured: false, is_active: false, api_key_masked: null })
const loading  = ref(true)
const saving   = ref(false)
const testing  = ref(false)
const msg      = ref('')
const msgType  = ref<'ok'|'err'>('ok')
const form     = ref({ api_key: '', is_active: false })
const testPhone = ref('')

// ── Groups shared logic ──────────────────────────────────────────
type Group = { id: number; group_id: string; nama_group: string; is_active: boolean }

function useGroups(endpoint: string) {
  const list        = ref<Group[]>([])
  const listLoading = ref(false)
  const listError   = ref('')
  const addForm     = ref({ group_id: '', nama_group: '' })
  const adding      = ref(false)
  const addError    = ref('')
  const editId      = ref<number | null>(null)
  const editForm    = ref({ group_id: '', nama_group: '' })
  const testingId   = ref<number | null>(null)
  const testResult  = ref<{ id: number; text: string; ok: boolean } | null>(null)

  async function load() {
    listLoading.value = true; listError.value = ''
    try {
      const r = await api.get(endpoint)
      list.value = Array.isArray(r.data) ? r.data : (r.data?.data ?? [])
    } catch (e: any) {
      listError.value = e.response?.data?.message || `Gagal memuat — error ${e.response?.status ?? ''}`
    } finally { listLoading.value = false }
  }

  async function add() {
    if (!addForm.value.group_id || !addForm.value.nama_group) return
    adding.value = true; addError.value = ''
    try {
      await api.post(endpoint, addForm.value)
      addForm.value = { group_id: '', nama_group: '' }; await load()
    } catch (e: any) {
      addError.value = e.response?.data?.message || 'Gagal menyimpan'
    } finally { adding.value = false }
  }

  function startEdit(g: Group) {
    editId.value = g.id; editForm.value = { group_id: g.group_id, nama_group: g.nama_group }
  }

  async function saveEdit(id: number) {
    await api.patch(`${endpoint}/${id}`, editForm.value)
    editId.value = null; await load()
  }

  async function toggle(g: Group) {
    await api.patch(`${endpoint}/${g.id}`, { is_active: !g.is_active }); await load()
  }

  async function remove(id: number) {
    if (!confirm('Hapus grup ini?')) return
    await api.delete(`${endpoint}/${id}`); await load()
  }

  async function testGroup(g: Group) {
    testingId.value = g.id; testResult.value = null
    try {
      await api.post('/starsender/test-group', { group_id: g.group_id })
      testResult.value = { id: g.id, text: `✓ Test terkirim ke "${g.nama_group}"`, ok: true }
    } catch (e: any) {
      testResult.value = { id: g.id, text: e.response?.data?.message || 'Gagal kirim test', ok: false }
    } finally { testingId.value = null }
  }

  return { list, listLoading, listError, addForm, adding, addError, editId, editForm, testingId, testResult, load, add, startEdit, saveEdit, toggle, remove, testGroup }
}

const ig = useGroups('/starsender/internal-groups')
const pg = useGroups('/starsender/pelanggan-groups')

// ── Pelanggan dropdown ───────────────────────────────────────────
type PelangganOption = { id_pelanggan: number; kode_pelanggan: string; nama_pelanggan: string }
const pelangganList    = ref<PelangganOption[]>([])
const pelangganLoading = ref(false)
const pelangganSearch  = ref('')
const selectedPelanggan = ref<PelangganOption | null>(null)

const pelangganFiltered = computed(() => {
  const q = pelangganSearch.value.toLowerCase()
  return q ? pelangganList.value.filter(p =>
    p.nama_pelanggan.toLowerCase().includes(q) || p.kode_pelanggan.toLowerCase().includes(q)
  ) : pelangganList.value
})

async function loadPelangganDropdown() {
  if (pelangganList.value.length) return
  pelangganLoading.value = true
  try {
    const r = await api.get('/master/pelanggan/dropdown')
    pelangganList.value = r.data.data ?? []
  } catch { } finally { pelangganLoading.value = false }
}

function selectPelanggan(p: PelangganOption) {
  selectedPelanggan.value = p
  pg.addForm.value.nama_group = p.nama_pelanggan
  pelangganSearch.value = p.nama_pelanggan
  showPelangganDropdown.value = false
}

const showPelangganDropdown = ref(false)

// ── Templates ────────────────────────────────────────────────────
const TEMPLATE_KEYS = [
  { key: 'tiket_baru_pelanggan',     label: 'Tiket Baru → Pelanggan (grup)',   hint: 'Dikirim ke grup WA pelanggan / grup external' },
  { key: 'tiket_baru_pelanggan_hp',  label: 'Tiket Baru → Pelanggan (HP)',    hint: 'Dikirim langsung ke nomor HP PIC pelanggan' },
  { key: 'tiket_baru_internal',      label: 'Tiket Baru → Internal',          hint: 'Dikirim ke grup internal' },
  { key: 'tiket_update_pelanggan',   label: 'Update Tiket → Pelanggan',       hint: 'Saat status berubah: In Progress, Resolved, Closed, Pending' },
  { key: 'tiket_update_internal',    label: 'Update Tiket → Internal',        hint: 'Semua perubahan status ke grup internal (termasuk root cause & tindakan)' },
  { key: 'monitor_down',             label: 'Monitoring DOWN → Internal',     hint: 'Alert PRTG / Uptime Kuma perangkat down' },
  { key: 'monitor_up',               label: 'Monitoring UP → Internal',       hint: 'Alert recovery perangkat kembali online' },
]

type Templates = Record<string, string>
const templates    = ref<Templates>({})
const placeholders = {
  tiket:   ['{nomor_tiket}','{judul}','{nama_site}','{nama_pelanggan}','{alamat_site}','{waktu_down}','{tipe_perangkat}','{sensor_detail}','{koordinat_site}','{no_hp_pic}','{tipe_perangkat_line}','{sensor_line}','{koordinat_site_line}','{no_hp_pic_line}','{status_ke}','{status_dari}','{label_status}','{emoji}','{root_cause}','{tindakan}','{teknisi}','{root_cause_line}','{tindakan_line}','{teknisi_line}'],
  monitor: ['{sumber}','{nama}','{nama_site}','{detail}','{site_line}','{detail_line}'],
}
const tplLoading   = ref(false)
const tplSaving    = ref(false)
const tplMsg       = ref('')
const tplMsgType   = ref<'ok'|'err'>('ok')
const activeKey    = ref(TEMPLATE_KEYS[0].key)
const editingTpl   = ref<Templates>({})

const activeTplMeta = computed(() => TEMPLATE_KEYS.find(t => t.key === activeKey.value))
const isMonitorTpl  = computed(() => activeKey.value.startsWith('monitor'))

const tplError = ref('')

async function loadTemplates() {
  tplLoading.value = true; tplError.value = ''
  try {
    const r = await api.get('/starsender/templates')
    templates.value = r.data.data
    editingTpl.value = { ...r.data.data }
  } catch (e: any) {
    tplError.value = e.response?.data?.message || `Gagal memuat template (${e.response?.status ?? 'network error'})`
  } finally { tplLoading.value = false }
}

async function saveTpl() {
  tplSaving.value = true; tplMsg.value = ''
  try {
    const r = await api.patch('/starsender/templates', editingTpl.value)
    templates.value = r.data.data; editingTpl.value = { ...r.data.data }
    tplMsg.value = 'Template berhasil disimpan'; tplMsgType.value = 'ok'
  } catch (e: any) {
    tplMsg.value = e.response?.data?.message || 'Gagal menyimpan'; tplMsgType.value = 'err'
  } finally { tplSaving.value = false }
}

async function resetTpl() {
  if (!confirm('Reset semua template ke default?')) return
  tplSaving.value = true; tplMsg.value = ''
  try {
    const r = await api.post('/starsender/templates/reset')
    templates.value = r.data.data; editingTpl.value = { ...r.data.data }
    tplMsg.value = 'Template direset ke default'; tplMsgType.value = 'ok'
  } catch (e: any) {
    tplMsg.value = e.response?.data?.message || 'Gagal reset'; tplMsgType.value = 'err'
  } finally { tplSaving.value = false }
}

function insertPlaceholder(ph: string) {
  editingTpl.value[activeKey.value] = (editingTpl.value[activeKey.value] || '') + ph
}

// ── Main ─────────────────────────────────────────────────────────
onMounted(load)

async function load() {
  loading.value = true
  try {
    const r = await api.get('/starsender/config')
    config.value = r.data.data; form.value.is_active = config.value.is_active
  } finally { loading.value = false }
}

function switchTab(t: Tab) {
  tab.value = t
  if (t === 'internal-groups') ig.load()
  if (t === 'pelanggan-groups') { pg.load(); loadPelangganDropdown() }
  if (t === 'templates') loadTemplates()
}

async function save() {
  saving.value = true; msg.value = ''
  try {
    const payload: any = { is_active: form.value.is_active }
    if (form.value.api_key) payload.api_key = form.value.api_key
    await api.patch('/starsender/config', payload)
    msg.value = 'Konfigurasi berhasil disimpan'; msgType.value = 'ok'
    form.value.api_key = ''; await load()
  } catch (e: any) {
    msg.value = e.response?.data?.message || 'Gagal menyimpan'; msgType.value = 'err'
  } finally { saving.value = false }
}

async function test() {
  if (!testPhone.value) return
  testing.value = true; msg.value = ''
  try {
    const r = await api.post('/starsender/test', { phone: testPhone.value })
    msg.value = r.data.message; msgType.value = 'ok'
  } catch (e: any) {
    msg.value = e.response?.data?.message || 'Gagal kirim test WA'; msgType.value = 'err'
  } finally { testing.value = false }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="header-top">
        <div class="header-icon">💬</div>
        <div>
          <h2>StarSender — WhatsApp Notifikasi</h2>
          <p class="sub">Kirim notifikasi WA otomatis untuk tiket baru, update status, dan alert monitoring jaringan.</p>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button :class="['tab', tab === 'config' && 'active']" @click="switchTab('config')">⚙️ Konfigurasi</button>
      <button :class="['tab', tab === 'internal-groups' && 'active']" @click="switchTab('internal-groups')">👥 Grup Internal</button>
      <button :class="['tab', tab === 'pelanggan-groups' && 'active']" @click="switchTab('pelanggan-groups')">🏢 Grup Pelanggan</button>
      <button :class="['tab', tab === 'templates' && 'active']" @click="switchTab('templates')">📝 Template Pesan</button>
    </div>

    <!-- ══ TAB CONFIG ══ -->
    <template v-if="tab === 'config'">
      <div v-if="loading" class="loading-state"><div class="spinner"></div>Memuat...</div>
      <template v-else>
        <div :class="['status-banner', config.is_active ? 'banner-active' : 'banner-inactive']">
          <div class="banner-dot"></div>
          <div class="banner-text">
            <span class="banner-title">{{ config.is_active ? 'Notifikasi WA Aktif' : config.configured ? 'Notifikasi WA Nonaktif' : 'Belum Dikonfigurasi' }}</span>
            <span class="banner-desc">{{ config.is_active ? 'Semua notifikasi tiket dan monitoring sedang berjalan.' : config.configured ? 'API key tersimpan — aktifkan untuk mulai kirim notifikasi.' : 'Masukkan API key StarSender untuk mengaktifkan notifikasi WA.' }}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Konfigurasi API</h3></div>
          <div class="form-group">
            <label>API Key StarSender</label>
            <input v-model="form.api_key" type="password" placeholder="Kosongkan jika tidak ingin mengubah key yang tersimpan" />
            <span v-if="config.api_key_masked" class="field-hint">Key tersimpan: <code>{{ config.api_key_masked }}</code></span>
          </div>
          <div class="toggle-row">
            <div>
              <div class="toggle-label">Aktifkan Notifikasi WA</div>
              <div class="toggle-desc">Kirim pesan otomatis ke grup internal dan pelanggan</div>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="form.is_active" />
              <span class="slider"></span>
            </label>
          </div>
          <div v-if="msg" :class="['alert', msgType === 'ok' ? 'alert-ok' : 'alert-err']">{{ msg }}</div>
          <div class="card-footer">
            <button class="btn-primary" @click="save" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Kirim Pesan Test</h3><span class="card-badge">Manual Test</span></div>
          <p class="card-desc">Masukkan nomor HP atau Group ID untuk menguji koneksi WhatsApp.</p>
          <div class="test-input-row">
            <div class="test-input-wrap">
              <input v-model="testPhone" type="text" placeholder="08xxx  atau  120363XXXXXXXX@g.us" />
              <span class="input-hint">No HP atau Group ID</span>
            </div>
            <button class="btn-test" @click="test" :disabled="testing || !config.configured || !testPhone">
              {{ testing ? '⏳ Mengirim...' : '📤 Kirim Test' }}
            </button>
          </div>
        </div>

        <div class="card card-info">
          <div class="card-header"><h3>Alur Notifikasi</h3></div>
          <div class="notif-flows">
            <div class="flow-item">
              <div class="flow-icon">🎫</div>
              <div>
                <div class="flow-title">Tiket Baru</div>
                <div class="flow-desc">
                  <div class="flow-arrow">→ Grup Pelanggan aktif <em>(prioritas utama)</em>, atau grup WA per pelanggan, atau HP PIC</div>
                  <div class="flow-arrow">→ Semua Grup Internal aktif <em>(atau individual staff jika belum ada grup)</em></div>
                </div>
              </div>
            </div>
            <div class="flow-item">
              <div class="flow-icon">🔄</div>
              <div>
                <div class="flow-title">Update Status Tiket</div>
                <div class="flow-desc">
                  <div class="flow-arrow">→ Customer <em>(In Progress, Resolved, Closed, Pending)</em> — termasuk root cause & tindakan jika diisi</div>
                  <div class="flow-arrow">→ Semua Grup Internal aktif</div>
                </div>
              </div>
            </div>
            <div class="flow-item">
              <div class="flow-icon">🔴</div>
              <div>
                <div class="flow-title">Monitoring DOWN / UP</div>
                <div class="flow-desc"><div class="flow-arrow">→ Semua Grup Internal aktif</div></div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ══ TAB GRUP INTERNAL ══ -->
    <template v-else-if="tab === 'internal-groups'">
      <div class="card">
        <div class="card-header">
          <h3>Grup Internal</h3>
          <span class="card-badge">{{ ig.list.value.filter(g => g.is_active).length }} aktif</span>
        </div>
        <p class="card-desc">Notifikasi tiket baru, update status, dan alert monitoring dikirim ke semua grup aktif. Group ID dari dashboard StarSender.</p>

        <div v-if="ig.listLoading.value" class="loading-state"><div class="spinner"></div>Memuat...</div>
        <div v-else-if="ig.listError.value" class="error-box">⚠️ {{ ig.listError.value }}<div class="error-hint">Coba logout → login ulang.</div></div>
        <template v-else>
          <div v-if="ig.list.value.length" class="group-list">
            <div v-for="g in ig.list.value" :key="g.id" class="group-row">
              <template v-if="ig.editId.value === g.id">
                <div class="group-row-edit">
                  <input v-model="ig.editForm.value.nama_group" class="edit-input" placeholder="Nama grup" />
                  <input v-model="ig.editForm.value.group_id" class="edit-input mono" placeholder="Group ID" />
                  <div class="edit-actions">
                    <button class="btn-sm btn-primary-sm" @click="ig.saveEdit(g.id)">Simpan</button>
                    <button class="btn-sm" @click="ig.editId.value = null">Batal</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="group-info">
                  <div class="group-name">{{ g.nama_group }}</div>
                  <div class="group-id">{{ g.group_id }}</div>
                  <div v-if="ig.testResult.value?.id === g.id" :class="['test-result', ig.testResult.value.ok ? 'test-ok' : 'test-err']">{{ ig.testResult.value.text }}</div>
                </div>
                <div class="group-actions">
                  <span :class="['badge', g.is_active ? 'badge-on' : 'badge-off']">{{ g.is_active ? 'Aktif' : 'Nonaktif' }}</span>
                  <button class="btn-sm" @click="ig.testGroup(g)" :disabled="ig.testingId.value === g.id || !config.configured">{{ ig.testingId.value === g.id ? '⏳' : '📤 Test' }}</button>
                  <button class="btn-sm" @click="ig.startEdit(g)">Edit</button>
                  <button class="btn-sm" @click="ig.toggle(g)">{{ g.is_active ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                  <button class="btn-sm btn-danger-sm" @click="ig.remove(g.id)">Hapus</button>
                </div>
              </template>
            </div>
          </div>
          <div v-else class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">Belum ada grup internal</div><div class="empty-hint">Tambahkan di bawah</div></div>

          <div class="add-section">
            <h4 class="add-title">Tambah Grup Internal</h4>
            <div class="add-row">
              <input v-model="ig.addForm.value.nama_group" type="text" placeholder="Nama grup  (mis: Ops Internal)" />
              <input v-model="ig.addForm.value.group_id" type="text" placeholder="Group ID  (120363...@g.us)" class="mono" />
              <button class="btn-primary" @click="ig.add()" :disabled="ig.adding.value || !ig.addForm.value.group_id || !ig.addForm.value.nama_group">{{ ig.adding.value ? '...' : '+ Tambah' }}</button>
            </div>
            <div v-if="ig.addError.value" class="error-inline">⚠️ {{ ig.addError.value }}</div>
          </div>
        </template>
      </div>
    </template>

    <!-- ══ TAB GRUP PELANGGAN ══ -->
    <template v-else-if="tab === 'pelanggan-groups'">
      <div class="card">
        <div class="card-header">
          <h3>Grup Pelanggan / External</h3>
          <span class="card-badge">{{ pg.list.value.filter(g => g.is_active).length }} aktif</span>
        </div>
        <p class="card-desc">Notifikasi tiket dikirim ke semua grup aktif di sini (diprioritaskan di atas grup per-pelanggan atau HP PIC). Cocok untuk grup WA umum pelanggan, grup koordinasi external, atau grup per area/segmen.</p>

        <div v-if="pg.listLoading.value" class="loading-state"><div class="spinner"></div>Memuat...</div>
        <div v-else-if="pg.listError.value" class="error-box">⚠️ {{ pg.listError.value }}<div class="error-hint">Coba logout → login ulang.</div></div>
        <template v-else>
          <div v-if="pg.list.value.length" class="group-list">
            <div v-for="g in pg.list.value" :key="g.id" class="group-row">
              <template v-if="pg.editId.value === g.id">
                <div class="group-row-edit">
                  <input v-model="pg.editForm.value.nama_group" class="edit-input" placeholder="Nama grup" />
                  <input v-model="pg.editForm.value.group_id" class="edit-input mono" placeholder="Group ID" />
                  <div class="edit-actions">
                    <button class="btn-sm btn-primary-sm" @click="pg.saveEdit(g.id)">Simpan</button>
                    <button class="btn-sm" @click="pg.editId.value = null">Batal</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="group-info">
                  <div class="group-name">{{ g.nama_group }}</div>
                  <div class="group-id">{{ g.group_id }}</div>
                  <div v-if="pg.testResult.value?.id === g.id" :class="['test-result', pg.testResult.value.ok ? 'test-ok' : 'test-err']">{{ pg.testResult.value.text }}</div>
                </div>
                <div class="group-actions">
                  <span :class="['badge', g.is_active ? 'badge-on' : 'badge-off']">{{ g.is_active ? 'Aktif' : 'Nonaktif' }}</span>
                  <button class="btn-sm" @click="pg.testGroup(g)" :disabled="pg.testingId.value === g.id || !config.configured">{{ pg.testingId.value === g.id ? '⏳' : '📤 Test' }}</button>
                  <button class="btn-sm" @click="pg.startEdit(g)">Edit</button>
                  <button class="btn-sm" @click="pg.toggle(g)">{{ g.is_active ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                  <button class="btn-sm btn-danger-sm" @click="pg.remove(g.id)">Hapus</button>
                </div>
              </template>
            </div>
          </div>
          <div v-else class="empty-state"><div class="empty-icon">🏢</div><div class="empty-text">Belum ada grup pelanggan</div><div class="empty-hint">Tambahkan grup WA pelanggan/external di bawah</div></div>

          <div class="add-section">
            <h4 class="add-title">Tambah Grup Pelanggan</h4>
            <div class="add-row pg-add-row">
              <!-- Pelanggan picker -->
              <div class="pel-picker">
                <input
                  v-model="pelangganSearch"
                  type="text"
                  placeholder="Cari & pilih pelanggan..."
                  class="pel-input"
                  @focus="showPelangganDropdown = true"
                  @blur="setTimeout(() => showPelangganDropdown = false, 150)"
                  @input="showPelangganDropdown = true; selectedPelanggan = null; pg.addForm.value.nama_group = pelangganSearch"
                  :disabled="pelangganLoading"
                />
                <div v-if="showPelangganDropdown && pelangganFiltered.length" class="pel-dropdown">
                  <div
                    v-for="p in pelangganFiltered.slice(0,50)"
                    :key="p.id_pelanggan"
                    class="pel-option"
                    @mousedown.prevent="selectPelanggan(p)"
                  >
                    <span class="pel-kode">{{ p.kode_pelanggan }}</span>
                    <span class="pel-nama">{{ p.nama_pelanggan }}</span>
                  </div>
                </div>
              </div>
              <input v-model="pg.addForm.value.group_id" type="text" placeholder="Group ID WA  (120363...@g.us)" class="mono" />
              <button class="btn-primary" @click="pg.add()" :disabled="pg.adding.value || !pg.addForm.value.group_id || !pg.addForm.value.nama_group">{{ pg.adding.value ? '...' : '+ Tambah' }}</button>
            </div>
            <div v-if="pg.addError.value" class="error-inline">⚠️ {{ pg.addError.value }}</div>
          </div>
        </template>
      </div>
    </template>

    <!-- ══ TAB TEMPLATE PESAN ══ -->
    <template v-else-if="tab === 'templates'">
      <div v-if="tplLoading" class="loading-state"><div class="spinner"></div>Memuat template...</div>
      <div v-else-if="tplError" class="error-box">⚠️ {{ tplError }}<button class="btn-sm" style="margin-left:8px" @click="loadTemplates()">Coba Lagi</button></div>
      <template v-else>
        <div class="tpl-layout">
          <!-- Sidebar -->
          <div class="tpl-sidebar">
            <div class="tpl-sidebar-title">Jenis Notifikasi</div>
            <button
              v-for="t in TEMPLATE_KEYS" :key="t.key"
              :class="['tpl-menu-item', activeKey === t.key && 'active']"
              @click="activeKey = t.key"
            >
              <div class="tpl-menu-label">{{ t.label }}</div>
              <div class="tpl-menu-hint">{{ t.hint }}</div>
            </button>
          </div>

          <!-- Editor -->
          <div class="tpl-editor-col">
            <div class="card">
              <div class="card-header">
                <h3>{{ activeTplMeta?.label }}</h3>
              </div>
              <p class="card-desc">{{ activeTplMeta?.hint }}</p>

              <div class="tpl-editor-group">
                <label>Teks Template</label>
                <textarea v-model="editingTpl[activeKey]" class="tpl-textarea" rows="10" placeholder="Isi template pesan WA..." />
                <div class="tpl-char">{{ (editingTpl[activeKey] || '').length }} karakter</div>
              </div>

              <div class="placeholder-box">
                <div class="placeholder-title">Klik variabel untuk menyisipkan:</div>
                <div class="placeholder-chips">
                  <template v-if="!isMonitorTpl">
                    <span v-for="p in placeholders.tiket" :key="p" class="placeholder-chip" @click="insertPlaceholder(p)">{{ p }}</span>
                  </template>
                  <template v-else>
                    <span v-for="p in placeholders.monitor" :key="p" class="placeholder-chip" @click="insertPlaceholder(p)">{{ p }}</span>
                  </template>
                </div>
                <div class="placeholder-hint" v-if="!isMonitorTpl">
                  <code>{root_cause_line}</code> = baris root cause jika diisi (include newline) ·
                  <code>{tindakan_line}</code> = baris tindakan jika diisi ·
                  <code>{teknisi_line}</code> = baris teknisi jika diisi ·
                  <code>{emoji}</code> = emoji status otomatis ·
                  <code>{label_status}</code> = label status dalam bahasa Indonesia
                </div>
                <div class="placeholder-hint" v-else>
                  <code>{site_line}</code> = baris site jika ada (include newline) ·
                  <code>{detail_line}</code> = baris detail/info jika ada
                </div>
              </div>

              <div v-if="tplMsg" :class="['alert', tplMsgType === 'ok' ? 'alert-ok' : 'alert-err']">{{ tplMsg }}</div>

              <div class="card-footer">
                <button class="btn-ghost" @click="resetTpl" :disabled="tplSaving">↩ Reset ke Default</button>
                <button class="btn-primary" @click="saveTpl" :disabled="tplSaving">{{ tplSaving ? 'Menyimpan...' : 'Simpan Semua Template' }}</button>
              </div>
            </div>

            <div class="card card-info">
              <div class="card-header"><h3>Preview</h3></div>
              <pre class="tpl-preview">{{ editingTpl[activeKey] || '(kosong)' }}</pre>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }

.page-header { margin-bottom: 24px; }
.header-top { display: flex; align-items: flex-start; gap: 16px; }
.header-icon { font-size: 32px; flex-shrink: 0; margin-top: 2px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; font-weight: 800; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; }

.tabs { display: flex; gap: 2px; margin-bottom: 24px; background: #f1f5f9; padding: 4px; border-radius: 10px; width: fit-content; flex-wrap: wrap; }
.tab { padding: 8px 18px; background: none; border: none; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; border-radius: 7px; transition: all 0.15s; }
.tab.active { background: #fff; color: #1d4ed8; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.tab:hover:not(.active) { color: #0f172a; }

.status-banner { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 10px; margin-bottom: 20px; }
.banner-active { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #bbf7d0; }
.banner-inactive { background: #f8fafc; border: 1px solid #e2e8f0; }
.banner-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.banner-active .banner-dot { background: #16a34a; box-shadow: 0 0 0 3px #bbf7d0; }
.banner-inactive .banner-dot { background: #94a3b8; }
.banner-text { display: flex; flex-direction: column; gap: 2px; }
.banner-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.banner-active .banner-title { color: #15803d; }
.banner-desc { font-size: 12px; color: #64748b; }

.card { background: #fff; border-radius: 12px; padding: 22px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 16px; border: 1px solid #f1f5f9; }
.card-info { background: #fafbff; }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.card-header h3 { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
.card-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px; background: #f1f5f9; color: #475569; }
.card-desc { font-size: 13px; color: #64748b; margin: 0 0 16px; line-height: 1.6; }
.card-footer { margin-top: 18px; padding-top: 16px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; }

.form-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 16px; }
.form-group label { font-size: 13px; font-weight: 600; color: #374151; }
.form-group input { padding: 9px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.form-group input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.field-hint { font-size: 11px; color: #94a3b8; }
code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-family: monospace; }

.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-top: 1px solid #f1f5f9; }
.toggle-label { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 2px; }
.toggle-desc { font-size: 12px; color: #94a3b8; }
.toggle { position: relative; display: inline-block; width: 46px; height: 26px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; background: #cbd5e1; border-radius: 26px; transition: 0.2s; cursor: pointer; }
.slider::before { content: ''; position: absolute; height: 20px; width: 20px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.toggle input:checked + .slider { background: #16a34a; }
.toggle input:checked + .slider::before { transform: translateX(20px); }

.alert { padding: 9px 14px; border-radius: 8px; font-size: 13px; margin-top: 14px; font-weight: 500; }
.alert-ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.alert-err { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

.btn-primary { padding: 9px 20px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
.btn-primary:hover { background: #1e40af; }
.btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-ghost { padding: 9px 16px; background: none; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-ghost:hover { background: #f8fafc; }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-test { padding: 10px 18px; background: #0f172a; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.btn-test:hover { background: #1e293b; }
.btn-test:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-sm { padding: 4px 10px; border: 1px solid #e2e8f0; background: #fff; color: #374151; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-sm:hover { background: #f8fafc; border-color: #cbd5e1; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary-sm { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.btn-primary-sm:hover { background: #1e40af; }
.btn-danger-sm { color: #dc2626; border-color: #fca5a5; }
.btn-danger-sm:hover { background: #fef2f2; }

.test-input-row { display: flex; gap: 10px; align-items: flex-end; }
.test-input-wrap { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.test-input-wrap input { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.test-input-wrap input:focus { border-color: #3b82f6; }
.input-hint { font-size: 11px; color: #94a3b8; }

.notif-flows { display: flex; flex-direction: column; gap: 14px; }
.flow-item { display: flex; gap: 14px; align-items: flex-start; }
.flow-icon { font-size: 20px; flex-shrink: 0; width: 28px; text-align: center; }
.flow-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
.flow-arrow { font-size: 12px; color: #64748b; line-height: 1.7; }
.flow-arrow em { color: #94a3b8; font-style: normal; }

.badge { display: inline-block; padding: 3px 9px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.badge-on { background: #dcfce7; color: #15803d; }
.badge-off { background: #f1f5f9; color: #94a3b8; }

.loading-state { display: flex; align-items: center; gap: 10px; padding: 32px; color: #94a3b8; font-size: 13px; justify-content: center; }
.spinner { width: 16px; height: 16px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.error-box { padding: 14px 16px; background: #fef2f2; color: #dc2626; border-radius: 8px; font-size: 13px; margin-bottom: 16px; border: 1px solid #fecaca; }
.error-hint { font-size: 12px; margin-top: 4px; }
.error-inline { margin-top: 10px; padding: 8px 12px; background: #fef2f2; color: #dc2626; border-radius: 7px; font-size: 12px; }
.empty-state { text-align: center; padding: 28px 20px; }
.empty-icon { font-size: 28px; margin-bottom: 8px; }
.empty-text { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 4px; }
.empty-hint { font-size: 12px; color: #94a3b8; }

.group-list { display: flex; flex-direction: column; margin-bottom: 20px; }
.group-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
.group-row:last-child { border-bottom: none; }
.group-info { flex: 1; min-width: 0; }
.group-name { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
.group-id { font-size: 11px; color: #94a3b8; word-break: break-all; font-family: monospace; }
.group-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.group-row-edit { display: flex; gap: 8px; align-items: center; width: 100%; flex-wrap: wrap; }
.edit-input { flex: 1; min-width: 120px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 7px; font-size: 12px; outline: none; }
.edit-input.mono { font-family: monospace; }
.edit-input:focus { border-color: #3b82f6; }
.edit-actions { display: flex; gap: 6px; }
.test-result { font-size: 11px; margin-top: 4px; padding: 3px 8px; border-radius: 5px; display: inline-block; }
.test-ok { background: #f0fdf4; color: #15803d; }
.test-err { background: #fef2f2; color: #dc2626; }
.add-section { border-top: 1px solid #e2e8f0; padding-top: 18px; }
.add-title { margin: 0 0 12px; font-size: 13px; font-weight: 700; color: #374151; }
.add-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.add-row input { flex: 1; min-width: 150px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; outline: none; font-family: inherit; }
.add-row input.mono { font-family: monospace; }
.add-row input:focus { border-color: #3b82f6; }

/* Pelanggan picker */
.pg-add-row { align-items: flex-start; }
.pel-picker { position: relative; flex: 1; min-width: 200px; }
.pel-input { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; outline: none; font-family: inherit; }
.pel-input:focus { border-color: #3b82f6; }
.pel-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); z-index: 100; max-height: 220px; overflow-y: auto; }
.pel-option { display: flex; gap: 8px; padding: 8px 12px; cursor: pointer; align-items: baseline; }
.pel-option:hover { background: #eff6ff; }
.pel-kode { font-size: 10px; color: #94a3b8; font-family: monospace; flex-shrink: 0; }
.pel-nama { font-size: 12px; color: #0f172a; font-weight: 500; }

/* Template layout */
.tpl-layout { display: grid; grid-template-columns: 240px 1fr; gap: 16px; align-items: start; }
.tpl-sidebar { background: #fff; border-radius: 12px; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.07); overflow: hidden; position: sticky; top: 16px; }
.tpl-sidebar-title { padding: 12px 16px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #f1f5f9; }
.tpl-menu-item { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 11px 16px; border: none; background: none; cursor: pointer; border-bottom: 1px solid #f8fafc; transition: background 0.1s; }
.tpl-menu-item:last-child { border-bottom: none; }
.tpl-menu-item:hover { background: #f8fafc; }
.tpl-menu-item.active { background: #eff6ff; border-left: 3px solid #1d4ed8; }
.tpl-menu-label { font-size: 12px; font-weight: 700; color: #374151; }
.tpl-menu-item.active .tpl-menu-label { color: #1d4ed8; }
.tpl-menu-hint { font-size: 11px; color: #94a3b8; line-height: 1.4; }
.tpl-editor-col { display: flex; flex-direction: column; }
.tpl-editor-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.tpl-editor-group label { font-size: 13px; font-weight: 600; color: #374151; }
.tpl-textarea { padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: monospace; line-height: 1.7; outline: none; resize: vertical; min-height: 200px; width: 100%; box-sizing: border-box; }
.tpl-textarea:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.tpl-char { font-size: 11px; color: #94a3b8; text-align: right; }
.placeholder-box { background: #f8fafc; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
.placeholder-title { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
.placeholder-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.placeholder-chip { padding: 3px 10px; background: #e0f2fe; color: #0369a1; border-radius: 6px; font-size: 11px; font-family: monospace; cursor: pointer; user-select: none; }
.placeholder-chip:hover { background: #bae6fd; }
.placeholder-hint { font-size: 11px; color: #94a3b8; line-height: 1.7; }
.tpl-preview { font-size: 13px; font-family: monospace; line-height: 1.8; white-space: pre-wrap; word-break: break-word; color: #374151; margin: 0; background: #f1f5f9; padding: 14px; border-radius: 8px; }

@media (max-width: 768px) {
  .tpl-layout { grid-template-columns: 1fr; }
  .tpl-sidebar { position: static; }
}
</style>
