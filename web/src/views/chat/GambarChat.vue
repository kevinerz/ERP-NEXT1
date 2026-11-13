<script setup lang="ts">
/* Gambar lampiran chat. Berkas chat privat (butuh login), jadi diambil lewat API lalu dijadikan blob URL. */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import api from '@/services/api'

const props = defineProps<{ id: number; nama: string | null }>()
const emit = defineEmits<{ buka: [url: string] }>()
const url = ref('')
const galat = ref(false)

onMounted(async () => {
  try {
    const { data } = await api.get(`/chat/berkas/${props.id}`, { responseType: 'blob', senyap: true })
    url.value = URL.createObjectURL(data)
  } catch { galat.value = true }
})
onBeforeUnmount(() => { if (url.value) URL.revokeObjectURL(url.value) })
</script>

<template>
  <img v-if="url" :src="url" :alt="nama ?? 'Gambar'" class="cg-gambar" loading="lazy" @click="emit('buka', url)" />
  <div v-else-if="galat" class="cg-galat">🖼️ Gambar tidak dapat dimuat</div>
  <div v-else class="cg-muat rangka" aria-busy="true"></div>
</template>

<style scoped>
.cg-gambar { display: block; max-width: min(280px, 100%); max-height: 260px; border-radius: 10px; cursor: zoom-in; object-fit: cover; }
.cg-galat { font-size: 12px; opacity: .7; }
.cg-muat { width: 220px; height: 140px; border-radius: 10px; }
</style>
