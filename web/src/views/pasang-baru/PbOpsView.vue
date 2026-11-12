<script setup lang="ts">
// Tampilan OPS: antrian survey yang harus dicek dan order di tahap OPS — terlama di atas
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { pesanGalat } from '@/composables/useDialog'
import { fmtDate, fmtRupiah } from '@/composables/useFormat'
import { KELAS_SURVEY, umur } from './pb'

interface Survey {
  id_survey: number; nomor_survey: string; status: string; status_at: string; nama_perusahaan: string; sales: string | null; ops: string | null
  jumlah_site: number; cover: number; tidak_cover: number; modal_vendor: number; ikg: number; kota: string[]; layanan: string[]
  terakhir: { aksi: string; catatan: string | null } | null
}
interface Order {
  id_pb: number; nomor_pb: string | null; nama_site: string; kota: string | null; tahap_at: string; tgl_rfs: string | null; ikg_nominal: string
  sph: { nomor_sph: string; pelanggan: { nama_pelanggan: string } }; layanan: { nama_layanan: string }
  site: { kode_site: string } | null; sales: string | null; modal_vendor: number; vendor: string[]
}

const router = useRouter()
const TAB = [
  { k: 'antrian', t: '📥 Antrian survey' },
  { k: 'teknis', t: '🛠 Di Teknis' },
  { k: 'order', t: '📦 Order tahap OPS' },
  { k: 'riwayat', t: '🗂 Sudah selesai' },
] as const
const tab = ref<(typeof TAB)[number]['k']>('antrian')
const cari = ref('')
const antrian = ref<Survey[]>([])
const teknis = ref<Survey[]>([])
const riwayat = ref<Survey[]>([])
const order = ref<Order[]>([])
const memuat = ref(false)
const error = ref('')

let urutMuat = 0
async function muat() {
  const urut = ++urutMuat
  memuat.value = true
  error.value = ''
  const c = cari.value.trim() || undefined
  try {
    const [a, b, d, e] = await Promise.all([
      api.get('/pasang-baru/survey', { params: { status: 'OPS', cari: c } }),
      api.get('/pasang-baru/survey', { params: { status: 'Teknis', cari: c } }),
      api.get('/pasang-baru/survey', { params: { status: 'Siap SPH,Hold,Lanjut SPH', cari: c } }),
      api.get('/pasang-baru/order', { params: { tahap: 'OPS', cari: c } }),
    ])
    if (urut !== urutMuat) return // jawaban pencarian lama tidak boleh menimpa yang baru
    const lama = (x: Survey, y: Survey) => x.status_at.localeCompare(y.status_at)
    antrian.value = (a.data.data as Survey[]).sort(lama)
    teknis.value = (b.data.data as Survey[]).sort(lama)
    riwayat.value = d.data.data
    order.value = e.data.data
  } catch (err: any) {
    if (urut === urutMuat) error.value = pesanGalat(err, 'Gagal memuat data')
  } finally {
    if (urut === urutMuat) memuat.value = false
  }
}
onMounted(muat)
let timer: ReturnType<typeof setTimeout> | null = null
watch(cari, () => { if (timer) clearTimeout(timer); timer = setTimeout(muat, 350) })
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

const jam = (d: string) => (Date.now() - new Date(d).getTime()) / 3600_000
// Lama antre: >24 jam kuning, >48 jam merah
const kelasUmur = (d: string) => (jam(d) > 48 ? 'merah' : jam(d) > 24 ? 'kuning' : '')
const jumlah = computed<Record<string, number>>(() => ({ antrian: antrian.value.length, teknis: teknis.value.length, order: order.value.length, riwayat: riwayat.value.length }))
const kpi = computed(() => [
  { t: 'Survey menunggu dicek', n: antrian.value.length, w: antrian.value.length ? 'biru' : '' },
  { t: 'Lewat 2 hari', n: [...antrian.value.map((x) => x.status_at), ...order.value.map((x) => x.tahap_at)].filter((d) => jam(d) > 48).length, w: 'merah' },
  { t: 'Di Teknis', n: teknis.value.length, w: '' },
  { t: 'Order tahap OPS', n: order.value.length, w: order.value.length ? 'biru' : '' },
])
const progres = (s: Survey) => s.cover + s.tidak_cover
const KET: Record<string, string> = { ajukan: 'Diajukan Sales', teknis_selesai: 'Teknis selesai', kirim_teknis: 'Diminta cek', ops_selesai: 'Selesai' }
</script>

<template>
  <div>
    <div class="po-kpi">
      <div v-for="k in kpi" :key="k.t" class="po-kpi-item" :class="k.n ? k.w : ''"><b>{{ k.n }}</b><span>{{ k.t }}</span></div>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button type="button" class="btn btn-sm btn-ghost" @click="muat">↻ Coba lagi</button></div>

    <div class="po-tab">
      <button v-for="x in TAB" :key="x.k" :class="{ aktif: tab === x.k }" @click="tab = x.k">
        {{ x.t }} <span v-if="jumlah[x.k]" :class="{ isi: x.k !== 'riwayat' }">{{ jumlah[x.k] }}</span>
      </button>
      <input v-model="cari" class="form-input po-cari" placeholder="Cari perusahaan / site / kota…" />
    </div>

    <div class="table-card">
      <!-- Antrian survey / di teknis -->
      <table v-if="tab === 'antrian' || tab === 'teknis'" class="data-table">
        <thead>
          <tr>
            <th>Lama</th><th>Survey · Perusahaan</th><th>Site · Kota</th><th>Layanan</th>
            <th>{{ tab === 'teknis' ? 'Permintaan cek' : 'Progres cek' }}</th><th>Sales</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!memuat && !error && !(tab === 'antrian' ? antrian : teknis).length">
            <td colspan="7" class="muted pusat">{{ cari.trim() ? 'Tidak ada survey yang cocok dengan pencarian.' : tab === 'antrian' ? 'Antrian kosong — tidak ada survey menunggu OPS. 👍' : 'Tidak ada survey di Teknis.' }}</td>
          </tr>
          <tr v-baris v-for="s in (tab === 'antrian' ? antrian : teknis)" :key="s.id_survey" class="klik" @click="router.push(`/pasang-baru/survey/${s.id_survey}`)">
            <td><b class="po-umur" :class="kelasUmur(s.status_at)">{{ umur(s.status_at) }}</b></td>
            <td><b>{{ s.nama_perusahaan }}</b><br /><small class="muted">{{ s.nomor_survey }}</small></td>
            <td>{{ s.jumlah_site }} site<br /><small class="muted">{{ s.kota.slice(0, 3).join(', ') || '-' }}<template v-if="s.kota.length > 3"> +{{ s.kota.length - 3 }}</template></small></td>
            <td><small>{{ s.layanan.join(', ') }}</small></td>
            <td>
              <template v-if="tab === 'teknis'"><small>{{ s.terakhir?.aksi === 'kirim_teknis' ? s.terakhir.catatan : '-' }}</small></template>
              <template v-else>
                <div class="po-bar"><i :style="{ width: `${s.jumlah_site ? (progres(s) / s.jumlah_site) * 100 : 0}%` }"></i></div>
                <small class="muted">{{ progres(s) }}/{{ s.jumlah_site }} dicek<template v-if="s.terakhir && KET[s.terakhir.aksi]"> · {{ KET[s.terakhir.aksi] }}</template></small>
              </template>
            </td>
            <td>{{ s.sales || '-' }}</td>
            <td><button class="btn btn-sm btn-primary" @click.stop="router.push(`/pasang-baru/survey/${s.id_survey}`)">{{ tab === 'antrian' ? 'Cek' : 'Lihat' }}</button></td>
          </tr>
        </tbody>
      </table>

      <!-- Order tahap OPS -->
      <table v-else-if="tab === 'order'" class="data-table">
        <thead><tr><th>Lama</th><th>No. PB · Site</th><th>Pelanggan</th><th>Layanan</th><th>Link vendor</th><th class="kanan">Modal · IKG</th><th>RFS</th></tr></thead>
        <tbody>
          <tr v-if="!memuat && !error && !order.length"><td colspan="7" class="muted pusat">{{ cari.trim() ? 'Tidak ada order yang cocok dengan pencarian.' : 'Tidak ada order di tahap OPS. 👍' }}</td></tr>
          <tr v-baris v-for="o in order" :key="o.id_pb" class="klik" @click="router.push(`/pasang-baru/order/${o.id_pb}`)">
            <td><b class="po-umur" :class="kelasUmur(o.tahap_at)">{{ umur(o.tahap_at) }}</b></td>
            <td><b>{{ o.nomor_pb }}</b> · {{ o.nama_site }}<br /><small class="muted">{{ o.site?.kode_site }}<template v-if="o.kota"> · {{ o.kota }}</template></small></td>
            <td>{{ o.sph.pelanggan.nama_pelanggan }}</td>
            <td>{{ o.layanan.nama_layanan }}</td>
            <td><small v-if="o.vendor.length">{{ o.vendor.join(', ') }}</small><span v-else class="merah"><small>Belum ada link</small></span></td>
            <td class="kanan">{{ fmtRupiah(o.modal_vendor) }}<br /><small class="muted">IKG {{ fmtRupiah(o.ikg_nominal) }}</small></td>
            <td>{{ o.tgl_rfs ? fmtDate(o.tgl_rfs) : '-' }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Sudah selesai OPS -->
      <table v-else class="data-table">
        <thead><tr><th>Survey · Perusahaan</th><th>Hasil</th><th class="kanan">Modal / bln</th><th class="kanan">IKG</th><th>Status</th><th>OPS</th></tr></thead>
        <tbody>
          <tr v-if="!memuat && !error && !riwayat.length"><td colspan="6" class="muted pusat">{{ cari.trim() ? 'Tidak ada survey yang cocok dengan pencarian.' : 'Belum ada survey yang selesai dicek OPS.' }}</td></tr>
          <tr v-baris v-for="s in riwayat" :key="s.id_survey" class="klik" @click="router.push(`/pasang-baru/survey/${s.id_survey}`)">
            <td><b>{{ s.nama_perusahaan }}</b><br /><small class="muted">{{ s.nomor_survey }}</small></td>
            <td><span class="hijau">{{ s.cover }} cover</span><template v-if="s.tidak_cover"> · <span class="oranye">{{ s.tidak_cover }} tidak cover</span></template></td>
            <td class="kanan">{{ fmtRupiah(s.modal_vendor) }}</td>
            <td class="kanan">{{ fmtRupiah(s.ikg) }}</td>
            <td><span class="badge" :class="KELAS_SURVEY[s.status]">{{ s.status }}</span><br /><small class="muted">{{ fmtDate(s.status_at) }}</small></td>
            <td>{{ s.ops || '-' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="memuat" class="loading-state">Memuat…</p>
    </div>
  </div>
</template>

<style scoped>
.po-kpi { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.po-kpi-item { flex: 1 1 140px; padding: 10px 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--surface, #fff); }
.po-kpi-item b { display: block; font-size: 22px; line-height: 1.1; }
.po-kpi-item span { font-size: 12px; color: var(--text-3); }
.po-kpi-item.biru b { color: #2563eb; }
.po-kpi-item.merah b { color: #dc2626; }
.po-tab { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; border-bottom: 1px solid var(--border, #e2e8f0); }
.po-tab button { background: none; border: none; padding: 8px 12px; cursor: pointer; font-weight: 600; color: var(--text-3); border-bottom: 2px solid transparent; }
.po-tab button.aktif { color: var(--primary, #2563eb); border-bottom-color: var(--primary, #2563eb); }
.po-tab button span { background: #e2e8f0; color: #334155; border-radius: 10px; padding: 1px 7px; font-size: 11px; margin-left: 4px; }
.po-tab button span.isi { background: #dbeafe; color: #1d4ed8; }
.po-cari { margin-left: auto; max-width: 280px; margin-bottom: 4px; }
.po-umur { white-space: nowrap; }
.po-umur.kuning { color: #d97706; }
.po-umur.merah { color: #dc2626; }
.po-bar { height: 6px; width: 90px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 3px; }
.po-bar i { display: block; height: 100%; background: #16a34a; }
.klik { cursor: pointer; }
.kanan { text-align: right; }
.pusat { text-align: center; padding: 16px; }
.muted { color: var(--text-3); }
.hijau { color: #16a34a; }
.oranye { color: #d97706; }
.merah { color: #dc2626; }
@media (max-width: 700px) { .po-cari { margin-left: 0; max-width: none; width: 100%; } }
</style>
