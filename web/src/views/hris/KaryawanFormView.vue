<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHrisStore } from '@/stores/hris'

const router = useRouter()
const route = useRoute()
const hris = useHrisStore()

const isEdit = computed(() => !!route.params.id && route.params.id !== 'tambah')
const id = computed(() => isEdit.value ? Number(route.params.id) : null)

const EMPTY_FORM = () => ({
  nip: '',
  nama_lengkap: '',
  jabatan: '',
  departemen: '',
  no_hp: '',
  email: '',
  tgl_bergabung: '',
  status_aktif: true,
  tempat_lahir: '',
  tgl_lahir: '',
  jenis_kelamin: '',
  agama: '',
  status_pernikahan: '',
  no_ktp: '',
  alamat_ktp: '',
  no_npwp: '',
  pendidikan_terakhir: '',
  kontak_darurat_nama: '',
  kontak_darurat_hp: '',
  kontak_darurat_hubungan: '',
  bank_nama: '',
  bank_no_rekening: '',
  bank_atas_nama: '',
})

const form = ref(EMPTY_FORM())
const submitting = ref(false)
const errorMsg = ref('')

// Muat ulang tiap kali route berubah (Tambah -> Edit -> Tambah tanpa reload
// halaman sebelumnya membuat data karyawan lama tetap nempel di form).
async function loadForm() {
  errorMsg.value = ''
  form.value = EMPTY_FORM()
  if (isEdit.value && id.value) {
    const data = await hris.fetchOne(id.value)
    if (data) {
      form.value = {
        nip: data.nip,
        nama_lengkap: data.nama_lengkap,
        jabatan: data.jabatan,
        departemen: data.departemen,
        no_hp: data.no_hp || '',
        email: data.email || '',
        tgl_bergabung: data.tgl_bergabung ? data.tgl_bergabung.substring(0, 10) : '',
        status_aktif: data.status_aktif,
        tempat_lahir: data.tempat_lahir || '',
        tgl_lahir: data.tgl_lahir ? data.tgl_lahir.substring(0, 10) : '',
        jenis_kelamin: data.jenis_kelamin || '',
        agama: data.agama || '',
        status_pernikahan: data.status_pernikahan || '',
        no_ktp: data.no_ktp || '',
        alamat_ktp: data.alamat_ktp || '',
        no_npwp: data.no_npwp || '',
        pendidikan_terakhir: data.pendidikan_terakhir || '',
        kontak_darurat_nama: data.kontak_darurat_nama || '',
        kontak_darurat_hp: data.kontak_darurat_hp || '',
        kontak_darurat_hubungan: data.kontak_darurat_hubungan || '',
        bank_nama: data.bank_nama || '',
        bank_no_rekening: data.bank_no_rekening || '',
        bank_atas_nama: data.bank_atas_nama || '',
      }
    }
  }
}

onMounted(async () => {
  await hris.fetchDepartemen()
  await loadForm()
})

watch(() => route.params.id, () => { loadForm() })

async function submit() {
  errorMsg.value = ''
  if (!form.value.nip || !form.value.nama_lengkap || !form.value.jabatan || !form.value.departemen) {
    errorMsg.value = 'NIP, Nama, Jabatan, dan Departemen wajib diisi'
    return
  }

  submitting.value = true
  try {
    const payload = {
      ...form.value,
      tgl_bergabung: form.value.tgl_bergabung || undefined,
      no_hp: form.value.no_hp || undefined,
      email: form.value.email || undefined,
      tempat_lahir: form.value.tempat_lahir || undefined,
      tgl_lahir: form.value.tgl_lahir || undefined,
      jenis_kelamin: form.value.jenis_kelamin || undefined,
      agama: form.value.agama || undefined,
      status_pernikahan: form.value.status_pernikahan || undefined,
      no_ktp: form.value.no_ktp || undefined,
      alamat_ktp: form.value.alamat_ktp || undefined,
      no_npwp: form.value.no_npwp || undefined,
      pendidikan_terakhir: form.value.pendidikan_terakhir || undefined,
      kontak_darurat_nama: form.value.kontak_darurat_nama || undefined,
      kontak_darurat_hp: form.value.kontak_darurat_hp || undefined,
      kontak_darurat_hubungan: form.value.kontak_darurat_hubungan || undefined,
      bank_nama: form.value.bank_nama || undefined,
      bank_no_rekening: form.value.bank_no_rekening || undefined,
      bank_atas_nama: form.value.bank_atas_nama || undefined,
    }

    if (isEdit.value && id.value) {
      await hris.updateKaryawan(id.value, payload)
      router.push(`/hris/karyawan/${id.value}`)
    } else {
      const result = await hris.createKaryawan(payload)
      router.push(`/hris/karyawan/${result.id_karyawan}`)
    }
  } catch (e: any) {
    errorMsg.value = e.response?.data?.message || 'Terjadi kesalahan'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <button class="btn-back" @click="router.push('/hris/karyawan')">← Kembali</button>
      <h2>{{ isEdit ? 'Edit Karyawan' : 'Tambah Karyawan' }}</h2>
    </div>

    <div class="form-card">
      <form @submit.prevent="submit">
        <div class="form-grid">
          <div class="field">
            <label>NIP <span class="req">*</span></label>
            <input v-model="form.nip" type="text" placeholder="Contoh: N1-002" :disabled="isEdit" />
          </div>
          <div class="field">
            <label>Nama Lengkap <span class="req">*</span></label>
            <input v-model="form.nama_lengkap" type="text" placeholder="Nama lengkap karyawan" />
          </div>
          <div class="field">
            <label>Jabatan <span class="req">*</span></label>
            <input v-model="form.jabatan" type="text" placeholder="Contoh: Network Engineer" />
          </div>
          <div class="field">
            <label>Departemen <span class="req">*</span></label>
            <select v-model="form.departemen">
              <option value="">Pilih departemen</option>
              <option v-for="d in hris.departemenList" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <div class="field">
            <label>No. HP</label>
            <input v-model="form.no_hp" type="text" placeholder="08xx-xxxx-xxxx" />
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="form.email" type="email" placeholder="email@nextone.id" />
          </div>
          <div class="field">
            <label>Tanggal Bergabung</label>
            <input v-model="form.tgl_bergabung" type="date" />
          </div>
          <div class="field" v-if="isEdit">
            <label>Status</label>
            <select v-model="form.status_aktif">
              <option :value="true">Aktif</option>
              <option :value="false">Nonaktif</option>
            </select>
          </div>
        </div>

        <h3 class="section-title">Data Pribadi</h3>
        <div class="form-grid">
          <div class="field">
            <label>Tempat Lahir</label>
            <input v-model="form.tempat_lahir" type="text" placeholder="Contoh: Surabaya" />
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
            <input v-model="form.no_npwp" type="text" placeholder="xx.xxx.xxx.x-xxx.xxx" />
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
            <input v-model="form.alamat_ktp" type="text" placeholder="Alamat lengkap sesuai KTP" />
          </div>
        </div>

        <h3 class="section-title">Kontak Darurat</h3>
        <div class="form-grid">
          <div class="field">
            <label>Nama</label>
            <input v-model="form.kontak_darurat_nama" type="text" placeholder="Nama kontak darurat" />
          </div>
          <div class="field">
            <label>No. HP</label>
            <input v-model="form.kontak_darurat_hp" type="text" placeholder="08xx-xxxx-xxxx" />
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
            <input v-model="form.bank_no_rekening" type="text" placeholder="Nomor rekening" />
          </div>
          <div class="field">
            <label>Nama Pemilik Rekening</label>
            <input v-model="form.bank_atas_nama" type="text" placeholder="Sesuai buku tabungan" />
          </div>
        </div>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="router.back()">Batal</button>
          <button type="submit" class="btn-submit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : (isEdit ? 'Simpan Perubahan' : 'Tambah Karyawan') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 800px; }

.page-header { margin-bottom: 24px; }
.page-header h2 { margin: 8px 0 0; font-size: 22px; color: #0f172a; }

.btn-back {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.form-card {
  background: #fff;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.field-wide { grid-column: 1 / -1; }

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin: 28px 0 16px;
  padding-top: 20px;
  border-top: 1px solid #f1f5f9;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.req { color: #ef4444; }
.field input, .field select {
  padding: 9px 12px;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #f8fafc;
  color: #0f172a;
}
.field input:focus, .field select:focus {
  border-color: #3b82f6;
  background: #fff;
}
.field input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 13px;
  padding: 10px 14px;
  margin: 20px 0 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 28px;
}
.btn-cancel {
  padding: 10px 20px;
  background: #f1f5f9;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}
.btn-submit {
  padding: 10px 24px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
