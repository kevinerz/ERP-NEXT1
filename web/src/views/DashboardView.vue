<script setup lang="ts">
// Dashboard per akun: bagian yang tampil & urutannya mengikuti modul akses dan divisi user
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import DashEksekutif from './dashboard/DashEksekutif.vue'

const router = useRouter()
const auth = useAuthStore()

const d = ref<any>(null)
const memuat = ref(true)
const error = ref('')

async function muat(diam = false) {
  if (!diam) memuat.value = true
  try {
    const r = await api.get('/dashboard/saya')
    d.value = r.data.data
    error.value = ''
  } catch (e: any) {
    if (!diam) error.value = e.response?.data?.message || 'Gagal memuat dashboard'
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
  { t: 'Tiket', ke: '/operations', ok: auth.canAccess('operations') },
  { t: 'Inbox WA', ke: '/whatsapp', ok: auth.canAccess('whatsapp') },
  { t: 'Jadwal Visit', ke: '/jadwal-visit', ok: auth.canAccess('operations') },
  { t: 'Pasang Baru', ke: '/pasang-baru', ok: ['sales', 'operations', 'instalasi', 'finance'].some((m) => auth.canAccess(m)) },
  { t: 'Lead', ke: '/sales/lead', ok: auth.canAccess('sales') },
  { t: 'Invoice', ke: '/finance/invoice', ok: auth.canAccess('finance') },
  { t: 'Laporan', ke: '/reports', ok: auth.canAccess('reports') },
].filter((a) => a.ok))

const salam = computed(() => {
  const h = new Date().getHours()
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
})
const hariIni = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

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
  return `${(s / 3600).toFixed(1)} jam`
}
function rp(n: number) {
  if (!n) return 'Rp 0'
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1)}M`
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1)}jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}
const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const tglJadwal = (t: string | null, jam: string | null) => (t
  ? new Date(t).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' }) + (jam ? ` ${jam}` : '')
  : 'Antre jadwal')

const KATEGORI: Record<string, string> = {
  jalur: 'Jalur NS/UN putus', vpn_macet: 'VPN macet', port_wan_down: 'Port WAN down', port_wan_flap: 'WAN naik-turun', port_lan_flap: 'LAN naik-turun', sering_putus: 'Sering putus',
}
const TAHAP_URUT = ['Draft', 'Sales', 'OPS', 'Network', 'Instalasi', 'NOC', 'Finance']
const orderPb = computed(() => {
  const o = d.value?.pasang_baru?.order ?? []
  return TAHAP_URUT.map((t) => ({ tahap: t, n: o.find((x: any) => x.tahap === t)?.n ?? 0 })).filter((x) => x.n)
})
const totalPb = computed(() => orderPb.value.reduce((s, x) => s + x.n, 0))
const slaWarna = (v: number) => (v >= 99 ? 'hijau' : v >= 95 ? 'kuning' : 'merah')
</script>

<template>
  <div class="page dsb">
    <div class="dsb-head">
      <div>
        <div class="dsb-eyebrow">Dashboard{{ d?.divisi ? ` · ${d.divisi}` : '' }}</div>
        <h1 class="dsb-title">{{ salam }}, <span>{{ auth.user?.nama_lengkap }}</span></h1>
        <div class="dsb-date">{{ hariIni }}</div>
      </div>
      <div class="dsb-aksi">
        <button v-for="a in aksi" :key="a.ke" type="button" class="dsb-btn" @click="router.push(a.ke)">{{ a.t }}</button>
      </div>
    </div>

    <div v-if="memuat" class="dsb-muat">Memuat dashboard…</div>
    <div v-else-if="error" class="dsb-error">{{ error }}</div>
    <div v-else-if="!bagian.length" class="dsb-kosong">Belum ada ringkasan untuk akun ini. Gunakan menu di samping untuk membuka modul Anda.</div>

    <template v-else>
    <template v-for="b in bagian" :key="b">

      <!-- ── Helpdesk: tiket gangguan ─────────────────────────────── -->
      <section v-if="b === 'helpdesk'" class="dsb-sec">
        <div class="dsb-sec-head"><h2>Tiket Gangguan</h2><RouterLink to="/operations">Semua tiket →</RouterLink></div>
        <div class="dsb-tiles">
          <RouterLink to="/operations" class="tile"><b :class="d.helpdesk.open ? 'merah' : ''">{{ d.helpdesk.open }}</b><span>Open</span></RouterLink>
          <RouterLink to="/operations" class="tile"><b>{{ d.helpdesk.in_progress }}</b><span>Diproses</span></RouterLink>
          <RouterLink to="/operations" class="tile"><b>{{ d.helpdesk.pending }}</b><span>Pending</span></RouterLink>
          <div class="tile"><b>{{ d.helpdesk.dibuka_hari_ini }}</b><span>Dibuka hari ini</span><small>{{ d.helpdesk.selesai_hari_ini }} selesai hari ini</small></div>
          <div class="tile"><b :class="slaWarna(d.helpdesk.sla_pct)">{{ d.helpdesk.sla_pct }}%</b><span>SLA bulan ini</span><small>{{ d.helpdesk.sla_breach }} breach · {{ d.helpdesk.tiket_bulan_ini }} tiket</small></div>
          <div v-if="d.helpdesk.saya" class="tile"><b class="biru">{{ d.helpdesk.saya }}</b><span>PIC saya</span></div>
        </div>
        <div class="card">
          <div class="card-title">Tiket aktif terlama</div>
          <div v-if="!d.helpdesk.daftar.length" class="muted pad">Tidak ada tiket aktif. 👍</div>
          <RouterLink v-for="t in d.helpdesk.daftar" :key="t.id_ticket" :to="`/operations/${t.id_ticket}`" class="baris">
            <span class="umur" :class="{ merah: t.sla_breached }">{{ umur(t.tgl_open) }}</span>
            <span class="isi"><b>{{ t.site?.nama_site }}</b> · {{ t.judul_tiket }}<small>{{ t.nomor_tiket }} · {{ t.site?.pelanggan?.nama_pelanggan }}<template v-if="t.teknisi"> · 👷 {{ t.teknisi.nama_lengkap }}</template></small></span>
            <span class="lencana" :class="t.status_tiket">{{ t.status_tiket.replace('_', ' ') }}</span>
          </RouterLink>
        </div>
      </section>

      <!-- ── WhatsApp helpdesk ────────────────────────────────────── -->
      <section v-else-if="b === 'wa'" class="dsb-sec">
        <div class="dsb-sec-head"><h2>WhatsApp Helpdesk · hari ini</h2><span><RouterLink to="/whatsapp/statistik">Statistik</RouterLink> · <RouterLink to="/whatsapp">Inbox →</RouterLink></span></div>
        <div class="dsb-tiles">
          <RouterLink to="/whatsapp" class="tile"><b :class="d.wa.antrean ? 'merah' : 'hijau'">{{ d.wa.antrean }}</b><span>Menunggu balasan</span></RouterLink>
          <RouterLink to="/whatsapp" class="tile"><b>{{ d.wa.belum_dibaca }}</b><span>Chat belum dibaca</span></RouterLink>
          <div class="tile"><b>{{ d.wa.masuk }}</b><span>Pesan masuk</span><small>{{ d.wa.keluar }} keluar · {{ d.wa.chat_aktif }} chat</small></div>
          <div class="tile"><b>{{ durasi(d.wa.respon_median) }}</b><span>Median respons</span><small>{{ pct(d.wa.pct_15menit) }} dibalas ≤ 15 mnt</small></div>
          <div v-if="d.wa.saya || d.wa.pic_saya" class="tile"><b class="biru">{{ d.wa.saya?.pesan ?? 0 }}</b><span>Balasan saya</span><small>respons {{ durasi(d.wa.saya?.respon_median) }} · PIC {{ d.wa.pic_saya }} chat</small></div>
        </div>
        <div v-if="d.wa.daftar_antrean.length" class="card">
          <div class="card-title">Paling lama menunggu</div>
          <RouterLink v-for="c in d.wa.daftar_antrean" :key="c.id_chat" to="/whatsapp" class="baris">
            <span class="umur merah">{{ durasi(c.tunggu_detik) }}</span>
            <span class="isi"><b>{{ c.is_grup ? '👥 ' : '' }}{{ c.nama }}</b><small>{{ c.terakhir || '(media)' }}<template v-if="c.pic"> · PIC {{ c.pic }}</template></small></span>
            <span class="lencana">{{ c.jumlah }} pesan</span>
          </RouterLink>
        </div>
      </section>

      <!-- ── NOC: status jaringan ─────────────────────────────────── -->
      <section v-else-if="b === 'noc'" class="dsb-sec">
        <div class="dsb-sec-head"><h2>Jaringan &amp; Lapangan</h2><span><RouterLink to="/nocaas/laporan">Laporan gangguan</RouterLink> · <RouterLink to="/nocaas">NOCaaS →</RouterLink></span></div>
        <div class="dsb-tiles">
          <RouterLink to="/nocaas" class="tile"><b :class="d.noc.offline ? 'merah' : ''">{{ d.noc.offline }}</b><span>Router offline</span><small>{{ d.noc.online.toLocaleString('id-ID') }} online · {{ d.noc.partial }} sebagian</small></RouterLink>
          <RouterLink to="/nocaas/laporan" class="tile"><b :class="d.noc.gangguan.length ? 'kuning' : ''">{{ d.noc.gangguan.reduce((s: number, g: any) => s + g.n, 0) }}</b><span>Gangguan aktif</span>
            <small>{{ d.noc.gangguan.map((g: any) => `${g.n} ${KATEGORI[g.kategori] ?? g.kategori}`).join(' · ') || 'tidak ada' }}</small></RouterLink>
          <RouterLink to="/jadwal-visit" class="tile"><b>{{ d.noc.visit_hari_ini }}</b><span>Visit hari ini</span><small>{{ d.noc.antre_visit }} antre jadwal</small></RouterLink>
          <RouterLink to="/jadwal-visit" class="tile"><b>{{ d.noc.wo_aktif }}</b><span>Work order aktif</span></RouterLink>
        </div>
        <div v-if="d.noc.offline_terbaru.length" class="card">
          <div class="card-title">Baru offline</div>
          <RouterLink v-for="r in d.noc.offline_terbaru" :key="r.site_key" to="/nocaas" class="baris">
            <span class="umur merah">{{ umur(r.status_sejak) }}</span>
            <span class="isi"><b>{{ r.site?.nama_site ?? r.site_key }}</b><small>{{ r.site?.pelanggan?.nama_pelanggan }}</small></span>
          </RouterLink>
        </div>
      </section>

      <!-- ── Tugas saya (WO & tiket yang saya pegang) ─────────────── -->
      <section v-else-if="b === 'tugas'" class="dsb-sec">
        <div class="dsb-sec-head"><h2>Tugas Saya</h2><RouterLink to="/jadwal-visit">Jadwal visit →</RouterLink></div>
        <div class="card">
          <RouterLink v-for="w in d.tugas_saya.wo" :key="'w' + w.id_wo" to="/jadwal-visit" class="baris">
            <span class="umur">{{ tglJadwal(w.tgl_jadwal, w.jam_jadwal) }}</span>
            <span class="isi"><b>{{ w.site?.nama_site }}</b><template v-if="w.site?.kota"> · {{ w.site.kota }}</template><small>{{ w.nomor_wo }} · {{ (w.deskripsi_tugas || '').slice(0, 90) }}</small></span>
            <span class="lencana">{{ w.status_wo.replace('_', ' ') }}</span>
          </RouterLink>
          <RouterLink v-for="t in d.tugas_saya.tiket" :key="'t' + t.id_ticket" :to="`/operations/${t.id_ticket}`" class="baris">
            <span class="umur">{{ umur(t.tgl_open) }}</span>
            <span class="isi"><b>{{ t.site?.nama_site }}</b> · {{ t.judul_tiket }}<small>{{ t.nomor_tiket }}</small></span>
            <span class="lencana" :class="t.status_tiket">{{ t.status_tiket.replace('_', ' ') }}</span>
          </RouterLink>
        </div>
      </section>

      <!-- ── Pasang baru ──────────────────────────────────────────── -->
      <section v-else-if="b === 'pasang_baru'" class="dsb-sec">
        <div class="dsb-sec-head"><h2>Pasang Baru</h2><RouterLink to="/pasang-baru">Buka →</RouterLink></div>
        <div class="dsb-tiles">
          <RouterLink to="/pasang-baru" class="tile"><b>{{ d.pasang_baru.survey.reduce((s: number, x: any) => s + x.n, 0) }}</b><span>Survey berjalan</span>
            <small>{{ d.pasang_baru.survey.map((x: any) => `${x.n} ${x.status}`).join(' · ') || '—' }}</small></RouterLink>
          <RouterLink to="/pasang-baru" class="tile"><b :class="d.pasang_baru.sph.some((x: any) => x.status === 'Menunggu Director') ? 'kuning' : ''">{{ d.pasang_baru.sph.reduce((s: number, x: any) => s + x.n, 0) }}</b><span>SPH belum disetujui</span>
            <small>{{ d.pasang_baru.sph.map((x: any) => `${x.n} ${x.status}`).join(' · ') || '—' }}</small></RouterLink>
          <RouterLink to="/pasang-baru" class="tile"><b class="biru">{{ totalPb }}</b><span>Order berjalan</span>
            <small>{{ orderPb.map((x) => `${x.n} ${x.tahap}`).join(' · ') || '—' }}</small></RouterLink>
          <div v-if="d.pasang_baru.survey_saya || d.pasang_baru.sph_saya" class="tile"><b>{{ d.pasang_baru.survey_saya + d.pasang_baru.sph_saya }}</b><span>Milik saya</span>
            <small>{{ d.pasang_baru.survey_saya }} survey · {{ d.pasang_baru.sph_saya }} SPH</small></div>
        </div>
      </section>

      <!-- ── Sales ────────────────────────────────────────────────── -->
      <section v-else-if="b === 'sales'" class="dsb-sec">
        <div class="dsb-sec-head"><h2>Sales</h2><RouterLink to="/sales">Buka →</RouterLink></div>
        <div class="dsb-tiles">
          <RouterLink to="/sales/lead" class="tile"><b>{{ d.sales.lead_saya }}</b><span>Lead saya</span><small>{{ d.sales.lead }} lead aktif tim</small></RouterLink>
          <RouterLink to="/sales/opportunity" class="tile"><b>{{ d.sales.opportunity_saya }}</b><span>Opportunity saya</span><small>{{ d.sales.opportunity }} terbuka tim</small></RouterLink>
          <RouterLink to="/sales/quotation" class="tile"><b>{{ d.sales.quotation_saya }}</b><span>Quotation draft saya</span><small>{{ d.sales.quotation_draft }} draft tim</small></RouterLink>
        </div>
      </section>

      <!-- ── Keuangan ─────────────────────────────────────────────── -->
      <section v-else-if="b === 'keuangan'" class="dsb-sec">
        <div class="dsb-sec-head"><h2>Keuangan</h2><RouterLink to="/finance">Buka →</RouterLink></div>
        <div class="dsb-tiles">
          <RouterLink to="/finance/invoice" class="tile"><b :class="d.keuangan.invoice_overdue ? 'merah' : ''">{{ d.keuangan.invoice_overdue.toLocaleString('id-ID') }}</b><span>Invoice jatuh tempo</span><small>{{ rp(d.keuangan.nilai_overdue) }}</small></RouterLink>
          <RouterLink to="/contracts" class="tile"><b>{{ rp(d.keuangan.mrc_aktif) }}</b><span>MRC aktif / bulan</span><small>{{ d.keuangan.kontrak_aktif }} kontrak aktif</small></RouterLink>
          <RouterLink to="/contracts" class="tile"><b :class="d.keuangan.kontrak_berakhir_30 ? 'kuning' : ''">{{ d.keuangan.kontrak_berakhir_30 }}</b><span>Kontrak berakhir ≤ 30 hr</span></RouterLink>
        </div>
      </section>

      <!-- ── Ringkasan perusahaan (akses Laporan) ─────────────────── -->
      <section v-else-if="b === 'eksekutif'" class="dsb-sec">
        <div class="dsb-sec-head"><h2>Ringkasan Perusahaan</h2><RouterLink to="/reports">Laporan →</RouterLink></div>
        <DashEksekutif />
      </section>

    </template>
    </template>
  </div>
</template>

<style scoped>
.dsb { box-sizing: border-box; }
.dsb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.dsb-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .12em; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
.dsb-title { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 4px; overflow-wrap: anywhere; }
.dsb-title span { color: #0B1D35; }
.dsb-date { font-size: 12px; color: #94a3b8; }
.dsb-aksi { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.dsb-btn { padding: 7px 13px; border-radius: 8px; border: 1.5px solid #e2e8f0; background: #fff; color: #334155; font-size: 12px; font-weight: 600; cursor: pointer; }
.dsb-btn:first-child { background: #0B1D35; border-color: #0B1D35; color: #fff; }
.dsb-btn:hover { border-color: #cbd5e1; }
.dsb-muat, .dsb-kosong { padding: 48px; text-align: center; color: #94a3b8; font-size: 13px; }
.dsb-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px 18px; color: #b91c1c; font-size: 13px; }

.dsb-sec { margin-bottom: 22px; }
.dsb-sec-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.dsb-sec-head h2 { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin: 0; }
.dsb-sec-head a { font-size: 12px; font-weight: 600; color: #2563eb; text-decoration: none; }

.dsb-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 10px; }
.tile { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; color: inherit; text-decoration: none; min-width: 0; }
a.tile:hover { box-shadow: 0 4px 14px rgba(0,0,0,.06); }
.tile b { font-size: 22px; font-weight: 800; line-height: 1.1; color: #0f172a; font-variant-numeric: tabular-nums; }
.tile span { font-size: 12px; font-weight: 600; color: #475569; }
.tile small { font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 0; }
.card-title { font-size: 12px; font-weight: 700; color: #0f172a; padding: 6px 14px 4px; }
.baris { display: flex; align-items: center; gap: 12px; padding: 7px 14px; color: inherit; text-decoration: none; border-top: 1px solid #f1f5f9; }
.baris:first-of-type { border-top: none; }
.baris:hover { background: #f8fafc; }
.umur { flex: 0 0 84px; font-size: 12px; font-weight: 700; color: #475569; font-variant-numeric: tabular-nums; }
.isi { flex: 1; min-width: 0; font-size: 13px; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.isi small { display: block; font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; }
.lencana { flex-shrink: 0; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: #f1f5f9; color: #475569; }
.lencana.Open { background: #fef2f2; color: #b91c1c; }
.lencana.In_Progress { background: #fffbeb; color: #b45309; }
.lencana.Pending { background: #f5f3ff; color: #6d28d9; }
.muted { color: #94a3b8; font-size: 13px; }
.pad { padding: 10px 14px; }
.merah { color: #dc2626 !important; }
.kuning { color: #b45309 !important; }
.hijau { color: #15803d !important; }
.biru { color: #1d4ed8 !important; }
@media (max-width: 640px) {
  .dsb-aksi { justify-content: flex-start; }
  .umur { flex-basis: 64px; }
  .lencana { display: none; }
}
</style>
