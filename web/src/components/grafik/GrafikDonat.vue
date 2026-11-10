<script setup lang="ts">
// Donat komposisi (≤ 6 irisan) dengan total di tengah dan legenda berangka.
// Celah 2px antar irisan, irisan "tergambar" berurutan, hover menonjolkan satu irisan.
import { computed, ref } from 'vue'
import { SERI, fmtAngka, kurangiGerak } from './warna'

export interface Irisan { nama: string; n: number; warna?: string; ke?: string }
const props = withDefaults(defineProps<{ data: Irisan[]; ukuran?: number; tebal?: number; labelTengah?: string }>(), {
  ukuran: 150, tebal: 20, labelTengah: 'total',
})
defineEmits<{ (e: 'pilih', i: Irisan): void }>()

const total = computed(() => props.data.reduce((s, d) => s + d.n, 0))
const R = computed(() => (props.ukuran - props.tebal) / 2)
const KEL = computed(() => 2 * Math.PI * R.value)
const irisan = computed(() => {
  let off = 0
  const celah = props.data.filter((d) => d.n > 0).length > 1 ? 2 : 0
  return props.data.map((d, i) => {
    const pj = total.value ? (d.n / total.value) * KEL.value : 0
    const s = { ...d, warna: d.warna ?? SERI[i % SERI.length], dash: `${Math.max(0, pj - celah)} ${KEL.value}`, offset: -off, pct: total.value ? Math.round((d.n / total.value) * 100) : 0 }
    off += pj
    return s
  })
})
const hover = ref<number | null>(null)
const animasi = !kurangiGerak()
const tengah = computed(() => (hover.value != null ? irisan.value[hover.value] : null))
</script>

<template>
  <div class="gd">
    <div class="gd-cincin" :style="{ width: `${ukuran}px`, height: `${ukuran}px` }">
      <svg :width="ukuran" :height="ukuran" role="img" :aria-label="data.map((d) => `${d.nama} ${d.n}`).join(', ')" :class="{ 'gd-putar': animasi }">
        <circle :cx="ukuran / 2" :cy="ukuran / 2" :r="R" fill="none" stroke="#f0efec" :stroke-width="tebal" />
        <circle v-for="(s, i) in irisan" v-show="s.n > 0" :key="s.nama" :cx="ukuran / 2" :cy="ukuran / 2" :r="R" fill="none"
          :stroke="s.warna" :stroke-width="hover === i ? tebal + 6 : tebal" :stroke-dasharray="s.dash" :stroke-dashoffset="s.offset"
          :transform="`rotate(-90 ${ukuran / 2} ${ukuran / 2})`" :opacity="hover == null || hover === i ? 1 : 0.35"
          class="gd-iris" @mouseenter="hover = i" @mouseleave="hover = null" />
      </svg>
      <div class="gd-tengah">
        <b>{{ fmtAngka(tengah ? tengah.n : total) }}</b>
        <span>{{ tengah ? tengah.nama : labelTengah }}</span>
      </div>
    </div>
    <ul class="gd-legenda">
      <li v-for="(s, i) in irisan" :key="s.nama" :class="{ redup: hover != null && hover !== i }" @mouseenter="hover = i" @mouseleave="hover = null">
        <i :style="{ background: s.warna }" /><span class="gd-nama">{{ s.nama }}</span>
        <b>{{ fmtAngka(s.n) }}</b><small>{{ s.pct }}%</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.gd { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.gd-cincin { position: relative; flex-shrink: 0; }
.gd-putar { animation: gd-putar .9s cubic-bezier(.2, .9, .3, 1) both; }
@keyframes gd-putar { from { transform: rotate(-120deg) scale(.6); opacity: 0; } }
.gd-iris { transition: stroke-width .2s, opacity .2s; cursor: pointer; }
.gd-tengah { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; text-align: center; }
.gd-tengah b { font-size: 24px; font-weight: 800; color: #0b0b0b; line-height: 1; font-variant-numeric: tabular-nums; }
.gd-tengah span { font-size: 11px; color: #52514e; margin-top: 3px; max-width: 80%; }
.gd-legenda { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; min-width: 150px; flex: 1; }
.gd-legenda li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #0b0b0b; transition: opacity .2s; }
.gd-legenda li.redup { opacity: .4; }
.gd-legenda i { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.gd-nama { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #52514e; }
.gd-legenda b { font-variant-numeric: tabular-nums; }
.gd-legenda small { width: 34px; text-align: right; color: #898781; font-variant-numeric: tabular-nums; }
</style>
