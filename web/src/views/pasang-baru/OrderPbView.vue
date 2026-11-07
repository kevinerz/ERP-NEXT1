<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDate, fmtDateTime, fmtRupiah } from '@/composables/useFormat'
import { alertError, confirmDialog, promptDialog } from '@/composables/useDialog'
import { DEPOSIT_JENIS, KELAS_TAHAP, TAHAP_ORDER, type Vendor } from './pb'
import { printBaAktivasi } from '@/composables/usePrint'
import KurirApiModal from './KurirApiModal.vue'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))
const o = ref<any>(null)
const vendor = ref<Vendor[]>([])
const tab = ref('OPS')
const proses = ref(false)

async function muat(gantiTab = false) {
  try {
    const { data } = await api.get(`/pasang-baru/order/${id.value}`)
    o.value = data.data
    isiForm()
    if (gantiTab) tab.value = ['Network', 'Selesai'].includes(o.value.tahap) ? 'Network' : 'OPS'
  } catch (e) {
    alertError(e, 'Gagal memuat order')
  }
}
onMounted(async () => {
  api.get('/pasang-baru/referensi').then(({ data }) => { vendor.value = data.data.vendor }).catch(() => undefined)
  await muat(true)
})

const TAB = ['OPS', 'Network', 'Info order', 'Dokumen', 'Riwayat']
const bolehTahap = (t: string) => !!o.value?.hak.tahap.includes(t)
const bisaUbah = (t: string) => o.value?.tahap === t && bolehTahap(t)
const idxTahap = computed(() => TAHAP_ORDER.indexOf(o.value?.tahap))
const bisaSerahkan = computed(() => ['OPS', 'Network'].includes(o.value?.tahap) && bolehTahap(o.value.tahap))
const bisaKembalikan = computed(() => ['Network', 'Selesai'].includes(o.value?.tahap) && bolehTahap(o.value.tahap))
const bisaBatal = computed(() => ['OPS', 'Network'].includes(o.value?.tahap) && bolehTahap('Draft'))
const lengkap = computed(() => (o.value?.syarat || []).every((x: any) => x.ok))
const SEBELUM: Record<string, string> = { Network: 'OPS', Selesai: 'Network' }

async function jalankan(fn: () => Promise<any>, gantiTab = false) {
  proses.value = true
  try { await fn(); await muat(gantiTab) } catch (e) { alertError(e) } finally { proses.value = false }
}
async function serahkan() {
  const net = o.value.tahap === 'Network'
  const catatan = await promptDialog(net
    ? { title: 'Selesaikan order', message: 'Perangkat terpasang dan BA aktivasi sudah ditandatangani. Sales akan diberi tahu.', label: 'Catatan (opsional)', confirmLabel: '✓ Selesai' }
    : { title: 'Vendor ISP terpasang', message: 'Modem vendor sudah terpasang dan speedtest sudah dicek. Order diserahkan ke Network untuk pemasangan Mikrotik.', label: 'Catatan untuk Network (opsional)', confirmLabel: '✓ Serahkan ke Network' })
  if (catatan === null) return
  jalankan(() => api.post(`/pasang-baru/order/${id.value}/serahkan`, { catatan: catatan || undefined }), true)
}
async function kembalikan() {
  const ke = SEBELUM[o.value.tahap]
  const catatan = await promptDialog({ title: `Kembalikan ke ${ke}`, label: 'Alasan', confirmLabel: 'Kembalikan', variant: 'warning', validate: (v) => (v.trim() ? null : 'Alasan wajib diisi') })
  if (!catatan) return
  jalankan(() => api.post(`/pasang-baru/order/${id.value}/kembalikan`, { catatan }), true)
}
async function batalkan() {
  const catatan = await promptDialog({ title: 'Batalkan order', label: 'Alasan pembatalan', confirmLabel: 'Batalkan order', variant: 'danger', validate: (v) => (v.trim() ? null : 'Alasan wajib diisi') })
  if (!catatan) return
  jalankan(() => api.post(`/pasang-baru/order/${id.value}/batal`, { catatan }))
}

// ── Tab OPS (IKG) ────────────────────────────────────────────────────────────
const fo = reactive({ ikg_nominal: 0, ikg_pengelola: '', ikg_catatan: '' })
function isiForm() {
  const x = o.value
  Object.assign(fo, { ikg_nominal: Number(x.ikg_nominal), ikg_pengelola: x.ikg_pengelola || '', ikg_catatan: x.ikg_catatan || '' })
  isiNetwork()
  muatReferensiNetwork()
}
const simpanOps = () => jalankan(() => api.patch(`/pasang-baru/order/${id.value}/ops`, { ...fo, ikg_nominal: Number(fo.ikg_nominal) || 0 }))

// ── Link vendor ISP ──────────────────────────────────────────────────────────
const links = computed<any[]>(() => o.value?.site?.sumber_internet || [])
const kosongLink = () => ({
  id_sumber: null as number | null, id_vendor_isp: '' as number | '', peruntukan_link: 'Main', nomor_pelanggan_isp: '', bandwidth_mbps: '',
  biaya_mrc_vendor: 0, tgl_mulai: '', durasi_bulan: 12 as number | '', sn_modem: '', deposit_nominal: 0, deposit_tgl: '', deposit_status: '', deposit_jenis: '', catatan: '',
  speedtest_down: '' as number | '', speedtest_up: '' as number | '', speedtest_ping: '' as number | '',
})
const fl = reactive({ buka: false, ...kosongLink() })
function bukaLink(l?: any) {
  Object.assign(fl, kosongLink(), { buka: true })
  if (l) {
    Object.assign(fl, {
      id_sumber: l.id_sumber, id_vendor_isp: l.id_vendor_isp, peruntukan_link: l.peruntukan_link, nomor_pelanggan_isp: l.nomor_pelanggan_isp || '',
      bandwidth_mbps: l.bandwidth_mbps || '', biaya_mrc_vendor: Number(l.biaya_mrc_vendor), tgl_mulai: l.tgl_mulai ? l.tgl_mulai.slice(0, 10) : '',
      durasi_bulan: l.durasi_bulan || '', sn_modem: l.sn_modem || '', deposit_nominal: Number(l.deposit_nominal),
      deposit_tgl: l.deposit_tgl ? l.deposit_tgl.slice(0, 10) : '', deposit_status: l.deposit_status || '', deposit_jenis: l.deposit_jenis || '', catatan: l.catatan || '',
      speedtest_down: l.speedtest_down != null ? Number(l.speedtest_down) : '', speedtest_up: l.speedtest_up != null ? Number(l.speedtest_up) : '',
      speedtest_ping: l.speedtest_ping != null ? Number(l.speedtest_ping) : '',
    })
  }
}
async function simpanLink() {
  if (!fl.id_vendor_isp) return
  const { buka, id_sumber, ...isi } = fl
  const body = {
    ...isi, id_vendor_isp: Number(isi.id_vendor_isp), biaya_mrc_vendor: Number(isi.biaya_mrc_vendor) || 0, deposit_nominal: Number(isi.deposit_nominal) || 0,
    durasi_bulan: isi.durasi_bulan ? Number(isi.durasi_bulan) : null, tgl_mulai: isi.tgl_mulai || null, deposit_tgl: isi.deposit_tgl || null,
    deposit_status: isi.deposit_status || undefined,
    speedtest_down: isi.speedtest_down === '' ? null : Number(isi.speedtest_down),
    speedtest_up: isi.speedtest_up === '' ? null : Number(isi.speedtest_up),
    speedtest_ping: isi.speedtest_ping === '' ? null : Number(isi.speedtest_ping),
  }
  await jalankan(() => (id_sumber ? api.patch(`/pasang-baru/link/${id_sumber}`, body) : api.post(`/pasang-baru/order/${id.value}/link`, body)))
  fl.buka = false
}
async function hapusLink(l: any) {
  if (!(await confirmDialog({ title: 'Hapus link', message: `Hapus link ${l.vendor.nama_vendor}?`, variant: 'danger', confirmLabel: 'Hapus' }))) return
  jalankan(() => api.delete(`/pasang-baru/link/${l.id_sumber}`))
}

// Foto modem / screenshot speedtest per link
const inputFoto = ref<HTMLInputElement | null>(null)
let fotoTujuan: { id: number; jenis: 'modem' | 'speedtest' } | null = null
function pilihFoto(l: any, jenis: 'modem' | 'speedtest') {
  fotoTujuan = { id: l.id_sumber, jenis }
  inputFoto.value?.click()
}
async function unggahFoto(ev: Event) {
  const el = ev.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file || !fotoTujuan) return
  const { id: idl, jenis } = fotoTujuan
  const fd = new FormData()
  fd.append('file', file)
  fd.append('jenis', jenis)
  jalankan(() => api.post(`/pasang-baru/link/${idl}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }))
}
const lihat = ref('')
const kurangLink = (l: any) => [
  !l.nomor_pelanggan_isp && 'ID pelanggan', !l.tgl_mulai && 'tgl terpasang', !l.sn_modem && 'SN modem', !l.foto_modem && 'foto modem',
  !(Number(l.speedtest_down) > 0 && Number(l.speedtest_up) > 0) && 'angka speedtest', !l.foto_speedtest && 'screenshot speedtest',
].filter(Boolean) as string[]

// ── Tab Network: perangkat ───────────────────────────────────────────────────
const net = computed<any>(() => o.value?.network ?? { perangkat: [], wo: null })
const kontakTeknisi = ref<{ id_kontak: number; nama: string; no_hp: string; asal_vendor: string | null; keahlian: string | null }[]>([])
const kurir = ref<{ code: string; name: string }[]>([])
async function muatReferensiNetwork() {
  if (kontakTeknisi.value.length || !o.value || o.value.tahap !== 'Network') return
  const [a, b] = await Promise.all([api.get('/pasang-baru/kontak-teknisi'), api.get('/pasang-baru/kurir')]).catch(() => [null, null])
  if (a) kontakTeknisi.value = a.data.data
  if (b) kurir.value = b.data.data
}
const stok = reactive({ buka: false, cari: '', isi: [] as any[], memuat: false })
let timerStok: ReturnType<typeof setTimeout> | null = null
async function muatStok() {
  stok.memuat = true
  try { stok.isi = (await api.get('/pasang-baru/stok', { params: { cari: stok.cari.trim() || undefined } })).data.data } catch (e) { alertError(e) } finally { stok.memuat = false }
}
function bukaStok() { Object.assign(stok, { buka: true, cari: '' }); muatStok() }
function cariStok() { if (timerStok) clearTimeout(timerStok); timerStok = setTimeout(muatStok, 300) }
async function ambil(a: any) {
  await jalankan(() => api.post(`/pasang-baru/order/${id.value}/perangkat`, { id_aset: a.id_aset }))
  stok.buka = false
}
const req = reactive({ buka: false, nama_item: '', jumlah: 1, estimasi_harga: 0, link_marketplace: '', alasan: '' })
function bukaRequest() { Object.assign(req, { buka: true, nama_item: stok.cari.trim() || 'Mikrotik hAP ac²', jumlah: 1, estimasi_harga: 0, link_marketplace: '', alasan: '' }); stok.buka = false }
async function kirimRequest() {
  await jalankan(() => api.post(`/pasang-baru/order/${id.value}/perangkat/request`, { ...req, buka: undefined, jumlah: Number(req.jumlah) || 1, estimasi_harga: Number(req.estimasi_harga) || 0 }))
  req.buka = false
}
async function lepas(p: any) {
  if (!(await confirmDialog({ title: 'Lepas perangkat', message: p.id_aset ? `${p.nama_item} dikembalikan ke gudang?` : `Hapus request ${p.nama_item} dari order ini? (pengajuan aset tetap ada)`, confirmLabel: 'Ya', variant: 'danger' }))) return
  jalankan(() => api.delete(`/pasang-baru/perangkat/${p.id_pb_perangkat}`))
}
const pakai = (p: any) => jalankan(() => api.post(`/pasang-baru/perangkat/${p.id_pb_perangkat}/pakai`))

// ── Tab Network: pemasangan ──────────────────────────────────────────────────
const fn = reactive({ metode: '' as '' | 'Kirim_Vendor' | 'Visit_Internal', id_kontak_teknisi: '' as number | '' | 'baru', baru: { nama: '', no_hp: '', asal_vendor: '' }, kirim_wa: true, fee_vendor: 0, tgl_jadwal: '', nama_ekspedisi: '', nomor_resi: '', tgl_kirim: '', status_pengiriman: 'Packing', catatan: '' })
function isiNetwork() {
  const w = net.value.wo, k = w?.pengiriman?.[0]
  Object.assign(fn, {
    metode: o.value.network_metode || '', id_kontak_teknisi: w?.id_kontak_teknisi || '', baru: { nama: '', no_hp: '', asal_vendor: '' },
    kirim_wa: !w?.wa_teknisi_at, fee_vendor: Number(w?.fee_vendor || 0),
    tgl_jadwal: w?.tgl_jadwal ? w.tgl_jadwal.slice(0, 10) : '', nama_ekspedisi: k?.nama_ekspedisi || '', nomor_resi: k?.nomor_resi || '',
    tgl_kirim: k?.tgl_kirim ? k.tgl_kirim.slice(0, 10) : '', status_pengiriman: k?.status_pengiriman || 'Packing', catatan: '',
  })
}
const woSelesai = computed(() => net.value.wo?.status_wo === 'Completed')
const simpanNetwork = () => jalankan(() => api.put(`/pasang-baru/order/${id.value}/network`, {
  metode: fn.metode, catatan: fn.catatan || undefined,
  ...(fn.metode === 'Kirim_Vendor' ? {
    ...(fn.id_kontak_teknisi === 'baru'
      ? { kontak_baru: { nama: fn.baru.nama.trim(), no_hp: fn.baru.no_hp.trim(), asal_vendor: fn.baru.asal_vendor.trim() || undefined } }
      : { id_kontak_teknisi: Number(fn.id_kontak_teknisi) || null }),
    kirim_wa: fn.kirim_wa, fee_vendor: Number(fn.fee_vendor) || 0, tgl_jadwal: fn.tgl_jadwal || null,
    nama_ekspedisi: fn.nama_ekspedisi || undefined, nomor_resi: fn.nomor_resi || undefined, tgl_kirim: fn.tgl_kirim || null, status_pengiriman: fn.status_pengiriman,
  } : {}),
}).then(() => { kontakTeknisi.value = []; muatReferensiNetwork() }))
const teknisiSiap = computed(() => fn.id_kontak_teknisi === 'baru' ? fn.baru.nama.trim().length >= 2 && fn.baru.no_hp.replace(/\D/g, '').length >= 9 : !!fn.id_kontak_teknisi)
const teknisiDipilih = computed(() => kontakTeknisi.value.find((k) => k.id_kontak === fn.id_kontak_teknisi))
async function kirimWa() {
  const k = net.value.wo?.kontak_teknisi
  if (!(await confirmDialog({ title: 'Kirim WA ke teknisi', message: `Kirim tugas pemasangan + link lapangan ke ${k?.nama} (${k?.no_hp}) lewat WhatsApp helpdesk?`, confirmLabel: 'Kirim' }))) return
  jalankan(() => api.post(`/pasang-baru/order/${id.value}/wa-teknisi`))
}
// Kurir api.co.id
const kirim = computed<any>(() => net.value.wo?.pengiriman?.[0] ?? null)
const kurirAktif = computed(() => !!kirim.value?.kurir_order_id && !['cancelled', 'failed'].includes(kirim.value?.kurir_status))
const riwayatKurir = computed<{ status: string; message: string; occurred_at: string }[]>(() => {
  try { return JSON.parse(kirim.value?.kurir_riwayat || '[]').slice().reverse() } catch { return [] }
})
const resiManual = computed(() => !kurirAktif.value && !!kirim.value?.nomor_resi)
const adaLacak = computed(() => kurirAktif.value || (resiManual.value && !!kirim.value?.kurir_status))
const bukaKurir = ref(false)
const lacakKurir = () => jalankan(() => api.post(`/pasang-baru/order/${id.value}/kurir-api/lacak`))
async function batalKurir() {
  if (!(await confirmDialog({ title: 'Batalkan order kurir', message: 'Hanya bisa sebelum paket dijemput. Ongkir dikembalikan ke saldo bila memenuhi syarat.', confirmLabel: 'Batalkan', variant: 'danger' }))) return
  jalankan(() => api.post(`/pasang-baru/order/${id.value}/kurir-api/batal`))
}
const STATUS_KURIR: Record<string, string> = { processing: 'Diproses', waiting: 'Menunggu jemput', shipping: 'Dalam pengiriman', delivered: 'Diterima', completed: 'Diterima', problem: 'Bermasalah', returned: 'Dikembalikan', cancelled: 'Dibatalkan', failed: 'Gagal' }

async function selesaiVendor() {
  const catatan = await promptDialog({ title: 'Pemasangan vendor selesai', message: 'Pakai ini bila vendor tidak melapor lewat link lapangan.', label: 'Catatan hasil (opsional)', confirmLabel: 'Selesai' })
  if (catatan === null) return
  jalankan(() => api.post(`/pasang-baru/order/${id.value}/pemasangan-selesai`, { catatan: catatan || undefined }))
}
const tersalin = ref(false)
async function salinLink() {
  try { await navigator.clipboard.writeText(net.value.wo.link_lapangan); tersalin.value = true; setTimeout(() => (tersalin.value = false), 2000) } catch { /* abaikan */ }
}

// ── Tab Network: BA aktivasi ─────────────────────────────────────────────────
const fb = reactive({ buka: false, nama: '', jabatan: '', nama_next1: '' })
const kanvas = ref<HTMLCanvasElement | null>(null)
const adaCoretan = ref(false)
let menggambar = false
async function bukaBa() {
  Object.assign(fb, { buka: true, nama: o.value.pic_store_nama || o.value.sph.nama_pic || '', jabatan: o.value.pic_store_nama ? 'PIC Store' : '', nama_next1: '' })
  await nextTick()
  const c = kanvas.value
  if (!c) return
  const rr = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
  c.width = rr.width * dpr; c.height = rr.height * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0f172a'
  adaCoretan.value = false
}
const titik = (e: PointerEvent) => { const rr = kanvas.value!.getBoundingClientRect(); return [e.clientX - rr.left, e.clientY - rr.top] as const }
function mulaiGores(e: PointerEvent) { menggambar = true; kanvas.value!.setPointerCapture(e.pointerId); const g = kanvas.value!.getContext('2d')!, [x, y] = titik(e); g.beginPath(); g.moveTo(x, y) }
function gores(e: PointerEvent) { if (!menggambar) return; const g = kanvas.value!.getContext('2d')!, [x, y] = titik(e); g.lineTo(x, y); g.stroke(); adaCoretan.value = true }
function hapusCoretan() { const c = kanvas.value!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); adaCoretan.value = false }
async function simpanBa() {
  await jalankan(() => api.post(`/pasang-baru/order/${id.value}/ba`, { nama: fb.nama, jabatan: fb.jabatan || undefined, nama_next1: fb.nama_next1 || undefined, ttd: kanvas.value!.toDataURL('image/png') }))
  fb.buka = false
}
const cetakBa = () => printBaAktivasi(o.value)

// ── Dokumen ──────────────────────────────────────────────────────────────────
const dokumen = computed<any[]>(() => (o.value?.site?.dokumen || []).filter((d: any) => d.id_pb === o.value.id_pb || !d.id_pb))
const dok = (jenis: string) => dokumen.value.filter((d) => d.jenis === jenis)
const NAMA_DOK: Record<string, string> = { FAB: 'FAB (Formulir Aktivasi Berlangganan)', BA: 'Berita Acara aktivasi', TOPOLOGI: 'Topologi', LAIN: 'Lainnya' }
const inputDok = ref<HTMLInputElement | null>(null)
let jenisUnggah = 'LAIN'
function pilihDok(jenis: string) {
  jenisUnggah = jenis
  inputDok.value?.click()
}
async function unggah(ev: Event) {
  const el = ev.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  fd.append('jenis', jenisUnggah)
  jalankan(() => api.post(`/pasang-baru/order/${id.value}/dokumen`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }))
}
async function hapusDok(d: any) {
  if (!(await confirmDialog({ title: 'Hapus dokumen', message: `Hapus ${d.nama_file}?`, variant: 'danger', confirmLabel: 'Hapus' }))) return
  jalankan(() => api.delete(`/pasang-baru/dokumen/${d.id_dokumen}`))
}
const bisaUnggah = computed(() => o.value && !['Draft', 'Batal'].includes(o.value.tahap) && bolehTahap(o.value.tahap))

// ── Finance (ringkasan) ──────────────────────────────────────────────────────
const biayaVendor = computed(() => links.value.reduce((a, l) => a + Number(l.biaya_mrc_vendor), 0))
const deposit = computed(() => links.value.reduce((a, l) => a + Number(l.deposit_nominal), 0))
const margin = computed(() => Number(o.value?.biaya_bulanan || 0) - biayaVendor.value)
const biayaAwal = computed(() => Number(o.value?.ikg_nominal || 0))
const balikModal = computed(() => (margin.value > 0 && biayaAwal.value > 0 ? (biayaAwal.value / margin.value).toFixed(1) : null))

const AKSI: Record<string, string> = {
  buat: 'Dibuat', ubah: 'Diubah', setujui: 'SPH disetujui', serahkan: 'Diserahkan', kembalikan: 'Dikembalikan', batal: 'Dibatalkan', dokumen: 'Dokumen',
}
</script>

<template>
  <div class="page">
    <p v-if="!o" class="muted">Memuat…</p>
    <template v-else>
      <div class="page-header">
        <div>
          <h2 class="page-title">{{ o.nomor_pb }} · {{ o.nama_site }} <span class="badge" :class="KELAS_TAHAP[o.tahap]">{{ o.tahap }}</span></h2>
          <p class="page-subtitle">
            {{ o.sph.pelanggan.nama_pelanggan }} ·
            <a class="tautan" @click="router.push(`/pasang-baru/sph/${o.id_sph}`)">{{ o.sph.nomor_sph }}</a> ·
            <a v-if="o.site" class="tautan" @click="router.push(`/master/site/${o.site.id_site}`)">{{ o.site.kode_site }}</a>
          </p>
        </div>
        <div class="op-tombol">
          <button class="btn btn-ghost" @click="router.push('/pasang-baru')">← Daftar</button>
          <button v-if="bisaBatal" class="btn btn-ghost" :disabled="proses" @click="batalkan">Batalkan</button>
          <button v-if="bisaKembalikan" class="btn btn-ghost" :disabled="proses" @click="kembalikan">↩ Kembalikan ke {{ SEBELUM[o.tahap] }}</button>
          <button v-if="bisaSerahkan" class="btn btn-primary" :disabled="proses || !lengkap" :title="lengkap ? '' : 'Lengkapi syarat dulu'" @click="serahkan">{{ o.tahap === 'Network' ? '✓ Selesai' : '✓ Terpasang → Network' }}</button>
        </div>
      </div>

      <!-- Stepper tahap -->
      <div class="op-step">
        <template v-for="(t, i) in TAHAP_ORDER" :key="t">
          <div class="op-titik" :class="{ lewat: i < idxTahap, kini: i === idxTahap }">
            <span>{{ i < idxTahap ? '✓' : i + 1 }}</span>{{ t }}
          </div>
          <div v-if="i < TAHAP_ORDER.length - 1" class="op-garis" :class="{ lewat: i < idxTahap }"></div>
        </template>
      </div>
      <div v-if="o.tahap === 'Batal'" class="alert alert-danger">Order dibatalkan.</div>
      <div v-else-if="o.tahap === 'Selesai'" class="alert alert-success">
        Order selesai — BA {{ o.ba_nomor }} ditandatangani {{ o.ba_nama }}. Aktivasi site (kontrak, invoice) akan ditata menyusul; site masih berstatus Prospek.
      </div>

      <!-- Syarat tahap sekarang -->
      <div v-if="o.syarat.length" class="op-syarat" :class="{ ok: lengkap }">
        <b>{{ o.tahap === 'Network' ? 'Syarat selesai:' : 'Syarat diserahkan ke Network:' }}</b>
        <span v-for="x in o.syarat" :key="x.label" :class="x.ok ? 'hijau' : 'merah'">{{ x.ok ? '✓' : '✗' }} {{ x.label }}</span>
      </div>

      <div class="op-tab">
        <button v-for="t in TAB" :key="t" :class="{ aktif: tab === t, kini: t === o.tahap }" @click="tab = t">{{ t }}</button>
      </div>

      <!-- OPS: pasang vendor ISP -->
      <template v-if="tab === 'OPS'">
        <div class="detail-section">
          <div class="detail-section-header op-head">
            <b>Link vendor ISP</b>
            <button v-if="bisaUbah('OPS')" class="btn btn-sm btn-ghost" @click="bukaLink()">+ Tambah link</button>
          </div>
          <div class="detail-section-body">
            <p v-if="!links.length" class="muted pusat">Belum ada link vendor.</p>
            <div v-for="l in links" :key="l.id_sumber" class="op-link" :class="{ beres: !kurangLink(l).length }">
              <div class="op-link-atas">
                <div>
                  <b>{{ l.vendor.nama_vendor }}</b> <span class="badge" :class="l.peruntukan_link === 'Main' ? 'badge-blue' : 'badge-gray'">{{ l.peruntukan_link }}</span>
                  <small class="muted"> · {{ l.bandwidth_mbps || '-' }} · {{ fmtRupiah(l.biaya_mrc_vendor) }}/bln</small>
                  <template v-if="Number(l.deposit_nominal)"><small class="muted"> · deposit {{ fmtRupiah(l.deposit_nominal) }} ({{ [l.deposit_jenis, l.deposit_status].filter(Boolean).join(' · ') || '-' }})</small></template>
                </div>
                <div class="op-aksi">
                  <span v-if="!kurangLink(l).length" class="hijau"><b>✓ Lengkap</b></span>
                  <template v-if="bisaUbah('OPS')">
                    <button class="btn btn-sm btn-primary" @click="bukaLink(l)">✏️ Isi data pemasangan</button>
                    <button v-if="l.status_link === 'Rencana'" class="btn btn-sm btn-ghost" title="Hapus link" @click="hapusLink(l)">✕</button>
                  </template>
                </div>
              </div>
              <div class="op-link-isi">
                <div class="op-data">
                  <span><small>ID pelanggan vendor</small><b>{{ l.nomor_pelanggan_isp || '—' }}</b></span>
                  <span><small>Modem terpasang</small><b>{{ l.tgl_mulai ? fmtDate(l.tgl_mulai) : '—' }}</b></span>
                  <span><small>SN modem</small><b>{{ l.sn_modem || '—' }}</b></span>
                  <span><small>Speedtest</small><b v-if="Number(l.speedtest_down)">↓ {{ Number(l.speedtest_down) }} · ↑ {{ Number(l.speedtest_up) }} Mbps<template v-if="l.speedtest_ping != null"> · {{ Number(l.speedtest_ping) }} ms</template></b><b v-else>—</b></span>
                </div>
                <div class="op-foto">
                  <div v-for="j in (['modem', 'speedtest'] as const)" :key="j" class="op-foto-slot">
                    <small>{{ j === 'modem' ? 'Foto modem' : 'Screenshot speedtest' }}</small>
                    <img v-if="l[`foto_${j}`]" :src="l[`foto_${j}`]" :alt="j" @click="lihat = l[`foto_${j}`]" />
                    <div v-else class="op-foto-kosong">belum ada</div>
                    <button v-if="bisaUbah('OPS')" class="btn btn-sm btn-ghost" @click="pilihFoto(l, j)">📷 {{ l[`foto_${j}`] ? 'Ganti' : 'Unggah' }}</button>
                  </div>
                </div>
              </div>
              <p v-if="kurangLink(l).length" class="op-kurang">Belum: {{ kurangLink(l).join(', ') }}</p>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-body">
            <b>IKG — instalasi ke dalam gedung</b> <small class="muted">(dibayar NEXT1 ke pengelola gedung, tidak ditagihkan ke pelanggan)</small>
            <div class="grid-3 op-ikg">
              <div class="form-group"><label class="form-label">Nominal</label><input v-model.number="fo.ikg_nominal" type="number" min="0" class="form-input" :disabled="!bisaUbah('OPS')" /></div>
              <div class="form-group"><label class="form-label">Pengelola gedung</label><input v-model="fo.ikg_pengelola" class="form-input" maxlength="150" :disabled="!bisaUbah('OPS')" /></div>
              <div class="form-group"><label class="form-label">Catatan</label><input v-model="fo.ikg_catatan" class="form-input" maxlength="500" :disabled="!bisaUbah('OPS')" /></div>
            </div>
            <div v-if="bisaUbah('OPS')" class="op-simpan"><button class="btn btn-ghost" :disabled="proses" @click="simpanOps">Simpan IKG</button></div>
          </div>
        </div>
      </template>

      <!-- NETWORK -->
      <template v-if="tab === 'Network'">
        <div v-if="o.tahap === 'OPS'" class="alert alert-info">Tahap Network dimulai setelah OPS menandai vendor ISP terpasang.</div>
        <template v-else>
          <!-- 1. Perangkat -->
          <div class="detail-section">
            <div class="detail-section-header op-head">
              <b>1 · Perangkat</b>
              <button v-if="bisaUbah('Network')" class="btn btn-sm btn-primary" @click="bukaStok">+ Ambil dari stok</button>
            </div>
            <div class="detail-section-body">
              <p v-if="!net.perangkat.length" class="muted op-kosong">Belum ada perangkat. Ambil Mikrotik dari stok gudang — bila stok kosong, ajukan request.</p>
              <div v-for="p in net.perangkat" :key="p.id_pb_perangkat" class="op-perangkat">
                <template v-if="p.aset">
                  <span>🖧 <b>{{ p.aset.nama_perangkat }}</b> <small class="muted">{{ [p.aset.merk, p.aset.tipe_model].filter(Boolean).join(' ') }}</small></span>
                  <small>SN <b>{{ p.aset.serial_number || '-' }}</b> · {{ p.aset.kode_aset }}<template v-if="p.aset.gudang"> · dari {{ p.aset.gudang.nama_gudang }}</template></small>
                </template>
                <template v-else>
                  <span>📝 <b>Request: {{ p.nama_item }}</b></span>
                  <small>
                    Pengajuan #{{ p.pengajuan?.id_pengajuan }} · <b :class="p.pengajuan?.status_pengajuan === 'Ditolak' ? 'merah' : 'kuning'">{{ p.pengajuan?.status_pengajuan || '-' }}</b>
                    <a class="tautan" @click="router.push(`/assets/pengajuan/${p.id_pengajuan}`)"> lihat</a>
                  </small>
                  <button v-if="bisaUbah('Network') && p.pengajuan?.id_aset_hasil" class="btn btn-sm btn-primary" :disabled="proses" @click="pakai(p)">Pakai barang masuk</button>
                </template>
                <button v-if="bisaUbah('Network')" class="btn btn-sm btn-ghost" title="Lepas" :disabled="proses" @click="lepas(p)">✕</button>
              </div>
            </div>
          </div>

          <!-- 2. Pemasangan -->
          <div class="detail-section">
            <div class="detail-section-header"><b>2 · Pemasangan</b></div>
            <div class="detail-section-body">
              <div class="op-metode">
                <button :class="{ aktif: fn.metode === 'Kirim_Vendor' }" :disabled="!bisaUbah('Network') || woSelesai" @click="fn.metode = 'Kirim_Vendor'">
                  🚚 <b>Kirim + vendor teknisi</b><small>Perangkat dikirim via ekspedisi (JNE, TIKI, dll.), dipasang teknisi vendor</small>
                </button>
                <button :class="{ aktif: fn.metode === 'Visit_Internal' }" :disabled="!bisaUbah('Network') || woSelesai" @click="fn.metode = 'Visit_Internal'">
                  👷 <b>Visit teknisi internal</b><small>Masuk antrean Jadwal Visit, teknisi NEXT1 bawa perangkat</small>
                </button>
              </div>

              <div v-if="fn.metode === 'Kirim_Vendor'" class="grid-2 op-form-net">
                <div class="form-group">
                  <label class="form-label form-required">Teknisi vendor</label>
                  <select v-model="fn.id_kontak_teknisi" class="form-input" :disabled="!bisaUbah('Network') || woSelesai">
                    <option value="">— pilih dari kontak teknisi —</option>
                    <option v-for="k in kontakTeknisi" :key="k.id_kontak" :value="k.id_kontak">{{ k.nama }}{{ k.asal_vendor ? ` · ${k.asal_vendor}` : '' }} · {{ k.no_hp }}</option>
                    <option value="baru">+ Teknisi baru (belum ada di kontak)…</option>
                  </select>
                  <small v-if="teknisiDipilih?.keahlian" class="form-hint">Keahlian: {{ teknisiDipilih.keahlian }}</small>
                  <div v-if="fn.id_kontak_teknisi === 'baru'" class="op-baru">
                    <input v-model="fn.baru.nama" class="form-input" maxlength="150" placeholder="Nama teknisi *" />
                    <input v-model="fn.baru.no_hp" class="form-input" maxlength="20" inputmode="tel" placeholder="No. HP / WA * (08…)" />
                    <input v-model="fn.baru.asal_vendor" class="form-input" maxlength="150" placeholder="Asal vendor / tim (opsional)" />
                    <small class="form-hint">Disimpan ke Master Kontak Teknisi.</small>
                  </div>
                </div>
                <div class="grid-2">
                  <div class="form-group"><label class="form-label">Fee vendor</label><input v-model.number="fn.fee_vendor" type="number" min="0" class="form-input" :disabled="!bisaUbah('Network') || woSelesai" /></div>
                  <div class="form-group"><label class="form-label">Jadwal pasang</label><input v-model="fn.tgl_jadwal" type="date" class="form-input" :disabled="!bisaUbah('Network') || woSelesai" /></div>
                </div>
                <div class="grid-2">
                  <div class="form-group">
                    <label class="form-label">Ekspedisi</label>
                    <select v-model="fn.nama_ekspedisi" class="form-input" :disabled="!bisaUbah('Network') || woSelesai">
                      <option value="">— pilih kurir —</option>
                      <option v-if="fn.nama_ekspedisi && !kurir.some((x) => x.name === fn.nama_ekspedisi)" :value="fn.nama_ekspedisi">{{ fn.nama_ekspedisi }}</option>
                      <option v-for="x in kurir" :key="x.code" :value="x.name">{{ x.name }}</option>
                    </select>
                  </div>
                  <div class="form-group"><label class="form-label">No. resi</label><input v-model="fn.nomor_resi" class="form-input" maxlength="100" :disabled="!bisaUbah('Network') || woSelesai" /></div>
                </div>
                <div class="grid-2">
                  <div class="form-group"><label class="form-label">Tgl kirim</label><input v-model="fn.tgl_kirim" type="date" class="form-input" :disabled="!bisaUbah('Network') || woSelesai" /></div>
                  <div class="form-group">
                    <label class="form-label">Status kiriman</label>
                    <select v-model="fn.status_pengiriman" class="form-input" :disabled="!bisaUbah('Network') || woSelesai"><option>Packing</option><option>Dikirim</option><option>Diterima</option><option>Dikembalikan</option></select>
                  </div>
                </div>
              </div>
              <div v-if="fn.metode && bisaUbah('Network') && !woSelesai" class="op-simpan">
                <label v-if="fn.metode === 'Kirim_Vendor'" class="op-wa"><input v-model="fn.kirim_wa" type="checkbox" /> Kirim tugas + link lapangan ke WA teknisi</label>
                <button class="btn btn-primary" :disabled="proses || (fn.metode === 'Kirim_Vendor' && !teknisiSiap)" @click="simpanNetwork">
                  {{ fn.metode === 'Visit_Internal' ? (net.wo ? 'Simpan' : 'Masukkan ke Jadwal Visit') : 'Simpan pengiriman & vendor' }}
                </button>
              </div>

              <div v-if="net.wo && fn.metode === 'Kirim_Vendor' && net.wo.tipe_eksekutor === 'Vendor_Ketiga'" class="op-kurir">
                <div class="op-head">
                  <b>📦 Kurir</b>
                  <span class="op-wo-aksi">
                    <button v-if="kurirAktif || resiManual" class="btn btn-sm btn-ghost" :disabled="proses" :title="resiManual ? 'Lacak lewat BinderByte (kuota 100/bulan, selanjutnya Rp 15)' : ''" @click="lacakKurir">🔄 Lacak resi</button>
                    <button v-if="kurirAktif && ['processing', 'waiting'].includes(kirim.kurir_status) && bisaUbah('Network')" class="btn btn-sm btn-ghost" :disabled="proses" @click="batalKurir">Batalkan order kurir</button>
                    <button v-if="!kurirAktif && bisaUbah('Network') && !woSelesai" class="btn btn-sm btn-primary" @click="bukaKurir = true">Pesan kurir via api.co.id</button>
                  </span>
                </div>
                <template v-if="adaLacak">
                  <p class="op-kurir-info">
                    <b>{{ kirim.nama_ekspedisi }}</b> {{ kirim.kurir_layanan }} · resi <b>{{ kirim.nomor_resi || '(menunggu)' }}</b> ·
                    <span class="badge" :class="['delivered', 'completed'].includes(kirim.kurir_status) ? 'badge-green' : kirim.kurir_status === 'problem' ? 'badge-red' : 'badge-blue'">{{ STATUS_KURIR[kirim.kurir_status] || kirim.kurir_status }}</span>
                    <template v-if="kirim.kurir_biaya"> · ongkir {{ fmtRupiah(kirim.kurir_biaya) }}</template>
                    <small v-if="kirim.kurir_cek_at" class="muted"> · dicek {{ fmtDateTime(kirim.kurir_cek_at) }}</small>
                  </p>
                  <ol v-if="riwayatKurir.length" class="op-lacak">
                    <li v-for="(h, i) in riwayatKurir" :key="i"><small class="muted">{{ fmtDateTime(h.occurred_at) }}</small> · {{ h.message }}</li>
                  </ol>
                  <p class="form-hint">
                    {{ kurirAktif ? 'Order api.co.id — dilacak otomatis tiap 2 jam.' : 'Resi manual — dilacak lewat BinderByte otomatis tiap ±8 jam selama dalam pengiriman (maks 14 hari).' }}
                    Status kiriman ikut diperbarui (Diterima saat paket sampai).
                  </p>
                </template>
                <p v-else-if="resiManual" class="form-hint">Resi {{ kirim.nomor_resi }} ({{ kirim.nama_ekspedisi || 'kurir belum dipilih' }}) — klik <b>Lacak resi</b> untuk cek lewat BinderByte; setelah itu dilacak otomatis selama status kiriman "Dikirim".</p>
                <p v-else class="form-hint">Pesan lewat api.co.id agar resi terisi & dilacak otomatis. Bila dikirim sendiri di loket kurir, pilih kurir & isi resi di atas lalu simpan — bisa dilacak lewat BinderByte.</p>
              </div>

              <div v-if="net.wo" class="op-wo">
                <div>
                  <b>{{ net.wo.nomor_wo }}</b> · <span class="badge" :class="woSelesai ? 'badge-green' : 'badge-blue'">{{ net.wo.status_wo }}</span>
                  <small class="muted">
                    · {{ net.wo.tipe_eksekutor === 'Vendor_Ketiga' ? (net.wo.kontak_teknisi ? `${net.wo.kontak_teknisi.nama} (${net.wo.kontak_teknisi.no_hp})` : `Vendor ${net.wo.vendor?.nama_vendor ?? ''}`) : (net.wo.teknisi?.nama_lengkap || 'belum ada teknisi') }}
                    <template v-if="net.wo.wa_teknisi_at"> · WA terkirim {{ fmtDateTime(net.wo.wa_teknisi_at) }}</template>
                    · {{ net.wo.tgl_jadwal ? fmtDate(net.wo.tgl_jadwal) : 'belum dijadwalkan' }}
                    <template v-if="net.wo.checkin_at"> · check-in {{ fmtDateTime(net.wo.checkin_at) }}</template>
                  </small>
                </div>
                <div class="op-wo-aksi">
                  <a v-if="net.wo.tipe_eksekutor === 'Internal_NEXT1'" class="btn btn-sm btn-ghost" :href="`/jadwal-visit?wo=${net.wo.id_wo}`">📅 Buka di Jadwal Visit</a>
                  <template v-if="net.wo.link_lapangan && net.wo.tipe_eksekutor === 'Vendor_Ketiga' && !woSelesai">
                    <button class="btn btn-sm btn-ghost" @click="salinLink">{{ tersalin ? '✓ Tersalin' : '🔗 Salin link lapangan' }}</button>
                    <button v-if="bisaUbah('Network') && net.wo.kontak_teknisi" class="btn btn-sm btn-ghost" :disabled="proses" @click="kirimWa">💬 {{ net.wo.wa_teknisi_at ? 'Kirim ulang WA' : 'Kirim WA ke teknisi' }}</button>
                    <button v-if="bisaUbah('Network')" class="btn btn-sm btn-ghost" :disabled="proses" @click="selesaiVendor">Tandai selesai</button>
                  </template>
                </div>
                <div v-if="net.wo.foto?.length" class="op-wo-foto">
                  <img v-for="f in net.wo.foto" :key="f.id_foto" :src="f.file_path" :alt="f.jenis_foto" :title="f.jenis_foto" @click="lihat = f.file_path" />
                </div>
                <p v-if="net.wo.tipe_eksekutor === 'Vendor_Ketiga' && !woSelesai" class="form-hint">Vendor melapor check-in, foto, dan tanda tangan BA PIC lewat link lapangan (tanpa login).</p>
              </div>
            </div>
          </div>

          <!-- 3. BA aktivasi -->
          <div class="detail-section">
            <div class="detail-section-header op-head">
              <b>3 · BA aktivasi</b>
              <span class="op-wo-aksi">
                <button v-if="bisaUbah('Network')" class="btn btn-sm btn-ghost" @click="bukaBa">✍ {{ o.ba_ttd ? 'Tanda tangan ulang' : 'Tanda tangan di sini' }}</button>
                <button class="btn btn-sm btn-primary" :disabled="!o.ba_ttd" :title="o.ba_ttd ? '' : 'BA belum ditandatangani'" @click="cetakBa">⬇ Unduh PDF BA</button>
              </span>
            </div>
            <div class="detail-section-body">
              <div v-if="o.ba_ttd" class="op-ba">
                <img :src="o.ba_ttd" alt="TTD pelanggan" @click="lihat = o.ba_ttd" />
                <div>
                  <b>{{ o.ba_nomor }}</b><br />
                  Ditandatangani <b>{{ o.ba_nama }}</b><template v-if="o.ba_jabatan"> ({{ o.ba_jabatan }})</template><br />
                  <small class="muted">{{ fmtDateTime(o.ba_tgl) }} · {{ o.ba_sumber === 'Lapangan' ? 'di lokasi lewat link lapangan' : 'di ERP' }}<template v-if="o.ba_nama_next1"> · pelaksana {{ o.ba_nama_next1 }}</template></small>
                </div>
              </div>
              <p v-else class="muted op-kosong">Belum ditandatangani. Biasanya PIC tanda tangan di HP teknisi saat visit selesai (link lapangan) — otomatis masuk ke sini. Bisa juga tanda tangan langsung di ERP.</p>
            </div>
          </div>
        </template>
      </template>

      <!-- INFO ORDER -->
      <div v-if="tab === 'Info order'" class="detail-section">
        <div class="detail-section-body">
          <div class="grid-2">
            <div>
              <div class="info-row"><span class="info-label">Site</span><span class="info-value"><b>{{ o.nama_site }}</b></span></div>
              <div class="info-row"><span class="info-label">Alamat</span><span class="info-value">{{ o.alamat }}<template v-if="o.lantai_unit"> — {{ o.lantai_unit }}</template><template v-if="o.kota">, {{ o.kota }}</template></span></div>
              <div class="info-row"><span class="info-label">Layanan</span><span class="info-value">{{ o.layanan.nama_layanan }}</span></div>
              <div class="info-row"><span class="info-label">RFS diminta</span><span class="info-value">{{ o.tgl_rfs ? fmtDate(o.tgl_rfs) : '-' }}</span></div>
              <div class="info-row"><span class="info-label">PIC store</span><span class="info-value">{{ o.pic_store_nama || '-' }} {{ o.pic_store_hp || '' }}</span></div>
              <div class="info-row"><span class="info-label">PIC pelanggan</span><span class="info-value">{{ o.sph.nama_pic }} {{ o.sph.telp_pic || '' }} {{ o.sph.email_pic || '' }}</span></div>
              <div class="info-row"><span class="info-label">Sales</span><span class="info-value">{{ o.sales || '-' }}</span></div>
            </div>
            <div>
              <div class="info-row"><span class="info-label">Biaya bulanan</span><span class="info-value"><b>{{ fmtRupiah(o.biaya_bulanan) }}</b></span></div>
              <div class="info-row"><span class="info-label">Biaya instalasi</span><span class="info-value">{{ fmtRupiah(o.biaya_instalasi) }}</span></div>
              <div class="info-row"><span class="info-label">Lama berlangganan</span><span class="info-value">{{ o.sph.durasi_bulan }} bulan</span></div>
              <div class="info-row"><span class="info-label">Modal vendor / bulan</span><span class="info-value">{{ fmtRupiah(biayaVendor) }}</span></div>
              <div class="info-row"><span class="info-label">Margin / bulan</span><span class="info-value"><b :class="margin < 0 ? 'merah' : 'hijau'">{{ fmtRupiah(margin) }}</b><template v-if="Number(o.biaya_bulanan)"> ({{ Math.round((margin / Number(o.biaya_bulanan)) * 100) }}%)</template></span></div>
              <div class="info-row"><span class="info-label">IKG (sekali)</span><span class="info-value">{{ fmtRupiah(o.ikg_nominal) }}<template v-if="balikModal"> · balik modal ± {{ balikModal }} bln</template></span></div>
              <div class="info-row"><span class="info-label">Deposit vendor</span><span class="info-value">{{ fmtRupiah(deposit) }}</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- DOKUMEN -->
      <div v-if="tab === 'Dokumen'" class="detail-section">
        <div class="detail-section-body">
          <div v-for="j in ['LAIN', 'FAB', 'BA', 'TOPOLOGI'].filter((x) => x === 'LAIN' || dok(x).length)" :key="j" class="op-dok">
            <b>{{ NAMA_DOK[j] }}</b>
            <span v-for="d in dok(j)" :key="d.id_dokumen" class="op-file">
              <a :href="d.url_file" target="_blank" rel="noopener">📄 {{ d.nama_file }}</a>
              <small class="muted">{{ fmtDateTime(d.created_at) }}</small>
              <button v-if="bisaUnggah" class="btn btn-sm btn-ghost" title="Hapus" @click="hapusDok(d)">✕</button>
            </span>
            <span v-if="!dok(j).length" class="muted">—</span>
            <button v-if="bisaUnggah" class="btn btn-sm btn-ghost" @click="pilihDok(j)">⬆ Unggah</button>
          </div>
          <p class="form-hint">PDF, JPG, atau PNG maks 15 MB. Dokumen juga tampil di detail site.</p>
        </div>
      </div>

      <!-- RIWAYAT -->
      <div v-if="tab === 'Riwayat'" class="detail-section">
        <div class="detail-section-body">
          <p v-for="r in o.riwayat" :key="r.id_riwayat" class="op-riwayat">
            <small class="muted">{{ fmtDateTime(r.created_at) }}</small> ·
            <b>{{ AKSI[r.aksi] || r.aksi }}</b><template v-if="r.ke_tahap"> {{ r.dari_tahap }} → {{ r.ke_tahap }}</template>
            oleh {{ r.oleh || '-' }}<template v-if="r.catatan"> — {{ r.catatan }}</template>
          </p>
          <p v-if="!o.riwayat.length" class="muted">Belum ada riwayat.</p>
        </div>
      </div>

      <input ref="inputDok" type="file" accept=".pdf,.jpg,.jpeg,.png" hidden @change="unggah" />
      <input ref="inputFoto" type="file" accept="image/jpeg,image/png" hidden @change="unggahFoto" />
      <div v-if="lihat" class="modal-overlay" @click="lihat = ''"><img :src="lihat" class="op-besar" alt="foto" /></div>
    </template>

    <KurirApiModal v-if="bukaKurir && o" :order="o" @tutup="bukaKurir = false" @selesai="bukaKurir = false; muat()" />

    <!-- Pilih perangkat dari stok -->
    <div v-if="stok.buka" class="modal-overlay" @click.self="stok.buka = false">
      <div class="modal modal-lg">
        <div class="modal-header"><h3 class="modal-title">Ambil perangkat dari stok gudang</h3><button class="btn-modal-close" @click="stok.buka = false">×</button></div>
        <div class="modal-body">
          <input v-model="stok.cari" class="form-input" placeholder="Cari nama / tipe / SN… (kosong = Mikrotik & Router)" @input="cariStok" />
          <div class="table-wrap op-stok">
            <table class="data-table">
              <thead><tr><th>Perangkat</th><th>SN / kode</th><th>Gudang</th><th>Stok</th><th></th></tr></thead>
              <tbody>
                <tr v-if="!stok.memuat && !stok.isi.length"><td colspan="5" class="pusat"><b class="merah">Stok kosong.</b> Ajukan request perangkat di bawah.</td></tr>
                <tr v-for="a in stok.isi" :key="a.id_aset">
                  <td><b>{{ a.nama_perangkat }}</b><br /><small class="muted">{{ [a.kategori, a.merk, a.tipe_model].filter(Boolean).join(' · ') }} · {{ a.kondisi }}</small></td>
                  <td><small>{{ a.serial_number || '-' }}<br /><span class="muted">{{ a.kode_aset }}</span></small></td>
                  <td><small>{{ a.gudang?.nama_gudang || '-' }}</small></td>
                  <td>{{ a.is_serialized ? 1 : a.stok_jumlah }}</td>
                  <td><button class="btn btn-sm btn-primary" :disabled="proses" @click="ambil(a)">Ambil</button></td>
                </tr>
              </tbody>
            </table>
            <p v-if="stok.memuat" class="muted pusat">Memuat…</p>
          </div>
        </div>
        <div class="modal-footer"><span class="muted">Tidak ada yang cocok?</span><button class="btn btn-ghost" @click="bukaRequest">📝 Request perangkat (stok kosong)</button></div>
      </div>
    </div>

    <!-- Request perangkat -->
    <div v-if="req.buka" class="modal-overlay" @click.self="req.buka = false">
      <div class="modal">
        <div class="modal-header"><h3 class="modal-title">Request perangkat</h3><button class="btn-modal-close" @click="req.buka = false">×</button></div>
        <div class="modal-body">
          <p class="form-hint">Masuk ke Pengajuan Aset untuk disetujui Director / Manager Ops. Setelah barang masuk gudang, klik "Pakai barang masuk".</p>
          <div class="form-group"><label class="form-label form-required">Nama perangkat</label><input v-model="req.nama_item" class="form-input" maxlength="150" /></div>
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Jumlah</label><input v-model.number="req.jumlah" type="number" min="1" max="100" class="form-input" /></div>
            <div class="form-group"><label class="form-label">Estimasi harga</label><input v-model.number="req.estimasi_harga" type="number" min="0" class="form-input" /></div>
          </div>
          <div class="form-group"><label class="form-label">Link marketplace</label><input v-model="req.link_marketplace" class="form-input" maxlength="500" /></div>
          <div class="form-group"><label class="form-label">Catatan</label><textarea v-model="req.alasan" rows="2" class="form-textarea" maxlength="2000"></textarea></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" @click="req.buka = false">Batal</button><button class="btn btn-primary" :disabled="req.nama_item.trim().length < 2 || proses" @click="kirimRequest">Ajukan</button></div>
      </div>
    </div>

    <!-- Tanda tangan BA -->
    <div v-if="fb.buka" class="modal-overlay" @click.self="fb.buka = false">
      <div class="modal">
        <div class="modal-header"><h3 class="modal-title">Tanda tangan BA aktivasi</h3><button class="btn-modal-close" @click="fb.buka = false">×</button></div>
        <div class="modal-body">
          <div class="grid-2">
            <div class="form-group"><label class="form-label form-required">Nama penandatangan (pelanggan)</label><input v-model="fb.nama" class="form-input" maxlength="150" /></div>
            <div class="form-group"><label class="form-label">Jabatan</label><input v-model="fb.jabatan" class="form-input" maxlength="100" placeholder="mis. PIC Store" /></div>
          </div>
          <label class="form-label">Tanda tangan</label>
          <canvas ref="kanvas" class="op-kanvas" @pointerdown.prevent="mulaiGores" @pointermove.prevent="gores" @pointerup="menggambar = false" @pointercancel="menggambar = false" @pointerleave="menggambar = false"></canvas>
          <button class="btn btn-sm btn-ghost" @click="hapusCoretan">Hapus coretan</button>
          <div class="form-group"><label class="form-label">Nama pelaksana NEXT1 (opsional)</label><input v-model="fb.nama_next1" class="form-input" maxlength="150" placeholder="kosong = nama Anda" /></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" @click="fb.buka = false">Batal</button><button class="btn btn-primary" :disabled="!adaCoretan || fb.nama.trim().length < 2 || proses" @click="simpanBa">Simpan tanda tangan</button></div>
      </div>
    </div>

    <!-- Form link vendor -->
    <div v-if="fl.buka" class="modal-overlay" @click.self="fl.buka = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3 class="modal-title">{{ fl.id_sumber ? 'Ubah' : 'Tambah' }} link vendor ISP</h3>
          <button class="btn-modal-close" @click="fl.buka = false">×</button>
        </div>
        <div class="modal-body">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label form-required">Vendor ISP</label>
              <select v-model="fl.id_vendor_isp" class="form-input">
                <option value="">— pilih —</option>
                <option v-for="v in vendor" :key="v.id_vendor" :value="v.id_vendor">{{ v.nama_vendor }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Peruntukan</label>
              <select v-model="fl.peruntukan_link" class="form-input"><option>Main</option><option>Backup</option></select>
            </div>
            <div class="form-group"><label class="form-label form-required">ID pelanggan vendor</label><input v-model="fl.nomor_pelanggan_isp" class="form-input" maxlength="100" /></div>
            <div class="form-group"><label class="form-label">Layanan / bandwidth vendor</label><input v-model="fl.bandwidth_mbps" class="form-input" maxlength="30" placeholder="mis. 50 Mbps" /></div>
            <div class="form-group"><label class="form-label form-required">Tanggal modem terpasang</label><input v-model="fl.tgl_mulai" type="date" class="form-input" /></div>
            <div class="form-group"><label class="form-label">Lama berlangganan vendor (bulan)</label><input v-model.number="fl.durasi_bulan" type="number" min="1" max="120" class="form-input" /></div>
            <div class="form-group"><label class="form-label form-required">Biaya langganan vendor / bulan</label><input v-model.number="fl.biaya_mrc_vendor" type="number" min="0" class="form-input" /></div>
            <div class="form-group"><label class="form-label form-required">SN modem</label><input v-model="fl.sn_modem" class="form-input" maxlength="100" /></div>
            <div class="form-group">
              <label class="form-label form-required">Hasil speedtest</label>
              <div class="op-speed">
                <label>↓ <input v-model.number="fl.speedtest_down" type="number" min="0" step="0.01" class="form-input" placeholder="Download" /></label>
                <label>↑ <input v-model.number="fl.speedtest_up" type="number" min="0" step="0.01" class="form-input" placeholder="Upload" /></label>
                <label>⏱ <input v-model.number="fl.speedtest_ping" type="number" min="0" step="0.1" class="form-input" placeholder="Ping ms" /></label>
              </div>
              <small class="form-hint">Mbps · foto modem & screenshot speedtest diunggah di kartu link setelah disimpan</small>
            </div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Deposit ke vendor</label><input v-model.number="fl.deposit_nominal" type="number" min="0" class="form-input" /></div>
              <div class="form-group">
                <label class="form-label">Sifat deposit</label>
                <select v-model="fl.deposit_jenis" class="form-input"><option value="">—</option><option v-for="d in DEPOSIT_JENIS" :key="d">{{ d }}</option></select>
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Tgl bayar deposit</label><input v-model="fl.deposit_tgl" type="date" class="form-input" /></div>
              <div class="form-group">
                <label class="form-label">Status deposit</label>
                <select v-model="fl.deposit_status" class="form-input"><option value="">—</option><option>Ditahan</option><option>Dikembalikan</option></select>
              </div>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Catatan</label><textarea v-model="fl.catatan" rows="2" class="form-textarea" maxlength="2000"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="fl.buka = false">Batal</button>
          <button class="btn btn-primary" :disabled="!fl.id_vendor_isp || proses" @click="simpanLink">Simpan</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.op-tombol { display: flex; gap: 6px; flex-wrap: wrap; }
.tautan { color: var(--primary, #2563eb); cursor: pointer; }
.op-step { display: flex; align-items: center; margin: 8px 0 14px; overflow-x: auto; }
.op-titik { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #94a3b8; white-space: nowrap; }
.op-titik span { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #e2e8f0; color: #64748b; font-size: 12px; }
.op-titik.lewat { color: #15803d; }
.op-titik.lewat span { background: #dcfce7; color: #15803d; }
.op-titik.kini { color: #1d4ed8; }
.op-titik.kini span { background: #2563eb; color: #fff; }
.op-garis { flex: 1; min-width: 20px; height: 2px; background: #e2e8f0; margin: 0 8px; }
.op-garis.lewat { background: #86efac; }
.op-syarat { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 10px 12px; border-radius: 8px; background: #fef3c7; margin-bottom: 12px; font-size: 13px; }
.op-syarat.ok { background: #dcfce7; }
.op-tab { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0; margin-bottom: 12px; }
.op-tab button { background: none; border: none; padding: 8px 14px; cursor: pointer; font-weight: 600; color: var(--text-3); border-bottom: 2px solid transparent; }
.op-tab button.aktif { color: var(--primary, #2563eb); border-bottom-color: var(--primary, #2563eb); }
.op-tab button.kini::after { content: ' ●'; color: #f59e0b; }
.op-head { display: flex; justify-content: space-between; align-items: center; }
.op-angka { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 14px 0; font-size: 13.5px; }
.op-dok { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin: 10px 0; font-size: 13.5px; }
.op-dok b { min-width: 120px; }
.op-file { display: inline-flex; gap: 6px; align-items: center; }
.op-simpan { display: flex; justify-content: flex-end; margin-top: 12px; }
.op-ikg { margin-top: 8px; }
.op-aksi { white-space: nowrap; }
.op-riwayat { margin: 4px 0; font-size: 13px; }
.op-link { border: 1px solid var(--border, #e2e8f0); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.op-link.beres { border-left-color: #16a34a; }
.op-link-atas { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: center; }
.op-link-isi { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; }
.op-data { flex: 1 1 260px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
.op-data span { display: flex; flex-direction: column; font-size: 13px; }
.op-data small, .op-foto-slot small { color: var(--text-3); font-size: 11.5px; }
.op-foto { display: flex; gap: 10px; flex-wrap: wrap; }
.op-foto-slot { display: flex; flex-direction: column; gap: 4px; width: 140px; }
.op-foto-slot img { width: 140px; height: 100px; object-fit: cover; border-radius: 6px; cursor: zoom-in; border: 1px solid var(--border, #e2e8f0); }
.op-foto-kosong { width: 140px; height: 100px; border: 1px dashed #cbd5e1; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: 12px; }
.op-kurang { margin: 8px 0 0; font-size: 12.5px; color: #b45309; }
.op-speed { display: flex; gap: 6px; }
.op-speed label { display: flex; align-items: center; gap: 4px; flex: 1; }
.op-speed .form-input { min-width: 0; }
.op-kosong { margin: 0; font-size: 13px; }
.op-kurir { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; }
.op-kurir-info { margin: 6px 0; font-size: 13.5px; }
.op-lacak { margin: 6px 0; padding-left: 18px; font-size: 13px; }
.op-lacak li:first-child { font-weight: 600; }
.op-baru { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding: 8px; border: 1px dashed #93c5fd; border-radius: 8px; }
.op-wa { display: flex; gap: 6px; align-items: center; font-size: 13px; margin-right: auto; }
.op-perangkat { display: flex; align-items: center; gap: 4px 12px; flex-wrap: wrap; padding: 8px 10px; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; margin-bottom: 6px; }
.op-perangkat > span { flex: 1 1 220px; }
.op-metode { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.op-metode button { text-align: left; border: 1.5px solid var(--border, #e2e8f0); background: var(--surface, #fff); border-radius: 10px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; color: inherit; }
.op-metode button small { color: var(--text-3); font-size: 12px; }
.op-metode button.aktif { border-color: #2563eb; background: rgba(37, 99, 235, .06); }
.op-metode button:disabled { cursor: default; }
.op-wo { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: var(--bg-2, #f8fafc); display: flex; flex-direction: column; gap: 8px; }
.op-wo-aksi { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.op-wo-foto { display: flex; gap: 6px; flex-wrap: wrap; }
.op-wo-foto img { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; cursor: zoom-in; }
.op-ba { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 13.5px; }
.op-ba img { width: 180px; height: 90px; object-fit: contain; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; background: #fff; cursor: zoom-in; }
.op-kanvas { width: 100%; height: 180px; border: 1.5px dashed #94a3b8; border-radius: 10px; background: #fff; touch-action: none; display: block; margin-bottom: 6px; }
.op-stok { max-height: 50vh; overflow: auto; margin-top: 8px; }
.kuning { color: #b45309; }
@media (max-width: 700px) { .op-metode { grid-template-columns: 1fr; } }
.op-besar { max-width: 92vw; max-height: 88vh; border-radius: 8px; margin: auto; display: block; }
.hijau { color: #15803d; }
.merah { color: #dc2626; }
.kanan { text-align: right; }
.pusat { text-align: center; padding: 14px; }
.muted { color: var(--text-3); }
</style>
