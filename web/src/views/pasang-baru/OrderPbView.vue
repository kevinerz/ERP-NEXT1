<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDate, fmtDateTime, fmtRupiah } from '@/composables/useFormat'
import { alertError, confirmDialog, promptDialog } from '@/composables/useDialog'
import { KELAS_TAHAP, TAHAP_ORDER, type Vendor } from './pb'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))
const o = ref<any>(null)
const vendor = ref<Vendor[]>([])
const tab = ref('Sales')
const proses = ref(false)

async function muat(gantiTab = false) {
  try {
    const { data } = await api.get(`/pasang-baru/order/${id.value}`)
    o.value = data.data
    isiForm()
    if (gantiTab) tab.value = TAB.includes(o.value.tahap) ? o.value.tahap : 'Sales'
  } catch (e) {
    alertError(e, 'Gagal memuat order')
  }
}
onMounted(async () => {
  api.get('/pasang-baru/referensi').then(({ data }) => { vendor.value = data.data.vendor }).catch(() => undefined)
  await muat(true)
})

const TAB = ['Sales', 'OPS', 'Instalasi', 'NOC', 'Finance', 'Dokumen', 'Riwayat']
const bolehTahap = (t: string) => !!o.value?.hak.tahap.includes(t)
const bisaUbah = (t: string) => o.value?.tahap === t && bolehTahap(t)
const idxTahap = computed(() => TAHAP_ORDER.indexOf(o.value?.tahap))
const bisaSerahkan = computed(() => ['Sales', 'OPS', 'Instalasi', 'NOC'].includes(o.value?.tahap) && bolehTahap(o.value.tahap))
const bisaKembalikan = computed(() => ['OPS', 'Instalasi', 'NOC', 'Finance'].includes(o.value?.tahap) && bolehTahap(o.value.tahap))
const bisaBatal = computed(() => !['Aktif', 'Batal', 'Draft'].includes(o.value?.tahap) && bolehTahap('Sales'))
const lengkap = computed(() => (o.value?.syarat || []).every((x: any) => x.ok))
const BERIKUT: Record<string, string> = { Sales: 'OPS', OPS: 'Instalasi', Instalasi: 'NOC', NOC: 'Finance' }
const SEBELUM: Record<string, string> = { OPS: 'Sales', Instalasi: 'OPS', NOC: 'Instalasi', Finance: 'NOC' }

async function jalankan(fn: () => Promise<any>, gantiTab = false) {
  proses.value = true
  try { await fn(); await muat(gantiTab) } catch (e) { alertError(e) } finally { proses.value = false }
}
async function serahkan() {
  const ke = BERIKUT[o.value.tahap]
  const catatan = await promptDialog({ title: `Serahkan ke ${ke}`, label: 'Catatan untuk divisi berikutnya (opsional)', confirmLabel: 'Serahkan' })
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

// ── Tab Sales ────────────────────────────────────────────────────────────────
const fs = reactive({ nama_site: '', alamat: '', lantai_unit: '', kota: '', tgl_rfs: '', pic_store_nama: '', pic_store_hp: '' })
// ── Tab OPS (IKG) ────────────────────────────────────────────────────────────
const fo = reactive({ ikg_nominal: 0, ikg_pengelola: '', ikg_catatan: '' })
function isiForm() {
  const x = o.value
  Object.assign(fs, {
    nama_site: x.nama_site, alamat: x.alamat, lantai_unit: x.lantai_unit || '', kota: x.kota || '',
    tgl_rfs: x.tgl_rfs ? x.tgl_rfs.slice(0, 10) : '', pic_store_nama: x.pic_store_nama || '', pic_store_hp: x.pic_store_hp || '',
  })
  Object.assign(fo, { ikg_nominal: Number(x.ikg_nominal), ikg_pengelola: x.ikg_pengelola || '', ikg_catatan: x.ikg_catatan || '' })
}
const simpanSales = () => jalankan(() => api.patch(`/pasang-baru/order/${id.value}/sales`, { ...fs, tgl_rfs: fs.tgl_rfs || null }))
const simpanOps = () => jalankan(() => api.patch(`/pasang-baru/order/${id.value}/ops`, { ...fo, ikg_nominal: Number(fo.ikg_nominal) || 0 }))

// ── Link vendor ISP ──────────────────────────────────────────────────────────
const links = computed<any[]>(() => o.value?.site?.sumber_internet || [])
const kosongLink = () => ({
  id_sumber: null as number | null, id_vendor_isp: '' as number | '', peruntukan_link: 'Main', nomor_pelanggan_isp: '', bandwidth_mbps: '',
  biaya_mrc_vendor: 0, tgl_mulai: '', durasi_bulan: 12 as number | '', sn_modem: '', deposit_nominal: 0, deposit_tgl: '', deposit_status: '', catatan: '',
})
const fl = reactive({ buka: false, ...kosongLink() })
function bukaLink(l?: any) {
  Object.assign(fl, kosongLink(), { buka: true })
  if (l) {
    Object.assign(fl, {
      id_sumber: l.id_sumber, id_vendor_isp: l.id_vendor_isp, peruntukan_link: l.peruntukan_link, nomor_pelanggan_isp: l.nomor_pelanggan_isp || '',
      bandwidth_mbps: l.bandwidth_mbps || '', biaya_mrc_vendor: Number(l.biaya_mrc_vendor), tgl_mulai: l.tgl_mulai ? l.tgl_mulai.slice(0, 10) : '',
      durasi_bulan: l.durasi_bulan || '', sn_modem: l.sn_modem || '', deposit_nominal: Number(l.deposit_nominal),
      deposit_tgl: l.deposit_tgl ? l.deposit_tgl.slice(0, 10) : '', deposit_status: l.deposit_status || '', catatan: l.catatan || '',
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
  }
  await jalankan(() => (id_sumber ? api.patch(`/pasang-baru/link/${id_sumber}`, body) : api.post(`/pasang-baru/order/${id.value}/link`, body)))
  fl.buka = false
}
async function hapusLink(l: any) {
  if (!(await confirmDialog({ title: 'Hapus link', message: `Hapus link ${l.vendor.nama_vendor}?`, variant: 'danger', confirmLabel: 'Hapus' }))) return
  jalankan(() => api.delete(`/pasang-baru/link/${l.id_sumber}`))
}

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
const bisaUnggah = computed(() => o.value && !['Draft', 'Batal'].includes(o.value.tahap) && bolehTahap(o.value.tahap === 'Aktif' ? 'Finance' : o.value.tahap))

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
          <button class="btn btn-ghost" @click="router.push('/pasang-baru?tab=' + (o.tahap === 'Draft' ? 'SPH' : o.tahap))">← Daftar</button>
          <button v-if="bisaBatal" class="btn btn-ghost" :disabled="proses" @click="batalkan">Batalkan</button>
          <button v-if="bisaKembalikan" class="btn btn-ghost" :disabled="proses" @click="kembalikan">↩ Kembalikan ke {{ SEBELUM[o.tahap] }}</button>
          <button v-if="bisaSerahkan" class="btn btn-primary" :disabled="proses || !lengkap" @click="serahkan">Serahkan ke {{ BERIKUT[o.tahap] }} ➜</button>
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

      <!-- Syarat tahap sekarang -->
      <div v-if="o.syarat.length" class="op-syarat" :class="{ ok: lengkap }">
        <b>Syarat diserahkan ke {{ BERIKUT[o.tahap] }}:</b>
        <span v-for="x in o.syarat" :key="x.label" :class="x.ok ? 'hijau' : 'merah'">{{ x.ok ? '✓' : '✗' }} {{ x.label }}</span>
      </div>

      <div class="op-tab">
        <button v-for="t in TAB" :key="t" :class="{ aktif: tab === t, kini: t === o.tahap }" @click="tab = t">{{ t }}</button>
      </div>

      <!-- SALES -->
      <div v-if="tab === 'Sales'" class="detail-section">
        <div class="detail-section-body">
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Nama site</label><input v-model="fs.nama_site" class="form-input" :disabled="!bisaUbah('Sales')" /></div>
            <div class="form-group"><label class="form-label">Layanan</label><input :value="o.layanan.nama_layanan" class="form-input" disabled /></div>
            <div class="form-group"><label class="form-label">Alamat pemasangan</label><textarea v-model="fs.alamat" rows="2" class="form-textarea" :disabled="!bisaUbah('Sales')"></textarea></div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Lantai / unit</label><input v-model="fs.lantai_unit" class="form-input" :disabled="!bisaUbah('Sales')" /></div>
              <div class="form-group"><label class="form-label">Kota</label><input v-model="fs.kota" class="form-input" :disabled="!bisaUbah('Sales')" /></div>
            </div>
            <div class="form-group"><label class="form-label">RFS / tanggal aktivasi diminta</label><input v-model="fs.tgl_rfs" type="date" class="form-input" :disabled="!bisaUbah('Sales')" /></div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">PIC store</label><input v-model="fs.pic_store_nama" class="form-input" :disabled="!bisaUbah('Sales')" /></div>
              <div class="form-group"><label class="form-label">HP PIC store</label><input v-model="fs.pic_store_hp" class="form-input" :disabled="!bisaUbah('Sales')" /></div>
            </div>
          </div>
          <div class="op-angka">
            <span>Biaya bulanan <b>{{ fmtRupiah(o.biaya_bulanan) }}</b></span>
            <span>Biaya instalasi <b>{{ fmtRupiah(o.biaya_instalasi) }}</b></span>
            <span>Lama berlangganan <b>{{ o.sph.durasi_bulan }} bulan</b></span>
            <span>PIC pelanggan <b>{{ o.sph.nama_pic }}</b> {{ o.sph.telp_pic }} {{ o.sph.email_pic }}</span>
          </div>
          <div class="op-dok">
            <b>FAB</b>
            <a v-for="d in dok('FAB')" :key="d.id_dokumen" :href="d.url_file" target="_blank" rel="noopener">📄 {{ d.nama_file }}</a>
            <span v-if="!dok('FAB').length" class="merah">belum ada</span>
            <button v-if="bisaUbah('Sales')" class="btn btn-sm btn-ghost" @click="pilihDok('FAB')">⬆ Unggah FAB</button>
          </div>
          <div v-if="bisaUbah('Sales')" class="op-simpan"><button class="btn btn-primary" :disabled="proses" @click="simpanSales">Simpan</button></div>
        </div>
      </div>

      <!-- OPS -->
      <div v-if="tab === 'OPS'" class="detail-section">
        <div class="detail-section-header op-head">
          <b>Link vendor ISP</b>
          <button v-if="bisaUbah('OPS')" class="btn btn-sm btn-primary" @click="bukaLink()">+ Tambah link</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Vendor</th><th>ID pelanggan vendor</th><th>Layanan</th><th>Aktivasi vendor</th><th class="kanan">Biaya/bln</th><th>SN modem</th><th class="kanan">Deposit</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!links.length"><td colspan="8" class="muted pusat">Belum ada link vendor.</td></tr>
              <tr v-for="l in links" :key="l.id_sumber">
                <td><b>{{ l.vendor.nama_vendor }}</b><br /><small class="muted">{{ l.peruntukan_link }} · {{ l.status_link }}</small></td>
                <td>{{ l.nomor_pelanggan_isp || '-' }}</td>
                <td>{{ l.bandwidth_mbps || '-' }}</td>
                <td>{{ l.tgl_mulai ? fmtDate(l.tgl_mulai) : '-' }}<br /><small v-if="l.durasi_bulan" class="muted">{{ l.durasi_bulan }} bln</small></td>
                <td class="kanan">{{ fmtRupiah(l.biaya_mrc_vendor) }}</td>
                <td>{{ l.sn_modem || '-' }}</td>
                <td class="kanan">{{ Number(l.deposit_nominal) ? fmtRupiah(l.deposit_nominal) : '-' }}<br /><small v-if="l.deposit_status" class="muted">{{ l.deposit_status }}</small></td>
                <td class="op-aksi">
                  <template v-if="bisaUbah('OPS')">
                    <button class="btn btn-sm btn-ghost" @click="bukaLink(l)">✏️</button>
                    <button v-if="l.status_link === 'Rencana'" class="btn btn-sm btn-ghost" @click="hapusLink(l)">✕</button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="detail-section-body">
          <b>IKG — instalasi ke dalam gedung</b> <small class="muted">(dibayar NEXT1 ke pengelola gedung, tidak ditagihkan ke pelanggan)</small>
          <div class="grid-3 op-ikg">
            <div class="form-group"><label class="form-label">Nominal</label><input v-model.number="fo.ikg_nominal" type="number" min="0" class="form-input" :disabled="!bisaUbah('OPS')" /></div>
            <div class="form-group"><label class="form-label">Pengelola gedung</label><input v-model="fo.ikg_pengelola" class="form-input" maxlength="150" :disabled="!bisaUbah('OPS')" /></div>
            <div class="form-group"><label class="form-label">Catatan</label><input v-model="fo.ikg_catatan" class="form-input" maxlength="500" :disabled="!bisaUbah('OPS')" /></div>
          </div>
          <div v-if="bisaUbah('OPS')" class="op-simpan"><button class="btn btn-primary" :disabled="proses" @click="simpanOps">Simpan IKG</button></div>
        </div>
      </div>

      <!-- INSTALASI & NOC (tahap 2 akan disambungkan ke modul Pemasangan, perangkat & PRTG) -->
      <div v-if="tab === 'Instalasi' || tab === 'NOC'" class="detail-section">
        <div class="detail-section-body">
          <div class="alert alert-info">
            {{ tab === 'Instalasi'
              ? 'Penjadwalan teknisi (NEXT1 / vendor pihak 3), foto, perangkat dari gudang, dan BA tanda tangan di HP menyusul di tahap 2. Untuk sementara unggah BA aktivasi di sini.'
              : 'Data perangkat (SN, IP, MAC) dan sensor PRTG menyusul di tahap 2. Untuk sementara unggah topologi di sini.' }}
          </div>
          <div class="op-dok">
            <b>{{ tab === 'Instalasi' ? 'BA aktivasi' : 'Topologi' }}</b>
            <a v-for="d in dok(tab === 'Instalasi' ? 'BA' : 'TOPOLOGI')" :key="d.id_dokumen" :href="d.url_file" target="_blank" rel="noopener">📄 {{ d.nama_file }}</a>
            <span v-if="!dok(tab === 'Instalasi' ? 'BA' : 'TOPOLOGI').length" class="merah">belum ada</span>
            <button v-if="bisaUbah(tab)" class="btn btn-sm btn-ghost" @click="pilihDok(tab === 'Instalasi' ? 'BA' : 'TOPOLOGI')">⬆ Unggah</button>
          </div>
        </div>
      </div>

      <!-- FINANCE -->
      <div v-if="tab === 'Finance'" class="detail-section">
        <div class="detail-section-body">
          <div class="grid-2">
            <table class="data-table">
              <thead><tr><th colspan="2">Pendapatan</th></tr></thead>
              <tbody>
                <tr><td>Biaya bulanan</td><td class="kanan">{{ fmtRupiah(o.biaya_bulanan) }}</td></tr>
                <tr><td>Biaya instalasi</td><td class="kanan">{{ fmtRupiah(o.biaya_instalasi) }}</td></tr>
              </tbody>
            </table>
            <table class="data-table">
              <thead><tr><th colspan="2">Biaya</th></tr></thead>
              <tbody>
                <tr><td>Vendor ISP / bulan</td><td class="kanan">{{ fmtRupiah(biayaVendor) }}</td></tr>
                <tr><td>IKG (sekali)</td><td class="kanan">{{ fmtRupiah(o.ikg_nominal) }}</td></tr>
                <tr><td>Deposit vendor <small class="muted">(dicatat, bukan biaya)</small></td><td class="kanan">{{ fmtRupiah(deposit) }}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="op-angka">
            <span>Margin bulanan <b :class="margin < 0 ? 'merah' : 'hijau'">{{ fmtRupiah(margin) }}</b>
              <template v-if="Number(o.biaya_bulanan)"> ({{ Math.round((margin / Number(o.biaya_bulanan)) * 100) }}%)</template></span>
            <span v-if="balikModal">Balik modal IKG ± <b>{{ balikModal }} bulan</b></span>
          </div>
          <div class="op-dok">
            <b>Dokumen</b>
            <span :class="dok('FAB').length ? 'hijau' : 'merah'">FAB {{ dok('FAB').length ? '✓' : '✗' }}</span>
            <span :class="dok('BA').length ? 'hijau' : 'merah'">BA {{ dok('BA').length ? '✓' : '✗' }}</span>
            <span :class="dok('TOPOLOGI').length ? 'hijau' : 'merah'">Topologi {{ dok('TOPOLOGI').length ? '✓' : '✗' }}</span>
          </div>
          <div class="alert alert-info">Aktivasi (kontrak, site aktif, invoice pertama, kirim BA ke pelanggan) menyusul di tahap 3.</div>
        </div>
      </div>

      <!-- DOKUMEN -->
      <div v-if="tab === 'Dokumen'" class="detail-section">
        <div class="detail-section-body">
          <div v-for="j in ['FAB', 'BA', 'TOPOLOGI', 'LAIN']" :key="j" class="op-dok">
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
    </template>

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
            <div class="form-group"><label class="form-label form-required">Tanggal aktivasi vendor</label><input v-model="fl.tgl_mulai" type="date" class="form-input" /></div>
            <div class="form-group"><label class="form-label">Lama berlangganan vendor (bulan)</label><input v-model.number="fl.durasi_bulan" type="number" min="1" max="120" class="form-input" /></div>
            <div class="form-group"><label class="form-label form-required">Biaya langganan vendor / bulan</label><input v-model.number="fl.biaya_mrc_vendor" type="number" min="0" class="form-input" /></div>
            <div class="form-group"><label class="form-label form-required">SN modem vendor</label><input v-model="fl.sn_modem" class="form-input" maxlength="100" /></div>
            <div class="form-group"><label class="form-label">Deposit ke vendor</label><input v-model.number="fl.deposit_nominal" type="number" min="0" class="form-input" /></div>
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
.hijau { color: #15803d; }
.merah { color: #dc2626; }
.kanan { text-align: right; }
.pusat { text-align: center; padding: 14px; }
.muted { color: var(--text-3); }
</style>
