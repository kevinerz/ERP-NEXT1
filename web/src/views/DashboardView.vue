<script setup lang="ts">
// Dashboard per akun: bagian yang tampil & urutannya mengikuti modul akses dan divisi user.
// Tampilan warna-warni dengan grafik & animasi kecil; semua animasi mati bila "kurangi gerakan" aktif.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import DashEksekutif from './dashboard/DashEksekutif.vue'
import KartuAngka from '@/components/grafik/KartuAngka.vue'
import GrafikTren from '@/components/grafik/GrafikTren.vue'
import GrafikBatang from '@/components/grafik/GrafikBatang.vue'
import GrafikDonat from '@/components/grafik/GrafikDonat.vue'
import CincinProgres from '@/components/grafik/CincinProgres.vue'
import BatangMendatar from '@/components/grafik/BatangMendatar.vue'
import AngkaNaik from '@/components/grafik/AngkaNaik.vue'
import { SERI, STATUS } from '@/components/grafik/warna'

const router = useRouter()
const auth = useAuthStore()

const d = ref<any>(null)
const memuat = ref(true)
const error = ref('')
// refresh otomatis: catat waktu sukses terakhir; gagal di latar belakang cukup catatan kecil
const terakhir = ref<Date | null>(null)
const gagalPerbarui = ref(false)
const jamTerakhir = computed(() => terakhir.value ? terakhir.value.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '')

async function muat(diam = false) {
  if (!diam) memuat.value = true
  try {
    const r = await api.get('/dashboard/saya')
    d.value = r.data.data
    error.value = ''
    terakhir.value = new Date()
    gagalPerbarui.value = false
  } catch (e: any) {
    if (!diam || !d.value) error.value = e.response?.data?.message || 'Gagal memuat dashboard'
    else gagalPerbarui.value = true
  } finally { memuat.value = false }
}
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { muat(); timer = setInterval(() => muat(true), 60_000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

// Urutan bagian per divisi — divisi sendiri di atas, sisanya menyusul.
// Bagian yang tidak tercantum tidak ditampilkan (mis. tiket & status router untuk Sales).
type Bagian = 'helpdesk' | 'wa' | 'noc' | 'tugas' | 'pasang_baru' | 'sales' | 'keuangan' | 'eksekutif'
const URUTAN: Record<string, Bagian[]> = {
  Helpdesk:   ['helpdesk', 'wa', 'tugas', 'noc', 'pasang_baru', 'sales', 'keuangan', 'eksekutif'],
  NOC:        ['noc', 'helpdesk', 'tugas', 'wa', 'pasang_baru', 'sales', 'keuangan', 'eksekutif'],
  Teknisi:    ['tugas', 'helpdesk', 'noc', 'wa', 'pasang_baru', 'sales', 'keuangan', 'eksekutif'],
  Sales:      ['sales', 'pasang_baru', 'tugas', 'wa', 'keuangan', 'eksekutif'],
  'Pre Sales':['pasang_baru', 'sales', 'tugas', 'helpdesk', 'noc', 'wa', 'keuangan', 'eksekutif'],
  Finance:    ['keuangan', 'pasang_baru', 'sales', 'tugas', 'helpdesk', 'wa', 'eksekutif'],
}
const URUTAN_DEFAULT: Bagian[] = ['eksekutif', 'tugas', 'helpdesk', 'noc', 'wa', 'pasang_baru', 'sales', 'keuangan']

const bagian = computed<Bagian[]>(() => {
  if (!d.value) return []
  const urut = URUTAN[d.value.divisi] ?? URUTAN_DEFAULT
  return urut.filter((b) => (b === 'eksekutif' ? d.value.eksekutif : b === 'tugas' ? d.value.tugas_saya : d.value[b]))
})

const aksi = computed(() => [
  { t: 'Tiket', i: '🎫', ke: '/operations', ok: auth.canAccess('operations'), w: 'oranye' },
  { t: 'Inbox WA', i: '💬', ke: '/whatsapp', ok: auth.canAccess('whatsapp'), w: 'hijau' },
  { t: 'Jadwal Visit', i: '🗓️', ke: '/jadwal-visit', ok: auth.canAccess('operations'), w: 'ungu' },
  { t: 'Pasang Baru', i: '🆕', ke: '/pasang-baru', ok: ['sales', 'operations', 'instalasi', 'finance'].some((m) => auth.canAccess(m)), w: 'biru' },
  { t: 'Lead', i: '💼', ke: '/sales/lead', ok: auth.canAccess('sales'), w: 'pink' },
  { t: 'Invoice', i: '💰', ke: '/finance/invoice', ok: auth.canAccess('finance'), w: 'kuning' },
  { t: 'Laporan', i: '📈', ke: '/reports', ok: auth.canAccess('reports'), w: 'toska' },
].filter((a) => a.ok))

// ── Sapaan sesuai waktu, dengan ikon yang ikut berganti ──────────
const jam = new Date().getHours()
const salam = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam'
const ikonWaktu = jam < 6 ? '🌙' : jam < 11 ? '🌤️' : jam < 15 ? '☀️' : jam < 18 ? '🌇' : '🌙'
const namaDepan = computed(() => (auth.user?.nama_lengkap || '').split(' ')[0])
const hariIni = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const KATA = ['Semangat hari ini! 💪', 'Satu per satu, pasti beres ✨', 'Pelanggan senang, kita tenang 😄', 'Jaringan stabil, hati pun stabil 🛰️', 'Kopi dulu, lalu gas! ☕']
const kata = KATA[new Date().getDate() % KATA.length]

// Ringkasan kecil di banner
const pilKilat = computed(() => {
  if (!d.value) return []
  const p: { i: string; t: string; ke: string }[] = []
  const h = d.value.helpdesk
  if (h) p.push({ i: '🎫', t: `${h.open + h.in_progress + h.pending} tiket aktif`, ke: '/operations' })
  if (d.value.wa) p.push({ i: '💬', t: d.value.wa.antrean ? `${d.value.wa.antrean} chat menunggu` : 'Inbox WA tenang', ke: '/whatsapp' })
  if (d.value.noc) p.push({ i: '📡', t: d.value.noc.offline ? `${d.value.noc.offline} router offline` : 'Semua router online', ke: '/nocaas' })
  if (d.value.tugas_saya) p.push({ i: '🧰', t: `${d.value.tugas_saya.wo.length + d.value.tugas_saya.tiket.length} tugas saya`, ke: '/jadwal-visit' })
  return p
})

// ── Format ─────────────────────────────────────────────────────
function umur(t: string) {
  const m = (Date.now() - new Date(t).getTime()) / 60_000
  if (m < 60) return `${Math.max(0, Math.floor(m))} mnt`
  if (m < 1440) return `${Math.floor(m / 60)} jam`
  return `${Math.floor(m / 1440)} hr`
}
function durasi(s: number | null | undefined) {
  if (s == null) return '—'
  if (s < 60) return `${s} dtk`
  if (s < 3600) return `${Math.round(s / 60)} mnt`
  if (s < 86400) return `${(s / 3600).toFixed(1).replace('.', ',')} jam`
  return `${Math.floor(s / 86400)} hr ${Math.round((s % 86400) / 3600)} jam`
}
function rp(n: number) {
  if (!n) return 'Rp 0'
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1)}M`
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1)}jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}
const tglJadwal = (t: string | null, jam: string | null) => (t
  ? new Date(t).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' }) + (jam ? ` ${jam}` : '')
  : 'Antre jadwal')
const tglPendek = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
const tglPanjang = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
const tingkatUmur = (t: string) => { const j = (Date.now() - new Date(t).getTime()) / 3_600_000; return j > 72 ? 'u-merah' : j > 24 ? 'u-oranye' : j > 4 ? 'u-kuning' : 'u-hijau' }

const KATEGORI: Record<string, string> = {
  jalur: 'Jalur NS/UN putus', vpn_macet: 'VPN macet', port_wan_down: 'Port WAN down', port_wan_flap: 'WAN naik-turun', port_lan_flap: 'LAN naik-turun', sering_putus: 'Sering putus',
}
const IKON_KATEGORI: Record<string, string> = { jalur: '🔌', vpn_macet: '🔒', port_wan_down: '🌐', port_wan_flap: '〰️', port_lan_flap: '🔀', sering_putus: '⚡' }
const TAHAP_URUT = ['Draft', 'Sales', 'OPS', 'Network', 'Instalasi', 'NOC', 'Finance']
const IKON_TAHAP: Record<string, string> = { Draft: '📝', Sales: '💼', OPS: '🧭', Network: '🛰️', Instalasi: '🛠️', NOC: '📡', Finance: '💰' }

// ── Data grafik ────────────────────────────────────────────────
const trenTiket = computed(() => {
  const t = d.value?.helpdesk?.tren ?? []
  return {
    label: t.map((x: any) => tglPendek(x.tgl)), panjang: t.map((x: any) => tglPanjang(x.tgl)),
    seri: [
      { nama: 'Dibuka', nilai: t.map((x: any) => x.dibuka), warna: SERI[1] },
      { nama: 'Selesai', nilai: t.map((x: any) => x.selesai), warna: SERI[0] },
    ],
    totalBuka: t.reduce((s: number, x: any) => s + x.dibuka, 0),
    totalSelesai: t.reduce((s: number, x: any) => s + x.selesai, 0),
  }
})
const URUT_PRIORITAS = ['Critical', 'High', 'Medium', 'Low']
const LABEL_PRIORITAS: Record<string, string> = { Critical: 'Kritis', High: 'Tinggi', Medium: 'Sedang', Low: 'Rendah' }
const WARNA_PRIORITAS: Record<string, string> = { Critical: STATUS.kritis, High: STATUS.serius, Medium: STATUS.waspada, Low: '#898781' }
const donatPrioritas = computed(() => {
  const p = d.value?.helpdesk?.per_prioritas ?? []
  return URUT_PRIORITAS.map((k) => ({ nama: LABEL_PRIORITAS[k] ?? k, n: p.find((x: any) => x.k === k)?.n ?? 0, warna: WARNA_PRIORITAS[k] })).filter((x) => x.n)
})
const donatStatusTiket = computed(() => {
  const h = d.value?.helpdesk
  if (!h) return []
  return [
    { nama: 'Open', n: h.open, warna: SERI[1] },
    { nama: 'Diproses', n: h.in_progress, warna: SERI[0] },
    { nama: 'Pending', n: h.pending, warna: SERI[6] },
  ]
})
const sumberTiket = computed(() => (d.value?.helpdesk?.per_sumber ?? []).slice(0, 6).map((x: any) => ({ nama: x.k.replace(/_/g, ' '), n: x.n })))

const jamSekarang = new Date().getHours()
const waPerJam = computed(() => {
  const j = d.value?.wa?.per_jam ?? []
  return {
    label: j.map((x: any) => String(x.jam).padStart(2, '0')),
    panjang: j.map((x: any) => `Pukul ${String(x.jam).padStart(2, '0')}.00–${String(x.jam).padStart(2, '0')}.59`),
    seri: [
      { nama: 'Masuk', nilai: j.map((x: any) => x.masuk), warna: SERI[2] },
      { nama: 'Dibalas', nilai: j.map((x: any) => x.keluar), warna: SERI[0] },
    ],
  }
})
const jamTersibuk = computed(() => {
  const j = d.value?.wa?.per_jam ?? []
  const m = j.reduce((a: any, x: any) => (x.masuk > (a?.masuk ?? -1) ? x : a), null)
  return m && m.masuk ? `${String(m.jam).padStart(2, '0')}.00 (${m.masuk} pesan)` : null
})

const donatRouter = computed(() => {
  const n = d.value?.noc
  if (!n) return []
  return [
    { nama: 'Online', n: n.online, warna: STATUS.baik },
    { nama: 'Sebagian', n: n.partial, warna: STATUS.waspada },
    { nama: 'Offline', n: n.offline, warna: STATUS.kritis },
  ]
})
const pctOnline = computed(() => {
  const n = d.value?.noc
  const tot = n ? n.online + n.partial + n.offline : 0
  return tot ? Math.round((n.online / tot) * 1000) / 10 : 0
})
const gangguanKategori = computed(() => (d.value?.noc?.gangguan ?? []).slice().sort((a: any, b: any) => b.n - a.n)
  .map((g: any) => ({ nama: KATEGORI[g.kategori] ?? g.kategori, ikon: IKON_KATEGORI[g.kategori], n: g.n, ke: '/nocaas/laporan' })))
const totalGangguan = computed(() => (d.value?.noc?.gangguan ?? []).reduce((s: number, g: any) => s + g.n, 0))
const trenGangguan = computed(() => {
  const g = d.value?.noc?.gangguan_7hari ?? []
  return { label: g.map((x: any) => tglPendek(x.tgl)), panjang: g.map((x: any) => tglPanjang(x.tgl)), seri: [{ nama: 'Gangguan baru', nilai: g.map((x: any) => x.n), warna: SERI[7] }] }
})

const funnelPb = computed(() => {
  const o = d.value?.pasang_baru?.order ?? []
  return TAHAP_URUT.map((t) => ({ nama: t, ikon: IKON_TAHAP[t], n: o.find((x: any) => x.tahap === t)?.n ?? 0, ke: '/pasang-baru' }))
})
const totalPb = computed(() => funnelPb.value.reduce((s, x) => s + x.n, 0))
const jumlah = (arr: any[]) => (arr ?? []).reduce((s: number, x: any) => s + x.n, 0)

const funnelSales = computed(() => {
  const s = d.value?.sales
  if (!s) return []
  return [
    { nama: 'Lead aktif', ikon: '🌱', n: s.lead, ke: '/sales/lead' },
    { nama: 'Opportunity', ikon: '🎯', n: s.opportunity, ke: '/sales/opportunity' },
    { nama: 'Quotation draft', ikon: '📄', n: s.quotation_draft, ke: '/sales/quotation' },
  ]
})
</script>

<template>
  <div class="page dsb">
    <!-- ── Banner sapaan ─────────────────────────────────────────── -->
    <header class="hero">
      <span class="hero-gelembung g1" /><span class="hero-gelembung g2" /><span class="hero-gelembung g3" />
      <div class="hero-kiri">
        <div class="hero-eyebrow"><span class="hero-ikon-waktu" aria-hidden="true">{{ ikonWaktu }}</span> Dashboard{{ d?.divisi ? ` · ${d.divisi}` : '' }}</div>
        <h1 class="hero-judul">{{ salam }}, {{ namaDepan }} <span class="hero-lambai" aria-hidden="true">👋</span></h1>
        <p class="hero-kata">{{ kata }}</p>
        <div class="hero-tgl">
          📅 {{ hariIni }}
          <template v-if="jamTerakhir"><span class="hero-titik" :class="{ gagal: gagalPerbarui }" /> {{ gagalPerbarui ? 'Gagal memperbarui · data' : 'Live · diperbarui' }} {{ jamTerakhir }}</template>
        </div>
        <div v-if="pilKilat.length" class="hero-pil">
          <RouterLink v-for="(p, i) in pilKilat" :key="p.ke" :to="p.ke" class="pil" :style="{ animationDelay: `${300 + i * 90}ms` }"><span>{{ p.i }}</span>{{ p.t }}</RouterLink>
        </div>
      </div>
      <nav class="hero-aksi" aria-label="Aksi cepat">
        <button v-for="(a, i) in aksi" :key="a.ke" type="button" :class="['aksi', `aksi-${a.w}`]" :style="{ animationDelay: `${i * 60}ms` }" @click="router.push(a.ke)">
          <span class="aksi-ikon" aria-hidden="true">{{ a.i }}</span>{{ a.t }}
        </button>
      </nav>
    </header>

    <div v-if="memuat" class="dsb-muat"><span class="muat-bola" /><span class="muat-bola" /><span class="muat-bola" /> Menyiapkan dashboard…</div>
    <div v-else-if="error" class="dsb-error">😵 {{ error }} <button type="button" class="aksi aksi-merah" @click="muat()">Coba lagi</button></div>
    <div v-else-if="!bagian.length" class="dsb-kosong"><span class="maskot">🧭</span>Belum ada ringkasan untuk akun ini. Gunakan menu di samping untuk membuka modul Anda.</div>

    <template v-else>
    <template v-for="b in bagian" :key="b">

      <!-- ── Helpdesk: tiket gangguan ─────────────────────────────── -->
      <section v-if="b === 'helpdesk'" class="sek sek-oranye">
        <div class="sek-kepala">
          <h2><span class="sek-ikon">🎫</span>Tiket Gangguan</h2>
          <RouterLink to="/operations" class="sek-link">Semua tiket →</RouterLink>
        </div>
        <div class="kisi-kartu">
          <KartuAngka ikon="🚨" label="Open" :nilai="d.helpdesk.open" ke="/operations?status=Open" nada="merah" :status="d.helpdesk.open ? 'kritis' : null" :urutan="0" />
          <KartuAngka ikon="🔧" label="Diproses" :nilai="d.helpdesk.in_progress" ke="/operations?status=In_Progress" nada="biru" :urutan="1" />
          <KartuAngka ikon="⏸️" label="Pending" :nilai="d.helpdesk.pending" ke="/operations?status=Pending" nada="ungu" :urutan="2" />
          <KartuAngka ikon="📥" label="Dibuka hari ini" :nilai="d.helpdesk.dibuka_hari_ini" :sub="`${d.helpdesk.selesai_hari_ini} selesai hari ini`" nada="oranye" :urutan="3" />
          <KartuAngka v-if="d.helpdesk.saya" ikon="🙋" label="PIC saya" :nilai="d.helpdesk.saya" nada="toska" :urutan="4" />
        </div>
        <div class="kisi-grafik">
          <div class="panel panel-lebar">
            <div class="panel-judul">📈 Tren 14 hari <small>{{ trenTiket.totalBuka }} dibuka · {{ trenTiket.totalSelesai }} selesai</small></div>
            <GrafikTren :label="trenTiket.label" :label-panjang="trenTiket.panjang" :seri="trenTiket.seri" :tinggi="210" />
          </div>
          <div class="panel panel-sla">
            <div class="panel-judul">🏆 SLA bulan ini</div>
            <div class="sla-isi">
              <CincinProgres :persen="d.helpdesk.sla_pct" label="SLA" :ukuran="112" :ambang-baik="99" :ambang-waspada="95" />
              <ul class="sla-rinci">
                <li><b>{{ d.helpdesk.tiket_bulan_ini }}</b> tiket bulan ini</li>
                <li><b :class="{ 'teks-merah': d.helpdesk.sla_breach }">{{ d.helpdesk.sla_breach }}</b> melewati SLA</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="kisi-grafik">
          <div class="panel">
            <div class="panel-judul">🧩 Tiket aktif per status</div>
            <GrafikDonat :data="donatStatusTiket" label-tengah="tiket aktif" />
          </div>
          <div v-if="donatPrioritas.length" class="panel">
            <div class="panel-judul">🔥 Prioritas tiket aktif</div>
            <GrafikDonat :data="donatPrioritas" label-tengah="tiket aktif" />
          </div>
          <div v-if="sumberTiket.length" class="panel">
            <div class="panel-judul">🧭 Sumber tiket bulan ini</div>
            <BatangMendatar :data="sumberTiket" :warna="SERI[1]" />
          </div>
        </div>
        <div class="panel">
          <div class="panel-judul">⏳ Tiket aktif terlama</div>
          <div v-if="!d.helpdesk.daftar.length" class="rayakan"><span class="maskot">🦸</span>Tidak ada tiket aktif. Mantap!</div>
          <RouterLink v-for="t in d.helpdesk.daftar" :key="t.id_ticket" :to="`/operations/${t.id_ticket}`" class="baris">
            <span class="umur" :class="tingkatUmur(t.tgl_open)">{{ umur(t.tgl_open) }}</span>
            <span class="isi"><b>{{ t.site?.nama_site }}</b> · {{ t.judul_tiket }}<small>{{ t.nomor_tiket }} · {{ t.site?.pelanggan?.nama_pelanggan }}<template v-if="t.teknisi"> · 👷 {{ t.teknisi.nama_lengkap }}</template></small></span>
            <span class="lencana" :class="t.status_tiket">{{ t.status_tiket.replace('_', ' ') }}</span>
          </RouterLink>
        </div>
      </section>

      <!-- ── WhatsApp helpdesk ────────────────────────────────────── -->
      <section v-else-if="b === 'wa'" class="sek sek-hijau">
        <div class="sek-kepala">
          <h2><span class="sek-ikon">💬</span>WhatsApp Helpdesk · hari ini</h2>
          <span class="sek-link"><RouterLink to="/whatsapp/statistik">Statistik</RouterLink> · <RouterLink to="/whatsapp">Inbox →</RouterLink></span>
        </div>
        <div class="kisi-kartu">
          <KartuAngka ikon="⏰" label="Menunggu balasan" :nilai="d.wa.antrean" ke="/whatsapp" :nada="d.wa.antrean ? 'merah' : 'hijau'" :status="d.wa.antrean ? 'kritis' : 'baik'" :urutan="0" />
          <KartuAngka ikon="📬" label="Chat belum dibaca" :nilai="d.wa.belum_dibaca" ke="/whatsapp" nada="kuning" :urutan="1" />
          <KartuAngka ikon="📨" label="Pesan masuk" :nilai="d.wa.masuk" :sub="`${d.wa.keluar} dibalas · ${d.wa.chat_aktif} chat`" nada="hijau" :urutan="2" />
          <KartuAngka ikon="⚡" label="Median respons" :nilai="d.wa.respon_median ?? 0" :format="() => durasi(d.wa.respon_median)" nada="toska" :urutan="3" />
          <KartuAngka v-if="d.wa.saya || d.wa.pic_saya" ikon="🙋" label="Balasan saya" :nilai="d.wa.saya?.pesan ?? 0" :sub="`respons ${durasi(d.wa.saya?.respon_median)} · PIC ${d.wa.pic_saya} chat`" nada="biru" :urutan="4" />
        </div>
        <div class="kisi-grafik">
          <div class="panel panel-lebar">
            <div class="panel-judul">💓 Detak inbox per jam <small v-if="jamTersibuk">tersibuk pukul {{ jamTersibuk }}</small></div>
            <GrafikBatang :label="waPerJam.label" :label-panjang="waPerJam.panjang" :seri="waPerJam.seri" :sorot="jamSekarang" :tinggi="200" />
          </div>
          <div class="panel panel-sla">
            <div class="panel-judul">🚀 Dibalas ≤ 15 menit</div>
            <div class="sla-isi">
              <CincinProgres :persen="(d.wa.pct_15menit ?? 0) * 100" label="cepat" :ukuran="112" :ambang-baik="80" :ambang-waspada="60" />
              <ul class="sla-rinci">
                <li><b>{{ d.wa.dibalas }}</b> chat dibalas</li>
                <li><b :class="{ 'teks-merah': d.wa.tidak_dibalas }">{{ d.wa.tidak_dibalas }}</b> belum dibalas</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-judul">🐢 Paling lama menunggu</div>
          <div v-if="!d.wa.daftar_antrean.length" class="rayakan"><span class="maskot">😴</span>Inbox tenang — semua chat sudah dibalas.</div>
          <RouterLink v-for="c in d.wa.daftar_antrean" :key="c.id_chat" to="/whatsapp" class="baris">
            <span class="umur u-merah">{{ durasi(c.tunggu_detik) }}</span>
            <span class="isi"><b>{{ c.is_grup ? '👥 ' : '' }}{{ c.nama }}</b><small>{{ c.terakhir || '(media)' }}<template v-if="c.pic"> · PIC {{ c.pic }}</template></small></span>
            <span class="lencana">{{ c.jumlah }} pesan</span>
          </RouterLink>
        </div>
      </section>

      <!-- ── NOC: status jaringan ─────────────────────────────────── -->
      <section v-else-if="b === 'noc'" class="sek sek-biru">
        <div class="sek-kepala">
          <h2><span class="sek-ikon sek-ikon-putar">🛰️</span>Jaringan &amp; Lapangan</h2>
          <span class="sek-link"><RouterLink to="/nocaas/laporan">Laporan gangguan</RouterLink> · <RouterLink to="/nocaas">NOCaaS →</RouterLink></span>
        </div>
        <div class="kisi-kartu">
          <KartuAngka ikon="📴" label="Router offline" :nilai="d.noc.offline" ke="/nocaas" nada="merah" :status="d.noc.offline ? 'kritis' : 'baik'" :sub="`${d.noc.online.toLocaleString('id-ID')} online · ${d.noc.partial} sebagian`" :urutan="0" />
          <KartuAngka ikon="⚠️" label="Gangguan aktif" :nilai="totalGangguan" ke="/nocaas/laporan" nada="kuning" :urutan="1" />
          <KartuAngka ikon="🚐" label="Visit hari ini" :nilai="d.noc.visit_hari_ini" ke="/jadwal-visit" :sub="`${d.noc.antre_visit} antre jadwal`" nada="ungu" :urutan="2" />
          <KartuAngka ikon="🗂️" label="Work order aktif" :nilai="d.noc.wo_aktif" ke="/public-wo" nada="biru" :urutan="3" />
        </div>
        <div class="kisi-grafik">
          <div class="panel">
            <div class="panel-judul">🌐 Status router pelanggan <small>{{ pctOnline }}% online</small></div>
            <GrafikDonat :data="donatRouter" label-tengah="router" :ukuran="160" />
          </div>
          <div class="panel">
            <div class="panel-judul">📉 Gangguan baru 7 hari</div>
            <GrafikBatang :label="trenGangguan.label" :label-panjang="trenGangguan.panjang" :seri="trenGangguan.seri" :tinggi="180" />
          </div>
          <div class="panel">
            <div class="panel-judul">🧯 Gangguan aktif per jenis</div>
            <div v-if="!gangguanKategori.length" class="rayakan"><span class="maskot">🌈</span>Tidak ada gangguan aktif.</div>
            <BatangMendatar v-else :data="gangguanKategori" :warna="SERI[7]" />
          </div>
        </div>
        <div v-if="d.noc.offline_terbaru.length" class="panel">
          <div class="panel-judul">🔴 Baru offline</div>
          <RouterLink v-for="r in d.noc.offline_terbaru" :key="r.site_key" to="/nocaas" class="baris">
            <span class="umur u-merah"><span class="titik-denyut" />{{ umur(r.status_sejak) }}</span>
            <span class="isi"><b>{{ r.site?.nama_site ?? r.site_key }}</b><small>{{ r.site?.pelanggan?.nama_pelanggan }}</small></span>
          </RouterLink>
        </div>
      </section>

      <!-- ── Tugas saya (WO & tiket yang saya pegang) ─────────────── -->
      <section v-else-if="b === 'tugas'" class="sek sek-ungu">
        <div class="sek-kepala">
          <h2><span class="sek-ikon">🧰</span>Tugas Saya</h2>
          <RouterLink to="/jadwal-visit" class="sek-link">Jadwal visit →</RouterLink>
        </div>
        <div class="kisi-kartu kisi-kecil">
          <KartuAngka ikon="🚐" label="Work order saya" :nilai="d.tugas_saya.wo.length" ke="/jadwal-visit" nada="ungu" />
          <KartuAngka ikon="🎫" label="Tiket saya" :nilai="d.tugas_saya.tiket.length" ke="/operations" nada="oranye" :urutan="1" />
        </div>
        <div class="panel lini-masa">
          <RouterLink v-for="w in d.tugas_saya.wo" :key="'w' + w.id_wo" to="/jadwal-visit" class="baris">
            <span class="chip-tgl">🗓️ {{ tglJadwal(w.tgl_jadwal, w.jam_jadwal) }}</span>
            <span class="isi"><b>{{ w.site?.nama_site }}</b><template v-if="w.site?.kota"> · {{ w.site.kota }}</template><small>{{ w.nomor_wo }} · {{ (w.deskripsi_tugas || '').slice(0, 90) }}</small></span>
            <span class="lencana">{{ w.status_wo.replace('_', ' ') }}</span>
          </RouterLink>
          <RouterLink v-for="t in d.tugas_saya.tiket" :key="'t' + t.id_ticket" :to="`/operations/${t.id_ticket}`" class="baris">
            <span class="umur" :class="tingkatUmur(t.tgl_open)">{{ umur(t.tgl_open) }}</span>
            <span class="isi"><b>{{ t.site?.nama_site }}</b> · {{ t.judul_tiket }}<small>{{ t.nomor_tiket }}</small></span>
            <span class="lencana" :class="t.status_tiket">{{ t.status_tiket.replace('_', ' ') }}</span>
          </RouterLink>
        </div>
      </section>

      <!-- ── Pasang baru ──────────────────────────────────────────── -->
      <section v-else-if="b === 'pasang_baru'" class="sek sek-toska">
        <div class="sek-kepala">
          <h2><span class="sek-ikon">🆕</span>Pasang Baru</h2>
          <RouterLink to="/pasang-baru" class="sek-link">Buka →</RouterLink>
        </div>
        <div class="kisi-kartu">
          <KartuAngka ikon="🔍" label="Survey berjalan" :nilai="jumlah(d.pasang_baru.survey)" ke="/pasang-baru" :sub="d.pasang_baru.survey.map((x: any) => `${x.n} ${x.status}`).join(' · ') || '—'" nada="toska" />
          <KartuAngka ikon="✍️" label="SPH belum disetujui" :nilai="jumlah(d.pasang_baru.sph)" ke="/pasang-baru" :sub="d.pasang_baru.sph.map((x: any) => `${x.n} ${x.status}`).join(' · ') || '—'" nada="kuning" :urutan="1" />
          <KartuAngka ikon="🚀" label="Order berjalan" :nilai="totalPb" ke="/pasang-baru" nada="biru" :urutan="2" />
          <KartuAngka v-if="d.pasang_baru.survey_saya || d.pasang_baru.sph_saya" ikon="🙋" label="Milik saya" :nilai="d.pasang_baru.survey_saya + d.pasang_baru.sph_saya" :sub="`${d.pasang_baru.survey_saya} survey · ${d.pasang_baru.sph_saya} SPH`" nada="pink" :urutan="3" />
        </div>
        <div class="panel">
          <div class="panel-judul">🛤️ Order per tahap <small>dari Draft sampai Finance</small></div>
          <div v-if="!totalPb" class="rayakan"><span class="maskot">🌱</span>Belum ada order berjalan.</div>
          <BatangMendatar v-else :data="funnelPb" bertahap />
        </div>
      </section>

      <!-- ── Sales ────────────────────────────────────────────────── -->
      <section v-else-if="b === 'sales'" class="sek sek-pink">
        <div class="sek-kepala">
          <h2><span class="sek-ikon">💼</span>Sales</h2>
          <RouterLink to="/sales" class="sek-link">Buka →</RouterLink>
        </div>
        <div class="kisi-kartu">
          <KartuAngka ikon="🌱" label="Lead saya" :nilai="d.sales.lead_saya" ke="/sales/lead" :sub="`${d.sales.lead} lead aktif tim`" nada="hijau" />
          <KartuAngka ikon="🎯" label="Opportunity saya" :nilai="d.sales.opportunity_saya" ke="/sales/opportunity" :sub="`${d.sales.opportunity} terbuka tim`" nada="pink" :urutan="1" />
          <KartuAngka ikon="📄" label="Quotation draft saya" :nilai="d.sales.quotation_saya" ke="/sales/quotation" :sub="`${d.sales.quotation_draft} draft tim`" nada="ungu" :urutan="2" />
        </div>
        <div class="panel">
          <div class="panel-judul">🪜 Corong penjualan tim</div>
          <div v-if="!funnelSales.some((x) => x.n)" class="rayakan"><span class="maskot">🌱</span>Belum ada lead, opportunity, atau quotation terbuka.</div>
          <BatangMendatar v-else :data="funnelSales" bertahap />
        </div>
      </section>

      <!-- ── Keuangan ─────────────────────────────────────────────── -->
      <section v-else-if="b === 'keuangan'" class="sek sek-kuning">
        <div class="sek-kepala">
          <h2><span class="sek-ikon">💰</span>Keuangan</h2>
          <RouterLink to="/finance" class="sek-link">Buka →</RouterLink>
        </div>
        <div class="kisi-kartu">
          <KartuAngka ikon="⏰" label="Invoice jatuh tempo" :nilai="d.keuangan.invoice_overdue" ke="/finance/invoice" :sub="rp(d.keuangan.nilai_overdue)" nada="merah" :status="d.keuangan.invoice_overdue ? 'kritis' : 'baik'" />
          <KartuAngka ikon="💵" label="MRC aktif / bulan" :nilai="d.keuangan.mrc_aktif" :format="rp" ke="/contracts" :sub="`${d.keuangan.kontrak_aktif} kontrak aktif`" nada="hijau" :urutan="1" />
          <KartuAngka ikon="📆" label="Kontrak berakhir ≤ 30 hr" :nilai="d.keuangan.kontrak_berakhir_30" ke="/contracts" nada="kuning" :urutan="2" />
        </div>
      </section>

      <!-- ── Ringkasan perusahaan (akses Laporan) ─────────────────── -->
      <section v-else-if="b === 'eksekutif'" class="sek sek-ungu">
        <div class="sek-kepala">
          <h2><span class="sek-ikon">🏢</span>Ringkasan Perusahaan</h2>
          <RouterLink to="/reports" class="sek-link">Laporan →</RouterLink>
        </div>
        <DashEksekutif />
      </section>

    </template>
    <p class="kaki">✨ Dashboard diperbarui otomatis tiap menit · <AngkaNaik :nilai="bagian.length" /> bagian untuk Anda</p>
    </template>
  </div>
</template>

<style scoped>
.dsb { box-sizing: border-box; }

/* ── Banner ─────────────────────────────────────────────────────── */
.hero {
  position: relative; overflow: hidden; display: flex; justify-content: space-between; gap: 18px; flex-wrap: wrap;
  padding: 22px 24px; margin-bottom: 22px; border-radius: 22px; color: #fff;
  background: linear-gradient(120deg, #2a78d6, #6250d6 35%, #e87ba4 70%, #eb6834);
  background-size: 260% 260%; animation: hero-geser 16s ease-in-out infinite;
  box-shadow: 0 14px 34px rgba(98, 80, 214, .25);
}
.hero-gelembung { position: absolute; border-radius: 50%; background: rgba(255, 255, 255, .14); pointer-events: none; }
.g1 { width: 180px; height: 180px; right: -40px; top: -70px; animation: melayang 9s ease-in-out infinite; }
.g2 { width: 90px; height: 90px; right: 28%; bottom: -40px; animation: melayang 7s ease-in-out infinite reverse; }
.g3 { width: 46px; height: 46px; left: 46%; top: 14px; animation: melayang 6s ease-in-out infinite; }
.hero-kiri { position: relative; min-width: 0; flex: 1 1 340px; }
.hero-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; opacity: .9; display: flex; align-items: center; gap: 6px; }
.hero-ikon-waktu { font-size: 18px; display: inline-block; animation: memantul 2.4s ease-in-out infinite; }
.hero-judul { margin: 6px 0 2px; font-size: 27px; font-weight: 800; letter-spacing: -.02em; overflow-wrap: anywhere; }
.hero-lambai { display: inline-block; transform-origin: 70% 80%; animation: melambai 2.6s ease-in-out infinite; }
.hero-kata { margin: 0 0 8px; font-size: 14px; opacity: .95; }
.hero-tgl { font-size: 12.5px; opacity: .92; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hero-titik { width: 8px; height: 8px; border-radius: 50%; background: #7dffb0; box-shadow: 0 0 0 0 rgba(125, 255, 176, .7); animation: denyut 2s infinite; margin-left: 6px; }
.hero-titik.gagal { background: #ffd166; animation: none; }
.hero-pil { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.pil { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 99px; background: rgba(255, 255, 255, .2); color: #fff; font-size: 12.5px; font-weight: 700; text-decoration: none; backdrop-filter: blur(4px); animation: muncul-naik .5s both; transition: background .2s, transform .2s; }
.pil:hover { background: rgba(255, 255, 255, .32); transform: translateY(-2px); }
.hero-aksi { position: relative; display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start; justify-content: flex-end; flex: 0 1 380px; }
.aksi { display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px; border-radius: 12px; border: 0; background: #fff; color: #1f1f1d; font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 0, 0, .12); animation: muncul-naik .45s both; transition: transform .18s cubic-bezier(.2, .9, .3, 1.4); }
.aksi:hover { transform: translateY(-2px) rotate(-1.5deg); }
.aksi:hover .aksi-ikon { animation: goyang .5s; }
.aksi-ikon { display: inline-block; font-size: 15px; }
.aksi-oranye { box-shadow: inset 0 -3px 0 #eb6834, 0 4px 12px rgba(0, 0, 0, .12); }
.aksi-hijau { box-shadow: inset 0 -3px 0 #1baf7a, 0 4px 12px rgba(0, 0, 0, .12); }
.aksi-ungu { box-shadow: inset 0 -3px 0 #6250d6, 0 4px 12px rgba(0, 0, 0, .12); }
.aksi-biru { box-shadow: inset 0 -3px 0 #2a78d6, 0 4px 12px rgba(0, 0, 0, .12); }
.aksi-pink { box-shadow: inset 0 -3px 0 #e87ba4, 0 4px 12px rgba(0, 0, 0, .12); }
.aksi-kuning { box-shadow: inset 0 -3px 0 #eda100, 0 4px 12px rgba(0, 0, 0, .12); }
.aksi-toska { box-shadow: inset 0 -3px 0 #0e9fb3, 0 4px 12px rgba(0, 0, 0, .12); }
.aksi-merah { background: #d03b3b; color: #fff; }

/* ── Status muat ───────────────────────────────────────────────── */
.dsb-muat, .dsb-kosong { padding: 48px; text-align: center; color: #6b6a65; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
.muat-bola { width: 10px; height: 10px; border-radius: 50%; background: #2a78d6; animation: lompat 1s infinite ease-in-out; }
.muat-bola:nth-child(2) { background: #eb6834; animation-delay: .15s; }
.muat-bola:nth-child(3) { background: #1baf7a; animation-delay: .3s; }
.dsb-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 14px; padding: 14px 18px; color: #b91c1c; font-size: 14px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

/* ── Bagian ────────────────────────────────────────────────────── */
.sek { --a: #2a78d6; --a2: #e8f1fd; position: relative; margin-bottom: 26px; padding: 18px; border-radius: 22px; background: linear-gradient(180deg, var(--a2), #fff 140px); border: 1px solid color-mix(in srgb, var(--a) 14%, #fff); animation: muncul-naik .5s both; }
.sek-oranye { --a: #eb6834; --a2: #fff1ea; }
.sek-hijau { --a: #1baf7a; --a2: #e7f8f1; }
.sek-biru { --a: #2a78d6; --a2: #eaf2fd; }
.sek-ungu { --a: #6250d6; --a2: #f0eefd; }
.sek-toska { --a: #0e9fb3; --a2: #e4f7fa; }
.sek-pink { --a: #e87ba4; --a2: #fdeef4; }
.sek-kuning { --a: #eda100; --a2: #fef6e0; }
.sek-kepala { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.sek-kepala h2 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 17px; font-weight: 800; color: #1f1f1d; letter-spacing: -.01em; }
.sek-ikon { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; font-size: 19px; background: var(--a); box-shadow: 0 6px 14px color-mix(in srgb, var(--a) 35%, transparent); transition: transform .3s cubic-bezier(.2, .9, .3, 1.5); }
.sek:hover .sek-ikon { transform: rotate(-10deg) scale(1.08); }
.sek-ikon-putar { animation: orbit 6s linear infinite; }
.sek-link, .sek-link a { font-size: 12.5px; font-weight: 700; color: color-mix(in srgb, var(--a) 80%, #000); text-decoration: none; }
.sek-link a:hover, a.sek-link:hover { text-decoration: underline; }

.kisi-kartu { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 14px; }
.kisi-kecil { grid-template-columns: repeat(auto-fill, minmax(170px, 230px)); }
.kisi-grafik { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 14px; }
.panel { background: #fff; border: 1px solid #ecebe6; border-radius: 18px; padding: 14px 16px; min-width: 0; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); transition: box-shadow .2s; }
.panel:hover { box-shadow: 0 8px 22px rgba(15, 23, 42, .07); }
.panel-lebar { grid-column: span 2; }
.panel-judul { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 13.5px; font-weight: 800; color: #1f1f1d; margin-bottom: 10px; }
.panel-judul small { font-size: 11.5px; font-weight: 600; color: #6b6a65; }
.sla-isi { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.sla-rinci { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #52514e; }
.sla-rinci b { font-size: 16px; color: #0b0b0b; margin-right: 4px; font-variant-numeric: tabular-nums; }
.teks-merah { color: #d03b3b !important; }

/* ── Daftar ───────────────────────────────────────────────────── */
.baris { display: flex; align-items: center; gap: 12px; padding: 8px 6px; color: inherit; text-decoration: none; border-top: 1px dashed #ecebe6; border-radius: 10px; transition: background .15s, transform .15s; }
.panel-judul + .baris, .lini-masa .baris:first-child { border-top: none; }
.baris:hover { background: #f8f7f4; transform: translateX(3px); }
.umur { flex: 0 0 auto; min-width: 66px; text-align: center; font-size: 11.5px; font-weight: 800; padding: 4px 8px; border-radius: 99px; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
.u-hijau { background: #e3f6e3; color: #0a6e0a; }
.u-kuning { background: #fdf3d9; color: #8a5d00; }
.u-oranye { background: #fdeee6; color: #b4471b; }
.u-merah { background: #fde8e8; color: #b42323; }
.chip-tgl { flex: 0 0 auto; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 99px; background: #efedfc; color: #4b3cb8; }
.isi { flex: 1; min-width: 0; font-size: 13px; color: #0b0b0b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.isi small { display: block; font-size: 11.5px; color: #6b6a65; overflow: hidden; text-overflow: ellipsis; }
.lencana { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; background: #f1f0ec; color: #52514e; }
.lencana.Open { background: #fde8e8; color: #b42323; }
.lencana.In_Progress { background: #e8f1fd; color: #1c5cab; }
.lencana.Pending { background: #efedfc; color: #4b3cb8; }
.titik-denyut { width: 7px; height: 7px; border-radius: 50%; background: #d03b3b; animation: denyut-merah 1.6s infinite; }

.rayakan { display: flex; align-items: center; gap: 10px; padding: 14px 6px; color: #52514e; font-size: 13.5px; font-weight: 600; }
.maskot { font-size: 30px; display: inline-block; animation: memantul 2s ease-in-out infinite; }
.kaki { text-align: center; font-size: 12px; color: #898781; margin: 4px 0 10px; }

/* ── Animasi ──────────────────────────────────────────────────── */
@keyframes hero-geser { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes melayang { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-12px, 10px); } }
@keyframes memantul { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes melambai { 0%, 60%, 100% { transform: rotate(0); } 10%, 30% { transform: rotate(16deg); } 20%, 40% { transform: rotate(-8deg); } }
@keyframes denyut { 0% { box-shadow: 0 0 0 0 rgba(125, 255, 176, .7); } 70% { box-shadow: 0 0 0 9px rgba(125, 255, 176, 0); } 100% { box-shadow: 0 0 0 0 rgba(125, 255, 176, 0); } }
@keyframes denyut-merah { 0% { box-shadow: 0 0 0 0 rgba(208, 59, 59, .6); } 70% { box-shadow: 0 0 0 7px rgba(208, 59, 59, 0); } 100% { box-shadow: 0 0 0 0 rgba(208, 59, 59, 0); } }
@keyframes muncul-naik { from { opacity: 0; transform: translateY(12px); } }
@keyframes goyang { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-16deg) scale(1.15); } 65% { transform: rotate(12deg) scale(1.15); } }
@keyframes orbit { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg) translateY(-2px); } }
@keyframes lompat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
@media (prefers-reduced-motion: reduce) {
  .hero, .hero *, .sek, .sek *, .muat-bola, .maskot, .pil, .aksi { animation: none !important; transition: none !important; }
}

@media (max-width: 900px) { .panel-lebar { grid-column: auto; } }
@media (max-width: 640px) {
  .hero { padding: 18px 16px; border-radius: 18px; }
  .hero-judul { font-size: 22px; }
  .hero-aksi { justify-content: flex-start; flex-basis: 100%; }
  .sek { padding: 14px 12px; border-radius: 18px; }
  .kisi-kartu { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  .lencana { display: none; }
  .umur { min-width: 56px; }
}
</style>
