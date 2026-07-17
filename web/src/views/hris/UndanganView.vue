<template>
  <div class="page">
    <div class="page-header">
      <button class="btn-back" @click="router.push('/hris/karyawan')">← Daftar Karyawan</button>
      <h2>Undangan Sign-In Karyawan Baru</h2>
      <p>Buat link pendaftaran mandiri untuk calon karyawan — mereka isi semua data sendiri (termasuk foto), akun otomatis dibuat dan kredensial dikirim ke email mereka.</p>
    </div>

    <div class="card form-card">
      <h3>Buat Undangan Baru</h3>
      <div class="form-row">
        <div class="field">
          <label>Departemen (opsional, sekadar hint)</label>
          <select v-model="form.departemen">
            <option value="">— Tidak ditentukan —</option>
            <option v-for="d in hris.departemenList" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
        <div class="field">
          <label>Jabatan (opsional, sekadar hint)</label>
          <input v-model="form.jabatan" type="text" placeholder="Contoh: Network Engineer" />
        </div>
        <button class="btn-primary" :disabled="creating" @click="handleCreate">
          {{ creating ? 'Membuat...' : '+ Buat Link' }}
        </button>
      </div>
      <p v-if="createError" class="error-msg">{{ createError }}</p>

      <div v-if="lastLink" class="link-result">
        <span class="link-text">{{ lastLink }}</span>
        <button class="btn-copy" @click="copyLink(lastLink)">{{ copied ? '✓ Disalin' : 'Salin Link' }}</button>
      </div>
    </div>

    <div class="card">
      <h3>Daftar Undangan</h3>
      <div v-if="loading" class="empty-state">Memuat...</div>
      <div v-else-if="!invitations.length" class="empty-state">Belum ada undangan dibuat</div>
      <table v-else class="tbl">
        <thead>
          <tr>
            <th>Dibuat</th>
            <th>Hint Departemen/Jabatan</th>
            <th>Status</th>
            <th>Kedaluwarsa</th>
            <th>Karyawan Terdaftar</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in invitations" :key="inv.id_invitation">
            <td>{{ fmtDateTime(inv.created_at) }}</td>
            <td>{{ inv.departemen || '—' }} / {{ inv.jabatan || '—' }}</td>
            <td><span class="badge" :class="statusClass(inv.status)">{{ inv.status }}</span></td>
            <td>{{ fmtDateTime(inv.expires_at) }}</td>
            <td>{{ inv.karyawan?.nama_lengkap || '—' }}</td>
            <td>
              <button
                v-if="inv.status === 'Pending'"
                class="btn-revoke"
                :disabled="revokingId === inv.id_invitation"
                @click="handleRevoke(inv.id_invitation)"
              >
                {{ revokingId === inv.id_invitation ? '...' : 'Batalkan' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useHrisStore } from '@/stores/hris'
import { fmtDateTime } from '@/composables/useFormat'

const router = useRouter()
const hris = useHrisStore()

const form = ref({ departemen: '', jabatan: '' })
const creating = ref(false)
const createError = ref('')
const lastLink = ref('')
const copied = ref(false)

const invitations = ref<any[]>([])
const loading = ref(true)
const revokingId = ref(0)

async function fetchInvitations() {
  loading.value = true
  try {
    const r = await api.get('/hris/invitations')
    invitations.value = r.data.data
  } catch {
    // biarkan daftar kosong, tidak fatal
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  creating.value = true
  createError.value = ''
  lastLink.value = ''
  try {
    const r = await api.post('/hris/invitations', {
      departemen: form.value.departemen || undefined,
      jabatan: form.value.jabatan || undefined,
    })
    const token = r.data.data.token
    lastLink.value = `${window.location.origin}/onboarding/${token}`
    form.value = { departemen: '', jabatan: '' }
    await fetchInvitations()
  } catch (e: any) {
    createError.value = e.response?.data?.message || 'Gagal membuat undangan'
  } finally {
    creating.value = false
  }
}

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // clipboard API mungkin tidak tersedia — biarkan user salin manual dari teks
  }
}

async function handleRevoke(id: number) {
  if (!confirm('Batalkan undangan ini? Link tidak akan bisa dipakai lagi.')) return
  revokingId.value = id
  try {
    await api.delete(`/hris/invitations/${id}`)
    await fetchInvitations()
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal membatalkan undangan')
  } finally {
    revokingId.value = 0
  }
}

function statusClass(status: string) {
  if (status === 'Pending') return 'badge-pending'
  if (status === 'Used') return 'badge-used'
  return 'badge-expired'
}

onMounted(async () => {
  await hris.fetchDepartemen()
  await fetchInvitations()
})
</script>

<style scoped>
.page { padding: 28px 32px; max-width: 1000px; }

.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 8px 0 4px; font-size: 22px; color: #0f172a; }
.page-header p { margin: 0; font-size: 13px; color: #64748b; max-width: 640px; }

.btn-back {
  background: none; border: none; color: #3b82f6;
  font-size: 14px; font-weight: 600; cursor: pointer; padding: 0;
}

.card {
  background: #fff; border-radius: 12px;
  padding: 24px 28px; margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.card h3 { margin: 0 0 16px; font-size: 16px; color: #0f172a; }

.form-row { display: flex; gap: 16px; align-items: flex-end; }
.field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input, .field select {
  padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; outline: none; background: #f8fafc; color: #0f172a;
}
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }

.btn-primary {
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff; border: none; border-radius: 8px;
  padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
  white-space: nowrap;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.error-msg {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  color: #dc2626; font-size: 13px; padding: 10px 14px; margin: 16px 0 0;
}

.link-result {
  margin-top: 16px; padding: 12px 16px;
  background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;
  display: flex; align-items: center; gap: 12px; justify-content: space-between;
}
.link-text { font-size: 13px; font-family: monospace; color: #15803d; word-break: break-all; }
.btn-copy {
  background: #15803d; color: #fff; border: none; border-radius: 6px;
  padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
}

.empty-state { color: #94a3b8; font-size: 14px; padding: 24px 0; text-align: center; }

.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; color: #94a3b8; font-weight: 600; font-size: 11px; text-transform: uppercase; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
.tbl td { padding: 10px; border-bottom: 1px solid #f8fafc; color: #0f172a; }

.badge { padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.badge-pending { background: #eff6ff; color: #1d4ed8; }
.badge-used { background: #f0fdf4; color: #15803d; }
.badge-expired { background: #f8fafc; color: #64748b; }

.btn-revoke {
  background: #fee2e2; border: none; border-radius: 6px;
  padding: 5px 12px; font-size: 12px; font-weight: 600; color: #dc2626; cursor: pointer;
}
.btn-revoke:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
