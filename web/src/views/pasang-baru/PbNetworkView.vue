<script setup lang="ts">
// Tampilan Network: order setelah vendor ISP terpasang — perangkat Mikrotik, pemasangan, BA aktivasi
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDate } from '@/composables/useFormat'
import { umur } from './pb'

interface Order {
  id_pb: number; nomor_pb: string | null; nama_site: string; kota: string | null; tahap: string; tahap_at: string; tgl_rfs: string | null
  network_metode: string | null; ba_nomor: string | null; ba_ttd: string | null; ba_tgl: string | null
  sph: { nomor_sph: string; pelanggan: { nama_pelanggan: string } }; layanan: { nama_layanan: string }; site: { kode_site: string } | null
  perangkat: { id_aset: number | null; nama_item: string }[]
  wo: {
    nomor_wo: string; status_wo: string; tgl_jadwal: string | null; tipe_eksekutor: string; teknisi: { nama_lengkap: string } | null
    vendor: { nama_vendor: string } | null; kontak_teknisi: { nama: string } | null; pengiriman: { nama_ekspedisi: string | null; nomor_resi: string | null; status_pengiriman: string }[]
  } | null
}

const router = useRouter()
const tab = ref<'antrian' | 'selesai'>('antrian')
const cari = ref('')
const antrian = ref<Order[]>([])
const selesai = ref<Order[]>([])
const memuat = ref(false)
const error = ref('')

async function muat() {
  memuat.value = true
  error.value = ''
  const c = cari.value.trim() || undefined
  try {
    const [a, b] = await Promise.all([
      api.get('/pasang-baru/order', { params: { tahap: 'Network', cari: c } }),
      api.get('/pasang-baru/order', { params: { tahap: 'Selesai', cari: c } }),
    ])
    antrian.value = a.data.data
    selesai.value = (b.data.data as Order[]).sort((x, y) => y.tahap_at.localeCompare(x.tahap_at))
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat data'
  } finally {
    memuat.value = false
  }
}
onMounted(muat)
let timer: ReturnType<typeof setTimeout> | null = null
watch(cari, () => { if (timer) clearTimeout(timer); timer = setTimeout(muat, 350) })

// Langkah berikut tiap order
function langkah(o: Order): { t: string; w: string } {
  if (!o.perangkat.length) return { t: 'Siapkan perangkat', w: 'merah' }
  if (o.perangkat.some((p) => !p.id_aset)) return { t: 'Menunggu request perangkat', w: 'kuning' }
  if (!o.wo) return { t: 'Atur pemasangan', w: 'merah' }
  if (o.wo.status_wo !== 'Completed') {
    if (o.wo.tipe_eksekutor === 'Vendor_Ketiga') {
      const k = o.wo.pengiriman[0]
      return { t: k?.status_pengiriman === 'Diterima' ? 'Menunggu vendor pasang' : k?.status_pengiriman === 'Dikirim' ? 'Perangkat dikirim' : 'Kirim perangkat', w: 'biru' }
    }
    return { t: o.wo.tgl_jadwal ? `Visit ${fmtDate(o.wo.tgl_jadwal)}` : 'Antre Jadwal Visit', w: 'biru' }
  }
  if (!o.ba_ttd) return { t: 'TTD BA aktivasi', w: 'merah' }
  return { t: 'Siap diselesaikan', w: 'hijau' }
}
const jam = (d: string) => (Date.now() - new Date(d).getTime()) / 3600_000
const kpi = computed(() => [
  { t: 'Di tahap Network', n: antrian.value.length, w: 'biru' },
  { t: 'Perlu perangkat', n: antrian.value.filter((o) => !o.perangkat.length || o.perangkat.some((p) => !p.id_aset)).length, w: 'merah' },
  { t: 'Sedang dipasang', n: antrian.value.filter((o) => o.wo && o.wo.status_wo !== 'Completed').length, w: '' },
  { t: 'Lewat 3 hari', n: antrian.value.filter((o) => jam(o.tahap_at) > 72).length, w: 'merah' },
])
const pelaksana = (o: Order) => (o.network_metode === 'Kirim_Vendor'
  ? `🚚 ${o.wo?.kontak_teknisi?.nama ?? o.wo?.vendor?.nama_vendor ?? 'Vendor'}${o.wo?.pengiriman[0]?.nama_ekspedisi ? ` · ${o.wo.pengiriman[0].nama_ekspedisi}` : ''}`
  : o.network_metode === 'Visit_Internal' ? `👷 ${o.wo?.teknisi?.nama_lengkap ?? 'Teknisi internal'}` : '—')
</script>

<template>
  <div>
    <div class="pn-kpi">
      <div v-for="k in kpi" :key="k.t" class="pn-kpi-item" :class="k.n ? k.w : ''"><b>{{ k.n }}</b><span>{{ k.t }}</span></div>
    </div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="pn-tab">
      <button :class="{ aktif: tab === 'antrian' }" @click="tab = 'antrian'">🌐 Antrian Network <span v-if="antrian.length" class="isi">{{ antrian.length }}</span></button>
      <button :class="{ aktif: tab === 'selesai' }" @click="tab = 'selesai'">✅ Selesai <span v-if="selesai.length">{{ selesai.length }}</span></button>
      <input v-model="cari" class="form-input pn-cari" placeholder="Cari site / pelanggan / no. PB…" />
    </div>

    <div class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Lama</th><th>No. PB · Site</th><th>Pelanggan</th><th>Perangkat</th><th>Pemasangan</th>
            <th>{{ tab === 'antrian' ? 'Langkah berikut' : 'BA' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!memuat && !(tab === 'antrian' ? antrian : selesai).length">
            <td colspan="6" class="muted pusat">{{ tab === 'antrian' ? 'Tidak ada order di tahap Network. 👍' : 'Belum ada.' }}</td>
          </tr>
          <tr v-for="o in (tab === 'antrian' ? antrian : selesai)" :key="o.id_pb" class="klik" @click="router.push(`/pasang-baru/order/${o.id_pb}`)">
            <td><b :class="jam(o.tahap_at) > 72 && tab === 'antrian' ? 'merah' : ''">{{ umur(o.tahap_at) }}</b></td>
            <td><b>{{ o.nomor_pb }}</b> · {{ o.nama_site }}<br /><small class="muted">{{ o.site?.kode_site }}<template v-if="o.kota"> · {{ o.kota }}</template></small></td>
            <td>{{ o.sph.pelanggan.nama_pelanggan }}<br /><small class="muted">{{ o.layanan.nama_layanan }}</small></td>
            <td>
              <small v-for="(p, i) in o.perangkat" :key="i" class="pn-blok" :class="{ kuning: !p.id_aset }">{{ p.nama_item }}<template v-if="!p.id_aset"> (request)</template></small>
              <small v-if="!o.perangkat.length" class="merah">belum ada</small>
            </td>
            <td><small>{{ pelaksana(o) }}</small><br /><small v-if="o.wo" class="muted">{{ o.wo.nomor_wo }} · {{ o.wo.status_wo }}</small></td>
            <td>
              <span v-if="tab === 'antrian'" class="pn-langkah" :class="langkah(o).w">{{ langkah(o).t }}</span>
              <small v-else>{{ o.ba_nomor || '-' }}<br /><span class="muted">{{ o.ba_tgl ? fmtDate(o.ba_tgl) : '' }}</span></small>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="memuat" class="muted pusat">Memuat…</p>
    </div>
  </div>
</template>

<style scoped>
.pn-kpi { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.pn-kpi-item { flex: 1 1 140px; padding: 10px 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--surface, #fff); }
.pn-kpi-item b { display: block; font-size: 22px; line-height: 1.1; }
.pn-kpi-item span { font-size: 12px; color: var(--text-3); }
.pn-kpi-item.biru b { color: #2563eb; }
.pn-kpi-item.merah b { color: #dc2626; }
.pn-tab { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; border-bottom: 1px solid var(--border, #e2e8f0); }
.pn-tab button { background: none; border: none; padding: 8px 12px; cursor: pointer; font-weight: 600; color: var(--text-3); border-bottom: 2px solid transparent; }
.pn-tab button.aktif { color: var(--primary, #2563eb); border-bottom-color: var(--primary, #2563eb); }
.pn-tab button span { background: #e2e8f0; color: #334155; border-radius: 10px; padding: 1px 7px; font-size: 11px; margin-left: 4px; }
.pn-tab button span.isi { background: #dbeafe; color: #1d4ed8; }
.pn-cari { margin-left: auto; max-width: 280px; margin-bottom: 4px; }
.pn-blok { display: block; }
.pn-langkah { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #f1f5f9; }
.pn-langkah.merah { background: #fee2e2; color: #b91c1c; }
.pn-langkah.kuning { background: #fef3c7; color: #b45309; }
.pn-langkah.biru { background: #dbeafe; color: #1d4ed8; }
.pn-langkah.hijau { background: #dcfce7; color: #15803d; }
.klik { cursor: pointer; }
.pusat { text-align: center; padding: 16px; }
.muted { color: var(--text-3); }
.merah { color: #dc2626; }
.kuning { color: #b45309; }
@media (max-width: 700px) { .pn-cari { margin-left: 0; max-width: none; width: 100%; } }
</style>
