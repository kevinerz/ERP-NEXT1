<script setup lang="ts">
// Halaman teknisi di lokasi (dibuka dari link WA, tanpa login):
// 1. Check-in GPS  2. Foto sebelum & sesudah  3. Selesai + TTD PIC store — atau laporkan tidak bisa dikerjakan.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { confirmDialog } from '@/composables/useDialog'

interface Foto { id_foto: number; jenis_foto: string; file_path: string; created_at: string }
interface Info {
  nomor_wo: string; jenis_wo: string; prioritas: string; status_wo: string; tgl: string | null; jam: string | null; label_tgl: string | null
  teknisi: string | null; deskripsi: string; site: { kode: string; nama: string; kota: string | null; alamat: string | null; pelanggan: string }
  pic_nama: string | null; pic_hp: string | null; tiket: { nomor: string; judul: string } | null; maps: string | null
  checkin_at: string | null; koordinat_checkin: string | null; completed_at: string | null; ttd_path: string | null; ttd_nama: string | null
  catatan_teknisi: string | null; foto: Foto[]; bisa_lapor: boolean
}

const http = axios.create({ baseURL: '/api' })
const route = useRoute()
const token = String(route.params.token)
const info = ref<Info | null>(null)
const galat = ref('')
const pesan = ref('')
const proses = ref('')

function errMsg(e: any) {
  const m = e?.response?.data?.message
  return Array.isArray(m) ? m.join(', ') : m || e?.message || 'Terjadi kesalahan'
}
async function muat() {
  try { info.value = (await http.get(`/lapangan/${token}`)).data.data; galat.value = '' } catch (e) { galat.value = errMsg(e) }
}
async function jalankan(label: string, fn: () => Promise<any>) {
  proses.value = label; pesan.value = ''
  try { const { data } = await fn(); info.value = data.data } catch (e) { pesan.value = errMsg(e) } finally { proses.value = '' }
}
onMounted(muat)
// Pesan error bisa jauh dari tombol yang ditekan (layar HP): gulir ke pesan terdekat
watch(pesan, (v) => {
  if (!v || proses.value) return
  nextTick(() => { const el = [...document.querySelectorAll('.vl-pesan')].pop(); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }) })
})

const jam = (s: string | null) => (s ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const hpWa = (n: string) => { let x = n.replace(/\D/g, ''); if (x.startsWith('0')) x = '62' + x.slice(1); return x }
const fotoJenis = (j: string) => (info.value?.foto ?? []).filter((f) => f.jenis_foto === j)

// ── 1. Check-in ─────────────────────────────────────────────────────────────
function checkin() {
  if (!navigator.geolocation) { pesan.value = 'Browser tidak mendukung GPS'; return }
  proses.value = 'gps'; pesan.value = ''
  navigator.geolocation.getCurrentPosition(
    (p) => jalankan('gps', () => http.post(`/lapangan/${token}/checkin`, { lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy })),
    (e) => {
      proses.value = ''
      pesan.value = e.code === 1 ? 'Izin lokasi ditolak — aktifkan izin Lokasi untuk browser ini lalu coba lagi.' : 'Lokasi belum didapat — pastikan GPS aktif, lalu coba lagi.'
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  )
}

// ── 2. Foto (dikecilkan dulu di HP supaya hemat kuota) ─────────────────────
async function kecilkan(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise((ok, gagal) => { img.onload = ok; img.onerror = gagal; img.src = url })
    const skala = Math.min(1, 1600 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * skala); c.height = Math.round(img.height * skala)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise((ok) => c.toBlob((b) => ok(b || file), 'image/jpeg', 0.8))
  } catch { return file } finally { URL.revokeObjectURL(url) }
}
async function pilihFoto(e: Event, jenis: string) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files || [])]
  input.value = ''
  for (const [i, f] of files.entries()) {
    proses.value = `foto-${jenis}`; pesan.value = files.length > 1 ? `Mengunggah ${i + 1}/${files.length}…` : ''
    try {
      const fd = new FormData()
      fd.append('jenis', jenis)
      fd.append('file', await kecilkan(f), 'foto.jpg')
      info.value = (await http.post(`/lapangan/${token}/foto`, fd)).data.data
      pesan.value = ''
    } catch (err) { pesan.value = errMsg(err); break }
  }
  proses.value = ''
}
async function hapusFoto(f: Foto) {
  if (proses.value) return
  if (!(await confirmDialog({ title: 'Hapus foto?', message: 'Foto ini akan dihapus dari laporan visit.', confirmLabel: 'Hapus', variant: 'danger' }))) return
  jalankan('hapus', () => http.delete(`/lapangan/${token}/foto/${f.id_foto}`))
}
const lihat = ref<string | null>(null)

// ── 3. Selesai + TTD ────────────────────────────────────────────────────────
const tahapSelesai = ref(false)
const catatan = ref('')
const ttdNama = ref('')
const tanpaTtd = ref(false)
const alasanTanpaTtd = ref('')
const kanvas = ref<HTMLCanvasElement | null>(null)
const adaCoretan = ref(false)
let menggambar = false
function siapkanKanvas() {
  const c = kanvas.value
  if (!c) return
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
  c.width = r.width * dpr; c.height = r.height * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0f172a'
  adaCoretan.value = false
}
function titik(e: PointerEvent) { const r = kanvas.value!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const }
function mulaiGores(e: PointerEvent) {
  menggambar = true; kanvas.value!.setPointerCapture(e.pointerId)
  const g = kanvas.value!.getContext('2d')!, [x, y] = titik(e)
  g.beginPath(); g.moveTo(x, y)
}
function gores(e: PointerEvent) {
  if (!menggambar) return
  const g = kanvas.value!.getContext('2d')!, [x, y] = titik(e)
  g.lineTo(x, y); g.stroke(); adaCoretan.value = true
}
function hentiGores() { menggambar = false }
watch([tahapSelesai, tanpaTtd], () => nextTick(siapkanKanvas))
function bukaSelesai() {
  if (!fotoJenis('Sesudah').length) { pesan.value = 'Unggah minimal 1 foto SESUDAH dulu.'; return }
  pesan.value = ''; tahapSelesai.value = true
}
const bisaKirim = computed(() => catatan.value.trim().length >= 3 && (tanpaTtd.value ? alasanTanpaTtd.value.trim().length >= 3 : adaCoretan.value && ttdNama.value.trim().length >= 2))
function kirimSelesai() {
  const body: any = { catatan: catatan.value }
  if (tanpaTtd.value) body.tanpa_ttd_alasan = alasanTanpaTtd.value
  else { body.ttd = kanvas.value!.toDataURL('image/png'); body.ttd_nama = ttdNama.value }
  jalankan('selesai', () => http.post(`/lapangan/${token}/selesai`, body)).then(() => { if (!pesan.value) tahapSelesai.value = false })
}

// ── Tidak bisa dikerjakan ───────────────────────────────────────────────────
const ALASAN = ['Store tutup', 'PIC tidak ada / tidak bisa ditemui', 'Akses tidak diizinkan', 'Perangkat / material kurang', 'Butuh jadwal ulang dari pelanggan', 'Lainnya']
const tahapGagal = ref(false)
const alasan = ref('')
const catatanGagal = ref('')
function kirimGagal() {
  if (!alasan.value) { pesan.value = 'Pilih alasannya'; return }
  jalankan('gagal', () => http.post(`/lapangan/${token}/gagal`, { alasan: alasan.value, catatan: catatanGagal.value || undefined })).then(() => { if (!pesan.value) tahapGagal.value = false })
}
const gagalTerakhir = computed(() => (info.value?.catatan_teknisi || '').split('\n').reverse().find((l) => l.startsWith('[Gagal')))
</script>

<template>
  <div class="vl">
    <header class="vl-kepala">
      <b>NEXT1</b> · Lapor Visit
    </header>

    <div v-if="galat" class="vl-kartu vl-galat">
      <h3>Link tidak bisa dibuka</h3>
      <p>{{ galat }}</p>
      <p class="muted">Minta link terbaru ke helpdesk.</p>
    </div>
    <p v-else-if="!info" class="vl-muat">Memuat…</p>

    <template v-else>
      <section class="vl-kartu">
        <div class="vl-baris-atas">
          <span class="vl-chip" :class="`st-${info.status_wo}`">{{ { Open: 'Terjadwal', In_Progress: 'Di lokasi', Completed: 'Selesai', Cancelled: 'Batal' }[info.status_wo] }}</span>
          <span v-if="info.prioritas !== 'Normal'" class="vl-prio">Prioritas {{ info.prioritas }}</span>
        </div>
        <h2>{{ info.site.nama }}</h2>
        <p class="muted">{{ info.site.pelanggan }} · {{ info.site.kode }}</p>
        <p v-if="info.label_tgl" class="vl-jadwal">📅 {{ info.label_tgl }}<template v-if="info.jam"> · {{ info.jam }} WIB</template><template v-if="info.teknisi"> · {{ info.teknisi }}</template></p>
        <p v-if="info.site.alamat">📍 {{ info.site.alamat }}<template v-if="info.site.kota">, {{ info.site.kota }}</template></p>
        <div class="vl-tombol-baris">
          <a v-if="info.maps" :href="info.maps" target="_blank" rel="noopener" class="vl-btn vl-btn-ghost">🗺️ Buka Maps</a>
          <a v-if="info.pic_hp" :href="`tel:${info.pic_hp}`" class="vl-btn vl-btn-ghost">📞 Telepon PIC</a>
          <a v-if="info.pic_hp" :href="`https://wa.me/${hpWa(info.pic_hp)}`" target="_blank" rel="noopener" class="vl-btn vl-btn-ghost">💬 WA PIC</a>
        </div>
        <p v-if="info.pic_nama || info.pic_hp" class="muted">👤 PIC: {{ [info.pic_nama, info.pic_hp].filter(Boolean).join(' — ') }}</p>
        <div class="vl-tugas">
          <b>🔧 {{ info.jenis_wo }}</b><template v-if="info.tiket"> · {{ info.tiket.nomor }}</template>
          <p>{{ info.deskripsi }}</p>
        </div>
        <small class="muted">{{ info.nomor_wo }}</small>
      </section>

      <p v-if="pesan && !tahapSelesai && !tahapGagal" class="vl-pesan" role="alert">{{ pesan }}</p>

      <!-- Sudah selesai -->
      <section v-if="info.status_wo === 'Completed'" class="vl-kartu vl-ok">
        <h3>✅ Visit selesai</h3>
        <p>{{ jam(info.completed_at) }}<template v-if="info.ttd_nama"> · TTD: {{ info.ttd_nama }}</template></p>
        <img v-if="info.ttd_path" :src="info.ttd_path" alt="Tanda tangan PIC" class="vl-ttd-img" />
        <p class="muted">Terima kasih! Laporan sudah masuk ke helpdesk.</p>
      </section>

      <!-- Sedang dijadwal ulang -->
      <section v-else-if="!info.bisa_lapor" class="vl-kartu">
        <h3>⏳ Menunggu jadwal ulang</h3>
        <p v-if="gagalTerakhir">{{ gagalTerakhir }}</p>
        <p class="muted">Helpdesk akan mengirim jadwal baru.</p>
      </section>

      <template v-else>
        <!-- 1. Check-in -->
        <section class="vl-kartu">
          <h3><span class="vl-no" :class="{ ok: info.checkin_at }">1</span> Check-in di lokasi</h3>
          <p v-if="info.checkin_at" class="vl-sukses">✓ Check-in {{ jam(info.checkin_at) }}
            <a :href="`https://www.google.com/maps?q=${info.koordinat_checkin}`" target="_blank" rel="noopener">lihat titik</a>
          </p>
          <p v-else class="muted">Tekan saat sudah tiba di store. Lokasi GPS HP akan dicatat.</p>
          <button class="vl-btn" :class="info.checkin_at ? 'vl-btn-ghost' : 'vl-btn-utama'" :disabled="!!proses" @click="checkin">
            {{ proses === 'gps' ? 'Mengambil lokasi…' : info.checkin_at ? 'Perbarui lokasi' : '📍 Saya sudah tiba' }}
          </button>
        </section>

        <!-- 2. Foto -->
        <section class="vl-kartu" :class="{ redup: !info.checkin_at }">
          <h3><span class="vl-no" :class="{ ok: fotoJenis('Sesudah').length }">2</span> Foto pekerjaan</h3>
          <div v-for="j in ['Sebelum', 'Sesudah']" :key="j" class="vl-foto-blok">
            <div class="vl-foto-judul"><b>Foto {{ j.toLowerCase() }}</b> <small class="muted">{{ fotoJenis(j).length }} foto</small></div>
            <div class="vl-foto-grid">
              <div v-for="f in fotoJenis(j)" :key="f.id_foto" class="vl-foto">
                <img :src="f.file_path" alt="" @click="lihat = f.file_path" />
                <button aria-label="Hapus foto" :disabled="!!proses" @click="hapusFoto(f)">✕</button>
              </div>
              <label class="vl-foto-tambah" :class="{ mati: !info.checkin_at || !!proses }">
                <input type="file" accept="image/*" capture="environment" multiple hidden :disabled="!info.checkin_at || !!proses" @change="pilihFoto($event, j)" />
                <span>{{ proses === `foto-${j}` ? '⏳' : '📷' }}</span><small>{{ proses === `foto-${j}` ? 'Mengunggah' : 'Tambah' }}</small>
              </label>
            </div>
          </div>
          <p v-if="!info.checkin_at" class="muted">Check-in dulu untuk mengunggah foto.</p>
        </section>

        <!-- 3. Selesai -->
        <section class="vl-kartu" :class="{ redup: !info.checkin_at }">
          <h3><span class="vl-no">3</span> Selesai & tanda tangan PIC</h3>
          <button v-if="!tahapSelesai" class="vl-btn vl-btn-sukses" :disabled="!info.checkin_at || !!proses" @click="bukaSelesai">✓ Pekerjaan selesai</button>
          <template v-else>
            <label class="vl-label">Hasil pekerjaan *</label>
            <textarea v-model="catatan" rows="3" placeholder="mis. Ganti adaptor ONT, koneksi normal kembali, sudah dicek bersama PIC" />
            <template v-if="!tanpaTtd">
              <label class="vl-label">Nama PIC yang tanda tangan *</label>
              <input v-model="ttdNama" :placeholder="info.pic_nama && !/prtg/i.test(info.pic_nama) ? `mis. ${info.pic_nama}` : 'Nama PIC store'" />
              <label class="vl-label">Tanda tangan PIC * <button type="button" class="vl-link" @click="siapkanKanvas">Ulangi</button></label>
              <canvas
                ref="kanvas" class="vl-kanvas"
                @pointerdown.prevent="mulaiGores" @pointermove.prevent="gores" @pointerup="hentiGores" @pointercancel="hentiGores" @pointerleave="hentiGores"
              />
            </template>
            <label class="vl-cek"><input v-model="tanpaTtd" type="checkbox" /> PIC tidak bisa tanda tangan</label>
            <template v-if="tanpaTtd">
              <label class="vl-label">Alasan *</label>
              <input v-model="alasanTanpaTtd" placeholder="mis. PIC sedang tidak di tempat, sudah konfirmasi via telepon" />
            </template>
            <p v-if="pesan" class="vl-pesan" role="alert">{{ pesan }}</p>
            <div class="vl-tombol-baris">
              <button class="vl-btn vl-btn-ghost" :disabled="!!proses" @click="tahapSelesai = false">Batal</button>
              <button class="vl-btn vl-btn-sukses" :disabled="!bisaKirim || !!proses" @click="kirimSelesai">{{ proses === 'selesai' ? 'Mengirim…' : 'Kirim laporan selesai' }}</button>
            </div>
          </template>
        </section>

        <!-- Tidak bisa dikerjakan -->
        <section class="vl-kartu vl-gagal">
          <button v-if="!tahapGagal" class="vl-link" @click="tahapGagal = true">⚠️ Tidak bisa dikerjakan / perlu jadwal ulang</button>
          <template v-else>
            <h3>Tidak bisa dikerjakan</h3>
            <label v-for="a in ALASAN" :key="a" class="vl-cek"><input v-model="alasan" type="radio" :value="a" /> {{ a }}</label>
            <textarea v-model="catatanGagal" rows="2" placeholder="Keterangan tambahan (opsional)" />
            <p v-if="pesan && !tahapSelesai" class="vl-pesan" role="alert">{{ pesan }}</p>
            <div class="vl-tombol-baris">
              <button class="vl-btn vl-btn-ghost" :disabled="!!proses" @click="tahapGagal = false">Batal</button>
              <button class="vl-btn vl-btn-bahaya" :disabled="!alasan || !!proses" @click="kirimGagal">{{ proses === 'gagal' ? 'Mengirim…' : 'Laporkan' }}</button>
            </div>
            <small class="muted">Visit akan kembali ke antrean helpdesk untuk dijadwal ulang.</small>
          </template>
        </section>
      </template>
    </template>

    <div v-baris v-if="lihat" class="vl-lihat" @click="lihat = null"><img :src="lihat" alt="" /></div>
  </div>
</template>

<style scoped>
.vl { max-width: 560px; margin: 0 auto; padding: 0 12px 40px; background: #f1f5f9; min-height: 100vh; font-size: 15px; color: #0f172a; }
.vl-kepala { position: sticky; top: 0; z-index: 5; background: #0f766e; color: #fff; margin: 0 -12px 12px; padding: 12px 16px; font-size: 15px; }
.vl-muat { text-align: center; padding: 40px 0; }
.vl-kartu { background: #fff; border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(15, 23, 42, .08); }
.vl-kartu h2 { margin: 6px 0 2px; font-size: 19px; }
.vl-kartu h3 { margin: 0 0 8px; font-size: 16px; display: flex; align-items: center; gap: 8px; }
.vl-kartu p { margin: 4px 0; }
.vl-kartu.redup { opacity: .55; }
.muted { color: #64748b; font-size: 13px; }
.vl-baris-atas { display: flex; gap: 8px; align-items: center; }
.vl-chip { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 99px; background: #e0f2fe; color: #075985; }
.vl-chip.st-In_Progress { background: #fef3c7; color: #92400e; }
.vl-chip.st-Completed { background: #dcfce7; color: #166534; }
.vl-prio { font-size: 12px; font-weight: 700; color: #c2410c; }
.vl-jadwal { font-weight: 600; }
.vl-tugas { background: #f8fafc; border-radius: 10px; padding: 10px 12px; margin: 10px 0 6px; }
.vl-tugas p { white-space: pre-wrap; }
.vl-tombol-baris { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 4px; }
.vl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 10px; padding: 12px 16px; font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none; flex: 1; min-height: 46px; font-family: inherit; }
.vl-btn:disabled { opacity: .5; cursor: not-allowed; }
.vl-btn-utama { background: #0f766e; color: #fff; width: 100%; }
.vl-btn-sukses { background: #16a34a; color: #fff; width: 100%; }
.vl-btn-bahaya { background: #dc2626; color: #fff; }
.vl-btn-ghost { background: #f1f5f9; color: #0f172a; border: 1px solid #e2e8f0; }
.vl-no { width: 24px; height: 24px; border-radius: 50%; background: #e2e8f0; color: #334155; font-size: 13px; display: grid; place-items: center; flex: none; }
.vl-no.ok { background: #16a34a; color: #fff; }
.vl-sukses { color: #15803d; font-weight: 600; }
.vl-sukses a { font-weight: 400; margin-left: 6px; }
.vl-pesan { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 10px 12px; margin: 0 0 12px; font-size: 14px; }
.vl-foto-blok { margin-bottom: 12px; }
.vl-foto-judul { margin-bottom: 6px; }
.vl-foto-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
.vl-foto { position: relative; aspect-ratio: 1; }
.vl-foto img { width: 100%; height: 100%; object-fit: cover; border-radius: 10px; }
.vl-foto button { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; border-radius: 50%; border: 0; background: rgba(15, 23, 42, .7); color: #fff; font-size: 12px; cursor: pointer; }
.vl-foto button:disabled { opacity: .4; cursor: not-allowed; }
.vl-foto-tambah { aspect-ratio: 1; border: 2px dashed #94a3b8; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: #475569; }
.vl-foto-tambah span { font-size: 26px; }
.vl-foto-tambah.mati { opacity: .4; cursor: not-allowed; }
.vl-label { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #334155; margin: 10px 0 4px; }
.vl input:not([type=checkbox]):not([type=radio]):not([type=file]), .vl textarea { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font-size: 15px; font-family: inherit; }
.vl-kanvas { width: 100%; height: 180px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; touch-action: none; display: block; }
.vl-cek { display: flex; gap: 8px; align-items: center; margin: 8px 0; font-size: 14px; }
.vl-link { background: none; border: 0; color: #0f766e; font-weight: 600; cursor: pointer; padding: 0; font-size: 14px; font-family: inherit; }
.vl-gagal .vl-link { color: #b45309; }
.vl-ok h3 { color: #15803d; }
.vl-ttd-img { max-width: 100%; max-height: 140px; border: 1px solid #e2e8f0; border-radius: 10px; margin: 6px 0; }
.vl-galat h3 { color: #b91c1c; margin-top: 0; }
.vl-lihat { position: fixed; inset: 0; background: rgba(0, 0, 0, .85); display: grid; place-items: center; z-index: 50; }
.vl-lihat img { max-width: 100%; max-height: 100%; }
</style>
