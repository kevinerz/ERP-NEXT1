<script setup lang="ts">
// Jadwal Visit teknis: antrean (belum dijadwalkan / terlewat) di kiri, papan mingguan teknisi × hari di kanan.
// Kartu di-drag ke kotak teknisi+hari untuk menugaskan, atau diklik untuk atur detail & kirim WA.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDateTime } from '@/composables/useFormat'
import { alertDialog, alertError, promptDialog } from '@/composables/useDialog'

interface Visit {
  id_wo: number; nomor_wo: string; jenis_wo: string; prioritas: string; status_wo: string
  tgl: string | null; jam: string | null; urutan: number; id_teknisi: number | null; teknisi: string | null
  deskripsi: string; catatan_teknisi: string | null; id_pb: number | null; tipe_eksekutor: string
  wa_teknisi_at: string | null; wa_pic_at: string | null; created_at: string; completed_at: string | null
  site: { id_site: number; kode: string; nama: string; kota: string | null; alamat: string | null; pelanggan: string }
  pic_nama: string | null; pic_hp: string | null
  tiket: { id: number; nomor: string; judul: string } | null
  checkin_at: string | null; koordinat_checkin: string | null; ttd_path: string | null; ttd_nama: string | null
  gagal_count: number; gagal_terakhir: string | null; link: string | null
  foto?: { id_foto: number; jenis_foto: string; file_path: string; created_at: string }[]
  terlewat?: boolean
}
interface Teknisi { id_karyawan: number; nama_lengkap: string; jabatan: string | null; departemen: string | null; no_hp: string | null }
interface Papan { mulai: string; hari_ini: string; hari: { tgl: string; label: string }[]; teknisi: Teknisi[]; visit: Visit[]; antrean: Visit[] }

const JENIS = ['Perbaikan', 'Instalasi', 'Maintenance', 'Survey', 'Relokasi', 'Upgrade', 'Tarik Perangkat', 'Lainnya']
const PRIORITAS = ['Darurat', 'Tinggi', 'Normal', 'Rendah']
const WARNA_PRIORITAS: Record<string, string> = { Darurat: '#dc2626', Tinggi: '#f97316', Normal: '#3b82f6', Rendah: '#94a3b8' }
const LABEL_STATUS: Record<string, string> = { Open: 'Terjadwal', In_Progress: 'Dikerjakan', Completed: 'Selesai', Cancelled: 'Batal' }

const route = useRoute()
const router = useRouter()
const papan = ref<Papan | null>(null)
const memuat = ref(false)
const cari = ref('')

async function muat(mulai = papan.value?.mulai) {
  memuat.value = true
  try {
    const { data } = await api.get('/visit/papan', { params: mulai ? { mulai } : {} })
    papan.value = data.data
  } catch (e) { alertError(e, 'Gagal memuat jadwal') } finally { memuat.value = false }
}
function geser(hari: number) {
  if (!papan.value) return
  const d = new Date(`${papan.value.mulai}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + hari)
  muat(d.toISOString().slice(0, 10))
}
const judulMinggu = computed(() => {
  const h = papan.value?.hari
  if (!h?.length) return ''
  return `${h[0]!.label.split(', ')[1]} – ${h[6]!.label.split(', ')[1]}`
})

const antreanTampil = computed(() => {
  const q = cari.value.trim().toLowerCase()
  const a = papan.value?.antrean ?? []
  if (!q) return a
  return a.filter((v) => [v.site.nama, v.site.kode, v.site.pelanggan, v.site.kota, v.deskripsi, v.nomor_wo, v.jenis_wo].some((x) => x?.toLowerCase().includes(q)))
})
function visitDi(id_teknisi: number, tgl: string) {
  return (papan.value?.visit ?? [])
    .filter((v) => v.id_teknisi === id_teknisi && v.tgl === tgl)
    .sort((a, b) => (a.jam || '99').localeCompare(b.jam || '99') || a.urutan - b.urutan || a.id_wo - b.id_wo)
}
function jumlahMinggu(id: number) { return (papan.value?.visit ?? []).filter((v) => v.id_teknisi === id).length }
function jumlahHari(tgl: string) { return (papan.value?.visit ?? []).filter((v) => v.tgl === tgl && v.status_wo !== 'Cancelled').length }
function belumWaHari(tgl: string) { return (papan.value?.visit ?? []).filter((v) => v.tgl === tgl && ['Open', 'In_Progress'].includes(v.status_wo) && !v.wa_teknisi_at).length }

// ── Drag & drop ─────────────────────────────────────────────────────────────
const diseret = ref<Visit | null>(null)
const sasaran = ref('')
function mulaiSeret(e: DragEvent, v: Visit) {
  if (!['Open', 'In_Progress'].includes(v.status_wo)) { e.preventDefault(); return }
  diseret.value = v
  e.dataTransfer?.setData('text/plain', String(v.id_wo))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function selesaiSeret() { diseret.value = null; sasaran.value = '' }
async function jatuhkan(id_teknisi: number | null, tgl: string | null) {
  const v = diseret.value
  selesaiSeret()
  if (!v || (v.id_teknisi === id_teknisi && v.tgl === tgl)) return
  // Optimistis: pindahkan dulu di layar, lalu simpan
  if (papan.value) {
    papan.value.antrean = papan.value.antrean.filter((x) => x.id_wo !== v.id_wo)
    papan.value.visit = papan.value.visit.filter((x) => x.id_wo !== v.id_wo)
    const baru = { ...v, id_teknisi, tgl, terlewat: false, wa_teknisi_at: null, wa_pic_at: null }
    if (id_teknisi && tgl) papan.value.visit.push(baru)
    else papan.value.antrean.unshift(baru)
  }
  try {
    await api.patch(`/visit/${v.id_wo}/jadwal`, { tgl, id_teknisi })
  } catch (e) { alertError(e) }
  muat()
}

// ── Detail visit ────────────────────────────────────────────────────────────
const sel = ref<Visit | null>(null)
const fJadwal = ref({ tgl: '', jam: '', id_teknisi: 0 })
const fInfo = ref({ jenis_wo: '', prioritas: '', deskripsi_tugas: '' })
const proses = ref(false)
function buka(v: Visit) {
  if (!v.foto) { bukaId(v.id_wo); }
  sel.value = v
  fJadwal.value = { tgl: v.tgl || '', jam: v.jam || '', id_teknisi: v.id_teknisi || 0 }
  fInfo.value = { jenis_wo: v.jenis_wo, prioritas: v.prioritas, deskripsi_tugas: v.deskripsi }
}
async function bukaId(id: number) {
  try {
    const { data } = await api.get(`/visit/${id}`)
    if (!sel.value || sel.value.id_wo === id) buka(data.data)
  } catch (e) { alertError(e) }
}
const lihatFoto = ref<string | null>(null)
const tersalin = ref(false)
async function salinLink() {
  if (!sel.value?.link) return
  try { await navigator.clipboard.writeText(sel.value.link); tersalin.value = true; setTimeout(() => (tersalin.value = false), 1500) } catch { window.prompt('Salin link:', sel.value.link) }
}
const aktif = computed(() => !!sel.value && ['Open', 'In_Progress'].includes(sel.value.status_wo))
const jadwalBerubah = computed(() => !!sel.value && (fJadwal.value.tgl !== (sel.value.tgl || '') || fJadwal.value.jam !== (sel.value.jam || '') || fJadwal.value.id_teknisi !== (sel.value.id_teknisi || 0)))
const infoBerubah = computed(() => !!sel.value && (fInfo.value.jenis_wo !== sel.value.jenis_wo || fInfo.value.prioritas !== sel.value.prioritas || fInfo.value.deskripsi_tugas !== sel.value.deskripsi))
async function aksi(fn: () => Promise<any>) {
  proses.value = true
  try {
    const { data } = await fn()
    if (data?.data) buka(data.data)
    await muat()
  } catch (e) { alertError(e) } finally { proses.value = false }
}
function simpanJadwal() {
  const f = fJadwal.value
  if ((f.tgl && !f.id_teknisi) || (!f.tgl && f.id_teknisi)) { alertDialog({ title: 'Lengkapi jadwal', message: 'Isi tanggal dan teknisi sekaligus (atau kosongkan keduanya untuk kembali ke antrean).' }); return }
  aksi(() => api.patch(`/visit/${sel.value!.id_wo}/jadwal`, { tgl: f.tgl || null, jam: f.jam || null, id_teknisi: f.id_teknisi || null }))
}
function simpanInfo() { aksi(() => api.patch(`/visit/${sel.value!.id_wo}`, fInfo.value)) }
function keAntrean() { aksi(() => api.patch(`/visit/${sel.value!.id_wo}/jadwal`, { tgl: null, jam: null, id_teknisi: null })) }
async function ubahStatus(status: string) {
  let catatan: string | null | undefined
  if (status === 'Cancelled') {
    catatan = await promptDialog({ title: 'Batalkan visit', label: 'Alasan', variant: 'danger', confirmLabel: 'Batalkan', validate: (v) => (v.trim() ? null : 'Alasan wajib diisi') })
    if (!catatan) return
  } else if (status === 'Completed') {
    catatan = await promptDialog({ title: 'Visit selesai', label: 'Catatan hasil (opsional)', confirmLabel: 'Tandai selesai' })
    if (catatan === null) return
  }
  aksi(() => api.post(`/visit/${sel.value!.id_wo}/status`, { status, catatan: catatan || undefined }))
}

// ── Kirim WA per visit ──────────────────────────────────────────────────────
const waForm = ref<{ ke: 'teknisi' | 'pic'; nama: string | null; nomor: string; teks: string } | null>(null)
async function siapkanWa(ke: 'teknisi' | 'pic') {
  if (jadwalBerubah.value) { alertDialog({ title: 'Simpan jadwal dulu', message: 'Ada perubahan jadwal yang belum disimpan.' }); return }
  try {
    const { data } = await api.get(`/visit/${sel.value!.id_wo}/wa`, { params: { ke } })
    waForm.value = { ke, nama: data.data.nama, nomor: data.data.nomor || '', teks: data.data.teks }
  } catch (e) { alertError(e) }
}
async function kirimWa() {
  const f = waForm.value!
  proses.value = true
  try {
    const { data } = await api.post(`/visit/${sel.value!.id_wo}/wa`, { ke: f.ke, nomor: f.nomor, teks: f.teks })
    waForm.value = null
    buka(data.data)
    muat()
  } catch (e) { alertError(e) } finally { proses.value = false }
}

// ── Kirim jadwal harian ke semua teknisi ────────────────────────────────────
const harian = ref<{ tgl: string; label: string; daftar: any[]; pilih: number[] } | null>(null)
const hasilHarian = ref<{ nama: string; ok: boolean; error?: string }[] | null>(null)
async function bukaHarian(h: { tgl: string; label: string }) {
  try {
    const { data } = await api.get('/visit/wa-harian', { params: { tgl: h.tgl } })
    if (!data.data.length) { alertDialog({ title: 'Tidak ada jadwal', message: `Belum ada visit aktif pada ${h.label}.` }); return }
    hasilHarian.value = null
    harian.value = { ...h, daftar: data.data, pilih: data.data.filter((r: any) => r.nomor).map((r: any) => r.id_teknisi) }
  } catch (e) { alertError(e) }
}
const lihatTeks = ref<number | null>(null)
async function kirimHarian() {
  const h = harian.value!
  proses.value = true
  try {
    const { data } = await api.post('/visit/wa-harian', { tgl: h.tgl, id_teknisi: h.pilih })
    hasilHarian.value = data.data
    muat()
  } catch (e) { alertError(e) } finally { proses.value = false }
}

// ── Visit baru ──────────────────────────────────────────────────────────────
const baru = ref<{ q: string; hasil: any[]; site: any | null; jenis_wo: string; prioritas: string; deskripsi_tugas: string; tgl: string; jam: string; id_teknisi: number } | null>(null)
function bukaBaru() {
  baru.value = { q: '', hasil: [], site: null, jenis_wo: 'Perbaikan', prioritas: 'Normal', deskripsi_tugas: '', tgl: '', jam: '', id_teknisi: 0 }
}
let timerCari: ReturnType<typeof setTimeout> | undefined
watch(() => baru.value?.q, (q) => {
  clearTimeout(timerCari)
  if (!baru.value || !q || q.trim().length < 2) { if (baru.value) baru.value.hasil = []; return }
  timerCari = setTimeout(async () => {
    try { const { data } = await api.get('/visit/site', { params: { q } }); if (baru.value) baru.value.hasil = data.data } catch { /* abaikan */ }
  }, 300)
})
async function simpanBaru() {
  const b = baru.value!
  if (!b.site) { alertDialog({ title: 'Pilih site', message: 'Cari dan pilih store/site yang akan dikunjungi.' }); return }
  if (b.deskripsi_tugas.trim().length < 3) { alertDialog({ title: 'Isi keperluan', message: 'Tulis keperluan / keluhan visit.' }); return }
  if (!!b.tgl !== !!b.id_teknisi) { alertDialog({ title: 'Lengkapi jadwal', message: 'Isi tanggal dan teknisi sekaligus, atau kosongkan keduanya untuk masuk antrean.' }); return }
  proses.value = true
  try {
    await api.post('/visit', {
      id_site: b.site.id_site, jenis_wo: b.jenis_wo, prioritas: b.prioritas, deskripsi_tugas: b.deskripsi_tugas,
      tgl: b.tgl || undefined, jam: b.jam || undefined, id_teknisi: b.id_teknisi || undefined,
    })
    baru.value = null
    muat()
  } catch (e) { alertError(e) } finally { proses.value = false }
}

// ── Penyegaran otomatis ─────────────────────────────────────────────────────
let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  await muat()
  const wo = Number(route.query.wo)
  if (wo) { bukaId(wo); router.replace({ query: {} }) }
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && !sel.value && !baru.value && !harian.value && !diseret.value) muat()
  }, 60_000)
})
onBeforeUnmount(() => clearInterval(timer))

function waktuLalu(s: string | null) { return s ? fmtDateTime(s) : '' }
function inisial(n: string) { return n.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() }
</script>

<template>
  <div class="page jv">
    <div class="page-header">
      <div>
        <h2 class="page-title">🗓️ Jadwal Visit</h2>
        <p class="page-subtitle">Seret kartu dari antrean ke kotak teknisi & hari untuk menugaskan · klik kartu untuk detail & kirim WA</p>
      </div>
      <div class="jv-tombol">
        <button class="btn btn-ghost" :disabled="memuat" aria-label="Minggu sebelumnya" title="Minggu sebelumnya" @click="geser(-7)">‹</button>
        <button class="btn btn-ghost" :disabled="memuat" @click="muat('')">Minggu ini</button>
        <span class="jv-minggu">{{ judulMinggu }}</span>
        <button class="btn btn-ghost" :disabled="memuat" aria-label="Minggu berikutnya" title="Minggu berikutnya" @click="geser(7)">›</button>
        <button class="btn btn-ghost" title="Statistik & peta" aria-label="Statistik & peta" @click="router.push('/jadwal-visit/statistik')">📊</button>
        <button class="btn btn-ghost" title="Maintenance rutin" aria-label="Maintenance rutin" @click="router.push('/jadwal-visit/maintenance')">🔁</button>
        <button class="btn btn-primary" @click="bukaBaru">+ Visit baru</button>
      </div>
    </div>

    <p v-if="!papan" class="muted">Memuat…</p>
    <div v-else class="jv-isi">
      <!-- Antrean -->
      <aside
        class="jv-antrean card" :class="{ sasaran: sasaran === 'antrean' }"
        @dragover.prevent="sasaran = 'antrean'" @dragleave="sasaran = ''" @drop.prevent="jatuhkan(null, null)"
      >
        <div class="jv-antrean-kepala">
          <b>Antrean</b> <span class="badge badge-gray">{{ papan.antrean.length }}</span>
        </div>
        <input v-model="cari" class="form-input jv-cari" placeholder="Cari store, pelanggan, kota…" />
        <p v-if="!antreanTampil.length" class="muted jv-kosong">{{ papan.antrean.length ? 'Tidak ada yang cocok.' : 'Antrean kosong 🎉' }}</p>
        <div class="jv-antrean-daftar">
          <div v-baris
            v-for="v in antreanTampil" :key="v.id_wo" class="jv-kartu" :class="{ terlewat: v.terlewat }"
            :style="{ borderLeftColor: WARNA_PRIORITAS[v.prioritas] }" draggable="true"
            @dragstart="mulaiSeret($event, v)" @dragend="selesaiSeret" @click="buka(v)"
          >
            <div class="jv-kartu-atas">
              <b>{{ v.site.nama }}</b>
              <span v-if="v.prioritas !== 'Normal'" class="jv-prio" :style="{ color: WARNA_PRIORITAS[v.prioritas] }">{{ v.prioritas }}</span>
            </div>
            <small>{{ v.site.pelanggan }}<template v-if="v.site.kota"> · {{ v.site.kota }}</template></small>
            <small class="jv-jenis">{{ v.jenis_wo }}<template v-if="v.tiket"> · {{ v.tiket.nomor }}</template></small>
            <small v-if="v.terlewat" class="jv-telat">⚠ Terlewat: {{ v.tgl }} · {{ v.teknisi }}</small>
            <small v-if="v.gagal_terakhir && !v.tgl" class="jv-telat" :title="v.gagal_terakhir">↻ {{ v.gagal_terakhir.replace(/^\[Gagal ([^\]]+)\]/, 'Gagal $1:') }}</small>
          </div>
        </div>
      </aside>

      <!-- Papan mingguan -->
      <div class="jv-papan card">
        <div class="jv-grid" :style="{ gridTemplateColumns: `150px repeat(7, minmax(130px, 1fr))` }">
          <div class="jv-sel jv-pojok">Teknisi</div>
          <div v-for="h in papan.hari" :key="h.tgl" class="jv-sel jv-hari" :class="{ hariini: h.tgl === papan.hari_ini }">
            <div>
              <b>{{ h.label.split(', ')[0] }}</b>
              <small>{{ h.label.split(', ')[1] }}</small>
            </div>
            <button
              v-if="jumlahHari(h.tgl)" class="jv-wa-hari" :class="{ belum: belumWaHari(h.tgl) }"
              :title="belumWaHari(h.tgl) ? `${belumWaHari(h.tgl)} visit belum dikirim ke teknisi` : 'Semua sudah dikirim — kirim ulang'"
              @click="bukaHarian(h)"
            >📨 {{ belumWaHari(h.tgl) || '✓' }}</button>
          </div>

          <template v-for="t in papan.teknisi" :key="t.id_karyawan">
            <div class="jv-sel jv-teknisi">
              <span class="jv-avatar">{{ inisial(t.nama_lengkap) }}</span>
              <div>
                <b>{{ t.nama_lengkap }}</b>
                <small>{{ jumlahMinggu(t.id_karyawan) }} visit<template v-if="!t.no_hp"> · <span class="jv-telat">tanpa no. HP</span></template></small>
              </div>
            </div>
            <div
              v-for="h in papan.hari" :key="h.tgl" class="jv-sel jv-kotak"
              :class="{ hariini: h.tgl === papan.hari_ini, sasaran: sasaran === `${t.id_karyawan}|${h.tgl}`, lampau: h.tgl < papan.hari_ini }"
              @dragover.prevent="sasaran = `${t.id_karyawan}|${h.tgl}`" @dragleave="sasaran = ''" @drop.prevent="jatuhkan(t.id_karyawan, h.tgl)"
            >
              <div v-baris
                v-for="v in visitDi(t.id_karyawan, h.tgl)" :key="v.id_wo" class="jv-kartu kecil" :class="`st-${v.status_wo}`"
                :style="{ borderLeftColor: WARNA_PRIORITAS[v.prioritas] }" :draggable="['Open', 'In_Progress'].includes(v.status_wo)"
                @dragstart="mulaiSeret($event, v)" @dragend="selesaiSeret" @click="buka(v)"
              >
                <div class="jv-kartu-atas">
                  <b><template v-if="v.jam">{{ v.jam }} · </template>{{ v.site.nama }}</b>
                </div>
                <small>{{ v.jenis_wo }}<template v-if="v.site.kota"> · {{ v.site.kota }}</template></small>
                <div class="jv-tanda">
                  <span v-if="v.status_wo === 'Completed'" title="Selesai">✅</span>
                  <span v-else-if="v.checkin_at" :title="`Teknisi check-in ${waktuLalu(v.checkin_at)}`">📍</span>
                  <span v-else-if="v.status_wo === 'In_Progress'" title="Sedang dikerjakan">🔧</span>
                  <span :class="{ redup: !v.wa_teknisi_at }" :title="v.wa_teknisi_at ? 'Teknisi sudah dikirimi WA' : 'Belum dikirim ke teknisi'">📲</span>
                  <span :class="{ redup: !v.wa_pic_at }" :title="v.wa_pic_at ? 'PIC store sudah diberi tahu' : 'PIC store belum diberi tahu'">🏪</span>
                </div>
              </div>
            </div>
          </template>
        </div>
        <p v-if="!papan.teknisi.length" class="muted jv-kosong">Belum ada karyawan aktif di departemen Teknisi/NOC.</p>
      </div>
    </div>

    <!-- Detail visit -->
    <div v-if="sel" class="modal-overlay" @click.self="sel = null">
      <div class="modal modal-lg" v-focus-trap>
        <div class="modal-header">
          <span class="modal-title">{{ sel.site.nama }} <small class="muted">{{ sel.nomor_wo }}</small></span>
          <button type="button" class="btn-modal-close" aria-label="Tutup" @click="sel = null">✕</button>
        </div>
        <div class="modal-body jv-detail">
          <div class="jv-info">
            <div><span>Store</span><b>{{ sel.site.nama }} ({{ sel.site.kode }})</b></div>
            <div><span>Pelanggan</span><b>{{ sel.site.pelanggan }}</b></div>
            <div v-if="sel.site.alamat"><span>Alamat</span><b>{{ sel.site.alamat }}<template v-if="sel.site.kota">, {{ sel.site.kota }}</template></b></div>
            <div><span>PIC store</span><b>{{ [sel.pic_nama, sel.pic_hp].filter(Boolean).join(' — ') || '— belum ada —' }}</b></div>
            <div v-if="sel.tiket"><span>Tiket</span><b><router-link :to="`/operations/${sel.tiket.id}`">{{ sel.tiket.nomor }}</router-link> · {{ sel.tiket.judul }}</b></div>
            <div v-if="sel.id_pb"><span>Pasang baru</span><b><router-link :to="`/pasang-baru/order/${sel.id_pb}`">Lihat order</router-link></b></div>
            <div><span>Status</span><b>{{ LABEL_STATUS[sel.status_wo] || sel.status_wo }}<template v-if="!sel.tgl && sel.status_wo === 'Open'"> (antrean)</template></b></div>
            <div v-if="sel.catatan_teknisi"><span>Catatan</span><b class="pre">{{ sel.catatan_teknisi }}</b></div>
          </div>

          <div v-if="sel.checkin_at || sel.foto?.length || sel.ttd_path" class="jv-blok jv-laporan">
            <b class="jv-legend">Laporan lapangan</b>
            <div v-if="sel.checkin_at" class="jv-ok">📍 Check-in {{ waktuLalu(sel.checkin_at) }}
              <a v-if="sel.koordinat_checkin" :href="`https://www.google.com/maps?q=${sel.koordinat_checkin}`" target="_blank" rel="noopener">lihat titik</a>
            </div>
            <template v-for="j in ['Sebelum', 'Sesudah', 'Lainnya']" :key="j">
              <div v-if="sel.foto?.some((f) => f.jenis_foto === j)">
                <small class="muted">Foto {{ j.toLowerCase() }}</small>
                <div class="jv-foto-grid">
                  <img v-for="f in sel.foto!.filter((f) => f.jenis_foto === j)" :key="f.id_foto" :src="f.file_path" alt="" @click="lihatFoto = f.file_path" />
                </div>
              </div>
            </template>
            <div v-if="sel.ttd_path">
              <small class="muted">Tanda tangan PIC — {{ sel.ttd_nama }}</small>
              <img :src="sel.ttd_path" alt="TTD PIC" class="jv-ttd" />
            </div>
          </div>

          <fieldset class="jv-blok" :disabled="!aktif || proses">
            <legend>Jadwal & teknisi</legend>
            <div class="form-row jv-row3">
              <div class="form-group"><label class="form-label">Tanggal</label><input v-model="fJadwal.tgl" type="date" class="form-input" /></div>
              <div class="form-group"><label class="form-label">Jam (opsional)</label><input v-model="fJadwal.jam" type="time" class="form-input" /></div>
              <div class="form-group">
                <label class="form-label">Teknisi</label>
                <select v-model="fJadwal.id_teknisi" class="form-select">
                  <option :value="0">— pilih —</option>
                  <option v-for="t in papan?.teknisi" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
                </select>
              </div>
            </div>
            <div class="jv-baris-tombol">
              <button class="btn btn-primary btn-sm" :disabled="!jadwalBerubah" @click="simpanJadwal">Simpan jadwal</button>
              <button v-if="sel.tgl" class="btn btn-ghost btn-sm" @click="keAntrean">↩ Kembalikan ke antrean</button>
            </div>
          </fieldset>

          <fieldset v-if="sel.tgl && sel.id_teknisi" class="jv-blok" :disabled="!aktif || proses">
            <legend>Kirim WhatsApp</legend>
            <div class="jv-baris-tombol">
              <button class="btn btn-ghost btn-sm" @click="siapkanWa('teknisi')">📲 Ke teknisi</button>
              <small :class="sel.wa_teknisi_at ? 'jv-ok' : 'muted'">{{ sel.wa_teknisi_at ? `✓ terkirim ${waktuLalu(sel.wa_teknisi_at)}` : 'belum dikirim' }}</small>
            </div>
            <div v-if="sel.link" class="jv-baris-tombol">
              <button class="btn btn-ghost btn-sm" @click="salinLink">🔗 {{ tersalin ? 'Tersalin!' : 'Salin link lapor teknisi' }}</button>
              <a :href="sel.link" target="_blank" rel="noopener" class="muted" style="font-size: 12px">buka</a>
            </div>
            <div class="jv-baris-tombol">
              <button class="btn btn-ghost btn-sm" @click="siapkanWa('pic')">🏪 Ke PIC store</button>
              <small :class="sel.wa_pic_at ? 'jv-ok' : 'muted'">{{ sel.wa_pic_at ? `✓ terkirim ${waktuLalu(sel.wa_pic_at)}` : 'belum dikirim' }}</small>
            </div>
          </fieldset>

          <fieldset class="jv-blok" :disabled="!aktif || proses">
            <legend>Keperluan</legend>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Jenis</label>
                <select v-model="fInfo.jenis_wo" class="form-select">
                  <option v-for="j in [...new Set([...JENIS, fInfo.jenis_wo])]" :key="j" :value="j">{{ j }}</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Prioritas</label>
                <select v-model="fInfo.prioritas" class="form-select"><option v-for="p in PRIORITAS" :key="p" :value="p">{{ p }}</option></select>
              </div>
            </div>
            <div class="form-group"><label class="form-label">Keluhan / tugas</label><textarea v-model="fInfo.deskripsi_tugas" class="form-textarea" rows="3" /></div>
            <div class="jv-baris-tombol"><button class="btn btn-primary btn-sm" :disabled="!infoBerubah" @click="simpanInfo">Simpan</button></div>
          </fieldset>
        </div>
        <div class="modal-footer jv-footer">
          <router-link :to="`/public-wo/${sel.id_wo}`" class="btn btn-ghost btn-sm">Buka Work Order →</router-link>
          <span class="jv-spasi" />
          <template v-if="aktif">
            <button class="btn btn-ghost btn-sm" :disabled="proses" @click="ubahStatus('Cancelled')">Batalkan</button>
            <button v-if="sel.status_wo === 'Open' && sel.tgl" class="btn btn-ghost btn-sm" :disabled="proses" @click="ubahStatus('In_Progress')">🔧 Mulai dikerjakan</button>
            <button v-if="sel.tgl" class="btn btn-success btn-sm" :disabled="proses" @click="ubahStatus('Completed')">✓ Selesai</button>
          </template>
          <button v-else class="btn btn-ghost btn-sm" :disabled="proses" @click="ubahStatus('Open')">Buka kembali</button>
        </div>
      </div>
    </div>

    <!-- Pratinjau WA per visit -->
    <div v-if="waForm" class="modal-overlay" style="z-index: 2100" @click.self="waForm = null">
      <div class="modal" v-focus-trap>
        <div class="modal-header">
          <span class="modal-title">WhatsApp ke {{ waForm.ke === 'pic' ? 'PIC store' : 'teknisi' }}<template v-if="waForm.nama"> — {{ waForm.nama }}</template></span>
          <button type="button" class="btn-modal-close" aria-label="Tutup" @click="waForm = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group"><label class="form-label">Nomor WhatsApp</label><input v-model="waForm.nomor" class="form-input" placeholder="08…" /></div>
          <div class="form-group" style="margin-top: 12px">
            <label class="form-label">Pesan (bisa diedit)</label>
            <textarea v-model="waForm.teks" class="form-textarea" rows="12" />
            <span class="form-hint">Dikirim dari WhatsApp Helpdesk, diawali tanda tangan nama Anda.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="waForm = null">Batal</button>
          <button class="btn btn-success" :disabled="proses || waForm.nomor.length < 8 || !waForm.teks.trim()" @click="kirimWa">Kirim WA</button>
        </div>
      </div>
    </div>

    <!-- Kirim jadwal harian -->
    <div v-if="harian" class="modal-overlay" @click.self="harian = null">
      <div class="modal modal-lg" v-focus-trap>
        <div class="modal-header">
          <span class="modal-title">📨 Kirim jadwal {{ harian.label }} ke teknisi</span>
          <button type="button" class="btn-modal-close" aria-label="Tutup" @click="harian = null">✕</button>
        </div>
        <div class="modal-body">
          <template v-if="!hasilHarian">
            <p class="muted" style="margin-top: 0">Tiap teknisi menerima satu pesan berisi semua lokasinya hari itu.</p>
            <div v-for="r in harian.daftar" :key="r.id_teknisi" class="jv-harian">
              <label>
                <input v-model="harian.pilih" type="checkbox" :value="r.id_teknisi" :disabled="!r.nomor" />
                <b>{{ r.nama }}</b> · {{ r.jumlah }} lokasi
                <small v-if="!r.nomor" class="jv-telat"> — nomor HP belum diisi di HRIS</small>
                <small v-else class="muted"> · {{ r.nomor }}<template v-if="r.belum_terkirim"> · {{ r.belum_terkirim }} belum terkirim</template><template v-else> · sudah pernah dikirim</template></small>
              </label>
              <button class="btn btn-ghost btn-sm" @click="lihatTeks = lihatTeks === r.id_teknisi ? null : r.id_teknisi">{{ lihatTeks === r.id_teknisi ? 'Tutup' : 'Lihat pesan' }}</button>
              <pre v-if="lihatTeks === r.id_teknisi" class="jv-pre">{{ r.teks }}</pre>
            </div>
          </template>
          <template v-else>
            <p v-for="h in hasilHarian" :key="h.nama" :class="h.ok ? 'jv-ok' : 'jv-telat'">{{ h.ok ? '✓' : '✕' }} {{ h.nama }}<template v-if="h.error"> — {{ h.error }}</template></p>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="harian = null">{{ hasilHarian ? 'Tutup' : 'Batal' }}</button>
          <button v-if="!hasilHarian" class="btn btn-success" :disabled="proses || !harian.pilih.length" @click="kirimHarian">Kirim ke {{ harian.pilih.length }} teknisi</button>
        </div>
      </div>
    </div>

    <!-- Visit baru -->
    <div v-if="baru" class="modal-overlay" @click.self="baru = null">
      <div class="modal" v-focus-trap>
        <div class="modal-header">
          <span class="modal-title">Visit baru</span>
          <button type="button" class="btn-modal-close" aria-label="Tutup" @click="baru = null">✕</button>
        </div>
        <div class="modal-body jv-detail">
          <div class="form-group">
            <label class="form-label form-required">Store / site</label>
            <div v-if="baru.site" class="jv-site-pilih">
              <span><b>{{ baru.site.nama_site }}</b> ({{ baru.site.kode_site }}) · {{ baru.site.pelanggan?.nama_pelanggan }}</span>
              <button class="btn btn-ghost btn-sm" @click="baru.site = null">Ganti</button>
            </div>
            <template v-else>
              <input v-model="baru.q" class="form-input" placeholder="Ketik nama store, kode site, atau pelanggan…" />
              <div v-if="baru.hasil.length" class="jv-hasil">
                <button v-for="s in baru.hasil" :key="s.id_site" @click="baru.site = s; baru.hasil = []">
                  <b>{{ s.nama_site }}</b> <small>{{ s.kode_site }} · {{ s.pelanggan?.nama_pelanggan }}<template v-if="s.kota"> · {{ s.kota }}</template> · {{ s.status_site }}</small>
                </button>
              </div>
            </template>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Jenis</label>
              <select v-model="baru.jenis_wo" class="form-select"><option v-for="j in JENIS" :key="j" :value="j">{{ j }}</option></select>
            </div>
            <div class="form-group">
              <label class="form-label">Prioritas</label>
              <select v-model="baru.prioritas" class="form-select"><option v-for="p in PRIORITAS" :key="p" :value="p">{{ p }}</option></select>
            </div>
          </div>
          <div class="form-group"><label class="form-label form-required">Keluhan / tugas</label><textarea v-model="baru.deskripsi_tugas" class="form-textarea" rows="3" /></div>
          <p class="form-hint" style="margin: 0">Jadwal boleh dikosongkan — visit masuk antrean dan bisa diseret ke papan nanti.</p>
          <div class="form-row jv-row3">
            <div class="form-group"><label class="form-label">Tanggal</label><input v-model="baru.tgl" type="date" class="form-input" /></div>
            <div class="form-group"><label class="form-label">Jam</label><input v-model="baru.jam" type="time" class="form-input" /></div>
            <div class="form-group">
              <label class="form-label">Teknisi</label>
              <select v-model="baru.id_teknisi" class="form-select">
                <option :value="0">— antrean —</option>
                <option v-for="t in papan?.teknisi" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="baru = null">Batal</button>
          <button class="btn btn-primary" :disabled="proses" @click="simpanBaru">Simpan</button>
        </div>
      </div>
    </div>
    <div v-baris v-if="lihatFoto" class="jv-lihat" @click="lihatFoto = null"><img :src="lihatFoto" alt="" /></div>
  </div>
</template>

<style scoped>
.page.jv { max-width: none; }
.jv-tombol { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.jv-minggu { font-weight: 600; font-size: 13.5px; min-width: 150px; text-align: center; }
.jv-isi { display: grid; grid-template-columns: 280px 1fr; gap: 14px; align-items: start; }
.card { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: var(--r-lg, 12px); }
.jv-antrean { padding: 12px; position: sticky; top: 12px; max-height: calc(100vh - 150px); display: flex; flex-direction: column; gap: 8px; }
.jv-antrean.sasaran { outline: 2px dashed #3b82f6; outline-offset: -2px; background: #eff6ff; }
.jv-antrean-kepala { display: flex; align-items: center; gap: 6px; }
.jv-cari { font-size: 13px; }
.jv-antrean-daftar { overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 2px; }
.jv-kosong { text-align: center; padding: 16px 0; margin: 0; }

.jv-kartu { background: #fff; border: 1px solid var(--border); border-left: 4px solid #3b82f6; border-radius: 8px; padding: 7px 9px; cursor: grab; display: flex; flex-direction: column; gap: 2px; font-size: 13px; transition: box-shadow .15s; }
.jv-kartu:hover { box-shadow: 0 2px 8px rgba(15, 23, 42, .12); }
.jv-kartu:active { cursor: grabbing; }
.jv-kartu small { color: var(--text-muted); font-size: 11.5px; line-height: 1.3; }
.jv-kartu .jv-jenis { color: var(--text-2); }
.jv-kartu.terlewat { background: #fff7ed; }
.jv-kartu-atas { display: flex; gap: 6px; justify-content: space-between; align-items: baseline; }
.jv-kartu-atas b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jv-prio { font-size: 11px; font-weight: 700; flex: none; }
.jv-kartu.kecil { font-size: 12px; padding: 5px 7px; }
.jv-kartu.st-Completed { background: #f0fdf4; opacity: .8; cursor: pointer; }
.jv-kartu.st-In_Progress { background: #fffbeb; }
.jv-tanda { display: flex; gap: 4px; font-size: 11px; margin-top: 1px; }
.jv-tanda .redup { filter: grayscale(1); opacity: .35; }
.jv-telat { color: #c2410c !important; font-weight: 600; }
.jv-ok { color: #15803d !important; }

.jv-papan { overflow-x: auto; }
.jv-grid { display: grid; min-width: 1060px; }
.jv-sel { border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 6px; }
.jv-pojok, .jv-hari { position: sticky; top: 0; background: #f8fafc; z-index: 1; font-size: 12px; }
.jv-pojok { font-weight: 600; color: var(--text-3); display: flex; align-items: center; }
.jv-hari { display: flex; justify-content: space-between; align-items: center; gap: 4px; }
.jv-hari b { display: block; font-size: 12.5px; }
.jv-hari small { color: var(--text-muted); }
.jv-hari.hariini { background: #dbeafe; }
.jv-wa-hari { border: 1px solid var(--border); background: #fff; border-radius: 6px; font-size: 11px; padding: 2px 6px; cursor: pointer; white-space: nowrap; }
.jv-wa-hari.belum { border-color: #f97316; color: #c2410c; font-weight: 600; }
.jv-teknisi { display: flex; gap: 8px; align-items: center; font-size: 12.5px; background: #fcfcfd; }
.jv-teknisi b { display: block; line-height: 1.2; }
.jv-teknisi small { color: var(--text-muted); font-size: 11px; }
.jv-avatar { width: 28px; height: 28px; border-radius: 50%; background: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 700; display: grid; place-items: center; flex: none; }
.jv-kotak { min-height: 74px; display: flex; flex-direction: column; gap: 4px; transition: background .1s; }
.jv-kotak.hariini { background: #f5f9ff; }
.jv-kotak.lampau { background: #fafafa; }
.jv-kotak.sasaran { background: #dbeafe; outline: 2px dashed #3b82f6; outline-offset: -3px; }

.jv-detail { display: flex; flex-direction: column; gap: 14px; }
.jv-info { display: grid; gap: 4px; font-size: 13px; }
.jv-info > div { display: grid; grid-template-columns: 110px 1fr; gap: 8px; }
.jv-info span { color: var(--text-muted); }
.jv-info b { font-weight: 500; }
.pre { white-space: pre-wrap; }
.jv-blok { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px 12px; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.jv-blok legend { font-size: 12px; font-weight: 700; color: var(--text-3); padding: 0 4px; }
.jv-blok:disabled { opacity: .6; }
.jv-row3 { grid-template-columns: 1fr 120px 1fr; }
.jv-baris-tombol { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.jv-footer { display: flex; gap: 8px; flex-wrap: wrap; }
.jv-spasi { flex: 1; }
.jv-harian { border-bottom: 1px solid var(--border); padding: 8px 0; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px; font-size: 13px; }
.jv-harian label { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.jv-pre { width: 100%; white-space: pre-wrap; background: #f8fafc; border-radius: 8px; padding: 10px; font-size: 12px; margin: 4px 0 0; max-height: 300px; overflow-y: auto; }
.jv-site-pilih { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: #f1f5f9; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
.jv-hasil { border: 1px solid var(--border); border-radius: 8px; margin-top: 4px; max-height: 220px; overflow-y: auto; }
.jv-hasil button { display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--border); background: #fff; padding: 7px 10px; cursor: pointer; font: inherit; font-size: 13px; }
.jv-hasil button:hover { background: #f1f5f9; }
.jv-hasil small { color: var(--text-muted); }

.jv-laporan { gap: 8px; font-size: 13px; }
.jv-legend { font-size: 12px; color: var(--text-3); }
.jv-foto-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.jv-foto-grid img { width: 84px; height: 84px; object-fit: cover; border-radius: 8px; cursor: zoom-in; border: 1px solid var(--border); }
.jv-ttd { display: block; max-height: 110px; max-width: 100%; border: 1px solid var(--border); border-radius: 8px; margin-top: 4px; background: #fff; }
.jv-lihat { position: fixed; inset: 0; z-index: 3000; background: rgba(0, 0, 0, .85); display: grid; place-items: center; cursor: zoom-out; }
.jv-lihat img { max-width: 95vw; max-height: 95vh; }

@media (max-width: 900px) {
  .jv-isi { grid-template-columns: 1fr; }
  .jv-antrean { position: static; max-height: 320px; }
  .jv-row3 { grid-template-columns: 1fr 1fr; }
}
</style>
