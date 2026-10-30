<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { DisconnectReason, Room, RoomEvent, Track, type Participant, type RemoteTrack } from 'livekit-client'
import { confirmDialog, alertError } from '@/composables/useDialog'
import TrackVideo from './TrackVideo.vue'

// Ruang rapat LiveKit — dipakai staf (MeetingRoomView) dan tamu (TamuRapatView)
const props = defineProps<{
  url: string; token: string; judul: string; moderator: boolean
  mic: boolean; kamera: boolean
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

onMounted(async () => {
  const r = markRaw(new Room({ adaptiveStream: true, dynacast: true }))
  pasangEvent(r)
  try {
    await r.connect(props.url, props.token)
  } catch (e) {
    alertError(e, 'Gagal masuk rapat')
    emit('selesai', '')
    return
  }
  room.value = r
  status.value = ''
  emit('tersambung')
  await nextTick()
  // Track audio peserta yang sudah ada sebelum kita masuk
  r.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => { if (pub.track && pub.kind === Track.Kind.Audio) pasangAudio(pub.track as RemoteTrack) }))
  try { await r.localParticipant.setMicrophoneEnabled(props.mic) } catch (e: any) { status.value = `Mikrofon tidak bisa dipakai: ${e?.message || e}` }
  try { await r.localParticipant.setCameraEnabled(props.kamera) } catch (e: any) { status.value = `Kamera tidak bisa dipakai: ${e?.message || e}` }
  perluKlikAudio.value = !r.canPlaybackAudio
  segarkan()
})
onBeforeUnmount(() => { room.value?.disconnect() })

function pasangAudio(track: RemoteTrack) {
  if (!audioBox.value) return
  audioBox.value.appendChild(track.attach())
}

function pasangEvent(r: Room) {
  r.on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === Track.Kind.Audio) pasangAudio(track); segarkan() })
    .on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); segarkan() })
    .on(RoomEvent.ParticipantConnected, segarkan)
    .on(RoomEvent.ParticipantDisconnected, segarkan)
    .on(RoomEvent.TrackMuted, segarkan)
    .on(RoomEvent.TrackUnmuted, segarkan)
    .on(RoomEvent.LocalTrackPublished, segarkan)
    .on(RoomEvent.LocalTrackUnpublished, segarkan)
    .on(RoomEvent.ActiveSpeakersChanged, segarkan)
    .on(RoomEvent.ConnectionQualityChanged, segarkan)
    .on(RoomEvent.AudioPlaybackStatusChanged, () => { perluKlikAudio.value = !r.canPlaybackAudio })
    .on(RoomEvent.Reconnecting, () => { status.value = 'Koneksi terputus, menyambung ulang…' })
    .on(RoomEvent.Reconnected, () => { status.value = '' })
    .on(RoomEvent.DataReceived, (payload, p) => {
      try {
        const m = JSON.parse(new TextDecoder().decode(payload))
        if (m?.type === 'chat' && typeof m.text === 'string') tambahChat(p?.name || p?.identity || '?', m.text, false)
      } catch { /* abaikan */ }
    })
    .on(RoomEvent.Disconnected, (alasan?: DisconnectReason) => {
      room.value = null
      if (audioBox.value) audioBox.value.innerHTML = ''
      const pesan = alasan === DisconnectReason.PARTICIPANT_REMOVED ? 'Anda dikeluarkan dari rapat oleh moderator.'
        : alasan === DisconnectReason.ROOM_DELETED ? 'Rapat telah diakhiri moderator.'
          : alasan === DisconnectReason.CLIENT_INITIATED ? '' : 'Terputus dari rapat.'
      emit('selesai', pesan)
    })
}

async function keluar() { await room.value?.disconnect() }

// ── Kontrol ──────────────────────────────────────────────────────────────────
const mic = computed(() => { void versi.value; return room.value?.localParticipant.isMicrophoneEnabled ?? false })
const kamera = computed(() => { void versi.value; return room.value?.localParticipant.isCameraEnabled ?? false })
const share = computed(() => { void versi.value; return room.value?.localParticipant.isScreenShareEnabled ?? false })
async function toggle(jenis: 'mic' | 'kamera' | 'share') {
  const lp = room.value?.localParticipant
  if (!lp) return
  try {
    if (jenis === 'mic') await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled)
    else if (jenis === 'kamera') await lp.setCameraEnabled(!lp.isCameraEnabled)
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
const inisial = (n: string) => n.replace(/\(Anda\)|· Tamu/g, '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
const tamu = (p: Participant) => / · Tamu$/.test(p.name || '')

// ── Chat (data channel, tidak disimpan) ──────────────────────────────────────
const panel = ref<'' | 'chat' | 'peserta'>('')
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
function bukaPanel(p: 'chat' | 'peserta') {
  panel.value = panel.value === p ? '' : p
  if (panel.value === 'chat') belumDibaca.value = 0
}

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
  <div class="rr">
    <div class="rr-atas">
      <b class="rr-judul">{{ judul }}</b>
      <span class="rr-jumlah">👥 {{ semuaPeserta.length }}</span>
      <span v-if="status" class="rr-status">{{ status }}</span>
      <button v-if="perluKlikAudio" type="button" class="rr-btn kecil" @click="nyalakanAudio">🔊 Aktifkan suara</button>
    </div>

    <div class="rr-isi">
      <div class="rr-panggung" :class="{ adaLayar: !!ubinLayar }">
        <div v-if="ubinLayar" class="rr-layar">
          <TrackVideo :track="ubinLayar.track" isi="contain" />
          <span class="rr-label">🖥️ {{ ubinLayar.nama }}</span>
        </div>
        <div class="rr-grid" :style="ubinLayar ? undefined : { gridTemplateColumns: `repeat(${kolom}, minmax(0, 1fr))` }">
          <div v-for="u in ubinKamera" :key="u.kunci" class="rr-ubin" :class="{ bicara: u.bicara }">
            <TrackVideo v-if="u.track" :track="u.track" :cermin="u.saya" />
            <div v-else class="rr-avatar">{{ inisial(u.nama) }}</div>
            <span class="rr-label">{{ u.micMati ? '🔇 ' : '' }}{{ u.nama }}</span>
          </div>
        </div>
      </div>

      <aside v-if="panel" class="rr-panel">
        <div class="rr-panel-atas">
          <b>{{ panel === 'chat' ? 'Chat' : `Peserta (${semuaPeserta.length})` }}</b>
          <button type="button" class="rr-x" @click="panel = ''">×</button>
        </div>
        <template v-if="panel === 'chat'">
          <div ref="chatBox" class="rr-chat">
            <p v-if="!chat.length" class="rr-redup">Belum ada pesan. Chat tidak disimpan setelah rapat selesai.</p>
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
        <ul v-else class="rr-daftar">
          <li v-for="p in semuaPeserta" :key="p.identity">
            <span>{{ p.isSpeaking ? '🔊 ' : '' }}{{ p.name || p.identity }}{{ p === room?.localParticipant ? ' (Anda)' : '' }}<small v-if="tamu(p)" class="rr-tamu"> tamu</small></span>
            <span v-if="moderator && kelola && p !== room?.localParticipant" class="rr-aksi">
              <button type="button" title="Bisukan" :disabled="!p.getTrackPublication(Track.Source.Microphone) || p.getTrackPublication(Track.Source.Microphone)?.isMuted" @click="aksi('bisukan', p)">🔇</button>
              <button type="button" title="Keluarkan" @click="aksi('keluarkan', p)">⛔</button>
            </span>
          </li>
        </ul>
      </aside>
    </div>

    <div class="rr-kontrol">
      <button type="button" class="rr-btn" :class="{ mati: !mic }" @click="toggle('mic')">{{ mic ? '🎙️' : '🔇' }}<small>{{ mic ? 'Mic' : 'Mic mati' }}</small></button>
      <button type="button" class="rr-btn" :class="{ mati: !kamera }" @click="toggle('kamera')">{{ kamera ? '📷' : '🚫' }}<small>{{ kamera ? 'Kamera' : 'Kamera mati' }}</small></button>
      <button v-if="bisaShare" type="button" class="rr-btn" :class="{ aktif: share }" @click="toggle('share')">🖥️<small>{{ share ? 'Stop share' : 'Share layar' }}</small></button>
      <button type="button" class="rr-btn" :class="{ aktif: panel === 'chat' }" @click="bukaPanel('chat')">💬<small>Chat<template v-if="belumDibaca"> ({{ belumDibaca }})</template></small></button>
      <button type="button" class="rr-btn" :class="{ aktif: panel === 'peserta' }" @click="bukaPanel('peserta')">👥<small>Peserta</small></button>
      <button type="button" class="rr-btn merah" @click="keluar">📞<small>Keluar</small></button>
      <button v-if="moderator && kelola" type="button" class="rr-btn merah" @click="aksi('akhiri')">⏹️<small>Akhiri untuk semua</small></button>
    </div>
    <div ref="audioBox" class="rr-audio"></div>
  </div>
</template>

<style scoped>
/* Ruang rapat: layar penuh di atas layout */
.rr { position: fixed; inset: 0; z-index: 900; display: flex; flex-direction: column; background: #0b1220; color: #e2e8f0; }
.rr-atas { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid #1e293b; flex-wrap: wrap; }
.rr-judul { font-size: 15px; }
.rr-jumlah { font-size: 13px; color: #94a3b8; }
.rr-status { font-size: 13px; color: #fbbf24; }
.rr-isi { flex: 1; display: flex; min-height: 0; }
.rr-panggung { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 10px; min-width: 0; min-height: 0; }
.rr-layar { position: relative; flex: 1; min-height: 0; border-radius: 10px; overflow: hidden; background: #000; }
.rr-grid { flex: 1; display: grid; gap: 8px; min-height: 0; grid-auto-rows: 1fr; }
.adaLayar .rr-grid { flex: 0 0 130px; grid-auto-flow: column; grid-auto-columns: 200px; grid-template-columns: none; overflow-x: auto; }
.rr-ubin { position: relative; border-radius: 10px; overflow: hidden; background: #1e293b; min-height: 0; border: 2px solid transparent; }
.rr-ubin.bicara { border-color: #22c55e; }
.rr-avatar { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 700; color: #cbd5e1; }
.rr-label { position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px); padding: 2px 8px; border-radius: 6px; background: rgba(0, 0, 0, .55); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rr-panel { width: 320px; display: flex; flex-direction: column; border-left: 1px solid #1e293b; background: #0f172a; }
.rr-panel-atas { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #1e293b; }
.rr-x { background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; }
.rr-chat { flex: 1; overflow: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
.rr-pesan { display: flex; flex-direction: column; padding: 6px 10px; border-radius: 8px; background: #1e293b; font-size: 13.5px; align-self: flex-start; max-width: 90%; }
.rr-pesan.saya { align-self: flex-end; background: #14532d; }
.rr-pesan small { color: #94a3b8; font-size: 11px; }
.rr-redup { color: #64748b; font-size: 12.5px; }
.rr-kirim { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #1e293b; }
.rr-kirim input { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid #334155; background: #0b1220; color: #e2e8f0; }
.rr-daftar { list-style: none; margin: 0; padding: 6px 14px; overflow: auto; }
.rr-daftar li { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #1e293b; font-size: 13.5px; }
.rr-tamu { margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: #78350f; color: #fde68a; font-size: 10.5px; }
.rr-aksi button { background: #1e293b; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; margin-left: 4px; }
.rr-aksi button:disabled { opacity: .35; cursor: default; }
.rr-kontrol { display: flex; justify-content: center; gap: 10px; padding: 12px; border-top: 1px solid #1e293b; flex-wrap: wrap; }
.rr-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 74px; padding: 8px 10px; border-radius: 10px; border: none; background: #1e293b; color: #e2e8f0; font-size: 20px; cursor: pointer; }
.rr-btn small { font-size: 11px; }
.rr-btn:hover { background: #334155; }
.rr-btn.mati { background: #7f1d1d; }
.rr-btn.aktif { background: #1d4ed8; }
.rr-btn.merah { background: #b91c1c; }
.rr-btn.kecil { flex-direction: row; min-width: 0; font-size: 13px; padding: 6px 12px; }
.rr-audio { display: none; }
@media (max-width: 900px) {
  .rr-panel { position: absolute; right: 0; top: 48px; bottom: 76px; width: min(320px, 100%); }
  .rr-btn { min-width: 58px; font-size: 18px; }
}
</style>
