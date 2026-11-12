<script setup lang="ts">
import { kemajuan, luring } from '@/composables/kemajuan'
</script>

<template>
  <Teleport to="body">
    <div class="bk" :class="{ tampil: kemajuan > 0, tuntas: kemajuan >= 100 }" aria-hidden="true">
      <div class="bk-isi" :style="{ transform: `scaleX(${kemajuan / 100})` }"></div>
    </div>
    <Transition name="lr">
      <div v-if="luring" class="lr" role="status" aria-live="assertive">
        <span class="lr-titik"></span>
        Koneksi terputus — perubahan belum tentu tersimpan. Menyambung kembali otomatis…
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bk { position: fixed; inset: 0 0 auto 0; height: 3px; z-index: 12000; pointer-events: none; opacity: 0; transition: opacity .25s ease .1s; }
.bk.tampil { opacity: 1; transition: none; }
.bk.tuntas { opacity: 0; transition: opacity .25s ease .05s; }
.bk-isi {
  height: 100%; width: 100%; transform-origin: left center; transition: transform .22s ease-out;
  background: linear-gradient(90deg, #2563eb, #6366f1 55%, #22d3ee);
  box-shadow: 0 0 10px rgba(79, 70, 229, .55);
}
.lr {
  position: fixed; left: 50%; top: 12px; transform: translateX(-50%); z-index: 11990;
  display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 24px);
  padding: 9px 16px; border-radius: 999px; background: #1e293b; color: #fff;
  font-size: 13px; font-weight: 500; box-shadow: 0 10px 30px rgba(15, 23, 42, .35);
}
.lr-titik { width: 8px; height: 8px; border-radius: 50%; background: #f87171; flex-shrink: 0; animation: lr-denyut 1.2s ease-in-out infinite; }
@keyframes lr-denyut { 50% { opacity: .35; transform: scale(.8); } }
.lr-enter-active, .lr-leave-active { transition: opacity .2s, transform .2s; }
.lr-enter-from, .lr-leave-to { opacity: 0; transform: translate(-50%, -10px); }
@media (prefers-reduced-motion: reduce) { .bk-isi { transition: none; } .lr-titik { animation: none; } }
</style>
