<script setup lang="ts">
// Pasang Baru — tampilan per divisi: Sales (survey & SPH milik sendiri), OPS (antrian kerja), Semua (seluruh tahap)
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PbSalesView from './PbSalesView.vue'
import PbOpsView from './PbOpsView.vue'
import PbNetworkView from './PbNetworkView.vue'
import PbSemuaView from './PbSemuaView.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const punya = (...r: string[]) => r.some((x) => auth.hasRole(x))

const TAMPILAN = [
  { k: 'sales', t: '💼 Sales', boleh: () => punya('Sales', 'Admin', 'Director') },
  { k: 'ops', t: '🛠 OPS', boleh: () => punya('OPS', 'Manager_Ops', 'Admin', 'Director') },
  { k: 'network', t: '🌐 Network', boleh: () => punya('Helpdesk', 'Manager_Ops', 'Admin', 'Director') },
  { k: 'semua', t: '📋 Semua tahap', boleh: () => true },
]
const pilihan = computed(() => TAMPILAN.filter((x) => x.boleh()))
// Bawaan sesuai role: Sales → sales, OPS/Manager Ops → ops, lainnya (Teknisi, Finance, Director, Admin) → semua
const bawaan = computed(() => {
  if (punya('Admin', 'Director')) return 'semua'
  if (punya('Sales')) return 'sales'
  if (punya('OPS', 'Manager_Ops')) return 'ops'
  if (punya('Helpdesk')) return 'network'
  return 'semua'
})
const tampilan = computed(() => {
  const v = route.query.v as string
  return pilihan.value.some((x) => x.k === v) ? v : bawaan.value
})
function ganti(k: string) {
  router.replace({ query: { v: k } })
}
const bisaBuat = computed(() => punya('Sales', 'Director', 'Admin'))
const SUB: Record<string, string> = {
  sales: 'Survey → OPS → SPH → Director. Fokus pada survey & SPH Anda.',
  ops: 'Antrian kerja OPS: cek survey (vendor ISP, IKG, deposit, cover) dan order tahap OPS.',
  network: 'Antrian Network: siapkan Mikrotik, kirim (ekspedisi + vendor teknisi) atau visit teknisi internal, lalu BA aktivasi.',
  semua: 'Survey → OPS → SPH → Director → OPS pasang vendor ISP → Network (Mikrotik & BA) → Selesai',
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">🆕 Pasang Baru</h2>
        <p class="page-subtitle">{{ SUB[tampilan] }}</p>
      </div>
      <div class="pb-kanan">
        <div v-if="pilihan.length > 1" class="pb-tampilan" role="tablist">
          <button v-for="x in pilihan" :key="x.k" :class="{ aktif: tampilan === x.k }" @click="ganti(x.k)">{{ x.t }}</button>
        </div>
        <template v-if="bisaBuat && !['ops', 'network'].includes(tampilan)">
          <button class="btn btn-ghost" title="SPH tanpa survey" @click="router.push('/pasang-baru/sph/baru')">+ SPH langsung</button>
          <button class="btn btn-primary" @click="router.push('/pasang-baru/survey/baru')">+ Survey Baru</button>
        </template>
      </div>
    </div>

    <PbSalesView v-if="tampilan === 'sales'" />
    <PbOpsView v-else-if="tampilan === 'ops'" />
    <PbNetworkView v-else-if="tampilan === 'network'" />
    <PbSemuaView v-else />
  </div>
</template>

<style scoped>
.pb-kanan { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pb-tampilan { display: inline-flex; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; overflow: hidden; }
.pb-tampilan button { border: none; background: none; padding: 7px 12px; cursor: pointer; font-weight: 600; font-size: 13px; color: var(--text-3); }
.pb-tampilan button + button { border-left: 1px solid var(--border, #e2e8f0); }
.pb-tampilan button.aktif { background: var(--primary, #2563eb); color: #fff; }
</style>
