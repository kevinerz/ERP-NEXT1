<script lang="ts">
export interface OpsiCari { value: number; label: string; sub?: string }
</script>

<script setup lang="ts">
// Pilihan dengan pencarian ke server — untuk daftar besar (site, pelanggan) yang tidak muat di <select>.
// `cari(q)` dipanggil (debounce 300 ms) dan mengembalikan opsi; nilai terpilih lewat v-model (id angka).
import { ref, watch, onBeforeUnmount } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number | null | undefined
  cari: (q: string) => Promise<OpsiCari[]>
  placeholder?: string
  labelTerpilih?: string
  id?: string
}>(), { placeholder: 'Ketik untuk mencari…', labelTerpilih: '' })
const emit = defineEmits<{ (e: 'update:modelValue', v: number | null): void; (e: 'pilih', o: OpsiCari | null): void }>()

const q = ref('')
const opsi = ref<OpsiCari[]>([])
const buka = ref(false)
const memuat = ref(false)
const galat = ref('')
const sorot = ref(0)
const terpilih = ref<OpsiCari | null>(props.modelValue && props.labelTerpilih ? { value: props.modelValue, label: props.labelTerpilih } : null)

let timer: ReturnType<typeof setTimeout> | undefined
let urutan = 0
async function jalankan() {
  const no = ++urutan
  memuat.value = true; galat.value = ''
  try {
    const hasil = await props.cari(q.value.trim())
    if (no === urutan) { opsi.value = hasil; sorot.value = 0 }
  } catch (e: any) {
    if (no === urutan) { opsi.value = []; galat.value = e?.response?.data?.message || 'Gagal memuat data' }
  } finally { if (no === urutan) memuat.value = false }
}
watch(q, () => { clearTimeout(timer); timer = setTimeout(jalankan, 300) })
watch(() => props.modelValue, (v) => { if (!v) terpilih.value = null })
onBeforeUnmount(() => clearTimeout(timer))

function fokus() { buka.value = true; if (!opsi.value.length && !memuat.value) jalankan() }
function pilih(o: OpsiCari) {
  terpilih.value = o; buka.value = false; q.value = ''
  emit('update:modelValue', o.value); emit('pilih', o)
}
function ganti() { terpilih.value = null; emit('update:modelValue', null); emit('pilih', null) }
function tutupNanti() { setTimeout(() => (buka.value = false), 150) }
function tombol(e: KeyboardEvent) {
  if (!buka.value) return
  if (e.key === 'ArrowDown') { e.preventDefault(); sorot.value = Math.min(sorot.value + 1, opsi.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sorot.value = Math.max(sorot.value - 1, 0) }
  else if (e.key === 'Enter') { const o = opsi.value[sorot.value]; if (o) { e.preventDefault(); pilih(o) } }
  else if (e.key === 'Escape') { buka.value = false }
}
</script>

<template>
  <div class="cp">
    <div v-if="terpilih" class="cp-terpilih">
      <div class="cp-teks"><b>{{ terpilih.label }}</b><small v-if="terpilih.sub">{{ terpilih.sub }}</small></div>
      <button type="button" class="cp-ganti" @click="ganti">Ganti</button>
    </div>
    <template v-else>
      <input :id="id" v-model="q" class="cp-input" type="search" autocomplete="off" :placeholder="placeholder"
        role="combobox" :aria-expanded="buka" @focus="fokus" @blur="tutupNanti" @keydown="tombol" />
      <ul v-if="buka" class="cp-daftar" role="listbox">
        <li v-if="memuat" class="cp-info">Mencari…</li>
        <li v-else-if="galat" class="cp-info cp-galat">{{ galat }} <button type="button" @mousedown.prevent="jalankan">Coba lagi</button></li>
        <li v-else-if="!opsi.length" class="cp-info">Tidak ada yang cocok{{ q ? ` dengan “${q}”` : '' }}</li>
        <li v-for="(o, i) in opsi" v-else :key="o.value" role="option" :aria-selected="i === sorot"
          :class="['cp-opsi', { sorot: i === sorot }]" @mousedown.prevent="pilih(o)" @mouseenter="sorot = i">
          <b>{{ o.label }}</b><small v-if="o.sub">{{ o.sub }}</small>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.cp { position: relative; }
.cp-input { width: 100%; padding: 9px 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; font: inherit; font-size: 14px; background: var(--surface, #fff); }
.cp-input:focus { outline: 2px solid #93c5fd; border-color: #3b82f6; }
.cp-daftar { position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 4px); max-height: 260px; overflow-y: auto; margin: 0; padding: 4px; list-style: none; background: var(--surface, #fff); border: 1px solid var(--border, #e2e8f0); border-radius: 8px; box-shadow: 0 8px 24px rgba(15, 23, 42, .12); }
.cp-opsi { display: flex; flex-direction: column; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13.5px; }
.cp-opsi.sorot { background: #eff6ff; }
.cp-opsi small, .cp-teks small { color: #64748b; font-size: 12px; }
.cp-info { padding: 8px 10px; color: #64748b; font-size: 13px; }
.cp-galat { color: #dc2626; }
.cp-galat button { border: 0; background: none; color: #2563eb; text-decoration: underline; cursor: pointer; font-size: 13px; }
.cp-terpilih { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 8px; }
.cp-teks { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 13.5px; }
.cp-ganti { border: 0; background: none; color: #2563eb; cursor: pointer; font-size: 13px; text-decoration: underline; }
</style>
