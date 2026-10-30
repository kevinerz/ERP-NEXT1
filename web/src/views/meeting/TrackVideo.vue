<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Track } from 'livekit-client'

// Menempelkan track video LiveKit ke elemen <video>
const props = defineProps<{ track: Track | null | undefined; cermin?: boolean; isi?: 'cover' | 'contain' }>()
const el = ref<HTMLVideoElement | null>(null)
let terpasang: Track | null = null

function lepas() {
  if (terpasang && el.value) terpasang.detach(el.value)
  terpasang = null
}
watch([() => props.track, el], ([t, v]) => {
  if (terpasang === t) return
  lepas()
  if (t && v) { t.attach(v); terpasang = t }
}, { immediate: true })
onBeforeUnmount(lepas)
</script>

<template>
  <video ref="el" autoplay playsinline muted :class="{ cermin }" :style="{ objectFit: isi || 'cover' }"></video>
</template>

<style scoped>
video { width: 100%; height: 100%; background: #0f172a; display: block; }
.cermin { transform: scaleX(-1); }
</style>
