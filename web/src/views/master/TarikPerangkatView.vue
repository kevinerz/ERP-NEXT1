<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { printBaPengambilan } from '@/composables/usePrint'
import { exportCsv } from '@/composables/useExport'
import { useFilterUrl } from '@/composables/useFilterUrl'
import MasterNav from './MasterNav.vue'

// Site Dismantle yang perangkatnya masih melapor / belum ditarik → cetak BA Pengambilan Barang
interface Router { site_key: string; nama_utama: string | null; model: string | null; brand: string | null; status: string; status_sejak: string; hb_at: string | null; public_ip: string | null }
interface Site {
  id_site: number; kode_site: string; nama_site: string; alamat_lengkap: string; kota: string | null; provinsi: string | null; tgl_terminasi: string | null; catatan: string | null
  pelanggan: { id_pelanggan: number; nama_pelanggan: string; nama_pic_utama: string | null; no_hp_pic_utama: string | null }
  layanan: { nama_layanan: string } | null
  pic: { nama_pic: string; jabatan: string | null; no_kontak: string | null; is_utama: boolean }[]
  perangkat: { id_perangkat: number; jenis_perangkat: string; merk: string | null; tipe_model: string | null; serial_number: string | null; mac_address: string | null; ip_address: string | null; aset: { kode_aset: string } | null }[]
  sumber_internet: { id_sumber: number; peruntukan_link: string; sn_modem: string | null; nomor_pelanggan_isp: string | null; status_link: string; vendor: { nama_vendor: string } | null }[]
  aset: { id_aset: number; kode_aset: string; nama_perangkat: string; merk: string | null; tipe_model: string | null; serial_number: string | null; kategori: string }[]
  nocaas_router: Router[]
  melapor: boolean; baru_mati: boolean; jumlah_barang: number
}

const router = useRouter()
const semua = ref<Site[]>([])
const memuat = ref(true)
const error = ref('')
const tampil = ref<'melapor' | 'baru' | 'barang' | 'semua'>('melapor')
const q = ref('')
useFilterUrl({ tampil, q })
const dipilih = ref(new Set<number>())
const tglBa = ref(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }))

onMounted(async () => {
  try {
    const { data } = await api.get('/master/site/dismantle-perangkat')
    semua.value = data.data ?? []
    // Pertama kali buka & tidak ada yang melapor → tampilkan semua yang perlu ditarik
    if (tampil.value === 'melapor' && !semua.value.some((s) => s.melapor)) tampil.value = 'semua'
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat data'
  } finally {
    memuat.value = false
  }
})

const hitung = computed(() => ({
  melapor: semua.value.filter((s) => s.melapor).length,
  baru: semua.value.filter((s) => s.baru_mati).length,
  barang: semua.value.filter((s) => s.jumlah_barang > 0).length,
  semua: semua.value.length,
}))
const daftar = computed(() => {
  const kata = q.value.trim().toLowerCase()
  return semua.value.filter((s) => {
    if (tampil.value === 'melapor' && !s.melapor) return false
    if (tampil.value === 'baru' && !s.baru_mati) return false
    if (tampil.value === 'barang' && !s.jumlah_barang) return false
    return !kata || `${s.nama_site} ${s.kode_site} ${s.pelanggan.nama_pelanggan} ${s.kota ?? ''} ${s.nocaas_router.map((r) => r.site_key).join(' ')}`.toLowerCase().includes(kata)
  })
})
const semuaTerpilih = computed(() => daftar.value.length > 0 && daftar.value.every((s) => dipilih.value.has(s.id_site)))
function pilihSemua() {
  const d = new Set(dipilih.value)
  if (semuaTerpilih.value) daftar.value.forEach((s) => d.delete(s.id_site))
  else daftar.value.forEach((s) => d.add(s.id_site))
  dipilih.value = d
}
function toggle(id: number) {
  const d = new Set(dipilih.value)
  if (d.has(id)) d.delete(id); else d.add(id)
  dipilih.value = d
}
function cetak(list: Site[]) { if (list.length) printBaPengambilan(list, { tanggal: tglBa.value }) }
const terpilih = computed(() => semua.value.filter((s) => dipilih.value.has(s.id_site)))

function ekspor() {
  exportCsv(`tarik-perangkat-${tglBa.value}`, [{
    headers: ['Kode site', 'Nama site', 'Pelanggan', 'Kota', 'Tgl terminasi', 'Status router', 'IP publik', 'Barang tercatat', 'Rincian barang', 'PIC lokasi'],
    rows: daftar.value.map((s) => [s.kode_site, s.nama_site, s.pelanggan.nama_pelanggan, s.kota, s.tgl_terminasi?.slice(0, 10), statusRouter(s), s.nocaas_router.map((r) => r.public_ip).filter(Boolean).join(', '),
      s.jumlah_barang, rincian(s).join('; '), s.pic[0] ? `${s.pic[0].nama_pic} ${s.pic[0].no_kontak ?? ''}` : s.pelanggan.nama_pic_utama]),
  }])
}

const tgl = (d?: string | null) => (d ? new Date(d).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const relatif = (d?: string | null) => {
  if (!d) return ''
  const m = Math.round((Date.now() - +new Date(d)) / 60_000)
  return m < 60 ? `${Math.max(1, m)} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`
}
function statusRouter(s: Site) {
  if (!s.nocaas_router.length) return 'Tidak terpantau NOCaaS'
  return s.nocaas_router.map((r) => (r.status === 'offline' ? `offline ${relatif(r.status_sejak)}` : r.status === 'online' ? 'ONLINE' : r.status)).join(' · ')
}
function rincian(s: Site) {
  return [
    ...s.perangkat.map((p) => `${[p.jenis_perangkat, p.merk, p.tipe_model].filter(Boolean).join(' ')}${p.serial_number ? ` (SN ${p.serial_number})` : ''}`),
    ...s.aset.map((a) => `${a.nama_perangkat}${a.serial_number ? ` (SN ${a.serial_number})` : ''}`),
    ...s.sumber_internet.map((m) => `Modem ${m.vendor?.nama_vendor ?? ''} (SN ${m.sn_modem})`),
  ]
}
</script>

<template>
  <div class="page tp">
    <MasterNav />
    <header class="tp-kepala">
      <div>
        <button type="button" class="tp-kembali" @click="router.push('/master/site?status=Dismantle')">← Site Dismantle</button>
        <h2>📦 Tarik Perangkat</h2>
        <p>Site yang sudah <b>Dismantle</b> tapi perangkatnya masih melapor ke NOC, baru mati, atau masih tercatat terpasang. Pilih site lalu cetak <b>Berita Acara Pengambilan Barang</b> untuk teknisi.</p>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <section class="tp-kpi">
      <button type="button" class="k merah" :class="{ on: tampil === 'melapor' }" @click="tampil = 'melapor'"><b>{{ hitung.melapor }}</b><span>Masih melapor</span><small>router online / heartbeat ≤ 24 jam</small></button>
      <button type="button" class="k oranye" :class="{ on: tampil === 'baru' }" @click="tampil = 'baru'"><b>{{ hitung.baru }}</b><span>Baru mati</span><small>offline ≤ 7 hari — kemungkinan masih terpasang</small></button>
      <button type="button" class="k biru" :class="{ on: tampil === 'barang' }" @click="tampil = 'barang'"><b>{{ hitung.barang }}</b><span>Barang tercatat</span><small>perangkat / modem / aset di site</small></button>
      <button type="button" class="k abu" :class="{ on: tampil === 'semua' }" @click="tampil = 'semua'"><b>{{ hitung.semua }}</b><span>Semua perlu dicek</span><small>gabungan di atas</small></button>
    </section>

    <div class="tp-alat">
      <input v-model="q" class="tp-cari" placeholder="Cari site, kode, pelanggan, kota…" />
      <label class="tp-tgl">Tanggal BA <input v-model="tglBa" type="date" /></label>
      <span class="tp-spasi"></span>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="!daftar.length" @click="ekspor">⬇ CSV</button>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!terpilih.length" @click="cetak(terpilih)">🖨️ Cetak BA ({{ terpilih.length }} site)</button>
    </div>

    <div v-if="memuat" class="tp-kosong">Memuat…</div>
    <div v-else-if="!daftar.length" class="tp-kosong">✅ Tidak ada site di kategori ini.</div>
    <div v-else class="tp-tabel">
      <table>
        <thead>
          <tr>
            <th class="cek"><input type="checkbox" :checked="semuaTerpilih" aria-label="Pilih semua" @change="pilihSemua" /></th>
            <th>Site</th><th>Status NOC</th><th>Barang di lokasi</th><th>PIC lokasi</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in daftar" :key="s.id_site" :class="{ pilih: dipilih.has(s.id_site), panas: s.melapor }">
            <td class="cek"><input type="checkbox" :checked="dipilih.has(s.id_site)" :aria-label="`Pilih ${s.nama_site}`" @change="toggle(s.id_site)" /></td>
            <td>
              <a href="#" class="tp-nama" @click.prevent="router.push(`/master/site/${s.id_site}`)">{{ s.nama_site }}</a>
              <small><code>{{ s.kode_site }}</code> · {{ s.pelanggan.nama_pelanggan }}<template v-if="s.kota"> · {{ s.kota }}</template></small>
              <small>Dismantle {{ tgl(s.tgl_terminasi) }}</small>
            </td>
            <td>
              <span v-if="s.melapor" class="lencana merah">● Masih melapor</span>
              <span v-else-if="s.baru_mati" class="lencana oranye">Baru mati</span>
              <span v-else-if="!s.nocaas_router.length" class="lencana abu">Tidak terpantau</span>
              <span v-else class="lencana abu">Offline</span>
              <small v-for="r in s.nocaas_router" :key="r.site_key">{{ r.site_key }} · {{ r.status === 'offline' ? `mati ${relatif(r.status_sejak)}` : r.status }}<template v-if="r.public_ip"> · {{ r.public_ip }}</template></small>
            </td>
            <td>
              <template v-if="rincian(s).length">
                <small v-for="(b, i) in rincian(s).slice(0, 3)" :key="i">• {{ b }}</small>
                <small v-if="rincian(s).length > 3" class="redup">+{{ rincian(s).length - 3 }} lainnya</small>
              </template>
              <small v-else class="redup">Belum tercatat — isi di BA saat pengambilan</small>
            </td>
            <td>
              <small v-if="s.pic[0]">{{ s.pic[0].nama_pic }}<br />{{ s.pic[0].no_kontak }}</small>
              <small v-else-if="s.pelanggan.nama_pic_utama">{{ s.pelanggan.nama_pic_utama }}<br />{{ s.pelanggan.no_hp_pic_utama }}</small>
              <small v-else class="redup">—</small>
            </td>
            <td class="kanan"><button type="button" class="btn btn-ghost btn-sm" @click="cetak([s])">🖨️ BA</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.tp-kepala h2 { margin: 2px 0 4px; font-size: 22px; font-weight: 900; }
.tp-kepala p { margin: 0 0 14px; color: #64748b; font-size: 13.5px; max-width: 760px; }
.tp-kembali { border: 0; background: none; color: #4f46e5; font-weight: 700; font-size: 12.5px; cursor: pointer; padding: 0; }
.tp-kpi { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.k { --c: #475569; text-align: left; border: 1px solid #e2e8f0; background: #fff; border-radius: 14px; padding: 12px 14px; cursor: pointer; display: flex; flex-direction: column; font: inherit; }
.k b { font-size: 26px; font-weight: 900; color: var(--c); line-height: 1.1; }
.k span { font-size: 13px; font-weight: 800; color: #0f172a; }
.k small { font-size: 11px; color: #94a3b8; }
.k.on { border-color: var(--c); box-shadow: inset 0 0 0 1.5px var(--c); background: color-mix(in srgb, var(--c) 6%, #fff); }
.k.merah { --c: #dc2626; } .k.oranye { --c: #ea580c; } .k.biru { --c: #2563eb; } .k.abu { --c: #475569; }
.tp-alat { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.tp-cari { flex: 1; min-width: 220px; max-width: 360px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 13.5px; }
.tp-tgl { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #475569; }
.tp-tgl input { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; font: inherit; font-size: 13px; }
.tp-spasi { flex: 1; }
.tp-kosong { text-align: center; padding: 40px; background: #fff; border: 1px dashed #cbd5e1; border-radius: 14px; color: #64748b; }
.tp-tabel { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: auto; }
.tp-tabel table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tp-tabel th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #94a3b8; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
.tp-tabel td { padding: 10px 12px; border-bottom: 1px solid #f8fafc; vertical-align: top; }
.tp-tabel td small { display: block; font-size: 11.5px; color: #475569; line-height: 1.5; }
.tp-tabel tr.pilih { background: #eef2ff; }
.tp-tabel tr.panas td:first-child { box-shadow: inset 3px 0 0 #dc2626; }
.cek { width: 34px; }
.tp-nama { font-weight: 800; color: #0f172a; text-decoration: none; }
.tp-nama:hover { text-decoration: underline; }
code { font-size: 11px; background: #f1f5f9; padding: 0 5px; border-radius: 4px; }
.lencana { display: inline-block; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 99px; margin-bottom: 3px; }
.lencana.merah { background: #fef2f2; color: #dc2626; } .lencana.oranye { background: #fff7ed; color: #c2410c; } .lencana.abu { background: #f1f5f9; color: #64748b; }
.redup { color: #94a3b8 !important; }
.kanan { text-align: right; white-space: nowrap; }
@media (max-width: 800px) { .tp-kpi { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
