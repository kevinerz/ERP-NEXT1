<script setup lang="ts">
// Grafik batang vertikal (satu atau beberapa seri berdampingan) dengan tooltip per kategori.
// HTML/CSS biasa supaya ikut lebar kartu tanpa teks yang ikut melar.
import { computed, ref } from 'vue'

export interface Seri { nama: string; warna: string; nilai: (number | null)[] }
const props = withDefaults(defineProps<{
  label: string[]
  seri: Seri[]
  format?: (v: number) => string
  labelSumbu?: (l: string, i: number) => string
  tinggi?: number
  batas?: number // nilai di atas batas digambar penuh + tanda ▲ (pencilan tidak menenggelamkan batang lain)
}>(), { format: (v: number) => v.toLocaleString('id-ID'), labelSumbu: (l: string) => l, tinggi: 180 })

const maks = computed(() => {
  const m = Math.min(props.batas ?? Infinity, Math.max(0, ...props.seri.flatMap((s) => s.nilai.map((v) => v ?? 0))))
  if (m <= 0) return 1
  // Bulatkan ke angka "enak" supaya garis bantu rapi
  const p = 10 ** Math.floor(Math.log10(m))
  return [1, 2, 5, 10].find((k) => k * p >= m)! * p
})
const garis = computed(() => [1, 0.5].map((f) => ({ f, nilai: maks.value * f })))
// Label sumbu-x dijarangkan bila kategori banyak
const loncat = computed(() => Math.max(1, Math.ceil(props.label.length / 12)))
const aktif = ref<number | null>(null)
</script>

<template>
  <div class="sb">
    <div v-if="seri.length > 1" class="sb-legenda">
      <span v-for="s in seri" :key="s.nama"><i :style="{ background: s.warna }" />{{ s.nama }}</span>
    </div>
    <div class="sb-area" :style="{ height: tinggi + 'px' }" @mouseleave="aktif = null">
      <div v-for="g in garis" :key="g.f" class="sb-garis" :style="{ bottom: g.f * 100 + '%' }"><span>{{ format(g.nilai) }}</span></div>
      <div
        v-for="(l, i) in label" :key="i" class="sb-kolom" :class="{ on: aktif === i }"
        @mouseenter="aktif = i" @focus="aktif = i" @click="aktif = i" tabindex="0"
      >
        <div class="sb-batang-grup">
          <div
            v-for="s in seri" :key="s.nama" class="sb-batang"
            :style="{ height: (Math.min(s.nilai[i] ?? 0, maks) / maks) * 100 + '%', background: s.warna }"
          ><span v-if="(s.nilai[i] ?? 0) > maks" class="sb-lewat">▲</span></div>
        </div>
        <div v-if="aktif === i" class="sb-tip" :class="{ kiri: i > label.length / 2 }">
          <b>{{ labelSumbu(l, i) }}</b>
          <div v-for="s in seri" :key="s.nama"><i :style="{ background: s.warna }" />{{ s.nama }}: <b>{{ s.nilai[i] == null ? '–' : format(s.nilai[i]!) }}</b></div>
        </div>
      </div>
    </div>
    <div class="sb-sumbu">
      <span v-for="(l, i) in label" :key="i">{{ i % loncat === 0 ? labelSumbu(l, i) : '' }}</span>
    </div>
  </div>
</template>

<style scoped>
.sb { width: 100%; }
.sb-legenda { display: flex; gap: 14px; font-size: 12px; color: var(--text-2); margin-bottom: 8px; }
.sb-legenda i, .sb-tip i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.sb-area { position: relative; display: flex; align-items: flex-end; gap: 2px; padding-left: 44px; border-bottom: 1px solid var(--border); }
.sb-garis { position: absolute; left: 44px; right: 0; border-top: 1px dashed var(--border); pointer-events: none; }
.sb-garis span { position: absolute; left: -44px; top: -8px; width: 40px; text-align: right; font-size: 10.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.sb-kolom { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end; justify-content: center; cursor: default; outline: none; border-radius: 4px 4px 0 0; }
.sb-kolom.on { background: rgba(15, 23, 42, .04); }
.sb-batang-grup { display: flex; align-items: flex-end; gap: 2px; height: 100%; width: 100%; max-width: 46px; padding: 0 1px; }
.sb-batang { position: relative; flex: 1; min-height: 0; border-radius: 4px 4px 0 0; transition: height .25s; }
.sb-lewat { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); font-size: 10px; color: var(--text-2); }
.sb-tip {
  position: absolute; bottom: calc(100% - 20px); left: 50%; z-index: 5; min-width: 150px; white-space: nowrap;
  background: #0f172a; color: #f8fafc; font-size: 12px; padding: 7px 9px; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.2); pointer-events: none;
}
.sb-tip.kiri { left: auto; right: 50%; }
.sb-tip > b { display: block; margin-bottom: 3px; }
.sb-sumbu { display: flex; gap: 2px; padding-left: 44px; margin-top: 4px; }
.sb-sumbu span { flex: 1; text-align: center; font-size: 10.5px; color: var(--text-muted); white-space: nowrap; overflow: visible; }
</style>
