<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { alertError, toast } from '@/composables/useDialog'
import { useFilterUrl } from '@/composables/useFilterUrl'
import { exportCsv } from '@/composables/useExport'
import FormRapat from './FormRapat.vue'
import {
  KATEGORI, RESPON, infoRespon, STATUS_WARNA, durasiTeks, hitungMundur, infoKategori, inisial, jam, kunciHari, labelKategori,
  lamaJalan, linkGoogleCalendar, tglPanjang, tglPendek, unduhIcs, warnaNama,
} from './rapat-util'

interface Peserta { id_karyawan: number; nama: string; peran: string; respon: string | null; hadir: boolean }
interface Rapat {
  id_rapat: number; judul: string; deskripsi: string | null; jadwal_at: string | null; durasi_menit: number | null
  kategori: string | null; lokasi: string | null; status: string; mulai_at: string | null; selesai_at: string | null
  created_at: string; pembuat: string; id_pembuat: number; moderator: boolean; diundang: boolean; respon_saya: string | null
  peserta: Peserta[]; jumlah_hadir: number; jumlah_tamu: number; ada_notulen: boolean; tindak_total: number; tindak_terbuka: number
}
interface Statistik { berlangsung: number; hari_ini: number; akan_datang: number; minggu_ini: number; bulan_ini: number; jam_bulan_ini: number; rata_hadir: number | null; menunggu_respon: number }
interface TindakSaya { id_tindak: number; judul: string; tenggat: string | null; id_rapat: number; rapat: string }

const router = useRouter()
const asal = window.location.origin
const aktif = ref<Rapat[]>([])
const riwayat = ref<Rapat[]>([])
const statistik = ref<Statistik | null>(null)
const tindakSaya = ref<TindakSaya[]>([])
const memuat = ref(true)
const error = ref('')

// Filter (tersimpan di URL)
const tab = ref<'agenda' | 'kalender' | 'riwayat'>('agenda')
const q = ref('')
const kategori = ref('')
const peran = ref('')
const status = ref('')
useFilterUrl({ tab, q, kategori, peran, status })

async function muat(diam = false) {
  if (!diam) memuat.value = true
  try {
    const { data } = await api.get('/meeting')
    aktif.value = data.data.aktif
    riwayat.value = data.data.riwayat
    statistik.value = data.data.statistik
    tindakSaya.value = data.data.tindak_saya
    error.value = ''
  } catch (e: any) {
    if (!diam) error.value = e?.response?.data?.message || 'Gagal memuat rapat'
  } finally {
    memuat.value = false
  }
}

// Jam & penyegaran otomatis
const kini = ref(Date.now())
let detik: ReturnType<typeof setInterval> | undefined
let segar: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  muat()
  detik = setInterval(() => { kini.value = Date.now() }, 1000)
  segar = setInterval(() => { if (document.visibilityState === 'visible' && !form.value) muat(true) }, 30_000)
  window.addEventListener('keydown', pintasan)
})
onBeforeUnmount(() => { clearInterval(detik); clearInterval(segar); window.removeEventListener('keydown', pintasan) })
const jamSekarang = computed(() => new Date(kini.value).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' }))
const sapaan = computed(() => {
  const h = Number(new Date(kini.value).toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }))
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
})

// ── Penyaringan ──────────────────────────────────────────────────────────────
function cocok(r: Rapat) {
  const kata = q.value.trim().toLowerCase()
  if (kata && !`${r.judul} ${r.deskripsi ?? ''} ${r.pembuat} ${r.lokasi ?? ''} ${r.peserta.map((p) => p.nama).join(' ')}`.toLowerCase().includes(kata)) return false
  if (kategori.value && (r.kategori || '') !== kategori.value) return false
  if (peran.value === 'moderator' && !r.moderator) return false
  if (peran.value === 'diundang' && !r.diundang) return false
  if (peran.value === 'pemantau' && r.diundang) return false
  if (peran.value === 'belum' && !(r.diundang && !r.moderator && !r.respon_saya && r.status === 'Terjadwal')) return false
  return true
}
const berlangsung = computed(() => aktif.value.filter((r) => r.status === 'Berlangsung' && cocok(r)))
const terjadwal = computed(() => aktif.value.filter((r) => r.status === 'Terjadwal' && cocok(r)))
const berikutnya = computed(() => aktif.value.filter((r) => r.status === 'Terjadwal' && r.jadwal_at && r.diundang && r.respon_saya !== 'tidak')
  .sort((a, b) => +new Date(a.jadwal_at!) - +new Date(b.jadwal_at!))[0])
const riwayatSaring = computed(() => riwayat.value.filter((r) => cocok(r) && (!status.value || r.status === status.value)))
const adaFilter = computed(() => !!(q.value || kategori.value || peran.value || status.value))
function resetFilter() { q.value = ''; kategori.value = ''; peran.value = ''; status.value = '' }

// Agenda dikelompokkan per hari
const agenda = computed(() => {
  const hariIni = kunciHari(new Date(kini.value))
  const besok = kunciHari(new Date(kini.value + 86400_000))
  const grup = new Map<string, { label: string; sub: string; item: Rapat[] }>()
  for (const r of terjadwal.value) {
    const k = r.jadwal_at ? kunciHari(r.jadwal_at) : 'dadakan'
    const lewat = r.jadwal_at && k < hariIni
    const kunci = lewat ? '0-lewat' : k
    if (!grup.has(kunci)) {
      grup.set(kunci, {
        label: lewat ? 'Terlewat — belum dimulai' : k === 'dadakan' ? 'Tanpa jadwal' : k === hariIni ? 'Hari ini' : k === besok ? 'Besok' : tglPendek(r.jadwal_at!),
        sub: lewat || k === 'dadakan' ? '' : tglPanjang(r.jadwal_at!),
        item: [],
      })
    }
    grup.get(kunci)!.item.push(r)
  }
  return [...grup.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ kunci: k, ...v }))
})

// ── Kalender bulan ───────────────────────────────────────────────────────────
const bulan = ref(new Date())
const namaBulan = computed(() => bulan.value.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }))
function geserBulan(n: number) { const d = new Date(bulan.value); d.setDate(1); d.setMonth(d.getMonth() + n); bulan.value = d }
const sel = computed(() => {
  const awal = new Date(bulan.value.getFullYear(), bulan.value.getMonth(), 1)
  const mulai = new Date(awal)
  mulai.setDate(1 - ((awal.getDay() + 6) % 7)) // mulai Senin
  const peta = new Map<string, Rapat[]>()
  for (const r of [...aktif.value, ...riwayat.value]) {
    if (!cocok(r)) continue
    const t = r.jadwal_at || r.mulai_at || r.created_at
    const k = kunciHari(t)
    if (!peta.has(k)) peta.set(k, [])
    peta.get(k)!.push(r)
  }
  const hariIni = kunciHari(new Date())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(mulai)
    d.setDate(mulai.getDate() + i)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const item = (peta.get(k) ?? []).sort((a, b) => +new Date(a.jadwal_at || a.mulai_at || a.created_at) - +new Date(b.jadwal_at || b.mulai_at || b.created_at))
    return { k, tgl: d.getDate(), luar: d.getMonth() !== bulan.value.getMonth(), hariIni: k === hariIni, akhirPekan: d.getDay() === 0 || d.getDay() === 6, item }
  })
})
const hariDipilih = ref('')
const isiHariDipilih = computed(() => sel.value.find((s) => s.k === hariDipilih.value)?.item ?? [])

// ── Aksi ─────────────────────────────────────────────────────────────────────
const form = ref<null | { segera: boolean }>(null)
function buka(r: Rapat, masuk = false) { router.push({ path: `/meeting/${r.id_rapat}`, query: masuk ? { masuk: '1' } : {} }) }
function tersimpan(data: any, masuk: boolean) {
  form.value = null
  if (masuk) router.push({ path: `/meeting/${data.id_rapat}`, query: { masuk: '1' } })
  else muat(true)
}
async function respon(r: Rapat, nilai: string) {
  try {
    await api.post(`/meeting/${r.id_rapat}/respon`, { respon: nilai })
    r.respon_saya = nilai
    toast(`Konfirmasi: ${infoRespon(nilai).label}`)
    muat(true)
  } catch (e) { alertError(e, 'Gagal menyimpan konfirmasi') }
}
async function duplikat(r: Rapat) {
  try {
    const { data } = await api.post(`/meeting/${r.id_rapat}/duplikat`, {})
    toast('Rapat disalin — atur jadwalnya')
    router.push({ path: `/meeting/${data.data.id_rapat}`, query: { ubah: '1' } })
  } catch (e) { alertError(e, 'Gagal menyalin rapat') }
}
async function selesaikanTindak(t: TindakSaya) {
  try {
    await api.patch(`/meeting/${t.id_rapat}/tindak/${t.id_tindak}`, { selesai: true })
    tindakSaya.value = tindakSaya.value.filter((x) => x.id_tindak !== t.id_tindak)
    toast('Tugas ditandai selesai 🎉')
  } catch (e) { alertError(e, 'Gagal') }
}

function ekspor() {
  exportCsv(`riwayat-rapat-${kunciHari(new Date())}`, [{
    headers: ['ID', 'Judul', 'Kategori', 'Status', 'Jadwal', 'Mulai', 'Selesai', 'Durasi (mnt)', 'Pembuat', 'Diundang', 'Hadir', 'Tamu', 'Notulen', 'Tindak lanjut', 'Tindak terbuka'],
    rows: riwayatSaring.value.map((r) => [
      r.id_rapat, r.judul, labelKategori(r.kategori), r.status, r.jadwal_at ? new Date(r.jadwal_at).toLocaleString('id-ID') : '',
      r.mulai_at ? new Date(r.mulai_at).toLocaleString('id-ID') : '', r.selesai_at ? new Date(r.selesai_at).toLocaleString('id-ID') : '',
      lama(r) ?? '', r.pembuat, r.peserta.length, r.jumlah_hadir, r.jumlah_tamu, r.ada_notulen ? 'Ada' : '', r.tindak_total, r.tindak_terbuka,
    ]),
  }])
}

// ── Format ───────────────────────────────────────────────────────────────────
const lama = (r: Rapat) => (r.mulai_at && r.selesai_at ? Math.round((+new Date(r.selesai_at) - +new Date(r.mulai_at)) / 60_000) : null)
const persenHadir = (r: Rapat) => (r.peserta.length ? Math.round((r.jumlah_hadir / r.peserta.length) * 100) : 0)
const rentang = (r: Rapat) => r.jadwal_at ? `${jam(r.jadwal_at)}${r.durasi_menit ? `–${jam(new Date(+new Date(r.jadwal_at) + r.durasi_menit * 60_000))}` : ''}` : 'Kapan saja'
const responHitung = (r: Rapat) => ({
  hadir: r.peserta.filter((p) => p.respon === 'hadir').length,
  mungkin: r.peserta.filter((p) => p.respon === 'mungkin').length,
  tidak: r.peserta.filter((p) => p.respon === 'tidak').length,
  belum: r.peserta.filter((p) => !p.respon).length,
})
const tenggatLewat = (t: TindakSaya) => !!t.tenggat && kunciHari(t.tenggat) < kunciHari(new Date())

// ── Pintasan keyboard ────────────────────────────────────────────────────────
const bantuan = ref(false)
const cariEl = ref<HTMLInputElement | null>(null)
function pintasan(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (form.value || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) {
    if (e.key === 'Escape' && t === cariEl.value) cariEl.value?.blur()
    return
  }
  if (e.key === 'n') { e.preventDefault(); form.value = { segera: false } }
  else if (e.key === 'k') { e.preventDefault(); form.value = { segera: true } }
  else if (e.key === '/') { e.preventDefault(); cariEl.value?.focus() }
  else if (e.key === 'r') muat()
  else if (e.key === '1') tab.value = 'agenda'
  else if (e.key === '2') tab.value = 'kalender'
  else if (e.key === '3') tab.value = 'riwayat'
  else if (e.key === '?') bantuan.value = !bantuan.value
  else if (e.key === 'Escape') { bantuan.value = false; hariDipilih.value = '' }
}
</script>

<template>
  <div class="mt">
    <!-- HERO -->
    <section class="mt-hero">
      <div class="mt-hero-kiri">
        <div class="mt-logo">📹</div>
        <div>
          <h2>Pusat Rapat</h2>
          <p>{{ sapaan }} · <b>{{ jamSekarang }}</b> WIB · rapat internal NEXT1 lewat meet.nextone.id</p>
        </div>
      </div>
      <div class="mt-hero-aksi">
        <button type="button" class="mt-kaca" title="Pintasan keyboard (?)" @click="bantuan = !bantuan">⌨️</button>
        <button type="button" class="mt-kaca" @click="form = { segera: true }">⚡ Rapat kilat</button>
        <button type="button" class="mt-utama" @click="form = { segera: false }"><span>＋</span> Jadwalkan rapat</button>
      </div>
    </section>

    <div v-if="bantuan" class="mt-bantuan">
      <span><kbd>n</kbd> jadwalkan</span><span><kbd>k</kbd> rapat kilat</span><span><kbd>/</kbd> cari</span>
      <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> agenda · kalender · riwayat</span><span><kbd>r</kbd> muat ulang</span>
      <button type="button" class="mt-x" @click="bantuan = false">tutup ✕</button>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <!-- SEDANG BERLANGSUNG -->
    <section v-for="r in berlangsung" :key="'live' + r.id_rapat" class="mt-live" @click="buka(r)">
      <div class="mt-live-denyut"><i></i></div>
      <div class="mt-live-isi">
        <small>● SEDANG BERLANGSUNG · {{ r.mulai_at ? lamaJalan(r.mulai_at, kini) : '' }}</small>
        <b>{{ r.judul }}</b>
        <span>{{ r.jumlah_hadir }} dari {{ r.peserta.length }} undangan sudah masuk<template v-if="r.jumlah_tamu"> · {{ r.jumlah_tamu }} tamu</template></span>
      </div>
      <div class="mt-tumpuk">
        <i v-for="p in r.peserta.filter((x) => x.hadir).slice(0, 5)" :key="p.id_karyawan" :style="{ background: warnaNama(p.nama) }" :title="p.nama">{{ inisial(p.nama) }}</i>
      </div>
      <button type="button" class="mt-gabung" @click.stop="buka(r, true)">Gabung sekarang →</button>
    </section>

    <!-- KPI -->
    <section v-if="statistik" class="mt-kpi">
      <div class="mt-k k-hijau" :class="{ denyut: statistik.berlangsung }"><span class="mt-k-ikon">🟢</span><b>{{ statistik.berlangsung }}</b><small>Berlangsung</small><em>saat ini</em></div>
      <div class="mt-k k-biru"><span class="mt-k-ikon">📅</span><b>{{ statistik.hari_ini }}</b><small>Hari ini</small><em>{{ statistik.akan_datang }} akan datang</em></div>
      <button type="button" class="mt-k k-oranye" :class="{ aktif: peran === 'belum' }" @click="peran = peran === 'belum' ? '' : 'belum'; tab = 'agenda'">
        <span class="mt-k-ikon">✋</span><b>{{ statistik.menunggu_respon }}</b><small>Perlu konfirmasi</small><em>undangan belum dijawab</em>
      </button>
      <div class="mt-k k-ungu"><span class="mt-k-ikon">✅</span><b>{{ statistik.minggu_ini }}</b><small>Selesai 7 hari</small><em>{{ statistik.bulan_ini }} bulan ini</em></div>
      <div class="mt-k k-teal"><span class="mt-k-ikon">⏱️</span><b>{{ statistik.jam_bulan_ini }}<span class="mt-satuan">jam</span></b><small>Waktu rapat</small><em>bulan ini</em></div>
      <div class="mt-k k-merah"><span class="mt-k-ikon">👥</span><b>{{ statistik.rata_hadir ?? '–' }}<span v-if="statistik.rata_hadir != null" class="mt-satuan">%</span></b><small>Rata kehadiran</small><em>undangan yang masuk</em></div>
    </section>

    <div class="mt-tata">
      <div class="mt-utama-kol">
        <!-- TAB & FILTER -->
        <div class="mt-alat">
          <div class="mt-tab" role="tablist">
            <button type="button" role="tab" :class="{ on: tab === 'agenda' }" @click="tab = 'agenda'">🗒️ Agenda <span>{{ terjadwal.length }}</span></button>
            <button type="button" role="tab" :class="{ on: tab === 'kalender' }" @click="tab = 'kalender'">🗓️ Kalender</button>
            <button type="button" role="tab" :class="{ on: tab === 'riwayat' }" @click="tab = 'riwayat'">🕘 Riwayat <span>{{ riwayatSaring.length }}</span></button>
          </div>
          <div class="mt-cari">
            <span>🔎</span>
            <input ref="cariEl" v-model="q" placeholder="Cari judul, peserta, agenda…  ( / )" />
            <button v-if="q" type="button" class="mt-x" @click="q = ''">✕</button>
          </div>
        </div>
        <div class="mt-saring">
          <button v-for="k in KATEGORI" :key="k.kode" type="button" class="mt-chip" :class="{ on: kategori === k.kode }" :style="{ '--c': k.warna }" @click="kategori = kategori === k.kode ? '' : k.kode">{{ k.ikon }} {{ labelKategori(k.kode) }}</button>
          <select v-model="peran" class="mt-pilih">
            <option value="">Semua peran</option>
            <option value="moderator">Saya moderator</option>
            <option value="diundang">Saya diundang</option>
            <option value="belum">Belum saya konfirmasi</option>
            <option value="pemantau">Hanya dipantau</option>
          </select>
          <button v-if="adaFilter" type="button" class="mt-reset" @click="resetFilter">Reset filter</button>
        </div>

        <div v-if="memuat" class="mt-skeleton"><i v-for="n in 4" :key="n"></i></div>

        <!-- AGENDA -->
        <template v-else-if="tab === 'agenda'">
          <div v-if="!agenda.length" class="mt-kosong">
            <div>🌤️</div>
            <b>{{ adaFilter ? 'Tidak ada rapat yang cocok dengan filter' : 'Agenda kosong' }}</b>
            <p>{{ adaFilter ? 'Coba ubah atau reset filter.' : 'Jadwalkan rapat atau mulai rapat kilat untuk mengundang rekan.' }}</p>
            <button v-if="!adaFilter" type="button" class="mt-utama kecil" @click="form = { segera: false }">＋ Jadwalkan rapat</button>
          </div>
          <div v-for="g in agenda" :key="g.kunci" class="mt-hari">
            <div class="mt-hari-kepala" :class="{ lewat: g.kunci === '0-lewat' }"><b>{{ g.label }}</b><small>{{ g.sub }}</small><span>{{ g.item.length }} rapat</span></div>
            <article v-for="r in g.item" :key="r.id_rapat" v-baris class="mt-kartu" :style="{ '--c': infoKategori(r.kategori).warna }" @click="buka(r)">
              <div class="mt-waktu">
                <b>{{ r.jadwal_at ? jam(r.jadwal_at) : '—' }}</b>
                <small>{{ r.durasi_menit ? durasiTeks(r.durasi_menit) : '' }}</small>
                <em v-if="r.jadwal_at && +new Date(r.jadwal_at) > kini && +new Date(r.jadwal_at) - kini < 6 * 3600_000">{{ hitungMundur(r.jadwal_at, kini) }}</em>
              </div>
              <div class="mt-kartu-isi">
                <div class="mt-kartu-atas">
                  <span class="mt-kat">{{ infoKategori(r.kategori).ikon }} {{ labelKategori(r.kategori) }}</span>
                  <span v-if="r.moderator" class="mt-lencana mod">Moderator</span>
                  <span v-else-if="!r.diundang" class="mt-lencana pantau" title="Anda tidak diundang — terlihat karena akses Admin / Director">👁️ Pemantau</span>
                  <span v-if="r.respon_saya" class="mt-lencana" :style="{ color: infoRespon(r.respon_saya).warna }">{{ infoRespon(r.respon_saya).ikon }} {{ infoRespon(r.respon_saya).label }}</span>
                </div>
                <h4>{{ r.judul }}</h4>
                <p class="mt-meta">
                  🕒 {{ rentang(r) }}<template v-if="r.lokasi"> · 📍 {{ r.lokasi }}</template> · oleh {{ r.pembuat }}
                </p>
                <div class="mt-kartu-bawah">
                  <div class="mt-tumpuk kecil">
                    <i v-for="p in r.peserta.slice(0, 6)" :key="p.id_karyawan" :class="'r-' + (p.respon || 'belum')" :style="{ background: warnaNama(p.nama) }" :title="`${p.nama}${p.respon ? ` — ${infoRespon(p.respon).label}` : ' — belum konfirmasi'}`">{{ inisial(p.nama) }}</i>
                    <span v-if="r.peserta.length > 6">+{{ r.peserta.length - 6 }}</span>
                  </div>
                  <small class="mt-rsvp">
                    <span class="hijau">✓ {{ responHitung(r).hadir }}</span>
                    <span v-if="responHitung(r).mungkin" class="kuning">? {{ responHitung(r).mungkin }}</span>
                    <span v-if="responHitung(r).tidak" class="merah">✕ {{ responHitung(r).tidak }}</span>
                    <span class="abu">… {{ responHitung(r).belum }}</span>
                  </small>
                </div>
              </div>
              <div class="mt-kartu-aksi" @click.stop>
                <div v-if="r.diundang && !r.moderator" class="mt-rsvp-tombol">
                  <button v-for="(v, k) in RESPON" :key="k" type="button" :class="{ on: r.respon_saya === k }" :style="{ '--c': v.warna }" :title="v.label" @click="respon(r, k)">{{ v.ikon }}</button>
                </div>
                <button type="button" class="mt-masuk" @click="buka(r, true)">Masuk</button>
                <button v-if="r.jadwal_at" type="button" class="mt-ikon" title="Tambah ke kalender (.ics)" @click="unduhIcs(r, asal)">📆</button>
              </div>
            </article>
          </div>
        </template>

        <!-- KALENDER -->
        <template v-else-if="tab === 'kalender'">
          <div class="mt-kal">
            <div class="mt-kal-kepala">
              <button type="button" @click="geserBulan(-1)">‹</button>
              <b>{{ namaBulan }}</b>
              <button type="button" @click="geserBulan(1)">›</button>
              <button type="button" class="mt-kal-ini" @click="bulan = new Date()">Bulan ini</button>
            </div>
            <div class="mt-kal-grid">
              <span v-for="h in ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']" :key="h" class="mt-kal-hari">{{ h }}</span>
              <button v-for="s in sel" :key="s.k" type="button" class="mt-kal-sel" :class="{ luar: s.luar, ini: s.hariIni, libur: s.akhirPekan, pilih: hariDipilih === s.k }" @click="hariDipilih = hariDipilih === s.k ? '' : s.k">
                <span class="mt-kal-tgl">{{ s.tgl }}</span>
                <span v-for="r in s.item.slice(0, 3)" :key="r.id_rapat" class="mt-kal-item" :class="r.status.toLowerCase()" :style="{ '--c': infoKategori(r.kategori).warna }">
                  {{ jam(r.jadwal_at || r.mulai_at) }} {{ r.judul }}
                </span>
                <small v-if="s.item.length > 3" class="mt-kal-lagi">+{{ s.item.length - 3 }} lagi</small>
              </button>
            </div>
            <div v-if="hariDipilih" class="mt-kal-detail">
              <div class="mt-kal-detail-kepala">
                <b>{{ tglPanjang(hariDipilih + 'T12:00:00+07:00') }}</b>
                <button type="button" class="mt-utama kecil" @click="form = { segera: false }">＋ Rapat</button>
              </div>
              <p v-if="!isiHariDipilih.length" class="mt-redup">Tidak ada rapat di hari ini.</p>
              <button v-for="r in isiHariDipilih" :key="r.id_rapat" type="button" class="mt-kal-baris" @click="buka(r)">
                <i :style="{ background: STATUS_WARNA[r.status] }"></i>
                <b>{{ jam(r.jadwal_at || r.mulai_at) }}</b> {{ r.judul }}
                <small>{{ r.status }} · {{ r.peserta.length }} peserta</small>
              </button>
            </div>
          </div>
        </template>

        <!-- RIWAYAT -->
        <template v-else>
          <div class="mt-riwayat-alat">
            <div class="mt-segmen">
              <button v-for="s in ['', 'Selesai', 'Dibatalkan']" :key="s" type="button" :class="{ on: status === s }" @click="status = s">{{ s || 'Semua' }}</button>
            </div>
            <button type="button" class="mt-ekspor" :disabled="!riwayatSaring.length" @click="ekspor">⬇️ Ekspor CSV</button>
          </div>
          <div class="mt-tabel">
            <table>
              <thead><tr><th>Rapat</th><th>Waktu</th><th>Durasi</th><th>Kehadiran</th><th>Hasil</th><th></th></tr></thead>
              <tbody>
                <tr v-if="!riwayatSaring.length"><td colspan="6" class="mt-redup pusat">Belum ada riwayat{{ adaFilter ? ' yang cocok' : '' }}.</td></tr>
                <tr v-for="r in riwayatSaring" :key="r.id_rapat" v-baris @click="buka(r)">
                  <td>
                    <div class="mt-tabel-judul">
                      <span class="mt-titik" :style="{ background: infoKategori(r.kategori).warna }"></span>
                      <div>
                        <b>{{ r.judul }}</b>
                        <small>{{ labelKategori(r.kategori) }} · oleh {{ r.pembuat }}<template v-if="!r.diundang"> · 👁️ pemantau</template></small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span v-if="r.status === 'Dibatalkan'" class="mt-batal">Dibatalkan</span>
                    <template v-else>{{ tglPendek(r.mulai_at || r.created_at) }}<br /><small class="mt-redup">{{ jam(r.mulai_at) }}–{{ jam(r.selesai_at) }}</small></template>
                  </td>
                  <td>{{ lama(r) != null ? durasiTeks(lama(r)!) : '–' }}</td>
                  <td>
                    <div v-if="r.status === 'Selesai'" class="mt-hadir">
                      <div class="mt-hadir-bar"><i :style="{ width: persenHadir(r) + '%' }"></i></div>
                      <small>{{ r.jumlah_hadir }}/{{ r.peserta.length }}<template v-if="r.jumlah_tamu"> +{{ r.jumlah_tamu }} tamu</template></small>
                    </div>
                    <span v-else class="mt-redup">–</span>
                  </td>
                  <td>
                    <span v-if="r.ada_notulen" class="mt-hasil">📝 Notulen</span>
                    <span v-if="r.tindak_total" class="mt-hasil" :class="{ beres: !r.tindak_terbuka }">☑️ {{ r.tindak_total - r.tindak_terbuka }}/{{ r.tindak_total }}</span>
                    <span v-if="!r.ada_notulen && !r.tindak_total" class="mt-redup">–</span>
                  </td>
                  <td class="kanan" @click.stop>
                    <button type="button" class="mt-ikon" title="Jadwalkan ulang dengan peserta yang sama" @click="duplikat(r)">🔁</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>

      <!-- KOLOM SAMPING -->
      <aside class="mt-samping">
        <div v-if="berikutnya" class="mt-panel mt-next" :style="{ '--c': infoKategori(berikutnya.kategori).warna }">
          <small class="mt-panel-label">Rapat Anda berikutnya</small>
          <div class="mt-next-hitung">{{ hitungMundur(berikutnya.jadwal_at!, kini) }}</div>
          <b class="mt-next-judul" @click="buka(berikutnya)">{{ berikutnya.judul }}</b>
          <p class="mt-redup">{{ tglPendek(berikutnya.jadwal_at!) }} · {{ rentang(berikutnya) }}<template v-if="berikutnya.lokasi"><br />📍 {{ berikutnya.lokasi }}</template></p>
          <div class="mt-next-aksi">
            <button type="button" class="mt-masuk" @click="buka(berikutnya, true)">Masuk</button>
            <button type="button" class="mt-ikon" title="Unduh .ics" @click="unduhIcs(berikutnya, asal)">📆</button>
            <a class="mt-ikon" :href="linkGoogleCalendar(berikutnya, asal)" target="_blank" rel="noopener" title="Tambah ke Google Calendar">G</a>
          </div>
        </div>

        <div class="mt-panel">
          <div class="mt-panel-kepala"><b>☑️ Tugas saya dari rapat</b><span>{{ tindakSaya.length }}</span></div>
          <p v-if="!tindakSaya.length" class="mt-redup kecil">Tidak ada tindak lanjut yang menunggu Anda. 🎉</p>
          <ul class="mt-tugas">
            <li v-for="t in tindakSaya" :key="t.id_tindak">
              <button type="button" class="mt-centang" title="Tandai selesai" @click="selesaikanTindak(t)"></button>
              <div @click="router.push(`/meeting/${t.id_rapat}?tab=tindak`)">
                <span>{{ t.judul }}</span>
                <small><template v-if="t.tenggat"><b :class="{ merah: tenggatLewat(t) }">{{ tenggatLewat(t) ? '⚠️ ' : '' }}{{ tglPendek(t.tenggat) }}</b> · </template>{{ t.rapat }}</small>
              </div>
            </li>
          </ul>
        </div>

        <div class="mt-panel mt-tips">
          <b>💡 Tips</b>
          <ul>
            <li>Tamu dari luar (vendor, klien) bisa diundang lewat <b>link tamu</b> di halaman rapat.</li>
            <li>Peserta mendapat pengingat otomatis <b>10 menit</b> sebelum rapat.</li>
            <li>Tulis <b>notulen</b> & <b>tindak lanjut</b> setelah rapat — PIC langsung mendapat notifikasi.</li>
          </ul>
        </div>
      </aside>
    </div>

    <FormRapat v-if="form" :segera="form.segera" @tutup="form = null" @tersimpan="tersimpan" />
  </div>
</template>

<style scoped>
.mt { padding-bottom: 60px; }
.mt-redup { color: #94a3b8; }
.kecil { font-size: 12.5px; }
.pusat { text-align: center; padding: 26px !important; }
.kanan { text-align: right; }
kbd { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 5px; border: 1px solid rgba(15, 23, 42, .18); border-bottom-width: 2px; font: 700 10.5px/16px ui-monospace, monospace; text-align: center; background: #fff; color: #334155; margin-right: 2px; }
.mt-x { border: 0; background: none; cursor: pointer; color: #94a3b8; font-size: 12.5px; }

/* HERO */
.mt-hero { position: relative; overflow: hidden; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 24px; border-radius: 22px; color: #fff; margin-bottom: 14px;
  background: radial-gradient(circle at 85% -20%, rgba(255, 255, 255, .22), transparent 45%), linear-gradient(120deg, #312e81 0%, #4f46e5 40%, #7c3aed 75%, #c026d3 100%); box-shadow: 0 14px 34px -14px rgba(79, 70, 229, .7); }
.mt-hero::before { content: ''; position: absolute; left: -40px; bottom: -80px; width: 220px; height: 220px; border-radius: 50%; background: rgba(255, 255, 255, .07); }
.mt-hero-kiri { display: flex; align-items: center; gap: 14px; position: relative; }
.mt-logo { width: 50px; height: 50px; border-radius: 16px; background: rgba(255, 255, 255, .16); display: grid; place-items: center; font-size: 26px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25); }
.mt-hero h2 { margin: 0; font-size: 25px; font-weight: 900; letter-spacing: -.5px; color: #fff; }
.mt-hero p { margin: 2px 0 0; font-size: 13px; opacity: .9; }
.mt-hero p b { font-variant-numeric: tabular-nums; }
.mt-hero-aksi { display: flex; gap: 8px; flex-wrap: wrap; position: relative; }
.mt-kaca { border: 1px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .14); color: #fff; border-radius: 12px; padding: 9px 13px; font-weight: 700; font-size: 13.5px; cursor: pointer; backdrop-filter: blur(6px); transition: background .15s, transform .15s; }
.mt-kaca:hover { background: rgba(255, 255, 255, .28); transform: translateY(-1px); }
.mt-utama { border: 0; background: #fff; color: #4338ca; border-radius: 12px; padding: 10px 16px; font-weight: 800; font-size: 14px; cursor: pointer; box-shadow: 0 6px 16px rgba(0, 0, 0, .15); display: inline-flex; align-items: center; gap: 6px; transition: transform .15s; }
.mt-utama:hover { transform: translateY(-2px); }
.mt-utama.kecil { padding: 7px 12px; font-size: 13px; background: linear-gradient(120deg, #4f46e5, #7c3aed); color: #fff; }
.mt-bantuan { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; padding: 10px 14px; border-radius: 12px; background: #eef2ff; border: 1px dashed #a5b4fc; font-size: 12.5px; color: #3730a3; margin-bottom: 14px; }
.mt-bantuan .mt-x { margin-left: auto; }

/* LIVE */
.mt-live { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 18px; margin-bottom: 12px; cursor: pointer; color: #fff; flex-wrap: wrap;
  background: linear-gradient(120deg, #065f46, #059669 60%, #10b981); box-shadow: 0 12px 26px -14px rgba(5, 150, 105, .8); animation: mt-muncul .4s both; }
.mt-live-denyut { width: 40px; height: 40px; border-radius: 50%; background: rgba(255, 255, 255, .18); display: grid; place-items: center; flex-shrink: 0; }
.mt-live-denyut i { width: 13px; height: 13px; border-radius: 50%; background: #fff; animation: mt-ping 1.6s infinite; }
@keyframes mt-ping { 0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, .7); } 80%, 100% { box-shadow: 0 0 0 16px rgba(255, 255, 255, 0); } }
.mt-live-isi { flex: 1; min-width: 200px; display: flex; flex-direction: column; }
.mt-live-isi small { font-size: 11px; font-weight: 800; letter-spacing: .6px; opacity: .9; font-variant-numeric: tabular-nums; }
.mt-live-isi b { font-size: 17px; }
.mt-live-isi span { font-size: 12.5px; opacity: .9; }
.mt-gabung { border: 0; background: #fff; color: #047857; font-weight: 900; border-radius: 12px; padding: 10px 16px; cursor: pointer; font-size: 14px; box-shadow: 0 6px 14px rgba(0, 0, 0, .18); }
.mt-gabung:hover { transform: scale(1.03); }

/* Tumpukan avatar */
.mt-tumpuk { display: flex; align-items: center; }
.mt-tumpuk i { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-style: normal; color: #fff; font-size: 11.5px; font-weight: 800; margin-left: -8px; box-shadow: 0 0 0 2px #fff; }
.mt-live .mt-tumpuk i { box-shadow: 0 0 0 2px #059669; }
.mt-tumpuk i:first-child { margin-left: 0; }
.mt-tumpuk.kecil i { width: 26px; height: 26px; font-size: 10px; margin-left: -6px; position: relative; }
.mt-tumpuk.kecil i.r-hadir::after, .mt-tumpuk.kecil i.r-tidak::after, .mt-tumpuk.kecil i.r-mungkin::after { content: ''; position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid #fff; }
.mt-tumpuk.kecil i.r-hadir::after { background: #16a34a; } .mt-tumpuk.kecil i.r-tidak::after { background: #dc2626; } .mt-tumpuk.kecil i.r-mungkin::after { background: #d97706; }
.mt-tumpuk span { font-size: 11.5px; color: #64748b; margin-left: 6px; font-weight: 700; }

/* KPI */
.mt-kpi { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px; }
.mt-k { --c: #2563eb; position: relative; text-align: left; border: 1px solid color-mix(in srgb, var(--c) 22%, #e2e8f0); background: linear-gradient(160deg, color-mix(in srgb, var(--c) 10%, #fff), #fff 70%); border-radius: 16px; padding: 13px 14px; display: flex; flex-direction: column; gap: 1px; font: inherit; color: inherit; animation: mt-muncul .45s both; transition: transform .18s, box-shadow .18s; }
button.mt-k { cursor: pointer; }
.mt-k:hover { transform: translateY(-3px); box-shadow: 0 10px 22px -12px color-mix(in srgb, var(--c) 70%, transparent); }
.mt-k.aktif { outline: 2.5px solid var(--c); outline-offset: -1px; }
.mt-k:nth-child(2) { animation-delay: 50ms } .mt-k:nth-child(3) { animation-delay: 100ms } .mt-k:nth-child(4) { animation-delay: 150ms } .mt-k:nth-child(5) { animation-delay: 200ms } .mt-k:nth-child(6) { animation-delay: 250ms }
.mt-k-ikon { position: absolute; right: 10px; top: 8px; font-size: 20px; transition: transform .3s; }
.mt-k:hover .mt-k-ikon { transform: rotate(-12deg) scale(1.2); }
.mt-k b { font-size: 28px; font-weight: 900; color: var(--c); line-height: 1.05; letter-spacing: -1px; }
.mt-satuan { font-size: 14px; font-weight: 800; margin-left: 3px; letter-spacing: 0; }
.mt-k small { font-size: 12px; font-weight: 700; color: #334155; }
.mt-k em { font-style: normal; font-size: 11px; color: #64748b; }
.k-hijau { --c: #16a34a; } .k-biru { --c: #2563eb; } .k-oranye { --c: #ea580c; } .k-ungu { --c: #7c3aed; } .k-teal { --c: #0d9488; } .k-merah { --c: #e11d48; }
.mt-k.denyut { animation: mt-muncul .45s both, mt-denyut 1.6s .5s infinite; }
@keyframes mt-denyut { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 18%, transparent); } }
@keyframes mt-muncul { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }

/* Tata letak */
.mt-tata { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.mt-utama-kol { min-width: 0; }
.mt-alat { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.mt-tab { display: inline-flex; gap: 3px; background: #f1f5f9; padding: 4px; border-radius: 14px; }
.mt-tab button { border: 0; background: none; padding: 8px 14px; border-radius: 10px; font-weight: 800; font-size: 13.5px; cursor: pointer; color: #475569; display: inline-flex; gap: 6px; align-items: center; }
.mt-tab button span { background: #e2e8f0; border-radius: 99px; padding: 0 7px; font-size: 11px; }
.mt-tab button.on { background: #fff; color: #4338ca; box-shadow: 0 2px 8px rgba(15, 23, 42, .1); }
.mt-tab button.on span { background: #e0e7ff; color: #4338ca; }
.mt-cari { flex: 1; min-width: 220px; max-width: 380px; display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0 12px; }
.mt-cari:focus-within { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, .15); }
.mt-cari input { flex: 1; border: 0; outline: none; padding: 9px 0; font: inherit; font-size: 13.5px; background: none; min-width: 0; }
.mt-saring { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 14px; }
.mt-chip { --c: #4f46e5; border: 1px solid #e2e8f0; background: #fff; border-radius: 99px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; color: #475569; }
.mt-chip:hover { border-color: var(--c); }
.mt-chip.on { background: var(--c); border-color: var(--c); color: #fff; }
.mt-pilih { border: 1px solid #e2e8f0; border-radius: 99px; padding: 4px 10px; font-size: 12px; background: #fff; color: #334155; font-weight: 600; }
.mt-reset { border: 0; background: none; color: #e11d48; font-size: 12px; font-weight: 700; cursor: pointer; }
.mt-skeleton { display: flex; flex-direction: column; gap: 10px; }
.mt-skeleton i { height: 92px; border-radius: 16px; background: linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9); background-size: 200% 100%; animation: mt-kilau 1.2s infinite; }
@keyframes mt-kilau { to { background-position: -200% 0; } }
.mt-kosong { text-align: center; padding: 40px 20px; background: #fff; border: 1px dashed #cbd5e1; border-radius: 18px; color: #475569; }
.mt-kosong div { font-size: 40px; }
.mt-kosong b { display: block; font-size: 16px; margin: 6px 0 2px; color: #0f172a; }
.mt-kosong p { margin: 0 0 12px; font-size: 13px; color: #64748b; }

/* Agenda */
.mt-hari { margin-bottom: 16px; }
.mt-hari-kepala { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; padding: 0 4px; }
.mt-hari-kepala b { font-size: 15px; font-weight: 900; color: #0f172a; }
.mt-hari-kepala small { font-size: 12px; color: #94a3b8; }
.mt-hari-kepala span { margin-left: auto; font-size: 11.5px; color: #64748b; font-weight: 700; }
.mt-hari-kepala.lewat b { color: #b45309; }
.mt-kartu { --c: #4f46e5; display: flex; gap: 14px; align-items: stretch; background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid var(--c); border-radius: 16px; padding: 14px; margin-bottom: 8px; cursor: pointer; transition: transform .15s, box-shadow .15s; animation: mt-muncul .35s both; }
.mt-kartu:hover { transform: translateY(-2px); box-shadow: 0 12px 24px -16px rgba(15, 23, 42, .4); }
.mt-waktu { width: 72px; flex-shrink: 0; display: flex; flex-direction: column; gap: 1px; }
.mt-waktu b { font-size: 20px; font-weight: 900; color: #0f172a; font-variant-numeric: tabular-nums; letter-spacing: -.5px; }
.mt-waktu small { font-size: 11.5px; color: #64748b; }
.mt-waktu em { font-style: normal; font-size: 11px; font-weight: 800; color: var(--c); margin-top: 4px; }
.mt-kartu-isi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.mt-kartu-atas { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mt-kat { font-size: 11.5px; font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fff); padding: 2px 8px; border-radius: 99px; }
.mt-lencana { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 99px; background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; }
.mt-lencana.mod { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
.mt-lencana.pantau { background: #fefce8; border-color: #fde68a; color: #92400e; }
.mt-kartu h4 { margin: 0; font-size: 15.5px; font-weight: 800; color: #0f172a; }
.mt-meta { margin: 0; font-size: 12.5px; color: #64748b; }
.mt-kartu-bawah { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
.mt-rsvp { display: flex; gap: 8px; font-size: 11.5px; font-weight: 700; }
.hijau { color: #16a34a; } .kuning { color: #d97706; } .merah { color: #dc2626; } .abu { color: #94a3b8; }
.mt-kartu-aksi { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; justify-content: center; }
.mt-rsvp-tombol { display: flex; gap: 3px; background: #f8fafc; padding: 3px; border-radius: 10px; border: 1px solid #e2e8f0; }
.mt-rsvp-tombol button { --c: #64748b; border: 0; background: none; width: 30px; height: 28px; border-radius: 7px; cursor: pointer; font-size: 13px; filter: grayscale(1); opacity: .6; }
.mt-rsvp-tombol button:hover { filter: none; opacity: 1; }
.mt-rsvp-tombol button.on { background: #fff; filter: none; opacity: 1; box-shadow: 0 0 0 1.5px var(--c); }
.mt-masuk { border: 0; background: linear-gradient(120deg, #16a34a, #059669); color: #fff; font-weight: 800; border-radius: 10px; padding: 7px 16px; cursor: pointer; font-size: 13px; box-shadow: 0 6px 14px -8px #059669; }
.mt-ikon { border: 1px solid #e2e8f0; background: #fff; border-radius: 9px; width: 32px; height: 30px; cursor: pointer; font-size: 14px; display: inline-grid; place-items: center; text-decoration: none; color: #2563eb; font-weight: 900; }
.mt-ikon:hover { border-color: #6366f1; background: #eef2ff; }

/* Kalender */
.mt-kal { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 14px; }
.mt-kal-kepala { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.mt-kal-kepala b { font-size: 16px; font-weight: 900; min-width: 160px; text-align: center; text-transform: capitalize; }
.mt-kal-kepala button { border: 1px solid #e2e8f0; background: #fff; border-radius: 9px; padding: 4px 10px; cursor: pointer; font-weight: 800; color: #334155; }
.mt-kal-ini { margin-left: auto; font-size: 12px; }
.mt-kal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.mt-kal-hari { font-size: 11px; font-weight: 800; color: #94a3b8; text-align: center; padding: 4px 0; text-transform: uppercase; }
.mt-kal-sel { min-height: 92px; border: 1px solid #f1f5f9; background: #fff; border-radius: 10px; padding: 5px; display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer; font: inherit; min-width: 0; transition: border-color .12s; }
.mt-kal-sel:hover { border-color: #a5b4fc; }
.mt-kal-sel.libur { background: #fafafa; }
.mt-kal-sel.luar { opacity: .45; }
.mt-kal-sel.ini { border-color: #6366f1; box-shadow: inset 0 0 0 1px #6366f1; }
.mt-kal-sel.pilih { background: #eef2ff; border-color: #6366f1; }
.mt-kal-tgl { font-size: 12px; font-weight: 800; color: #334155; }
.mt-kal-sel.ini .mt-kal-tgl { color: #fff; background: #4f46e5; border-radius: 99px; width: 22px; height: 22px; display: grid; place-items: center; }
.mt-kal-item { --c: #4f46e5; font-size: 10.5px; line-height: 1.3; padding: 2px 5px; border-radius: 5px; background: color-mix(in srgb, var(--c) 13%, #fff); color: color-mix(in srgb, var(--c) 80%, #000); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.mt-kal-item.dibatalkan { text-decoration: line-through; opacity: .55; }
.mt-kal-item.selesai { opacity: .7; }
.mt-kal-item.berlangsung { background: #16a34a; color: #fff; }
.mt-kal-lagi { font-size: 10px; color: #64748b; font-weight: 700; }
.mt-kal-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 6px; }
.mt-kal-detail-kepala { display: flex; justify-content: space-between; align-items: center; }
.mt-kal-baris { display: flex; align-items: center; gap: 8px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; background: #fff; cursor: pointer; font: inherit; font-size: 13px; text-align: left; }
.mt-kal-baris i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.mt-kal-baris small { margin-left: auto; color: #94a3b8; font-size: 11.5px; }

/* Riwayat */
.mt-riwayat-alat { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.mt-segmen { display: inline-flex; background: #f1f5f9; border-radius: 10px; padding: 3px; gap: 2px; }
.mt-segmen button { border: 0; background: none; padding: 5px 12px; border-radius: 8px; font-weight: 700; font-size: 12.5px; cursor: pointer; color: #475569; }
.mt-segmen button.on { background: #fff; color: #4338ca; box-shadow: 0 1px 4px rgba(15, 23, 42, .1); }
.mt-ekspor { border: 1px solid #e2e8f0; background: #fff; border-radius: 10px; padding: 6px 12px; font-weight: 700; font-size: 12.5px; cursor: pointer; color: #334155; }
.mt-ekspor:disabled { opacity: .5; cursor: default; }
.mt-tabel { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: auto; }
.mt-tabel table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mt-tabel th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #94a3b8; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 800; white-space: nowrap; }
.mt-tabel td { padding: 10px 12px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
.mt-tabel tbody tr { cursor: pointer; transition: background .1s; }
.mt-tabel tbody tr:hover { background: #f8fafc; }
.mt-tabel-judul { display: flex; gap: 10px; align-items: center; }
.mt-tabel-judul div { display: flex; flex-direction: column; min-width: 0; }
.mt-tabel-judul small { color: #94a3b8; font-size: 11.5px; }
.mt-titik { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.mt-batal { font-size: 11.5px; font-weight: 800; color: #dc2626; background: #fef2f2; padding: 2px 8px; border-radius: 99px; }
.mt-hadir { display: flex; flex-direction: column; gap: 3px; min-width: 90px; }
.mt-hadir-bar { height: 6px; border-radius: 99px; background: #f1f5f9; overflow: hidden; }
.mt-hadir-bar i { display: block; height: 100%; background: linear-gradient(90deg, #16a34a, #22c55e); border-radius: 99px; }
.mt-hadir small { font-size: 11px; color: #64748b; }
.mt-hasil { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 99px; background: #f1f5f9; color: #475569; margin: 1px 3px 1px 0; }
.mt-hasil.beres { background: #dcfce7; color: #15803d; }

/* Samping */
.mt-samping { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; }
.mt-panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 14px; }
.mt-panel-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; }
.mt-panel-kepala { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mt-panel-kepala b { font-size: 13.5px; }
.mt-panel-kepala span { background: #eef2ff; color: #4338ca; border-radius: 99px; padding: 0 8px; font-size: 11.5px; font-weight: 800; }
.mt-next { --c: #4f46e5; background: linear-gradient(160deg, color-mix(in srgb, var(--c) 12%, #fff), #fff 70%); border-color: color-mix(in srgb, var(--c) 25%, #e2e8f0); }
.mt-next-hitung { font-size: 24px; font-weight: 900; color: var(--c); letter-spacing: -.5px; margin: 2px 0; }
.mt-next-judul { display: block; font-size: 15px; cursor: pointer; color: #0f172a; }
.mt-next-judul:hover { text-decoration: underline; }
.mt-next p { margin: 4px 0 10px; font-size: 12.5px; }
.mt-next-aksi { display: flex; gap: 6px; }
.mt-tugas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.mt-tugas li { display: flex; gap: 10px; align-items: flex-start; padding: 7px 4px; border-radius: 10px; }
.mt-tugas li:hover { background: #f8fafc; }
.mt-tugas li > div { flex: 1; min-width: 0; cursor: pointer; display: flex; flex-direction: column; }
.mt-tugas span { font-size: 13px; font-weight: 600; color: #0f172a; }
.mt-tugas small { font-size: 11.5px; color: #94a3b8; }
.mt-tugas small b { color: #475569; }
.mt-tugas small b.merah { color: #dc2626; }
.mt-centang { width: 20px; height: 20px; border-radius: 6px; border: 2px solid #cbd5e1; background: #fff; cursor: pointer; flex-shrink: 0; margin-top: 1px; transition: all .15s; }
.mt-centang:hover { border-color: #16a34a; background: #dcfce7; }
.mt-tips { background: linear-gradient(160deg, #faf5ff, #fff 60%); border-color: #e9d5ff; }
.mt-tips b { font-size: 13px; }
.mt-tips ul { margin: 6px 0 0; padding-left: 18px; font-size: 12.5px; color: #475569; display: flex; flex-direction: column; gap: 4px; }

@media (max-width: 1100px) { .mt-tata { grid-template-columns: 1fr; } .mt-samping { position: static; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); } }
@media (max-width: 640px) {
  .mt-hero { padding: 18px; } .mt-hero h2 { font-size: 21px; }
  .mt-kartu { flex-wrap: wrap; } .mt-waktu { width: auto; flex-direction: row; gap: 8px; align-items: baseline; }
  .mt-kartu-aksi { flex-direction: row; width: 100%; justify-content: flex-start; }
  .mt-kal-sel { min-height: 54px; } .mt-kal-item { display: none; }
  .mt-kal-sel:has(.mt-kal-item)::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #6366f1; }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
