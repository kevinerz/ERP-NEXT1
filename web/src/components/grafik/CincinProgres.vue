<script setup lang="ts">
// Cincin progres (0–100%) — untuk SLA, % dibalas ≤ 15 menit, dsb. Warna mengikuti ambang (status).
import { computed } from 'vue'
import { STATUS, kurangiGerak } from './warna'
import AngkaNaik from './AngkaNaik.vue'

const props = withDefaults(defineProps<{ persen: number; ukuran?: number; label?: string; ambangBaik?: number; ambangWaspada?: number }>(), {
  ukuran: 96, label: '', ambangBaik: 95, ambangWaspada: 85,
})
const p = computed(() => Math.max(0, Math.min(100, props.persen || 0)))
const warna = computed(() => (p.value >= props.ambangBaik ? STATUS.baik : p.value >= props.ambangWaspada ? STATUS.waspada : STATUS.kritis))
const ikon = computed(() => (p.value >= props.ambangBaik ? '✓' : p.value >= props.ambangWaspada ? '!' : '✕'))
const R = computed(() => props.ukuran / 2 - 8)
const KEL = computed(() => 2 * Math.PI * R.value)
const animasi = !kurangiGerak()
</script>

<template>
  <div class="cp-cincin" :style="{ width: `${ukuran}px`, height: `${ukuran}px` }" role="img" :aria-label="`${label} ${p}%`">
    <svg :width="ukuran" :height="ukuran">
      <circle :cx="ukuran / 2" :cy="ukuran / 2" :r="R" fill="none" stroke="#f0efec" stroke-width="9" />
      <circle :cx="ukuran / 2" :cy="ukuran / 2" :r="R" fill="none" :stroke="warna" stroke-width="9" stroke-linecap="round"
        :stroke-dasharray="KEL" :stroke-dashoffset="KEL * (1 - p / 100)" :transform="`rotate(-90 ${ukuran / 2} ${ukuran / 2})`"
        :class="{ 'cp-isi': animasi }" :style="{ '--kel': KEL }" />
    </svg>
    <div class="cp-tengah">
      <b><AngkaNaik :nilai="p" :desimal="p % 1 ? 1 : 0" />%</b>
      <small :style="{ color: warna }">{{ ikon }} {{ label }}</small>
    </div>
  </div>
</template>

<style scoped>
.cp-cincin { position: relative; flex-shrink: 0; }
.cp-isi { animation: cp-isi 1.2s cubic-bezier(.2, .9, .3, 1) both; }
@keyframes cp-isi { from { stroke-dashoffset: var(--kel); } }
.cp-tengah { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.cp-tengah b { font-size: 19px; font-weight: 800; color: #0b0b0b; line-height: 1; }
.cp-tengah small { font-size: 10.5px; font-weight: 700; margin-top: 3px; }
</style>
