<script setup lang="ts">
// Kartu angka warna-warni: ikon bergoyang saat hover, angka berhitung naik, kartu sedikit melayang.
// `nada` hanya warna dekorasi kartu (bukan penanda data); keadaan penting ditandai lewat `status` + teks.
import AngkaNaik from './AngkaNaik.vue'

withDefaults(defineProps<{
  ikon: string
  label: string
  nilai: number
  sub?: string
  ke?: string
  nada?: 'biru' | 'oranye' | 'hijau' | 'kuning' | 'pink' | 'ungu' | 'toska' | 'merah'
  status?: 'kritis' | 'waspada' | 'baik' | null
  format?: (n: number) => string
  urutan?: number
}>(), { nada: 'biru', status: null, urutan: 0 })
</script>

<template>
  <component :is="ke ? 'RouterLink' : 'div'" :to="ke" :class="['ka', `ka-${nada}`, status && `ka-st-${status}`]" :style="{ animationDelay: `${urutan * 60}ms` }">
    <span class="ka-ikon" aria-hidden="true">{{ ikon }}</span>
    <span class="ka-teks">
      <b class="ka-nilai"><AngkaNaik :nilai="nilai" :format="format" /></b>
      <span class="ka-label">{{ label }}</span>
      <small v-if="sub" class="ka-sub">{{ sub }}</small>
    </span>
    <span v-if="status === 'kritis'" class="ka-lencana">perlu perhatian</span>
    <span v-else-if="status === 'baik'" class="ka-lencana ka-lencana-baik">aman</span>
  </component>
</template>

<style scoped>
.ka {
  --a: #2a78d6; --bg1: #eef5ff; --bg2: #ffffff;
  position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 14px 14px 13px;
  border-radius: 16px; background: linear-gradient(135deg, var(--bg1), var(--bg2) 75%);
  border: 1px solid color-mix(in srgb, var(--a) 18%, transparent); color: inherit; text-decoration: none; min-width: 0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04); transition: transform .2s cubic-bezier(.2, .9, .3, 1.3), box-shadow .2s;
  animation: ka-masuk .5s cubic-bezier(.2, .9, .3, 1.2) both; overflow: hidden;
}
.ka::after { content: ''; position: absolute; right: -18px; top: -18px; width: 64px; height: 64px; border-radius: 50%; background: var(--a); opacity: .08; transition: transform .4s; }
a.ka:hover { transform: translateY(-3px); box-shadow: 0 10px 24px color-mix(in srgb, var(--a) 22%, transparent); }
a.ka:hover::after { transform: scale(1.6); }
.ka:hover .ka-ikon { animation: ka-goyang .6s ease-in-out; }
.ka-ikon { flex-shrink: 0; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 21px; background: color-mix(in srgb, var(--a) 14%, #fff); }
.ka-teks { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.ka-nilai { font-size: 25px; font-weight: 800; line-height: 1.05; color: #0b0b0b; letter-spacing: -.02em; }
.ka-label { font-size: 12.5px; font-weight: 600; color: #3f3e3b; }
.ka-sub { font-size: 11.5px; color: #6b6a65; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ka-lencana { position: absolute; right: 10px; bottom: 9px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 99px; background: #fde8e8; color: #b42323; }
.ka-lencana-baik { background: #e3f6e3; color: #0a6e0a; }
.ka-st-kritis { border-color: #f3b4b4; }
.ka-st-kritis .ka-ikon { animation: ka-denyut 1.8s ease-in-out infinite; }

.ka-biru   { --a: #2a78d6; --bg1: #e8f1fd; }
.ka-oranye { --a: #eb6834; --bg1: #fdeee6; }
.ka-hijau  { --a: #1baf7a; --bg1: #e3f7ef; }
.ka-kuning { --a: #eda100; --bg1: #fdf3d9; }
.ka-pink   { --a: #e87ba4; --bg1: #fcebf2; }
.ka-ungu   { --a: #6250d6; --bg1: #efedfc; }
.ka-toska  { --a: #0e9fb3; --bg1: #e2f6f9; }
.ka-merah  { --a: #e34948; --bg1: #fdeaea; }

@keyframes ka-masuk { from { opacity: 0; transform: translateY(10px) scale(.97); } }
@keyframes ka-goyang { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-14deg) scale(1.1); } 60% { transform: rotate(10deg) scale(1.1); } }
@keyframes ka-denyut { 0%, 100% { box-shadow: 0 0 0 0 rgba(208, 59, 59, .35); } 50% { box-shadow: 0 0 0 7px rgba(208, 59, 59, 0); } }
@media (prefers-reduced-motion: reduce) { .ka, .ka-ikon, .ka::after { animation: none !important; transition: none; } }
</style>
