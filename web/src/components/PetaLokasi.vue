<script setup lang="ts">
// Peta kecil satu titik lokasi (OpenStreetMap + Leaflet).
// bisaUbah=true → klik peta / seret pin untuk mengatur koordinat (emit update:koordinat "lat, lng").
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = withDefaults(defineProps<{ koordinat?: string | null; bisaUbah?: boolean; tinggi?: number; zoom?: number }>(), {
  koordinat: null, bisaUbah: false, tinggi: 220, zoom: 16,
})
const emit = defineEmits<{ (e: 'update:koordinat', v: string): void }>()

const wadah = ref<HTMLElement | null>(null)
let peta: L.Map | null = null
let pin: L.Marker | null = null
const IKON = L.divIcon({ className: 'pl-pin', html: '<span>📍</span>', iconSize: [34, 34], iconAnchor: [17, 32] })

function urai(k?: string | null): [number, number] | null {
  if (!k) return null
  const [a, b] = k.split(',').map((x) => parseFloat(x.trim()))
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a!) <= 90 && Math.abs(b!) <= 180 ? [a!, b!] : null
}
const teks = (ll: L.LatLng) => `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`

function pasangPin(ll: [number, number]) {
  if (!peta) return
  if (pin) pin.setLatLng(ll)
  else {
    pin = L.marker(ll, { icon: IKON, draggable: props.bisaUbah }).addTo(peta)
    pin.on('dragend', () => pin && emit('update:koordinat', teks(pin.getLatLng())))
  }
}

onMounted(() => {
  if (!wadah.value) return
  const ll = urai(props.koordinat)
  peta = L.map(wadah.value, { zoomControl: true, scrollWheelZoom: false, attributionControl: false }).setView(ll ?? [-2.5, 117], ll ? props.zoom : 4)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(peta)
  if (ll) pasangPin(ll)
  if (props.bisaUbah) peta.on('click', (e: L.LeafletMouseEvent) => { pasangPin([e.latlng.lat, e.latlng.lng]); emit('update:koordinat', teks(e.latlng)) })
  // peta di dalam modal/tab: ukur ulang setelah tampil
  setTimeout(() => peta?.invalidateSize(), 200)
})
watch(() => props.koordinat, (k) => {
  const ll = urai(k)
  if (!ll || !peta) return
  pasangPin(ll)
  const cur = pin?.getLatLng()
  if (!cur || peta.distance(cur, ll) > 1 || peta.getZoom() < 10) peta.setView(ll, Math.max(peta.getZoom(), props.zoom))
})
onBeforeUnmount(() => { peta?.remove(); peta = null; pin = null })
</script>

<template>
  <div class="pl-peta-bungkus" :style="{ height: `${tinggi}px` }">
    <div ref="wadah" class="pl-peta" />
    <div v-if="!urai(koordinat)" class="pl-tanpa">{{ bisaUbah ? '👆 Klik peta untuk menandai lokasi' : 'Koordinat belum diisi' }}</div>
  </div>
</template>

<style scoped>
.pl-peta-bungkus { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; z-index: 0; }
.pl-peta { position: absolute; inset: 0; }
.pl-tanpa { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 500; padding: 5px 12px; border-radius: 99px; background: rgba(15, 23, 42, .78); color: #fff; font-size: 12px; font-weight: 600; pointer-events: none; white-space: nowrap; }
:deep(.pl-pin) { background: none; border: 0; }
:deep(.pl-pin span) { display: block; font-size: 30px; line-height: 1; filter: drop-shadow(0 3px 3px rgba(0, 0, 0, .35)); }
</style>
