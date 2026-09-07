<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '@/services/api'

type Tab = 'config' | 'internal-groups'
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

// ── Internal Groups ──────────────────────────────────────────────
type InternalGroup = { id: number; group_id: string; nama_group: string; is_active: boolean }
const internalGroups = ref<InternalGroup[]>([])
const igLoading    = ref(false)
const igLoadError  = ref('')
const igForm       = ref({ group_id: '', nama_group: '' })
const igAdding     = ref(false)
const igError      = ref('')
const igEditId     = ref<number | null>(null)
const igEditForm   = ref({ group_id: '', nama_group: '' })
const igTestingId  = ref<number | null>(null)
const igTestMsg    = ref<{ id: number; text: string; ok: boolean } | null>(null)

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
  igLoading.value = true; igLoadError.value = ''
  try {
    const r = await api.get('/starsender/internal-groups')
    internalGroups.value = Array.isArray(r.data) ? r.data : (r.data?.data ?? [])
  } catch (e: any) {
    igLoadError.value = e.response?.data?.message || `Error ${e.response?.status ?? ''}: gagal memuat grup`
  } finally { igLoading.value = false }
}

function switchTab(t: Tab) {
  tab.value = t
  if (t === 'internal-groups') loadInternalGroups()
}

// Config actions
async function save() {
  saving.value = true; msg.value = ''
  try {
    const payload: any = { is_active: form.value.is_active }
    if (form.value.api_key) payload.api_key = form.value.api_key
    await api.patch('/starsender/config', payload)
    msg.value = 'Konfigurasi berhasil disimpan'; msgType.value = 'ok'
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
  igAdding.value = true; igError.value = ''
  try {
    await api.post('/starsender/internal-groups', igForm.value)
    igForm.value = { group_id: '', nama_group: '' }
    await loadInternalGroups()
  } catch (e: any) {
    igError.value = e.response?.data?.message || 'Gagal menyimpan grup'
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

async function testIg(g: InternalGroup) {
  igTestingId.value = g.id; igTestMsg.value = null
  try {
    await api.post('/starsender/test-group', { group_id: g.group_id })
    igTestMsg.value = { id: g.id, text: `Test terkirim ke "${g.nama_group}"`, ok: true }
  } catch (e: any) {
    igTestMsg.value = { id: g.id, text: e.response?.data?.message || 'Gagal kirim test', ok: false }
  } finally { igTestingId.value = null }
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
      <button :class="['tab', tab === 'config' && 'active']" @click="switchTab('config')">
        <span class="tab-icon">⚙️</span> Konfigurasi
      </button>
      <button :class="['tab', tab === 'internal-groups' && 'active']" @click="switchTab('internal-groups')">
        <span class="tab-icon">👥</span> Grup Internal
      </button>
    </div>

    <!-- ══ TAB CONFIG ══ -->
    <template v-if="tab === 'config'">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>Memuat konfigurasi...</span>
      </div>
      <template v-else>
        <!-- Status banner -->
        <div :class="['status-banner', config.is_active ? 'banner-active' : 'banner-inactive']">
          <div class="banner-dot"></div>
          <div class="banner-text">
            <span v-if="config.is_active" class="banner-title">Notifikasi WA Aktif</span>
            <span v-else-if="config.configured" class="banner-title">Notifikasi WA Nonaktif</span>
            <span v-else class="banner-title">Belum Dikonfigurasi</span>
            <span class="banner-desc" v-if="config.is_active">Semua notifikasi tiket dan monitoring sedang berjalan.</span>
            <span class="banner-desc" v-else-if="config.configured">API key tersimpan — aktifkan untuk mulai kirim notifikasi.</span>
            <span class="banner-desc" v-else>Masukkan API key StarSender untuk mengaktifkan notifikasi WA.</span>
          </div>
        </div>

        <!-- API Config card -->
        <div class="card">
          <div class="card-header">
            <h3>Konfigurasi API</h3>
          </div>
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
          <div v-if="msg" :class="['alert', msgType === 'ok' ? 'alert-ok' : 'alert-err']">
            {{ msg }}
          </div>
          <div class="card-footer">
            <button class="btn-primary" @click="save" :disabled="saving">
              {{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
            </button>
          </div>
        </div>

        <!-- Test card -->
        <div class="card">
          <div class="card-header">
            <h3>Kirim Pesan Test</h3>
            <span class="card-badge">Manual Test</span>
          </div>
          <p class="card-desc">Masukkan nomor HP atau Group ID untuk menguji koneksi WhatsApp.</p>
          <div class="test-input-row">
            <div class="test-input-wrap">
              <input v-model="testPhone" type="text" placeholder="08xxx  atau  120363XXXXXXXX@g.us" />
              <span class="input-hint">No HP atau Group ID</span>
            </div>
            <button class="btn-test" @click="test" :disabled="testing || !config.configured || !testPhone">
              <span v-if="testing">⏳ Mengirim...</span>
              <span v-else>📤 Kirim Test</span>
            </button>
          </div>
        </div>

        <!-- Alur Notifikasi -->
        <div class="card card-info">
          <div class="card-header">
            <h3>Alur Notifikasi</h3>
          </div>
          <div class="notif-flows">
            <div class="flow-item">
              <div class="flow-icon">🎫</div>
              <div class="flow-body">
                <div class="flow-title">Tiket Baru</div>
                <div class="flow-desc">
                  <div class="flow-arrow">→ Grup WA pelanggan <em>(jika terdaftar)</em> atau no. HP PIC</div>
                  <div class="flow-arrow">→ Semua grup internal aktif <em>(atau individual staff jika belum ada grup)</em></div>
                </div>
              </div>
            </div>
            <div class="flow-item">
              <div class="flow-icon">🔄</div>
              <div class="flow-body">
                <div class="flow-title">Update Status Tiket</div>
                <div class="flow-desc">
                  <div class="flow-arrow">→ Customer <em>(In Progress, Resolved, Closed, Pending)</em></div>
                  <div class="flow-arrow">→ Semua grup internal aktif</div>
                </div>
              </div>
            </div>
            <div class="flow-item">
              <div class="flow-icon">🔴</div>
              <div class="flow-body">
                <div class="flow-title">Monitoring DOWN / UP</div>
                <div class="flow-desc">
                  <div class="flow-arrow">→ Semua grup internal aktif</div>
                </div>
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
          <span class="card-badge">{{ internalGroups.filter(g => g.is_active).length }} aktif</span>
        </div>
        <p class="card-desc">
          Notifikasi tiket baru, update status, dan alert monitoring dikirim ke semua grup aktif di sini.
          Group ID dapat diperoleh dari dashboard StarSender.
        </p>

        <div v-if="igLoading" class="loading-state">
          <div class="spinner"></div>
          <span>Memuat grup...</span>
        </div>
        <div v-else-if="igLoadError" class="error-box">
          ⚠️ {{ igLoadError }}
          <div class="error-hint">Coba logout → login ulang jika masalah akses.</div>
        </div>
        <template v-else>
          <div v-if="internalGroups.length" class="group-list">
            <div v-for="g in internalGroups" :key="g.id" class="group-row">
              <template v-if="igEditId === g.id">
                <div class="group-row-edit">
                  <input v-model="igEditForm.nama_group" class="edit-input" placeholder="Nama grup" />
                  <input v-model="igEditForm.group_id" class="edit-input mono" placeholder="Group ID" />
                  <div class="edit-actions">
                    <button class="btn-sm btn-primary-sm" @click="saveEditIg(g.id)">Simpan</button>
                    <button class="btn-sm" @click="igEditId = null">Batal</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="group-info">
                  <div class="group-name">{{ g.nama_group }}</div>
                  <div class="group-id mono">{{ g.group_id }}</div>
                  <div v-if="igTestMsg?.id === g.id" :class="['test-result', igTestMsg.ok ? 'test-ok' : 'test-err']">
                    {{ igTestMsg.text }}
                  </div>
                </div>
                <div class="group-actions">
                  <span :class="['badge', g.is_active ? 'badge-on' : 'badge-off']">
                    {{ g.is_active ? 'Aktif' : 'Nonaktif' }}
                  </span>
                  <button class="btn-sm" @click="testIg(g)" :disabled="igTestingId === g.id || !config.configured">
                    {{ igTestingId === g.id ? '⏳' : '📤 Test' }}
                  </button>
                  <button class="btn-sm" @click="startEditIg(g)">Edit</button>
                  <button class="btn-sm" @click="toggleIg(g)">{{ g.is_active ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                  <button class="btn-sm btn-danger-sm" @click="deleteIg(g.id)">Hapus</button>
                </div>
              </template>
            </div>
          </div>
          <div v-else class="empty-state">
            <div class="empty-icon">👥</div>
            <div class="empty-text">Belum ada grup internal terdaftar</div>
            <div class="empty-hint">Tambahkan grup WhatsApp internal di bawah ini</div>
          </div>

          <!-- Form tambah -->
          <div class="add-section">
            <h4 class="add-title">Tambah Grup Baru</h4>
            <div class="add-row">
              <input v-model="igForm.nama_group" type="text" placeholder="Nama grup  (mis: Ops Internal)" />
              <input v-model="igForm.group_id" type="text" placeholder="Group ID  (120363...@g.us)" class="mono" />
              <button class="btn-primary" @click="addInternalGroup" :disabled="igAdding || !igForm.group_id || !igForm.nama_group">
                {{ igAdding ? '...' : '+ Tambah' }}
              </button>
            </div>
            <div v-if="igError" class="error-inline">⚠️ {{ igError }}</div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 860px; }

.page-header { margin-bottom: 24px; }
.header-top { display: flex; align-items: flex-start; gap: 16px; }
.header-icon { font-size: 32px; flex-shrink: 0; line-height: 1; margin-top: 2px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; font-weight: 800; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; }

/* Tabs */
.tabs { display: flex; gap: 2px; margin-bottom: 24px; background: #f1f5f9; padding: 4px; border-radius: 10px; width: fit-content; }
.tab { display: flex; align-items: center; gap: 6px; padding: 8px 20px; background: none; border: none; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; border-radius: 7px; transition: all 0.15s; }
.tab.active { background: #fff; color: #1d4ed8; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.tab:hover:not(.active) { color: #0f172a; }
.tab-icon { font-size: 14px; }

/* Status banner */
.status-banner { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 10px; margin-bottom: 20px; }
.banner-active { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #bbf7d0; }
.banner-inactive { background: #f8fafc; border: 1px solid #e2e8f0; }
.banner-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.banner-active .banner-dot { background: #16a34a; box-shadow: 0 0 0 3px #bbf7d0; }
.banner-inactive .banner-dot { background: #94a3b8; }
.banner-text { display: flex; flex-direction: column; gap: 1px; }
.banner-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.banner-active .banner-title { color: #15803d; }
.banner-desc { font-size: 12px; color: #64748b; }

/* Cards */
.card { background: #fff; border-radius: 12px; padding: 22px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 16px; border: 1px solid #f1f5f9; }
.card-info { background: #fafbff; }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.card-header h3 { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
.card-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px; background: #f1f5f9; color: #475569; }
.card-desc { font-size: 13px; color: #64748b; margin: 0 0 16px; line-height: 1.6; }
.card-footer { margin-top: 18px; padding-top: 16px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; }

/* Forms */
.form-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 16px; }
.form-group label { font-size: 13px; font-weight: 600; color: #374151; }
.form-group input { padding: 9px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; transition: border-color 0.15s; }
.form-group input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.field-hint { font-size: 11px; color: #94a3b8; }
code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-family: monospace; }

/* Toggle */
.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-top: 1px solid #f1f5f9; }
.toggle-label { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 2px; }
.toggle-desc { font-size: 12px; color: #94a3b8; }
.toggle { position: relative; display: inline-block; width: 46px; height: 26px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; background: #cbd5e1; border-radius: 26px; transition: 0.2s; cursor: pointer; }
.slider::before { content: ''; position: absolute; height: 20px; width: 20px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.toggle input:checked + .slider { background: #16a34a; }
.toggle input:checked + .slider::before { transform: translateX(20px); }

/* Alert */
.alert { padding: 9px 14px; border-radius: 8px; font-size: 13px; margin-top: 14px; font-weight: 500; }
.alert-ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.alert-err { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

/* Buttons */
.btn-primary { padding: 9px 20px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
.btn-primary:hover { background: #1e40af; }
.btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

.btn-test { padding: 10px 18px; background: #0f172a; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background 0.15s; }
.btn-test:hover { background: #1e293b; }
.btn-test:disabled { opacity: 0.45; cursor: not-allowed; }

/* Test input */
.test-input-row { display: flex; gap: 10px; align-items: flex-end; }
.test-input-wrap { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.test-input-wrap input { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.test-input-wrap input:focus { border-color: #3b82f6; }
.input-hint { font-size: 11px; color: #94a3b8; }

/* Notif flows */
.notif-flows { display: flex; flex-direction: column; gap: 14px; }
.flow-item { display: flex; gap: 14px; align-items: flex-start; }
.flow-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; width: 28px; text-align: center; }
.flow-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
.flow-arrow { font-size: 12px; color: #64748b; line-height: 1.7; }
.flow-arrow em { color: #94a3b8; font-style: normal; }

/* Group list */
.group-list { display: flex; flex-direction: column; gap: 1px; margin-bottom: 20px; }
.group-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
.group-row:last-child { border-bottom: none; }
.group-info { flex: 1; min-width: 0; }
.group-name { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
.group-id { font-size: 11px; color: #94a3b8; word-break: break-all; }
.group-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.group-row-edit { display: flex; gap: 8px; align-items: center; width: 100%; flex-wrap: wrap; }
.edit-input { flex: 1; min-width: 120px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 7px; font-size: 12px; outline: none; }
.edit-input:focus { border-color: #3b82f6; }
.edit-actions { display: flex; gap: 6px; }

.test-result { font-size: 11px; margin-top: 4px; padding: 3px 8px; border-radius: 5px; }
.test-ok { background: #f0fdf4; color: #15803d; }
.test-err { background: #fef2f2; color: #dc2626; }

/* Small buttons */
.btn-sm { padding: 4px 10px; border: 1px solid #e2e8f0; background: #fff; color: #374151; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.1s; white-space: nowrap; }
.btn-sm:hover { background: #f8fafc; border-color: #cbd5e1; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary-sm { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.btn-primary-sm:hover { background: #1e40af; }
.btn-danger-sm { color: #dc2626; border-color: #fca5a5; }
.btn-danger-sm:hover { background: #fef2f2; }

/* Badge */
.badge { display: inline-block; padding: 3px 9px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.badge-on { background: #dcfce7; color: #15803d; }
.badge-off { background: #f1f5f9; color: #94a3b8; }

/* Empty state */
.empty-state { text-align: center; padding: 32px 20px; }
.empty-icon { font-size: 32px; margin-bottom: 8px; }
.empty-text { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 4px; }
.empty-hint { font-size: 12px; color: #94a3b8; }

/* Add section */
.add-section { border-top: 1px solid #e2e8f0; padding-top: 18px; }
.add-title { margin: 0 0 12px; font-size: 13px; font-weight: 700; color: #374151; }
.add-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.add-row input { flex: 1; min-width: 150px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; outline: none; }
.add-row input:focus { border-color: #3b82f6; }

/* Error */
.error-box { padding: 14px 16px; background: #fef2f2; color: #dc2626; border-radius: 8px; font-size: 13px; margin-bottom: 16px; line-height: 1.6; border: 1px solid #fecaca; }
.error-hint { font-size: 12px; color: #ef4444; margin-top: 4px; }
.error-inline { margin-top: 10px; padding: 8px 12px; background: #fef2f2; color: #dc2626; border-radius: 7px; font-size: 12px; }

/* Loading */
.loading-state { display: flex; align-items: center; gap: 10px; padding: 32px; color: #94a3b8; font-size: 13px; justify-content: center; }
.spinner { width: 16px; height: 16px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.mono { font-family: monospace; }
</style>
