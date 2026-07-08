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
