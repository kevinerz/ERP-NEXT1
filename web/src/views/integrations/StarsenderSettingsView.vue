<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const config   = ref<{ configured: boolean; is_active: boolean; api_key_masked: string | null }>({ configured: false, is_active: false, api_key_masked: null })
const loading  = ref(true)
const saving   = ref(false)
const testing  = ref(false)
const msg      = ref('')
const msgType  = ref<'ok'|'err'>('ok')

const form = ref({ api_key: '', is_active: false })
const testPhone = ref('')

onMounted(load)

async function load() {
  loading.value = true
  try {
    const r = await api.get('/starsender/config')
    config.value = r.data.data
    form.value.is_active = config.value.is_active
  } finally { loading.value = false }
}

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
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>💬 StarSender — WhatsApp Notifikasi</h2>
      <p class="sub">Kirim notifikasi WA otomatis untuk tiket baru, update status, dan alert monitoring down.</p>
    </div>

    <div v-if="loading" class="loading">Memuat konfigurasi...</div>
    <template v-else>

      <!-- Status badge -->
      <div :class="['status-bar', config.is_active ? 'active' : 'inactive']">
        <span class="dot"></span>
        <span v-if="config.is_active">Aktif — notifikasi WA berjalan</span>
        <span v-else-if="config.configured">Nonaktif — API key tersimpan tapi notifikasi dimatikan</span>
        <span v-else>Belum dikonfigurasi — masukkan API key StarSender</span>
      </div>

      <!-- Form -->
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

      <!-- Test -->
      <div class="card">
        <h3 class="card-title">Kirim Test WA</h3>
        <div class="test-row">
          <input v-model="testPhone" type="text" placeholder="Nomor tujuan: 08xxx atau 628xxx" />
          <button class="btn-test" @click="test" :disabled="testing || !config.configured">
            {{ testing ? 'Mengirim...' : '📤 Kirim Test' }}
          </button>
        </div>
      </div>

      <!-- Info notifikasi -->
      <div class="card info-card">
        <h3 class="card-title">Notifikasi yang Dikirim</h3>
        <div class="notif-list">
          <div class="notif-item">
            <span class="notif-icon">🎫</span>
            <div>
              <div class="notif-title">Tiket Baru</div>
              <div class="notif-desc">WA ke customer (no. HP PIC di data pelanggan) + ke staff internal operations</div>
            </div>
          </div>
          <div class="notif-item">
            <span class="notif-icon">📋</span>
            <div>
              <div class="notif-title">Update Status Tiket</div>
              <div class="notif-desc">WA ke customer saat status berubah ke In Progress, Resolved, Closed, atau Pending Customer</div>
            </div>
          </div>
          <div class="notif-item">
            <span class="notif-icon">🔴</span>
            <div>
              <div class="notif-title">Monitoring DOWN</div>
              <div class="notif-desc">WA ke semua staff internal operations saat UptimeKuma mendeteksi down</div>
            </div>
          </div>
          <div class="notif-item">
            <span class="notif-icon">✅</span>
            <div>
              <div class="notif-title">Monitoring Kembali UP</div>
              <div class="notif-desc">WA ke staff internal saat monitor kembali online</div>
            </div>
          </div>
        </div>
        <p class="info-note">Nomor WA staff diambil dari field <strong>No. HP</strong> di data karyawan yang punya akses modul <em>Operations</em>.</p>
      </div>

    </template>
  </div>
</template>

<style scoped>
.page        { padding: 28px 32px; max-width: 760px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; color: #0f172a; font-weight: 800; }
.sub         { margin: 0; font-size: 13px; color: #64748b; }
.loading     { padding: 40px; text-align: center; color: #94a3b8; }

.status-bar  { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
.status-bar.active   { background: #f0fdf4; color: #15803d; }
.status-bar.inactive { background: #f8fafc; color: #64748b; }
.dot         { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

.card        { background: #fff; border-radius: 12px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 16px; }
.card-title  { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 16px; }

.field       { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.field input:focus { border-color: #3b82f6; }
.hint        { font-size: 11px; color: #94a3b8; }

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

.test-row    { display: flex; gap: 10px; }
.test-row input { flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.test-row input:focus { border-color: #3b82f6; }
.btn-test    { padding: 8px 16px; background: #0f172a; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.btn-test:hover { background: #1e293b; }
.btn-test:disabled { opacity: 0.5; cursor: not-allowed; }

.info-card   { background: #f8fafc; }
.notif-list  { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.notif-item  { display: flex; align-items: flex-start; gap: 12px; }
.notif-icon  { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
.notif-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.notif-desc  { font-size: 12px; color: #64748b; margin-top: 2px; }
.info-note   { font-size: 12px; color: #94a3b8; margin: 0; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style>
