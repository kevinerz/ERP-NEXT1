<script setup lang="ts">
// Grafik garis/area untuk tren waktu (1–3 seri), satu sumbu Y.
// Hover: garis bantu + tooltip semua seri pada titik itu. Garis "tergambar" saat muncul.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { SERI, TINTA, fmtAngka, kurangiGerak } from './warna'

export interface SeriTren { nama: string; nilai: number[]; warna?: string }
const props = withDefaults(defineProps<{
  label: string[]           // label sumbu X (mis. tanggal)
  seri: SeriTren[]
  tinggi?: number
  labelPanjang?: string[]   // label untuk tooltip (opsional, lebih lengkap dari label sumbu)
  judulAria?: string
}>(), { tinggi: 200 })

const wadah = ref<HTMLElement | null>(null)
const lebar = ref(560)
let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([e]) => { if (e) lebar.value = Math.max(240, e.contentRect.width) })
  if (wadah.value) ro.observe(wadah.value)
})
onBeforeUnmount(() => ro?.disconnect())

const PAD = { kiri: 34, kanan: 12, atas: 12, bawah: 26 }
const n = computed(() => props.label.length)
const plotW = computed(() => lebar.value - PAD.kiri - PAD.kanan)
const plotH = computed(() => props.tinggi - PAD.atas - PAD.bawah)

// Skala Y "bagus": 0 .. maks dibulatkan ke atas
const maksY = computed(() => {
  const m = Math.max(1, ...props.seri.flatMap((s) => s.nilai))
  const p = Math.pow(10, Math.floor(Math.log10(m)))
  return Math.ceil(m / p) * p
})
const gridY = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: PAD.atas + plotH.value * (1 - f), v: Math.round(maksY.value * f) })))
const x = (i: number) => PAD.kiri + (n.value <= 1 ? plotW.value / 2 : (i / (n.value - 1)) * plotW.value)
const y = (v: number) => PAD.atas + plotH.value * (1 - v / maksY.value)

const garis = computed(() => props.seri.map((s, si) => {
  const pts = s.nilai.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const d = 'M' + pts.join(' L')
  const area = `${d} L${x(s.nilai.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  return { ...s, warna: s.warna ?? SERI[si % SERI.length], d, area }
}))
// Label X: tampilkan sebagian bila sempit
const langkahX = computed(() => Math.max(1, Math.ceil(n.value / Math.max(2, Math.floor(plotW.value / 54)))))

const hover = ref<number | null>(null)
function gerak(e: MouseEvent) {
  const r = (e.currentTarget as SVGElement).getBoundingClientRect()
  const px = e.clientX - r.left - PAD.kiri
  const i = Math.round((px / plotW.value) * (n.value - 1))
  hover.value = i >= 0 && i < n.value ? i : null
}
const tip = computed(() => {
  if (hover.value == null) return null
  const i = hover.value
  const kiri = x(i) > lebar.value * 0.6
  return { i, left: x(i), kiri, judul: props.labelPanjang?.[i] ?? props.label[i], baris: garis.value.map((g) => ({ nama: g.nama, warna: g.warna, v: g.nilai[i] ?? 0 })) }
})
const animasi = !kurangiGerak()
const ringkasAria = computed(() => props.judulAria ?? props.seri.map((s) => `${s.nama}: total ${s.nilai.reduce((a, b) => a + b, 0)}`).join('; '))
</script>

<template>
  <div ref="wadah" class="gt">
    <div v-if="seri.length > 1" class="gt-legenda">
      <span v-for="g in garis" :key="g.nama"><i :style="{ background: g.warna }" />{{ g.nama }}</span>
    </div>
    <svg :width="lebar" :height="tinggi" role="img" :aria-label="ringkasAria" @mousemove="gerak" @mouseleave="hover = null">
      <g>
        <line v-for="gy in gridY" :key="gy.y" :x1="PAD.kiri" :x2="lebar - PAD.kanan" :y1="gy.y" :y2="gy.y" :stroke="gy.v === 0 ? TINTA.sumbu : TINTA.grid" stroke-width="1" />
        <text v-for="gy in gridY" :key="'t' + gy.y" :x="PAD.kiri - 6" :y="gy.y + 3" text-anchor="end" class="gt-sumbu">{{ fmtAngka(gy.v) }}</text>
      </g>
      <template v-for="(g, gi) in garis" :key="g.nama">
        <path :d="g.area" :fill="g.warna" :opacity="garis.length > 1 ? 0.08 : 0.14" :class="{ 'gt-muncul': animasi }" />
        <path :d="g.d" fill="none" :stroke="g.warna" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
          :class="{ 'gt-gambar': animasi }" :style="{ animationDelay: `${gi * 160}ms` }" pathLength="1" />
      </template>
      <text v-for="(l, i) in label" v-show="i % langkahX === 0 || i === label.length - 1" :key="'x' + i" :x="x(i)" :y="tinggi - 8" text-anchor="middle" class="gt-sumbu">{{ l }}</text>
      <g v-if="tip">
        <line :x1="tip.left" :x2="tip.left" :y1="PAD.atas" :y2="PAD.atas + plotH" :stroke="TINTA.sumbu" stroke-dasharray="3 3" />
        <circle v-for="b in tip.baris" :key="b.nama" :cx="tip.left" :cy="y(b.v)" r="5" :fill="b.warna" stroke="#fff" stroke-width="2" />
      </g>
    </svg>
    <div v-if="tip" class="gt-tip" :style="{ left: `${tip.left}px`, transform: tip.kiri ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }">
      <b>{{ tip.judul }}</b>
      <div v-for="b in tip.baris" :key="b.nama"><i :style="{ background: b.warna }" />{{ b.nama }} <strong>{{ fmtAngka(b.v) }}</strong></div>
    </div>
  </div>
</template>

<style scoped>
.gt { position: relative; width: 100%; }
.gt svg { display: block; overflow: visible; }
.gt-sumbu { font-size: 10.5px; fill: #898781; font-variant-numeric: tabular-nums; }
.gt-legenda { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #52514e; margin-bottom: 6px; }
.gt-legenda i, .gt-tip i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.gt-tip { position: absolute; top: 10px; pointer-events: none; background: #fff; border: 1px solid #e1e0d9; border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #0b0b0b; box-shadow: 0 8px 24px rgba(15, 23, 42, .12); white-space: nowrap; z-index: 5; }
.gt-tip b { display: block; margin-bottom: 4px; color: #52514e; font-weight: 600; }
.gt-tip strong { margin-left: 8px; font-variant-numeric: tabular-nums; }
.gt-gambar { stroke-dasharray: 1; stroke-dashoffset: 1; animation: gt-gambar 1.1s ease-out forwards; }
.gt-muncul { animation: gt-muncul .9s ease-out both; }
@keyframes gt-gambar { to { stroke-dashoffset: 0; } }
@keyframes gt-muncul { from { opacity: 0; } }
</style>
