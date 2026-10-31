<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { fmtRupiah, fmtDate } from '@/composables/useFormat'
import { KELAS_SPH, KELAS_TAHAP, TAHAP_ORDER, umur } from './pb'

interface Sph {
  id_sph: number; nomor_sph: string; status: string; pelanggan: { nama_pelanggan: string }
  sales: string | null; jumlah_site: number; total_bulanan: number; updated_at: string
}
interface Order {
  id_pb: number; nomor_pb: string | null; nama_site: string; kota: string | null; tahap: string; tahap_at: string
  tgl_rfs: string | null; biaya_bulanan: string; sph: { nomor_sph: string; pelanggan: { nama_pelanggan: string } }
  layanan: { nama_layanan: string }; site: { kode_site: string } | null
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const TAB = ['SPH', ...TAHAP_ORDER, 'Batal'] as const
const tab = ref<string>(TAB.includes(route.query.tab as any) ? (route.query.tab as string) : 'SPH')
const cari = ref('')
const statusSph = ref('')
const ringkas = ref<{ tahap: Record<string, number>; sph: Record<string, number> }>({ tahap: {}, sph: {} })
const sph = ref<Sph[]>([])
const order = ref<Order[]>([])
const memuat = ref(false)
const error = ref('')

const bisaBuat = computed(() => ['Sales', 'Director', 'Admin'].some((r) => auth.hasRole(r)))

async function muat() {
  memuat.value = true
  error.value = ''
  try {
    const [r, d] = await Promise.all([
      api.get('/pasang-baru/ringkas'),
      tab.value === 'SPH'
        ? api.get('/pasang-baru/sph', { params: { status: statusSph.value || undefined, cari: cari.value || undefined } })
        : api.get('/pasang-baru/order', { params: { tahap: tab.value, cari: cari.value || undefined } }),
    ])
    ringkas.value = r.data.data
    if (tab.value === 'SPH') sph.value = d.data.data
    else order.value = d.data.data
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat data'
  } finally {
    memuat.value = false
  }
}
onMounted(muat)
watch([tab, statusSph], () => {
  router.replace({ query: { ...route.query, tab: tab.value } })
  muat()
})
let timer: ReturnType<typeof setTimeout> | null = null
watch(cari, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(muat, 350)
})

const jumlah = (t: string) => (t === 'SPH' ? (ringkas.value.sph['Menunggu Director'] ?? 0) : (ringkas.value.tahap[t] ?? 0))
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">🆕 Pasang Baru</h2>
        <p class="page-subtitle">SPH → Director → Sales (FAB) → OPS → Instalasi → NOC → Finance</p>
      </div>
      <button v-if="bisaBuat" class="btn btn-primary" @click="router.push('/pasang-baru/sph/baru')">+ SPH Baru</button>
    </div>

    <div class="pb-tab">
      <button v-for="t in TAB" :key="t" :class="{ aktif: tab === t }" @click="tab = t">
        {{ t === 'SPH' ? '📄 SPH' : t }}
        <span v-if="jumlah(t)" class="pb-jml" :class="{ kuning: t === 'SPH' }">{{ jumlah(t) }}</span>
      </button>
    </div>

    <div class="filter-bar pb-filter">
      <input v-model="cari" class="form-input search-input" :placeholder="tab === 'SPH' ? 'Cari nomor SPH / pelanggan' : 'Cari site / pelanggan / no. PB / SPH'" />
      <select v-if="tab === 'SPH'" v-model="statusSph" class="form-input pb-status">
        <option value="">Semua status</option>
        <option>Draft</option><option>Menunggu Director</option><option>Ditolak</option><option>Disetujui</option>
      </select>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="table-card">
      <table v-if="tab === 'SPH'" class="data-table">
        <thead><tr><th>No. SPH</th><th>Pelanggan</th><th>Site</th><th class="kanan">Total bulanan</th><th>Sales</th><th>Status</th><th>Diperbarui</th></tr></thead>
        <tbody>
          <tr v-if="!memuat && !sph.length"><td colspan="7" class="muted pusat">Belum ada SPH.</td></tr>
          <tr v-for="s in sph" :key="s.id_sph" class="klik" @click="router.push(`/pasang-baru/sph/${s.id_sph}`)">
            <td><b>{{ s.nomor_sph }}</b></td>
            <td>{{ s.pelanggan.nama_pelanggan }}</td>
            <td>{{ s.jumlah_site }}</td>
            <td class="kanan">{{ fmtRupiah(s.total_bulanan) }}</td>
            <td>{{ s.sales || '-' }}</td>
            <td><span class="badge" :class="KELAS_SPH[s.status]">{{ s.status }}</span></td>
            <td class="muted">{{ fmtDate(s.updated_at) }}</td>
          </tr>
        </tbody>
      </table>

      <table v-else class="data-table">
        <thead><tr><th>No. PB</th><th>Site</th><th>Pelanggan</th><th>Layanan</th><th>RFS</th><th>Tahap</th><th>Umur</th></tr></thead>
        <tbody>
          <tr v-if="!memuat && !order.length"><td colspan="7" class="muted pusat">Tidak ada order di tahap ini.</td></tr>
          <tr v-for="o in order" :key="o.id_pb" class="klik" @click="router.push(`/pasang-baru/order/${o.id_pb}`)">
            <td><b>{{ o.nomor_pb }}</b><br /><small class="muted">{{ o.sph.nomor_sph }}</small></td>
            <td>{{ o.nama_site }}<br /><small class="muted">{{ o.site?.kode_site }}<template v-if="o.kota"> · {{ o.kota }}</template></small></td>
            <td>{{ o.sph.pelanggan.nama_pelanggan }}</td>
            <td>{{ o.layanan.nama_layanan }}</td>
            <td>{{ o.tgl_rfs ? fmtDate(o.tgl_rfs) : '-' }}</td>
            <td><span class="badge" :class="KELAS_TAHAP[o.tahap]">{{ o.tahap }}</span></td>
            <td class="muted">{{ umur(o.tahap_at) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="memuat" class="muted pusat">Memuat…</p>
    </div>
  </div>
</template>

<style scoped>
.pb-tab { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; border-bottom: 1px solid var(--border, #e2e8f0); }
.pb-tab button { background: none; border: none; padding: 8px 14px; cursor: pointer; font-weight: 600; color: var(--text-3); border-bottom: 2px solid transparent; }
.pb-tab button.aktif { color: var(--primary, #2563eb); border-bottom-color: var(--primary, #2563eb); }
.pb-jml { background: #e2e8f0; color: #334155; border-radius: 10px; padding: 1px 7px; font-size: 11px; margin-left: 4px; }
.pb-jml.kuning { background: #fef3c7; color: #b45309; }
.pb-filter { display: flex; gap: 8px; margin-bottom: 12px; }
.pb-status { max-width: 200px; }
.klik { cursor: pointer; }
.kanan { text-align: right; }
.pusat { text-align: center; padding: 16px; }
.muted { color: var(--text-3); }
</style>
