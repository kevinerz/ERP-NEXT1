<template>
  <div class="settings-page">
    <div class="page-header">
      <h1>Pengaturan Aplikasi</h1>
      <p class="subtitle">Konfigurasi informasi perusahaan, logo, dan preferensi sistem</p>
    </div>

    <div class="settings-layout">
      <!-- LEFT: Logo + Brand -->
      <div class="settings-card logo-card">
        <h2>Logo Perusahaan</h2>
        <div class="logo-preview">
          <img v-if="form.company_logo_url" :src="form.company_logo_url" alt="Logo" class="logo-img" />
          <div v-else class="logo-placeholder">
            <span class="logo-icon">🏢</span>
            <span>Belum ada logo</span>
          </div>
        </div>
        <label class="upload-btn">
          <input type="file" accept="image/*" @change="handleLogoUpload" hidden />
          <span>{{ uploading ? 'Mengunggah...' : '📁 Pilih Logo' }}</span>
        </label>
        <p class="hint">Format: PNG/JPG/SVG. Rekomendasi 400×120px, transparan.</p>

        <div class="divider" />

        <h2>Brand</h2>
        <div class="field">
          <label>Nama Brand / Singkatan</label>
          <input v-model="form.company_brand" placeholder="Next1" />
          <span class="hint">Dipakai di sidebar dan dokumen</span>
        </div>
        <div class="field">
          <label>Tagline</label>
          <input v-model="form.company_tagline" placeholder="Internet Service Provider" />
        </div>
      </div>

      <!-- RIGHT: Company Info -->
      <div class="settings-card info-card">
        <h2>Informasi Perusahaan</h2>
        <div class="field">
          <label>Nama PT / Badan Usaha <span class="req">*</span></label>
          <input v-model="form.company_name" placeholder="PT Perdana Global Internet" />
        </div>
        <div class="field">
          <label>NPWP</label>
          <input v-model="form.company_npwp" placeholder="00.000.000.0-000.000" />
        </div>
        <div class="field">
          <label>Alamat</label>
          <textarea v-model="form.company_address" rows="3" placeholder="Jl. ..." />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Kota</label>
            <input v-model="form.company_city" placeholder="Jakarta" />
          </div>
          <div class="field">
            <label>Zona Waktu</label>
            <select v-model="form.timezone">
              <option>Asia/Jakarta</option>
              <option>Asia/Makassar</option>
              <option>Asia/Jayapura</option>
            </select>
          </div>
        </div>

        <div class="divider" />
        <h2>Kontak</h2>
        <div class="field-row">
          <div class="field">
            <label>Telepon / WA</label>
            <input v-model="form.company_phone" placeholder="+62 21 ..." />
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="form.company_email" type="email" placeholder="info@next1.co.id" />
          </div>
        </div>
        <div class="field">
          <label>Website</label>
          <input v-model="form.company_website" placeholder="https://next1.co.id" />
        </div>
      </div>

      <!-- BOTTOM: Dokumen -->
      <div class="settings-card doc-card">
        <h2>Pengaturan Dokumen</h2>
        <div class="field-row">
          <div class="field">
            <label>Prefix Invoice</label>
            <input v-model="form.invoice_prefix" placeholder="INV" style="max-width:120px" />
            <span class="hint">Contoh: INV-202506-0001</span>
          </div>
          <div class="field">
            <label>Simbol Mata Uang</label>
            <input v-model="form.currency_symbol" placeholder="Rp" style="max-width:80px" />
          </div>
        </div>
        <div class="field">
          <label>Footer Dokumen / Invoice</label>
          <textarea v-model="form.invoice_footer" rows="2"
            placeholder="Terima kasih atas kepercayaan Anda." />
          <span class="hint">Ditampilkan di bagian bawah invoice dan surat</span>
        </div>
      </div>
    </div>

    <!-- Save bar -->
    <div class="save-bar">
      <div v-if="saved" class="save-ok">✓ Pengaturan berhasil disimpan</div>
      <div v-if="saveError" class="save-err">{{ saveError }}</div>
      <button class="btn-save" :disabled="saving" @click="handleSave">
        {{ saving ? 'Menyimpan...' : 'Simpan Pengaturan' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import api from '@/services/api'
import { useSettingsStore } from '@/stores/settings'

const store = useSettingsStore()

const form = reactive({ ...store.settings })
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const uploading = ref(false)

onMounted(async () => {
  await store.fetch()
  Object.assign(form, store.settings)
})

async function handleSave() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  try {
    await api.patch('/settings', { ...form })
    Object.assign(store.settings, form)
    saved.value = true
    setTimeout(() => { saved.value = false }, 3000)
  } catch (e: any) {
    saveError.value = e?.response?.data?.message ?? 'Gagal menyimpan'
  } finally {
    saving.value = false
  }
}

async function handleLogoUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/settings/logo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    form.company_logo_url = res.url
    store.settings.company_logo_url = res.url
  } catch (err: any) {
    alert('Gagal upload logo: ' + (err?.response?.data?.message ?? err?.message ?? 'Unknown error'))
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.settings-page { padding: 24px; max-width: 1100px; }
.page-header { margin-bottom: 28px; }
.page-header h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 4px; }
.subtitle { color: #6b7280; font-size: 0.9rem; margin: 0; }

.settings-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  grid-template-rows: auto auto;
  gap: 20px;
}

.settings-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 24px;
}
.logo-card { grid-row: 1 / 3; }
.info-card { grid-column: 2; grid-row: 1; }
.doc-card  { grid-column: 2; grid-row: 2; }

h2 { font-size: 1rem; font-weight: 600; margin: 0 0 16px; color: #111827; }

.logo-preview {
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  background: #f9fafb;
  overflow: hidden;
}
.logo-img { max-height: 100%; max-width: 100%; object-fit: contain; padding: 8px; }
.logo-placeholder { display: flex; flex-direction: column; align-items: center; gap: 6px; color: #9ca3af; font-size: 0.85rem; }
.logo-icon { font-size: 2rem; }

.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  transition: background 0.15s;
}
.upload-btn:hover { background: #e5e7eb; }

.divider { height: 1px; background: #f3f4f6; margin: 20px 0; }

.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.field:last-child { margin-bottom: 0; }
.field label { font-size: 0.8rem; font-weight: 500; color: #6b7280; }
.field input, .field textarea, .field select {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 0.875rem;
  outline: none;
  transition: border 0.15s;
  font-family: inherit;
  resize: vertical;
}
.field input:focus, .field textarea:focus, .field select:focus { border-color: #6366f1; }
.req { color: #ef4444; }

.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.hint { font-size: 0.75rem; color: #9ca3af; margin-top: 2px; }

.save-bar {
  position: sticky;
  bottom: 0;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  padding: 14px 0;
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  justify-content: flex-end;
}
.btn-save {
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 28px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-save:hover:not(:disabled) { background: #4f46e5; }
.btn-save:disabled { opacity: 0.6; cursor: default; }
.save-ok { color: #16a34a; font-size: 0.875rem; font-weight: 500; }
.save-err { color: #dc2626; font-size: 0.875rem; }
</style>
