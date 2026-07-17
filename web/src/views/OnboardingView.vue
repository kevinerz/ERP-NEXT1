<template>
  <div class="onboarding-page">
    <div class="onboarding-card">
      <div class="brand">
        <h1>ERP Next1</h1>
        <p>PT Perdana Global Internet</p>
      </div>

      <!-- Loading validasi token -->
      <div v-if="checking" class="state-box">
        <div class="spinner"></div>
        <span>Memeriksa link undangan...</span>
      </div>

      <!-- Token invalid/expired/used -->
      <div v-else-if="checkError" class="state-box error">
        <span class="state-icon">⚠️</span>
        <p>{{ checkError }}</p>
        <p class="hint">Hubungi HR/Admin untuk mendapatkan link undangan baru.</p>
      </div>

      <!-- Sukses submit -->
      <div v-else-if="result" class="state-box success">
        <span class="state-icon">✅</span>
        <h3>Pendaftaran Berhasil!</h3>
        <p>{{ result.message }}</p>
        <div v-if="!result.data.email_sent" class="credential-box">
          <div class="cred-row"><span class="cred-label">Username</span><span class="cred-value">{{ result.data.username }}</span></div>
          <div class="cred-row"><span class="cred-label">Password</span><span class="cred-value">{{ result.data.password }}</span></div>
          <p class="cred-warning">⚠️ Catat sekarang — password ini tidak akan ditampilkan lagi.</p>
        </div>
        <a href="/login" class="btn-primary btn-block">Ke Halaman Login</a>
      </div>

      <!-- Form onboarding -->
      <form v-else @submit.prevent="submit">
        <h2>Lengkapi Data Diri Anda</h2>
        <p class="sub">Isi data lengkap Anda di bawah ini. Setelah submit, username &amp; password akan dikirim ke email yang Anda daftarkan.</p>

        <div class="avatar-wrap">
          <img v-if="fotoPreview" :src="fotoPreview" alt="" class="avatar-photo" />
          <div v-else class="avatar-circle">📷</div>
          <label class="avatar-edit-btn">
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleFotoChange" />
            {{ foto ? 'Ganti' : 'Unggah Foto' }}
          </label>
        </div>

        <h3 class="section-title">Data Utama</h3>
        <div class="form-grid">
          <div class="field">
            <label>Nama Lengkap <span class="req">*</span></label>
            <input v-model="form.nama_lengkap" type="text" required />
          </div>
          <div class="field">
            <label>Jabatan <span class="req">*</span></label>
            <input v-model="form.jabatan" type="text" required />
          </div>
          <div class="field">
            <label>Departemen <span class="req">*</span></label>
            <select v-model="form.departemen" required>
              <option value="">Pilih departemen</option>
              <option v-for="d in departemenList" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <div class="field">
            <label>No. HP <span class="req">*</span></label>
            <input v-model="form.no_hp" type="text" placeholder="08xx-xxxx-xxxx" required />
          </div>
          <div class="field field-wide">
            <label>Email <span class="req">*</span></label>
            <input v-model="form.email" type="email" placeholder="Username & password dikirim ke sini" required />
          </div>
        </div>

        <h3 class="section-title">Data Pribadi</h3>
        <div class="form-grid">
          <div class="field">
            <label>Tempat Lahir</label>
            <input v-model="form.tempat_lahir" type="text" />
          </div>
          <div class="field">
            <label>Tanggal Lahir</label>
            <input v-model="form.tgl_lahir" type="date" />
          </div>
          <div class="field">
            <label>Jenis Kelamin</label>
            <select v-model="form.jenis_kelamin">
              <option value="">Pilih jenis kelamin</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>
          <div class="field">
            <label>Agama</label>
            <select v-model="form.agama">
              <option value="">Pilih agama</option>
              <option value="Islam">Islam</option>
              <option value="Kristen">Kristen</option>
              <option value="Katolik">Katolik</option>
              <option value="Hindu">Hindu</option>
              <option value="Buddha">Buddha</option>
              <option value="Konghucu">Konghucu</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>
          <div class="field">
            <label>Status Pernikahan</label>
            <select v-model="form.status_pernikahan">
              <option value="">Pilih status</option>
              <option value="Belum Menikah">Belum Menikah</option>
              <option value="Menikah">Menikah</option>
              <option value="Cerai">Cerai</option>
            </select>
          </div>
          <div class="field">
            <label>No. KTP</label>
            <input v-model="form.no_ktp" type="text" maxlength="20" placeholder="16 digit NIK" />
          </div>
          <div class="field">
            <label>No. NPWP</label>
            <input v-model="form.no_npwp" type="text" />
          </div>
          <div class="field">
            <label>Pendidikan Terakhir</label>
            <select v-model="form.pendidikan_terakhir">
              <option value="">Pilih pendidikan</option>
              <option value="SD">SD</option>
              <option value="SMP">SMP</option>
              <option value="SMA/SMK">SMA/SMK</option>
              <option value="D3">D3</option>
              <option value="S1">S1</option>
              <option value="S2">S2</option>
              <option value="S3">S3</option>
            </select>
          </div>
          <div class="field field-wide">
            <label>Alamat (sesuai KTP)</label>
            <input v-model="form.alamat_ktp" type="text" />
          </div>
        </div>

        <h3 class="section-title">Kontak Darurat</h3>
        <div class="form-grid">
          <div class="field">
            <label>Nama</label>
            <input v-model="form.kontak_darurat_nama" type="text" />
          </div>
          <div class="field">
            <label>No. HP</label>
            <input v-model="form.kontak_darurat_hp" type="text" />
          </div>
          <div class="field">
            <label>Hubungan</label>
            <input v-model="form.kontak_darurat_hubungan" type="text" placeholder="Contoh: Suami/Istri, Orang Tua" />
          </div>
        </div>

        <h3 class="section-title">Rekening Bank (untuk Payroll)</h3>
        <div class="form-grid">
          <div class="field">
            <label>Nama Bank</label>
            <input v-model="form.bank_nama" type="text" placeholder="Contoh: BCA, Mandiri" />
          </div>
          <div class="field">
            <label>No. Rekening</label>
            <input v-model="form.bank_no_rekening" type="text" />
          </div>
          <div class="field">
            <label>Nama Pemilik Rekening</label>
            <input v-model="form.bank_atas_nama" type="text" />
          </div>
        </div>

        <p v-if="submitError" class="error-msg">{{ submitError }}</p>

        <button type="submit" class="btn-primary btn-block" :disabled="submitting">
          {{ submitting ? 'Mengirim...' : 'Daftar Sekarang' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const token = route.params.token as string

const checking = ref(true)
const checkError = ref('')
const departemenList = ref<string[]>([])

const foto = ref<File | null>(null)
const fotoPreview = ref('')

const form = ref({
  nama_lengkap: '', jabatan: '', departemen: '', no_hp: '', email: '',
  tempat_lahir: '', tgl_lahir: '', jenis_kelamin: '', agama: '', status_pernikahan: '',
  no_ktp: '', alamat_ktp: '', no_npwp: '', pendidikan_terakhir: '',
  kontak_darurat_nama: '', kontak_darurat_hp: '', kontak_darurat_hubungan: '',
  bank_nama: '', bank_no_rekening: '', bank_atas_nama: '',
})

const submitting = ref(false)
const submitError = ref('')
const result = ref<any>(null)

async function checkToken() {
  checking.value = true
  try {
    const r = await api.get(`/onboarding/${token}`)
    if (r.data.data.departemen) form.value.departemen = r.data.data.departemen
    if (r.data.data.jabatan) form.value.jabatan = r.data.data.jabatan
    departemenList.value = r.data.data.departemen_list || []
  } catch (e: any) {
    checkError.value = e.response?.data?.message || 'Link undangan tidak valid'
  } finally {
    checking.value = false
  }
}

function handleFotoChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  foto.value = file
  fotoPreview.value = URL.createObjectURL(file)
}

async function submit() {
  submitError.value = ''
  submitting.value = true
  try {
    const fd = new FormData()
    Object.entries(form.value).forEach(([k, v]) => { if (v) fd.append(k, v) })
    if (foto.value) fd.append('foto', foto.value)

    const r = await api.post(`/onboarding/${token}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    result.value = r.data
  } catch (e: any) {
    submitError.value = e.response?.data?.message || 'Gagal mengirim pendaftaran'
  } finally {
    submitting.value = false
  }
}

onMounted(checkToken)
</script>

<style scoped>
.onboarding-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 40px 16px;
}
.onboarding-card {
  background: #fff; border-radius: 16px;
  padding: 32px; max-width: 720px; width: 100%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}

.brand { text-align: center; margin-bottom: 24px; }
.brand h1 { margin: 0; font-size: 22px; color: #1e40af; }
.brand p { margin: 4px 0 0; font-size: 13px; color: #64748b; }

.state-box { text-align: center; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.state-box.error p { color: #dc2626; }
.state-box.success h3 { margin: 4px 0; color: #15803d; }
.state-icon { font-size: 36px; }
.state-box .hint { font-size: 12px; color: #94a3b8; }
.spinner { width: 24px; height: 24px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.credential-box {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 16px 20px; margin: 12px 0; width: 100%; max-width: 320px;
}
.cred-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
.cred-label { color: #64748b; }
.cred-value { font-family: monospace; font-weight: 700; color: #0f172a; }
.cred-warning { color: #b45309; font-size: 12px; margin: 8px 0 0; }

h2 { font-size: 18px; color: #0f172a; margin: 0 0 6px; }
.sub { font-size: 13px; color: #64748b; margin: 0 0 20px; }

.avatar-wrap { position: relative; width: 84px; margin: 0 auto 20px; }
.avatar-circle {
  width: 84px; height: 84px; border-radius: 50%;
  background: #f1f5f9; display: flex; align-items: center; justify-content: center;
  font-size: 28px;
}
.avatar-photo { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; }
.avatar-edit-btn {
  display: block; text-align: center; margin-top: 8px;
  font-size: 12px; color: #3b82f6; font-weight: 600; cursor: pointer;
}

.section-title {
  font-size: 14px; font-weight: 700; color: #0f172a;
  margin: 24px 0 14px; padding-top: 16px; border-top: 1px solid #f1f5f9;
}
.section-title:first-of-type { border-top: none; padding-top: 0; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-wide { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select {
  padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; outline: none; background: #f8fafc; color: #0f172a;
}
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }

.error-msg {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  color: #dc2626; font-size: 13px; padding: 10px 14px; margin: 20px 0 0;
}

.btn-primary {
  display: block; text-align: center; text-decoration: none;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff; border: none; border-radius: 8px;
  padding: 12px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-block { width: 100%; margin-top: 24px; box-sizing: border-box; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
