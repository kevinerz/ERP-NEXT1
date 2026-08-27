<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '@/services/api'

type Tab = 'config' | 'internal-groups' | 'pelanggan-groups'
const tab = ref<Tab>('config')

// ── Config ───────────────────────────────────────────────────────
const config   = ref<{ configured: boolean; is_active: boolean; api_key_masked: string | null }>({ configured: false, is_active: false, api_key_masked: null })
const loading  = ref(true)
const saving   = ref(false)
const testing  = ref(false)
const msg      = ref('')
const msgType  = ref<'ok'|'err'>('ok')

const form = ref({ api_key: '', is_active: false })
const testPhone = ref('')

// ── Internal Groups ──────────────────────────────────────────────
type InternalGroup = { id: number; group_id: string; nama_group: string; is_active: boolean }
const internalGroups = ref<InternalGroup[]>([])
const igLoading = ref(false)
const igForm = ref({ group_id: '', nama_group: '' })
const igAdding = ref(false)
const igEditId = ref<number | null>(null)
const igEditForm = ref({ group_id: '', nama_group: '' })

// ── Pelanggan Groups ─────────────────────────────────────────────
type PelangganRow = { id_pelanggan: number; nama_pelanggan: string; wa_group_id: string | null; nama_grup: string | null }
const pelangganRows = ref<PelangganRow[]>([])
const pgLoading = ref(false)
const pgEditId = ref<number | null>(null)
const pgEditForm = ref({ wa_group_id: '', nama_grup: '' })
const pgSearch = ref('')

const filteredPelanggan = computed(() =>
  pelangganRows.value.filter(p =>
    p.nama_pelanggan.toLowerCase().includes(pgSearch.value.toLowerCase())
  )
)

onMounted(load)

async function load() {
  loading.value = true
  try {
    const r = await api.get('/starsender/config')
    config.value = r.data.data
    form.value.is_active = config.value.is_active
  } finally { loading.value = false }
}

async function loadInternalGroups() {
  igLoading.value = true
  try {
    const r = await api.get('/starsender/internal-groups')
    internalGroups.value = r.data
  } finally { igLoading.value = false }
}

async function loadPelangganGroups() {
  pgLoading.value = true
  try {
    const r = await api.get('/starsender/pelanggan-groups')
    pelangganRows.value = r.data
  } finally { pgLoading.value = false }
}

function switchTab(t: Tab) {
  tab.value = t
  if (t === 'internal-groups' && !internalGroups.value.length) loadInternalGroups()
  if (t === 'pelanggan-groups' && !pelangganRows.value.length) loadPelangganGroups()
}

// Config actions
async function save() {
  saving.value = true; msg.value = ''
  try {
    const payload: any = { is_active: form.value.is_active }
    if (form.value.api_key) payload.api_key = form.value.api_key
    await api.patch('/starsender/config', payload)
    msg.value = 'Konfigurasi disimpan'; msgType.value = 'ok'
    form.value.api_key = ''
    await load()
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

// Internal group actions
async function addInternalGroup() {
  if (!igForm.value.group_id || !igForm.value.nama_group) return
  igAdding.value = true
  try {
    await api.post('/starsender/internal-groups', igForm.value)
    igForm.value = { group_id: '', nama_group: '' }
    await loadInternalGroups()
  } finally { igAdding.value = false }
}

function startEditIg(g: InternalGroup) {
  igEditId.value = g.id
  igEditForm.value = { group_id: g.group_id, nama_group: g.nama_group }
}

async function saveEditIg(id: number) {
  await api.patch(`/starsender/internal-groups/${id}`, igEditForm.value)
  igEditId.value = null
  await loadInternalGroups()
}

async function toggleIg(g: InternalGroup) {
  await api.patch(`/starsender/internal-groups/${g.id}`, { is_active: !g.is_active })
  await loadInternalGroups()
}

async function deleteIg(id: number) {
  if (!confirm('Hapus grup internal ini?')) return
  await api.delete(`/starsender/internal-groups/${id}`)
  await loadInternalGroups()
}

// Pelanggan group actions
function startEditPg(p: PelangganRow) {
  pgEditId.value = p.id_pelanggan
  pgEditForm.value = { wa_group_id: p.wa_group_id ?? '', nama_grup: p.nama_grup ?? '' }
}

async function saveEditPg(id: number) {
  await api.patch(`/starsender/pelanggan-groups/${id}`, {
    wa_group_id: pgEditForm.value.wa_group_id || null,
    nama_grup: pgEditForm.value.nama_grup || null,
  })
  pgEditId.value = null
  await loadPelangganGroups()
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>💬 StarSender — WhatsApp Notifikasi</h2>
      <p class="sub">Kirim notifikasi WA otomatis untuk tiket baru, update status, dan alert monitoring down.</p>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button :class="['tab', tab === 'config' && 'active']" @click="switchTab('config')">Konfigurasi API</button>
      <button :class="['tab', tab === 'internal-groups' && 'active']" @click="switchTab('internal-groups')">Grup Internal</button>
      <button :class="['tab', tab === 'pelanggan-groups' && 'active']" @click="switchTab('pelanggan-groups')">Grup Pelanggan</button>
    </div>

    <!-- ══ TAB CONFIG ══ -->
    <template v-if="tab === 'config'">
      <div v-if="loading" class="loading">Memuat konfigurasi...</div>
      <template v-else>
        <div :class="['status-bar', config.is_active ? 'active' : 'inactive']">
          <span class="dot"></span>
          <span v-if="config.is_active">Aktif — notifikasi WA berjalan</span>
          <span v-else-if="config.configured">Nonaktif — API key tersimpan tapi notifikasi dimatikan</span>
          <span v-else>Belum dikonfigurasi — masukkan API key StarSender</span>
        </div>

        <div class="card">
          <h3 class="card-title">Konfigurasi API</h3>
          <div class="field">
            <label>API Key StarSender</label>
            <input v-model="form.api_key" type="password" placeholder="Kosongkan untuk tidak mengubah key yang tersimpan" />
            <span v-if="config.api_key_masked" class="hint">Key tersimpan: {{ config.api_key_masked }}</span>
          </div>
          <div class="field toggle-field">
            <label>Aktifkan Notifikasi WA</label>
            <label class="toggle">
              <input type="checkbox" v-model="form.is_active" />
              <span class="slider"></span>
            </label>
          </div>
          <div v-if="msg" :class="['alert', msgType === 'ok' ? 'alert-ok' : 'alert-err']">{{ msg }}</div>
          <button class="btn-save" @click="save" :disabled="saving">
            {{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
          </button>
        </div>

        <div class="card">
          <h3 class="card-title">Kirim Test WA</h3>
          <p class="hint mb8">Masukkan nomor / Group ID untuk test. Group ID format: <code>120363XXXXXXXX@g.us</code></p>
          <div class="test-row">
            <input v-model="testPhone" type="text" placeholder="08xxx atau 628xxx atau GroupID@g.us" />
            <button class="btn-test" @click="test" :disabled="testing || !config.configured">
              {{ testing ? 'Mengirim...' : '📤 Kirim Test' }}
            </button>
          </div>
        </div>

        <div class="card info-card">
          <h3 class="card-title">Alur Notifikasi</h3>
          <div class="notif-list">
            <div class="notif-item">
              <span class="notif-icon">🎫</span>
              <div>
                <div class="notif-title">Tiket Baru / Update Status</div>
                <div class="notif-desc">→ Grup pelanggan (jika dikonfigurasi), atau no. HP PIC<br>→ Semua grup internal aktif (atau individual staff jika belum ada grup)</div>
              </div>
            </div>
            <div class="notif-item">
              <span class="notif-icon">🔴</span>
              <div>
                <div class="notif-title">Monitoring DOWN / UP</div>
                <div class="notif-desc">→ Semua grup internal aktif</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ══ TAB GRUP INTERNAL ══ -->
    <template v-else-if="tab === 'internal-groups'">
      <div class="card">
        <h3 class="card-title">Grup Internal</h3>
        <p class="hint mb8">
          Notif tiket baru, update status, dan monitoring alert dikirim ke semua grup aktif di sini.
          Group ID bisa didapat dari StarSender dashboard — format <code>120363XXXXXXXX@g.us</code>.
        </p>

        <div v-if="igLoading" class="loading">Memuat...</div>
        <template v-else>
          <table v-if="internalGroups.length" class="tbl">
            <thead>
              <tr><th>Nama Grup</th><th>Group ID</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="g in internalGroups" :key="g.id">
                <template v-if="igEditId === g.id">
                  <td><input v-model="igEditForm.nama_group" class="td-input" /></td>
                  <td><input v-model="igEditForm.group_id" class="td-input mono" /></td>
                  <td></td>
                  <td class="td-actions">
                    <button class="btn-xs btn-ok" @click="saveEditIg(g.id)">Simpan</button>
                    <button class="btn-xs" @click="igEditId = null">Batal</button>
                  </td>
                </template>
                <template v-else>
                  <td class="fw">{{ g.nama_group }}</td>
                  <td class="mono gray">{{ g.group_id }}</td>
                  <td>
                    <span :class="['badge', g.is_active ? 'badge-on' : 'badge-off']">
                      {{ g.is_active ? 'Aktif' : 'Nonaktif' }}
                    </span>
                  </td>
                  <td class="td-actions">
                    <button class="btn-xs" @click="startEditIg(g)">Edit</button>
                    <button class="btn-xs" @click="toggleIg(g)">{{ g.is_active ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                    <button class="btn-xs btn-del" @click="deleteIg(g.id)">Hapus</button>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty">Belum ada grup internal. Tambah di bawah.</p>

          <!-- Form tambah -->
          <div class="add-form">
            <h4>Tambah Grup</h4>
            <div class="add-row">
              <input v-model="igForm.nama_group" type="text" placeholder="Nama grup (mis. Ops Internal)" />
              <input v-model="igForm.group_id" type="text" placeholder="Group ID (120363...@g.us)" class="mono" />
              <button class="btn-save sm" @click="addInternalGroup" :disabled="igAdding || !igForm.group_id || !igForm.nama_group">
                {{ igAdding ? '...' : '+ Tambah' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- ══ TAB GRUP PELANGGAN ══ -->
    <template v-else-if="tab === 'pelanggan-groups'">
      <div class="card">
        <h3 class="card-title">Grup WA per Pelanggan</h3>
        <p class="hint mb8">Atur Group ID WA untuk setiap pelanggan. Notif tiket akan dikirim ke grup ini (jika kosong, fallback ke no. HP PIC).</p>

        <input v-model="pgSearch" type="text" placeholder="Cari pelanggan..." class="search-input" />

        <div v-if="pgLoading" class="loading">Memuat...</div>
        <table v-else class="tbl">
          <thead>
            <tr><th>Pelanggan</th><th>Nama Grup</th><th>Group ID</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredPelanggan" :key="p.id_pelanggan">
              <template v-if="pgEditId === p.id_pelanggan">
                <td class="fw">{{ p.nama_pelanggan }}</td>
                <td><input v-model="pgEditForm.nama_grup" class="td-input" placeholder="Nama grup" /></td>
                <td><input v-model="pgEditForm.wa_group_id" class="td-input mono" placeholder="120363...@g.us" /></td>
                <td class="td-actions">
                  <button class="btn-xs btn-ok" @click="saveEditPg(p.id_pelanggan)">Simpan</button>
                  <button class="btn-xs" @click="pgEditId = null">Batal</button>
                </td>
              </template>
              <template v-else>
                <td class="fw">{{ p.nama_pelanggan }}</td>
                <td class="gray">{{ p.nama_grup || '—' }}</td>
                <td class="mono gray small">{{ p.wa_group_id || '—' }}</td>
                <td class="td-actions">
                  <button class="btn-xs" @click="startEditPg(p)">{{ p.wa_group_id ? 'Edit' : 'Set Grup' }}</button>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page        { padding: 28px 32px; max-width: 900px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; color: #0f172a; font-weight: 800; }
.sub         { margin: 0; font-size: 13px; color: #64748b; }
.loading     { padding: 40px; text-align: center; color: #94a3b8; }
.empty       { color: #94a3b8; font-size: 13px; padding: 12px 0; }

/* Tabs */
.tabs        { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
.tab         { padding: 8px 18px; background: none; border: none; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; }
.tab.active  { color: #1d4ed8; border-bottom-color: #1d4ed8; }
.tab:hover:not(.active) { color: #0f172a; }

.status-bar  { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
.status-bar.active   { background: #f0fdf4; color: #15803d; }
.status-bar.inactive { background: #f8fafc; color: #64748b; }
.dot         { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

.card        { background: #fff; border-radius: 12px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 16px; }
.card-title  { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 12px; }

.field       { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.field input:focus { border-color: #3b82f6; }
.hint        { font-size: 11px; color: #94a3b8; }
.mb8         { margin-bottom: 8px; }

.toggle-field { flex-direction: row; align-items: center; justify-content: space-between; }
.toggle      { position: relative; display: inline-block; width: 44px; height: 24px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider      { position: absolute; inset: 0; background: #cbd5e1; border-radius: 24px; transition: 0.2s; cursor: pointer; }
.slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; }
.toggle input:checked + .slider { background: #16a34a; }
.toggle input:checked + .slider::before { transform: translateX(20px); }

.alert       { padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.alert-ok    { background: #f0fdf4; color: #15803d; }
.alert-err   { background: #fef2f2; color: #dc2626; }

.btn-save    { padding: 9px 20px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
.btn-save:hover { background: #1e40af; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-save.sm { padding: 7px 14px; font-size: 12px; }

.test-row    { display: flex; gap: 10px; }
.test-row input { flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.test-row input:focus { border-color: #3b82f6; }
.btn-test    { padding: 8px 16px; background: #0f172a; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.btn-test:hover { background: #1e293b; }
.btn-test:disabled { opacity: 0.5; cursor: not-allowed; }

/* Info notif */
.info-card   { background: #f8fafc; }
.notif-list  { display: flex; flex-direction: column; gap: 12px; }
.notif-item  { display: flex; align-items: flex-start; gap: 12px; }
.notif-icon  { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
.notif-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.notif-desc  { font-size: 12px; color: #64748b; margin-top: 2px; line-height: 1.6; }

/* Table */
.tbl         { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
.tbl th      { text-align: left; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
.tbl td      { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }
.fw          { font-weight: 600; color: #0f172a; }
.gray        { color: #64748b; }
.mono        { font-family: monospace; font-size: 12px; }
.small       { font-size: 11px; }

.badge       { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.badge-on    { background: #dcfce7; color: #15803d; }
.badge-off   { background: #f1f5f9; color: #94a3b8; }

.td-input    { padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; width: 100%; outline: none; }
.td-input:focus { border-color: #3b82f6; }
.td-actions  { white-space: nowrap; }

.btn-xs      { padding: 3px 8px; border: 1px solid #cbd5e1; background: #fff; color: #374151; border-radius: 5px; font-size: 11px; font-weight: 600; cursor: pointer; margin-left: 4px; }
.btn-xs:hover { background: #f8fafc; }
.btn-xs.btn-ok  { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.btn-xs.btn-del { color: #dc2626; border-color: #fca5a5; }
.btn-xs.btn-del:hover { background: #fef2f2; }

/* Add form */
.add-form    { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 14px; }
.add-form h4 { margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #374151; }
.add-row     { display: flex; gap: 8px; align-items: center; }
.add-row input { flex: 1; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; outline: none; }
.add-row input:focus { border-color: #3b82f6; }

.search-input { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; margin-bottom: 4px; box-sizing: border-box; }
.search-input:focus { border-color: #3b82f6; }

code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 11px; }
</style>
