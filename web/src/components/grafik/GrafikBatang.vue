<script setup lang="ts">
// Grafik batang vertikal (1–2 seri berdampingan), satu sumbu Y.
// Ujung atas membulat 4px, batang "tumbuh" dari dasar saat muncul, tooltip per kelompok saat hover.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { SERI, TINTA, fmtAngka, kurangiGerak } from './warna'

export interface SeriBatang { nama: string; nilai: number[]; warna?: string }
const props = withDefaults(defineProps<{
  label: string[]
  seri: SeriBatang[]
  tinggi?: number
  labelPanjang?: string[]
  sorot?: number | null   // indeks yang ditonjolkan (mis. jam sekarang)
  judulAria?: string
  format?: (n: number) => string  // format angka sumbu Y & tooltip (mis. rupiah ringkas)
}>(), { tinggi: 190, sorot: null })

const wadah = ref<HTMLElement | null>(null)
const lebar = ref(560)
let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([e]) => { if (e) lebar.value = Math.max(220, e.contentRect.width) })
  if (wadah.value) ro.observe(wadah.value)
})
onBeforeUnmount(() => ro?.disconnect())

const fmt = (n: number) => (props.format ? props.format(n) : fmtAngka(n))
// Lebar kolom sumbu Y menyesuaikan label terpanjang
const PAD = computed(() => ({ kiri: Math.max(28, 10 + 6.3 * fmt(maksY.value).length), kanan: 6, atas: 10, bawah: 24 }))
const n = computed(() => props.label.length)
const plotW = computed(() => lebar.value - PAD.value.kiri - PAD.value.kanan)
const plotH = computed(() => props.tinggi - PAD.value.atas - PAD.value.bawah)
const maksY = computed(() => {
  const m = Math.max(1, ...props.seri.flatMap((s) => s.nilai))
  const p = Math.pow(10, Math.floor(Math.log10(m)))
  return Math.ceil(m / p) * p
})
const gridY = computed(() => [0, 0.5, 1].map((f) => ({ y: PAD.value.atas + plotH.value * (1 - f), v: Math.round(maksY.value * f) })))
const lebarKelompok = computed(() => plotW.value / Math.max(1, n.value))
const GAP = 2
const lebarBatang = computed(() => Math.max(2, (lebarKelompok.value * 0.78 - GAP * (props.seri.length - 1)) / props.seri.length))

function jalur(xk: number, v: number) {
  const h = (v / maksY.value) * plotH.value
  if (h <= 0) return ''
  const w = lebarBatang.value, r = Math.min(4, w / 2, h)
  const y0 = PAD.value.atas + plotH.value, y1 = y0 - h
  return `M${xk},${y0} V${y1 + r} Q${xk},${y1} ${xk + r},${y1} H${xk + w - r} Q${xk + w},${y1} ${xk + w},${y1 + r} V${y0} Z`
}
const batang = computed(() => props.seri.map((s, si) => ({
  ...s, warna: s.warna ?? SERI[si % SERI.length],
  jalur: s.nilai.map((v, i) => jalur(PAD.value.kiri + i * lebarKelompok.value + lebarKelompok.value * 0.11 + si * (lebarBatang.value + GAP), v)),
})))
const langkahX = computed(() => Math.max(1, Math.ceil(n.value / Math.max(2, Math.floor(plotW.value / 30)))))

const hover = ref<number | null>(null)
const tip = computed(() => {
  if (hover.value == null) return null
  const i = hover.value
  const cx = PAD.value.kiri + (i + 0.5) * lebarKelompok.value
  return { i, cx, kiri: cx > lebar.value * 0.6, judul: props.labelPanjang?.[i] ?? props.label[i], baris: batang.value.map((b) => ({ nama: b.nama, warna: b.warna, v: b.nilai[i] ?? 0 })) }
})
const animasi = !kurangiGerak()
</script>

<template>
  <div ref="wadah" class="gb">
    <div v-if="seri.length > 1" class="gb-legenda">
      <span v-for="b in batang" :key="b.nama"><i :style="{ background: b.warna }" />{{ b.nama }}</span>
    </div>
    <svg :width="lebar" :height="tinggi" role="img" :aria-label="judulAria ?? seri.map((s) => `${s.nama}: total ${s.nilai.reduce((a, b) => a + b, 0)}`).join('; ')" @mouseleave="hover = null">
      <line v-for="gy in gridY" :key="gy.y" :x1="PAD.kiri" :x2="lebar - PAD.kanan" :y1="gy.y" :y2="gy.y" :stroke="gy.v === 0 ? TINTA.sumbu : TINTA.grid" />
      <text v-for="gy in gridY" :key="'t' + gy.y" :x="PAD.kiri - 6" :y="gy.y + 3" text-anchor="end" class="gb-sumbu">{{ fmt(gy.v) }}</text>
      <rect v-if="sorot != null" :x="PAD.kiri + sorot * lebarKelompok" :y="PAD.atas" :width="lebarKelompok" :height="plotH" fill="#2a78d6" opacity=".06" rx="4" />
      <g v-for="(b, bi) in batang" :key="b.nama">
        <path v-for="(d, i) in b.jalur" :key="i" :d="d" :fill="b.warna" :opacity="hover == null || hover === i ? 1 : 0.35"
          :class="{ 'gb-tumbuh': animasi }" :style="{ animationDelay: `${i * 22 + bi * 60}ms` }" />
      </g>
      <text v-for="(l, i) in label" v-show="i % langkahX === 0" :key="'x' + i" :x="PAD.kiri + (i + 0.5) * lebarKelompok" :y="tinggi - 7" text-anchor="middle" class="gb-sumbu" :class="{ 'gb-sorot': sorot === i }">{{ l }}</text>
      <!-- area hover selebar kelompok (lebih besar dari batangnya) -->
      <rect v-for="(_, i) in label" :key="'h' + i" :x="PAD.kiri + i * lebarKelompok" :y="PAD.atas" :width="lebarKelompok" :height="plotH" fill="transparent" @mouseenter="hover = i" />
    </svg>
    <div v-if="tip" class="gb-tip" :style="{ left: `${tip.cx}px`, transform: tip.kiri ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)' }">
      <b>{{ tip.judul }}</b>
      <div v-for="r in tip.baris" :key="r.nama"><i :style="{ background: r.warna }" />{{ r.nama }} <strong>{{ fmt(r.v) }}</strong></div>
    </div>
  </div>
</template>

<style scoped>
.gb { position: relative; width: 100%; }
.gb svg { display: block; overflow: visible; }
.gb-sumbu { font-size: 10.5px; fill: #898781; font-variant-numeric: tabular-nums; }
.gb-sorot { fill: #2a78d6; font-weight: 700; }
.gb-legenda { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #52514e; margin-bottom: 6px; }
.gb-legenda i, .gb-tip i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.gb-tip { position: absolute; top: 8px; pointer-events: none; background: #fff; border: 1px solid #e1e0d9; border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #0b0b0b; box-shadow: 0 8px 24px rgba(15, 23, 42, .12); white-space: nowrap; z-index: 5; }
.gb-tip b { display: block; margin-bottom: 4px; color: #52514e; font-weight: 600; }
.gb-tip strong { margin-left: 8px; font-variant-numeric: tabular-nums; }
.gb path { transition: opacity .15s; }
.gb-tumbuh { transform-box: fill-box; transform-origin: bottom; animation: gb-tumbuh .7s cubic-bezier(.2, .9, .3, 1.15) both; }
@keyframes gb-tumbuh { from { transform: scaleY(0); } }
</style>
