<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { confirmDialog, alertError } from '@/composables/useDialog'
import { fmtDateTime } from '@/composables/useFormat'
import KaryawanPicker from './KaryawanPicker.vue'
import RuangRapat from './RuangRapat.vue'

interface Peserta {
  id_karyawan: number; nama: string; jabatan: string; peran: string; hadir: boolean; online: boolean
  masuk_at: string | null; keluar_at: string | null; menit: number
}
interface Detail {
  id_rapat: number; judul: string; deskripsi: string | null; jadwal_at: string | null; status: string
  mulai_at: string | null; selesai_at: string | null; created_at: string; moderator: boolean
  pembuat: { id_karyawan: number; nama: string }; peserta: Peserta[]
  tamu: { nama: string; online: boolean; masuk_at: string | null; keluar_at: string | null; menit: number }[]
  link_tamu: { kode: string; aktif: boolean; dimatikan: boolean; sampai: string | null } | null
}

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)
const detail = ref<Detail | null>(null)
const error = ref('')
const pesan = ref('')

async function muatDetail() {
  try {
    const { data } = await api.get(`/meeting/${id}`)
    detail.value = data.data
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat rapat'
  }
}
let timerDetail: ReturnType<typeof setInterval> | null = null
onMounted(async () => {
  await muatDetail()
  timerDetail = setInterval(() => { if (!sesi.value) muatDetail() }, 15_000)
  if (route.query.masuk === '1' && detail.value && detail.value.status !== 'Dibatalkan') masuk()
})
onBeforeUnmount(() => { if (timerDetail) clearInterval(timerDetail) })

// ── Masuk rapat ──────────────────────────────────────────────────────────────
const pakaiMic = ref(true)
const pakaiKamera = ref(true)
const menyambung = ref(false)
const sesi = ref<{ url: string; token: string; judul: string; moderator: boolean } | null>(null)
async function masuk() {
  if (menyambung.value || sesi.value) return
  menyambung.value = true
  pesan.value = ''
  try {
    const { data } = await api.post(`/meeting/${id}/token`)
    sesi.value = data.data
    if (route.query.masuk) router.replace({ query: {} })
  } catch (e) {
    alertError(e, 'Gagal masuk rapat')
  } finally {
    menyambung.value = false
  }
}
function selesai(p: string) {
  sesi.value = null
  pesan.value = p
  muatDetail()
}
async function kelola(aksi: 'keluarkan' | 'bisukan' | 'akhiri', identity?: string, track_sid?: string) {
  await api.post(`/meeting/${id}/kelola`, { aksi, identity, track_sid })
}

// ── Link tamu ────────────────────────────────────────────────────────────────
const linkTamu = computed(() => (detail.value?.link_tamu ? `${location.origin}/rapat/tamu/${detail.value.link_tamu.kode}` : ''))
const tersalin = ref(false)
const prosesLink = ref(false)
async function aturLink(aktif: boolean, baru = false) {
  if (baru && !(await confirmDialog({ title: 'Buat link baru?', message: 'Link lama tidak bisa dipakai lagi.', confirmLabel: 'Buat link baru', variant: 'warning' }))) return
  prosesLink.value = true
  try {
    const { data } = await api.post(`/meeting/${id}/tamu`, { aktif, baru })
    detail.value = data.data
    if (aktif) salinLink()
  } catch (e) {
    alertError(e, 'Gagal mengatur link tamu')
  } finally {
    prosesLink.value = false
  }
}
async function salinLink() {
  if (!linkTamu.value) return
  try {
    await navigator.clipboard.writeText(linkTamu.value)
    tersalin.value = true
    setTimeout(() => { tersalin.value = false }, 2000)
  } catch { /* clipboard ditolak — link tetap terlihat untuk disalin manual */ }
}
const teksUndangan = computed(() => {
  const d = detail.value
  if (!d || !linkTamu.value) return ''
  return `Undangan rapat NEXT1\n*${d.judul}*\n${d.jadwal_at ? `Waktu: ${fmtDateTime(d.jadwal_at)}\n` : ''}Masuk lewat browser (Chrome/Edge/Safari), tanpa instal aplikasi:\n${linkTamu.value}`
})
const waLink = computed(() => `https://wa.me/?text=${encodeURIComponent(teksUndangan.value)}`)

// ── Kelola undangan karyawan ─────────────────────────────────────────────────
const undang = reactive({ buka: false, pilih: [] as number[], simpan: false })
async function simpanUndangan() {
  if (!undang.pilih.length) return
  undang.simpan = true
  try {
    const { data } = await api.post(`/meeting/${id}/peserta`, { id_karyawan: undang.pilih })
    detail.value = data.data
    undang.buka = false
  } catch (e) {
    alertError(e, 'Gagal mengundang')
  } finally {
    undang.simpan = false
  }
}
async function hapusPeserta(p: Peserta) {
  if (!(await confirmDialog({ title: `Hapus ${p.nama} dari undangan?`, confirmLabel: 'Hapus', variant: 'danger' }))) return
  try {
    const { data } = await api.delete(`/meeting/${id}/peserta/${p.id_karyawan}`)
    detail.value = data.data
  } catch (e) { alertError(e, 'Gagal') }
}
async function jadikanModerator(p: Peserta) {
  try {
    const { data } = await api.post(`/meeting/${id}/peserta/${p.id_karyawan}/moderator`)
    detail.value = data.data
  } catch (e) { alertError(e, 'Gagal') }
}
async function batalkan() {
  if (!(await confirmDialog({ title: 'Batalkan rapat?', message: 'Semua peserta akan diberi tahu.', confirmLabel: 'Batalkan rapat', variant: 'danger' }))) return
  try {
    await api.post(`/meeting/${id}/batal`)
    await muatDetail()
  } catch (e) { alertError(e, 'Gagal membatalkan') }
}
const KELAS: Record<string, string> = { Berlangsung: 'badge-green', Terjadwal: 'badge-blue', Selesai: 'badge-gray', Dibatalkan: 'badge-red' }
const fmtJam = (d: string | null) => (d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-')
const bisaAtur = computed(() => !!detail.value?.moderator && detail.value.status !== 'Dibatalkan' && detail.value.status !== 'Selesai')
</script>

<template>
  <RuangRapat
    v-if="sesi" :url="sesi.url" :token="sesi.token" :judul="sesi.judul" :moderator="sesi.moderator"
    :mic="pakaiMic" :kamera="pakaiKamera" :kelola="kelola" @selesai="selesai"
  />

  <div v-else class="page">
    <div class="page-header">
      <div>
        <button type="button" class="btn btn-ghost btn-sm" @click="router.push('/meeting')">← Meeting</button>
        <h2 class="page-title">{{ detail?.judul || 'Rapat' }}</h2>
        <p v-if="detail" class="page-subtitle">
          <span class="badge" :class="KELAS[detail.status]">{{ detail.status }}</span>
          · {{ detail.jadwal_at ? fmtDateTime(detail.jadwal_at) : 'Rapat dadakan' }} · dibuat {{ detail.pembuat.nama }}
        </p>
      </div>
    </div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="pesan" class="alert alert-warning">{{ pesan }}</div>

    <div v-if="detail" class="rd">
      <div class="rd-kiri">
        <div class="table-card rd-masuk">
          <template v-if="detail.status !== 'Dibatalkan'">
            <h4>Masuk rapat</h4>
            <label class="rd-cek"><input v-model="pakaiMic" type="checkbox" /> 🎙️ Mikrofon nyala</label>
            <label class="rd-cek"><input v-model="pakaiKamera" type="checkbox" /> 📷 Kamera nyala</label>
            <button type="button" class="btn btn-success btn-lg" :disabled="menyambung" @click="masuk">
              {{ menyambung ? 'Menyambungkan…' : detail.status === 'Berlangsung' ? 'Gabung sekarang' : 'Masuk rapat' }}
            </button>
            <p class="muted kecil">Browser akan meminta izin kamera & mikrofon. Gunakan Chrome / Edge / Safari terbaru.</p>
          </template>
          <p v-else class="muted">Rapat ini dibatalkan.</p>
          <div v-if="detail.deskripsi" class="rd-agenda">
            <h4>Agenda</h4>
            <p>{{ detail.deskripsi }}</p>
          </div>
          <div v-if="detail.moderator && detail.status === 'Terjadwal'" class="rd-mod">
            <button type="button" class="btn btn-ghost btn-sm" @click="batalkan">Batalkan rapat</button>
          </div>
        </div>

        <!-- Link tamu (moderator) -->
        <div v-if="detail.moderator" class="table-card rd-masuk">
          <h4>🔗 Link tamu</h4>
          <p class="muted kecil">Untuk orang di luar HRIS (vendor, klien, calon karyawan). Tamu cukup isi nama lalu langsung masuk — hanya ke rapat ini.</p>
          <template v-if="detail.link_tamu?.aktif">
            <div class="rd-link">
              <input :value="linkTamu" readonly class="form-input" @focus="($event.target as HTMLInputElement).select()" />
              <button type="button" class="btn btn-secondary btn-sm" @click="salinLink">{{ tersalin ? '✓ Tersalin' : 'Salin' }}</button>
            </div>
            <small class="muted">Berlaku sampai {{ fmtDateTime(detail.link_tamu.sampai) }}, atau sampai rapat selesai.</small>
            <div class="rd-link-aksi">
              <a class="btn btn-success btn-sm" :href="waLink" target="_blank" rel="noopener">Kirim via WhatsApp</a>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="prosesLink" @click="aturLink(true, true)">Buat link baru</button>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="prosesLink" @click="aturLink(false)">Matikan</button>
            </div>
          </template>
          <template v-else-if="bisaAtur">
            <p v-if="detail.link_tamu" class="muted kecil">Link sebelumnya {{ detail.link_tamu.dimatikan ? 'dimatikan' : 'kedaluwarsa' }}.</p>
            <button type="button" class="btn btn-secondary" :disabled="prosesLink" @click="aturLink(true)">{{ detail.link_tamu ? 'Aktifkan lagi' : 'Buat link tamu' }}</button>
          </template>
          <p v-else class="muted kecil">Rapat sudah selesai.</p>
        </div>
      </div>

      <div class="table-card rd-peserta">
        <div class="rd-peserta-atas">
          <h4>Peserta ({{ detail.peserta.length }}<template v-if="detail.tamu.length"> + {{ detail.tamu.length }} tamu</template>)</h4>
          <button v-if="bisaAtur" type="button" class="btn btn-secondary btn-sm" @click="Object.assign(undang, { buka: true, pilih: [] })">+ Undang karyawan</button>
        </div>
        <table class="data-table">
          <thead><tr><th>Nama</th><th>Peran</th><th>Kehadiran</th><th v-if="detail.moderator"></th></tr></thead>
          <tbody>
            <tr v-for="p in detail.peserta" :key="p.id_karyawan">
              <td><b>{{ p.nama }}</b><br /><small class="muted">{{ p.jabatan }}</small></td>
              <td>{{ p.peran === 'moderator' ? 'Moderator' : 'Peserta' }}</td>
              <td>
                <span v-if="p.online" class="badge badge-green">● Di dalam</span>
                <span v-else-if="p.hadir" class="muted">{{ fmtJam(p.masuk_at) }}–{{ fmtJam(p.keluar_at) }} · {{ p.menit }} mnt</span>
                <span v-else class="muted">Belum hadir</span>
              </td>
              <td v-if="detail.moderator" class="kanan">
                <template v-if="p.id_karyawan !== detail.pembuat.id_karyawan">
                  <button v-if="p.peran !== 'moderator'" type="button" class="btn btn-ghost btn-sm" @click="jadikanModerator(p)">Jadikan moderator</button>
                  <button type="button" class="btn btn-ghost btn-sm" @click="hapusPeserta(p)">Hapus</button>
                </template>
              </td>
            </tr>
            <tr v-for="(t, i) in detail.tamu" :key="'t' + i">
              <td><b>{{ t.nama.replace(/ · Tamu$/, '') }}</b></td>
              <td><span class="badge badge-amber">Tamu</span></td>
              <td>
                <span v-if="t.online" class="badge badge-green">● Di dalam</span>
                <span v-else class="muted">{{ fmtJam(t.masuk_at) }}–{{ fmtJam(t.keluar_at) }} · {{ t.menit }} mnt</span>
              </td>
              <td v-if="detail.moderator"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="undang.buka && detail" class="modal-overlay" @click.self="undang.buka = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Undang karyawan</h3>
          <button type="button" class="btn-modal-close" @click="undang.buka = false">×</button>
        </div>
        <div class="modal-body">
          <KaryawanPicker v-model="undang.pilih" :kecuali="detail.peserta.map((p) => p.id_karyawan)" />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" @click="undang.buka = false">Batal</button>
          <button type="button" class="btn btn-primary" :disabled="!undang.pilih.length || undang.simpan" @click="simpanUndangan">Undang {{ undang.pilih.length || '' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rd { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 14px; align-items: start; }
.rd-kiri { display: flex; flex-direction: column; gap: 14px; }
.rd-masuk { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.rd-masuk h4, .rd-peserta h4 { margin: 0; font-size: 14px; }
.rd-cek { display: flex; gap: 8px; align-items: center; font-size: 14px; }
.rd-agenda p { white-space: pre-wrap; margin: 4px 0 0; font-size: 13.5px; }
.rd-link { display: flex; gap: 6px; }
.rd-link .form-input { flex: 1; font-size: 12.5px; }
.rd-link-aksi { display: flex; flex-wrap: wrap; gap: 6px; }
.rd-peserta { padding: 14px; }
.rd-peserta-atas { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.muted { color: var(--text-3, #64748b); }
.kecil { font-size: 12px; }
.kanan { text-align: right; white-space: nowrap; }
@media (max-width: 900px) { .rd { grid-template-columns: 1fr; } }
</style>
