<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { inisial, warnaNama } from './rapat-util'

// Ruang tunggu sebelum masuk rapat: pratinjau kamera, indikator suara mikrofon, pilih perangkat
const mic = defineModel<boolean>('mic', { default: true })
const kamera = defineModel<boolean>('kamera', { default: true })
const micId = defineModel<string>('micId', { default: '' })
const camId = defineModel<string>('camId', { default: '' })
defineProps<{ nama?: string }>()

const video = ref<HTMLVideoElement | null>(null)
const level = ref(0)
const daftarMic = ref<MediaDeviceInfo[]>([])
const daftarCam = ref<MediaDeviceInfo[]>([])
const galatCam = ref('')
const galatMic = ref('')
const memuat = ref(false)
// nomor urut permintaan: izin yang baru dijawab setelah toggle/ganti perangkat/keluar tidak boleh menyalakan stream basi
let seqCam = 0
let seqMic = 0

/** Alasan yang bisa ditindaklanjuti pengguna dari error getUserMedia */
function alasanMedia(e: any, jenis: 'Kamera' | 'Mikrofon') {
  switch (e?.name) {
    case 'NotAllowedError': case 'SecurityError':
      return `Izin ${jenis.toLowerCase()} ditolak — izinkan di pengaturan browser (ikon gembok di address bar), lalu nyalakan lagi.`
    case 'NotFoundError': case 'OverconstrainedError':
      return `${jenis} tidak ditemukan. Pastikan perangkat terpasang, atau pilih "Bawaan sistem".`
    case 'NotReadableError': case 'AbortError':
      return `${jenis} sedang dipakai aplikasi lain atau bermasalah. Tutup aplikasi lain (Zoom/Meet/kamera) lalu coba lagi.`
    default:
      return `${jenis} tidak bisa dipakai${e?.message ? ` (${e.message})` : ''}.`
  }
}
const TANPA_MEDIA = 'Browser ini tidak mengizinkan akses kamera/mikrofon (halaman harus dibuka lewat HTTPS dengan browser terbaru).'
let streamCam: MediaStream | null = null
let streamMic: MediaStream | null = null
let ctx: AudioContext | null = null
let raf = 0

async function muatPerangkat() {
  try {
    const d = await navigator.mediaDevices.enumerateDevices()
    daftarMic.value = d.filter((x) => x.kind === 'audioinput' && x.deviceId)
    daftarCam.value = d.filter((x) => x.kind === 'videoinput' && x.deviceId)
  } catch { /* tidak didukung */ }
}

function hentikanCam() {
  streamCam?.getTracks().forEach((t) => t.stop())
  streamCam = null
  if (video.value) video.value.srcObject = null
}
function hentikanMic() {
  cancelAnimationFrame(raf)
  streamMic?.getTracks().forEach((t) => t.stop())
  streamMic = null
  ctx?.close().catch(() => {})
  ctx = null
  level.value = 0
}

async function nyalakanCam() {
  const seq = ++seqCam
  hentikanCam()
  if (!kamera.value) { memuat.value = false; return }
  if (!navigator.mediaDevices?.getUserMedia) { galatCam.value = TANPA_MEDIA; kamera.value = false; return }
  memuat.value = true
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: camId.value ? { deviceId: { exact: camId.value } } : { width: 960, height: 540 } })
    if (seq !== seqCam) { s.getTracks().forEach((t) => t.stop()); return }
    streamCam = s
    if (video.value) { video.value.srcObject = streamCam; video.value.play().catch(() => {}) }
    galatCam.value = ''
    await muatPerangkat()
  } catch (e: any) {
    if (seq !== seqCam) return
    galatCam.value = alasanMedia(e, 'Kamera')
    kamera.value = false
  } finally {
    if (seq === seqCam) memuat.value = false
  }
}

async function nyalakanMic() {
  const seq = ++seqMic
  hentikanMic()
  if (!mic.value) return
  if (!navigator.mediaDevices?.getUserMedia) { galatMic.value = TANPA_MEDIA; mic.value = false; return }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: micId.value ? { deviceId: { exact: micId.value } } : true })
    if (seq !== seqMic) { s.getTracks().forEach((t) => t.stop()); return }
    streamMic = s
    galatMic.value = ''
    const AC = window.AudioContext || (window as any).webkitAudioContext
    ctx = new AC()
    const an = ctx.createAnalyser()
    an.fftSize = 512
    ctx.createMediaStreamSource(streamMic).connect(an)
    const buf = new Uint8Array(an.frequencyBinCount)
    const loop = () => {
      an.getByteTimeDomainData(buf)
      let jumlah = 0
      for (const v of buf) jumlah += ((v - 128) / 128) ** 2
      level.value = Math.min(1, Math.sqrt(jumlah / buf.length) * 4)
      raf = requestAnimationFrame(loop)
    }
    loop()
    await muatPerangkat()
  } catch (e: any) {
    if (seq !== seqMic) return
    galatMic.value = alasanMedia(e, 'Mikrofon')
    mic.value = false
  }
}

watch([kamera, camId], nyalakanCam)
watch([mic, micId], nyalakanMic)
onMounted(() => { muatPerangkat(); nyalakanCam(); nyalakanMic() })
onBeforeUnmount(lepas)

/** Lepas kamera & mikrofon (dipanggil sebelum masuk rapat supaya perangkat tidak dipakai dobel) */
function lepas() { seqCam++; seqMic++; memuat.value = false; hentikanCam(); hentikanMic() }
defineExpose({ lepas })

const label = (d: MediaDeviceInfo, i: number, jenis: string) => d.label || `${jenis} ${i + 1}`
</script>

<template>
  <div class="pp">
    <div class="pp-layar">
      <video v-show="kamera && !galatCam" ref="video" autoplay playsinline muted></video>
      <div v-if="!kamera || galatCam" class="pp-avatar" :style="{ background: warnaNama(nama || 'A') }">{{ inisial(nama || 'Anda') }}</div>
      <span v-if="memuat" class="pp-memuat">Menyalakan kamera…</span>
      <div class="pp-level" :class="{ mati: !mic }" title="Indikator suara mikrofon">
        <i v-for="n in 12" :key="n" :class="{ on: mic && level * 12 >= n }"></i>
      </div>
      <div class="pp-tombol">
        <button type="button" :class="{ mati: !mic }" :title="mic ? 'Matikan mikrofon' : 'Nyalakan mikrofon'" @click="mic = !mic; galatMic = ''">{{ mic ? '🎙️' : '🔇' }}</button>
        <button type="button" :class="{ mati: !kamera }" :title="kamera ? 'Matikan kamera' : 'Nyalakan kamera'" @click="kamera = !kamera; galatCam = ''">{{ kamera ? '📷' : '🚫' }}</button>
      </div>
    </div>
    <p v-if="galatCam" class="pp-galat" role="alert">{{ galatCam }}</p>
    <p v-if="galatMic" class="pp-galat" role="alert">{{ galatMic }}</p>
    <div class="pp-pilih">
      <label>
        <span>🎙️ Mikrofon</span>
        <select v-model="micId" :disabled="!daftarMic.length">
          <option value="">Bawaan sistem</option>
          <option v-for="(d, i) in daftarMic" :key="d.deviceId" :value="d.deviceId">{{ label(d, i, 'Mikrofon') }}</option>
        </select>
      </label>
      <label>
        <span>📷 Kamera</span>
        <select v-model="camId" :disabled="!daftarCam.length">
          <option value="">Bawaan sistem</option>
          <option v-for="(d, i) in daftarCam" :key="d.deviceId" :value="d.deviceId">{{ label(d, i, 'Kamera') }}</option>
        </select>
      </label>
    </div>
  </div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: 10px; }
.pp-layar { position: relative; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; background: radial-gradient(circle at 30% 20%, #1e293b, #0b1220); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.pp-layar video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); display: block; }
.pp-avatar { position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 34px; font-weight: 800; box-shadow: 0 10px 30px rgba(0, 0, 0, .35); }
.pp-memuat { position: absolute; left: 50%; top: 50%; translate: -50% -50%; color: #cbd5e1; font-size: 13px; }
.pp-level { position: absolute; left: 12px; bottom: 14px; display: flex; gap: 3px; align-items: flex-end; height: 22px; padding: 4px 7px; border-radius: 8px; background: rgba(0, 0, 0, .45); }
.pp-level i { width: 4px; height: 6px; border-radius: 2px; background: rgba(255, 255, 255, .25); transition: background .08s, height .08s; }
.pp-level i:nth-child(n+4) { height: 9px } .pp-level i:nth-child(n+7) { height: 12px } .pp-level i:nth-child(n+10) { height: 14px }
.pp-level i.on { background: #4ade80; }
.pp-level i.on:nth-child(n+10) { background: #fbbf24; }
.pp-level.mati { opacity: .4; }
.pp-tombol { position: absolute; bottom: 12px; left: 50%; translate: -50% 0; display: flex; gap: 10px; }
.pp-tombol button { width: 48px; height: 48px; border-radius: 50%; border: 0; font-size: 20px; cursor: pointer; background: rgba(255, 255, 255, .92); box-shadow: 0 6px 16px rgba(0, 0, 0, .3); transition: transform .15s; }
.pp-tombol button:hover { transform: scale(1.08); }
.pp-tombol button.mati { background: #dc2626; }
.pp-galat { margin: 0; font-size: 12.5px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 8px 10px; border-radius: 10px; }
.pp-pilih { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pp-pilih label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; font-weight: 700; color: #64748b; min-width: 0; }
.pp-pilih select { padding: 7px 8px; border-radius: 9px; border: 1px solid #cbd5e1; font-size: 12.5px; background: #fff; color: #0f172a; min-width: 0; }
@media (max-width: 520px) { .pp-pilih { grid-template-columns: 1fr; } }
</style>
