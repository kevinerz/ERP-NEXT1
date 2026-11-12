<script setup lang="ts">
/* Satu komponen untuk tiga keadaan daftar/halaman: memuat, gagal (dengan "Coba lagi"), dan kosong.
   <KeadaanData :memuat="loading" :galat="error" :kosong="!rows.length" @ulang="load">…isi…</KeadaanData> */
withDefaults(defineProps<{
  memuat?: boolean
  galat?: string | null
  kosong?: boolean
  teksMemuat?: string
  ikonKosong?: string
  judulKosong?: string
  ketKosong?: string
  /** jumlah baris rangka saat memuat; 0 = pakai pemutar */
  rangka?: number
}>(), { teksMemuat: 'Memuat data…', ikonKosong: '📭', judulKosong: 'Belum ada data', rangka: 0 })
defineEmits<{ ulang: [] }>()
</script>

<template>
  <div v-if="memuat && rangka" class="rangka-baris" aria-busy="true" aria-label="Memuat">
    <div v-for="i in rangka" :key="i" class="rangka" :style="{ height: '16px', width: `${92 - ((i * 17) % 38)}%` }"></div>
  </div>
  <div v-else-if="memuat" class="loading-state" aria-busy="true">{{ teksMemuat }}</div>
  <div v-else-if="galat" class="galat-state" role="alert">
    <div class="galat-ikon">!</div>
    <div class="galat-judul">Gagal memuat data</div>
    <div>{{ galat }}</div>
    <button type="button" class="btn btn-secondary btn-sm" @click="$emit('ulang')">↻ Coba lagi</button>
  </div>
  <div v-else-if="kosong" class="empty-state">
    <div class="empty-icon">{{ ikonKosong }}</div>
    <div class="empty-title">{{ judulKosong }}</div>
    <div v-if="ketKosong" class="empty-desc">{{ ketKosong }}</div>
    <slot name="aksi-kosong" />
  </div>
  <slot v-else />
</template>
