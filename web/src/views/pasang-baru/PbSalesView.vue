<script setup lang="ts">
// Tampilan Sales: survey & SPH milik sendiri, dengan daftar "perlu tindakan"
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { fmtDate, fmtRupiah } from '@/composables/useFormat'
import { KELAS_SPH, KELAS_SURVEY, KELAS_TAHAP, umur } from './pb'

interface Survey {
  id_survey: number; nomor_survey: string; status: string; status_at: string; updated_at: string; nama_perusahaan: string
  nama_pic: string; telp_pic: string | null; id_pelanggan: number | null; sales: string | null; jumlah_site: number
  cover: number; tidak_cover: number; modal_vendor: number; ikg: number; kota: string[]; terakhir: { aksi: string; catatan: string | null } | null
  sph: { id_sph: number; nomor_sph: string }[]
}
interface Sph {
  id_sph: number; nomor_sph: string; status: string; pelanggan: { nama_pelanggan: string }; sales: string | null
  jumlah_site: number; total_bulanan: number; updated_at: string; catatan_approval: string | null
}
interface Order {
  id_pb: number; nomor_pb: string | null; nama_site: string; kota: string | null; tahap: string; tahap_at: string; tgl_rfs: string | null
  sph: { nomor_sph: string; pelanggan: { nama_pelanggan: string } }; layanan: { nama_layanan: string }; site: { kode_site: string; _count: { dokumen: number } } | null
  sales: string | null
}

const router = useRouter()
const auth = useAuthStore()
// Sales murni: bawaan "milik saya"; Admin/Director: bawaan semua sales
const saya = ref(auth.hasRole('Sales') && !auth.hasRole('Admin') && !auth.hasRole('Director'))
const tab = ref<'survey' | 'sph' | 'order'>('survey')
const cari = ref('')
const survey = ref<Survey[]>([])
const sph = ref<Sph[]>([])
const order = ref<Order[]>([])
const memuat = ref(false)
const error = ref('')

async function muat() {
  memuat.value = true
  error.value = ''
  const p = { saya: saya.value ? '1' : undefined, cari: cari.value.trim() || undefined }
  try {
    const [a, b, c] = await Promise.all([
      api.get('/pasang-baru/survey', { params: { ...p, status: 'aktif' } }),
      api.get('/pasang-baru/sph', { params: p }),
      api.get('/pasang-baru/order', { params: { ...p, tahap: 'OPS,Network' } }),
    ])
    survey.value = a.data.data
    sph.value = b.data.data
    order.value = c.data.data
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat data'
  } finally {
    memuat.value = false
  }
}
onMounted(muat)
watch(saya, muat)
let timer: ReturnType<typeof setTimeout> | null = null
watch(cari, () => { if (timer) clearTimeout(timer); timer = setTimeout(muat, 350) })

// ── Perlu tindakan Sales ─────────────────────────────────────────────────────
interface Tugas { kunci: string; ikon: string; judul: string; ket: string; url: string; tombol: string; warna: string; waktu: string }
const tugas = computed<Tugas[]>(() => {
  const t: Tugas[] = []
  for (const s of survey.value) {
    if (s.status === 'Siap SPH') t.push({ kunci: `s${s.id_survey}`, ikon: '📄', warna: 'hijau', judul: `${s.nama_perusahaan} siap dibuat SPH`, ket: `${s.nomor_survey} · ${s.cover} site cover${s.tidak_cover ? ` · ${s.tidak_cover} hold` : ''} · modal ${fmtRupiah(s.modal_vendor)}/bln`, url: `/pasang-baru/sph/baru?survey=${s.id_survey}`, tombol: 'Buat SPH', waktu: s.status_at })
    else if (s.status === 'Hold') t.push({ kunci: `s${s.id_survey}`, ikon: '⏸', warna: 'oranye', judul: `${s.nama_perusahaan} — semua site tidak cover`, ket: `${s.nomor_survey} · ajukan ulang ke OPS atau batalkan`, url: `/pasang-baru/survey/${s.id_survey}`, tombol: 'Lihat', waktu: s.status_at })
    else if (s.status === 'Draft' && s.terakhir?.aksi === 'kembalikan') t.push({ kunci: `s${s.id_survey}`, ikon: '↩', warna: 'merah', judul: `${s.nama_perusahaan} dikembalikan OPS`, ket: s.terakhir.catatan || s.nomor_survey, url: `/pasang-baru/survey/${s.id_survey}`, tombol: 'Perbaiki', waktu: s.status_at })
    else if (s.status === 'Draft') t.push({ kunci: `s${s.id_survey}`, ikon: '✏️', warna: 'abu', judul: `${s.nama_perusahaan} belum diajukan ke OPS`, ket: `${s.nomor_survey} · ${s.jumlah_site} site`, url: `/pasang-baru/survey/${s.id_survey}`, tombol: 'Ajukan', waktu: s.status_at })
  }
  for (const x of sph.value) {
    if (x.status === 'Ditolak') t.push({ kunci: `p${x.id_sph}`, ikon: '✕', warna: 'merah', judul: `SPH ${x.pelanggan.nama_pelanggan} ditolak Director`, ket: x.catatan_approval || x.nomor_sph, url: `/pasang-baru/sph/${x.id_sph}`, tombol: 'Revisi', waktu: x.updated_at })
    else if (x.status === 'Draft') t.push({ kunci: `p${x.id_sph}`, ikon: '📝', warna: 'abu', judul: `SPH ${x.pelanggan.nama_pelanggan} belum diajukan`, ket: `${x.nomor_sph} · ${fmtRupiah(x.total_bulanan)}/bln`, url: `/pasang-baru/sph/${x.id_sph}`, tombol: 'Ajukan', waktu: x.updated_at })
  }
  return t.sort((a, b) => a.waktu.localeCompare(b.waktu))
})

const kpi = computed(() => [
  { t: 'Perlu tindakan', n: tugas.value.length, w: tugas.value.length ? 'merah' : '' },
  { t: 'Menunggu OPS', n: survey.value.filter((s) => ['OPS', 'Teknis'].includes(s.status)).length, w: '' },
  { t: 'Siap SPH', n: survey.value.filter((s) => s.status === 'Siap SPH').length, w: 'hijau' },
  { t: 'SPH di Director', n: sph.value.filter((s) => s.status === 'Menunggu Director').length, w: 'kuning' },
  { t: 'Order berjalan', n: order.value.length, w: '' },
])
const posisiSurvey = (s: Survey) => (s.status === 'OPS' ? 'Sedang dicek OPS' : s.status === 'Teknis' ? 'Cek teknis' : s.status === 'Draft' ? 'Belum diajukan' : s.status)
</script>

<template>
  <div>
    <div class="ps-atas">
      <div class="ps-kpi">
        <div v-for="k in kpi" :key="k.t" class="ps-kpi-item" :class="k.w"><b>{{ k.n }}</b><span>{{ k.t }}</span></div>
      </div>
      <label class="ps-saya"><input v-model="saya" type="checkbox" /> Hanya milik saya</label>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="detail-section">
      <div class="detail-section-header"><b>⚡ Perlu tindakan</b> <small class="muted">— terlama di atas</small></div>
      <div class="detail-section-body ps-tugas-wadah">
        <p v-if="!memuat && !tugas.length" class="muted ps-kosong">Tidak ada yang menunggu Anda. 👍</p>
        <div v-baris v-for="x in tugas" :key="x.kunci" class="ps-tugas" :class="x.warna" @click="router.push(x.url)">
          <span class="ps-ikon">{{ x.ikon }}</span>
          <div class="ps-isi"><b>{{ x.judul }}</b><small>{{ x.ket }}</small></div>
          <small class="muted ps-umur">{{ umur(x.waktu) }}</small>
          <button class="btn btn-sm" :class="x.warna === 'hijau' ? 'btn-primary' : 'btn-ghost'" @click.stop="router.push(x.url)">{{ x.tombol }}</button>
        </div>
      </div>
    </div>

    <div class="ps-tab">
      <button :class="{ aktif: tab === 'survey' }" @click="tab = 'survey'">🔍 Survey berjalan <span>{{ survey.length }}</span></button>
      <button :class="{ aktif: tab === 'sph' }" @click="tab = 'sph'">📄 SPH <span>{{ sph.length }}</span></button>
      <button :class="{ aktif: tab === 'order' }" @click="tab = 'order'">📦 Order berjalan <span>{{ order.length }}</span></button>
      <input v-model="cari" class="form-input ps-cari" placeholder="Cari perusahaan / nomor / site…" />
    </div>

    <div class="table-card">
      <table v-if="tab === 'survey'" class="data-table">
        <thead><tr><th>Survey</th><th>Perusahaan · PIC</th><th>Site</th><th>Posisi</th><th>Hasil OPS</th><th v-if="!saya">Sales</th></tr></thead>
        <tbody>
          <tr v-if="!memuat && !survey.length"><td colspan="6" class="muted pusat">Belum ada survey berjalan.</td></tr>
          <tr v-baris v-for="s in survey" :key="s.id_survey" class="klik" @click="router.push(`/pasang-baru/survey/${s.id_survey}`)">
            <td><b>{{ s.nomor_survey }}</b><br /><small class="muted">{{ fmtDate(s.updated_at) }}</small></td>
            <td>{{ s.nama_perusahaan }}<br /><small class="muted">{{ s.nama_pic }}<template v-if="s.telp_pic"> · {{ s.telp_pic }}</template></small></td>
            <td>{{ s.jumlah_site }}<br /><small class="muted">{{ s.kota.slice(0, 3).join(', ') }}<template v-if="s.kota.length > 3">…</template></small></td>
            <td><span class="badge" :class="KELAS_SURVEY[s.status]">{{ s.status }}</span><br /><small class="muted">{{ posisiSurvey(s) }} · {{ umur(s.status_at) }}</small></td>
            <td>
              <template v-if="s.cover || s.tidak_cover">
                <span class="hijau">{{ s.cover }} cover</span><template v-if="s.tidak_cover"> · <span class="oranye">{{ s.tidak_cover }} hold</span></template>
                <br /><small class="muted">modal {{ fmtRupiah(s.modal_vendor) }}/bln<template v-if="s.ikg"> · IKG {{ fmtRupiah(s.ikg) }}</template></small>
              </template>
              <span v-else class="muted">—</span>
            </td>
            <td v-if="!saya">{{ s.sales || '-' }}</td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'sph'" class="data-table">
        <thead><tr><th>SPH</th><th>Pelanggan</th><th>Site</th><th class="kanan">Total / bulan</th><th>Status</th><th v-if="!saya">Sales</th></tr></thead>
        <tbody>
          <tr v-if="!memuat && !sph.length"><td colspan="6" class="muted pusat">Belum ada SPH.</td></tr>
          <tr v-baris v-for="s in sph" :key="s.id_sph" class="klik" @click="router.push(`/pasang-baru/sph/${s.id_sph}`)">
            <td><b>{{ s.nomor_sph }}</b><br /><small class="muted">{{ fmtDate(s.updated_at) }}</small></td>
            <td>{{ s.pelanggan.nama_pelanggan }}</td>
            <td>{{ s.jumlah_site }}</td>
            <td class="kanan">{{ fmtRupiah(s.total_bulanan) }}</td>
            <td><span class="badge" :class="KELAS_SPH[s.status]">{{ s.status }}</span></td>
            <td v-if="!saya">{{ s.sales || '-' }}</td>
          </tr>
        </tbody>
      </table>

      <table v-else class="data-table">
        <thead><tr><th>No. PB</th><th>Site</th><th>Pelanggan</th><th>Layanan</th><th>RFS</th><th>Tahap</th><th v-if="!saya">Sales</th></tr></thead>
        <tbody>
          <tr v-if="!memuat && !order.length"><td colspan="7" class="muted pusat">Belum ada order berjalan.</td></tr>
          <tr v-baris v-for="o in order" :key="o.id_pb" class="klik" @click="router.push(`/pasang-baru/order/${o.id_pb}`)">
            <td><b>{{ o.nomor_pb }}</b><br /><small class="muted">{{ o.sph.nomor_sph }}</small></td>
            <td>{{ o.nama_site }}<br /><small class="muted">{{ o.site?.kode_site }}<template v-if="o.kota"> · {{ o.kota }}</template></small></td>
            <td>{{ o.sph.pelanggan.nama_pelanggan }}</td>
            <td>{{ o.layanan.nama_layanan }}</td>
            <td>{{ o.tgl_rfs ? fmtDate(o.tgl_rfs) : '-' }}</td>
            <td><span class="badge" :class="KELAS_TAHAP[o.tahap]">{{ o.tahap }}</span><br /><small class="muted">{{ umur(o.tahap_at) }}</small></td>
            <td v-if="!saya">{{ o.sales || '-' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="memuat" class="muted pusat">Memuat…</p>
    </div>
  </div>
</template>

<style scoped>
.ps-atas { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 12px; }
.ps-kpi { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
.ps-kpi-item { flex: 1 1 120px; padding: 10px 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--surface, #fff); }
.ps-kpi-item b { display: block; font-size: 22px; line-height: 1.1; }
.ps-kpi-item span { font-size: 12px; color: var(--text-3); }
.ps-kpi-item.merah b { color: #dc2626; }
.ps-kpi-item.hijau b { color: #16a34a; }
.ps-kpi-item.kuning b { color: #d97706; }
.ps-saya { display: flex; gap: 6px; align-items: center; font-size: 13px; white-space: nowrap; }
.ps-tugas-wadah { display: flex; flex-direction: column; gap: 6px; }
.ps-tugas { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; border-left: 4px solid #cbd5e1; background: var(--bg-2, #f8fafc); cursor: pointer; }
.ps-tugas:hover { background: rgba(37, 99, 235, .06); }
.ps-tugas.hijau { border-left-color: #16a34a; }
.ps-tugas.oranye { border-left-color: #d97706; }
.ps-tugas.merah { border-left-color: #dc2626; }
.ps-tugas.biru { border-left-color: #2563eb; }
.ps-ikon { font-size: 18px; width: 24px; text-align: center; }
.ps-isi { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ps-isi small { color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-umur { white-space: nowrap; }
.ps-kosong { margin: 0; }
.ps-tab { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin: 14px 0 10px; border-bottom: 1px solid var(--border, #e2e8f0); }
.ps-tab button { background: none; border: none; padding: 8px 12px; cursor: pointer; font-weight: 600; color: var(--text-3); border-bottom: 2px solid transparent; }
.ps-tab button.aktif { color: var(--primary, #2563eb); border-bottom-color: var(--primary, #2563eb); }
.ps-tab button span { background: #e2e8f0; color: #334155; border-radius: 10px; padding: 1px 7px; font-size: 11px; margin-left: 4px; }
.ps-cari { margin-left: auto; max-width: 280px; margin-bottom: 4px; }
.klik { cursor: pointer; }
.kanan { text-align: right; }
.pusat { text-align: center; padding: 16px; }
.muted { color: var(--text-3); }
.hijau { color: #16a34a; }
.oranye { color: #d97706; }
@media (max-width: 700px) { .ps-cari { margin-left: 0; max-width: none; width: 100%; } .ps-umur { display: none; } }
</style>
