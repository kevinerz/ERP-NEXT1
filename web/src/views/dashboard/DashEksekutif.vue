<script setup lang="ts">
// Ringkasan perusahaan — hanya untuk akun dengan akses modul Laporan.
// Gaya sama dengan dashboard divisi: kartu warna-warni, grafik beranimasi, aktivitas terbaru.
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'
import { pesanGalat } from '@/composables/useDialog'
import KartuAngka from '@/components/grafik/KartuAngka.vue'
import GrafikBatang from '@/components/grafik/GrafikBatang.vue'
import GrafikDonat from '@/components/grafik/GrafikDonat.vue'
import CincinProgres from '@/components/grafik/CincinProgres.vue'
import BatangMendatar from '@/components/grafik/BatangMendatar.vue'
import { SERI, STATUS } from '@/components/grafik/warna'

const summary   = ref<any>(null)
const revenue   = ref<any[]>([])
const ticketRpt = ref<any>(null)
const projRpt   = ref<any>(null)
const loading   = ref(true)
const error     = ref('')

async function muat() {
  loading.value = true; error.value = ''
  try {
    const [s, r, tr, pr] = await Promise.all([
      api.get('/reports/dashboard'),
      api.get('/reports/revenue'),
      api.get('/reports/tickets'),
      api.get('/reports/projects'),
    ])
    summary.value   = s.data.data
    revenue.value   = Array.isArray(r.data.data) ? r.data.data : []
    ticketRpt.value = tr.data.data
    projRpt.value   = pr.data.data
  } catch (e: any) {
    error.value = pesanGalat(e, 'Gagal memuat ringkasan perusahaan')
  } finally { loading.value = false }
}
onMounted(muat)

const kpi      = computed(() => summary.value?.kpi || {})
const pipeline = computed(() => summary.value?.sales_pipeline || {})

function rp(n: number) {
  if (!n) return 'Rp 0'
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}
function waktu(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Grafik ─────────────────────────────────────────────────────
const grafikMrc = computed(() => ({
  label: revenue.value.map((r: any) => r.label),
  seri: [{ nama: 'MRC kontrak aktif', nilai: revenue.value.map((r: any) => Math.round(r.mrc)), warna: SERI[2] }],
}))
const mrcNaik = computed(() => {
  const v = revenue.value
  if (v.length < 2) return null
  const a = v[v.length - 2].mrc, b = v[v.length - 1].mrc
  return a ? Math.round(((b - a) / a) * 1000) / 10 : null
})
const LABEL_STATUS: Record<string, string> = { Open: 'Open', In_Progress: 'Diproses', Pending: 'Pending', Resolved: 'Selesai', Closed: 'Ditutup' }
const WARNA_STATUS: Record<string, string> = { Open: SERI[1]!, In_Progress: SERI[0]!, Pending: SERI[6]!, Resolved: SERI[2]!, Closed: '#898781' }
const donatTiket = computed(() => (summary.value?.tiket_by_status ?? []).map((t: any) => ({ nama: LABEL_STATUS[t.status] ?? t.status, n: t.count, warna: WARNA_STATUS[t.status] })))
const URUT_PROYEK = ['Kickoff', 'Perencanaan', 'Instalasi', 'Testing', 'Selesai', 'Dibatalkan']
const proyek = computed(() => {
  const b = projRpt.value?.by_status ?? []
  return URUT_PROYEK.map((s) => ({ nama: s, n: b.find((x: any) => x.status === s)?.count ?? 0 })).filter((x) => x.n)
})
const corong = computed(() => [
  { nama: 'Lead', ikon: '🌱', n: pipeline.value.leads ?? 0, ke: '/sales/lead' },
  { nama: 'Opportunity', ikon: '🎯', n: pipeline.value.opportunities ?? 0, ke: '/sales/opportunity' },
  { nama: 'Quotation draft', ikon: '📄', n: pipeline.value.quotation_draft ?? 0, ke: '/sales/quotation' },
  { nama: 'Quotation disetujui', ikon: '✅', n: pipeline.value.quotation_approved ?? 0, ke: '/sales/quotation' },
])

// ── Aktivitas terbaru (tiket, quotation, WO) ──────────────────
const JENIS = {
  tiket: { ikon: '🎫', warna: 'oranye', label: 'Tiket' },
  quotation: { ikon: '📄', warna: 'pink', label: 'Quotation' },
  wo: { ikon: '🗂️', warna: 'ungu', label: 'Work Order' },
} as const
const filterAktivitas = ref<'semua' | keyof typeof JENIS>('semua')
const aktivitas = computed(() => {
  const s = summary.value
  if (!s) return []
  const a: any[] = []
  for (const t of s.tiket_terbaru ?? []) a.push({ jenis: 'tiket', key: `t${t.id_ticket}`, nomor: t.nomor_tiket, judul: t.judul_tiket, sub: [t.site?.pelanggan?.nama_pelanggan, t.site?.nama_site].filter(Boolean).join(' · '), status: t.status_tiket, tgl: t.tgl_open, ke: `/operations/${t.id_ticket}` })
  for (const q of s.quotation_terbaru ?? []) a.push({ jenis: 'quotation', key: `q${q.id_quotation}`, nomor: q.nomor_quotation, judul: q.opportunity?.nama_opportunity, sub: q.opportunity?.lead?.nama_prospek, status: q.status_approval, tgl: q.created_at, ke: `/sales/quotation/${q.id_quotation}` })
  for (const w of s.wo_terbaru ?? []) a.push({ jenis: 'wo', key: `w${w.id_wo}`, nomor: w.nomor_wo, judul: w.deskripsi_tugas?.slice(0, 70), sub: [w.site?.pelanggan?.nama_pelanggan, w.site?.nama_site].filter(Boolean).join(' · '), status: w.status_wo, tgl: w.created_at, ke: `/public-wo/${w.id_wo}` })
  return a.filter((x) => filterAktivitas.value === 'semua' || x.jenis === filterAktivitas.value)
    .sort((x, y) => new Date(y.tgl).getTime() - new Date(x.tgl).getTime()).slice(0, 10)
})
</script>

<template>
  <div class="eks">
    <div v-if="loading" class="eks-muat"><span class="bola" /><span class="bola" /><span class="bola" /> Mengumpulkan angka perusahaan…</div>
    <div v-else-if="error" class="eks-error">😵 {{ error }} <button type="button" class="eks-coba" @click="muat">Coba lagi</button></div>
    <template v-else>
      <RouterLink v-if="kpi.invoice_overdue > 0" to="/finance/invoice" class="eks-banner">
        <span class="eks-banner-ikon">⏰</span>
        <span><b>{{ kpi.invoice_overdue.toLocaleString('id-ID') }} invoice</b> sudah jatuh tempo dan belum dibayar</span>
        <span class="eks-banner-link">Lihat invoice →</span>
      </RouterLink>

      <div class="eks-subjudul">🏢 Pelanggan &amp; Infrastruktur</div>
      <div class="kisi">
        <KartuAngka ikon="🤝" label="Total pelanggan" :nilai="kpi.total_pelanggan ?? 0" ke="/master/pelanggan" nada="biru" />
        <KartuAngka ikon="📍" label="Total site" :nilai="kpi.total_site ?? 0" ke="/master/site" nada="toska" :urutan="1" />
        <KartuAngka ikon="💵" label="MRC aktif / bulan" :nilai="kpi.total_mrc_aktif ?? 0" :format="rp" ke="/contracts" nada="hijau" :urutan="2"
          :sub="mrcNaik == null ? undefined : `${mrcNaik >= 0 ? '▲' : '▼'} ${Math.abs(mrcNaik)}% dari bulan lalu`" />
        <KartuAngka ikon="📄" label="Kontrak aktif" :nilai="kpi.kontrak_aktif ?? 0" ke="/contracts" :sub="`${kpi.kontrak_akan_berakhir ?? 0} berakhir ≤ 30 hari`" nada="ungu" :urutan="3" />
        <KartuAngka ikon="🧾" label="Invoice jatuh tempo" :nilai="kpi.invoice_overdue ?? 0" ke="/finance/invoice" nada="merah" :status="kpi.invoice_overdue ? 'kritis' : 'baik'" :urutan="4" />
      </div>

      <div class="eks-subjudul">⚙️ Operasional</div>
      <div class="kisi">
        <KartuAngka ikon="🎫" label="Tiket aktif" :nilai="kpi.tiket_aktif ?? 0" ke="/operations" :sub="`${kpi.tiket_open ?? 0} open · ${kpi.tiket_in_progress ?? 0} diproses · ${kpi.tiket_pending ?? 0} pending`" nada="oranye" />
        <KartuAngka ikon="📐" label="Proyek berjalan" :nilai="kpi.proyek_berjalan ?? 0" ke="/projects" nada="pink" :urutan="1" />
        <KartuAngka ikon="🗂️" label="Work order aktif" :nilai="kpi.wo_aktif ?? 0" ke="/public-wo" nada="biru" :urutan="2" />
        <KartuAngka ikon="📦" label="Aset di gudang" :nilai="kpi.aset_di_gudang ?? 0" ke="/assets" nada="kuning" :urutan="3" />
        <KartuAngka ikon="👥" label="Karyawan aktif" :nilai="kpi.karyawan_aktif ?? 0" ke="/hris/karyawan" nada="toska" :urutan="4" />
      </div>

      <div class="kisi-grafik">
        <div class="panel panel-lebar">
          <div class="panel-judul">💹 MRC kontrak aktif · 12 bulan
            <small v-if="mrcNaik != null" :class="mrcNaik >= 0 ? 'naik' : 'turun'">{{ mrcNaik >= 0 ? '▲' : '▼' }} {{ Math.abs(mrcNaik) }}% bulan ini</small>
          </div>
          <div v-if="!revenue.some((r: any) => r.mrc)" class="rayakan"><span class="maskot">🌱</span>Belum ada kontrak aktif yang tercatat.</div>
          <GrafikBatang v-else :label="grafikMrc.label" :seri="grafikMrc.seri" :tinggi="210" :format="rp" judul-aria="MRC kontrak aktif per bulan" />
        </div>
        <div class="panel panel-sla">
          <div class="panel-judul">🏆 SLA bulan ini</div>
          <div class="sla-isi">
            <CincinProgres :persen="kpi.sla_compliance_pct ?? 100" label="SLA" :ukuran="116" :ambang-baik="99" :ambang-waspada="95" />
            <ul class="sla-rinci">
              <li><b>{{ (kpi.tiket_bulan_ini ?? 0).toLocaleString('id-ID') }}</b> tiket</li>
              <li><b :style="{ color: kpi.sla_breach_bulan_ini ? STATUS.kritis : undefined }">{{ kpi.sla_breach_bulan_ini ?? 0 }}</b> breach</li>
              <li v-if="ticketRpt?.resolution_rate != null"><b>{{ ticketRpt.resolution_rate }}%</b> terselesaikan</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="kisi-grafik">
        <div class="panel">
          <div class="panel-judul">🧩 Distribusi tiket</div>
          <GrafikDonat :data="donatTiket" label-tengah="tiket" />
        </div>
        <div class="panel">
          <div class="panel-judul">🪜 Corong penjualan</div>
          <div v-if="!corong.some((x) => x.n)" class="rayakan"><span class="maskot">🌱</span>Corong penjualan masih kosong.</div>
          <BatangMendatar v-else :data="corong" bertahap />
        </div>
        <div class="panel">
          <div class="panel-judul">📐 Proyek per status</div>
          <div v-if="!proyek.length" class="rayakan"><span class="maskot">📭</span>Belum ada proyek.</div>
          <BatangMendatar v-else :data="proyek" :warna="SERI[4]" />
        </div>
      </div>

      <div class="panel">
        <div class="panel-judul">🔔 Aktivitas terbaru
          <span class="filter">
            <button type="button" :class="{ on: filterAktivitas === 'semua' }" @click="filterAktivitas = 'semua'">Semua</button>
            <button v-for="(j, k) in JENIS" :key="k" type="button" :class="[`f-${j.warna}`, { on: filterAktivitas === k }]" @click="filterAktivitas = k">{{ j.ikon }} {{ j.label }}</button>
          </span>
        </div>
        <div v-if="!aktivitas.length" class="rayakan"><span class="maskot">🍃</span>Belum ada aktivitas.</div>
        <TransitionGroup name="akt" tag="div">
          <RouterLink v-for="a in aktivitas" :key="a.key" :to="a.ke" class="akt">
            <span :class="['akt-ikon', `akt-${JENIS[a.jenis as keyof typeof JENIS].warna}`]">{{ JENIS[a.jenis as keyof typeof JENIS].ikon }}</span>
            <span class="akt-isi"><b>{{ a.judul || a.nomor }}</b><small>{{ a.nomor }}<template v-if="a.sub"> · {{ a.sub }}</template></small></span>
            <span class="akt-status">{{ String(a.status || '').replace(/_/g, ' ') }}</span>
            <span class="akt-tgl">{{ waktu(a.tgl) }}</span>
          </RouterLink>
        </TransitionGroup>
      </div>
    </template>
  </div>
</template>

<style scoped>
.eks-muat { padding: 36px; text-align: center; color: #6b6a65; font-size: 13.5px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.bola { width: 9px; height: 9px; border-radius: 50%; background: #6250d6; animation: lompat 1s infinite ease-in-out; }
.bola:nth-child(2) { background: #e87ba4; animation-delay: .15s; }
.bola:nth-child(3) { background: #eda100; animation-delay: .3s; }
.eks-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 14px; padding: 12px 16px; color: #b91c1c; font-size: 13.5px; display: flex; align-items: center; gap: 10px; }
.eks-coba { border: 0; background: #d03b3b; color: #fff; border-radius: 10px; padding: 6px 12px; font-weight: 700; cursor: pointer; }
.eks-banner { display: flex; align-items: center; gap: 12px; padding: 11px 16px; margin-bottom: 14px; border-radius: 14px; background: linear-gradient(90deg, #fde8e8, #fff5f5); border: 1px solid #f6c4c4; color: #8f1d1d; text-decoration: none; font-size: 13.5px; animation: geser-masuk .5s both; }
.eks-banner-ikon { font-size: 20px; animation: dering 2.4s ease-in-out infinite; display: inline-block; }
.eks-banner-link { margin-left: auto; font-weight: 800; white-space: nowrap; }
.eks-subjudul { font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #6b6a65; margin: 4px 2px 8px; }
.kisi { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 16px; }
.kisi-grafik { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 14px; }
.panel { background: #fff; border: 1px solid #ecebe6; border-radius: 18px; padding: 14px 16px; min-width: 0; transition: box-shadow .2s; }
.panel:hover { box-shadow: 0 8px 22px rgba(15, 23, 42, .07); }
.panel-lebar { grid-column: span 2; }
.panel-judul { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; font-weight: 800; color: #1f1f1d; margin-bottom: 10px; }
.panel-judul small { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 99px; }
.naik { background: #e3f6e3; color: #0a6e0a; }
.turun { background: #fde8e8; color: #b42323; }
.sla-isi { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.sla-rinci { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #52514e; }
.sla-rinci b { font-size: 16px; color: #0b0b0b; margin-right: 4px; font-variant-numeric: tabular-nums; }
.rayakan { display: flex; align-items: center; gap: 10px; padding: 14px 6px; color: #52514e; font-size: 13.5px; font-weight: 600; }
.maskot { font-size: 28px; display: inline-block; animation: memantul 2s ease-in-out infinite; }

.filter { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
.filter button { border: 1px solid #ecebe6; background: #fff; border-radius: 99px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; color: #52514e; cursor: pointer; transition: all .15s; }
.filter button:hover { transform: translateY(-1px); }
.filter button.on { background: #1f1f1d; color: #fff; border-color: #1f1f1d; }
.akt { display: flex; align-items: center; gap: 12px; padding: 8px 6px; border-top: 1px dashed #ecebe6; color: inherit; text-decoration: none; border-radius: 10px; transition: background .15s, transform .15s; }
.akt:first-child { border-top: none; }
.akt:hover { background: #f8f7f4; transform: translateX(3px); }
.akt-ikon { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; flex-shrink: 0; }
.akt-oranye { background: #fdeee6; }
.akt-pink { background: #fcebf2; }
.akt-ungu { background: #efedfc; }
.akt-isi { flex: 1; min-width: 0; font-size: 13px; color: #0b0b0b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.akt-isi small { display: block; font-size: 11.5px; color: #6b6a65; overflow: hidden; text-overflow: ellipsis; }
.akt-status { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; background: #f1f0ec; color: #52514e; }
.akt-tgl { flex-shrink: 0; font-size: 11.5px; color: #898781; width: 110px; text-align: right; }
.akt-enter-active, .akt-leave-active { transition: all .3s ease; }
.akt-enter-from, .akt-leave-to { opacity: 0; transform: translateX(-12px); }

@keyframes lompat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes memantul { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes geser-masuk { from { opacity: 0; transform: translateX(-14px); } }
@keyframes dering { 0%, 70%, 100% { transform: rotate(0); } 75% { transform: rotate(-14deg); } 80% { transform: rotate(14deg); } 85% { transform: rotate(-10deg); } 90% { transform: rotate(8deg); } }
@media (prefers-reduced-motion: reduce) { .eks * { animation: none !important; transition: none !important; } }
@media (max-width: 900px) { .panel-lebar { grid-column: auto; } }
@media (max-width: 640px) {
  .kisi { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  .akt-tgl, .akt-status { display: none; }
  .filter { margin-left: 0; }
}
</style>
