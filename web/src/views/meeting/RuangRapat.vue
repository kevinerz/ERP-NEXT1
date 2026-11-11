<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { ConnectionQuality, DisconnectReason, getBrowser, Room, RoomEvent, Track, VideoPresets, type Participant, type RemoteTrack } from 'livekit-client'
import { confirmDialog, alertError } from '@/composables/useDialog'
import TrackVideo from './TrackVideo.vue'
import { inisial, warnaNama } from './rapat-util'

// Ruang rapat LiveKit — dipakai staf (MeetingRoomView) dan tamu (TamuRapatView)
const props = defineProps<{
  url: string; token: string; judul: string; moderator: boolean
  mic: boolean; kamera: boolean
  micId?: string; camId?: string
  /** Waktu rapat dimulai (untuk penghitung waktu) */
  mulaiAt?: string | null
  /** Link halaman rapat untuk dibagikan ke rekan (staf) */
  linkUndangan?: string
  /** Aksi moderator (bisukan / keluarkan / akhiri) — lewat backend ERP */
  kelola?: (aksi: 'keluarkan' | 'bisukan' | 'akhiri', identity?: string, trackSid?: string) => Promise<void>
}>()
const emit = defineEmits<{ selesai: [pesan: string]; tersambung: [] }>()

const room = shallowRef<Room | null>(null)
const versi = ref(0) // dinaikkan setiap ada event supaya tampilan dihitung ulang
const segarkan = () => { versi.value++ }
const audioBox = ref<HTMLDivElement | null>(null)
const perluKlikAudio = ref(false)
const status = ref('Menyambungkan…')
const bisaShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices

// Safari (macOS & semua browser di iOS) memakai encoder H.264 hardware → lebih stabil & hemat baterai daripada VP8 software
const browser = getBrowser()
const safari = browser?.name === 'Safari' || browser?.os === 'iOS'

const SAMBUNG = { maxRetries: 3, peerConnectionTimeout: 20_000, websocketTimeout: 20_000 }
const MAKS_ULANG = 6 // percobaan masuk ulang otomatis setelah benar-benar terputus

// Status perangkat yang diinginkan pengguna — dipulihkan setelah sambung ulang / kembali dari latar belakang
let ingin = { mic: props.mic, kamera: props.kamera }
let selesaiDipanggil = false
let ulangKe = 0
let ulangTimer: ReturnType<typeof setTimeout> | undefined
let wakeLock: { release: () => Promise<void> } | null = null
let rBasis: Room | null = null // instance Room dipakai ulang saat masuk lagi (event tetap terpasang)

onMounted(async () => {
  const r = markRaw(new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    videoCaptureDefaults: { resolution: VideoPresets.h540.resolution, deviceId: props.camId || undefined },
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, deviceId: props.micId || undefined },
    publishDefaults: {
      simulcast: true,
      videoCodec: safari ? 'h264' : 'vp8',
      red: true, // audio redundan → tahan paket hilang
      dtx: true,
      stopMicTrackOnMute: false,
    },
  }))
  rBasis = r
  pasangEvent(r)
  r.prepareConnection(props.url, props.token).catch(() => {})
  try {
    await r.connect(props.url, props.token, SAMBUNG)
  } catch (e) {
    alertError(e, 'Gagal masuk rapat')
    akhiri('')
    return
  }
  room.value = r
  status.value = ''
  emit('tersambung')
  await nextTick()
  // Track audio peserta yang sudah ada sebelum kita masuk
  pasangAudioAda(r)
  await terapkanPerangkat(r)
  perluKlikAudio.value = !r.canPlaybackAudio
  segarkan()
  document.addEventListener('visibilitychange', saatTerlihat)
  window.addEventListener('online', saatOnline)
  document.addEventListener('pointerdown', gestur, true)
  document.addEventListener('touchend', gestur, true)
  kunciLayar()
})
onBeforeUnmount(() => {
  selesaiDipanggil = true
  clearTimeout(ulangTimer)
  document.removeEventListener('visibilitychange', saatTerlihat)
  window.removeEventListener('online', saatOnline)
  document.removeEventListener('pointerdown', gestur, true)
  document.removeEventListener('touchend', gestur, true)
  wakeLock?.release().catch(() => {})
  room.value?.disconnect()
})

function akhiri(pesan: string) {
  if (selesaiDipanggil) return
  selesaiDipanggil = true
  emit('selesai', pesan)
}

function pasangAudioAda(r: Room) {
  r.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => { if (pub.track && pub.kind === Track.Kind.Audio) pasangAudio(pub.track as RemoteTrack) }))
}

async function terapkanPerangkat(r: Room) {
  // Gagal (izin ditolak dll) → anggap dimatikan supaya Safari tidak terus meminta izin saat pemulihan
  try { await r.localParticipant.setMicrophoneEnabled(ingin.mic) } catch (e: any) { ingin.mic = false; status.value = `Mikrofon tidak bisa dipakai: ${e?.message || e}` }
  try { await r.localParticipant.setCameraEnabled(ingin.kamera) } catch (e: any) { ingin.kamera = false; status.value = `Kamera tidak bisa dipakai: ${e?.message || e}` }
}

// ── Ketahanan: Safari/iOS ────────────────────────────────────────────────────
// Safari hanya mengizinkan audio diputar setelah ada sentuhan/klik → coba aktifkan pada interaksi apa pun
function gestur() {
  const r = room.value
  if (r && !r.canPlaybackAudio) r.startAudio().then(() => { perluKlikAudio.value = !r.canPlaybackAudio }).catch(() => {})
  putarUlangMedia()
}

function putarUlangMedia() {
  document.querySelectorAll<HTMLMediaElement>('.rr video, .rr audio').forEach((el) => { if (el.paused) el.play().catch(() => {}) })
}

// Layar HP tidak mati selama rapat (Safari 16.4+, Chrome)
async function kunciLayar() {
  try {
    const wl = (navigator as any).wakeLock
    if (wl && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await wl.request('screen')
      ;(wakeLock as any)?.addEventListener?.('release', () => { wakeLock = null })
    }
  } catch { /* tidak didukung / ditolak */ }
}

// Kembali dari latar belakang (pindah aplikasi, kunci layar, telepon masuk di iPhone):
// iOS bisa menghentikan kamera/mikrofon & menjeda video → pulihkan
async function saatTerlihat() {
  if (document.visibilityState !== 'visible') return
  kunciLayar()
  const r = room.value
  if (!r) return
  putarUlangMedia()
  if (!r.canPlaybackAudio) r.startAudio().catch(() => { perluKlikAudio.value = true })
  await pulihkanTrackLokal(r)
  segarkan()
}

async function pulihkanTrackLokal(r: Room) {
  const lp = r.localParticipant
  for (const [sumber, mau] of [[Track.Source.Microphone, ingin.mic], [Track.Source.Camera, ingin.kamera]] as const) {
    if (!mau) continue
    const pub = lp.getTrackPublication(sumber)
    const mst = pub?.track?.mediaStreamTrack
    if (!pub?.track) {
      // Track hilang (mis. dicabut sistem) → nyalakan lagi
      await (sumber === Track.Source.Camera ? lp.setCameraEnabled(true) : lp.setMicrophoneEnabled(true)).catch(() => {})
    } else if (!mst || mst.readyState === 'ended') {
      try { await (pub.track as any).restartTrack() } catch {
        await (sumber === Track.Source.Camera ? lp.setCameraEnabled(false) : lp.setMicrophoneEnabled(false)).catch(() => {})
        await (sumber === Track.Source.Camera ? lp.setCameraEnabled(true) : lp.setMicrophoneEnabled(true)).catch(() => {})
      }
    }
  }
}

function saatOnline() {
  // Jaringan kembali saat sedang menunggu masuk ulang → langsung coba, jangan tunggu jeda
  if (ulangTimer && !room.value) { clearTimeout(ulangTimer); masukUlang() }
}

// Terputus total (LiveKit sudah menyerah menyambung ulang) → masuk lagi otomatis dengan token yang sama
function jadwalkanMasukUlang() {
  if (selesaiDipanggil) return
  if (ulangKe >= MAKS_ULANG) { akhiri('Terputus dari rapat. Periksa koneksi internet lalu masuk lagi.'); return }
  ulangKe++
  const jeda = Math.min(2000 * 2 ** (ulangKe - 1), 15_000)
  status.value = `Koneksi terputus — mencoba masuk lagi (${ulangKe}/${MAKS_ULANG})…`
  clearTimeout(ulangTimer)
  ulangTimer = setTimeout(masukUlang, navigator.onLine === false ? 30_000 : jeda)
}

async function masukUlang() {
  ulangTimer = undefined
  if (selesaiDipanggil || !rBasis) return
  try {
    await rBasis.connect(props.url, props.token, SAMBUNG)
  } catch {
    jadwalkanMasukUlang()
    return
  }
  ulangKe = 0
  room.value = rBasis
  status.value = ''
  await nextTick()
  pasangAudioAda(rBasis)
  await terapkanPerangkat(rBasis)
  perluKlikAudio.value = !rBasis.canPlaybackAudio
  segarkan()
}

function pasangAudio(track: RemoteTrack) {
  if (!audioBox.value) return
  // Jangan pasang dua kali (TrackSubscribed + pemindaian awal) → suara dobel/menggema
  if (track.attachedElements.some((el) => el.isConnected)) return
  const el = track.attach()
  el.setAttribute('playsinline', '')
  audioBox.value.appendChild(el)
}

function pasangEvent(r: Room) {
  r.on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === Track.Kind.Audio) pasangAudio(track); segarkan() })
    .on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); segarkan() })
    .on(RoomEvent.ParticipantConnected, segarkan)
    .on(RoomEvent.ParticipantDisconnected, (p) => { tangan.value.delete(p.identity); if (dipin.value?.startsWith(p.identity)) dipin.value = ''; segarkan() })
    .on(RoomEvent.TrackMuted, segarkan)
    .on(RoomEvent.TrackUnmuted, segarkan)
    .on(RoomEvent.LocalTrackPublished, segarkan)
    .on(RoomEvent.LocalTrackUnpublished, segarkan)
    .on(RoomEvent.ActiveSpeakersChanged, (ps) => {
      const lain = ps.find((p) => p !== r.localParticipant)
      if (lain) pembicaraAktif.value = `${lain.identity}-cam`
      segarkan()
    })
    .on(RoomEvent.ConnectionQualityChanged, segarkan)
    .on(RoomEvent.AudioPlaybackStatusChanged, () => { perluKlikAudio.value = !r.canPlaybackAudio })
    .on(RoomEvent.SignalReconnecting, () => { status.value = 'Koneksi tidak stabil, menyambung ulang…' })
    .on(RoomEvent.Reconnecting, () => { status.value = 'Koneksi terputus, menyambung ulang…' })
    .on(RoomEvent.Reconnected, async () => { status.value = ''; putarUlangMedia(); await pulihkanTrackLokal(r); segarkan() })
    .on(RoomEvent.MediaDevicesError, (e: any) => { status.value = `Perangkat bermasalah: ${e?.message || e}` })
    // AirPods/headset dicabut → kembali ke perangkat bawaan
    .on(RoomEvent.MediaDevicesChanged, () => { pulihkanTrackLokal(r).then(segarkan) })
    .on(RoomEvent.DataReceived, (payload, p) => {
      try {
        const m = JSON.parse(new TextDecoder().decode(payload))
        if (m?.type === 'chat' && typeof m.text === 'string') tambahChat(p?.name || p?.identity || '?', m.text, false)
        else if (m?.type === 'tangan' && p) aturTangan(p.identity, p.name || p.identity, !!m.naik)
        else if (m?.type === 'reaksi' && typeof m.emoji === 'string' && REAKSI.includes(m.emoji)) tampilReaksi(m.emoji, p?.name || '')
      } catch { /* abaikan */ }
    })
    .on(RoomEvent.Disconnected, (alasan?: DisconnectReason) => {
      room.value = null
      if (audioBox.value) audioBox.value.innerHTML = ''
      if (alasan === DisconnectReason.PARTICIPANT_REMOVED) return akhiri('Anda dikeluarkan dari rapat oleh moderator.')
      if (alasan === DisconnectReason.ROOM_DELETED || alasan === DisconnectReason.ROOM_CLOSED) return akhiri('Rapat telah diakhiri moderator.')
      if (alasan === DisconnectReason.DUPLICATE_IDENTITY) return akhiri('Anda masuk rapat ini dari perangkat/tab lain.')
      if (alasan === DisconnectReason.CLIENT_INITIATED) return akhiri('')
      // Jaringan putus, server restart, sinyal hilang, dll → masuk lagi otomatis
      jadwalkanMasukUlang()
    })
}

async function keluar() {
  if (!room.value) { clearTimeout(ulangTimer); akhiri(''); return } // sedang menunggu masuk ulang
  await room.value.disconnect()
}
const sinyalLemah = computed(() => { void versi.value; return room.value?.localParticipant.connectionQuality === ConnectionQuality.Poor })

// ── Kontrol ──────────────────────────────────────────────────────────────────
const mic = computed(() => { void versi.value; return room.value?.localParticipant.isMicrophoneEnabled ?? false })
const kamera = computed(() => { void versi.value; return room.value?.localParticipant.isCameraEnabled ?? false })
const share = computed(() => { void versi.value; return room.value?.localParticipant.isScreenShareEnabled ?? false })
async function toggle(jenis: 'mic' | 'kamera' | 'share') {
  const lp = room.value?.localParticipant
  if (!lp) return
  try {
    if (jenis === 'mic') { ingin.mic = !lp.isMicrophoneEnabled; await lp.setMicrophoneEnabled(ingin.mic) }
    else if (jenis === 'kamera') { ingin.kamera = !lp.isCameraEnabled; await lp.setCameraEnabled(ingin.kamera) }
    else await lp.setScreenShareEnabled(!lp.isScreenShareEnabled, { audio: false })
  } catch (e: any) {
    if (e?.name !== 'NotAllowedError' || jenis !== 'share') alertError(e, 'Perangkat tidak bisa dipakai')
  }
  segarkan()
}
async function nyalakanAudio() {
  await room.value?.startAudio()
  perluKlikAudio.value = !(room.value?.canPlaybackAudio ?? true)
}

// ── Tampilan peserta ─────────────────────────────────────────────────────────
interface Ubin { kunci: string; p: Participant; track: Track | undefined; layar: boolean; saya: boolean; nama: string; micMati: boolean; bicara: boolean }
const semuaPeserta = computed<Participant[]>(() => {
  void versi.value
  const r = room.value
  if (!r) return []
  return [r.localParticipant, ...r.remoteParticipants.values()]
})
const ubin = computed<Ubin[]>(() => {
  const out: Ubin[] = []
  for (const p of semuaPeserta.value) {
    const saya = p === room.value?.localParticipant
    const cam = p.getTrackPublication(Track.Source.Camera)
    const scr = p.getTrackPublication(Track.Source.ScreenShare)
    const micPub = p.getTrackPublication(Track.Source.Microphone)
    const dasar = { p, saya, nama: (p.name || p.identity) + (saya ? ' (Anda)' : ''), micMati: !micPub || micPub.isMuted, bicara: p.isSpeaking }
    if (scr?.track) out.push({ ...dasar, kunci: `${p.identity}-scr`, track: scr.track, layar: true })
    out.push({ ...dasar, kunci: `${p.identity}-cam`, track: cam?.track && !cam.isMuted ? cam.track : undefined, layar: false })
  }
  return out
})
const ubinLayar = computed(() => ubin.value.find((u) => u.layar))
const ubinKamera = computed(() => ubin.value.filter((u) => !u.layar))
const kolom = computed(() => {
  const n = ubinKamera.value.length
  return n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4
})
const tamu = (p: Participant) => / · Tamu$/.test(p.name || '')

// ── Chat (data channel, tidak disimpan) ──────────────────────────────────────
const panel = ref<'' | 'chat' | 'peserta' | 'atur'>('')
const chat = ref<{ dari: string; teks: string; saya: boolean; jam: string }[]>([])
const belumDibaca = ref(0)
const teksChat = ref('')
const chatBox = ref<HTMLDivElement | null>(null)
function tambahChat(dari: string, teks: string, saya: boolean) {
  chat.value.push({ dari, teks, saya, jam: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) })
  if (panel.value !== 'chat' && !saya) belumDibaca.value++
  nextTick(() => { if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight })
}
async function kirimChat() {
  const t = teksChat.value.trim()
  if (!t || !room.value) return
  await room.value.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: 'chat', text: t })), { reliable: true })
  tambahChat(room.value.localParticipant.name || 'Saya', t, true)
  teksChat.value = ''
}
function bukaPanel(p: 'chat' | 'peserta' | 'atur') {
  panel.value = panel.value === p ? '' : p
  if (panel.value === 'chat') belumDibaca.value = 0
  if (panel.value === 'atur') muatPerangkat()
}

// ── Angkat tangan & reaksi (data channel) ────────────────────────────────────
const REAKSI = ['👍', '👏', '😂', '❤️', '🎉', '🙏', '😮', '🤔']
const tangan = ref(new Map<string, { nama: string; sejak: number }>())
const tanganSaya = computed(() => { void versi.value; return !!room.value && tangan.value.has(room.value.localParticipant.identity) })
const daftarTangan = computed(() => [...tangan.value.entries()].sort((a, b) => a[1].sejak - b[1].sejak))
function aturTangan(identity: string, nama: string, naik: boolean) {
  const m = new Map(tangan.value)
  if (naik) { m.set(identity, { nama, sejak: Date.now() }); if (identity !== room.value?.localParticipant.identity) bunyi() }
  else m.delete(identity)
  tangan.value = m
}
async function kirimData(isi: Record<string, unknown>) {
  await room.value?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(isi)), { reliable: true }).catch(() => {})
}
async function toggleTangan() {
  const lp = room.value?.localParticipant
  if (!lp) return
  const naik = !tangan.value.has(lp.identity)
  aturTangan(lp.identity, lp.name || 'Anda', naik)
  await kirimData({ type: 'tangan', naik })
}
const pilihReaksi = ref(false)
const reaksiTerbang = ref<{ id: number; emoji: string; nama: string; kiri: number }[]>([])
let idReaksi = 0
function tampilReaksi(emoji: string, nama: string) {
  const id = ++idReaksi
  reaksiTerbang.value.push({ id, emoji, nama, kiri: 8 + Math.random() * 30 })
  setTimeout(() => { reaksiTerbang.value = reaksiTerbang.value.filter((r) => r.id !== id) }, 3200)
}
async function kirimReaksi(emoji: string) {
  pilihReaksi.value = false
  tampilReaksi(emoji, 'Anda')
  await kirimData({ type: 'reaksi', emoji })
}
function bunyi() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AC()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.06, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.35)
    setTimeout(() => ctx.close().catch(() => {}), 600)
  } catch { /* abaikan */ }
}

// ── Tata letak, pin, layar penuh, waktu ──────────────────────────────────────
const tata = ref<'grid' | 'pembicara'>('grid')
const dipin = ref('')
function pin(u: Ubin) { dipin.value = dipin.value === u.kunci ? '' : u.kunci; if (dipin.value) tata.value = 'pembicara' }
const pembicaraAktif = ref('')
const sorot = computed<Ubin | undefined>(() => {
  if (ubinLayar.value) return ubinLayar.value
  if (tata.value !== 'pembicara') return undefined
  const kam = ubinKamera.value
  return kam.find((u) => u.kunci === dipin.value) ?? kam.find((u) => u.kunci === pembicaraAktif.value) ?? kam.find((u) => !u.saya) ?? kam[0]
})
const sisaUbin = computed(() => (sorot.value ? ubinKamera.value.filter((u) => u.kunci !== sorot.value!.kunci) : ubinKamera.value))
const layarPenuh = ref(false)
async function toggleLayarPenuh() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch { /* tidak didukung (iOS) */ }
}
const saatLayarPenuh = () => { layarPenuh.value = !!document.fullscreenElement }
const kini = ref(Date.now())
const masukAt = Date.now()
const waktuRapat = computed(() => {
  const dari = props.mulaiAt ? +new Date(props.mulaiAt) : masukAt
  const s = Math.max(0, Math.floor((kini.value - dari) / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
})
const kualitas = (p: Participant) => p.connectionQuality === ConnectionQuality.Excellent ? 3 : p.connectionQuality === ConnectionQuality.Good ? 2 : p.connectionQuality === ConnectionQuality.Poor ? 1 : 0
async function salinLink() {
  if (!props.linkUndangan) return
  try { await navigator.clipboard.writeText(props.linkUndangan); tampilReaksi('🔗', 'Link disalin') } catch { /* abaikan */ }
}

// ── Pengaturan perangkat di dalam rapat ──────────────────────────────────────
const perangkat = ref<{ mic: MediaDeviceInfo[]; cam: MediaDeviceInfo[]; spk: MediaDeviceInfo[] }>({ mic: [], cam: [], spk: [] })
const aktifPerangkat = ref({ mic: '', cam: '', spk: '' })
async function muatPerangkat() {
  try {
    const [mic, cam, spk] = await Promise.all([Room.getLocalDevices('audioinput'), Room.getLocalDevices('videoinput'), Room.getLocalDevices('audiooutput').catch(() => [])])
    perangkat.value = { mic, cam, spk }
    const r = room.value
    if (r) aktifPerangkat.value = { mic: r.getActiveDevice('audioinput') ?? '', cam: r.getActiveDevice('videoinput') ?? '', spk: r.getActiveDevice('audiooutput') ?? '' }
  } catch { /* abaikan */ }
}
async function gantiPerangkat(jenis: 'audioinput' | 'videoinput' | 'audiooutput', id: string) {
  try { await room.value?.switchActiveDevice(jenis, id); await muatPerangkat() } catch (e) { alertError(e, 'Perangkat tidak bisa dipakai') }
}

// ── Pintasan keyboard ────────────────────────────────────────────────────────
function pintasan(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
  const k = e.key.toLowerCase()
  if (k === 'm') toggle('mic')
  else if (k === 'v') toggle('kamera')
  else if (k === 'h') toggleTangan()
  else if (k === 'c') bukaPanel('chat')
  else if (k === 'p') bukaPanel('peserta')
  else if (k === 'l') tata.value = tata.value === 'grid' ? 'pembicara' : 'grid'
  else if (k === 'f') toggleLayarPenuh()
  else return
  e.preventDefault()
}
let detik: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  window.addEventListener('keydown', pintasan)
  document.addEventListener('fullscreenchange', saatLayarPenuh)
  detik = setInterval(() => { kini.value = Date.now() }, 1000)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', pintasan)
  document.removeEventListener('fullscreenchange', saatLayarPenuh)
  clearInterval(detik)
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
})

// ── Moderator ────────────────────────────────────────────────────────────────
async function aksi(jenis: 'keluarkan' | 'bisukan' | 'akhiri', p?: Participant) {
  if (!props.kelola) return
  if (jenis === 'akhiri' && !(await confirmDialog({ title: 'Akhiri rapat untuk semua?', message: 'Semua peserta akan dikeluarkan dari rapat.', confirmLabel: 'Akhiri', variant: 'danger' }))) return
  if (jenis === 'keluarkan' && !(await confirmDialog({ title: `Keluarkan ${p?.name}?`, message: 'Peserta yang masih diundang / memegang link bisa masuk lagi.', confirmLabel: 'Keluarkan', variant: 'danger' }))) return
  try {
    await props.kelola(jenis, p?.identity, p?.getTrackPublication(Track.Source.Microphone)?.trackSid)
  } catch (e) {
    alertError(e, 'Gagal')
  }
}
</script>

<template>
  <div class="rr" :class="{ adaPanel: !!panel }">
    <div class="rr-atas">
      <span class="rr-rec"><i></i>{{ waktuRapat }}</span>
      <b class="rr-judul">{{ judul }}</b>
      <span class="rr-jumlah">👥 {{ semuaPeserta.length }}</span>
      <span v-if="daftarTangan.length" class="rr-tangan-hitung" @click="bukaPanel('peserta')">✋ {{ daftarTangan.length }}</span>
      <span v-if="status" class="rr-status">{{ status }}</span>
      <span v-else-if="sinyalLemah" class="rr-status">📶 Sinyal Anda lemah — video diturunkan otomatis</span>
      <button v-if="perluKlikAudio" type="button" class="rr-btn kecil kuning" @click="nyalakanAudio">🔊 Aktifkan suara</button>
      <span class="rr-spasi"></span>
      <div class="rr-segmen" title="Tata letak (L)">
        <button type="button" :class="{ on: tata === 'grid' }" @click="tata = 'grid'; dipin = ''">▦ Grid</button>
        <button type="button" :class="{ on: tata === 'pembicara' }" @click="tata = 'pembicara'">◧ Pembicara</button>
      </div>
      <button v-if="linkUndangan" type="button" class="rr-atas-btn" title="Salin link rapat" @click="salinLink">🔗</button>
      <button type="button" class="rr-atas-btn" :title="layarPenuh ? 'Keluar layar penuh (F)' : 'Layar penuh (F)'" @click="toggleLayarPenuh">{{ layarPenuh ? '🗗' : '⛶' }}</button>
    </div>

    <div class="rr-isi">
      <div class="rr-panggung" :class="{ adaSorot: !!sorot }">
        <div v-if="sorot" class="rr-layar" :class="{ bicara: !sorot.layar && sorot.bicara }">
          <TrackVideo v-if="sorot.track" :track="sorot.track" :isi="sorot.layar ? 'contain' : 'cover'" :cermin="!sorot.layar && sorot.saya" />
          <div v-else class="rr-avatar besar"><i :style="{ background: warnaNama(sorot.nama) }">{{ inisial(sorot.nama) }}</i></div>
          <span class="rr-label">{{ sorot.layar ? '🖥️ ' : sorot.micMati ? '🔇 ' : '' }}{{ tangan.has(sorot.p.identity) && !sorot.layar ? '✋ ' : '' }}{{ sorot.nama }}</span>
          <button v-if="!sorot.layar && dipin === sorot.kunci" type="button" class="rr-pin on" title="Lepas sematan" @click="dipin = ''">📌</button>
        </div>
        <div class="rr-grid" :style="sorot ? undefined : { gridTemplateColumns: `repeat(${kolom}, minmax(0, 1fr))` }">
          <div v-for="u in sisaUbin" :key="u.kunci" class="rr-ubin" :class="{ bicara: u.bicara, angkat: tangan.has(u.p.identity) }" @dblclick="pin(u)">
            <TrackVideo v-if="u.track" :track="u.track" :cermin="u.saya" />
            <div v-else class="rr-avatar"><i :style="{ background: warnaNama(u.nama) }">{{ inisial(u.nama) }}</i></div>
            <span v-if="tangan.has(u.p.identity)" class="rr-tangan">✋</span>
            <span class="rr-label">{{ u.micMati ? '🔇 ' : '' }}{{ u.nama }}</span>
            <span class="rr-sinyal" :class="'q' + kualitas(u.p)" :title="['Tidak diketahui', 'Sinyal lemah', 'Sinyal baik', 'Sinyal sangat baik'][kualitas(u.p)]"><i></i><i></i><i></i></span>
            <button type="button" class="rr-pin" :title="dipin === u.kunci ? 'Lepas sematan' : 'Sematkan (klik dua kali)'" @click="pin(u)">📌</button>
          </div>
        </div>
        <div class="rr-reaksi-lapis">
          <span v-for="r in reaksiTerbang" :key="r.id" class="rr-terbang" :style="{ left: r.kiri + '%' }">{{ r.emoji }}<small>{{ r.nama }}</small></span>
        </div>
      </div>

      <aside v-if="panel" class="rr-panel">
        <div class="rr-panel-atas">
          <b>{{ panel === 'chat' ? '💬 Chat' : panel === 'atur' ? '⚙️ Perangkat' : `👥 Peserta (${semuaPeserta.length})` }}</b>
          <button type="button" class="rr-x" @click="panel = ''">×</button>
        </div>
        <template v-if="panel === 'chat'">
          <div ref="chatBox" class="rr-chat">
            <p v-if="!chat.length" class="rr-redup">Belum ada pesan. Chat tidak disimpan setelah rapat selesai — catat hal penting di notulen.</p>
            <div v-for="(c, i) in chat" :key="i" class="rr-pesan" :class="{ saya: c.saya }">
              <small>{{ c.saya ? 'Anda' : c.dari }} · {{ c.jam }}</small>
              <span>{{ c.teks }}</span>
            </div>
          </div>
          <form class="rr-kirim" @submit.prevent="kirimChat">
            <input v-model="teksChat" maxlength="2000" placeholder="Tulis pesan…" />
            <button type="submit" class="rr-btn kecil" :disabled="!teksChat.trim()">Kirim</button>
          </form>
        </template>
        <div v-else-if="panel === 'atur'" class="rr-atur">
          <label>🎙️ Mikrofon
            <select :value="aktifPerangkat.mic" @change="gantiPerangkat('audioinput', ($event.target as HTMLSelectElement).value)">
              <option v-for="(d, i) in perangkat.mic" :key="d.deviceId" :value="d.deviceId">{{ d.label || `Mikrofon ${i + 1}` }}</option>
            </select>
          </label>
          <label>📷 Kamera
            <select :value="aktifPerangkat.cam" @change="gantiPerangkat('videoinput', ($event.target as HTMLSelectElement).value)">
              <option v-for="(d, i) in perangkat.cam" :key="d.deviceId" :value="d.deviceId">{{ d.label || `Kamera ${i + 1}` }}</option>
            </select>
          </label>
          <label v-if="perangkat.spk.length">🔈 Speaker
            <select :value="aktifPerangkat.spk" @change="gantiPerangkat('audiooutput', ($event.target as HTMLSelectElement).value)">
              <option v-for="(d, i) in perangkat.spk" :key="d.deviceId" :value="d.deviceId">{{ d.label || `Speaker ${i + 1}` }}</option>
            </select>
          </label>
          <div class="rr-pintas">
            <b>Pintasan keyboard</b>
            <span><kbd>M</kbd> mikrofon</span><span><kbd>V</kbd> kamera</span><span><kbd>H</kbd> angkat tangan</span>
            <span><kbd>C</kbd> chat</span><span><kbd>P</kbd> peserta</span><span><kbd>L</kbd> tata letak</span><span><kbd>F</kbd> layar penuh</span>
          </div>
        </div>
        <template v-else>
          <div v-if="daftarTangan.length" class="rr-antre">
            <b>✋ Antrean bicara</b>
            <div v-for="([idt, t], i) in daftarTangan" :key="idt" class="rr-antre-baris">
              <span>{{ i + 1 }}. {{ t.nama }}</span>
              <button v-if="idt === room?.localParticipant.identity" type="button" @click="toggleTangan">Turunkan</button>
            </div>
          </div>
          <ul class="rr-daftar">
            <li v-for="p in semuaPeserta" :key="p.identity">
              <i class="rr-av" :style="{ background: warnaNama(p.name || p.identity) }">{{ inisial(p.name || p.identity) }}</i>
              <span class="rr-daftar-nama">{{ tangan.has(p.identity) ? '✋ ' : '' }}{{ p.isSpeaking ? '🔊 ' : '' }}{{ p.name || p.identity }}{{ p === room?.localParticipant ? ' (Anda)' : '' }}<small v-if="tamu(p)" class="rr-tamu"> tamu</small></span>
              <span v-if="moderator && kelola && p !== room?.localParticipant" class="rr-aksi">
                <button type="button" title="Bisukan" :disabled="!p.getTrackPublication(Track.Source.Microphone) || p.getTrackPublication(Track.Source.Microphone)?.isMuted" @click="aksi('bisukan', p)">🔇</button>
                <button type="button" title="Keluarkan" @click="aksi('keluarkan', p)">⛔</button>
              </span>
            </li>
          </ul>
        </template>
      </aside>
    </div>

    <div class="rr-kontrol">
      <button type="button" class="rr-btn" :class="{ mati: !mic }" title="Mikrofon (M)" @click="toggle('mic')">{{ mic ? '🎙️' : '🔇' }}<small>{{ mic ? 'Mic' : 'Mic mati' }}</small></button>
      <button type="button" class="rr-btn" :class="{ mati: !kamera }" title="Kamera (V)" @click="toggle('kamera')">{{ kamera ? '📷' : '🚫' }}<small>{{ kamera ? 'Kamera' : 'Kamera mati' }}</small></button>
      <button v-if="bisaShare" type="button" class="rr-btn" :class="{ aktif: share }" @click="toggle('share')">🖥️<small>{{ share ? 'Stop share' : 'Share layar' }}</small></button>
      <button type="button" class="rr-btn" :class="{ kuning: tanganSaya }" title="Angkat tangan (H)" @click="toggleTangan">✋<small>{{ tanganSaya ? 'Turunkan' : 'Angkat tangan' }}</small></button>
      <div class="rr-reaksi-wadah">
        <button type="button" class="rr-btn" :class="{ aktif: pilihReaksi }" @click="pilihReaksi = !pilihReaksi">😊<small>Reaksi</small></button>
        <div v-if="pilihReaksi" class="rr-reaksi-pilih">
          <button v-for="e in REAKSI" :key="e" type="button" @click="kirimReaksi(e)">{{ e }}</button>
        </div>
      </div>
      <button type="button" class="rr-btn" :class="{ aktif: panel === 'chat' }" title="Chat (C)" @click="bukaPanel('chat')">💬<small>Chat<template v-if="belumDibaca"> ({{ belumDibaca }})</template></small><i v-if="belumDibaca" class="rr-titik"></i></button>
      <button type="button" class="rr-btn" :class="{ aktif: panel === 'peserta' }" title="Peserta (P)" @click="bukaPanel('peserta')">👥<small>Peserta</small></button>
      <button type="button" class="rr-btn" :class="{ aktif: panel === 'atur' }" title="Perangkat & pintasan" @click="bukaPanel('atur')">⚙️<small>Perangkat</small></button>
      <span class="rr-pemisah"></span>
      <button type="button" class="rr-btn merah" @click="keluar">📞<small>Keluar</small></button>
      <button v-if="moderator && kelola" type="button" class="rr-btn merah gelap" @click="aksi('akhiri')">⏹️<small>Akhiri untuk semua</small></button>
    </div>
    <div ref="audioBox" class="rr-audio"></div>
  </div>
</template>

<style scoped>
/* Ruang rapat: layar penuh di atas layout */
.rr { position: fixed; inset: 0; height: 100vh; height: 100dvh; z-index: 900; display: flex; flex-direction: column; color: #e2e8f0;
  background: radial-gradient(circle at 15% 0%, #1e1b4b 0%, transparent 45%), radial-gradient(circle at 100% 100%, #0f2a2a 0%, transparent 40%), #0b1020; }
kbd { display: inline-block; min-width: 16px; padding: 0 5px; border-radius: 5px; border: 1px solid #475569; border-bottom-width: 2px; font: 700 10.5px/16px ui-monospace, monospace; text-align: center; background: #1e293b; color: #e2e8f0; }
.rr-atas { display: flex; align-items: center; gap: 10px; padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top)); flex-wrap: wrap; }
.rr-rec { display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, .08); border-radius: 99px; padding: 4px 10px; font-size: 12.5px; font-weight: 800; font-variant-numeric: tabular-nums; }
.rr-rec i { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: rr-kedip 1.4s infinite; }
@keyframes rr-kedip { 50% { opacity: .25; } }
.rr-judul { font-size: 15px; max-width: 40vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rr-jumlah { font-size: 13px; color: #94a3b8; }
.rr-tangan-hitung { font-size: 12.5px; font-weight: 800; background: #f59e0b; color: #1c1917; border-radius: 99px; padding: 2px 9px; cursor: pointer; animation: rr-goyang 1s ease-in-out 3; }
@keyframes rr-goyang { 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }
.rr-status { font-size: 13px; color: #fbbf24; }
.rr-spasi { flex: 1; }
.rr-segmen { display: inline-flex; background: rgba(255, 255, 255, .07); border-radius: 10px; padding: 3px; gap: 2px; }
.rr-segmen button { border: 0; background: none; color: #cbd5e1; padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
.rr-segmen button.on { background: rgba(255, 255, 255, .16); color: #fff; }
.rr-atas-btn { border: 0; background: rgba(255, 255, 255, .07); color: #e2e8f0; width: 34px; height: 30px; border-radius: 9px; cursor: pointer; font-size: 15px; }
.rr-atas-btn:hover { background: rgba(255, 255, 255, .16); }
.rr-isi { flex: 1; display: flex; min-height: 0; }
.rr-panggung { position: relative; flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 6px 12px 10px; min-width: 0; min-height: 0; }
.rr-layar { position: relative; flex: 1; min-height: 0; border-radius: 16px; overflow: hidden; background: #000; border: 2px solid transparent; transition: border-color .2s; }
.rr-layar.bicara { border-color: #22c55e; }
.rr-grid { flex: 1; display: grid; gap: 8px; min-height: 0; grid-auto-rows: 1fr; }
.adaSorot .rr-grid { flex: 0 0 120px; grid-auto-flow: column; grid-auto-columns: 190px; grid-template-columns: none; overflow-x: auto; }
.adaSorot .rr-grid:empty { display: none; }
.rr-ubin { position: relative; border-radius: 14px; overflow: hidden; background: #1e293b; min-height: 0; border: 2px solid transparent; transition: border-color .2s, box-shadow .2s; }
.rr-ubin.bicara { border-color: #22c55e; box-shadow: 0 0 0 3px rgba(34, 197, 94, .25); }
.rr-ubin.angkat { border-color: #f59e0b; }
.rr-avatar { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle, #273449, #1e293b 70%); }
.rr-avatar i { width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 28px; font-weight: 800; color: #fff; box-shadow: 0 10px 30px rgba(0, 0, 0, .35); }
.rr-avatar.besar i { width: 120px; height: 120px; font-size: 44px; }
.adaSorot .rr-grid .rr-avatar i { width: 46px; height: 46px; font-size: 17px; }
.rr-label { position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 60px); padding: 3px 9px; border-radius: 8px; background: rgba(0, 0, 0, .55); backdrop-filter: blur(4px); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rr-tangan { position: absolute; left: 8px; top: 8px; font-size: 22px; animation: rr-goyang 1s ease-in-out infinite; }
.rr-sinyal { position: absolute; right: 8px; bottom: 10px; display: flex; gap: 2px; align-items: flex-end; }
.rr-sinyal i { width: 3px; border-radius: 1px; background: rgba(255, 255, 255, .25); }
.rr-sinyal i:nth-child(1) { height: 5px } .rr-sinyal i:nth-child(2) { height: 8px } .rr-sinyal i:nth-child(3) { height: 11px }
.rr-sinyal.q3 i { background: #4ade80; } .rr-sinyal.q2 i:nth-child(-n+2) { background: #a3e635; } .rr-sinyal.q1 i:nth-child(1) { background: #f87171; }
.rr-pin { position: absolute; right: 8px; top: 8px; border: 0; border-radius: 8px; background: rgba(0, 0, 0, .5); width: 30px; height: 28px; cursor: pointer; opacity: 0; transition: opacity .15s; font-size: 13px; }
.rr-ubin:hover .rr-pin, .rr-pin.on { opacity: 1; }
.rr-pin.on { background: #4f46e5; }
.rr-reaksi-lapis { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.rr-terbang { position: absolute; bottom: 10px; font-size: 40px; display: flex; flex-direction: column; align-items: center; animation: rr-terbang 3.2s ease-out forwards; }
.rr-terbang small { font-size: 11px; background: rgba(0, 0, 0, .55); border-radius: 6px; padding: 1px 6px; margin-top: 2px; white-space: nowrap; }
@keyframes rr-terbang { 0% { transform: translateY(0) scale(.6); opacity: 0; } 10% { opacity: 1; transform: translateY(-20px) scale(1.1); } 100% { transform: translateY(-60vh) scale(1); opacity: 0; } }
.rr-panel { width: 330px; display: flex; flex-direction: column; margin: 6px 12px 10px 0; border-radius: 16px; background: rgba(15, 23, 42, .92); border: 1px solid #1e293b; backdrop-filter: blur(10px); animation: rr-geser .2s; }
@keyframes rr-geser { from { opacity: 0; transform: translateX(20px); } }
.rr-panel-atas { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #1e293b; }
.rr-x { background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; }
.rr-chat { flex: 1; overflow: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
.rr-pesan { display: flex; flex-direction: column; padding: 7px 11px; border-radius: 12px 12px 12px 4px; background: #1e293b; font-size: 13.5px; align-self: flex-start; max-width: 90%; word-break: break-word; }
.rr-pesan.saya { align-self: flex-end; background: #4338ca; border-radius: 12px 12px 4px 12px; }
.rr-pesan small { color: #94a3b8; font-size: 11px; }
.rr-pesan.saya small { color: #c7d2fe; }
.rr-redup { color: #64748b; font-size: 12.5px; }
.rr-kirim { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #1e293b; }
.rr-kirim input { flex: 1; padding: 9px 11px; border-radius: 10px; border: 1px solid #334155; background: #0b1220; color: #e2e8f0; min-width: 0; }
.rr-atur { padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
.rr-atur label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #94a3b8; }
.rr-atur select { padding: 8px; border-radius: 9px; border: 1px solid #334155; background: #0b1220; color: #e2e8f0; font-size: 13px; }
.rr-pintas { display: flex; flex-wrap: wrap; gap: 8px 12px; font-size: 12px; color: #cbd5e1; padding-top: 10px; border-top: 1px solid #1e293b; }
.rr-pintas b { width: 100%; font-size: 12px; color: #94a3b8; }
.rr-antre { margin: 10px 14px 0; padding: 10px; border-radius: 12px; background: rgba(245, 158, 11, .12); border: 1px solid rgba(245, 158, 11, .35); display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.rr-antre b { color: #fbbf24; font-size: 12.5px; }
.rr-antre-baris { display: flex; justify-content: space-between; align-items: center; }
.rr-antre-baris button { border: 0; background: #f59e0b; color: #1c1917; border-radius: 7px; padding: 2px 8px; font-size: 11.5px; font-weight: 800; cursor: pointer; }
.rr-daftar { list-style: none; margin: 0; padding: 6px 14px; overflow: auto; }
.rr-daftar li { display: flex; align-items: center; gap: 9px; padding: 8px 0; border-bottom: 1px solid #1e293b; font-size: 13.5px; }
.rr-av { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 10.5px; font-weight: 800; color: #fff; flex-shrink: 0; }
.rr-daftar-nama { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rr-tamu { margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: #78350f; color: #fde68a; font-size: 10.5px; }
.rr-aksi button { background: #1e293b; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; margin-left: 4px; }
.rr-aksi button:disabled { opacity: .35; cursor: default; }
.rr-kontrol { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 10px 12px; padding-bottom: max(12px, env(safe-area-inset-bottom)); flex-wrap: wrap; }
.rr-btn { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 72px; padding: 8px 10px; border-radius: 14px; border: none; background: rgba(255, 255, 255, .08); color: #e2e8f0; font-size: 20px; cursor: pointer; transition: background .15s, transform .15s; }
.rr-btn small { font-size: 11px; }
.rr-btn:hover { background: rgba(255, 255, 255, .16); transform: translateY(-2px); }
.rr-btn.mati { background: #b91c1c; }
.rr-btn.aktif { background: #4f46e5; }
.rr-btn.kuning { background: #f59e0b; color: #1c1917; }
.rr-btn.merah { background: #dc2626; }
.rr-btn.merah.gelap { background: #7f1d1d; }
.rr-btn.kecil { flex-direction: row; min-width: 0; font-size: 13px; padding: 6px 12px; border-radius: 10px; }
.rr-titik { position: absolute; top: 6px; right: 14px; width: 9px; height: 9px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 2px #0b1020; }
.rr-pemisah { width: 1px; height: 34px; background: rgba(255, 255, 255, .12); margin: 0 4px; }
.rr-reaksi-wadah { position: relative; }
.rr-reaksi-pilih { position: absolute; bottom: calc(100% + 8px); left: 50%; translate: -50% 0; display: flex; gap: 2px; padding: 6px; border-radius: 14px; background: #1e293b; box-shadow: 0 10px 30px rgba(0, 0, 0, .45); animation: rr-geser .15s; }
.rr-reaksi-pilih button { border: 0; background: none; font-size: 24px; cursor: pointer; border-radius: 8px; padding: 3px 5px; transition: transform .12s; }
.rr-reaksi-pilih button:hover { transform: scale(1.3); background: rgba(255, 255, 255, .08); }
.rr-audio { display: none; }
@media (max-width: 900px) {
  .rr-panel { position: absolute; right: 8px; top: 56px; bottom: 86px; width: min(330px, calc(100% - 16px)); margin: 0; z-index: 5; }
  .rr-btn { min-width: 54px; font-size: 18px; padding: 7px 6px; }
  .rr-btn small { font-size: 10px; }
  .rr-segmen, .rr-pemisah { display: none; }
  .rr-judul { max-width: 50vw; }
}
@media (max-width: 520px) { .rr-btn small { display: none; } .rr-btn { min-width: 46px; } }
@media (prefers-reduced-motion: reduce) { .rr-terbang, .rr-tangan, .rr-rec i { animation: none; } }
</style>
