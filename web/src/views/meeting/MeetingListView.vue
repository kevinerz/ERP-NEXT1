<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDateTime } from '@/composables/useFormat'
import KaryawanPicker from './KaryawanPicker.vue'

interface RapatRingkas {
  id_rapat: number; judul: string; deskripsi: string | null; jadwal_at: string | null; status: string
  mulai_at: string | null; selesai_at: string | null; created_at: string; pembuat: string; moderator: boolean
  peserta: { id_karyawan: number; nama: string; peran: string }[]; jumlah_hadir: number
}

const router = useRouter()
const aktif = ref<RapatRingkas[]>([])
const riwayat = ref<RapatRingkas[]>([])
const memuat = ref(true)
const error = ref('')

async function muat() {
  memuat.value = true
  error.value = ''
  try {
    const { data } = await api.get('/meeting')
    aktif.value = data.data.aktif
    riwayat.value = data.data.riwayat
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat rapat'
  } finally {
    memuat.value = false
  }
}
onMounted(muat)

const KELAS: Record<string, string> = { Berlangsung: 'badge-green', Terjadwal: 'badge-blue', Selesai: 'badge-gray', Dibatalkan: 'badge-red' }
function waktu(r: RapatRingkas) {
  if (r.status === 'Berlangsung') return `Mulai ${fmtDateTime(r.mulai_at)}`
  if (r.status === 'Selesai') return `${fmtDateTime(r.mulai_at || r.created_at)} – ${r.selesai_at ? new Date(r.selesai_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}`
  return r.jadwal_at ? fmtDateTime(r.jadwal_at) : 'Rapat dadakan'
}
const namaPeserta = (r: RapatRingkas) => {
  const n = r.peserta.map((p) => p.nama.split(' ')[0])
  return n.length > 5 ? `${n.slice(0, 5).join(', ')} +${n.length - 5}` : n.join(', ')
}

// ── Rapat baru ───────────────────────────────────────────────────────────────
const form = reactive({ buka: false, judul: '', deskripsi: '', mode: 'sekarang' as 'sekarang' | 'jadwal', jadwal: '', peserta: [] as number[], simpan: false, err: '' })
function bukaForm() {
  const besok = new Date(Date.now() + 3600_000)
  besok.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  Object.assign(form, {
    buka: true, judul: '', deskripsi: '', mode: 'sekarang', peserta: [], err: '',
    jadwal: `${besok.getFullYear()}-${pad(besok.getMonth() + 1)}-${pad(besok.getDate())}T${pad(besok.getHours())}:00`,
  })
}
const siap = computed(() => form.judul.trim().length >= 2 && (form.mode === 'sekarang' || !!form.jadwal))
async function simpan() {
  if (!siap.value) return
  form.simpan = true
  form.err = ''
  try {
    const { data } = await api.post('/meeting', {
      judul: form.judul.trim(), deskripsi: form.deskripsi.trim() || undefined, peserta: form.peserta,
      jadwal_at: form.mode === 'jadwal' ? new Date(form.jadwal).toISOString() : undefined,
    })
    form.buka = false
    router.push({ path: `/meeting/${data.data.id_rapat}`, query: form.mode === 'sekarang' ? { masuk: '1' } : {} })
  } catch (e: any) {
    const m = e?.response?.data?.message
    form.err = Array.isArray(m) ? m.join(', ') : m || 'Gagal membuat rapat'
  } finally {
    form.simpan = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">📹 Meeting</h2>
        <p class="page-subtitle">Rapat internal NEXT1 — masuk dengan akun ERP</p>
      </div>
      <button type="button" class="btn btn-primary" @click="bukaForm">+ Rapat baru</button>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="memuat" class="loading-state">Memuat…</div>

    <template v-else>
      <h3 class="rp-h3">Akan datang & berlangsung</h3>
      <p v-if="!aktif.length" class="muted">Belum ada rapat. Buat rapat baru untuk mengundang rekan.</p>
      <div class="rp-kartu-grid">
        <div v-for="r in aktif" :key="r.id_rapat" class="rp-kartu" :class="{ hidup: r.status === 'Berlangsung' }" @click="router.push(`/meeting/${r.id_rapat}`)">
          <div class="rp-kartu-atas">
            <span class="badge" :class="KELAS[r.status]">{{ r.status === 'Berlangsung' ? '● Berlangsung' : r.status }}</span>
            <small v-if="r.moderator" class="muted">Moderator</small>
          </div>
          <b class="rp-judul">{{ r.judul }}</b>
          <small class="muted">🕒 {{ waktu(r) }}</small>
          <small class="muted">👥 {{ namaPeserta(r) }}</small>
          <button type="button" class="btn btn-sm" :class="r.status === 'Berlangsung' ? 'btn-success' : 'btn-secondary'" @click.stop="router.push({ path: `/meeting/${r.id_rapat}`, query: { masuk: '1' } })">
            {{ r.status === 'Berlangsung' ? 'Gabung sekarang' : 'Masuk' }}
          </button>
        </div>
      </div>

      <h3 class="rp-h3">Riwayat</h3>
      <div class="table-card">
        <table class="data-table">
          <thead><tr><th>Rapat</th><th>Waktu</th><th>Status</th><th>Peserta</th><th>Kehadiran</th></tr></thead>
          <tbody>
            <tr v-if="!riwayat.length"><td colspan="5" class="muted pusat">Belum ada riwayat.</td></tr>
            <tr v-for="r in riwayat" :key="r.id_rapat" class="klik" @click="router.push(`/meeting/${r.id_rapat}`)">
              <td><b>{{ r.judul }}</b><br /><small class="muted">oleh {{ r.pembuat }}</small></td>
              <td>{{ waktu(r) }}</td>
              <td><span class="badge" :class="KELAS[r.status]">{{ r.status }}</span></td>
              <td>{{ r.peserta.length }}</td>
              <td>{{ r.jumlah_hadir ? `${r.jumlah_hadir} kali masuk` : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Modal rapat baru -->
    <div v-if="form.buka" class="modal-overlay" @click.self="form.buka = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3 class="modal-title">Rapat baru</h3>
          <button type="button" class="btn-modal-close" @click="form.buka = false">×</button>
        </div>
        <div class="modal-body rp-form">
          <div class="form-group">
            <label class="form-label form-required">Judul</label>
            <input v-model="form.judul" maxlength="200" class="form-input" placeholder="mis. Koordinasi NOC mingguan" autofocus />
          </div>
          <div class="form-group">
            <label class="form-label">Waktu</label>
            <div class="rp-pilihan">
              <label><input v-model="form.mode" type="radio" value="sekarang" /> Mulai sekarang</label>
              <label><input v-model="form.mode" type="radio" value="jadwal" /> Jadwalkan</label>
              <input v-if="form.mode === 'jadwal'" v-model="form.jadwal" type="datetime-local" class="form-input rp-jadwal" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Peserta <small class="muted">({{ form.peserta.length }} dipilih — Anda otomatis jadi moderator)</small></label>
            <KaryawanPicker v-model="form.peserta" />
          </div>
          <div class="form-group">
            <label class="form-label">Agenda <small class="muted">(opsional)</small></label>
            <textarea v-model="form.deskripsi" rows="3" maxlength="5000" class="form-textarea" placeholder="Poin yang akan dibahas"></textarea>
          </div>
          <div v-if="form.err" class="alert alert-danger">{{ form.err }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" @click="form.buka = false">Batal</button>
          <button type="button" class="btn btn-primary" :disabled="!siap || form.simpan" @click="simpan">
            {{ form.simpan ? 'Menyimpan…' : form.mode === 'sekarang' ? 'Buat & masuk' : 'Jadwalkan & undang' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rp-h3 { font-size: 14px; font-weight: 700; margin: 18px 0 10px; color: var(--text-2, #334155); }
.rp-kartu-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.rp-kartu { display: flex; flex-direction: column; gap: 6px; padding: 14px; background: #fff; border: 1px solid var(--border, #e2e8f0); border-radius: 12px; cursor: pointer; }
.rp-kartu:hover { border-color: #94a3b8; }
.rp-kartu.hidup { border-color: #22c55e; box-shadow: 0 0 0 1px #22c55e inset; }
.rp-kartu-atas { display: flex; justify-content: space-between; align-items: center; }
.rp-kartu .btn { align-self: flex-start; margin-top: 4px; }
.rp-judul { font-size: 15px; }
.rp-form { display: flex; flex-direction: column; gap: 14px; }
.rp-pilihan { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font-size: 14px; }
.rp-pilihan label { display: flex; gap: 6px; align-items: center; }
.rp-jadwal { max-width: 230px; }
.muted { color: var(--text-3, #64748b); }
.pusat { text-align: center; }
.klik { cursor: pointer; }
</style>
