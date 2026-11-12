<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { fmtDateTime, fmtRupiah } from '@/composables/useFormat'
import { alertError, confirmDialog, pesanGalat, promptDialog, toast } from '@/composables/useDialog'
import { DEPOSIT_JENIS, KELAS_SPH, KELAS_SURVEY, umur, type Vendor } from './pb'

interface VendorBaris {
  id_vendor_isp: number | ''; peruntukan_link: string; bandwidth_mbps: string; biaya_mrc_vendor: number; biaya_otc_vendor: number
  deposit_nominal: number; deposit_jenis: string; catatan: string
}
interface SiteEdit {
  id_survey_site: number; cover: string; ikg_nominal: number; ikg_pengelola: string; ikg_catatan: string; catatan_ops: string
  hasil_teknis: string; vendor: VendorBaris[]
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const id = computed(() => Number(route.params.id))
const s = ref<any>(null)
const vendorRef = ref<Vendor[]>([])
const memuat = ref(true)
const muatError = ref('')
const proses = ref(false)
const edit = ref<SiteEdit[]>([])
const catatanOps = ref('')
const catatanTeknis = ref('')
const berubah = ref(false)

function isiEdit() {
  edit.value = s.value.site.map((x: any) => ({
    id_survey_site: x.id_survey_site, cover: x.cover || '', ikg_nominal: Number(x.ikg_nominal), ikg_pengelola: x.ikg_pengelola || '',
    ikg_catatan: x.ikg_catatan || '', catatan_ops: x.catatan_ops || '', hasil_teknis: x.hasil_teknis || '',
    vendor: x.vendor.map((v: any) => ({
      id_vendor_isp: v.id_vendor_isp, peruntukan_link: v.peruntukan_link, bandwidth_mbps: v.bandwidth_mbps || '',
      biaya_mrc_vendor: Number(v.biaya_mrc_vendor), biaya_otc_vendor: Number(v.biaya_otc_vendor), deposit_nominal: Number(v.deposit_nominal),
      deposit_jenis: v.deposit_jenis || '', catatan: v.catatan || '',
    })),
  }))
  catatanOps.value = s.value.catatan_ops || ''
  catatanTeknis.value = s.value.catatan_teknis || ''
  berubah.value = false
}

async function muat() {
  memuat.value = true
  try {
    const [{ data }, ref_] = await Promise.all([
      api.get(`/pasang-baru/survey/${id.value}`),
      vendorRef.value.length ? Promise.resolve(null) : api.get('/pasang-baru/referensi'),
    ])
    s.value = data.data
    if (ref_) vendorRef.value = ref_.data.data.vendor
    isiEdit()
    muatError.value = ''
  } catch (e) {
    // muat awal gagal → error di halaman; muat ulang setelah aksi → modal
    if (!s.value) muatError.value = pesanGalat(e, 'Gagal memuat survey')
    else alertError(e, 'Gagal memuat survey')
  } finally {
    memuat.value = false
  }
}
onMounted(muat)

// cegah perubahan OPS/Teknis hilang saat pindah halaman
onBeforeRouteLeave(async () => {
  if (!berubah.value) return true
  return await confirmDialog({ title: 'Perubahan belum disimpan', message: 'Ada perubahan yang belum disimpan. Tinggalkan halaman ini?', confirmLabel: 'Tinggalkan', variant: 'warning' })
})

const hak = computed(() => s.value?.hak ?? { sales: false, ops: false, teknis: false })
const modeOps = computed(() => s.value?.status === 'OPS' && hak.value.ops)
const modeTeknis = computed(() => s.value?.status === 'Teknis' && hak.value.teknis)
const pakaiTeknis = computed(() => s.value?.status === 'Teknis' || !!s.value?.catatan_teknis || s.value?.site.some((x: any) => x.hasil_teknis)
  || s.value?.riwayat.some((r: any) => r.aksi === 'kirim_teknis'))

// ── Alur ─────────────────────────────────────────────────────────────────────
const LANGKAH = [
  { k: 'Draft', t: 'Sales', d: 'Data site' },
  { k: 'OPS', t: 'OPS', d: 'Vendor · IKG · deposit · cover' },
  { k: 'Teknis', t: 'Teknis', d: 'Opsional' },
  { k: 'Siap SPH', t: 'Sales', d: 'Buat SPH' },
  { k: 'Lanjut SPH', t: 'SPH', d: 'Approval Director' },
]
const URUT: Record<string, number> = { Draft: 0, OPS: 1, Teknis: 2, 'Siap SPH': 3, Hold: 3, 'Lanjut SPH': 4 }
function kelasLangkah(k: string) {
  const st = s.value.status
  if (st === 'Batal') return 'abu'
  if (k === st || (k === 'Siap SPH' && st === 'Hold')) return st === 'Hold' ? 'tahan' : 'kini'
  if (k === 'Teknis' && !pakaiTeknis.value) return 'lewat'
  return (URUT[k] ?? 0) < (URUT[st] ?? 0) ? 'selesai' : ''
}

// ── Ringkasan biaya OPS ──────────────────────────────────────────────────────
const sumber = computed(() => (modeOps.value ? edit.value.map((e) => ({ ...e, cover: e.cover })) : s.value?.site ?? []))
const ringkas = computed(() => {
  const cov = sumber.value.filter((x: any) => x.cover === 'Cover')
  const v = cov.flatMap((x: any) => x.vendor)
  return {
    cover: cov.length,
    tidak: sumber.value.filter((x: any) => x.cover === 'Tidak cover').length,
    mrc: v.reduce((a: number, x: any) => a + Number(x.biaya_mrc_vendor || 0), 0),
    otc: v.reduce((a: number, x: any) => a + Number(x.biaya_otc_vendor || 0), 0),
    deposit: v.reduce((a: number, x: any) => a + Number(x.deposit_nominal || 0), 0),
    ikg: cov.reduce((a: number, x: any) => a + Number(x.ikg_nominal || 0), 0),
  }
})

// ── Aksi ─────────────────────────────────────────────────────────────────────
async function jalankan(fn: () => Promise<any>) {
  if (proses.value) return
  proses.value = true
  try { await fn(); await muat() } catch (e) { alertError(e) } finally { proses.value = false }
}
async function ajukan() {
  const ulang = s.value.status === 'Hold'
  const catatan = await promptDialog({
    title: ulang ? 'Ajukan ulang ke OPS' : 'Ajukan ke OPS', label: 'Catatan untuk OPS (opsional)', confirmLabel: 'Ajukan',
    message: `${s.value.site.length} site akan dicek OPS: vendor ISP, IKG, deposit, dan cover.`,
  })
  if (catatan === null) return
  jalankan(() => api.post(`/pasang-baru/survey/${id.value}/ajukan`, { catatan: catatan || undefined }))
}
async function batal() {
  const catatan = await promptDialog({ title: 'Batalkan survey', label: 'Alasan (opsional)', confirmLabel: 'Batalkan', variant: 'danger' })
  if (catatan === null) return
  jalankan(() => api.post(`/pasang-baru/survey/${id.value}/batal`, { catatan: catatan || undefined }))
}
const aktifkan = () => jalankan(() => api.post(`/pasang-baru/survey/${id.value}/aktifkan`))
async function hapus() {
  if (proses.value || !(await confirmDialog({ title: 'Hapus survey', message: `Hapus ${s.value.nomor_survey}?`, variant: 'danger', confirmLabel: 'Hapus' }))) return
  proses.value = true
  try {
    await api.delete(`/pasang-baru/survey/${id.value}`)
    berubah.value = false
    toast('Survey dihapus')
    router.push('/pasang-baru?tab=Survey')
  } catch (e) { alertError(e) } finally { proses.value = false }
}

// OPS
const kosongVendor = (): VendorBaris => ({ id_vendor_isp: '', peruntukan_link: 'Main', bandwidth_mbps: '', biaya_mrc_vendor: 0, biaya_otc_vendor: 0, deposit_nominal: 0, deposit_jenis: '', catatan: '' })
function tambahVendor(e: SiteEdit) {
  e.vendor.push({ ...kosongVendor(), peruntukan_link: e.vendor.some((v) => v.peruntukan_link === 'Main') ? 'Backup' : 'Main' })
  berubah.value = true
}
const vendorKurang = (e: SiteEdit) => e.vendor.some((v) => !v.id_vendor_isp)
async function simpanOps(diam = false) {
  if (edit.value.some(vendorKurang)) throw new Error('Pilih vendor di setiap baris vendor (atau hapus barisnya)')
  await api.put(`/pasang-baru/survey/${id.value}/ops`, {
    catatan_ops: catatanOps.value || undefined,
    site: edit.value.map((e) => ({
      id_survey_site: e.id_survey_site, cover: e.cover, ikg_nominal: Number(e.ikg_nominal) || 0, ikg_pengelola: e.ikg_pengelola,
      ikg_catatan: e.ikg_catatan, catatan_ops: e.catatan_ops,
      vendor: e.cover === 'Tidak cover' ? [] : e.vendor.map((v) => ({
        ...v, id_vendor_isp: Number(v.id_vendor_isp), biaya_mrc_vendor: Number(v.biaya_mrc_vendor) || 0, biaya_otc_vendor: Number(v.biaya_otc_vendor) || 0,
        deposit_nominal: Number(v.deposit_nominal) || 0, deposit_jenis: Number(v.deposit_nominal) > 0 ? v.deposit_jenis : '',
      })),
    })),
  })
  berubah.value = false
  if (!diam) await muat()
}
const tombolSimpanOps = () => jalankan(() => simpanOps(true))
async function kirimTeknis() {
  const catatan = await promptDialog({
    title: 'Kirim ke Teknis', label: 'Apa yang perlu dicek teknis?', confirmLabel: 'Kirim',
    message: 'Contoh: cek sinyal 5G untuk layanan M2M di semua site.', validate: (v) => (v.trim() ? null : 'Wajib diisi'),
  })
  if (!catatan) return
  jalankan(async () => { await simpanOps(true); await api.post(`/pasang-baru/survey/${id.value}/kirim-teknis`, { catatan }) })
}
async function kembalikan() {
  const catatan = await promptDialog({ title: 'Kembalikan ke Sales', label: 'Data yang perlu diperbaiki', confirmLabel: 'Kembalikan', variant: 'danger', validate: (v) => (v.trim() ? null : 'Wajib diisi') })
  if (!catatan) return
  jalankan(() => api.post(`/pasang-baru/survey/${id.value}/kembalikan`, { catatan }))
}
async function selesaiOps() {
  const belum = edit.value.filter((e) => !e.cover).length
  if (belum) return alertError(new Error(`${belum} site belum ditentukan cover / tidak cover`))
  const cov = edit.value.filter((e) => e.cover === 'Cover').length
  const ok = await confirmDialog({
    title: 'Selesai — kembalikan ke Sales',
    message: cov
      ? `${cov} site cover, ${edit.value.length - cov} tidak cover (hold). Sales akan membuat SPH dari site yang cover.`
      : 'Semua site tidak cover — survey akan di-HOLD.',
    confirmLabel: 'Selesai',
  })
  if (!ok) return
  jalankan(async () => { await simpanOps(true); await api.post(`/pasang-baru/survey/${id.value}/ops-selesai`, {}) })
}

// Teknis
async function simpanTeknis() {
  await api.put(`/pasang-baru/survey/${id.value}/teknis`, {
    catatan_teknis: catatanTeknis.value || undefined,
    site: edit.value.map((e) => ({ id_survey_site: e.id_survey_site, hasil_teknis: e.hasil_teknis })),
  })
  berubah.value = false
}
const tombolSimpanTeknis = () => jalankan(simpanTeknis)
async function selesaiTeknis() {
  if (!(await confirmDialog({ title: 'Cek teknis selesai', message: 'Simpan hasil dan kembalikan survey ke OPS?', confirmLabel: 'Selesai' }))) return
  jalankan(async () => { await simpanTeknis(); await api.post(`/pasang-baru/survey/${id.value}/teknis-selesai`, {}) })
}

const namaVendor = (idv: number) => vendorRef.value.find((v) => v.id_vendor === idv)?.nama_vendor ?? `#${idv}`
const AKSI: Record<string, string> = {
  buat: 'Dibuat', ubah: 'Diubah', ajukan: 'Diajukan ke OPS', kirim_teknis: 'Dikirim ke Teknis', teknis_selesai: 'Cek teknis selesai',
  ops_selesai: 'OPS selesai', kembalikan: 'Dikembalikan ke Sales', batal: 'Dibatalkan', aktifkan: 'Dibuka kembali',
  sph: 'Dibuat SPH', sph_hapus: 'SPH dihapus',
}
const PETUNJUK: Record<string, string> = {
  Draft: 'Lengkapi data site lalu ajukan ke OPS.',
  OPS: 'OPS mengisi vendor ISP, IKG, deposit, dan menentukan cover / tidak cover tiap site. Bila perlu cek teknis (mis. sinyal 5G untuk M2M), kirim ke Teknis.',
  Teknis: 'Teknis mengecek di lapangan lalu mengisi hasilnya, kemudian survey kembali ke OPS.',
  'Siap SPH': 'OPS selesai. Sales membuat SPH dari site yang cover — data vendor, IKG, dan deposit ikut terbawa.',
  Hold: 'Semua site tidak cover — survey tertahan. Ajukan ulang ke OPS bila ada perubahan, atau batalkan.',
  'Lanjut SPH': 'SPH sudah dibuat dan menunggu / sudah melalui approval Director.',
  Batal: 'Survey dibatalkan.',
}
</script>

<template>
  <div class="page">
    <p v-if="memuat && !s" class="loading-state">Memuat survey…</p>
    <div v-else-if="!s && muatError" class="alert alert-danger" role="alert">
      <span>⚠ {{ muatError }}</span>
      <button type="button" class="btn btn-sm btn-ghost" @click="muat">↻ Coba lagi</button>
      <button class="btn btn-sm btn-ghost" @click="router.push('/pasang-baru?tab=Survey')">← Daftar</button>
    </div>
    <template v-else-if="s">
      <div class="page-header">
        <div>
          <h2 class="page-title">{{ s.nomor_survey }} <span class="badge" :class="KELAS_SURVEY[s.status]">{{ s.status }}</span></h2>
          <p class="page-subtitle">{{ s.nama_perusahaan }} · {{ s.site.length }} site · Sales {{ s.sales || '-' }} · {{ umur(s.status_at) }} di tahap ini</p>
        </div>
        <div class="sv-tombol">
          <button class="btn btn-ghost" @click="router.push('/pasang-baru?tab=Survey')">← Daftar</button>
          <template v-if="hak.sales">
            <button v-if="['Draft', 'Batal'].includes(s.status) && !s.sph.length" class="btn btn-ghost" :disabled="proses" @click="hapus">Hapus</button>
            <button v-if="['Draft', 'Siap SPH', 'Hold'].includes(s.status)" class="btn btn-ghost" :disabled="proses" @click="batal">Batalkan</button>
            <button v-if="s.status === 'Batal'" class="btn btn-ghost" :disabled="proses" @click="aktifkan">Buka kembali</button>
            <button v-if="s.status === 'Draft'" class="btn btn-ghost" :disabled="proses" @click="router.push(`/pasang-baru/survey/${s.id_survey}/ubah`)">✏️ Ubah</button>
            <button v-if="['Draft', 'Hold'].includes(s.status)" class="btn btn-primary" :disabled="proses" @click="ajukan">{{ s.status === 'Hold' ? 'Ajukan ulang ke OPS' : 'Ajukan ke OPS →' }}</button>
            <button v-if="['Siap SPH', 'Lanjut SPH'].includes(s.status)" class="btn btn-primary" :disabled="proses" @click="router.push(`/pasang-baru/sph/baru?survey=${s.id_survey}`)">
              📄 {{ s.sph.length ? 'Buat SPH lagi' : 'Buat SPH' }}
            </button>
          </template>
        </div>
      </div>

      <ol class="sv-alur">
        <li v-for="l in LANGKAH" :key="l.k" :class="kelasLangkah(l.k)">
          <b>{{ l.k === 'Siap SPH' && s.status === 'Hold' ? 'Hold' : l.k }}</b><small>{{ l.t }} · {{ l.d }}</small>
        </li>
      </ol>
      <div class="alert" :class="s.status === 'Hold' ? 'alert-warning' : s.status === 'Batal' ? 'alert-danger' : 'alert-info'">{{ PETUNJUK[s.status] }}</div>

      <div v-if="s.sph.length" class="alert alert-success sv-sph">
        SPH:
        <a v-for="x in s.sph" :key="x.id_sph" href="#" @click.prevent="router.push(`/pasang-baru/sph/${x.id_sph}`)">
          <b>{{ x.nomor_sph }}</b> <span class="badge" :class="KELAS_SPH[x.status]">{{ x.status }}</span>
        </a>
      </div>

      <div class="grid-2 sv-info">
        <div class="detail-section">
          <div class="detail-section-header"><b>Perusahaan &amp; PIC</b></div>
          <div class="detail-section-body">
            <div class="info-row">
              <span class="info-label">Perusahaan</span>
              <span class="info-value">{{ s.nama_perusahaan }}
                <span v-if="s.pelanggan" class="badge badge-green">Pelanggan {{ s.pelanggan.kode_pelanggan }}</span>
                <span v-else class="badge badge-gray">Calon pelanggan</span>
              </span>
            </div>
            <div class="info-row"><span class="info-label">Nama PIC</span><span class="info-value">{{ s.nama_pic }}</span></div>
            <div class="info-row"><span class="info-label">Telp</span><span class="info-value">{{ s.telp_pic || '-' }}</span></div>
            <div class="info-row"><span class="info-label">Email</span><span class="info-value">{{ s.email_pic || '-' }}</span></div>
            <div class="info-row"><span class="info-label">Catatan sales</span><span class="info-value sv-pre">{{ s.catatan || '-' }}</span></div>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-header"><b>Hasil OPS</b></div>
          <div class="detail-section-body">
            <div class="info-row"><span class="info-label">Site</span><span class="info-value"><b class="hijau">{{ ringkas.cover }} cover</b> · <b class="oranye">{{ ringkas.tidak }} tidak cover</b> · {{ s.site.length - ringkas.cover - ringkas.tidak }} belum</span></div>
            <div class="info-row"><span class="info-label">Modal vendor / bulan</span><span class="info-value"><b>{{ fmtRupiah(ringkas.mrc) }}</b></span></div>
            <div class="info-row"><span class="info-label">Biaya pasang vendor</span><span class="info-value">{{ fmtRupiah(ringkas.otc) }}</span></div>
            <div class="info-row"><span class="info-label">IKG</span><span class="info-value">{{ fmtRupiah(ringkas.ikg) }}</span></div>
            <div class="info-row"><span class="info-label">Deposit vendor</span><span class="info-value">{{ fmtRupiah(ringkas.deposit) }}</span></div>
            <div class="info-row"><span class="info-label">OPS</span><span class="info-value">{{ s.ops || '-' }}</span></div>
            <div v-if="pakaiTeknis" class="info-row"><span class="info-label">Teknis</span><span class="info-value">{{ s.teknis || '-' }}</span></div>
          </div>
        </div>
      </div>

      <!-- Catatan umum OPS / Teknis -->
      <div v-if="modeOps" class="form-group">
        <label class="form-label">Catatan OPS (umum)</label>
        <textarea v-model="catatanOps" rows="2" class="form-textarea" maxlength="5000" @input="berubah = true"></textarea>
      </div>
      <div v-else-if="s.catatan_ops" class="alert alert-info sv-pre"><b>Catatan OPS:</b> {{ s.catatan_ops }}</div>
      <div v-if="modeTeknis" class="form-group">
        <label class="form-label">Hasil cek teknis (umum)</label>
        <textarea v-model="catatanTeknis" rows="2" class="form-textarea" maxlength="5000" placeholder="mis. sinyal 5G Telkomsel -85 dBm, layak M2M" @input="berubah = true"></textarea>
      </div>
      <div v-else-if="s.catatan_teknis" class="alert alert-info sv-pre"><b>Hasil teknis:</b> {{ s.catatan_teknis }}</div>

      <!-- Site -->
      <div v-for="(x, i) in s.site" :key="x.id_survey_site" class="detail-section sv-site" :class="{ tahan: (modeOps ? edit[i]!.cover : x.cover) === 'Tidak cover' }">
        <div class="detail-section-header sv-site-head">
          <div>
            <b>{{ i + 1 }}. {{ x.nama_site }}</b>
            <small class="muted"> · {{ x.layanan.nama_layanan }}</small>
            <div class="muted sv-alamat">{{ x.alamat }}<template v-if="x.lantai_unit"> — {{ x.lantai_unit }}</template><template v-if="x.kota">, {{ x.kota }}</template></div>
          </div>
          <div v-if="modeOps" class="sv-cover">
            <button :class="{ aktif: edit[i]!.cover === 'Cover', hijau: true }" @click="edit[i]!.cover = 'Cover'; berubah = true">✓ Cover</button>
            <button :class="{ aktif: edit[i]!.cover === 'Tidak cover', oranye: true }" @click="edit[i]!.cover = 'Tidak cover'; berubah = true">✕ Tidak cover (hold)</button>
          </div>
          <span v-else-if="x.cover" class="badge" :class="x.cover === 'Cover' ? 'badge-green' : 'badge-amber'">{{ x.cover === 'Cover' ? 'Cover' : 'Tidak cover · Hold' }}</span>
          <span v-else class="badge badge-gray">Belum dicek OPS</span>
        </div>

        <div class="detail-section-body">
          <!-- Mode OPS: isian -->
          <template v-if="modeOps">
            <template v-if="edit[i]!.cover !== 'Tidak cover'">
              <div class="sv-sub"><b>Vendor ISP</b> <button class="btn btn-sm btn-ghost" @click="tambahVendor(edit[i]!)">+ vendor</button></div>
              <div v-if="edit[i]!.vendor.length" class="table-wrap">
                <table class="data-table sv-vtabel">
                  <thead><tr><th>Vendor *</th><th>Peruntukan</th><th>Bandwidth</th><th>Modal / bln</th><th>Biaya pasang</th><th>Deposit</th><th>Sifat deposit</th><th>Catatan</th><th></th></tr></thead>
                  <tbody>
                    <tr v-for="(v, j) in edit[i]!.vendor" :key="j" @input="berubah = true" @change="berubah = true">
                      <td>
                        <select v-model="v.id_vendor_isp" class="form-input" :class="{ 'is-invalid': !v.id_vendor_isp }">
                          <option value="">— pilih —</option>
                          <option v-for="o in vendorRef" :key="o.id_vendor" :value="o.id_vendor">{{ o.nama_vendor }}</option>
                        </select>
                      </td>
                      <td><select v-model="v.peruntukan_link" class="form-input"><option>Main</option><option>Backup</option></select></td>
                      <td><input v-model="v.bandwidth_mbps" class="form-input sv-bw" maxlength="30" placeholder="50 Mbps" /></td>
                      <td><input v-model.number="v.biaya_mrc_vendor" type="number" min="0" class="form-input sv-uang" /></td>
                      <td><input v-model.number="v.biaya_otc_vendor" type="number" min="0" class="form-input sv-uang" /></td>
                      <td><input v-model.number="v.deposit_nominal" type="number" min="0" class="form-input sv-uang" /></td>
                      <td>
                        <select v-model="v.deposit_jenis" class="form-input" :disabled="!Number(v.deposit_nominal)">
                          <option value="">—</option>
                          <option v-for="d in DEPOSIT_JENIS" :key="d">{{ d }}</option>
                        </select>
                      </td>
                      <td><input v-model="v.catatan" class="form-input" maxlength="500" /></td>
                      <td><button type="button" class="btn btn-sm btn-ghost" title="Hapus baris vendor" aria-label="Hapus baris vendor" @click="edit[i]!.vendor.splice(j, 1); berubah = true">✕</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted sv-kosong">Belum ada vendor. Klik <b>+ vendor</b> — bisa lebih dari satu (Main / Backup).</p>
              <div class="sv-ikg">
                <div class="form-group"><label class="form-label">IKG (Rp)</label><input v-model.number="edit[i]!.ikg_nominal" type="number" min="0" class="form-input" @input="berubah = true" /></div>
                <div class="form-group"><label class="form-label">Pengelola gedung</label><input v-model="edit[i]!.ikg_pengelola" class="form-input" maxlength="150" @input="berubah = true" /></div>
                <div class="form-group"><label class="form-label">Catatan IKG</label><input v-model="edit[i]!.ikg_catatan" class="form-input" maxlength="500" @input="berubah = true" /></div>
              </div>
            </template>
            <div class="form-group">
              <label class="form-label">{{ edit[i]!.cover === 'Tidak cover' ? 'Alasan tidak cover' : 'Catatan OPS' }}</label>
              <textarea v-model="edit[i]!.catatan_ops" rows="1" class="form-textarea" maxlength="5000" @input="berubah = true"></textarea>
            </div>
            <div v-if="x.hasil_teknis" class="sv-teknis"><b>🛠 Hasil teknis:</b> {{ x.hasil_teknis }}</div>
          </template>

          <!-- Tampilan baca -->
          <template v-else>
            <div v-if="x.vendor.length" class="table-wrap">
              <table class="data-table sv-vtabel">
                <thead><tr><th>Vendor</th><th>Peruntukan</th><th>Bandwidth</th><th class="kanan">Modal / bln</th><th class="kanan">Biaya pasang</th><th class="kanan">Deposit</th><th>Catatan</th></tr></thead>
                <tbody>
                  <tr v-for="v in x.vendor" :key="v.id_survey_vendor">
                    <td><b>{{ v.vendor?.nama_vendor || namaVendor(v.id_vendor_isp) }}</b></td>
                    <td><span class="badge" :class="v.peruntukan_link === 'Main' ? 'badge-blue' : 'badge-gray'">{{ v.peruntukan_link }}</span></td>
                    <td>{{ v.bandwidth_mbps || '-' }}</td>
                    <td class="kanan">{{ fmtRupiah(v.biaya_mrc_vendor) }}</td>
                    <td class="kanan">{{ Number(v.biaya_otc_vendor) ? fmtRupiah(v.biaya_otc_vendor) : '-' }}</td>
                    <td class="kanan">{{ Number(v.deposit_nominal) ? fmtRupiah(v.deposit_nominal) : '-' }}<br /><small v-if="v.deposit_jenis" class="muted">{{ v.deposit_jenis }}</small></td>
                    <td>{{ v.catatan || '' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="Number(x.ikg_nominal) || x.ikg_pengelola" class="sv-baris">🏢 <b>IKG {{ fmtRupiah(x.ikg_nominal) }}</b><template v-if="x.ikg_pengelola"> · {{ x.ikg_pengelola }}</template><template v-if="x.ikg_catatan"> · {{ x.ikg_catatan }}</template></p>
            <p v-if="x.catatan_ops" class="sv-baris sv-pre">📝 {{ x.catatan_ops }}</p>
            <template v-if="modeTeknis">
              <label class="form-label">🛠 Hasil cek teknis site ini</label>
              <textarea v-model="edit[i]!.hasil_teknis" rows="2" class="form-textarea" maxlength="5000" placeholder="mis. sinyal 5G -88 dBm di Lt 2, perlu antena eksternal" @input="berubah = true"></textarea>
            </template>
            <div v-else-if="x.hasil_teknis" class="sv-teknis sv-pre"><b>🛠 Hasil teknis:</b> {{ x.hasil_teknis }}</div>
            <p v-if="!x.vendor.length && !x.catatan_ops && !x.hasil_teknis && !modeTeknis && !Number(x.ikg_nominal)" class="muted sv-kosong">Belum ada hasil OPS.</p>
          </template>
        </div>
      </div>

      <!-- Tombol OPS / Teknis (menempel di bawah) -->
      <div v-if="modeOps" class="sv-bar">
        <span class="muted">{{ berubah ? 'Ada perubahan belum disimpan' : 'Tersimpan' }}</span>
        <button class="btn btn-ghost" :disabled="proses" @click="kembalikan">↩ Kembalikan ke Sales</button>
        <button class="btn btn-ghost" :disabled="proses" @click="kirimTeknis">🛠 Kirim ke Teknis</button>
        <button class="btn btn-ghost" :disabled="proses || !berubah" @click="tombolSimpanOps">💾 Simpan</button>
        <button class="btn btn-primary" :disabled="proses" @click="selesaiOps">Selesai → Sales</button>
      </div>
      <div v-if="modeTeknis" class="sv-bar">
        <span class="muted">{{ berubah ? 'Ada perubahan belum disimpan' : 'Tersimpan' }}</span>
        <button class="btn btn-ghost" :disabled="proses || !berubah" @click="tombolSimpanTeknis">💾 Simpan</button>
        <button class="btn btn-primary" :disabled="proses" @click="selesaiTeknis">Selesai → OPS</button>
      </div>

      <div class="detail-section">
        <div class="detail-section-header"><b>Riwayat</b></div>
        <div class="detail-section-body">
          <p v-for="r in s.riwayat" :key="r.id_riwayat" class="sv-riwayat">
            <small class="muted">{{ fmtDateTime(r.created_at) }}</small> · <b>{{ AKSI[r.aksi] || r.aksi }}</b> oleh {{ r.oleh || '-' }}<template v-if="r.catatan"> — {{ r.catatan }}</template>
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sv-tombol { display: flex; gap: 6px; flex-wrap: wrap; }
.sv-alur { display: flex; list-style: none; padding: 0; margin: 4px 0 12px; gap: 4px; overflow-x: auto; }
.sv-alur li { flex: 1 1 0; min-width: 120px; padding: 8px 10px; border-radius: 8px; background: var(--bg-2, #f1f5f9); border-top: 3px solid #cbd5e1; display: flex; flex-direction: column; }
.sv-alur li small { color: var(--text-3); font-size: 11px; }
.sv-alur li.selesai { border-top-color: #16a34a; }
.sv-alur li.kini { border-top-color: #2563eb; background: rgba(37, 99, 235, .08); }
.sv-alur li.tahan { border-top-color: #d97706; background: rgba(217, 119, 6, .1); }
.sv-alur li.lewat, .sv-alur li.abu { opacity: .5; }
.sv-info { margin: 12px 0; }
.sv-sph { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.sv-pre { white-space: pre-wrap; }
.sv-site { border-left: 4px solid #2563eb; }
.sv-site.tahan { border-left-color: #d97706; }
.sv-site-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.sv-alamat { font-size: 12.5px; margin-top: 2px; }
.sv-cover { display: flex; gap: 4px; }
.sv-cover button { border: 1px solid #cbd5e1; background: none; border-radius: 6px; padding: 5px 10px; cursor: pointer; font-weight: 600; color: var(--text-2, #334155); }
.sv-cover button.aktif.hijau { background: #16a34a; border-color: #16a34a; color: #fff; }
.sv-cover button.aktif.oranye { background: #d97706; border-color: #d97706; color: #fff; }
.sv-sub { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.sv-vtabel td { padding: 4px; vertical-align: top; }
.sv-vtabel .form-input { padding: 6px 8px; font-size: 13px; min-width: 0; }
.sv-uang { width: 120px; }
.sv-bw { width: 100px; }
.sv-ikg { display: grid; grid-template-columns: 160px 1fr 1.5fr; gap: 0 10px; margin-top: 10px; }
.sv-baris { margin: 6px 0 0; font-size: 13px; }
.sv-teknis { margin-top: 6px; padding: 6px 10px; border-radius: 6px; background: rgba(14, 165, 233, .1); font-size: 13px; }
.sv-kosong { margin: 0; font-size: 13px; }
.sv-bar { position: sticky; bottom: 0; z-index: 5; display: flex; gap: 6px; justify-content: flex-end; align-items: center; flex-wrap: wrap; padding: 10px 12px; margin: 8px 0 12px; background: var(--surface, #fff); border: 1px solid var(--border, #e2e8f0); border-radius: 10px; box-shadow: 0 -4px 14px rgba(0,0,0,.06); }
.sv-bar .muted { margin-right: auto; font-size: 12.5px; }
.sv-riwayat { margin: 4px 0; font-size: 13px; }
.hijau { color: #16a34a; }
.oranye { color: #d97706; }
.kanan { text-align: right; }
.muted { color: var(--text-3); }
@media (max-width: 700px) { .sv-ikg { grid-template-columns: 1fr; } }
</style>
