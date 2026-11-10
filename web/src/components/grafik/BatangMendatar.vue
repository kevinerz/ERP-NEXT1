<script setup lang="ts">
// Batang mendatar berlabel — untuk peringkat / tahapan (funnel). Angka selalu tertulis di ujung batang.
import { computed } from 'vue'
import { RAMP_BIRU, fmtAngka, kurangiGerak } from './warna'

export interface BarisBatang { nama: string; n: number; warna?: string; ikon?: string; ke?: string }
const props = withDefaults(defineProps<{ data: BarisBatang[]; warna?: string; bertahap?: boolean }>(), { warna: '#2a78d6', bertahap: false })
const maks = computed(() => Math.max(1, ...props.data.map((d) => d.n)))
const baris = computed(() => props.data.map((d, i) => ({
  ...d,
  pct: (d.n / maks.value) * 100,
  // bertahap = funnel: ramp biru dari terang ke gelap mengikuti urutan tahap
  warna: d.warna ?? (props.bertahap ? RAMP_BIRU[Math.min(RAMP_BIRU.length - 1, Math.round((i / Math.max(1, props.data.length - 1)) * (RAMP_BIRU.length - 1)))] : props.warna),
})))
const animasi = !kurangiGerak()
</script>

<template>
  <ul class="bm">
    <li v-for="(b, i) in baris" :key="b.nama">
      <component :is="b.ke ? 'RouterLink' : 'div'" :to="b.ke" class="bm-baris">
        <span class="bm-nama">{{ b.ikon ? `${b.ikon} ` : '' }}{{ b.nama }}</span>
        <span class="bm-rel">
          <span class="bm-isi" :class="{ 'bm-tumbuh': animasi }" :style="{ width: `${Math.max(b.n ? 3 : 0, b.pct)}%`, background: b.warna, animationDelay: `${i * 70}ms` }" />
          <b class="bm-n">{{ fmtAngka(b.n) }}</b>
        </span>
      </component>
    </li>
  </ul>
</template>

<style scoped>
.bm { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.bm-baris { display: grid; grid-template-columns: minmax(90px, 34%) 1fr; align-items: center; gap: 10px; color: inherit; text-decoration: none; border-radius: 8px; padding: 2px 4px; }
a.bm-baris:hover { background: #f8fafc; }
.bm-nama { font-size: 12.5px; color: #52514e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-rel { display: flex; align-items: center; gap: 8px; min-width: 0; }
.bm-isi { height: 14px; border-radius: 0 4px 4px 0; flex-shrink: 0; max-width: calc(100% - 44px); }
.bm-n { font-size: 12.5px; font-weight: 700; color: #0b0b0b; font-variant-numeric: tabular-nums; }
.bm-tumbuh { transform-origin: left; animation: bm-tumbuh .8s cubic-bezier(.2, .9, .3, 1.1) both; }
@keyframes bm-tumbuh { from { transform: scaleX(0); } }
</style>
