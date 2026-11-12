<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { pesanGalat, toastGalat } from '@/composables/useDialog'
import StatBatang from './StatBatang.vue'

// Warna seri (palet kategorikal tervalidasi CVD): masuk = biru, keluar = oranye
const BIRU = '#2a78d6'
const ORANYE = '#eb6834'
// Rampa biru berurutan untuk heatmap (terang → gelap)
const RAMPA = ['#eef4fc', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']

const router = useRouter()
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const URUT_HARI = [1, 2, 3, 4, 5, 6, 0] // tampilkan Senin dulu

const tglLokal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const geser = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return tglLokal(d) }

const filter = reactive({ preset: '7', dari: geser(-6), sampai: geser(0), jenis: 'semua', jam_kerja: false })
function pilihPreset(p: string) {
  filter.preset = p
  if (p === '0') { filter.dari = geser(0); filter.sampai = geser(0) }
  else if (p === 'kemarin') { filter.dari = geser(-1); filter.sampai = geser(-1) }
  else if (p === 'bulan') { const d = new Date(); filter.dari = tglLokal(new Date(d.getFullYear(), d.getMonth(), 1)); filter.sampai = geser(0) }
  else if (p !== 'custom') { filter.dari = geser(-(Number(p) - 1)); filter.sampai = geser(0) }
}

const d = ref<any>(null)
const memuat = ref(false)
const galat = ref('')
const diperbarui = ref<Date | null>(null)
let urut = 0 // ganti filter cepat: hanya jawaban permintaan terakhir yang dipakai
// latar = segarkan otomatis: tanpa bilah kemajuan, gagal cukup diam (data terakhir tetap tampil)
async function muat(latar = false) {
  const n = ++urut
  memuat.value = true
  try {
    const { data } = await api.get('/wa/statistik', {
      params: { dari: filter.dari, sampai: filter.sampai, jenis: filter.jenis, jam_kerja: filter.jam_kerja ? 1 : undefined },
      senyap: latar,
    })
    if (n !== urut) return
    d.value = data.data
    galat.value = ''
    diperbarui.value = new Date()
  } catch (e) {
    if (n !== urut || latar) return
    galat.value = pesanGalat(e, 'Gagal memuat statistik')
    if (d.value) toastGalat(e, 'Gagal memuat statistik')
  } finally {
    if (n === urut) memuat.value = false
  }
}
watch(() => [filter.dari, filter.sampai, filter.jenis, filter.jam_kerja], () => muat())

// Segarkan otomatis tiap menit selama tab terlihat
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  muat()
  timer = setInterval(() => { if (document.visibilityState === 'visible' && !memuat.value) muat(true) }, 60_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// ── Format ──
const angka = (v: number | null | undefined) => (v == null ? '–' : v.toLocaleString('id-ID'))
const persen = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v * 100)}%`)
function durasi(s: number | null | undefined) {
  if (s == null) return '–'
  if (s < 60) return `${s} dtk`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} mnt`
  const j = Math.floor(m / 60)
  if (j < 24) return `${j} j ${m % 60} m`
  return `${Math.floor(j / 24)} hr ${j % 24} j`
}
const tglPendek = (t: string) => { const [, b, h] = t.split('-'); return `${Number(h)}/${Number(b)}` }
const tglPanjang = (t: string) => new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
const NAMA_TIPE: Record<string, string> = { text: 'Teks', image: 'Foto', document: 'Dokumen', video: 'Video', audio: 'Suara', sticker: 'Stiker', contact: 'Kontak', location: 'Lokasi', poll: 'Polling' }

// ── Turunan ──
const k = computed(() => d.value?.kpi)
const harianLabel = computed(() => (d.value?.harian || []).map((h: any) => h.tanggal))
const seriTraffic = computed(() => [
  { nama: 'Masuk (pelanggan)', warna: BIRU, nilai: d.value.harian.map((h: any) => h.masuk) },
  { nama: 'Keluar (helpdesk)', warna: ORANYE, nilai: d.value.harian.map((h: any) => h.keluar) },
])
const seriResponHarian = computed(() => [{ nama: 'Median respon', warna: BIRU, nilai: d.value.harian.map((h: any) => h.respon_median) }])
const seriResponJam = computed(() => [{ nama: 'Median respon', warna: BIRU, nilai: d.value.respon_jam.map((r: any) => r.median) }])
const seriTiket = computed(() => [
  { nama: 'Dibuka', warna: BIRU, nilai: d.value.tiket.harian.map((h: any) => h.dibuka) },
  { nama: 'Selesai', warna: ORANYE, nilai: d.value.tiket.harian.map((h: any) => h.selesai) },
])
const jamLabel = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))

const maksHeat = computed(() => Math.max(1, ...(d.value?.heatmap || []).flat()))
function warnaHeat(v: number) {
  if (!v) return 'var(--border-light)'
  return RAMPA[Math.min(RAMPA.length - 1, Math.floor((v / maksHeat.value) * (RAMPA.length - 1)) + 1)]
}
const teksHeatGelap = (v: number) => v / maksHeat.value > 0.55

const maksDistribusi = computed(() => Math.max(1, ...(d.value?.distribusi || []).map((x: any) => x.jumlah)))
const totalDistribusi = computed(() => (d.value?.distribusi || []).reduce((a: number, x: any) => a + x.jumlah, 0))
// Ember respon: hijau → merah memakai warna status (selalu disertai label)
const WARNA_EMBER = ['#0ca30c', '#0ca30c', '#fab219', '#ec835a', '#d03b3b', '#d03b3b']

const tanpaNama = computed(() => d.value?.staf.find((s: any) => s.nama === 'HP Helpdesk (tanpa nama)'))
const pctTanpaNama = computed(() => (tanpaNama.value && k.value?.keluar ? tanpaNama.value.pesan / k.value.keluar : 0))

function bukaChat(id: number) {
  router.push({ path: '/whatsapp', query: { chat: String(id) } })
}
const kelasTunggu = (s: number) => (s > 3600 ? 'merah' : s > 900 ? 'kuning' : '')
</script>

<template>
  <div class="page st">
    <div class="page-header">
      <div>
        <h2 class="page-title">📊 Statistik Helpdesk</h2>
        <p class="page-subtitle">
          Traffic chat WhatsApp, kecepatan respon, beban staf, dan tiket gangguan
          <template v-if="diperbarui"> · diperbarui {{ diperbarui.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }}</template>
        </p>
      </div>
      <div class="st-tombol">
        <button class="btn btn-ghost" @click="router.push('/whatsapp')">💬 Inbox</button>
        <button class="btn btn-ghost" :disabled="memuat" @click="muat()">{{ memuat ? 'Memuat…' : '↻ Segarkan' }}</button>
      </div>
    </div>

    <!-- Filter -->
    <div class="st-filter">
      <div class="st-seg">
        <button v-for="p in [['0', 'Hari ini'], ['kemarin', 'Kemarin'], ['7', '7 hari'], ['30', '30 hari'], ['bulan', 'Bulan ini'], ['custom', 'Pilih tanggal']]" :key="p[0]"
          :class="{ on: filter.preset === p[0] }" @click="pilihPreset(p[0]!)">{{ p[1] }}</button>
      </div>
      <template v-if="filter.preset === 'custom'">
        <input v-model="filter.dari" type="date" class="form-control st-tgl" :max="filter.sampai" />
        <span class="muted">s/d</span>
        <input v-model="filter.sampai" type="date" class="form-control st-tgl" :min="filter.dari" />
      </template>
      <div class="st-seg">
        <button v-for="j in [['semua', 'Semua chat'], ['pribadi', 'Pribadi'], ['grup', 'Grup']]" :key="j[0]" :class="{ on: filter.jenis === j[0] }" @click="filter.jenis = j[0]!">{{ j[1] }}</button>
      </div>
      <label class="st-cek" title="Hanya pesan pelanggan yang masuk Senin–Sabtu 08.00–17.00 WIB yang dihitung waktu responnya">
        <input v-model="filter.jam_kerja" type="checkbox" /> Respon jam kerja saja
      </label>
    </div>

    <p v-if="!d && memuat" class="loading-state muted">Memuat statistik…</p>
    <div v-else-if="!d && galat" class="galat-state" role="alert">
      <span class="galat-ikon">!</span>
      <span class="galat-judul">Statistik gagal dimuat</span>
      <span>{{ galat }}</span>
      <button class="btn btn-ghost" @click="muat()">Coba lagi</button>
    </div>
    <template v-else-if="d">
      <!-- KPI chat -->
      <div class="st-kpi">
        <div class="stat-tile">
          <span class="stat-tile-label">Pesan masuk</span>
          <span class="stat-tile-value">{{ angka(k.masuk) }}</span>
          <span class="stat-tile-sub">dari pelanggan</span>
        </div>
        <div class="stat-tile">
          <span class="stat-tile-label">Pesan keluar</span>
          <span class="stat-tile-value">{{ angka(k.keluar) }}</span>
          <span class="stat-tile-sub">balasan helpdesk</span>
        </div>
        <div class="stat-tile">
          <span class="stat-tile-label">Chat aktif</span>
          <span class="stat-tile-value">{{ angka(k.chat_aktif) }}</span>
          <span class="stat-tile-sub">{{ angka(k.chat_pribadi) }} pribadi · {{ angka(k.chat_grup) }} grup · {{ angka(k.chat_baru) }} baru</span>
        </div>
        <div class="stat-tile">
          <span class="stat-tile-label">Median respon pertama</span>
          <span class="stat-tile-value">{{ durasi(k.respon_median) }}</span>
          <span class="stat-tile-sub">90% dibalas ≤ {{ durasi(k.respon_p90) }}</span>
        </div>
        <div class="stat-tile">
          <span class="stat-tile-label">Dibalas ≤ 5 menit</span>
          <span class="stat-tile-value">{{ persen(k.pct_5menit) }}</span>
          <span class="stat-tile-sub">≤ 15 menit: {{ persen(k.pct_15menit) }} · dari {{ angka(k.dibalas) }} sesi</span>
        </div>
        <div class="stat-tile" :class="{ 'st-alarm': k.antrean > 0 }">
          <span class="stat-tile-label">Belum dibalas sekarang</span>
          <span class="stat-tile-value">{{ angka(k.antrean) }}</span>
          <span class="stat-tile-sub">chat terbuka, 7 hari terakhir</span>
        </div>
      </div>

      <!-- Traffic & respon harian -->
      <div class="st-grid">
        <div class="card st-kartu st-lebar">
          <h3>Traffic chat per hari</h3>
          <StatBatang :label="harianLabel" :seri="seriTraffic" :label-sumbu="(l: string) => harianLabel.length > 1 ? tglPendek(l) : tglPanjang(l)" />
        </div>
        <div class="card st-kartu">
          <h3>Median respon pertama per hari</h3>
          <StatBatang :label="harianLabel" :seri="seriResponHarian" :format="durasi" :batas="1800" :label-sumbu="(l: string) => tglPendek(l)" />
        </div>
      </div>

      <div class="st-grid">
        <!-- Heatmap jam ramai -->
        <div class="card st-kartu st-lebar">
          <h3>Jam ramai — pesan masuk per jam (WIB)</h3>
          <div class="st-heat">
            <div class="st-heat-baris st-heat-kepala"><span />
              <span v-for="(j, i) in jamLabel" :key="j" class="st-heat-jam">{{ i % 3 === 0 ? j : '' }}</span>
            </div>
            <div v-for="h in URUT_HARI" :key="h" class="st-heat-baris">
              <span class="st-heat-hari">{{ HARI[h] }}</span>
              <span v-for="(v, j) in d.heatmap[h]" :key="j" class="st-heat-sel"
                :style="{ background: warnaHeat(v), color: teksHeatGelap(v) ? '#fff' : 'var(--text-2)' }"
                :title="`${HARI[h]} ${jamLabel[j]}.00–${jamLabel[j]}.59: ${v} pesan masuk`">{{ v || '' }}</span>
            </div>
          </div>
          <div class="st-heat-skala"><span>Sepi</span><i v-for="w in RAMPA.slice(1)" :key="w" :style="{ background: w }" /><span>Ramai (maks {{ angka(maksHeat) }})</span></div>
        </div>
        <!-- Distribusi respon -->
        <div class="card st-kartu">
          <h3>Sebaran waktu respon pertama</h3>
          <div v-for="(x, i) in d.distribusi" :key="x.label" class="st-hbar" :title="`${x.jumlah} sesi`">
            <span class="st-hbar-label">{{ x.label }}</span>
            <span class="st-hbar-jalur"><i :style="{ width: (x.jumlah / maksDistribusi) * 100 + '%', background: WARNA_EMBER[i] }" /></span>
            <span class="st-hbar-nilai">{{ angka(x.jumlah) }} <small class="muted">{{ totalDistribusi ? Math.round((x.jumlah / totalDistribusi) * 100) : 0 }}%</small></span>
          </div>
          <p class="st-cat">Sesi = deretan pesan pelanggan sampai dibalas staf pertama kali. Pesan penutup ("oke", "terima kasih", stiker) yang tidak dibalas tidak dihitung. Tidak dibalas: <b>{{ angka(k.tidak_dibalas) }}</b> sesi.</p>
        </div>
      </div>

      <div class="card st-kartu">
        <h3>Median respon pertama menurut jam pesan masuk</h3>
        <StatBatang :label="jamLabel" :seri="seriResponJam" :format="durasi" :batas="1800" :tinggi="140" :label-sumbu="(l: string) => l + '.00'" />
        <p class="st-cat">Skala dipotong di 30 menit; batang bertanda ▲ lebih lama dari itu (arahkan kursor untuk nilai sebenarnya).</p>
      </div>

      <!-- Antrean -->
      <div class="card st-kartu">
        <h3>Belum dibalas sekarang <span class="badge" :class="d.antrean.length ? 'badge-danger' : 'badge-success'">{{ d.antrean.length }}</span></h3>
        <p v-if="!d.antrean.length" class="muted">Semua chat terbuka sudah dibalas. 👍</p>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Chat</th><th>Pesan terakhir</th><th>Menunggu</th><th class="kanan">Pesan</th><th>PIC</th><th /></tr></thead>
            <tbody>
              <tr v-for="a in d.antrean.slice(0, 50)" :key="a.id_chat">
                <td><b>{{ a.nama }}</b> <span v-if="a.is_grup" class="badge badge-gray">grup</span></td>
                <td class="st-potong">{{ a.terakhir || '📎 Media' }}</td>
                <td :class="kelasTunggu(a.tunggu_detik)"><b>{{ durasi(a.tunggu_detik) }}</b></td>
                <td class="kanan">{{ a.jumlah }}</td>
                <td>{{ a.pic || '—' }}</td>
                <td><button class="btn btn-sm btn-ghost" @click="bukaChat(a.id_chat)">Buka</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per staf -->
      <div class="card st-kartu">
        <h3>Kinerja per staf</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Staf</th><th class="kanan">Pesan dikirim</th><th class="kanan">Chat dilayani</th><th class="kanan">Sesi dijawab pertama</th><th class="kanan">Median respon</th><th class="kanan">PIC terbuka</th><th class="kanan">PIC selesai</th></tr></thead>
            <tbody>
              <tr v-for="s in d.staf" :key="s.nama">
                <td><b>{{ s.nama }}</b></td>
                <td class="kanan">{{ angka(s.pesan) }}</td>
                <td class="kanan">{{ angka(s.chat) }}</td>
                <td class="kanan">{{ angka(s.respon_n) }}</td>
                <td class="kanan">{{ durasi(s.respon_median) }}</td>
                <td class="kanan">{{ angka(s.pic_terbuka) }}</td>
                <td class="kanan">{{ angka(s.pic_selesai) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="pctTanpaNama > 0.2" class="st-cat">
          ⚠️ {{ persen(pctTanpaNama) }} pesan keluar dikirim langsung dari HP helpdesk sehingga tidak diketahui stafnya.
          Supaya kinerja per staf akurat, balas lewat inbox ERP (otomatis tercatat) atau awali pesan dengan tanda tangan <code>*Nama*</code>.
          "(HP pribadi)" = karyawan NEXT1 yang membalas di grup dari nomornya sendiri.
        </p>
      </div>

      <div class="st-grid">
        <div class="card st-kartu st-lebar">
          <h3>Chat paling ramai</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Chat</th><th class="kanan">Masuk</th><th class="kanan">Keluar</th><th class="kanan">Median respon</th><th /></tr></thead>
              <tbody>
                <tr v-for="c in d.top_chat" :key="c.id_chat">
                  <td><b>{{ c.nama }}</b> <span v-if="c.is_grup" class="badge badge-gray">grup</span></td>
                  <td class="kanan">{{ angka(c.masuk) }}</td>
                  <td class="kanan">{{ angka(c.keluar) }}</td>
                  <td class="kanan">{{ durasi(c.respon_median) }}</td>
                  <td><button class="btn btn-sm btn-ghost" @click="bukaChat(c.id_chat)">Buka</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card st-kartu">
          <h3>Jenis pesan</h3>
          <table class="data-table">
            <thead><tr><th>Jenis</th><th class="kanan">Masuk</th><th class="kanan">Keluar</th></tr></thead>
            <tbody>
              <tr v-for="t in d.tipe" :key="t.tipe"><td>{{ NAMA_TIPE[t.tipe] || t.tipe }}</td><td class="kanan">{{ angka(t.masuk) }}</td><td class="kanan">{{ angka(t.keluar) }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tiket gangguan -->
      <h3 class="st-bagian">🎫 Tiket gangguan</h3>
      <div class="st-kpi">
        <div class="stat-tile"><span class="stat-tile-label">Tiket dibuka</span><span class="stat-tile-value">{{ angka(d.tiket.dibuka) }}</span><span class="stat-tile-sub">di periode ini</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Tiket selesai</span><span class="stat-tile-value">{{ angka(d.tiket.selesai) }}</span><span class="stat-tile-sub">resolved di periode ini</span></div>
        <div class="stat-tile" :class="{ 'st-alarm': d.tiket.terbuka_sekarang > 0 }"><span class="stat-tile-label">Masih terbuka</span><span class="stat-tile-value">{{ angka(d.tiket.terbuka_sekarang) }}</span><span class="stat-tile-sub">saat ini</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Median penyelesaian</span><span class="stat-tile-value">{{ durasi(d.tiket.mttr_median) }}</span><span class="stat-tile-sub">rata-rata {{ durasi(d.tiket.mttr_rata) }}</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Lewat SLA</span><span class="stat-tile-value">{{ angka(d.tiket.sla_lewat) }}</span><span class="stat-tile-sub">{{ d.tiket.dibuka ? persen(d.tiket.sla_lewat / d.tiket.dibuka) : '–' }} dari tiket dibuka</span></div>
      </div>
      <div class="st-grid">
        <div class="card st-kartu st-lebar">
          <h3>Tiket per hari</h3>
          <StatBatang :label="d.tiket.harian.map((h: any) => h.tanggal)" :seri="seriTiket" :label-sumbu="(l: string) => tglPendek(l)" />
        </div>
        <div class="card st-kartu">
          <h3>Site paling sering gangguan</h3>
          <table class="data-table">
            <thead><tr><th>Site</th><th class="kanan">Tiket</th></tr></thead>
            <tbody>
              <tr v-for="s in d.tiket.top_site" :key="s.id_site">
                <td><b>{{ s.nama }}</b><br /><small class="muted">{{ s.kode }}</small></td>
                <td class="kanan">{{ angka(s.jumlah) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="st-cat">
            Prioritas: <template v-for="(p, i) in d.tiket.prioritas" :key="p.label">{{ i ? ' · ' : '' }}{{ p.label }} {{ angka(p.jumlah) }}</template><br />
            Sumber: <template v-for="(p, i) in d.tiket.sumber" :key="p.label">{{ i ? ' · ' : '' }}{{ p.label }} {{ angka(p.jumlah) }}</template>
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.st-tombol { display: flex; gap: 6px; flex-wrap: wrap; }
.st-filter { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; }
.st-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
.st-seg button { border: 0; background: none; padding: 6px 11px; font-size: 13px; cursor: pointer; color: var(--text-2); border-right: 1px solid var(--border); }
.st-seg button:last-child { border-right: 0; }
.st-seg button.on { background: var(--primary-light, #eff6ff); color: var(--primary, #1d4ed8); font-weight: 600; }
.st-tgl { width: auto; padding: 5px 8px; }
.st-cek { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--text-2); cursor: pointer; }
.st-kpi { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.st-alarm .stat-tile-value { color: #d03b3b; }
.st-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; }
.st-kartu { padding: 16px; margin-bottom: 16px; min-width: 0; }
.st-grid .st-kartu { margin-bottom: 0; }
.st-kartu h3 { margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--text-1); display: flex; align-items: center; gap: 8px; }
.st-bagian { margin: 8px 0 12px; font-size: 16px; }
.st-cat { margin: 10px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5; }
.st-cat code { background: var(--border-light); padding: 0 4px; border-radius: 4px; }

.st-heat { display: flex; flex-direction: column; gap: 2px; overflow-x: auto; }
.st-heat-baris { display: grid; grid-template-columns: 34px repeat(24, minmax(18px, 1fr)); gap: 2px; }
.st-heat-hari, .st-heat-jam { font-size: 11px; color: var(--text-muted); }
.st-heat-hari { align-self: center; }
.st-heat-sel { height: 24px; border-radius: 3px; font-size: 9.5px; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
.st-heat-skala { display: flex; align-items: center; gap: 2px; margin-top: 8px; font-size: 11px; color: var(--text-muted); }
.st-heat-skala i { width: 18px; height: 10px; border-radius: 2px; }
.st-heat-skala span { margin: 0 6px; }

.st-hbar { display: grid; grid-template-columns: 92px 1fr 80px; gap: 8px; align-items: center; margin-bottom: 8px; font-size: 13px; }
.st-hbar-jalur { height: 14px; background: var(--border-light); border-radius: 4px; overflow: hidden; }
.st-hbar-jalur i { display: block; height: 100%; border-radius: 0 4px 4px 0; }
.st-hbar-nilai { text-align: right; font-variant-numeric: tabular-nums; }
.st-potong { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kanan { text-align: right; }
.muted { color: var(--text-3); }
.merah { color: #d03b3b; }
.kuning { color: #b45309; }
@media (max-width: 1000px) { .st-grid { grid-template-columns: 1fr; } }
</style>
