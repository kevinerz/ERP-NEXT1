<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { alertError, confirmDialog, pesanGalat, toast } from '@/composables/useDialog'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import GambarChat from './GambarChat.vue'

interface Ruang {
  id_ruang: number; tipe: string; nama: string; subjudul: string; id_lawan: number | null; online: boolean
  bisu: boolean; belum: number; mention: number; urut: number
  terakhir: { id_pesan: number; isi: string; pengirim: string; saya: boolean; waktu: string } | null
}
interface Pesan {
  id_pesan: number; id_ruang: number; id_pengirim: number | null; pengirim: string | null; saya: boolean; sistem: boolean
  isi: string; dihapus: boolean; diedit: boolean; waktu: string; mention: number[]
  lampiran: { nama: string | null; tipe: string | null; ukuran: number | null; gambar: boolean } | null
  balas: { id_pesan: number; pengirim: string; isi: string } | null
  reaksi?: { emoji: string; jumlah: number; saya: boolean; oleh: string[] }[]
  kartu?: { jenis: 'tiket' | 'wo'; kode: string; judul: string; status: string; prioritas: string | null; site: string; url: string }[]
  status?: 'mengirim' | 'gagal'
}
interface Anggota { id_karyawan: number; nama: string; jabatan: string; peran: string; online: boolean }
interface Detail { id_ruang: number; url?: string | null; tipe: string; nama: string | null; bisu: boolean; admin: boolean; anggota: Anggota[] }
interface Orang { id_karyawan: number; nama: string; jabatan: string; departemen: string; online: boolean }

const route = useRoute()
const router = useRouter()
function ikonRuang(r: { tipe: string; nama: string; id_lawan: number | null }) {
  if (r.tipe === 'umum') return '🏢'
  if (r.tipe === 'kanal') return '#'
  if (r.tipe === 'diskusi') return r.nama.startsWith('TKT-') ? '🎫' : '📍'
  return r.id_lawan ? inisial(r.nama) : '👥'
}
const chat = useChatStore()
const auth = useAuthStore()
const saya = computed(() => auth.user?.id_karyawan ?? 0)

// ── Daftar ruang ─────────────────────────────────────────────────────────────
const daftar = ref<Ruang[]>([])
const memuatDaftar = ref(true)
const galatDaftar = ref('')
const idAktif = computed(() => (route.params.id ? Number(route.params.id) : null))
const aktif = computed(() => daftar.value.find((r) => r.id_ruang === idAktif.value) ?? null)
const cariRuang = ref('')
const hasilCari = ref<{ id_pesan: number; id_ruang: number; ruang: string; pengirim: string; isi: string; waktu: string }[]>([])
const mencariPesan = ref(false)

let urutanDaftar = 0
async function muatDaftar(senyap = false) {
  const ke = ++urutanDaftar
  if (!senyap) { memuatDaftar.value = true; galatDaftar.value = '' }
  try {
    const { data } = await api.get('/chat/ruang', senyap ? { senyap: true } : undefined)
    if (ke !== urutanDaftar) return
    daftar.value = data.data
    galatDaftar.value = ''
  } catch (e) {
    if (!senyap && ke === urutanDaftar) galatDaftar.value = pesanGalat(e, 'Gagal memuat obrolan')
  } finally {
    if (ke === urutanDaftar) memuatDaftar.value = false
  }
}
const daftarTampil = computed(() => {
  const q = cariRuang.value.trim().toLowerCase()
  const online = chat.online
  return daftar.value
    .map((r) => (r.id_lawan ? { ...r, online: online.has(r.id_lawan) } : r))
    .filter((r) => !q || r.nama.toLowerCase().includes(q))
})
let timerCari: ReturnType<typeof setTimeout> | undefined
watch(cariRuang, (q) => {
  clearTimeout(timerCari)
  hasilCari.value = []
  if (q.trim().length < 2) { mencariPesan.value = false; return }
  mencariPesan.value = true
  timerCari = setTimeout(async () => {
    try {
      const { data } = await api.get('/chat/cari', { params: { q: q.trim() }, senyap: true })
      if (cariRuang.value === q) hasilCari.value = data.data
    } catch { /* biarkan kosong */ } finally { if (cariRuang.value === q) mencariPesan.value = false }
  }, 350)
})

// ── Format ───────────────────────────────────────────────────────────────────
const WARNA = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#ca8a04', '#4f46e5', '#dc2626', '#0d9488']
const warna = (id: number | null) => WARNA[Math.abs(id ?? 0) % WARNA.length]
const inisial = (n: string | null) => (n ?? '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0] ?? '').join('').toUpperCase()
const jam = (d: string) => new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
const kunciHari = (d: string) => { const t = new Date(d); return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}` }
function labelHari(d: string) {
  const t = new Date(d), n = new Date()
  const selisih = Math.round((+new Date(n.getFullYear(), n.getMonth(), n.getDate()) - +new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86_400_000)
  if (selisih === 0) return 'Hari ini'
  if (selisih === 1) return 'Kemarin'
  return t.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: t.getFullYear() === n.getFullYear() ? undefined : 'numeric' })
}
function waktuDaftar(d: string) {
  const sel = Math.round((+new Date(new Date().toDateString()) - +new Date(new Date(d).toDateString())) / 86_400_000)
  if (sel === 0) return jam(d)
  if (sel === 1) return 'Kemarin'
  if (sel < 7) return new Date(d).toLocaleDateString('id-ID', { weekday: 'short' })
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}
const ukuranTeks = (b: number | null) => (!b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

// ── Pesan ────────────────────────────────────────────────────────────────────
const pesan = ref<Pesan[]>([])
const detail = ref<Detail | null>(null)
const memuatPesan = ref(false)
const galatPesan = ref('')
const masihAda = ref(false)
const memuatLama = ref(false)
const dibaca = ref<{ id_karyawan: number; terakhir_baca_id: number }[]>([])
const gulung = ref<HTMLElement | null>(null)
const pesanBaru = ref(0)
let urutanPesan = 0
let tandaTerakhir = 0

const dekatBawah = () => { const e = gulung.value; return !e || e.scrollHeight - e.scrollTop - e.clientHeight < 140 }
async function gulirBawah(halus = false) {
  await nextTick()
  const e = gulung.value
  if (e) e.scrollTo({ top: e.scrollHeight, behavior: halus ? 'smooth' : 'auto' })
  pesanBaru.value = 0
}

function resetRuang() {
  urutanPesan++
  pesan.value = []; detail.value = null; galatPesan.value = ''; masihAda.value = false; dibaca.value = []
  pesanBaru.value = 0; tandaTerakhir = 0
  Object.assign(komposer, { balas: null, edit: null, lampiran: null, mention: false })
  draft.value = ''; infoBuka.value = false; menuPesan.value = null; emojiBuka.value = false
}

async function bukaRuang(id: number) {
  resetRuang()
  const ke = urutanPesan
  memuatPesan.value = true
  try {
    const { data } = await api.get(`/chat/ruang/${id}/pesan`, { params: { limit: 40 } })
    if (ke !== urutanPesan) return
    pesan.value = data.data.pesan
    masihAda.value = data.data.masih_ada
    dibaca.value = data.data.dibaca
    memuatPesan.value = false
    await gulirBawah()
    tandaiBaca()
    muatDetail(id)
  } catch (e) {
    if (ke === urutanPesan) galatPesan.value = pesanGalat(e, 'Gagal memuat pesan')
  } finally {
    if (ke === urutanPesan) memuatPesan.value = false
  }
}
async function muatDetail(id: number) {
  try {
    const { data } = await api.get(`/chat/ruang/${id}`, { senyap: true })
    if (id === idAktif.value) detail.value = data.data
  } catch { /* daftar anggota hanya untuk mention & info */ }
}

function gabung(list: Pesan[]) {
  const dulu = pesan.value.filter((p) => p.id_pesan > 0).at(-1)?.id_pesan ?? 0
  const peta = new Map(pesan.value.filter((p) => p.id_pesan > 0).map((p) => [p.id_pesan, p]))
  for (const p of list) peta.set(p.id_pesan, p)
  const baru = [...peta.values()].sort((a, b) => a.id_pesan - b.id_pesan)
  pesan.value = [...baru, ...pesan.value.filter((p) => p.id_pesan < 0)]
  return baru.filter((p) => p.id_pesan > dulu && !p.saya).length
}
async function segarkanPesan() {
  const id = idAktif.value
  if (!id || memuatPesan.value) return
  const ke = urutanPesan
  try {
    const { data } = await api.get(`/chat/ruang/${id}/pesan`, { params: { limit: 40 }, senyap: true })
    if (ke !== urutanPesan || id !== idAktif.value) return
    const bawah = dekatBawah()
    const baru = gabung(data.data.pesan)
    dibaca.value = data.data.dibaca
    if (baru) {
      if (bawah) { await gulirBawah(true); tandaiBaca() } else pesanBaru.value += baru
    }
  } catch { /* percobaan berikutnya mengikuti polling */ }
}
async function muatLama() {
  const id = idAktif.value
  const pertama = pesan.value.find((p) => p.id_pesan > 0)
  if (!id || !pertama || memuatLama.value || !masihAda.value) return
  const ke = urutanPesan
  memuatLama.value = true
  const e = gulung.value
  const tinggiLama = e?.scrollHeight ?? 0
  try {
    const { data } = await api.get(`/chat/ruang/${id}/pesan`, { params: { sebelum: pertama.id_pesan, limit: 40 }, senyap: true })
    if (ke !== urutanPesan) return
    pesan.value = [...data.data.pesan, ...pesan.value]
    masihAda.value = data.data.masih_ada
    await nextTick()
    if (e) e.scrollTop = e.scrollHeight - tinggiLama
  } catch (err) {
    toast(pesanGalat(err, 'Gagal memuat pesan lama'), 'warning')
  } finally { memuatLama.value = false }
}
function saatGulung() {
  const e = gulung.value
  if (!e) return
  if (e.scrollTop < 80) muatLama()
  if (dekatBawah() && pesanBaru.value) { pesanBaru.value = 0; tandaiBaca() }
}
function tandaiBaca() {
  const id = idAktif.value
  const terakhir = pesan.value.filter((p) => p.id_pesan > 0).at(-1)?.id_pesan ?? 0
  if (!id || !terakhir || terakhir <= tandaTerakhir) return
  tandaTerakhir = terakhir
  const r = daftar.value.find((x) => x.id_ruang === id)
  if (r) { r.belum = 0; r.mention = 0 }
  api.post(`/chat/ruang/${id}/baca`, { id_pesan: terakhir }, { senyap: true }).then(() => chat.segarkan()).catch(() => { tandaTerakhir = 0 })
}

// Tidak memakai { immediate: true }: resetRuang() menyentuh state (draft, komposer, menuPesan, …) yang dideklarasikan
// di bawah, sehingga memicu "Cannot access before initialization". Pemanggilan awal dilakukan di onMounted.
function saatRuangBerubah(id: number | null | undefined) {
  chat.ruangDilihat = id ?? null
  if (id) bukaRuang(id)
  else resetRuang()
}
watch(idAktif, saatRuangBerubah)

// Polling: ringkasan global berubah → muat ulang daftar / pesan ruang yang terbuka
const snapshot = new Map<number, string>()
let hitung = 0
watch(() => chat.ringkasan, (r) => {
  if (!r) return
  hitung++
  let daftarBerubah = false
  let aktifBerubah = false
  for (const x of r.ruang) {
    const tanda = `${x.terakhir_id}:${x.belum}`
    if (snapshot.get(x.id_ruang) !== tanda) {
      if (snapshot.has(x.id_ruang) || !daftar.value.some((d) => d.id_ruang === x.id_ruang)) daftarBerubah = true
      if (x.id_ruang === idAktif.value && snapshot.get(x.id_ruang)?.split(':')[0] !== String(x.terakhir_id)) aktifBerubah = true
      snapshot.set(x.id_ruang, tanda)
    }
  }
  if (daftarBerubah) muatDaftar(true)
  // tiap ±4 siklus ikut menyegarkan ruang terbuka: suntingan, hapus, dan penanda "dibaca"
  if (aktifBerubah || (idAktif.value && hitung % 4 === 0)) segarkanPesan()
})

// ── Kirim ────────────────────────────────────────────────────────────────────
const draft = ref('')
const komposer = reactive({ balas: null as Pesan | null, edit: null as Pesan | null, lampiran: null as File | null, mention: false })
const kotakTeks = ref<HTMLTextAreaElement | null>(null)
const inputBerkas = ref<HTMLInputElement | null>(null)
const emojiBuka = ref(false)
const EMOJI = ['😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤔', '😅', '😭', '😡', '🙏', '👍', '👎', '👏', '🙌', '💪', '🔥', '🎉', '✅', '❌', '⚠️', '❤️', '💯', '☕', '🍜', '🚀', '📶', '🔧', '👀', '😴', '🤝']
let tmpId = 0
const gagalKirim = new Map<number, { file: File | null; mention: number[]; idBalas?: number }>()

function atasUkuranTeks() {
  const t = kotakTeks.value
  if (!t) return
  t.style.height = 'auto'
  t.style.height = `${Math.min(t.scrollHeight, 140)}px`
}
watch(draft, () => nextTick(atasUkuranTeks))

function pilihBerkas(f: File | null | undefined) {
  if (!f) return
  if (f.size > 10 * 1024 * 1024) { toast('Ukuran berkas maksimal 10 MB', 'warning'); return }
  komposer.lampiran = f
  komposer.edit = null
  kotakTeks.value?.focus()
}
const previewLampiran = computed(() => (komposer.lampiran && komposer.lampiran.type.startsWith('image/') ? URL.createObjectURL(komposer.lampiran) : ''))
watch(previewLampiran, (_n, lama) => { if (lama) URL.revokeObjectURL(lama) })
function saatTempel(e: ClipboardEvent) {
  const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'))
  if (f) { e.preventDefault(); pilihBerkas(new File([f], `gambar-${Date.now()}.${f.type.split('/')[1] || 'png'}`, { type: f.type })) }
}
const seretAktif = ref(false)
function saatLepas(e: DragEvent) { seretAktif.value = false; pilihBerkas(e.dataTransfer?.files?.[0]) }

const ukuranMention = (nama: string) => nama.trim().split(/\s+/)[0] ?? nama
function idMention(teks: string) {
  const hasil: number[] = []
  for (const a of detail.value?.anggota ?? []) {
    if (a.id_karyawan === saya.value) continue
    const depan = ukuranMention(a.nama).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|\\s)@${depan}(?![\\p{L}\\p{N}])`, 'iu').test(teks)) hasil.push(a.id_karyawan)
  }
  return hasil
}

async function kirim() {
  const id = idAktif.value
  const isi = draft.value.trim()
  if (!id) return
  if (komposer.edit) return simpanEdit()
  if (!isi && !komposer.lampiran) return
  const file = komposer.lampiran
  const mention = idMention(isi)
  const balas = komposer.balas
  const tmp: Pesan = {
    id_pesan: --tmpId, id_ruang: id, id_pengirim: saya.value, pengirim: auth.user?.nama_lengkap ?? 'Saya', saya: true, sistem: false,
    isi, dihapus: false, diedit: false, waktu: new Date().toISOString(), mention,
    lampiran: file ? { nama: file.name, tipe: file.type, ukuran: file.size, gambar: false } : null,
    balas: balas ? { id_pesan: balas.id_pesan, pengirim: (balas.pengirim ?? '').split(' ')[0] ?? '', isi: balas.isi.slice(0, 140) } : null,
    status: 'mengirim',
  }
  pesan.value.push(tmp)
  draft.value = ''; komposer.balas = null; komposer.lampiran = null; emojiBuka.value = false
  await gulirBawah(true)
  await kirimKe(tmp.id_pesan, id, isi, file, mention, balas?.id_pesan)
}
async function kirimKe(idTmp: number, idRuang: number, isi: string, file: File | null, mention: number[], idBalas?: number) {
  const tanda = () => pesan.value.find((p) => p.id_pesan === idTmp)
  const t = tanda()
  if (t) t.status = 'mengirim'
  try {
    let hasil: Pesan
    if (file) {
      const f = new FormData()
      f.append('file', file)
      if (isi) f.append('isi', isi)
      if (idBalas) f.append('id_balas', String(idBalas))
      hasil = (await api.post(`/chat/ruang/${idRuang}/berkas`, f, { senyap: true })).data.data
    } else {
      hasil = (await api.post(`/chat/ruang/${idRuang}/pesan`, { isi, id_balas: idBalas, mention }, { senyap: true })).data.data
    }
    gagalKirim.delete(idTmp)
    if (idRuang !== idAktif.value) { muatDaftar(true); return }
    const sisa = pesan.value.filter((p) => p.id_pesan !== idTmp)
    if (!sisa.some((p) => p.id_pesan === hasil.id_pesan)) sisa.push(hasil)
    pesan.value = [...sisa.filter((p) => p.id_pesan > 0).sort((x, y) => x.id_pesan - y.id_pesan), ...sisa.filter((p) => p.id_pesan < 0)]
    tandaTerakhir = Math.max(tandaTerakhir, hasil.id_pesan)
    muatDaftar(true)
    chat.segarkan()
  } catch (e) {
    gagalKirim.set(idTmp, { file, mention, idBalas })
    const x = tanda()
    if (x) x.status = 'gagal'
    toast(pesanGalat(e, 'Pesan belum terkirim'), 'warning')
  }
}
function ulangKirim(p: Pesan) {
  const g = gagalKirim.get(p.id_pesan)
  if (g) kirimKe(p.id_pesan, p.id_ruang, p.isi, g.file, g.mention, g.idBalas)
}
function buangGagal(p: Pesan) { gagalKirim.delete(p.id_pesan); pesan.value = pesan.value.filter((x) => x.id_pesan !== p.id_pesan) }

// Penanda "sedang mengetik" (maks 1× / 3 dtk)
let ketikTerakhir = 0
function saatKetik() {
  atasUkuranTeks()
  cekMention()
  const n = Date.now()
  if (!idAktif.value || n - ketikTerakhir < 3000 || !draft.value.trim()) return
  ketikTerakhir = n
  api.post(`/chat/ruang/${idAktif.value}/mengetik`, {}, { senyap: true }).catch(() => null)
}
const sedangMengetik = computed(() => {
  const n = (chat.ringkasan?.mengetik ?? []).filter((m) => m.id_ruang === idAktif.value).map((m) => m.nama)
  return n.length ? `${n.slice(0, 2).join(' & ')}${n.length > 2 ? ` +${n.length - 2}` : ''} sedang mengetik…` : ''
})

// ── Mention (@) ──────────────────────────────────────────────────────────────
const saranMention = ref<Anggota[]>([])
const indeksMention = ref(0)
function cekMention() {
  const t = kotakTeks.value
  if (!t || !detail.value) { saranMention.value = []; return }
  const sebelum = draft.value.slice(0, t.selectionStart ?? draft.value.length)
  const m = sebelum.match(/(?:^|\s)@([\p{L}\p{N}.'-]*)$/u)
  if (!m) { saranMention.value = []; return }
  const q = m[1]!.toLowerCase()
  saranMention.value = detail.value.anggota.filter((a) => a.id_karyawan !== saya.value && (!q || a.nama.toLowerCase().includes(q))).slice(0, 6)
  indeksMention.value = 0
}
function pilihMention(a: Anggota) {
  const t = kotakTeks.value
  if (!t) return
  const pos = t.selectionStart ?? draft.value.length
  const sebelum = draft.value.slice(0, pos).replace(/@([\p{L}\p{N}.'-]*)$/u, '')
  const sesudah = draft.value.slice(pos)
  const sisip = `@${ukuranMention(a.nama)} `
  draft.value = sebelum + sisip + sesudah
  saranMention.value = []
  nextTick(() => { t.focus(); const p = (sebelum + sisip).length; t.setSelectionRange(p, p) })
}
function tekanKunci(e: KeyboardEvent) {
  if (saranMention.value.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); indeksMention.value = (indeksMention.value + 1) % saranMention.value.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); indeksMention.value = (indeksMention.value - 1 + saranMention.value.length) % saranMention.value.length; return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pilihMention(saranMention.value[indeksMention.value]!); return }
    if (e.key === 'Escape') { saranMention.value = []; return }
  }
  if (e.key === 'Escape') { if (komposer.edit) batalEdit(); else if (komposer.balas) komposer.balas = null; return }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); kirim() }
}

// ── Aksi pesan ───────────────────────────────────────────────────────────────
const menuPesan = ref<number | null>(null)
function mulaiBalas(p: Pesan) { komposer.balas = p; komposer.edit = null; menuPesan.value = null; kotakTeks.value?.focus() }
function mulaiEdit(p: Pesan) {
  komposer.edit = p; komposer.balas = null; komposer.lampiran = null; menuPesan.value = null
  draft.value = p.isi
  nextTick(() => kotakTeks.value?.focus())
}
function batalEdit() { komposer.edit = null; draft.value = '' }
const menyimpan = ref(false)
async function simpanEdit() {
  const p = komposer.edit
  if (!p || menyimpan.value) return
  const isi = draft.value.trim()
  if (!isi && !p.lampiran) return
  if (isi === p.isi) { batalEdit(); return }
  menyimpan.value = true
  try {
    const { data } = await api.patch(`/chat/pesan/${p.id_pesan}`, { isi }, { senyap: true })
    gabung([data.data])
    komposer.edit = null; draft.value = ''
    muatDaftar(true)
  } catch (e) { alertError(e, 'Gagal mengubah pesan') } finally { menyimpan.value = false }
}
async function hapus(p: Pesan) {
  menuPesan.value = null
  if (!(await confirmDialog({ title: 'Hapus pesan?', message: 'Pesan akan dihapus untuk semua orang di obrolan ini.', confirmLabel: 'Hapus', variant: 'danger' }))) return
  try {
    await api.delete(`/chat/pesan/${p.id_pesan}`, { senyap: true })
    const x = pesan.value.find((m) => m.id_pesan === p.id_pesan)
    if (x) { x.dihapus = true; x.isi = ''; x.lampiran = null }
    muatDaftar(true)
  } catch (e) { alertError(e, 'Gagal menghapus pesan') }
}
const EMOJI_REAKSI = ['👍', '❤️', '😂', '🎉', '🙏', '👀', '✅', '🔥']
async function beriReaksi(p: Pesan, emoji: string) {
  menuPesan.value = null
  if (p.id_pesan < 0) return
  try {
    const { data } = await api.post(`/chat/pesan/${p.id_pesan}/reaksi`, { emoji }, { senyap: true })
    const x = pesan.value.find((m) => m.id_pesan === p.id_pesan)
    if (x) x.reaksi = data.data
  } catch (e) { alertError(e, 'Gagal memberi reaksi') }
}

// ── Kudos ────────────────────────────────────────────────────────────────────
interface PapanKudos {
  kategori: string[]; saya_bulan_ini: number
  papan: { peringkat: number; id_karyawan: number; nama: string; jumlah: number }[]
  terbaru: { id_kudos: number; dari: string; untuk: string; kategori: string; pesan: string; waktu: string }[]
}
const kudosBuka = ref(false)
const papan = ref<PapanKudos | null>(null)
const kudos = reactive({ cari: '', hasil: [] as { id_karyawan: number; nama: string; jabatan: string }[], untuk: null as { id_karyawan: number; nama: string } | null, kategori: '', pesan: '', kirim: false })
let timerKudos: ReturnType<typeof setTimeout> | undefined
async function bukaKudos() {
  kudosBuka.value = true
  Object.assign(kudos, { cari: '', hasil: [], untuk: null, kategori: '', pesan: '' })
  try { papan.value = (await api.get('/chat/kudos', { senyap: true })).data.data; kudos.kategori = papan.value?.kategori[0] ?? '' } catch (e) { alertError(e, 'Gagal memuat papan kudos') }
}
function cariKudos() {
  clearTimeout(timerKudos)
  timerKudos = setTimeout(async () => {
    if (kudos.cari.trim().length < 2) { kudos.hasil = []; return }
    try { kudos.hasil = (await api.get('/chat/karyawan', { params: { q: kudos.cari.trim() }, senyap: true })).data.data.slice(0, 6) } catch { kudos.hasil = [] }
  }, 250)
}
async function kirimKudos() {
  if (!kudos.untuk || kudos.pesan.trim().length < 3 || kudos.kirim) return
  kudos.kirim = true
  try {
    const { data } = await api.post('/chat/kudos', { id_untuk: kudos.untuk.id_karyawan, kategori: kudos.kategori, pesan: kudos.pesan.trim() }, { senyap: true })
    toast(`🌟 Kudos terkirim ke ${kudos.untuk.nama.split(' ')[0]}! Sisa jatah hari ini: ${data.data.sisa}`)
    kudosBuka.value = false
    await muatDaftar(true)
    if (data.data.id_ruang) pilihRuang(data.data.id_ruang)
  } catch (e) { alertError(e, 'Gagal mengirim kudos') } finally { kudos.kirim = false }
}

// ── Kanal santai ─────────────────────────────────────────────────────────────
interface Kanal { id_ruang: number; nama: string; jumlah: number; gabung: boolean; deskripsi: string }
const kanalBuka = ref(false)
const kanal = ref<Kanal[]>([])
const kanalMuat = ref(false)
const kanalBaru = ref('')
async function bukaKanal() {
  kanalBuka.value = true; kanalMuat.value = true
  try { kanal.value = (await api.get('/chat/kanal', { senyap: true })).data.data } catch (e) { alertError(e, 'Gagal memuat kanal') } finally { kanalMuat.value = false }
}
async function masukKanal(k: Kanal) {
  try {
    if (!k.gabung) await api.post(`/chat/kanal/${k.id_ruang}/gabung`, {}, { senyap: true })
    kanalBuka.value = false
    await muatDaftar(true)
    pilihRuang(k.id_ruang)
  } catch (e) { alertError(e, 'Gagal bergabung ke kanal') }
}
async function buatKanal() {
  const nama = kanalBaru.value.trim()
  if (nama.length < 2) return
  try {
    const { data } = await api.post('/chat/kanal', { nama }, { senyap: true })
    kanalBaru.value = ''; kanalBuka.value = false
    await muatDaftar(true)
    pilihRuang(data.data.id_ruang)
  } catch (e) { alertError(e, 'Gagal membuat kanal') }
}
async function keluarKanal() {
  if (!aktif.value || aktif.value.tipe !== 'kanal') return
  if (!(await confirmDialog({ title: 'Keluar dari kanal?', message: 'Anda bisa bergabung lagi kapan saja dari daftar kanal.', confirmLabel: 'Keluar' }))) return
  try {
    await api.post(`/chat/kanal/${aktif.value.id_ruang}/keluar`, {}, { senyap: true })
    infoBuka.value = false
    await muatDaftar(true)
    router.push('/chat')
  } catch (e) { alertError(e, 'Gagal keluar dari kanal') }
}

async function salinPesan(p: Pesan) {
  menuPesan.value = null
  try { await navigator.clipboard.writeText(p.isi); toast('Pesan disalin') } catch { toast('Browser menolak menyalin', 'warning') }
}
function lompatKe(id: number) {
  const el = gulung.value?.querySelector(`[data-pesan="${id}"]`) as HTMLElement | null
  if (!el) { toast('Pesan asli ada di riwayat yang lebih lama — gulir ke atas', 'warning'); return }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('sorot')
  setTimeout(() => el.classList.remove('sorot'), 1400)
}
async function unduh(p: Pesan) {
  try {
    const { data } = await api.get(`/chat/berkas/${p.id_pesan}`, { responseType: 'blob', senyap: true })
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = p.lampiran?.nama ?? 'berkas'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch (e) { alertError(e, 'Gagal mengunduh berkas') }
}
const lightbox = ref('')

// ── Tampilan pesan (pengelompokan, tanggal, tautan, mention) ─────────────────
function potong(isi: string) {
  const bagian: { t: 'teks' | 'tautan' | 'mention'; v: string }[] = []
  const nama = new Set((detail.value?.anggota ?? []).map((a) => ukuranMention(a.nama).toLowerCase()))
  const re = /(https?:\/\/[^\s<]+)|(@[\p{L}\p{N}.'-]+)/gu
  let akhir = 0
  for (const m of isi.matchAll(re)) {
    if (m.index! > akhir) bagian.push({ t: 'teks', v: isi.slice(akhir, m.index) })
    if (m[1]) bagian.push({ t: 'tautan', v: m[1] })
    else bagian.push({ t: nama.has(m[2]!.slice(1).toLowerCase()) ? 'mention' : 'teks', v: m[2]! })
    akhir = m.index! + m[0].length
  }
  if (akhir < isi.length) bagian.push({ t: 'teks', v: isi.slice(akhir) })
  return bagian
}
const tampilPesan = computed(() => pesan.value.map((p, i) => {
  const s = pesan.value[i - 1]
  const hariBaru = !s || kunciHari(s.waktu) !== kunciHari(p.waktu)
  return {
    p, hariBaru, label: hariBaru ? labelHari(p.waktu) : '',
    lanjut: !hariBaru && !!s && !p.sistem && !s.sistem && s.id_pengirim === p.id_pengirim && +new Date(p.waktu) - +new Date(s.waktu) < 5 * 60_000,
    segmen: p.isi ? potong(p.isi) : [],
  }
}))
const idSayaTerakhir = computed(() => [...pesan.value].reverse().find((p) => p.saya && p.id_pesan > 0 && !p.dihapus)?.id_pesan ?? 0)
const statusBaca = computed(() => {
  const id = idSayaTerakhir.value
  if (!id || !dibaca.value.length) return ''
  const n = dibaca.value.filter((d) => d.terakhir_baca_id >= id).length
  if (aktif.value?.tipe === 'pribadi') return n ? 'Dibaca' : 'Terkirim'
  return n ? `Dibaca ${n}/${dibaca.value.length}` : 'Terkirim'
})

// ── Info ruang & anggota ─────────────────────────────────────────────────────
const infoBuka = ref(false)
const namaBaru = ref('')
const bekerja = ref(false)
function bukaInfo() { infoBuka.value = true; namaBaru.value = detail.value?.nama ?? aktif.value?.nama ?? ''; if (idAktif.value) muatDetail(idAktif.value) }
async function ubahNama() {
  if (!idAktif.value || bekerja.value || namaBaru.value.trim().length < 2) return
  bekerja.value = true
  try { await api.patch(`/chat/ruang/${idAktif.value}`, { nama: namaBaru.value.trim() }); toast('Nama grup diubah'); await Promise.all([muatDetail(idAktif.value), muatDaftar(true), segarkanPesan()]) }
  catch (e) { alertError(e, 'Gagal mengubah nama') } finally { bekerja.value = false }
}
async function ubahBisu() {
  if (!idAktif.value || !detail.value) return
  const nilai = !detail.value.bisu
  try { await api.post(`/chat/ruang/${idAktif.value}/bisu`, { bisu: nilai }); detail.value.bisu = nilai; muatDaftar(true); chat.segarkan(); toast(nilai ? 'Notifikasi dibisukan' : 'Notifikasi diaktifkan') }
  catch (e) { alertError(e, 'Gagal mengubah pengaturan') }
}
async function keluarkan(a: Anggota) {
  const diriSendiri = a.id_karyawan === saya.value
  if (!(await confirmDialog({ title: diriSendiri ? 'Keluar dari grup?' : `Keluarkan ${a.nama}?`, message: diriSendiri ? 'Anda tidak akan menerima pesan grup ini lagi.' : 'Anggota ini tidak akan bisa membaca grup lagi.', confirmLabel: diriSendiri ? 'Keluar' : 'Keluarkan', variant: 'danger' }))) return
  try {
    await api.delete(`/chat/ruang/${idAktif.value}/anggota/${a.id_karyawan}`)
    if (diriSendiri) { infoBuka.value = false; await muatDaftar(true); router.replace('/chat') }
    else { await Promise.all([muatDetail(idAktif.value!), muatDaftar(true), segarkanPesan()]) }
  } catch (e) { alertError(e, 'Gagal memproses') }
}

// ── Obrolan baru (pribadi / grup / tambah anggota) ───────────────────────────
const baru = reactive({ buka: false, mode: 'pribadi' as 'pribadi' | 'grup' | 'tambah', cari: '', pilih: new Set<number>(), nama: '', daftar: [] as Orang[], memuat: false, galat: '', jalan: false })
async function bukaBaru(mode: 'pribadi' | 'grup' | 'tambah') {
  Object.assign(baru, { buka: true, mode, cari: '', pilih: new Set<number>(), nama: '', galat: '', memuat: true })
  try {
    const { data } = await api.get('/chat/karyawan')
    baru.daftar = data.data
  } catch (e) { baru.galat = pesanGalat(e, 'Gagal memuat daftar karyawan') } finally { baru.memuat = false }
}
const orangTampil = computed(() => {
  const q = baru.cari.trim().toLowerCase()
  const sudah = new Set(baru.mode === 'tambah' ? (detail.value?.anggota ?? []).map((a) => a.id_karyawan) : [])
  return baru.daftar
    .filter((o) => !sudah.has(o.id_karyawan) && (!q || `${o.nama} ${o.jabatan} ${o.departemen}`.toLowerCase().includes(q)))
    .map((o) => ({ ...o, online: chat.online.has(o.id_karyawan) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.nama.localeCompare(b.nama))
})
function togglePilih(id: number) { const s = new Set(baru.pilih); s.has(id) ? s.delete(id) : s.add(id); baru.pilih = s }
async function mulaiPribadi(o: Orang) {
  if (baru.jalan) return
  baru.jalan = true
  try {
    const { data } = await api.post('/chat/ruang/pribadi', { id_karyawan: o.id_karyawan })
    baru.buka = false
    await muatDaftar(true)
    router.push(`/chat/${data.data.id_ruang}`)
  } catch (e) { baru.galat = pesanGalat(e, 'Gagal membuka obrolan') } finally { baru.jalan = false }
}
async function buatGrup() {
  if (baru.jalan || baru.nama.trim().length < 2 || !baru.pilih.size) return
  baru.jalan = true
  baru.galat = ''
  try {
    const { data } = await api.post('/chat/ruang/grup', { nama: baru.nama.trim(), anggota: [...baru.pilih] })
    baru.buka = false
    await muatDaftar(true)
    router.push(`/chat/${data.data.id_ruang}`)
  } catch (e) { baru.galat = pesanGalat(e, 'Gagal membuat grup') } finally { baru.jalan = false }
}
async function tambahAnggota() {
  if (baru.jalan || !baru.pilih.size || !idAktif.value) return
  baru.jalan = true
  baru.galat = ''
  try {
    await api.post(`/chat/ruang/${idAktif.value}/anggota`, { anggota: [...baru.pilih] })
    baru.buka = false
    toast('Anggota ditambahkan')
    await Promise.all([muatDetail(idAktif.value), muatDaftar(true), segarkanPesan()])
  } catch (e) { baru.galat = pesanGalat(e, 'Gagal menambah anggota') } finally { baru.jalan = false }
}

// ── Notifikasi desktop ───────────────────────────────────────────────────────
const izin = ref(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
async function aktifkanNotif() {
  if (typeof Notification === 'undefined') return
  izin.value = await Notification.requestPermission()
  if (izin.value === 'granted') {
    const ok = await chat.pastikanPush()
    toast(ok ? 'Notifikasi aktif — pesan tetap sampai walau tab ditutup' : 'Notifikasi desktop aktif (selama tab terbuka)')
  }
}

function kembali() { router.push('/chat') }
function pilihRuang(id: number) { if (id !== idAktif.value) router.push(`/chat/${id}`) }
function saatKlikHasil(h: { id_ruang: number }) { cariRuang.value = ''; pilihRuang(h.id_ruang) }
function tutupMenu(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (!t.closest('.cv-menu') && !t.closest('.cv-menu-tombol')) menuPesan.value = null
  if (!t.closest('.cv-emoji') && !t.closest('.cv-emoji-tombol')) emojiBuka.value = false
}

onMounted(() => {
  chat.setCepat(true)
  document.addEventListener('click', tutupMenu)
  saatRuangBerubah(idAktif.value)
  muatDaftar()
})
onBeforeUnmount(() => {
  chat.setCepat(false)
  chat.ruangDilihat = null
  document.removeEventListener('click', tutupMenu)
  clearTimeout(timerCari)
})
</script>

<template>
  <div class="cv" :class="{ 'cv-buka': !!idAktif }">
    <!-- ═══ DAFTAR OBROLAN ═══ -->
    <aside class="cv-daftar" aria-label="Daftar obrolan">
      <div class="cv-daftar-kepala">
        <h2>💬 Obrolan</h2>
        <div class="cv-aksi">
          <button type="button" class="cv-ikon" title="Obrolan baru" @click="bukaBaru('pribadi')">✏️</button>
          <button type="button" class="cv-ikon" title="Grup baru" @click="bukaBaru('grup')">👥</button>
          <button type="button" class="cv-ikon" title="Jelajahi kanal santai" @click="bukaKanal">#</button>
          <button type="button" class="cv-ikon" title="Beri kudos ke rekan" @click="bukaKudos">🌟</button>
        </div>
      </div>
      <div class="cv-cari"><input v-model="cariRuang" type="search" placeholder="Cari obrolan atau pesan…" aria-label="Cari obrolan" /></div>
      <button v-if="izin === 'default'" type="button" class="cv-izin" @click="aktifkanNotif">🔔 Aktifkan notifikasi desktop</button>

      <div class="cv-daftar-isi">
        <div v-if="memuatDaftar" class="cv-rangka" aria-busy="true"><div v-for="i in 6" :key="i" class="rangka" :style="{ height: '52px' }"></div></div>
        <div v-else-if="galatDaftar" class="galat-state" role="alert">
          <div class="galat-judul">Gagal memuat obrolan</div><div>{{ galatDaftar }}</div>
          <button type="button" class="btn btn-secondary btn-sm" @click="muatDaftar()">↻ Coba lagi</button>
        </div>
        <template v-else>
          <button
            v-for="r in daftarTampil" :key="r.id_ruang" type="button" class="cv-ruang"
            :class="{ aktif: r.id_ruang === idAktif, belum: r.belum > 0 }" @click="pilihRuang(r.id_ruang)"
          >
            <span class="cv-avatar" :class="{ grup: !r.id_lawan }" :style="{ background: r.id_lawan ? warna(r.id_lawan) : r.tipe === 'umum' ? '#0f766e' : '#475569' }">
              {{ ikonRuang(r) }}
              <i v-if="r.id_lawan && r.online" class="cv-online" aria-label="online"></i>
            </span>
            <span class="cv-ruang-teks">
              <span class="cv-baris1"><b>{{ r.nama }}</b><small v-if="r.terakhir">{{ waktuDaftar(r.terakhir.waktu) }}</small></span>
              <span class="cv-baris2">
                <span class="cv-cuplikan">
                  <template v-if="r.terakhir"><template v-if="r.terakhir.saya">Anda: </template><template v-else-if="r.terakhir.pengirim && r.tipe !== 'pribadi'">{{ r.terakhir.pengirim }}: </template>{{ r.terakhir.isi }}</template>
                  <template v-else><i>{{ r.subjudul || 'Belum ada pesan' }}</i></template>
                </span>
                <span v-if="r.mention" class="cv-lencana mention" title="Anda disebut">@</span>
                <span v-if="r.belum" class="cv-lencana" :class="{ bisu: r.bisu }">{{ r.belum > 99 ? '99+' : r.belum }}</span>
                <span v-else-if="r.bisu" class="cv-bisu" title="Dibisukan">🔕</span>
              </span>
            </span>
          </button>
          <p v-if="!daftarTampil.length && !cariRuang" class="cv-kosong-kecil">Belum ada obrolan.</p>

          <div v-if="cariRuang.trim().length >= 2" class="cv-hasil">
            <div class="cv-hasil-judul">Pesan yang cocok</div>
            <div v-if="mencariPesan" class="cv-kosong-kecil">Mencari…</div>
            <button v-for="h in hasilCari" :key="h.id_pesan" type="button" class="cv-hasil-baris" @click="saatKlikHasil(h)">
              <b>{{ h.ruang }}</b><small>{{ h.pengirim }} · {{ waktuDaftar(h.waktu) }}</small><span>{{ h.isi }}</span>
            </button>
            <p v-if="!mencariPesan && !hasilCari.length" class="cv-kosong-kecil">Tidak ada pesan yang cocok.</p>
          </div>
        </template>
      </div>
    </aside>

    <!-- ═══ PERCAKAPAN ═══ -->
    <section class="cv-panel" aria-label="Percakapan">
      <div v-if="!idAktif" class="cv-selamat">
        <div class="cv-selamat-ikon">💬</div>
        <h3>Obrolan Tim NextOne</h3>
        <p>Pilih obrolan di kiri, atau mulai yang baru.<br />Sebut rekan dengan <b>@nama</b>, kirim foto dengan menempel (Ctrl+V) atau menyeret berkas.</p>
        <div class="cv-selamat-aksi">
          <button type="button" class="btn btn-primary" @click="bukaBaru('pribadi')">✏️ Pesan baru</button>
          <button type="button" class="btn btn-secondary" @click="bukaBaru('grup')">👥 Grup baru</button>
        </div>
      </div>

      <template v-else>
        <header class="cv-kepala">
          <button type="button" class="cv-kembali" aria-label="Kembali ke daftar" @click="kembali">‹</button>
          <span v-if="aktif" class="cv-avatar kecil" :style="{ background: aktif.id_lawan ? warna(aktif.id_lawan) : aktif.tipe === 'umum' ? '#0f766e' : '#475569' }">
            {{ ikonRuang(aktif) }}
            <i v-if="aktif.id_lawan && chat.online.has(aktif.id_lawan)" class="cv-online"></i>
          </span>
          <div class="cv-kepala-teks">
            <b>{{ aktif?.nama ?? 'Obrolan' }}</b>
            <small>
              <template v-if="sedangMengetik"><span class="cv-ketik">{{ sedangMengetik }}</span></template>
              <template v-else-if="aktif?.id_lawan">{{ chat.online.has(aktif.id_lawan) ? '🟢 Online' : aktif.subjudul }}</template>
              <template v-else>{{ aktif?.subjudul }}</template>
            </small>
          </div>
          <button type="button" class="cv-ikon" title="Info & anggota" @click="bukaInfo">ⓘ</button>
        </header>

        <div
          ref="gulung" class="cv-pesan" :class="{ seret: seretAktif }" @scroll.passive="saatGulung"
          @dragover.prevent="seretAktif = true" @dragleave.prevent="seretAktif = false" @drop.prevent="saatLepas"
        >
          <div v-if="seretAktif" class="cv-lepas">📎 Lepas berkas untuk melampirkan</div>
          <div v-if="memuatPesan" class="cv-rangka" aria-busy="true"><div v-for="i in 5" :key="i" class="rangka" :style="{ height: '38px', width: `${70 - i * 8}%`, alignSelf: i % 2 ? 'flex-start' : 'flex-end' }"></div></div>
          <div v-else-if="galatPesan" class="galat-state" role="alert">
            <div class="galat-judul">Gagal memuat pesan</div><div>{{ galatPesan }}</div>
            <button type="button" class="btn btn-secondary btn-sm" @click="idAktif && bukaRuang(idAktif)">↻ Coba lagi</button>
          </div>
          <template v-else>
            <div v-if="masihAda" class="cv-lama"><button type="button" class="btn btn-ghost btn-sm" :disabled="memuatLama" @click="muatLama">{{ memuatLama ? 'Memuat…' : '↑ Muat pesan lebih lama' }}</button></div>
            <p v-else-if="!pesan.length" class="cv-awal">Belum ada pesan. Sapa duluan 👋</p>
            <template v-for="t in tampilPesan" :key="t.p.id_pesan">
              <div v-if="t.hariBaru" class="cv-hari"><span>{{ t.label }}</span></div>
              <div v-if="t.p.sistem" class="cv-sistem">{{ t.p.isi }}</div>
              <div v-else class="cv-baris" :class="{ saya: t.p.saya, lanjut: t.lanjut }" :data-pesan="t.p.id_pesan">
                <span v-if="!t.p.saya" class="cv-avatar kecil" :class="{ tersembunyi: t.lanjut }" :style="{ background: warna(t.p.id_pengirim) }">{{ inisial(t.p.pengirim) }}</span>
                <div class="cv-gelembung" :class="{ gagal: t.p.status === 'gagal', mengirim: t.p.status === 'mengirim', dihapus: t.p.dihapus }">
                  <div v-if="!t.p.saya && !t.lanjut && aktif?.tipe !== 'pribadi'" class="cv-pengirim" :style="{ color: warna(t.p.id_pengirim) }">{{ t.p.pengirim }}</div>
                  <button v-if="t.p.balas && !t.p.dihapus" type="button" class="cv-kutip" @click="lompatKe(t.p.balas.id_pesan)"><b>{{ t.p.balas.pengirim }}</b><span>{{ t.p.balas.isi }}</span></button>
                  <div v-if="t.p.dihapus" class="cv-teks"><i>🚫 Pesan ini telah dihapus</i></div>
                  <template v-else>
                    <GambarChat v-if="t.p.lampiran?.gambar && t.p.id_pesan > 0" :id="t.p.id_pesan" :nama="t.p.lampiran.nama" @buka="(u) => (lightbox = u)" />
                    <button v-else-if="t.p.lampiran" type="button" class="cv-berkas" :disabled="t.p.id_pesan < 0" @click="unduh(t.p)">
                      <span>📄</span><span class="cv-berkas-teks"><b>{{ t.p.lampiran.nama }}</b><small>{{ ukuranTeks(t.p.lampiran.ukuran) }} · klik untuk unduh</small></span>
                    </button>
                    <div v-if="t.segmen.length" class="cv-teks"><template v-for="(s, i) in t.segmen" :key="i"><a v-if="s.t === 'tautan'" :href="s.v" target="_blank" rel="noopener noreferrer">{{ s.v }}</a><span v-else-if="s.t === 'mention'" class="cv-sebut">{{ s.v }}</span><template v-else>{{ s.v }}</template></template></div>
                    <div v-if="t.p.kartu?.length" class="cv-kartu-daftar">
                      <RouterLink v-for="k in t.p.kartu" :key="k.kode" :to="k.url" class="cv-kartu" :class="`j-${k.jenis}`">
                        <span class="cv-kartu-ikon">{{ k.jenis === 'tiket' ? '🎫' : '🛠️' }}</span>
                        <span class="cv-kartu-isi"><b>{{ k.kode }}</b><span>{{ k.judul }}</span><small>{{ k.site }}<template v-if="k.site"> · </template>{{ k.status.replace(/_/g, ' ') }}<template v-if="k.prioritas"> · {{ k.prioritas }}</template></small></span>
                      </RouterLink>
                    </div>
                  </template>
                  <div v-if="t.p.reaksi?.length" class="cv-reaksi">
                    <button v-for="x in t.p.reaksi" :key="x.emoji" type="button" class="cv-reaksi-chip" :class="{ saya: x.saya }" :title="x.oleh.join(', ')" @click="beriReaksi(t.p, x.emoji)">{{ x.emoji }} {{ x.jumlah }}</button>
                  </div>
                  <div class="cv-meta">
                    <span v-if="t.p.diedit && !t.p.dihapus">diedit · </span>{{ jam(t.p.waktu) }}
                    <template v-if="t.p.status === 'mengirim'"> · mengirim…</template>
                    <template v-if="t.p.saya && t.p.id_pesan === idSayaTerakhir && statusBaca"> · {{ statusBaca }}</template>
                  </div>
                  <div v-if="t.p.status === 'gagal'" class="cv-gagal">Belum terkirim <button type="button" @click="ulangKirim(t.p)">Coba lagi</button> · <button type="button" @click="buangGagal(t.p)">Buang</button></div>
                  <button v-if="t.p.id_pesan > 0 && !t.p.dihapus" type="button" class="cv-menu-tombol" aria-label="Menu pesan" @click.stop="menuPesan = menuPesan === t.p.id_pesan ? null : t.p.id_pesan">⌄</button>
                  <div v-if="menuPesan === t.p.id_pesan" class="cv-menu" role="menu">
                    <div class="cv-emoji-baris"><button v-for="e in EMOJI_REAKSI" :key="e" type="button" :aria-label="`Reaksi ${e}`" @click="beriReaksi(t.p, e)">{{ e }}</button></div>
                    <button type="button" @click="mulaiBalas(t.p)">↩️ Balas</button>
                    <button v-if="t.p.isi" type="button" @click="salinPesan(t.p)">📋 Salin</button>
                    <button v-if="t.p.saya && t.p.isi" type="button" @click="mulaiEdit(t.p)">✏️ Ubah</button>
                    <button v-if="t.p.saya || detail?.admin" type="button" class="bahaya" @click="hapus(t.p)">🗑️ Hapus</button>
                  </div>
                </div>
              </div>
            </template>
          </template>
          <button v-if="pesanBaru" type="button" class="cv-turun" @click="gulirBawah(true); tandaiBaca()">↓ {{ pesanBaru }} pesan baru</button>
        </div>

        <!-- Penulis pesan -->
        <footer class="cv-tulis">
          <div v-if="komposer.balas" class="cv-konteks"><span>↩️ Membalas <b>{{ komposer.balas.pengirim }}</b>: {{ komposer.balas.isi.slice(0, 80) || '📎 lampiran' }}</span><button type="button" aria-label="Batal balas" @click="komposer.balas = null">✕</button></div>
          <div v-if="komposer.edit" class="cv-konteks edit"><span>✏️ Mengubah pesan</span><button type="button" aria-label="Batal ubah" @click="batalEdit">✕</button></div>
          <div v-if="komposer.lampiran" class="cv-lampiran">
            <img v-if="previewLampiran" :src="previewLampiran" alt="Pratinjau" />
            <span v-else>📄</span>
            <span class="cv-lampiran-teks"><b>{{ komposer.lampiran.name }}</b><small>{{ ukuranTeks(komposer.lampiran.size) }}</small></span>
            <button type="button" aria-label="Buang lampiran" @click="komposer.lampiran = null">✕</button>
          </div>
          <div v-if="saranMention.length" class="cv-saran" role="listbox">
            <button v-for="(a, i) in saranMention" :key="a.id_karyawan" type="button" :class="{ on: i === indeksMention }" @mousedown.prevent="pilihMention(a)">
              <span class="cv-avatar kecil" :style="{ background: warna(a.id_karyawan) }">{{ inisial(a.nama) }}</span>{{ a.nama }}<small>{{ a.jabatan }}</small>
            </button>
          </div>
          <div class="cv-kotak">
            <input ref="inputBerkas" type="file" hidden @change="pilihBerkas(($event.target as HTMLInputElement).files?.[0]); ($event.target as HTMLInputElement).value = ''" />
            <button type="button" class="cv-ikon" title="Lampirkan berkas" :disabled="!!komposer.edit" @click="inputBerkas?.click()">📎</button>
            <div class="cv-emoji-bungkus">
              <button type="button" class="cv-ikon cv-emoji-tombol" title="Emoji" @click="emojiBuka = !emojiBuka">😊</button>
              <div v-if="emojiBuka" class="cv-emoji"><button v-for="e in EMOJI" :key="e" type="button" @click="draft += e; kotakTeks?.focus()">{{ e }}</button></div>
            </div>
            <textarea
              ref="kotakTeks" v-model="draft" rows="1" maxlength="4000" class="cv-input" aria-label="Tulis pesan"
              :placeholder="komposer.edit ? 'Ubah pesan…' : 'Tulis pesan… (Enter kirim, Shift+Enter baris baru, @ untuk menyebut)'"
              @input="saatKetik" @keydown="tekanKunci" @click="cekMention" @paste="saatTempel"
            ></textarea>
            <button type="button" class="cv-kirim" :disabled="(!draft.trim() && !komposer.lampiran) || menyimpan" :aria-label="komposer.edit ? 'Simpan perubahan' : 'Kirim'" @click="kirim">{{ komposer.edit ? '✓' : '➤' }}</button>
          </div>
        </footer>
      </template>
    </section>

    <!-- ═══ KUDOS ═══ -->
    <div v-if="kudosBuka" class="modal-overlay" @click.self="kudosBuka = false">
      <div class="modal-content" style="max-width: 520px">
        <div class="modal-header"><h3 class="modal-title">🌟 Kudos</h3><button type="button" class="btn-modal-close" aria-label="Tutup" @click="kudosBuka = false">×</button></div>
        <div class="modal-body">
          <p class="cv-redup">Apresiasi rekan yang membantu Anda. Kudos tampil di ruang "Semua Karyawan" (maks. 5 per hari).</p>
          <div v-if="kudos.untuk" class="cv-kudos-pilih"><b>{{ kudos.untuk.nama }}</b><button type="button" class="btn btn-ghost btn-sm" @click="kudos.untuk = null">Ganti</button></div>
          <template v-else>
            <input v-model="kudos.cari" class="form-control" placeholder="Cari nama rekan…" @input="cariKudos" />
            <button v-for="h in kudos.hasil" :key="h.id_karyawan" type="button" class="cv-kanal-baris" @click="kudos.untuk = h"><span class="cv-kanal-nama">{{ h.nama }}</span><small>{{ h.jabatan }}</small></button>
          </template>
          <div class="cv-kudos-kat"><button v-for="k in papan?.kategori ?? []" :key="k" type="button" class="cv-reaksi-chip" :class="{ saya: kudos.kategori === k }" @click="kudos.kategori = k">{{ k }}</button></div>
          <textarea v-model="kudos.pesan" class="form-control" rows="3" maxlength="300" placeholder="Ceritakan apa yang bikin Anda terkesan…"></textarea>
          <button type="button" class="btn btn-primary" style="margin-top: 10px" :disabled="!kudos.untuk || kudos.pesan.trim().length < 3 || kudos.kirim" @click="kirimKudos">{{ kudos.kirim ? 'Mengirim…' : 'Kirim kudos 🌟' }}</button>
          <div v-if="papan" class="cv-kudos-papan">
            <h4>Papan bulan ini</h4>
            <p v-if="!papan.papan.length" class="cv-redup">Belum ada kudos bulan ini — jadilah yang pertama!</p>
            <div v-for="b in papan.papan" :key="b.id_karyawan" class="cv-kudos-baris"><span>{{ b.peringkat === 1 ? '🥇' : b.peringkat === 2 ? '🥈' : b.peringkat === 3 ? '🥉' : b.peringkat + '.' }} {{ b.nama }}</span><b>{{ b.jumlah }}</b></div>
            <p class="cv-redup">Anda menerima {{ papan.saya_bulan_ini }} kudos bulan ini.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ KANAL ═══ -->
    <div v-if="kanalBuka" class="modal-overlay" @click.self="kanalBuka = false">
      <div class="modal-content" style="max-width: 460px">
        <div class="modal-header"><h3 class="modal-title"># Kanal santai</h3><button type="button" class="btn-modal-close" aria-label="Tutup" @click="kanalBuka = false">×</button></div>
        <div class="modal-body">
          <p v-if="kanalMuat" class="cv-redup">Memuat…</p>
          <button v-for="k in kanal" :key="k.id_ruang" type="button" class="cv-kanal-baris" @click="masukKanal(k)">
            <span class="cv-kanal-nama"># {{ k.nama }}</span>
            <small>{{ k.deskripsi || 'Kanal buatan karyawan' }} · {{ k.jumlah }} anggota</small>
            <span class="badge" :class="k.gabung ? 'badge-green' : 'badge-blue'">{{ k.gabung ? 'Buka' : 'Gabung' }}</span>
          </button>
          <div class="cv-kanal-buat">
            <input v-model="kanalBaru" class="form-control" maxlength="40" placeholder="Buat kanal baru, mis. futsal-jumat" @keydown.enter.prevent="buatKanal" />
            <button type="button" class="btn btn-primary btn-sm" :disabled="kanalBaru.trim().length < 2" @click="buatKanal">Buat</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ INFO RUANG ═══ -->
    <div v-if="infoBuka" class="modal-overlay" @click.self="infoBuka = false">
      <div v-focus-trap class="modal">
        <div class="modal-header"><h3 class="modal-title">{{ detail?.tipe === 'pribadi' ? 'Info kontak' : 'Info grup' }}</h3><button type="button" class="btn-modal-close" aria-label="Tutup" @click="infoBuka = false">×</button></div>
        <div class="modal-body cv-info">
          <template v-if="detail">
            <div v-if="detail.tipe === 'grup' && detail.admin" class="cv-info-nama">
              <input v-model="namaBaru" class="form-input" maxlength="100" aria-label="Nama grup" />
              <button type="button" class="btn btn-primary btn-sm" :disabled="bekerja || namaBaru.trim().length < 2 || namaBaru.trim() === detail.nama" @click="ubahNama">Simpan nama</button>
            </div>
            <h4 v-else class="cv-info-judul">{{ aktif?.nama }}</h4>
            <label class="cv-info-bisu"><input type="checkbox" :checked="detail.bisu" @change="ubahBisu" /> 🔕 Bisukan notifikasi obrolan ini</label>
            <div class="cv-info-kepala"><b>{{ detail.anggota.length }} anggota</b><button v-if="detail.admin" type="button" class="btn btn-secondary btn-sm" @click="bukaBaru('tambah')">+ Tambah</button></div>
            <ul class="cv-anggota">
              <li v-for="a in detail.anggota" :key="a.id_karyawan">
                <span class="cv-avatar kecil" :style="{ background: warna(a.id_karyawan) }">{{ inisial(a.nama) }}<i v-if="chat.online.has(a.id_karyawan)" class="cv-online"></i></span>
                <span class="cv-anggota-teks"><b>{{ a.nama }}<em v-if="a.id_karyawan === saya"> (Anda)</em></b><small>{{ a.jabatan }}</small></span>
                <span v-if="a.peran === 'admin' && detail.tipe === 'grup'" class="badge badge-blue">Admin</span>
                <button v-if="detail.tipe === 'grup' && (detail.admin || a.id_karyawan === saya)" type="button" class="btn btn-ghost btn-sm" @click="keluarkan(a)">{{ a.id_karyawan === saya ? 'Keluar' : 'Keluarkan' }}</button>
              </li>
            </ul>
            <p v-if="detail.tipe === 'kanal'" class="cv-redup">Kanal terbuka: semua staf boleh bergabung dan keluar sendiri. <button type="button" class="btn btn-ghost btn-sm" @click="keluarKanal">Keluar dari kanal</button></p>
            <p v-if="detail.tipe === 'diskusi'" class="cv-redup">Ruang diskusi ini terbuka untuk semua staf; siapa pun yang membukanya dari tiket/site otomatis bergabung. <RouterLink v-if="detail.url" :to="detail.url" @click="infoBuka = false">Buka halaman terkait →</RouterLink></p>
            <p v-if="detail.tipe === 'umum' || detail.tipe === 'divisi'" class="cv-redup">Ruang ini dibuat otomatis dan semua karyawan terkait masuk sendiri.</p>
          </template>
          <div v-else class="loading-state">Memuat…</div>
        </div>
      </div>
    </div>

    <!-- ═══ OBROLAN / GRUP BARU / TAMBAH ANGGOTA ═══ -->
    <div v-if="baru.buka" class="modal-overlay" @click.self="baru.buka = false">
      <div v-focus-trap class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ baru.mode === 'pribadi' ? 'Pesan baru' : baru.mode === 'grup' ? 'Grup baru' : 'Tambah anggota' }}</h3>
          <button type="button" class="btn-modal-close" aria-label="Tutup" @click="baru.buka = false">×</button>
        </div>
        <div class="modal-body cv-baru">
          <div v-if="baru.mode !== 'tambah'" class="cv-tab" role="tablist">
            <button type="button" :class="{ on: baru.mode === 'pribadi' }" @click="baru.mode = 'pribadi'; baru.pilih = new Set()">Pribadi</button>
            <button type="button" :class="{ on: baru.mode === 'grup' }" @click="baru.mode = 'grup'">Grup</button>
          </div>
          <input v-if="baru.mode === 'grup'" v-model="baru.nama" class="form-input" maxlength="100" placeholder="Nama grup, mis. Tim NOC Shift Malam" aria-label="Nama grup" />
          <input v-model="baru.cari" class="form-input" placeholder="Cari nama, jabatan, atau divisi…" aria-label="Cari karyawan" />
          <div v-if="baru.mode !== 'pribadi' && baru.pilih.size" class="cv-dipilih"><span v-for="id in baru.pilih" :key="id" class="cv-chip">{{ baru.daftar.find((o) => o.id_karyawan === id)?.nama.split(' ')[0] }} <button type="button" aria-label="Batalkan" @click="togglePilih(id)">×</button></span></div>
          <div class="cv-orang">
            <div v-if="baru.memuat" class="loading-state">Memuat karyawan…</div>
            <p v-else-if="!orangTampil.length" class="cv-kosong-kecil">Tidak ada karyawan yang cocok.</p>
            <button v-for="o in orangTampil" :key="o.id_karyawan" type="button" class="cv-orang-baris" :class="{ on: baru.pilih.has(o.id_karyawan) }" :disabled="baru.jalan" @click="baru.mode === 'pribadi' ? mulaiPribadi(o) : togglePilih(o.id_karyawan)">
              <span class="cv-avatar kecil" :style="{ background: warna(o.id_karyawan) }">{{ inisial(o.nama) }}<i v-if="o.online" class="cv-online"></i></span>
              <span class="cv-anggota-teks"><b>{{ o.nama }}</b><small>{{ o.jabatan }} · {{ o.departemen }}</small></span>
              <span v-if="baru.mode !== 'pribadi'" class="cv-cek" :class="{ on: baru.pilih.has(o.id_karyawan) }">{{ baru.pilih.has(o.id_karyawan) ? '✓' : '' }}</span>
            </button>
          </div>
          <div v-if="baru.galat" class="alert alert-danger">{{ baru.galat }}</div>
        </div>
        <div v-if="baru.mode !== 'pribadi'" class="modal-footer">
          <button type="button" class="btn btn-ghost" @click="baru.buka = false">Batal</button>
          <button v-if="baru.mode === 'grup'" type="button" class="btn btn-primary" :disabled="baru.jalan || baru.nama.trim().length < 2 || !baru.pilih.size" @click="buatGrup">{{ baru.jalan ? 'Membuat…' : `Buat grup (${baru.pilih.size})` }}</button>
          <button v-else type="button" class="btn btn-primary" :disabled="baru.jalan || !baru.pilih.size" @click="tambahAnggota">{{ baru.jalan ? 'Menambah…' : `Tambahkan (${baru.pilih.size})` }}</button>
        </div>
      </div>
    </div>

    <!-- Pratinjau gambar -->
    <div v-if="lightbox" class="cv-lightbox" role="dialog" aria-label="Pratinjau gambar" @click="lightbox = ''">
      <img :src="lightbox" alt="Gambar" />
      <button type="button" aria-label="Tutup" @click="lightbox = ''">×</button>
    </div>
  </div>
</template>

<style scoped>
.cv { --biru: #2563eb; --biru-tua: #1e40af; --garis: #e2e8f0; --abu: #64748b; display: grid; grid-template-columns: 340px minmax(0, 1fr); height: calc(100dvh - 118px); min-height: 520px; background: #fff; border: 1px solid var(--garis); border-radius: 16px; overflow: hidden; box-shadow: 0 6px 24px rgba(15, 23, 42, .06); }
/* Daftar */
.cv-daftar { display: flex; flex-direction: column; border-right: 1px solid var(--garis); min-height: 0; background: #fbfcfe; }
.cv-daftar-kepala { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 6px; }
.cv-daftar-kepala h2 { margin: 0; font-size: 18px; }
.cv-aksi { display: flex; gap: 4px; }
.cv-ikon { background: none; border: 0; width: 34px; height: 34px; border-radius: 10px; font-size: 17px; cursor: pointer; color: var(--abu); display: inline-flex; align-items: center; justify-content: center; transition: background .15s; }
.cv-ikon:hover:not(:disabled) { background: #e8eefc; }
.cv-ikon:disabled { opacity: .4; cursor: default; }
.cv-cari { padding: 6px 14px 10px; }
.cv-cari input { width: 100%; box-sizing: border-box; padding: 9px 14px; border: 1px solid var(--garis); border-radius: 999px; font-size: 13.5px; background: #fff; }
.cv-cari input:focus { outline: 2px solid #bfdbfe; border-color: var(--biru); }
.cv-izin { margin: 0 14px 8px; padding: 7px 12px; border: 1px dashed #93c5fd; background: #eff6ff; color: var(--biru-tua); border-radius: 10px; font-size: 12.5px; cursor: pointer; text-align: left; }
.cv-daftar-isi { flex: 1; overflow-y: auto; padding: 0 8px 10px; }
.cv-rangka { display: flex; flex-direction: column; gap: 10px; padding: 10px 6px; }
.cv-ruang { display: flex; gap: 11px; width: 100%; padding: 10px; border: 0; background: none; border-radius: 12px; text-align: left; cursor: pointer; align-items: center; font: inherit; transition: background .12s; }
.cv-ruang:hover { background: #eef3fd; }
.cv-ruang.aktif { background: #dbe7ff; }
.cv-avatar { position: relative; flex: none; width: 44px; height: 44px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 15px; display: inline-flex; align-items: center; justify-content: center; letter-spacing: .3px; }
.cv-avatar.kecil { width: 34px; height: 34px; font-size: 12.5px; }
.cv-avatar.tersembunyi { visibility: hidden; }
.cv-online { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; border-radius: 50%; background: #22c55e; border: 2px solid #fff; }
.cv-ruang-teks { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cv-baris1, .cv-baris2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.cv-baris1 b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-baris1 small { color: var(--abu); font-size: 11.5px; flex: none; }
.cv-cuplikan { font-size: 12.5px; color: var(--abu); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.cv-ruang.belum .cv-cuplikan { color: #0f172a; font-weight: 600; }
.cv-lencana { flex: none; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--biru); color: #fff; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.cv-lencana.bisu { background: #94a3b8; }
.cv-kudos-pilih { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border: 1px solid var(--garis); border-radius: 8px; margin-bottom: 8px; }
.cv-kudos-kat { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.cv-kudos-papan { margin-top: 16px; border-top: 1px solid var(--garis); padding-top: 10px; }
.cv-kudos-papan h4 { margin: 0 0 6px; font-size: 14px; }
.cv-kudos-baris { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13.5px; }
.cv-reaksi { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.cv-reaksi-chip { border: 1px solid rgba(0, 0, 0, 0.15); background: rgba(255, 255, 255, 0.6); border-radius: 999px; padding: 1px 8px; font-size: 12px; cursor: pointer; }
.cv-reaksi-chip.saya { border-color: #2563eb; background: rgba(37, 99, 235, 0.12); }
.cv-emoji-baris { display: flex; gap: 2px; padding: 4px 6px; border-bottom: 1px solid var(--garis); }
.cv-emoji-baris button { border: 0; background: transparent; font-size: 18px; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
.cv-emoji-baris button:hover { background: rgba(0, 0, 0, 0.08); }
.cv-kanal-baris { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; width: 100%; text-align: left; padding: 10px; border: 1px solid var(--garis); border-radius: 8px; background: #fff; margin-bottom: 8px; cursor: pointer; }
.cv-kanal-baris small { grid-column: 1; opacity: 0.7; }
.cv-kanal-baris .badge { grid-row: 1 / span 2; grid-column: 2; align-self: center; }
.cv-kanal-nama { font-weight: 600; }
.cv-kanal-buat { display: flex; gap: 8px; margin-top: 12px; }
.cv-kartu-daftar { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.cv-kartu { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; border-left: 3px solid #2563eb; background: rgba(0, 0, 0, 0.05); color: inherit; text-decoration: none; }
.cv-kartu.j-wo { border-left-color: #d97706; }
.cv-kartu:hover { background: rgba(0, 0, 0, 0.09); }
.cv-kartu-isi { display: flex; flex-direction: column; min-width: 0; font-size: 13px; }
.cv-kartu-isi small { opacity: 0.75; }
.cv-lencana.mention { background: #dc2626; }
.cv-bisu { font-size: 12px; opacity: .6; }
.cv-kosong-kecil { color: var(--abu); font-size: 13px; text-align: center; padding: 14px; margin: 0; }
.cv-hasil { margin-top: 8px; border-top: 1px solid var(--garis); padding-top: 8px; }
.cv-hasil-judul { font-size: 11.5px; font-weight: 700; color: var(--abu); text-transform: uppercase; letter-spacing: .4px; padding: 4px 10px; }
.cv-hasil-baris { display: flex; flex-direction: column; width: 100%; text-align: left; padding: 8px 10px; border: 0; background: none; border-radius: 10px; cursor: pointer; font: inherit; gap: 1px; }
.cv-hasil-baris:hover { background: #eef3fd; }
.cv-hasil-baris small { color: var(--abu); font-size: 11.5px; }
.cv-hasil-baris span { font-size: 12.5px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Panel */
.cv-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #f1f5f9; position: relative; }
.cv-selamat { margin: auto; text-align: center; max-width: 380px; padding: 24px; color: var(--abu); }
.cv-selamat-ikon { font-size: 54px; }
.cv-selamat h3 { margin: 6px 0; color: #0f172a; font-size: 20px; }
.cv-selamat p { font-size: 13.5px; line-height: 1.6; }
.cv-selamat-aksi { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
.cv-kepala { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #fff; border-bottom: 1px solid var(--garis); }
.cv-kembali { display: none; background: none; border: 0; font-size: 28px; line-height: 1; cursor: pointer; color: var(--biru); padding: 0 6px 4px; }
.cv-kepala-teks { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cv-kepala-teks b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-kepala-teks small { color: var(--abu); font-size: 12px; }
.cv-ketik { color: var(--biru); font-style: italic; }
.cv-pesan { flex: 1; overflow-y: auto; padding: 14px 18px 8px; display: flex; flex-direction: column; gap: 3px; position: relative; scroll-behavior: auto; }
.cv-pesan.seret { outline: 3px dashed var(--biru); outline-offset: -8px; }
.cv-lepas { position: sticky; top: 0; align-self: center; background: var(--biru); color: #fff; padding: 8px 16px; border-radius: 999px; font-size: 13px; z-index: 6; }
.cv-lama, .cv-awal { text-align: center; color: var(--abu); font-size: 13px; padding: 10px; margin: 0; }
.cv-hari { display: flex; justify-content: center; margin: 12px 0 6px; }
.cv-hari span { background: #e2e8f0; color: #475569; font-size: 11.5px; font-weight: 600; padding: 3px 12px; border-radius: 999px; }
.cv-sistem { align-self: center; font-size: 12px; color: var(--abu); background: #e8edf4; padding: 3px 12px; border-radius: 999px; margin: 6px 0; text-align: center; max-width: 90%; }
.cv-baris { display: flex; gap: 8px; align-items: flex-end; margin-top: 8px; max-width: 100%; }
.cv-baris.lanjut { margin-top: 1px; }
.cv-baris.saya { flex-direction: row-reverse; }
.cv-gelembung { position: relative; max-width: min(560px, 78%); background: #fff; border: 1px solid var(--garis); border-radius: 16px 16px 16px 4px; padding: 7px 12px 5px; box-shadow: 0 1px 2px rgba(15, 23, 42, .05); word-break: break-word; }
.cv-baris.saya .cv-gelembung { background: linear-gradient(135deg, #2563eb, #1d4ed8); border-color: transparent; color: #fff; border-radius: 16px 16px 4px 16px; }
.cv-gelembung.mengirim { opacity: .7; }
.cv-gelembung.gagal { outline: 2px solid #f87171; }
.cv-gelembung.dihapus { background: #f8fafc; color: var(--abu); border-style: dashed; }
.cv-baris.sorot .cv-gelembung { animation: cv-sorot 1.2s ease; }
@keyframes cv-sorot { 0%, 60% { box-shadow: 0 0 0 4px #fde68a; } 100% { box-shadow: 0 1px 2px rgba(15, 23, 42, .05); } }
.cv-pengirim { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
.cv-teks { font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
.cv-teks a { color: inherit; text-decoration: underline; word-break: break-all; }
.cv-baris:not(.saya) .cv-teks a { color: var(--biru); }
.cv-sebut { background: rgba(37, 99, 235, .14); color: #1d4ed8; border-radius: 5px; padding: 0 3px; font-weight: 600; }
.cv-baris.saya .cv-sebut { background: rgba(255, 255, 255, .22); color: #fff; }
.cv-meta { font-size: 10.5px; opacity: .7; text-align: right; margin-top: 2px; }
.cv-gagal { font-size: 12px; color: #fecaca; text-align: right; }
.cv-gagal button { background: none; border: 0; color: #fff; text-decoration: underline; cursor: pointer; font-size: 12px; padding: 0; }
.cv-kutip { display: flex; flex-direction: column; gap: 1px; width: 100%; text-align: left; border: 0; border-left: 3px solid var(--biru); background: rgba(100, 116, 139, .12); border-radius: 6px; padding: 4px 8px; margin: 0 0 4px; cursor: pointer; font: inherit; color: inherit; }
.cv-baris.saya .cv-kutip { border-left-color: #bfdbfe; background: rgba(255, 255, 255, .16); }
.cv-kutip b { font-size: 11.5px; }
.cv-kutip span { font-size: 12.5px; opacity: .85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-berkas { display: flex; gap: 10px; align-items: center; border: 1px solid rgba(100, 116, 139, .3); background: rgba(100, 116, 139, .1); border-radius: 10px; padding: 8px 10px; cursor: pointer; font: inherit; color: inherit; text-align: left; margin-bottom: 3px; }
.cv-berkas:disabled { opacity: .6; cursor: default; }
.cv-berkas-teks { display: flex; flex-direction: column; min-width: 0; }
.cv-berkas-teks b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.cv-berkas-teks small { font-size: 11px; opacity: .75; }
.cv-menu-tombol { position: absolute; top: 2px; right: 6px; opacity: 0; background: rgba(15, 23, 42, .06); border: 0; border-radius: 8px; width: 22px; height: 22px; line-height: 1; cursor: pointer; color: inherit; transition: opacity .12s; }
.cv-gelembung:hover .cv-menu-tombol, .cv-gelembung:focus-within .cv-menu-tombol { opacity: 1; }
.cv-menu { position: absolute; z-index: 12; top: 26px; right: 0; background: #fff; color: #0f172a; border: 1px solid var(--garis); border-radius: 12px; box-shadow: 0 12px 28px rgba(15, 23, 42, .18); padding: 4px; display: flex; flex-direction: column; min-width: 230px; }
.cv-menu button { background: none; border: 0; text-align: left; padding: 7px 10px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px; }
.cv-menu button:hover { background: #f1f5f9; }
.cv-menu button.bahaya { color: #dc2626; }
.cv-turun { position: sticky; bottom: 6px; align-self: center; background: var(--biru); color: #fff; border: 0; padding: 7px 16px; border-radius: 999px; font-size: 12.5px; cursor: pointer; box-shadow: 0 6px 16px rgba(37, 99, 235, .4); z-index: 6; }
/* Penulis */
.cv-tulis { position: relative; background: #fff; border-top: 1px solid var(--garis); padding: 8px 12px 10px; }
.cv-konteks { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12.5px; background: #eff6ff; border-left: 3px solid var(--biru); border-radius: 8px; padding: 5px 10px; margin-bottom: 6px; color: #1e3a8a; }
.cv-konteks.edit { background: #fefce8; border-left-color: #eab308; color: #713f12; }
.cv-konteks button, .cv-lampiran button { background: none; border: 0; cursor: pointer; color: inherit; font-size: 14px; }
.cv-lampiran { display: flex; align-items: center; gap: 10px; border: 1px solid var(--garis); border-radius: 10px; padding: 6px 10px; margin-bottom: 6px; background: #f8fafc; }
.cv-lampiran img { width: 44px; height: 44px; object-fit: cover; border-radius: 8px; }
.cv-lampiran-teks { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cv-lampiran-teks b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-lampiran-teks small { color: var(--abu); font-size: 11px; }
.cv-saran { position: absolute; left: 12px; right: 12px; bottom: calc(100% - 4px); background: #fff; border: 1px solid var(--garis); border-radius: 12px; box-shadow: 0 -8px 24px rgba(15, 23, 42, .12); padding: 4px; z-index: 14; display: flex; flex-direction: column; }
.cv-saran button { display: flex; align-items: center; gap: 10px; border: 0; background: none; padding: 6px 10px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 13.5px; text-align: left; }
.cv-saran button small { color: var(--abu); margin-left: auto; }
.cv-saran button.on, .cv-saran button:hover { background: #eaf1ff; }
.cv-kotak { display: flex; align-items: flex-end; gap: 6px; }
.cv-emoji-bungkus { position: relative; }
.cv-emoji { position: absolute; bottom: 42px; left: 0; width: 280px; background: #fff; border: 1px solid var(--garis); border-radius: 14px; box-shadow: 0 12px 30px rgba(15, 23, 42, .18); padding: 8px; display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; z-index: 16; }
.cv-emoji button { border: 0; background: none; font-size: 20px; cursor: pointer; border-radius: 8px; padding: 3px 0; }
.cv-emoji button:hover { background: #f1f5f9; }
.cv-input { flex: 1; resize: none; border: 1px solid var(--garis); border-radius: 18px; padding: 9px 14px; font: inherit; font-size: 14px; line-height: 1.4; max-height: 140px; background: #f8fafc; }
.cv-input:focus { outline: 2px solid #bfdbfe; border-color: var(--biru); background: #fff; }
.cv-kirim { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--biru); color: #fff; font-size: 16px; cursor: pointer; transition: transform .12s, background .12s; }
.cv-kirim:hover:not(:disabled) { background: var(--biru-tua); transform: scale(1.06); }
.cv-kirim:disabled { background: #cbd5e1; cursor: default; }
/* Modal */
.cv-info, .cv-baru { display: flex; flex-direction: column; gap: 12px; }
.cv-info-judul { margin: 0; font-size: 17px; }
.cv-info-nama { display: flex; gap: 8px; }
.cv-info-nama .form-input { flex: 1; }
.cv-info-bisu { display: flex; gap: 8px; align-items: center; font-size: 13.5px; cursor: pointer; }
.cv-info-kepala { display: flex; justify-content: space-between; align-items: center; }
.cv-anggota { list-style: none; margin: 0; padding: 0; max-height: 340px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.cv-anggota li { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-radius: 10px; }
.cv-anggota-teks { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cv-anggota-teks b { font-size: 13.5px; }
.cv-anggota-teks em { font-weight: 400; font-style: normal; color: var(--abu); }
.cv-anggota-teks small { color: var(--abu); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-redup { color: var(--abu); font-size: 12.5px; margin: 0; }
.cv-tab { display: flex; gap: 4px; background: #f1f5f9; padding: 3px; border-radius: 10px; }
.cv-tab button { flex: 1; border: 0; background: none; padding: 7px; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600; font-size: 13px; color: var(--abu); }
.cv-tab button.on { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(15, 23, 42, .12); }
.cv-dipilih { display: flex; flex-wrap: wrap; gap: 6px; }
.cv-chip { background: #dbeafe; color: #1e3a8a; border-radius: 999px; padding: 3px 4px 3px 10px; font-size: 12.5px; display: inline-flex; gap: 4px; align-items: center; }
.cv-chip button { border: 0; background: rgba(30, 58, 138, .15); border-radius: 50%; width: 18px; height: 18px; cursor: pointer; line-height: 1; color: inherit; }
.cv-orang { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.cv-orang-baris { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border: 0; background: none; border-radius: 10px; cursor: pointer; font: inherit; text-align: left; }
.cv-orang-baris:hover, .cv-orang-baris.on { background: #eaf1ff; }
.cv-cek { width: 22px; height: 22px; border: 2px solid #cbd5e1; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; color: #fff; flex: none; }
.cv-cek.on { background: var(--biru); border-color: var(--biru); }
.cv-lightbox { position: fixed; inset: 0; z-index: 12000; background: rgba(2, 6, 23, .85); display: flex; align-items: center; justify-content: center; cursor: zoom-out; animation: cv-pudar .15s ease; }
.cv-lightbox img { max-width: 92vw; max-height: 90vh; border-radius: 10px; }
.cv-lightbox button { position: absolute; top: 14px; right: 18px; background: none; border: 0; color: #fff; font-size: 34px; cursor: pointer; }
@keyframes cv-pudar { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .cv-lightbox, .cv-baris.sorot .cv-gelembung { animation: none; } }
/* Ponsel: satu panel sekaligus */
@media (max-width: 800px) {
  .cv { grid-template-columns: 1fr; height: calc(100dvh - 100px); border-radius: 0; border-left: 0; border-right: 0; }
  .cv .cv-panel { display: none; }
  .cv.cv-buka .cv-daftar { display: none; }
  .cv.cv-buka .cv-panel { display: flex; }
  .cv-panel .cv-selamat { display: none; }
  .cv-daftar { border-right: 0; }
  .cv-kembali { display: inline-block; }
  .cv-gelembung { max-width: 86%; }
  .cv-menu-tombol { opacity: 1; }
}
</style>
