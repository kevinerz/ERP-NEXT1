<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDate, fmtDateTime, fmtRupiah } from '@/composables/useFormat'
import { alertError, confirmDialog, promptDialog } from '@/composables/useDialog'
import { DEPOSIT_JENIS, KELAS_TAHAP, TAHAP_ORDER, type Vendor } from './pb'

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
    if (gantiTab) tab.value = 'OPS'
  } catch (e) {
    alertError(e, 'Gagal memuat order')
  }
}
onMounted(async () => {
  api.get('/pasang-baru/referensi').then(({ data }) => { vendor.value = data.data.vendor }).catch(() => undefined)
  await muat(true)
})

const TAB = ['OPS', 'Info order', 'Dokumen', 'Riwayat']
const bolehTahap = (t: string) => !!o.value?.hak.tahap.includes(t)
const bisaUbah = (t: string) => o.value?.tahap === t && bolehTahap(t)
const idxTahap = computed(() => TAHAP_ORDER.indexOf(o.value?.tahap))
const bisaSerahkan = computed(() => o.value?.tahap === 'OPS' && bolehTahap('OPS'))
const bisaKembalikan = computed(() => o.value?.tahap === 'Terpasang' && bolehTahap('Terpasang'))
const bisaBatal = computed(() => o.value?.tahap === 'OPS' && bolehTahap('Draft'))
const lengkap = computed(() => (o.value?.syarat || []).every((x: any) => x.ok))
const SEBELUM: Record<string, string> = { Terpasang: 'OPS' }

async function jalankan(fn: () => Promise<any>, gantiTab = false) {
  proses.value = true
  try { await fn(); await muat(gantiTab) } catch (e) { alertError(e) } finally { proses.value = false }
}
async function serahkan() {
  const catatan = await promptDialog({ title: 'Tandai terpasang', message: 'Modem vendor sudah terpasang dan speedtest sudah dicek. Sales akan diberi tahu.', label: 'Catatan (opsional)', confirmLabel: '✓ Terpasang' })
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
          <button v-if="bisaSerahkan" class="btn btn-primary" :disabled="proses || !lengkap" :title="lengkap ? '' : 'Lengkapi syarat dulu'" @click="serahkan">✓ Tandai terpasang</button>
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
      <div v-else-if="o.tahap === 'Terpasang'" class="alert alert-success">Vendor ISP sudah terpasang. Tahap berikutnya (instalasi perangkat, NOC, aktivasi) akan ditata menyusul.</div>

      <!-- Syarat tahap sekarang -->
      <div v-if="o.syarat.length" class="op-syarat" :class="{ ok: lengkap }">
        <b>Syarat terpasang:</b>
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
.op-besar { max-width: 92vw; max-height: 88vh; border-radius: 8px; margin: auto; display: block; }
.hijau { color: #15803d; }
.merah { color: #dc2626; }
.kanan { text-align: right; }
.pusat { text-align: center; padding: 14px; }
.muted { color: var(--text-3); }
</style>
