<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MENU_MASTER, jumlahMenu, muatRingkasan } from './master-menu'

// Bilah navigasi Master Data — pindah antar data master tanpa kembali ke menu
const route = useRoute()
const router = useRouter()
onMounted(() => { muatRingkasan() })
const aktif = (to: string) => route.path === to || route.path.startsWith(`${to}/`)
</script>

<template>
  <nav class="mn" aria-label="Master Data">
    <button type="button" class="mn-rumah" :class="{ on: route.path === '/master' }" title="Pusat Master Data" @click="router.push('/master')">🗂️ <span>Master</span></button>
    <span class="mn-garis"></span>
    <button v-for="m in MENU_MASTER" :key="m.kunci" type="button" :class="{ on: aktif(m.to) }" :style="{ '--c': m.warna }" @click="router.push(m.to)">
      <span>{{ m.ikon }}</span>{{ m.label }}<i v-if="jumlahMenu(m.kunci) != null">{{ jumlahMenu(m.kunci)!.toLocaleString('id-ID') }}</i>
    </button>
  </nav>
</template>

<style scoped>
.mn { display: flex; align-items: center; gap: 4px; overflow-x: auto; padding: 4px; margin-bottom: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; scrollbar-width: thin; }
.mn button { --c: #475569; flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 7px 12px; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer; white-space: nowrap; transition: background .12s, color .12s; }
.mn button:hover { background: #f1f5f9; color: #0f172a; }
.mn button.on { background: color-mix(in srgb, var(--c) 12%, #fff); color: var(--c); font-weight: 800; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent); }
.mn button i { font-style: normal; font-size: 11px; font-weight: 800; padding: 0 7px; border-radius: 99px; background: #f1f5f9; color: #64748b; }
.mn button.on i { background: var(--c); color: #fff; }
.mn-rumah { --c: #0f172a !important; }
.mn-garis { width: 1px; height: 22px; background: #e2e8f0; flex-shrink: 0; margin: 0 2px; }
@media (max-width: 640px) { .mn-rumah span { display: none; } }
</style>
