<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { inisial, warnaNama } from './rapat-util'

// Pilih banyak karyawan (aktif) — dikelompokkan per departemen, bisa dicari
interface Karyawan { id_karyawan: number; nama_lengkap: string; jabatan: string; departemen: string }

const props = defineProps<{ modelValue: number[]; kecuali?: number[] }>()
const emit = defineEmits<{ 'update:modelValue': [number[]] }>()
const auth = useAuthStore()

const semua = ref<Karyawan[]>([])
const cari = ref('')
onMounted(async () => {
  const { data } = await api.get('/meeting/karyawan')
  semua.value = data.data
})
const sembunyi = computed(() => new Set([...(props.kecuali || []), auth.user?.id_karyawan ?? -1]))
const terlihat = computed(() => {
  const q = cari.value.trim().toLowerCase()
  return semua.value.filter((k) => !sembunyi.value.has(k.id_karyawan) && (!q || `${k.nama_lengkap} ${k.jabatan} ${k.departemen}`.toLowerCase().includes(q)))
})
const perDept = computed(() => {
  const m = new Map<string, Karyawan[]>()
  for (const k of terlihat.value) {
    const d = k.departemen || 'Lainnya'
    if (!m.has(d)) m.set(d, [])
    m.get(d)!.push(k)
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})
const dipilih = computed(() => new Set(props.modelValue))
const terpilih = computed(() => semua.value.filter((k) => dipilih.value.has(k.id_karyawan)))
function toggle(id: number) {
  const s = new Set(props.modelValue)
  if (s.has(id)) s.delete(id); else s.add(id)
  emit('update:modelValue', [...s])
}
function pilihDept(list: Karyawan[]) {
  const s = new Set(props.modelValue)
  const semuaTerpilih = list.every((k) => s.has(k.id_karyawan))
  for (const k of list) { if (semuaTerpilih) s.delete(k.id_karyawan); else s.add(k.id_karyawan) }
  emit('update:modelValue', [...s])
}
</script>

<template>
  <div class="kp">
    <div v-if="terpilih.length" class="kp-chip">
      <button v-for="k in terpilih" :key="k.id_karyawan" type="button" :title="`Hapus ${k.nama_lengkap}`" @click="toggle(k.id_karyawan)">
        <i :style="{ background: warnaNama(k.nama_lengkap) }">{{ inisial(k.nama_lengkap) }}</i>{{ k.nama_lengkap.split(' ')[0] }} <span>×</span>
      </button>
      <button type="button" class="kp-hapus" @click="emit('update:modelValue', [])">Kosongkan</button>
    </div>
    <input v-model="cari" class="form-input" placeholder="Cari nama, jabatan, departemen…" />
    <div class="kp-list">
      <p v-if="!semua.length" class="muted">Memuat…</p>
      <div v-for="[dept, list] in perDept" :key="dept" class="kp-dept">
        <div class="kp-dept-judul">
          <b>{{ dept }}</b>
          <button type="button" class="btn btn-ghost btn-sm" @click="pilihDept(list)">{{ list.every((k) => dipilih.has(k.id_karyawan)) ? 'Batal semua' : 'Pilih semua' }}</button>
        </div>
        <label v-for="k in list" :key="k.id_karyawan" class="kp-item">
          <input type="checkbox" :checked="dipilih.has(k.id_karyawan)" @change="toggle(k.id_karyawan)" />
          <span>{{ k.nama_lengkap }}</span>
          <small class="muted">{{ k.jabatan }}</small>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kp { display: flex; flex-direction: column; gap: 8px; }
.kp-list { max-height: 260px; overflow: auto; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; padding: 6px 10px; }
.kp-dept { padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
.kp-dept:last-child { border-bottom: none; }
.kp-dept-judul { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: #334155; }
.kp-item { display: flex; gap: 8px; align-items: center; padding: 3px 0; font-size: 13.5px; cursor: pointer; }
.kp-item small { margin-left: auto; }
.muted { color: var(--text-3, #64748b); }
.kp-chip { display: flex; flex-wrap: wrap; gap: 5px; }
.kp-chip button { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 99px; padding: 2px 8px 2px 2px; font-size: 12px; font-weight: 600; cursor: pointer; color: #334155; }
.kp-chip button:hover { border-color: #f87171; background: #fef2f2; }
.kp-chip i { width: 20px; height: 20px; border-radius: 50%; color: #fff; font-style: normal; font-size: 9.5px; font-weight: 800; display: grid; place-items: center; }
.kp-chip span { color: #94a3b8; }
.kp-chip .kp-hapus { border-style: dashed; padding: 2px 9px; color: #64748b; }
</style>
