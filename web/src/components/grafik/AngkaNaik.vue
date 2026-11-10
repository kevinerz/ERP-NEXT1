<script setup lang="ts">
// Angka yang "berhitung naik" saat muncul / berubah — animasi kecil supaya dashboard terasa hidup
import { onMounted, ref, watch } from 'vue'
import { kurangiGerak } from './warna'

const props = withDefaults(defineProps<{ nilai: number; durasi?: number; format?: (n: number) => string; desimal?: number }>(), {
  durasi: 900, desimal: 0,
})
const tampil = ref(0)
let raf = 0

function jalan(dari: number, ke: number) {
  cancelAnimationFrame(raf)
  if (kurangiGerak() || dari === ke) { tampil.value = ke; return }
  const mulai = performance.now()
  const langkah = (t: number) => {
    const p = Math.min(1, (t - mulai) / props.durasi)
    const e = 1 - Math.pow(1 - p, 3) // ease-out
    tampil.value = dari + (ke - dari) * e
    if (p < 1) raf = requestAnimationFrame(langkah)
  }
  raf = requestAnimationFrame(langkah)
}
onMounted(() => jalan(0, props.nilai || 0))
watch(() => props.nilai, (b, l) => jalan(l || 0, b || 0))

const teks = (n: number) => {
  const v = props.desimal ? Number(n.toFixed(props.desimal)) : Math.round(n)
  return props.format ? props.format(v) : v.toLocaleString('id-ID')
}
</script>

<template><span class="angka-naik">{{ teks(tampil) }}</span></template>

<style scoped>
.angka-naik { font-variant-numeric: tabular-nums; }
</style>
