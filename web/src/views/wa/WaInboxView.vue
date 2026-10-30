<script setup lang="ts">
// Inbox WhatsApp helpdesk — chat pelanggan lewat gateway Baileys (scan QR dari HP helpdesk)
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { confirmDialog, promptDialog } from '@/composables/useDialog'

const auth = useAuthStore()
const AKUN = 'helpdesk'

interface Chat {
  id_chat: number; jid: string; nomor: string | null; is_grup: boolean; nama: string; nama_wa: string | null
  erp: { nama: string; id_pelanggan: number | null; id_site: number | null } | null
  belum_dibaca: number; pesan_terakhir: string | null; waktu_terakhir: string | null
  status: 'Terbuka' | 'Selesai'; label: string | null; pic: { id_karyawan: number; nama: string } | null
}
interface Media { jenis: string; mime: string | null; nama: string | null; ukuran: number | null; durasi: number | null; ptt: boolean; ada: boolean }
interface Pesan {
  id_pesan: number; wa_id: string; dari_saya: boolean; pengirim_jid: string | null; nama_pengirim: string | null
  tipe: string; teks: string | null; media: Media | null
  kutip: { wa_id: string; teks: string | null; pengirim_jid: string | null } | null
  lokasi: { lat: number; lng: number; nama: string | null; alamat: string | null } | null
  kontak: { nama: string | null; vcard: string | null }[] | null
  reaksi: Record<string, string> | null; status: number | null
  diedit: boolean; dihapus: boolean; riwayat: boolean; waktu: string; staf: string | null
}
interface Template { id_template: number; judul: string; isi: string; urutan: number }

// ── Koneksi ───────────────────────────────────────────────────────────────────
const koneksi = reactive<{ status: string; qr: string | null; saya: { jid: string | null; nama: string | null } | null; error: string }>({
  status: '…', qr: null, saya: null, error: '',
})
const bukaQr = ref(false)
let timerKoneksi: ReturnType<typeof setInterval> | null = null

async function muatKoneksi() {
  try {
    const { data } = await api.get(`/wa/akun/${AKUN}/koneksi`)
    const live = data.data.live || {}
    koneksi.status = live.status || 'mati'
    koneksi.qr = live.qr || null
    koneksi.saya = live.saya || null
    koneksi.error = live.error || ''
    if (koneksi.status === 'terhubung' && bukaQr.value) { bukaQr.value = false; muatChat() }
  } catch (e: any) {
    koneksi.status = 'gateway-mati'
    koneksi.error = e?.response?.data?.message || 'Gateway tidak bisa dihubungi'
  }
}
function pantauKoneksi(cepat: boolean) {
  if (timerKoneksi) clearInterval(timerKoneksi)
  timerKoneksi = setInterval(muatKoneksi, cepat ? 3000 : 30000)
}
watch(() => koneksi.status, (s) => pantauKoneksi(s === 'qr' || s === 'menghubungkan'))

async function hubungkan() {
  bukaQr.value = true
  try { await api.post(`/wa/akun/${AKUN}/mulai`) } catch (e: any) { koneksi.error = e?.response?.data?.message || 'Gagal memulai' }
  await muatKoneksi()
  pantauKoneksi(true)
}
async function putuskan() {
  const ok = await confirmDialog({
    title: 'Lepas perangkat WhatsApp?',
    message: 'ERP akan dilepas dari WhatsApp helpdesk. Untuk menyambung lagi harus scan QR ulang dari HP helpdesk.',
    confirmLabel: 'Lepas', variant: 'danger',
  })
  if (!ok) return
  try { await api.post(`/wa/akun/${AKUN}/logout`) } catch (e: any) { alert(e?.response?.data?.message || 'Gagal') }
  await muatKoneksi()
}
const labelStatus: Record<string, string> = {
  terhubung: 'Terhubung', qr: 'Menunggu scan QR', menghubungkan: 'Menghubungkan…', terputus: 'Terputus',
  logout: 'Belum ditautkan', mati: 'Belum ditautkan', 'gateway-mati': 'Gateway mati',
}

// ── Daftar chat ───────────────────────────────────────────────────────────────
const chats = ref<Chat[]>([])
const filter = ref<'saya' | 'belum' | 'semua' | 'grup' | 'selesai'>('semua')
const cari = ref('')
const halaman = ref(1)
const total = ref(0)
const hitung = reactive({ saya: 0, belum: 0, grup: 0 })
const memuatChat = ref(false)
let timerCari: ReturnType<typeof setTimeout> | null = null

async function muatChat(lanjut = false) {
  memuatChat.value = true
  try {
    if (!lanjut) halaman.value = 1
    const { data } = await api.get('/wa/chat', { params: { akun: AKUN, filter: filter.value, q: cari.value || undefined, halaman: halaman.value } })
    chats.value = lanjut ? [...chats.value, ...data.data] : data.data
    total.value = data.meta?.total ?? chats.value.length
    Object.assign(hitung, data.meta?.hitung || {})
  } finally {
    memuatChat.value = false
  }
}
function gantiFilter(f: typeof filter.value) { filter.value = f; muatChat() }
watch(cari, () => { if (timerCari) clearTimeout(timerCari); timerCari = setTimeout(() => muatChat(), 350) })
function muatLagiChat() { halaman.value++; muatChat(true) }

function cocokFilter(c: Chat): boolean {
  if (filter.value === 'saya') return c.pic?.id_karyawan === auth.user?.id_karyawan && c.status === 'Terbuka'
  if (filter.value === 'belum') return !c.pic && c.status === 'Terbuka' && !c.is_grup
  if (filter.value === 'grup') return c.is_grup
  if (filter.value === 'selesai') return c.status === 'Selesai'
  return c.status === 'Terbuka'
}
function terapkanChat(c: Chat) {
  const i = chats.value.findIndex((x) => x.id_chat === c.id_chat)
  if (aktif.value?.id_chat === c.id_chat) aktif.value = { ...c }
  if (!cocokFilter(c) || cari.value) {
    if (i >= 0 && !cocokFilter(c)) chats.value.splice(i, 1)
    else if (i >= 0) chats.value[i] = c
    return
  }
  if (i >= 0) chats.value.splice(i, 1)
  // Urutkan ulang berdasarkan waktu pesan terakhir
  const t = c.waktu_terakhir ? new Date(c.waktu_terakhir).getTime() : 0
  const pos = chats.value.findIndex((x) => (x.waktu_terakhir ? new Date(x.waktu_terakhir).getTime() : 0) < t)
  if (pos < 0) chats.value.push(c); else chats.value.splice(pos, 0, c)
}

// ── Chat aktif & pesan ────────────────────────────────────────────────────────
const aktif = ref<Chat | null>(null)
const pesan = ref<Pesan[]>([])
const adaLagi = ref(false)
const memuatPesan = ref(false)
const kotakPesan = ref<HTMLElement | null>(null)

async function bukaChat(c: Chat) {
  aktif.value = c
  pesan.value = []
  kutip.value = null
  teks.value = ''
  hapusFile()
  memuatPesan.value = true
  try {
    const { data } = await api.get(`/wa/chat/${c.id_chat}/pesan`)
    if (aktif.value?.id_chat !== c.id_chat) return
    pesan.value = data.data
    adaLagi.value = !!data.meta?.ada_lagi
    await nextTick()
    keBawah()
    if (c.belum_dibaca) tandaiDibaca(c)
  } finally {
    memuatPesan.value = false
  }
}
async function muatSebelumnya() {
  if (!aktif.value || !pesan.value.length || memuatPesan.value) return
  memuatPesan.value = true
  const el = kotakPesan.value
  const tinggiLama = el?.scrollHeight ?? 0
  try {
    const { data } = await api.get(`/wa/chat/${aktif.value.id_chat}/pesan`, { params: { sebelum: pesan.value[0]!.id_pesan } })
    pesan.value = [...data.data, ...pesan.value]
    adaLagi.value = !!data.meta?.ada_lagi
    await nextTick()
    if (el) el.scrollTop = el.scrollHeight - tinggiLama
  } finally {
    memuatPesan.value = false
  }
}
function onScroll() {
  const el = kotakPesan.value
  if (el && el.scrollTop < 60 && adaLagi.value) muatSebelumnya()
}
function dekatBawah() {
  const el = kotakPesan.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 150
}
function keBawah() {
  const el = kotakPesan.value
  if (el) el.scrollTop = el.scrollHeight
}
let timerBaca: ReturnType<typeof setTimeout> | null = null
function tandaiDibaca(c: Chat) {
  if (timerBaca) clearTimeout(timerBaca)
  timerBaca = setTimeout(() => { api.post(`/wa/chat/${c.id_chat}/baca`).catch(() => undefined) }, 600)
}

// ── Pembagian kerja ──────────────────────────────────────────────────────────
const staf = ref<{ id_karyawan: number; nama: string }[]>([])
async function ambilChat() {
  if (!aktif.value) return
  const { data } = await api.post(`/wa/chat/${aktif.value.id_chat}/ambil`)
  terapkanChat(data.data)
}
async function alihkan(ev: Event) {
  if (!aktif.value) return
  const v = Number((ev.target as HTMLSelectElement).value)
  const { data } = await api.post(`/wa/chat/${aktif.value.id_chat}/alihkan`, { id_karyawan: v || null })
  terapkanChat(data.data)
}
async function ubahStatus(selesai: boolean) {
  if (!aktif.value) return
  const { data } = await api.post(`/wa/chat/${aktif.value.id_chat}/${selesai ? 'selesai' : 'buka'}`)
  terapkanChat(data.data)
}

// ── Kirim ─────────────────────────────────────────────────────────────────────
const teks = ref('')
const file = ref<File | null>(null)
const inputFile = ref<HTMLInputElement | null>(null)
const kutip = ref<Pesan | null>(null)
const mengirim = ref(false)
const errKirim = ref('')
const MAKS_FILE = 16 * 1024 * 1024

const pratinjau = ref<string | null>(null) // object URL untuk lampiran gambar
function pasangFile(f: File) {
  if (f.size > MAKS_FILE) { errKirim.value = 'File maksimal 16 MB'; return }
  if (pratinjau.value) URL.revokeObjectURL(pratinjau.value)
  pratinjau.value = f.type.startsWith('image/') ? URL.createObjectURL(f) : null
  file.value = f
  errKirim.value = ''
}
function pilihFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (f) pasangFile(f)
}
function hapusFile() {
  file.value = null
  if (pratinjau.value) { URL.revokeObjectURL(pratinjau.value); pratinjau.value = null }
  if (inputFile.value) inputFile.value.value = ''
}
// Ctrl+V gambar (screenshot / salin gambar) → jadi lampiran; teks tetap ditempel seperti biasa
function onPaste(e: ClipboardEvent) {
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (!f) continue
    e.preventDefault()
    const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').split('+')[0]
    const nama = f.name && !/^image\.\w+$/i.test(f.name) ? f.name : `tempel-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.${ext}`
    pasangFile(new File([f], nama, { type: f.type }))
    return
  }
}
// Seret-lepas file ke ruang chat
const seret = ref(false)
function onDrop(e: DragEvent) {
  seret.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f && terhubung.value) pasangFile(f)
}

async function kirim() {
  if (!aktif.value || mengirim.value) return
  if (!teks.value.trim() && !file.value) return
  mengirim.value = true
  errKirim.value = ''
  try {
    const fd = new FormData()
    if (teks.value.trim()) fd.append('teks', teks.value.trim())
    if (file.value) fd.append('file', file.value)
    if (kutip.value) fd.append('kutip_id', String(kutip.value.id_pesan))
    const { data } = await api.post(`/wa/chat/${aktif.value.id_chat}/kirim`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (data.data) upsertPesan(data.data)
    teks.value = ''
    kutip.value = null
    hapusFile()
    await nextTick()
    keBawah()
  } catch (e: any) {
    errKirim.value = e?.response?.data?.message || 'Gagal mengirim'
  } finally {
    mengirim.value = false
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); kirim() }
}
function upsertPesan(p: Pesan) {
  const i = pesan.value.findIndex((x) => x.id_pesan === p.id_pesan)
  if (i >= 0) pesan.value[i] = p
  else pesan.value.push(p)
}

async function reaksi(p: Pesan, emoji: string) {
  const sama = p.reaksi?.saya === emoji
  try { await api.post(`/wa/pesan/${p.id_pesan}/reaksi`, { emoji: sama ? '' : emoji }) } catch { /* abaikan */ }
}

// ── Template balasan cepat ───────────────────────────────────────────────────
const template = ref<Template[]>([])
const bukaTemplate = ref(false)
async function muatTemplate() {
  const { data } = await api.get('/wa/template')
  template.value = data.data
}
function pakaiTemplate(t: Template) {
  teks.value = teks.value ? `${teks.value}\n${t.isi}` : t.isi
  bukaTemplate.value = false
}
async function tambahTemplate() {
  const judul = await promptDialog({ title: 'Balasan cepat baru', label: 'Judul', placeholder: 'mis. Salam pembuka' })
  if (!judul) return
  const isi = await promptDialog({ title: `Balasan cepat: ${judul}`, label: 'Isi pesan', defaultValue: teks.value })
  if (!isi) return
  await api.post('/wa/template', { judul, isi })
  await muatTemplate()
}
async function hapusTemplate(t: Template) {
  if (!(await confirmDialog({ title: 'Hapus balasan cepat?', message: t.judul, confirmLabel: 'Hapus', variant: 'danger' }))) return
  await api.delete(`/wa/template/${t.id_template}`)
  await muatTemplate()
}

// ── Media (privat, diambil lewat API ber-login) ──────────────────────────────
const urlMedia = reactive<Record<number, string>>({})
const memuatMedia = reactive<Record<number, boolean>>({})
async function muatMedia(p: Pesan) {
  if (urlMedia[p.id_pesan] || memuatMedia[p.id_pesan] || !p.media?.ada) return
  memuatMedia[p.id_pesan] = true
  try {
    const { data } = await api.get(`/wa/media/${p.id_pesan}`, { responseType: 'blob' })
    urlMedia[p.id_pesan] = URL.createObjectURL(data)
  } catch { /* tampil tombol coba lagi */ } finally {
    memuatMedia[p.id_pesan] = false
  }
}
// Media yang gagal terunduh: minta gateway mengunduh ulang dari WhatsApp
const unduhUlangErr = reactive<Record<number, string>>({})
async function unduhUlang(p: Pesan) {
  if (memuatMedia[p.id_pesan]) return
  memuatMedia[p.id_pesan] = true
  unduhUlangErr[p.id_pesan] = ''
  try {
    const { data } = await api.post(`/wa/pesan/${p.id_pesan}/unduh-ulang`)
    upsertPesan(data.data)
  } catch (e: any) {
    unduhUlangErr[p.id_pesan] = e?.response?.data?.message || 'Gagal mengunduh ulang'
  } finally {
    memuatMedia[p.id_pesan] = false
  }
  const baru = pesan.value.find((x) => x.id_pesan === p.id_pesan)
  if (baru?.media?.ada && (baru.media.jenis === 'image' || baru.media.jenis === 'sticker')) muatMedia(baru)
}

async function unduh(p: Pesan) {
  await muatMedia(p)
  const u = urlMedia[p.id_pesan]
  if (!u) return
  const a = document.createElement('a')
  a.href = u
  a.download = p.media?.nama || `wa-${p.id_pesan}`
  a.click()
}
// Foto & stiker dimuat otomatis; video/audio/dokumen saat diklik
watch(pesan, (list) => {
  for (const p of list) if (p.media?.ada && (p.media.jenis === 'image' || p.media.jenis === 'sticker')) muatMedia(p)
}, { deep: false })
const lihatFoto = ref<string | null>(null)

// ── Foto profil (diambil lewat API ber-login, maks 3 bersamaan, di-cache ERP 24 jam) ──
const foto = reactive<Record<number, string>>({}) // id_chat → object URL
const fotoDicek = new Set<number>()
const antreFoto: number[] = []
let fotoJalan = 0
function mintaFoto(ids: number[]) {
  for (const id of ids) if (!fotoDicek.has(id)) { fotoDicek.add(id); antreFoto.push(id) }
  jalankanFoto()
}
function jalankanFoto() {
  while (fotoJalan < 3 && antreFoto.length) {
    const id = antreFoto.shift()!
    fotoJalan++
    api.get(`/wa/chat/${id}/foto`, { responseType: 'blob' })
      .then(({ data }) => { foto[id] = URL.createObjectURL(data) })
      .catch(() => undefined) // 404 = tidak ada foto → tetap inisial
      .finally(() => { fotoJalan--; jalankanFoto() })
  }
}
watch(chats, (list) => mintaFoto(list.map((c) => c.id_chat)))

interface Profil {
  id_chat: number; nama: string; nomor: string | null; is_grup: boolean; jumlah_pesan: number; dibuat: string
  kontak: { nama_wa: string | null; nama_simpan: string | null; nama_erp: string | null } | null
  site: { id_site: number; kode_site: string; nama_site: string; kota: string | null; status_site: string } | null
  pelanggan: { id_pelanggan: number; kode_pelanggan: string; nama_pelanggan: string } | null
  grup: { deskripsi: string | null; peserta: { jid: string; nomor: string | null; admin: string | null; nama: string; erp: string | null }[]; error?: string } | null
}
const profil = ref<Profil | null>(null)
const bukaProfil = ref(false)
const memuatProfil = ref(false)
const fotoBesar = ref<string | null>(null)
async function tampilkanProfil() {
  if (!aktif.value) return
  const id = aktif.value.id_chat
  bukaProfil.value = true
  profil.value = null
  if (fotoBesar.value) { URL.revokeObjectURL(fotoBesar.value); fotoBesar.value = null }
  memuatProfil.value = true
  try {
    const [p] = await Promise.all([
      api.get(`/wa/chat/${id}/profil`),
      api.get(`/wa/chat/${id}/foto`, { params: { besar: 1 }, responseType: 'blob' })
        .then(({ data }) => { if (aktif.value?.id_chat === id) fotoBesar.value = URL.createObjectURL(data) })
        .catch(() => undefined),
    ])
    if (aktif.value?.id_chat === id) profil.value = p.data.data
  } finally {
    memuatProfil.value = false
  }
}
watch(() => aktif.value?.id_chat, () => { bukaProfil.value = false })

// ── Real-time (SSE) ──────────────────────────────────────────────────────────
let es: EventSource | null = null
let timerSambung: ReturnType<typeof setTimeout> | null = null
let timerRiwayat: ReturnType<typeof setTimeout> | null = null
const sinkron = ref('')

async function sambungStream() {
  try {
    const { data } = await api.post('/wa/stream-tiket')
    es = new EventSource(`/api/wa/stream?tiket=${encodeURIComponent(data.data.tiket)}`)
    es.onmessage = (m) => { try { terimaEvent(JSON.parse(m.data)) } catch { /* abaikan */ } }
    es.onerror = () => { es?.close(); es = null; jadwalSambung() }
  } catch {
    jadwalSambung()
  }
}
function jadwalSambung() {
  if (timerSambung) return
  timerSambung = setTimeout(() => { timerSambung = null; sambungStream() }, 5000)
}

function terimaEvent(ev: any) {
  if (ev.tipe === 'pesan') {
    if (ev.chat) terapkanChat(ev.chat)
    if (aktif.value?.id_chat === ev.id_chat && ev.pesan) {
      const bawah = dekatBawah()
      upsertPesan(ev.pesan)
      if (bawah) nextTick(keBawah)
      if (!ev.pesan.dari_saya && document.visibilityState === 'visible' && aktif.value) tandaiDibaca(aktif.value)
    } else if (ev.pesan && !ev.pesan.dari_saya && !ev.pesan.riwayat) {
      bunyi()
    }
  } else if (ev.tipe === 'chat' && ev.chat) {
    terapkanChat(ev.chat)
  } else if (ev.tipe === 'status' && aktif.value?.id_chat === ev.id_chat) {
    const p = pesan.value.find((x) => x.id_pesan === ev.id_pesan)
    if (p) p.status = ev.status
  } else if (ev.tipe === 'koneksi') {
    muatKoneksi()
  } else if (ev.tipe === 'riwayat') {
    sinkron.value = ev.terakhir ? '' : `Sinkron riwayat… ${ev.progress != null ? ev.progress + '%' : ''}`
    if (timerRiwayat) clearTimeout(timerRiwayat)
    timerRiwayat = setTimeout(() => { muatChat(); if (ev.terakhir) sinkron.value = '' }, 2000)
  }
}

let audioCtx: AudioContext | null = null
function bunyi() {
  try {
    audioCtx ??= new AudioContext()
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.08, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25)
    o.connect(g).connect(audioCtx.destination)
    o.start()
    o.stop(audioCtx.currentTime + 0.25)
  } catch { /* browser tanpa audio */ }
}

// ── Format tampilan ──────────────────────────────────────────────────────────
function jam(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  const hariIni = new Date()
  if (d.toDateString() === hariIni.toDateString()) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  const kemarin = new Date(hariIni.getTime() - 86400000)
  if (d.toDateString() === kemarin.toDateString()) return 'Kemarin'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
const jamPesan = (s: string) => new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
function hari(s: string) {
  const d = new Date(s)
  const hariIni = new Date()
  if (d.toDateString() === hariIni.toDateString()) return 'Hari ini'
  if (d.toDateString() === new Date(hariIni.getTime() - 86400000).toDateString()) return 'Kemarin'
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const pisahHari = (i: number) => i === 0 || new Date(pesan.value[i - 1]!.waktu).toDateString() !== new Date(pesan.value[i]!.waktu).toDateString()
const ukuran = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const centang = (s: number | null) => (s == null || s <= 1 ? '🕓' : s === 2 ? '✓' : '✓✓')
const inisial = (n: string) => n.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('') || '#'
function namaAnggota(p: Pesan) {
  return p.nama_pengirim || (p.pengirim_jid?.endsWith('@s.whatsapp.net') ? '+' + p.pengirim_jid.split('@')[0] : 'Anggota')
}
// Teks dengan tautan yang bisa diklik (tanpa v-html)
function potong(t: string | null): { teks: string; url?: string }[] {
  if (!t) return []
  const out: { teks: string; url?: string }[] = []
  const re = /(https?:\/\/[^\s]+)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    if (m.index > last) out.push({ teks: t.slice(last, m.index) })
    out.push({ teks: m[0], url: m[0] })
    last = m.index + m[0].length
  }
  if (last < t.length) out.push({ teks: t.slice(last) })
  return out
}
const daftarReaksi = (r: Record<string, string> | null) => (r ? Object.values(r).filter(Boolean) : [])
const EMOJI = ['👍', '❤️', '😂', '🙏', '😮', '😢']

const terhubung = computed(() => koneksi.status === 'terhubung')
const milikSaya = computed(() => aktif.value?.pic?.id_karyawan === auth.user?.id_karyawan)

onMounted(async () => {
  await Promise.all([muatKoneksi(), muatChat(), muatTemplate(), api.get('/wa/staf').then(({ data }) => { staf.value = data.data }).catch(() => undefined)])
  pantauKoneksi(koneksi.status === 'qr' || koneksi.status === 'menghubungkan')
  sambungStream()
})
onBeforeUnmount(() => {
  es?.close()
  if (timerKoneksi) clearInterval(timerKoneksi)
  if (timerSambung) clearTimeout(timerSambung)
  for (const u of Object.values(urlMedia)) URL.revokeObjectURL(u)
  for (const u of Object.values(foto)) URL.revokeObjectURL(u)
  if (fotoBesar.value) URL.revokeObjectURL(fotoBesar.value)
  if (pratinjau.value) URL.revokeObjectURL(pratinjau.value)
})
</script>

<template>
  <div class="wa-page" :class="{ 'ada-chat': aktif }">
    <!-- ── Kolom kiri: koneksi + daftar chat ── -->
    <aside class="wa-side">
      <div class="wa-akun">
        <div class="wa-akun-info">
          <span class="wa-dot" :class="koneksi.status"></span>
          <div>
            <b>WhatsApp Helpdesk</b>
            <small>{{ labelStatus[koneksi.status] || koneksi.status }}<template v-if="terhubung && koneksi.saya?.jid"> · +{{ koneksi.saya.jid.split('@')[0] }}</template></small>
          </div>
        </div>
        <button v-if="!terhubung" class="btn-sm btn-hijau" @click="hubungkan">Hubungkan</button>
        <button v-else-if="auth.hasRole('Admin') || auth.hasRole('Director') || auth.hasRole('Manager_Ops')" class="btn-sm btn-ghost" title="Lepas perangkat" @click="putuskan">⏏</button>
      </div>
      <p v-if="sinkron" class="wa-sinkron">⏳ {{ sinkron }}</p>

      <div class="wa-cari">
        <input v-model="cari" type="search" placeholder="Cari nama, nomor, pelanggan…" />
      </div>
      <div class="wa-filter">
        <button :class="{ on: filter === 'semua' }" @click="gantiFilter('semua')">Semua</button>
        <button :class="{ on: filter === 'saya' }" @click="gantiFilter('saya')">Milik saya <span v-if="hitung.saya">{{ hitung.saya }}</span></button>
        <button :class="{ on: filter === 'belum' }" @click="gantiFilter('belum')">Belum ditangani <span v-if="hitung.belum">{{ hitung.belum }}</span></button>
        <button :class="{ on: filter === 'grup' }" @click="gantiFilter('grup')">Grup <span v-if="hitung.grup">{{ hitung.grup }}</span></button>
        <button :class="{ on: filter === 'selesai' }" @click="gantiFilter('selesai')">Selesai</button>
      </div>

      <ul class="wa-list">
        <li v-for="c in chats" :key="c.id_chat" :class="{ on: aktif?.id_chat === c.id_chat }" @click="bukaChat(c)">
          <div class="wa-avatar" :class="{ grup: c.is_grup }">
            <img v-if="foto[c.id_chat]" :src="foto[c.id_chat]" alt="" />
            <template v-else>{{ c.is_grup ? '👥' : inisial(c.nama) }}</template>
          </div>
          <div class="wa-li-body">
            <div class="wa-li-top">
              <b class="wa-li-nama">{{ c.nama }}</b>
              <small :class="{ hijau: c.belum_dibaca }">{{ jam(c.waktu_terakhir) }}</small>
            </div>
            <div class="wa-li-bot">
              <span class="wa-li-pesan">{{ c.pesan_terakhir || '—' }}</span>
              <span v-if="c.belum_dibaca" class="wa-badge">{{ c.belum_dibaca }}</span>
            </div>
            <div class="wa-li-tag">
              <span v-if="c.erp" class="tag tag-erp" :title="c.erp.nama">🏢 {{ c.erp.nama }}</span>
              <span v-if="c.pic" class="tag tag-pic">👤 {{ c.pic.nama.split(' ')[0] }}</span>
              <span v-else-if="!c.is_grup && c.status === 'Terbuka'" class="tag tag-belum">Belum ditangani</span>
            </div>
          </div>
        </li>
        <li v-if="!chats.length && !memuatChat" class="wa-kosong">Belum ada chat{{ cari ? ' yang cocok' : '' }}.</li>
        <li v-if="chats.length < total" class="wa-lagi"><button class="btn-sm btn-ghost" :disabled="memuatChat" @click.stop="muatLagiChat">Muat lebih banyak</button></li>
      </ul>
    </aside>

    <!-- ── Kolom kanan: ruang chat ── -->
    <section
      class="wa-main" :class="{ seret }"
      @dragover.prevent="seret = !!aktif && terhubung" @dragleave.self="seret = false" @drop.prevent="onDrop"
    >
      <div v-if="seret" class="wa-seret">Lepaskan file untuk dilampirkan</div>
      <div v-if="!aktif" class="wa-kosong-main">
        <div class="wa-logo">💬</div>
        <p>Pilih chat di sebelah kiri untuk mulai membalas.</p>
        <p v-if="!terhubung" class="muted">WhatsApp helpdesk belum terhubung — klik <b>Hubungkan</b> lalu scan QR dari HP helpdesk.</p>
      </div>

      <template v-else>
        <header class="wa-head">
          <button class="wa-back" @click="aktif = null">←</button>
          <div class="wa-avatar klik" :class="{ grup: aktif.is_grup }" title="Lihat profil" @click="tampilkanProfil">
            <img v-if="foto[aktif.id_chat]" :src="foto[aktif.id_chat]" alt="" />
            <template v-else>{{ aktif.is_grup ? '👥' : inisial(aktif.nama) }}</template>
          </div>
          <div class="wa-head-info klik" title="Lihat profil" @click="tampilkanProfil">
            <b>{{ aktif.nama }}</b>
            <small>
              <template v-if="aktif.nomor">+{{ aktif.nomor }}</template>
              <template v-if="aktif.nama_wa && aktif.nama_wa !== aktif.nama"> · ~{{ aktif.nama_wa }}</template>
              <template v-if="aktif.erp"> · 🏢 {{ aktif.erp.nama }}</template>
            </small>
          </div>
          <div class="wa-head-act">
            <select class="wa-select" :value="aktif.pic?.id_karyawan ?? 0" title="Ditangani oleh" @change="alihkan">
              <option :value="0">— Belum ditangani —</option>
              <option v-for="s in staf" :key="s.id_karyawan" :value="s.id_karyawan">{{ s.nama }}</option>
              <option v-if="aktif.pic && !staf.some((s) => s.id_karyawan === aktif!.pic!.id_karyawan)" :value="aktif.pic.id_karyawan">{{ aktif.pic.nama }}</option>
            </select>
            <button v-if="!milikSaya" class="btn-sm btn-ghost" @click="ambilChat">Ambil</button>
            <button v-if="aktif.status === 'Terbuka'" class="btn-sm btn-hijau" @click="ubahStatus(true)">✓ Selesai</button>
            <button v-else class="btn-sm btn-ghost" @click="ubahStatus(false)">Buka lagi</button>
          </div>
        </header>

        <div ref="kotakPesan" class="wa-pesan" @scroll.passive="onScroll">
          <div v-if="adaLagi" class="wa-muat-lama"><button class="btn-sm btn-ghost" :disabled="memuatPesan" @click="muatSebelumnya">Muat pesan sebelumnya</button></div>
          <div v-if="memuatPesan && !pesan.length" class="wa-kosong">Memuat…</div>

          <template v-for="(p, i) in pesan" :key="p.id_pesan">
            <div v-if="pisahHari(i)" class="wa-hari"><span>{{ hari(p.waktu) }}</span></div>

            <div v-if="p.tipe === 'call'" class="wa-sistem">📞 {{ p.teks }} · {{ jamPesan(p.waktu) }}</div>

            <div v-else class="wa-baris" :class="{ saya: p.dari_saya }">
              <div class="wa-bubble" :class="{ saya: p.dari_saya, stiker: p.tipe === 'sticker' && !p.dihapus }">
                <div v-if="aktif.is_grup && !p.dari_saya" class="wa-anggota">{{ namaAnggota(p) }}</div>

                <div v-if="p.kutip" class="wa-kutip">
                  <small>{{ p.kutip.pengirim_jid ? '+' + p.kutip.pengirim_jid.split('@')[0] : 'Pesan' }}</small>
                  <span>{{ p.kutip.teks || '📎 Media' }}</span>
                </div>

                <i v-if="p.dihapus" class="muted">🚫 Pesan ini dihapus</i>
                <template v-else>
                  <!-- Foto / stiker -->
                  <template v-if="p.media && (p.media.jenis === 'image' || p.media.jenis === 'sticker')">
                    <img v-if="urlMedia[p.id_pesan]" :src="urlMedia[p.id_pesan]" :class="p.media.jenis === 'sticker' ? 'wa-stiker' : 'wa-foto'" alt="" @click="p.media.jenis === 'image' && (lihatFoto = urlMedia[p.id_pesan] ?? null)" />
                    <div v-else class="wa-media-box">{{ p.media.ada ? '⏳ Memuat foto…' : (p.riwayat ? '📷 Foto (riwayat, tidak diunduh)' : '📷 Foto belum tersedia') }}</div>
                  </template>
                  <!-- Video -->
                  <template v-else-if="p.media && p.media.jenis === 'video'">
                    <video v-if="urlMedia[p.id_pesan]" :src="urlMedia[p.id_pesan]" controls class="wa-foto"></video>
                    <button v-else class="wa-media-box klik" :disabled="!p.media.ada" @click="muatMedia(p)">
                      🎥 {{ p.media.ada ? (memuatMedia[p.id_pesan] ? 'Memuat…' : 'Putar video') : 'Video (tidak tersedia)' }} {{ ukuran(p.media.ukuran) }}
                    </button>
                  </template>
                  <!-- Audio / voice note -->
                  <template v-else-if="p.media && p.media.jenis === 'audio'">
                    <audio v-if="urlMedia[p.id_pesan]" :src="urlMedia[p.id_pesan]" controls class="wa-audio"></audio>
                    <button v-else class="wa-media-box klik" :disabled="!p.media.ada" @click="muatMedia(p)">
                      {{ p.media.ptt ? '🎤 Voice note' : '🎵 Audio' }} {{ p.media.durasi ? `${p.media.durasi} dtk` : '' }} {{ p.media.ada ? (memuatMedia[p.id_pesan] ? '· memuat…' : '· putar') : '· tidak tersedia' }}
                    </button>
                  </template>
                  <!-- Dokumen -->
                  <button v-else-if="p.media && p.media.jenis === 'document'" class="wa-dok" :disabled="!p.media.ada" @click="unduh(p)">
                    <span class="wa-dok-ikon">📄</span>
                    <span><b>{{ p.media.nama || 'Dokumen' }}</b><small>{{ ukuran(p.media.ukuran) }} {{ p.media.ada ? '· Unduh' : '· tidak tersedia' }}</small></span>
                  </button>
                  <div v-if="p.media && !p.media.ada && !p.riwayat" class="wa-ulang">
                    <button class="btn-sm btn-ghost" :disabled="memuatMedia[p.id_pesan]" @click="unduhUlang(p)">
                      {{ memuatMedia[p.id_pesan] ? 'Mengunduh…' : '↻ Coba unduh lagi' }}
                    </button>
                    <small v-if="unduhUlangErr[p.id_pesan]" class="wa-err">{{ unduhUlangErr[p.id_pesan] }}</small>
                  </div>
                  <!-- Lokasi -->
                  <a v-if="p.lokasi" class="wa-lokasi" :href="`https://maps.google.com/?q=${p.lokasi.lat},${p.lokasi.lng}`" target="_blank" rel="noopener">
                    📍 {{ p.lokasi.nama || 'Lokasi' }}<small v-if="p.lokasi.alamat">{{ p.lokasi.alamat }}</small>
                  </a>
                  <!-- Kontak -->
                  <div v-if="p.kontak" class="wa-kontak">
                    <div v-for="(k, j) in p.kontak" :key="j">👤 {{ k.nama || 'Kontak' }}</div>
                  </div>
                  <!-- Teks / caption -->
                  <div v-if="p.teks && p.tipe !== 'location'" class="wa-teks" :class="{ miring: p.tipe === 'unsupported' || p.tipe === 'poll' }">
                    <template v-if="p.tipe === 'poll'">📊 </template>
                    <template v-for="(s, j) in potong(p.teks)" :key="j"><a v-if="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.teks }}</a><template v-else>{{ s.teks }}</template></template>
                  </div>
                </template>

                <div class="wa-meta">
                  <span v-if="p.staf" class="wa-staf">{{ p.staf.split(' ')[0] }}</span>
                  <span v-if="p.diedit">diedit</span>
                  <span>{{ jamPesan(p.waktu) }}</span>
                  <span v-if="p.dari_saya" class="wa-centang" :class="{ biru: (p.status ?? 0) >= 4 }">{{ centang(p.status) }}</span>
                </div>
                <div v-if="daftarReaksi(p.reaksi).length" class="wa-reaksi">{{ daftarReaksi(p.reaksi).join(' ') }}</div>
              </div>

              <div v-if="!p.dihapus" class="wa-aksi">
                <button title="Balas" @click="kutip = p">↩</button>
                <button v-for="e in EMOJI.slice(0, 4)" :key="e" :title="`Reaksi ${e}`" @click="reaksi(p, e)">{{ e }}</button>
              </div>
            </div>
          </template>
        </div>

        <!-- ── Penulisan pesan ── -->
        <footer class="wa-tulis">
          <div v-if="kutip" class="wa-tulis-kutip">
            <span>↩ {{ kutip.teks || (kutip.media ? '📎 ' + (kutip.media.nama || kutip.media.jenis) : 'Pesan') }}</span>
            <button @click="kutip = null">✕</button>
          </div>
          <div v-if="file" class="wa-tulis-kutip wa-lampiran">
            <img v-if="pratinjau" :src="pratinjau" alt="" />
            <span>📎 {{ file.name }} ({{ ukuran(file.size) }})<small v-if="pratinjau"> — teks yang diketik menjadi keterangan foto</small></span>
            <button @click="hapusFile">✕</button>
          </div>
          <p v-if="errKirim" class="wa-err">{{ errKirim }}</p>
          <div class="wa-tulis-baris">
            <div class="wa-template-wrap">
              <button class="wa-ikon" title="Balasan cepat" @click="bukaTemplate = !bukaTemplate">⚡</button>
              <div v-if="bukaTemplate" class="wa-template">
                <div v-for="t in template" :key="t.id_template" class="wa-template-item">
                  <button class="wa-template-pakai" @click="pakaiTemplate(t)"><b>{{ t.judul }}</b><small>{{ t.isi }}</small></button>
                  <button class="wa-template-hapus" title="Hapus" @click="hapusTemplate(t)">🗑</button>
                </div>
                <p v-if="!template.length" class="muted">Belum ada balasan cepat.</p>
                <button class="btn-sm btn-ghost" @click="tambahTemplate">+ Tambah balasan cepat</button>
              </div>
            </div>
            <button class="wa-ikon" title="Lampirkan file (maks 16 MB)" @click="inputFile?.click()">📎</button>
            <input ref="inputFile" type="file" hidden @change="pilihFile" />
            <textarea
              v-model="teks" rows="1" :placeholder="terhubung ? 'Tulis pesan… (Enter kirim, Shift+Enter baris baru)' : 'WhatsApp belum terhubung'"
              :disabled="!terhubung" @keydown="onKey" @paste="onPaste"
            ></textarea>
            <button class="wa-kirim" :disabled="!terhubung || mengirim || (!teks.trim() && !file)" @click="kirim">{{ mengirim ? '…' : '➤' }}</button>
          </div>
        </footer>
      </template>
    </section>

    <!-- QR koneksi -->
    <div v-if="bukaQr" class="wa-modal" @click.self="bukaQr = false">
      <div class="wa-modal-box">
        <h3>Tautkan WhatsApp Helpdesk</h3>
        <ol>
          <li>Buka WhatsApp Business di HP helpdesk</li>
          <li>Menu ⋮ → <b>Perangkat tertaut</b> → <b>Tautkan perangkat</b></li>
          <li>Scan QR di bawah ini</li>
        </ol>
        <img v-if="koneksi.qr" :src="koneksi.qr" alt="QR WhatsApp" class="wa-qr" />
        <p v-else-if="koneksi.status === 'terhubung'" class="hijau">✓ Terhubung</p>
        <p v-else class="muted">{{ koneksi.error || 'Menyiapkan QR…' }}</p>
        <p class="muted kecil">QR berganti otomatis tiap ±20 detik. Setelah terhubung, riwayat chat akan disinkronkan.</p>
        <button class="btn-sm btn-ghost" @click="bukaQr = false">Tutup</button>
      </div>
    </div>

    <!-- Panel profil -->
    <div v-if="bukaProfil" class="wa-profil-latar" @click.self="bukaProfil = false">
      <aside class="wa-profil">
        <header><b>{{ aktif?.is_grup ? 'Info grup' : 'Info kontak' }}</b><button @click="bukaProfil = false">✕</button></header>
        <div class="wa-profil-foto">
          <img v-if="fotoBesar" :src="fotoBesar" alt="" @click="lihatFoto = fotoBesar" />
          <div v-else class="wa-avatar besar" :class="{ grup: aktif?.is_grup }">{{ aktif?.is_grup ? '👥' : inisial(aktif?.nama || '') }}</div>
          <h3>{{ profil?.nama || aktif?.nama }}</h3>
          <p v-if="profil?.nomor" class="muted">+{{ profil.nomor }}</p>
          <p v-if="profil?.kontak?.nama_wa" class="muted">~{{ profil.kontak.nama_wa }}</p>
        </div>
        <p v-if="memuatProfil" class="muted pusat">Memuat…</p>
        <template v-else-if="profil">
          <section v-if="!profil.is_grup" class="wa-profil-bag">
            <h4>Data ERP</h4>
            <template v-if="profil.site || profil.pelanggan">
              <p v-if="profil.kontak?.nama_erp"><b>{{ profil.kontak.nama_erp }}</b></p>
              <p v-if="profil.pelanggan">🏢 {{ profil.pelanggan.nama_pelanggan }} <small class="muted">{{ profil.pelanggan.kode_pelanggan }}</small></p>
              <p v-if="profil.site">
                📍 <RouterLink :to="`/master/site/${profil.site.id_site}`">{{ profil.site.nama_site }}</RouterLink>
                <small class="muted">{{ profil.site.kode_site }}<template v-if="profil.site.kota"> · {{ profil.site.kota }}</template> · {{ profil.site.status_site }}</small>
              </p>
            </template>
            <p v-else class="muted">Nomor ini belum terdaftar sebagai PIC site / pelanggan di ERP.</p>
          </section>
          <section v-else class="wa-profil-bag">
            <h4>Deskripsi</h4>
            <p class="wa-profil-desk">{{ profil.grup?.deskripsi || '—' }}</p>
            <h4>{{ profil.grup?.peserta.length ?? 0 }} anggota</h4>
            <p v-if="profil.grup?.error" class="wa-err">{{ profil.grup.error }}</p>
            <ul class="wa-anggota-list">
              <li v-for="a in profil.grup?.peserta ?? []" :key="a.jid">
                <span>{{ a.nama }}<small v-if="a.erp" class="muted"> · {{ a.erp }}</small></span>
                <small v-if="a.admin" class="tag tag-erp">{{ a.admin === 'superadmin' ? 'Pembuat' : 'Admin' }}</small>
              </li>
            </ul>
          </section>
          <section class="wa-profil-bag">
            <h4>Percakapan</h4>
            <p>{{ profil.jumlah_pesan.toLocaleString('id-ID') }} pesan tersimpan di ERP</p>
            <p v-if="aktif?.pic">Ditangani: <b>{{ aktif.pic.nama }}</b></p>
            <p>Status: <b>{{ aktif?.status }}</b></p>
          </section>
        </template>
      </aside>
    </div>

    <!-- Foto layar penuh -->
    <div v-if="lihatFoto" class="wa-modal" @click="lihatFoto = null"><img :src="lihatFoto" class="wa-foto-besar" alt="" /></div>
  </div>
</template>

<style scoped>
.wa-page {
  --wa-hijau: #16a34a; --wa-hijau-muda: #dcfce7; --wa-garis: #e2e8f0; --wa-muted: #64748b; --wa-bg-chat: #efeae2;
  display: grid; grid-template-columns: 360px 1fr; height: calc(100vh - 120px); min-height: 520px;
  background: var(--surface, #fff); border: 1px solid var(--wa-garis); border-radius: 12px; overflow: hidden;
}
.muted { color: var(--wa-muted); }
.kecil { font-size: 12px; }
.hijau { color: var(--wa-hijau); }
.btn-sm { padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
.btn-hijau { background: var(--wa-hijau); color: #fff; }
.btn-ghost { background: #fff; border-color: #cbd5e1; color: #334155; }
.btn-sm:disabled { opacity: .5; cursor: not-allowed; }

/* Kiri */
.wa-side { border-right: 1px solid var(--wa-garis); display: flex; flex-direction: column; min-height: 0; }
.wa-akun { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--wa-garis); background: #f8fafc; }
.wa-akun-info { display: flex; gap: 10px; align-items: center; min-width: 0; }
.wa-akun-info small { display: block; color: var(--wa-muted); font-size: 12px; }
.wa-dot { width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; flex: none; }
.wa-dot.terhubung { background: var(--wa-hijau); box-shadow: 0 0 0 3px #bbf7d0; }
.wa-dot.qr, .wa-dot.menghubungkan { background: #f59e0b; }
.wa-dot.terputus, .wa-dot.gateway-mati { background: #dc2626; }
.wa-sinkron { margin: 0; padding: 6px 14px; font-size: 12px; background: #fef9c3; color: #854d0e; }
.wa-cari { padding: 10px 12px 6px; }
.wa-cari input { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 20px; font-size: 13px; background: #f8fafc; }
.wa-filter { display: flex; gap: 6px; padding: 4px 12px 10px; flex-wrap: wrap; }
.wa-filter button { border: 1px solid #e2e8f0; background: #fff; padding: 4px 10px; border-radius: 99px; font-size: 12px; cursor: pointer; color: #334155; }
.wa-filter button.on { background: var(--wa-hijau-muda); border-color: #86efac; color: #166534; font-weight: 600; }
.wa-filter button span { background: var(--wa-hijau); color: #fff; border-radius: 99px; padding: 0 6px; margin-left: 4px; font-size: 11px; }
.wa-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
.wa-list li { display: flex; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
.wa-list li:hover { background: #f8fafc; }
.wa-list li.on { background: #f0fdf4; }
.wa-avatar { width: 42px; height: 42px; border-radius: 50%; background: #e2e8f0; color: #334155; display: grid; place-items: center; font-weight: 700; font-size: 14px; flex: none; }
.wa-avatar.grup { background: #dbeafe; }
.wa-avatar { overflow: hidden; }
.wa-avatar img { width: 100%; height: 100%; object-fit: cover; }
.wa-avatar.besar { width: 160px; height: 160px; font-size: 48px; margin: 0 auto; }
.klik { cursor: pointer; }
.wa-main { position: relative; }
.wa-main.seret { outline: 3px dashed var(--wa-hijau); outline-offset: -8px; }
.wa-seret { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(240,253,244,.85); color: #166534; font-weight: 700; font-size: 18px; z-index: 6; pointer-events: none; }
.wa-lampiran { align-items: center; }
.wa-lampiran img { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; flex: none; }
.wa-lampiran span { white-space: normal; flex: 1; }
.wa-lampiran small { color: var(--wa-muted); }
.wa-profil-latar { position: fixed; inset: 0; background: rgba(15,23,42,.35); z-index: 40; display: flex; justify-content: flex-end; }
.wa-profil { width: min(380px, 100%); height: 100%; background: #fff; overflow-y: auto; box-shadow: -8px 0 24px rgba(0,0,0,.15); }
.wa-profil > header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--wa-garis); position: sticky; top: 0; background: #fff; }
.wa-profil > header button { border: 0; background: none; font-size: 18px; cursor: pointer; }
.wa-profil-foto { text-align: center; padding: 20px 16px 10px; }
.wa-profil-foto > img { width: 200px; height: 200px; border-radius: 50%; object-fit: cover; cursor: zoom-in; }
.wa-profil-foto h3 { margin: 12px 0 2px; }
.wa-profil-foto p { margin: 2px 0; }
.wa-profil-bag { padding: 12px 16px; border-top: 8px solid #f1f5f9; font-size: 14px; }
.wa-profil-bag h4 { margin: 0 0 8px; font-size: 13px; color: #166534; }
.wa-profil-bag p { margin: 4px 0; }
.wa-profil-desk { white-space: pre-wrap; color: #334155; }
.wa-anggota-list { list-style: none; margin: 0; padding: 0; }
.wa-anggota-list li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
.pusat { text-align: center; }
.wa-li-body { min-width: 0; flex: 1; }
.wa-li-top, .wa-li-bot { display: flex; justify-content: space-between; gap: 6px; align-items: center; }
.wa-li-nama { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-li-top small { font-size: 11px; color: var(--wa-muted); flex: none; }
.wa-li-top small.hijau { color: var(--wa-hijau); font-weight: 600; }
.wa-li-pesan { font-size: 13px; color: var(--wa-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-badge { background: var(--wa-hijau); color: #fff; border-radius: 99px; font-size: 11px; font-weight: 700; padding: 1px 7px; flex: none; }
.wa-li-tag { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.tag { font-size: 11px; padding: 1px 7px; border-radius: 6px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-erp { background: #eff6ff; color: #1d4ed8; }
.tag-pic { background: #f1f5f9; color: #334155; }
.tag-belum { background: #fef3c7; color: #92400e; }
.wa-kosong { padding: 30px 16px; text-align: center; color: var(--wa-muted); font-size: 13px; cursor: default !important; }
.wa-lagi { justify-content: center; cursor: default !important; }

/* Kanan */
.wa-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--wa-bg-chat); }
.wa-kosong-main { margin: auto; text-align: center; color: #334155; padding: 24px; }
.wa-logo { font-size: 56px; }
.wa-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid var(--wa-garis); flex-wrap: wrap; }
.wa-back { display: none; border: 0; background: none; font-size: 20px; cursor: pointer; }
.wa-head-info { flex: 1; min-width: 160px; }
.wa-head-info small { display: block; font-size: 12px; color: var(--wa-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-head-act { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.wa-select { padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; max-width: 200px; }

.wa-pesan { flex: 1; overflow-y: auto; padding: 14px 6%; display: flex; flex-direction: column; gap: 4px; }
.wa-muat-lama { text-align: center; margin-bottom: 8px; }
.wa-hari { text-align: center; margin: 10px 0 6px; }
.wa-hari span { background: #fff; color: #475569; font-size: 12px; padding: 3px 10px; border-radius: 8px; box-shadow: 0 1px 1px rgba(0,0,0,.06); }
.wa-sistem { align-self: center; background: #fef9c3; color: #713f12; font-size: 12px; padding: 4px 10px; border-radius: 8px; margin: 4px 0; }
.wa-baris { display: flex; align-items: flex-end; gap: 6px; }
.wa-baris.saya { flex-direction: row-reverse; }
.wa-bubble { position: relative; max-width: min(72%, 560px); background: #fff; padding: 6px 9px 4px; border-radius: 10px; box-shadow: 0 1px 1px rgba(0,0,0,.08); font-size: 14px; word-wrap: break-word; }
.wa-bubble.saya { background: #d9fdd3; }
.wa-bubble.stiker { background: transparent; box-shadow: none; }
.wa-anggota { font-size: 12px; font-weight: 700; color: #0e7490; margin-bottom: 2px; }
.wa-kutip { background: rgba(0,0,0,.05); border-left: 3px solid var(--wa-hijau); border-radius: 6px; padding: 4px 8px; margin-bottom: 4px; font-size: 12px; }
.wa-kutip small { display: block; font-weight: 700; color: #166534; }
.wa-kutip span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #475569; }
.wa-teks { white-space: pre-wrap; }
.wa-teks.miring { font-style: italic; color: var(--wa-muted); }
.wa-teks a { color: #0369a1; }
.wa-foto { display: block; max-width: 100%; max-height: 320px; border-radius: 8px; cursor: zoom-in; margin-bottom: 4px; }
.wa-stiker { width: 140px; height: 140px; object-fit: contain; }
.wa-audio { width: 260px; max-width: 100%; }
.wa-media-box { display: block; background: rgba(0,0,0,.05); border: 0; border-radius: 8px; padding: 14px; color: #475569; font-size: 13px; text-align: left; width: 100%; }
.wa-media-box.klik { cursor: pointer; }
.wa-dok { display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,.05); border: 0; border-radius: 8px; padding: 10px; cursor: pointer; text-align: left; width: 100%; margin-bottom: 4px; }
.wa-dok-ikon { font-size: 26px; }
.wa-dok small { display: block; color: var(--wa-muted); font-size: 12px; }
.wa-ulang { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; }
.wa-lokasi { display: block; color: #0369a1; text-decoration: none; margin-bottom: 4px; }
.wa-lokasi small { display: block; color: var(--wa-muted); }
.wa-kontak { margin-bottom: 4px; }
.wa-meta { display: flex; gap: 6px; justify-content: flex-end; align-items: center; font-size: 11px; color: var(--wa-muted); margin-top: 2px; }
.wa-staf { background: rgba(0,0,0,.06); border-radius: 4px; padding: 0 4px; }
.wa-centang.biru { color: #0284c7; }
.wa-reaksi { position: absolute; bottom: -12px; right: 8px; background: #fff; border-radius: 99px; padding: 0 6px; font-size: 13px; box-shadow: 0 1px 2px rgba(0,0,0,.15); }
.wa-aksi { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
.wa-baris:hover .wa-aksi { opacity: 1; }
.wa-aksi button { border: 0; background: rgba(255,255,255,.85); border-radius: 50%; width: 26px; height: 26px; cursor: pointer; font-size: 13px; }

.wa-tulis { background: #f0f2f5; padding: 8px 12px; border-top: 1px solid var(--wa-garis); }
.wa-tulis-kutip { display: flex; justify-content: space-between; gap: 8px; background: #fff; border-left: 3px solid var(--wa-hijau); border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; font-size: 13px; color: #475569; }
.wa-tulis-kutip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-tulis-kutip button { border: 0; background: none; cursor: pointer; }
.wa-err { color: #dc2626; font-size: 13px; margin: 0 0 6px; }
.wa-tulis-baris { display: flex; align-items: flex-end; gap: 6px; }
.wa-tulis-baris textarea { flex: 1; resize: none; border: 0; border-radius: 10px; padding: 10px 12px; font-size: 14px; font-family: inherit; max-height: 140px; min-height: 40px; field-sizing: content; }
.wa-ikon { border: 0; background: none; font-size: 20px; cursor: pointer; padding: 6px; }
.wa-kirim { border: 0; background: var(--wa-hijau); color: #fff; width: 42px; height: 42px; border-radius: 50%; font-size: 18px; cursor: pointer; flex: none; }
.wa-kirim:disabled { opacity: .5; cursor: not-allowed; }
.wa-template-wrap { position: relative; }
.wa-template { position: absolute; bottom: 46px; left: 0; width: 320px; max-height: 320px; overflow-y: auto; background: #fff; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 8px; z-index: 5; }
.wa-template-item { display: flex; gap: 4px; }
.wa-template-pakai { flex: 1; text-align: left; border: 0; background: none; padding: 8px; border-radius: 8px; cursor: pointer; }
.wa-template-pakai:hover { background: #f1f5f9; }
.wa-template-pakai small { display: block; color: var(--wa-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
.wa-template-hapus { border: 0; background: none; cursor: pointer; opacity: .5; }

.wa-modal { position: fixed; inset: 0; background: rgba(15,23,42,.6); display: grid; place-items: center; z-index: 50; padding: 16px; }
.wa-modal-box { background: #fff; border-radius: 14px; padding: 22px; width: min(420px, 100%); text-align: center; }
.wa-modal-box h3 { margin: 0 0 10px; }
.wa-modal-box ol { text-align: left; font-size: 14px; color: #334155; padding-left: 20px; }
.wa-qr { width: 280px; height: 280px; max-width: 100%; margin: 8px auto; display: block; image-rendering: pixelated; }
.wa-foto-besar { max-width: 92vw; max-height: 90vh; border-radius: 8px; }

@media (max-width: 900px) {
  .wa-page { grid-template-columns: 1fr; height: calc(100vh - 100px); }
  .wa-page.ada-chat .wa-side { display: none; }
  .wa-page:not(.ada-chat) .wa-main { display: none; }
  .wa-back { display: block; }
  .wa-pesan { padding: 12px; }
  .wa-bubble { max-width: 85%; }
  .wa-aksi { opacity: 1; }
}
</style>
