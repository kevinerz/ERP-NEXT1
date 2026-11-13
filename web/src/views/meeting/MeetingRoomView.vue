<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { confirmDialog, alertError, toast, toastGalat, pesanGalat } from '@/composables/useDialog'
import KaryawanPicker from './KaryawanPicker.vue'
import RuangRapat from './RuangRapat.vue'
import PratinjauPerangkat from './PratinjauPerangkat.vue'
import FormRapat from './FormRapat.vue'
import {
  RESPON, infoRespon, durasiTeks, hitungMundur, infoKategori, inisial, jam, labelKategori, lamaJalan,
  linkGoogleCalendar, salin, tglPanjang, tglPendek, unduhIcs, warnaNama,
} from './rapat-util'

interface Peserta {
  id_karyawan: number; nama: string; jabatan: string; peran: string; respon: string | null; hadir: boolean; online: boolean
  masuk_at: string | null; keluar_at: string | null; menit: number
}
interface Tindak { id_tindak: number; judul: string; id_pic: number | null; pic: string | null; tenggat: string | null; selesai: boolean; selesai_at: string | null; dibuat_oleh: string }
interface Detail {
  id_rapat: number; judul: string; deskripsi: string | null; jadwal_at: string | null; status: string
  durasi_menit: number | null; kategori: string | null; lokasi: string | null
  mulai_at: string | null; selesai_at: string | null; created_at: string; moderator: boolean; diundang: boolean; respon_saya: string | null
  pembuat: { id_karyawan: number; nama: string }; peserta: Peserta[]
  tamu: { nama: string; online: boolean; masuk_at: string | null; keluar_at: string | null; menit: number }[]
  link_tamu: { kode: string; aktif: boolean; dimatikan: boolean; sampai: string | null } | null
  notulen: string | null; notulen_at: string | null; notulen_oleh: string | null
  tindak: Tindak[]
  sesi: { id_karyawan: number | null; identity: string | null; nama: string | null; masuk_at: string; keluar_at: string | null }[]
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const asal = window.location.origin
const id = Number(route.params.id)
const detail = ref<Detail | null>(null)
const error = ref('')
const pesan = ref('')
const tab = ref<string>(typeof route.query.tab === 'string' ? route.query.tab : 'ringkasan')
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t === 'ringkasan' ? undefined : t } }).catch(() => {}))

const memuatUlang = ref(false)
async function muatDetail(latar = false) {
  if (!latar) memuatUlang.value = true
  try {
    const { data } = await api.get(`/meeting/${id}`, latar ? { senyap: true } : undefined)
    const d: Detail = data.data
    // Jangan timpa notulen yang sedang diketik
    if (detail.value && notulen.kotor) d.notulen = detail.value.notulen
    detail.value = d
    if (!notulen.kotor) notulen.teks = d.notulen ?? ''
    error.value = ''
  } catch (e: any) {
    // polling latar gagal sementara: data lama tetap tampil, jangan munculkan banner galat
    if (!latar || !detail.value) error.value = pesanGalat(e, 'Gagal memuat rapat')
  } finally {
    if (!latar) memuatUlang.value = false
  }
}

const kini = ref(Date.now())
let detik: ReturnType<typeof setInterval> | undefined
let timerDetail: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  await muatDetail()
  detik = setInterval(() => { kini.value = Date.now() }, 1000)
  timerDetail = setInterval(() => { if (!sesi.value && document.visibilityState === 'visible') muatDetail(true) }, 15_000)
  if (route.query.ubah === '1' && detail.value?.moderator) formUbah.value = true
  if (route.query.masuk === '1' && detail.value && detail.value.status !== 'Dibatalkan') masuk()
  window.addEventListener('beforeunload', cegahKeluar)
})
onBeforeUnmount(() => {
  clearInterval(detik); clearInterval(timerDetail)
  window.removeEventListener('beforeunload', cegahKeluar)
  if (notulen.kotor) simpanNotulen()
})

// ── Masuk rapat ──────────────────────────────────────────────────────────────
const lobi = ref<InstanceType<typeof PratinjauPerangkat> | null>(null)
const perangkat = reactive({ mic: true, kamera: true, micId: '', camId: '' })
const menyambung = ref(false)
// Rapat selesai dibuka untuk membaca notulen → kamera baru dinyalakan bila memang mau memulai lagi
const siapkanLagi = ref(false)
const tampilLobi = computed(() => d.value?.status !== 'Selesai' || siapkanLagi.value)
const sesi = ref<{ url: string; token: string; judul: string; moderator: boolean } | null>(null)
async function masuk() {
  if (menyambung.value || sesi.value) return
  menyambung.value = true
  pesan.value = ''
  try {
    const { data } = await api.post(`/meeting/${id}/token`)
    lobi.value?.lepas()
    sesi.value = data.data
    if (route.query.masuk || route.query.ubah) router.replace({ query: { tab: route.query.tab } })
  } catch (e) {
    alertError(e, 'Gagal masuk rapat')
  } finally {
    menyambung.value = false
  }
}
function selesai(p: string) {
  sesi.value = null
  pesan.value = p
  muatDetail()
  if (detail.value?.diundang) tab.value = 'notulen'
}
async function kelola(aksi: 'keluarkan' | 'bisukan' | 'akhiri', identity?: string, track_sid?: string) {
  await api.post(`/meeting/${id}/kelola`, { aksi, identity, track_sid })
}

// ── Status & waktu ───────────────────────────────────────────────────────────
const d = computed(() => detail.value)
const kat = computed(() => infoKategori(d.value?.kategori))
const selesaiAtauBatal = computed(() => d.value?.status === 'Selesai' || d.value?.status === 'Dibatalkan')
const bisaAtur = computed(() => !!d.value?.moderator && !selesaiAtauBatal.value)
const durasiNyata = computed(() => (d.value?.mulai_at && d.value.selesai_at ? Math.round((+new Date(d.value.selesai_at) - +new Date(d.value.mulai_at)) / 60_000) : null))
const rentang = computed(() => {
  const r = d.value
  if (!r?.jadwal_at) return 'Rapat dadakan'
  return `${tglPanjang(r.jadwal_at)} · ${jam(r.jadwal_at)}${r.durasi_menit ? `–${jam(new Date(+new Date(r.jadwal_at) + r.durasi_menit * 60_000))}` : ''} WIB`
})
const subjudul = computed(() => {
  const r = d.value
  if (!r) return ''
  if (r.status === 'Berlangsung' && r.mulai_at) return `Berlangsung ${lamaJalan(r.mulai_at, kini.value)}`
  if (r.status === 'Terjadwal' && r.jadwal_at) return +new Date(r.jadwal_at) > kini.value ? `Mulai ${hitungMundur(r.jadwal_at, kini.value)}` : 'Sudah waktunya — belum ada yang masuk'
  if (r.status === 'Selesai') return `Selesai · ${durasiNyata.value != null ? durasiTeks(durasiNyata.value) : ''}`
  return r.status
})
const statistik = computed(() => {
  const r = d.value
  if (!r) return { hadir: 0, total: 0, persen: 0, tamu: 0, online: 0 }
  const hadir = r.peserta.filter((p) => p.hadir).length
  return { hadir, total: r.peserta.length, persen: r.peserta.length ? Math.round((hadir / r.peserta.length) * 100) : 0, tamu: r.tamu.length, online: r.peserta.filter((p) => p.online).length + r.tamu.filter((t) => t.online).length }
})
const rsvp = computed(() => {
  const p = d.value?.peserta ?? []
  return { hadir: p.filter((x) => x.respon === 'hadir'), mungkin: p.filter((x) => x.respon === 'mungkin'), tidak: p.filter((x) => x.respon === 'tidak'), belum: p.filter((x) => !x.respon) }
})

// ── Aksi rapat ───────────────────────────────────────────────────────────────
const formUbah = ref(false)
function tersimpan(data: Detail) { formUbah.value = false; detail.value = data }
async function respon(nilai: string) {
  try {
    const { data } = await api.post(`/meeting/${id}/respon`, { respon: nilai })
    detail.value = data.data
    toast(`Konfirmasi: ${infoRespon(nilai).label}`)
  } catch (e) { alertError(e, 'Gagal menyimpan konfirmasi') }
}
async function duplikat() {
  try {
    const { data } = await api.post(`/meeting/${id}/duplikat`, {})
    toast('Rapat disalin — atur jadwal barunya')
    window.location.assign(`/meeting/${data.data.id_rapat}?ubah=1`)
  } catch (e) { alertError(e, 'Gagal menyalin rapat') }
}
const membuka = ref(false)
async function bukaKembali() {
  if (membuka.value) return
  if (!(await confirmDialog({ title: 'Buka kembali rapat?', message: 'Rapat kembali ke status Terjadwal dan bisa dimulai lagi. Atur ulang jadwalnya bila perlu.', confirmLabel: 'Buka kembali' }))) return
  membuka.value = true
  try {
    await api.post(`/meeting/${id}/buka-kembali`)
    siapkanLagi.value = false
    await muatDetail()
    toast('Rapat dibuka kembali')
  } catch (e) { alertError(e, 'Gagal membuka kembali rapat') } finally { membuka.value = false }
}
async function batalkan() {
  if (!(await confirmDialog({ title: 'Batalkan rapat?', message: 'Semua peserta akan diberi tahu lewat notifikasi.', confirmLabel: 'Batalkan rapat', variant: 'danger' }))) return
  try {
    await api.post(`/meeting/${id}/batal`)
    await muatDetail()
    toast('Rapat dibatalkan', 'warning')
  } catch (e) { alertError(e, 'Gagal membatalkan') }
}
const teksUndanganInternal = computed(() => {
  const r = d.value
  if (!r) return ''
  return `📹 *${r.judul}*\n🗓️ ${rentang.value}${r.lokasi ? `\n📍 ${r.lokasi}` : ''}${r.deskripsi ? `\n\nAgenda:\n${r.deskripsi}` : ''}\n\nMasuk rapat (login ERP): ${asal}/meeting/${r.id_rapat}`
})
async function salinUndangan() {
  if (await salin(teksUndanganInternal.value)) toast('Teks undangan disalin')
  else toast('Gagal menyalin — izinkan akses clipboard di browser', 'warning')
}
const menuKalender = ref(false)

// ── Link tamu ────────────────────────────────────────────────────────────────
const linkTamu = computed(() => (d.value?.link_tamu ? `${asal}/rapat/tamu/${d.value.link_tamu.kode}` : ''))
const prosesLink = ref(false)
async function aturLink(aktif: boolean, baru = false) {
  if (baru && !(await confirmDialog({ title: 'Buat link baru?', message: 'Link lama tidak bisa dipakai lagi.', confirmLabel: 'Buat link baru', variant: 'warning' }))) return
  prosesLink.value = true
  try {
    const { data } = await api.post(`/meeting/${id}/tamu`, { aktif, baru })
    detail.value = data.data
    if (aktif) salinLink()
  } catch (e) {
    alertError(e, 'Gagal mengatur link tamu')
  } finally {
    prosesLink.value = false
  }
}
async function salinLink() {
  if (!linkTamu.value) return
  if (await salin(linkTamu.value)) toast('Link tamu disalin')
  else toast('Link tamu gagal disalin otomatis — salin manual dari kolom link', 'warning')
}
const teksUndanganTamu = computed(() => {
  const r = d.value
  if (!r || !linkTamu.value) return ''
  return `Undangan rapat NEXT1\n*${r.judul}*\n${r.jadwal_at ? `Waktu: ${rentang.value}\n` : ''}Masuk lewat browser (Chrome/Edge/Safari), tanpa instal aplikasi:\n${linkTamu.value}`
})
const waLink = computed(() => `https://wa.me/?text=${encodeURIComponent(teksUndanganTamu.value)}`)

// ── Peserta ──────────────────────────────────────────────────────────────────
const undang = reactive({ buka: false, pilih: [] as number[], simpan: false })
async function simpanUndangan() {
  if (!undang.pilih.length) return
  undang.simpan = true
  try {
    const { data } = await api.post(`/meeting/${id}/peserta`, { id_karyawan: undang.pilih })
    detail.value = data.data
    undang.buka = false
    toast(`${undang.pilih.length} karyawan diundang`)
  } catch (e) {
    alertError(e, 'Gagal mengundang')
  } finally {
    undang.simpan = false
  }
}
async function hapusPeserta(p: Peserta) {
  if (!(await confirmDialog({ title: `Hapus ${p.nama} dari undangan?`, confirmLabel: 'Hapus', variant: 'danger' }))) return
  try {
    const { data } = await api.delete(`/meeting/${id}/peserta/${p.id_karyawan}`)
    detail.value = data.data
  } catch (e) { alertError(e, 'Gagal menghapus peserta') }
}
async function jadikanModerator(p: Peserta) {
  try {
    const { data } = await api.post(`/meeting/${id}/peserta/${p.id_karyawan}/moderator`)
    detail.value = data.data
    toast(`${p.nama} sekarang moderator`)
  } catch (e) { alertError(e, 'Gagal menjadikan moderator') }
}

// Linimasa kehadiran: posisi tiap sesi masuk–keluar terhadap rentang rapat
const linimasa = computed(() => {
  const r = d.value
  if (!r?.mulai_at || !r.sesi.length) return null
  const awal = Math.min(+new Date(r.mulai_at), ...r.sesi.map((s) => +new Date(s.masuk_at)))
  const akhir = r.selesai_at ? +new Date(r.selesai_at) : kini.value
  const total = Math.max(60_000, akhir - awal)
  const baris = new Map<string, { nama: string; potong: { kiri: number; lebar: number; aktif: boolean }[] }>()
  for (const s of r.sesi) {
    const kunci = s.id_karyawan != null ? `k${s.id_karyawan}` : s.identity ?? '?'
    const nama = s.id_karyawan != null ? r.peserta.find((p) => p.id_karyawan === s.id_karyawan)?.nama ?? `#${s.id_karyawan}` : `${(s.nama || 'Tamu').replace(/ · Tamu$/, '')} (tamu)`
    if (!baris.has(kunci)) baris.set(kunci, { nama, potong: [] })
    const m = +new Date(s.masuk_at)
    const k = s.keluar_at ? +new Date(s.keluar_at) : akhir
    baris.get(kunci)!.potong.push({ kiri: ((m - awal) / total) * 100, lebar: Math.max(0.8, ((k - m) / total) * 100), aktif: !s.keluar_at })
  }
  const tanda = Array.from({ length: 5 }, (_, i) => jam(new Date(awal + (total * i) / 4)))
  return { baris: [...baris.values()], tanda }
})

// ── Notulen (simpan otomatis) ────────────────────────────────────────────────
const notulen = reactive({ teks: '', kotor: false, menyimpan: false, pratinjau: false })
let tundaNotulen: ReturnType<typeof setTimeout> | undefined
watch(() => notulen.teks, (v) => {
  if (v === (detail.value?.notulen ?? '')) return
  notulen.kotor = true
  clearTimeout(tundaNotulen)
  tundaNotulen = setTimeout(simpanNotulen, 1500)
})
async function simpanNotulen() {
  if (!detail.value?.diundang || notulen.menyimpan) return
  clearTimeout(tundaNotulen)
  notulen.menyimpan = true
  const teks = notulen.teks
  try {
    const { data } = await api.put(`/meeting/${id}/notulen`, { notulen: teks })
    if (detail.value) Object.assign(detail.value, { notulen: teks, notulen_at: data.data.notulen_at, notulen_oleh: data.data.notulen_oleh })
    notulen.kotor = notulen.teks !== teks
  } catch (e) {
    // simpan otomatis bisa berulang tiap jeda ketik → toast (tidak menumpuk), bukan dialog
    toastGalat(e, 'Notulen gagal disimpan — perubahan masih di layar, akan dicoba lagi saat Anda mengetik')
  } finally {
    notulen.menyimpan = false
  }
}
function cegahKeluar(e: BeforeUnloadEvent) { if (notulen.kotor) { e.preventDefault(); e.returnValue = '' } }
function templatNotulen() {
  const r = d.value
  if (!r) return
  const hadir = r.peserta.filter((p) => p.hadir).map((p) => p.nama)
  const agenda = (r.deskripsi || '').split('\n').filter(Boolean)
  notulen.teks = [
    `# Notulen: ${r.judul}`,
    `Tanggal: ${r.mulai_at ? tglPanjang(r.mulai_at) : r.jadwal_at ? tglPanjang(r.jadwal_at) : '-'}`,
    `Hadir: ${hadir.length ? hadir.join(', ') : '-'}`,
    '',
    '## Pembahasan',
    ...(agenda.length ? agenda.map((a) => `- ${a.replace(/^\d+[.)]\s*/, '')}: `) : ['- ']),
    '',
    '## Keputusan',
    '- ',
    '',
    '## Catatan lain',
    '- ',
  ].join('\n') + (notulen.teks.trim() ? `\n\n---\n${notulen.teks}` : '')
}
function unduhNotulen() {
  const r = d.value
  if (!r) return
  const tindak = r.tindak.length ? `\n\n## Tindak lanjut\n${r.tindak.map((t) => `- [${t.selesai ? 'x' : ' '}] ${t.judul}${t.pic ? ` — ${t.pic}` : ''}${t.tenggat ? ` (tenggat ${tglPendek(t.tenggat)})` : ''}`).join('\n')}` : ''
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([`${notulen.teks}${tindak}\n`], { type: 'text/markdown;charset=utf-8' }))
  a.download = `notulen-${r.id_rapat}-${r.judul.replace(/[^\w-]+/g, '-').slice(0, 40)}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
async function salinNotulen() { if (await salin(notulen.teks)) toast('Notulen disalin'); else toast('Notulen gagal disalin — gunakan Unduh', 'warning') }
// Tampilan markdown sederhana (judul, daftar, centang) — aman: teks di-escape dulu
const notulenHtml = computed(() => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc(notulen.teks || '').split('\n').map((l) => {
    if (/^### /.test(l)) return `<h5>${l.slice(4)}</h5>`
    if (/^## /.test(l)) return `<h4>${l.slice(3)}</h4>`
    if (/^# /.test(l)) return `<h3>${l.slice(2)}</h3>`
    if (/^---+$/.test(l.trim())) return '<hr>'
    if (/^\s*- \[x\] /i.test(l)) return `<p class="li">☑️ ${l.replace(/^\s*- \[x\] /i, '')}</p>`
    if (/^\s*- \[ \] /.test(l)) return `<p class="li">⬜ ${l.replace(/^\s*- \[ \] /, '')}</p>`
    if (/^\s*[-*] /.test(l)) return `<p class="li">• ${l.replace(/^\s*[-*] /, '')}</p>`
    return l.trim() ? `<p>${l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>` : '<br>'
  }).join('')
})

// ── Tindak lanjut ────────────────────────────────────────────────────────────
const tindakBaru = reactive({ judul: '', id_pic: '' as number | '', tenggat: '' })
const tindakSimpan = ref(false)
const tindakTerbuka = computed(() => d.value?.tindak.filter((t) => !t.selesai).length ?? 0)
async function tambahTindak() {
  if (tindakBaru.judul.trim().length < 2) return
  tindakSimpan.value = true
  try {
    const { data } = await api.post(`/meeting/${id}/tindak`, { judul: tindakBaru.judul.trim(), id_pic: tindakBaru.id_pic || null, tenggat: tindakBaru.tenggat || null })
    detail.value = data.data
    Object.assign(tindakBaru, { judul: '', tenggat: '' })
  } catch (e) { alertError(e, 'Gagal menambah tindak lanjut') } finally { tindakSimpan.value = false }
}
const tindakProses = ref(0)
async function ubahTindak(t: Tindak, isi: Record<string, unknown>, ev?: Event) {
  if (tindakProses.value) return
  tindakProses.value = t.id_tindak
  try {
    const { data } = await api.patch(`/meeting/${id}/tindak/${t.id_tindak}`, isi)
    detail.value = data.data
  } catch (e) {
    // <select> sudah berganti di layar → kembalikan ke PIC yang tersimpan
    if (ev?.target instanceof HTMLSelectElement) ev.target.value = String(t.id_pic ?? '')
    alertError(e, 'Gagal mengubah tindak lanjut')
  } finally { tindakProses.value = 0 }
}
async function hapusTindak(t: Tindak) {
  if (!(await confirmDialog({ title: 'Hapus tindak lanjut?', message: t.judul, confirmLabel: 'Hapus', variant: 'danger' }))) return
  try {
    const { data } = await api.delete(`/meeting/${id}/tindak/${t.id_tindak}`)
    detail.value = data.data
  } catch (e) { alertError(e, 'Gagal menghapus tindak lanjut') }
}
const tenggatLewat = (t: Tindak) => !t.selesai && !!t.tenggat && t.tenggat.slice(0, 10) < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
const namaSaya = computed(() => auth.user?.nama_lengkap || 'Anda')
</script>

<template>
  <RuangRapat
    v-if="sesi" :url="sesi.url" :token="sesi.token" :judul="sesi.judul" :moderator="sesi.moderator"
    :mic="perangkat.mic" :kamera="perangkat.kamera" :mic-id="perangkat.micId" :cam-id="perangkat.camId"
    :mulai-at="d?.mulai_at || null" :link-undangan="`${asal}/meeting/${id}`" :kelola="kelola" @selesai="selesai"
  />

  <div v-else class="rd">
    <button type="button" class="rd-kembali" @click="router.push('/meeting')">← Pusat Rapat</button>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button type="button" class="btn btn-secondary btn-sm" :disabled="memuatUlang" @click="muatDetail()">{{ memuatUlang ? 'Memuat…' : '↻ Coba lagi' }}</button></div>
    <div v-if="!d && !error" class="rd-skeleton"></div>

    <template v-if="d">
      <!-- HERO -->
      <section class="rd-hero" :class="'s-' + d.status.toLowerCase()" :style="{ '--c': kat.warna }">
        <div class="rd-hero-isi">
          <div class="rd-chip-baris">
            <span class="rd-status"><i></i>{{ d.status }}</span>
            <span class="rd-chip">{{ kat.ikon }} {{ labelKategori(d.kategori) }}</span>
            <span v-if="d.moderator" class="rd-chip">🛡️ Anda moderator</span>
            <span v-else-if="!d.diundang" class="rd-chip">👁️ Pemantau</span>
          </div>
          <h1>{{ d.judul }}</h1>
          <p class="rd-sub">{{ subjudul }}</p>
          <div class="rd-meta">
            <span>🗓️ {{ rentang }}</span>
            <span v-if="d.durasi_menit">⏱️ {{ durasiTeks(d.durasi_menit) }}</span>
            <span v-if="d.lokasi">📍 {{ d.lokasi }}</span>
            <span>👤 {{ d.pembuat.nama }}</span>
          </div>
        </div>
        <div class="rd-hero-aksi">
          <button v-if="bisaAtur" type="button" class="rd-kaca" @click="formUbah = true">✏️ Ubah</button>
          <button type="button" class="rd-kaca" title="Salin teks undangan untuk dibagikan" @click="salinUndangan">📋 Undangan</button>
          <div v-if="d.jadwal_at && !selesaiAtauBatal" class="rd-menu">
            <button type="button" class="rd-kaca" @click="menuKalender = !menuKalender">📆 Kalender ▾</button>
            <div v-if="menuKalender" class="rd-menu-isi" @click="menuKalender = false">
              <button type="button" @click="unduhIcs(d, asal)">Unduh .ics (Outlook / Apple)</button>
              <a :href="linkGoogleCalendar(d, asal)" target="_blank" rel="noopener">Google Calendar ↗</a>
            </div>
          </div>
          <button type="button" class="rd-kaca" title="Buat rapat baru dengan peserta yang sama" @click="duplikat">🔁 Salin</button>
          <button v-if="d.moderator && d.status === 'Terjadwal'" type="button" class="rd-kaca bahaya" @click="batalkan">✕ Batalkan</button>
          <button v-if="d.moderator && selesaiAtauBatal" type="button" class="rd-kaca" :disabled="membuka" title="Kembalikan rapat ke status Terjadwal" @click="bukaKembali">↩️ Buka kembali</button>
        </div>
      </section>

      <div v-if="pesan" class="rd-pesan">ℹ️ {{ pesan }} <button type="button" @click="pesan = ''">✕</button></div>

      <!-- RSVP -->
      <section v-if="d.diundang && !d.moderator && d.status === 'Terjadwal'" class="rd-rsvp">
        <span>{{ d.respon_saya ? 'Konfirmasi Anda:' : '✋ Apakah Anda akan hadir?' }}</span>
        <button v-for="(v, k) in RESPON" :key="k" type="button" :class="{ on: d.respon_saya === k }" :style="{ '--c': v.warna }" @click="respon(k)">{{ v.ikon }} {{ v.label }}</button>
      </section>

      <div class="rd-tata">
        <!-- KIRI: lobi & link tamu -->
        <div class="rd-kiri">
          <section class="rd-kartu rd-lobi">
            <div v-if="d.status === 'Selesai' && !siapkanLagi" class="rd-batal">
              <div>✅</div>
              <b>Rapat sudah selesai</b>
              <small class="rd-redup">{{ durasiNyata != null ? `Berlangsung ${durasiTeks(durasiNyata)}` : '' }} · {{ statistik.hadir }}/{{ statistik.total }} karyawan hadir</small>
              <button type="button" class="rd-tombol" @click="siapkanLagi = true">🎬 Mulai lagi rapat ini</button>
            </div>
            <template v-else-if="tampilLobi && d.status !== 'Dibatalkan'">
              <div class="rd-kartu-kepala">
                <b>{{ d.status === 'Berlangsung' ? '🟢 Rapat sedang berjalan' : '🎬 Siap masuk?' }}</b>
                <small v-if="statistik.online">{{ statistik.online }} orang di dalam</small>
              </div>
              <PratinjauPerangkat ref="lobi" v-model:mic="perangkat.mic" v-model:kamera="perangkat.kamera" v-model:mic-id="perangkat.micId" v-model:cam-id="perangkat.camId" :nama="namaSaya" />
              <button type="button" class="rd-masuk" :class="{ hidup: d.status === 'Berlangsung' }" :disabled="menyambung" @click="masuk">
                {{ menyambung ? 'Menyambungkan…' : d.status === 'Berlangsung' ? 'Gabung sekarang →' : d.status === 'Selesai' ? 'Mulai lagi rapat ini' : 'Masuk rapat →' }}
              </button>
              <small class="rd-redup">Gunakan Chrome / Edge / Safari terbaru. Pakai headset agar suara tidak menggema.</small>
            </template>
            <div v-else class="rd-batal">
              <div>🚫</div>
              <b>Rapat ini dibatalkan</b>
              <button type="button" class="rd-tombol" @click="duplikat">🔁 Jadwalkan ulang</button>
            </div>
          </section>

          <section v-if="d.moderator" class="rd-kartu">
            <div class="rd-kartu-kepala"><b>🔗 Link tamu</b><small>untuk orang di luar HRIS</small></div>
            <p class="rd-redup kecil">Vendor, klien, atau calon karyawan cukup isi nama lalu langsung masuk — hanya ke rapat ini.</p>
            <template v-if="d.link_tamu?.aktif">
              <div class="rd-link">
                <input :value="linkTamu" readonly @focus="($event.target as HTMLInputElement).select()" />
                <button type="button" @click="salinLink">Salin</button>
              </div>
              <small class="rd-redup kecil">Berlaku sampai {{ d.link_tamu.sampai ? `${tglPendek(d.link_tamu.sampai)} ${jam(d.link_tamu.sampai)}` : '-' }}, atau sampai rapat selesai.</small>
              <div class="rd-link-aksi">
                <a class="rd-tombol wa" :href="waLink" target="_blank" rel="noopener">💬 Kirim via WhatsApp</a>
                <button type="button" class="rd-tombol" :disabled="prosesLink" @click="aturLink(true, true)">↻ Link baru</button>
                <button type="button" class="rd-tombol" :disabled="prosesLink" @click="aturLink(false)">Matikan</button>
              </div>
            </template>
            <template v-else-if="bisaAtur">
              <p v-if="d.link_tamu" class="rd-redup kecil">Link sebelumnya {{ d.link_tamu.dimatikan ? 'dimatikan' : 'kedaluwarsa' }}.</p>
              <button type="button" class="rd-tombol utama" :disabled="prosesLink" @click="aturLink(true)">{{ d.link_tamu ? 'Aktifkan lagi' : '＋ Buat link tamu' }}</button>
            </template>
            <p v-else class="rd-redup kecil">Rapat sudah selesai.</p>
          </section>
        </div>

        <!-- KANAN: tab -->
        <div class="rd-kanan">
          <nav class="rd-tab" role="tablist">
            <button type="button" role="tab" :class="{ on: tab === 'ringkasan' }" @click="tab = 'ringkasan'">📋 Ringkasan</button>
            <button type="button" role="tab" :class="{ on: tab === 'peserta' }" @click="tab = 'peserta'">👥 Peserta <span>{{ d.peserta.length + d.tamu.length }}</span></button>
            <button type="button" role="tab" :class="{ on: tab === 'notulen' }" @click="tab = 'notulen'">📝 Notulen <span v-if="d.notulen" class="titik"></span></button>
            <button type="button" role="tab" :class="{ on: tab === 'tindak' }" @click="tab = 'tindak'">☑️ Tindak lanjut <span v-if="d.tindak.length">{{ d.tindak.length - tindakTerbuka }}/{{ d.tindak.length }}</span></button>
          </nav>

          <!-- RINGKASAN -->
          <section v-if="tab === 'ringkasan'" class="rd-kartu rd-isi-tab">
            <div class="rd-angka">
              <div><b>{{ statistik.hadir }}<small>/{{ statistik.total }}</small></b><span>Karyawan hadir</span></div>
              <div><b>{{ statistik.tamu }}</b><span>Tamu</span></div>
              <div><b>{{ durasiNyata != null ? durasiTeks(durasiNyata) : d.status === 'Berlangsung' && d.mulai_at ? lamaJalan(d.mulai_at, kini) : '–' }}</b><span>Durasi</span></div>
              <div><b>{{ d.tindak.length ? `${d.tindak.length - tindakTerbuka}/${d.tindak.length}` : '–' }}</b><span>Tindak lanjut</span></div>
            </div>

            <h4 class="rd-h">Agenda</h4>
            <div v-if="d.deskripsi" class="rd-agenda">
              <p v-for="(baris, i) in d.deskripsi.split('\n')" :key="i">{{ baris || ' ' }}</p>
            </div>
            <p v-else class="rd-redup kecil">Belum ada agenda.<template v-if="bisaAtur"> <a href="#" @click.prevent="formUbah = true">Tambahkan agenda</a></template></p>

            <template v-if="d.status === 'Terjadwal'">
              <h4 class="rd-h">Konfirmasi kehadiran</h4>
              <div class="rd-rsvp-ringkas">
                <div v-for="(daftar, k) in rsvp" :key="k" class="rd-rsvp-kol">
                  <small :style="{ color: k === 'belum' ? '#94a3b8' : infoRespon(k).warna }">{{ k === 'belum' ? '… Belum menjawab' : `${infoRespon(k).ikon} ${infoRespon(k).label}` }} · {{ daftar.length }}</small>
                  <div class="rd-tumpuk">
                    <i v-for="p in daftar.slice(0, 8)" :key="p.id_karyawan" :style="{ background: warnaNama(p.nama) }" :title="p.nama">{{ inisial(p.nama) }}</i>
                    <span v-if="daftar.length > 8">+{{ daftar.length - 8 }}</span>
                  </div>
                </div>
              </div>
            </template>

            <h4 class="rd-h">Info</h4>
            <dl class="rd-info">
              <dt>Dibuat</dt><dd>{{ tglPendek(d.created_at) }} {{ jam(d.created_at) }} oleh {{ d.pembuat.nama }}</dd>
              <template v-if="d.mulai_at"><dt>Mulai</dt><dd>{{ tglPendek(d.mulai_at) }} {{ jam(d.mulai_at) }}</dd></template>
              <template v-if="d.selesai_at"><dt>Selesai</dt><dd>{{ tglPendek(d.selesai_at) }} {{ jam(d.selesai_at) }}</dd></template>
              <dt>Moderator</dt><dd>{{ d.peserta.filter((p) => p.peran === 'moderator').map((p) => p.nama).join(', ') }}</dd>
            </dl>
          </section>

          <!-- PESERTA -->
          <section v-else-if="tab === 'peserta'" class="rd-kartu rd-isi-tab">
            <div class="rd-kartu-kepala">
              <b>{{ d.peserta.length }} karyawan<template v-if="d.tamu.length"> + {{ d.tamu.length }} tamu</template></b>
              <button v-if="bisaAtur" type="button" class="rd-tombol utama" @click="Object.assign(undang, { buka: true, pilih: [] })">＋ Undang</button>
            </div>
            <div v-if="d.status !== 'Terjadwal'" class="rd-hadir-bar">
              <div><i :style="{ width: statistik.persen + '%' }"></i></div>
              <small>{{ statistik.persen }}% undangan hadir</small>
            </div>
            <ul class="rd-orang">
              <li v-for="p in d.peserta" :key="p.id_karyawan">
                <i class="rd-av" :class="{ online: p.online }" :style="{ background: warnaNama(p.nama) }">{{ inisial(p.nama) }}</i>
                <div class="rd-orang-isi">
                  <b>{{ p.nama }} <span v-if="p.peran === 'moderator'" class="rd-mod">Moderator</span></b>
                  <small>{{ p.jabatan || '—' }}</small>
                </div>
                <div class="rd-orang-status">
                  <span v-if="p.online" class="rd-lencana hijau">● Di dalam</span>
                  <span v-else-if="p.hadir" class="rd-lencana">{{ jam(p.masuk_at) }}–{{ jam(p.keluar_at) }} · {{ p.menit }} mnt</span>
                  <span v-else-if="d.status === 'Terjadwal' && p.respon" class="rd-lencana" :style="{ color: infoRespon(p.respon).warna }">{{ infoRespon(p.respon).ikon }} {{ infoRespon(p.respon).label }}</span>
                  <span v-else class="rd-lencana abu">{{ d.status === 'Terjadwal' ? 'Belum konfirmasi' : 'Tidak hadir' }}</span>
                </div>
                <div v-if="d.moderator && p.id_karyawan !== d.pembuat.id_karyawan && !selesaiAtauBatal" class="rd-orang-aksi">
                  <button v-if="p.peran !== 'moderator'" type="button" title="Jadikan moderator" @click="jadikanModerator(p)">🛡️</button>
                  <button type="button" title="Hapus dari undangan" aria-label="Hapus dari undangan" @click="hapusPeserta(p)">🗑️</button>
                </div>
              </li>
              <li v-for="(t, i) in d.tamu" :key="'t' + i">
                <i class="rd-av tamu" :class="{ online: t.online }">{{ inisial(t.nama) }}</i>
                <div class="rd-orang-isi"><b>{{ t.nama.replace(/ · Tamu$/, '') }} <span class="rd-mod tamu">Tamu</span></b><small>lewat link tamu</small></div>
                <div class="rd-orang-status">
                  <span v-if="t.online" class="rd-lencana hijau">● Di dalam</span>
                  <span v-else class="rd-lencana">{{ jam(t.masuk_at) }}–{{ jam(t.keluar_at) }} · {{ t.menit }} mnt</span>
                </div>
              </li>
            </ul>

            <template v-if="linimasa">
              <h4 class="rd-h">Linimasa kehadiran</h4>
              <div class="rd-lini">
                <div v-for="(b, i) in linimasa.baris" :key="i" class="rd-lini-baris">
                  <span>{{ b.nama }}</span>
                  <div><i v-for="(p, j) in b.potong" :key="j" :class="{ aktif: p.aktif }" :style="{ left: p.kiri + '%', width: p.lebar + '%', background: warnaNama(b.nama) }"></i></div>
                </div>
                <div class="rd-lini-tanda"><span></span><div><small v-for="(t, i) in linimasa.tanda" :key="i">{{ t }}</small></div></div>
              </div>
            </template>
          </section>

          <!-- NOTULEN -->
          <section v-else-if="tab === 'notulen'" class="rd-kartu rd-isi-tab">
            <div class="rd-kartu-kepala">
              <b>📝 Notulen rapat</b>
              <small v-if="notulen.menyimpan">Menyimpan…</small>
              <small v-else-if="notulen.kotor">Belum tersimpan</small>
              <small v-else-if="d.notulen_at">✓ Tersimpan {{ jam(d.notulen_at) }}<template v-if="d.notulen_oleh"> oleh {{ d.notulen_oleh }}</template></small>
            </div>
            <div class="rd-notulen-alat">
              <template v-if="d.diundang">
                <div class="rd-segmen">
                  <button type="button" :class="{ on: !notulen.pratinjau }" @click="notulen.pratinjau = false">Tulis</button>
                  <button type="button" :class="{ on: notulen.pratinjau }" @click="notulen.pratinjau = true">Pratinjau</button>
                </div>
                <button type="button" class="rd-tombol" @click="templatNotulen">✨ Isi templat</button>
              </template>
              <span class="rd-spasi"></span>
              <button type="button" class="rd-tombol" :disabled="!notulen.teks" @click="salinNotulen">📋 Salin</button>
              <button type="button" class="rd-tombol" :disabled="!notulen.teks && !d.tindak.length" @click="unduhNotulen">⬇️ Unduh .md</button>
            </div>
            <textarea
              v-if="d.diundang && !notulen.pratinjau" v-model="notulen.teks" class="rd-notulen"
              placeholder="Tulis ringkasan pembahasan, keputusan, dan catatan penting…&#10;&#10;Format: # Judul · ## Subjudul · - daftar · - [ ] centang · **tebal**"
              @keydown.ctrl.s.prevent="simpanNotulen" @keydown.meta.s.prevent="simpanNotulen"
            ></textarea>
            <!-- eslint-disable-next-line vue/no-v-html — teks sudah di-escape di notulenHtml -->
            <div v-else-if="notulen.teks" class="rd-notulen-tampil" v-html="notulenHtml"></div>
            <p v-else class="rd-kosong">Belum ada notulen untuk rapat ini.</p>
            <small v-if="d.diundang && !notulen.pratinjau" class="rd-redup kecil">Tersimpan otomatis saat berhenti mengetik · <kbd>Ctrl</kbd>+<kbd>S</kbd> untuk simpan sekarang. Semua peserta bisa menyunting.</small>
          </section>

          <!-- TINDAK LANJUT -->
          <section v-else class="rd-kartu rd-isi-tab">
            <div class="rd-kartu-kepala">
              <b>☑️ Tindak lanjut</b>
              <small v-if="d.tindak.length">{{ d.tindak.length - tindakTerbuka }} dari {{ d.tindak.length }} selesai</small>
            </div>
            <div v-if="d.tindak.length" class="rd-hadir-bar"><div><i :style="{ width: ((d.tindak.length - tindakTerbuka) / d.tindak.length) * 100 + '%' }"></i></div></div>
            <form v-if="d.diundang" class="rd-tindak-baru" @submit.prevent="tambahTindak">
              <input v-model="tindakBaru.judul" maxlength="300" placeholder="Tugas baru, mis. Kirim penawaran ke klien…" />
              <select v-model="tindakBaru.id_pic">
                <option value="">PIC…</option>
                <option v-for="p in d.peserta" :key="p.id_karyawan" :value="p.id_karyawan">{{ p.nama }}</option>
              </select>
              <input v-model="tindakBaru.tenggat" type="date" title="Tenggat" />
              <button type="submit" class="rd-tombol utama" :disabled="tindakBaru.judul.trim().length < 2 || tindakSimpan">Tambah</button>
            </form>
            <p v-if="!d.tindak.length" class="rd-kosong">Belum ada tindak lanjut. PIC yang dipilih langsung mendapat notifikasi.</p>
            <ul class="rd-tindak">
              <li v-for="t in d.tindak" :key="t.id_tindak" :class="{ beres: t.selesai, lewat: tenggatLewat(t) }">
                <button type="button" class="rd-centang" :class="{ on: t.selesai }" :disabled="!d.diundang || tindakProses === t.id_tindak" :title="t.selesai ? 'Tandai belum selesai' : 'Tandai selesai'" @click="ubahTindak(t, { selesai: !t.selesai })">{{ t.selesai ? '✓' : '' }}</button>
                <div class="rd-tindak-isi">
                  <span>{{ t.judul }}</span>
                  <small>
                    <template v-if="t.pic"><i class="rd-av mini" :style="{ background: warnaNama(t.pic) }">{{ inisial(t.pic) }}</i>{{ t.pic }}</template>
                    <template v-else>Tanpa PIC</template>
                    <template v-if="t.tenggat"> · <b>{{ tenggatLewat(t) ? '⚠️ lewat ' : '' }}{{ tglPendek(t.tenggat) }}</b></template>
                    · oleh {{ t.dibuat_oleh }}
                  </small>
                </div>
                <select v-if="d.diundang && !t.selesai" class="rd-tindak-pic" :value="t.id_pic ?? ''" title="Ganti PIC" @change="ubahTindak(t, { id_pic: Number(($event.target as HTMLSelectElement).value) || null }, $event)">
                  <option value="">Tanpa PIC</option>
                  <option v-for="p in d.peserta" :key="p.id_karyawan" :value="p.id_karyawan">{{ p.nama }}</option>
                </select>
                <button v-if="d.diundang" type="button" class="rd-hapus" title="Hapus" aria-label="Hapus tindak lanjut" @click="hapusTindak(t)">🗑️</button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>

    <!-- Undang karyawan -->
    <div v-if="undang.buka && d" class="rd-overlay" @click.self="undang.buka = false">
      <div v-focus-trap class="rd-modal">
        <div class="rd-kartu-kepala"><b>Undang karyawan</b><button type="button" class="rd-x" @click="undang.buka = false">×</button></div>
        <KaryawanPicker v-model="undang.pilih" :kecuali="d.peserta.map((p) => p.id_karyawan)" />
        <div class="rd-modal-kaki">
          <button type="button" class="rd-tombol" @click="undang.buka = false">Batal</button>
          <button type="button" class="rd-tombol utama" :disabled="!undang.pilih.length || undang.simpan" @click="simpanUndangan">Undang {{ undang.pilih.length || '' }}</button>
        </div>
      </div>
    </div>

    <FormRapat v-if="formUbah && d" mode="ubah" :awal="d" @tutup="formUbah = false" @tersimpan="tersimpan" />
  </div>
</template>

<style scoped>
.rd { padding-bottom: 60px; }
.rd-redup { color: #94a3b8; }
.kecil { font-size: 12px; }
kbd { display: inline-block; padding: 0 4px; border-radius: 4px; border: 1px solid #cbd5e1; border-bottom-width: 2px; font: 700 10px/15px ui-monospace, monospace; background: #fff; }
.rd-kembali { border: 0; background: none; color: #4f46e5; font-weight: 800; font-size: 13px; cursor: pointer; padding: 4px 0; margin-bottom: 8px; }
.rd-skeleton { height: 170px; border-radius: 22px; background: linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9); background-size: 200% 100%; animation: rd-kilau 1.2s infinite; }
@keyframes rd-kilau { to { background-position: -200% 0; } }

/* HERO */
.rd-hero { --c: #4f46e5; position: relative; overflow: hidden; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; padding: 22px 24px; border-radius: 22px; color: #fff; margin-bottom: 12px;
  background: radial-gradient(circle at 90% -10%, rgba(255, 255, 255, .22), transparent 45%), linear-gradient(125deg, color-mix(in srgb, var(--c) 75%, #0f172a), var(--c) 55%, color-mix(in srgb, var(--c) 60%, #c026d3));
  box-shadow: 0 16px 36px -16px color-mix(in srgb, var(--c) 80%, transparent); }
.rd-hero.s-berlangsung { background: radial-gradient(circle at 90% -10%, rgba(255, 255, 255, .22), transparent 45%), linear-gradient(125deg, #064e3b, #059669 55%, #10b981); }
.rd-hero.s-dibatalkan { background: linear-gradient(125deg, #334155, #64748b); }
.rd-hero.s-selesai { background: radial-gradient(circle at 90% -10%, rgba(255, 255, 255, .15), transparent 45%), linear-gradient(125deg, #1e293b, #334155 55%, color-mix(in srgb, var(--c) 50%, #334155)); }
.rd-hero-isi { flex: 1; min-width: 260px; }
.rd-chip-baris { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.rd-status { display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, .95); color: #0f172a; border-radius: 99px; padding: 3px 10px; font-size: 12px; font-weight: 900; }
.rd-status i { width: 8px; height: 8px; border-radius: 50%; background: #2563eb; }
.s-berlangsung .rd-status i { background: #16a34a; animation: rd-kedip 1.2s infinite; }
.s-selesai .rd-status i { background: #64748b; } .s-dibatalkan .rd-status i { background: #dc2626; }
@keyframes rd-kedip { 50% { opacity: .3; } }
.rd-chip { border: 1px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .14); border-radius: 99px; padding: 3px 10px; font-size: 12px; font-weight: 700; }
.rd-hero h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -.5px; line-height: 1.15; color: #fff; }
.rd-sub { margin: 4px 0 10px; font-size: 14px; font-weight: 700; opacity: .95; font-variant-numeric: tabular-nums; }
.rd-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; opacity: .92; }
.rd-hero-aksi { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; align-content: flex-start; max-width: 420px; justify-content: flex-end; }
.rd-kaca { border: 1px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .14); color: #fff; border-radius: 11px; padding: 8px 12px; font-weight: 700; font-size: 13px; cursor: pointer; backdrop-filter: blur(6px); transition: background .15s; }
.rd-kaca:hover { background: rgba(255, 255, 255, .28); }
.rd-kaca.bahaya:hover { background: #dc2626; border-color: #dc2626; }
.rd-menu { position: relative; }
.rd-menu-isi { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; background: #fff; border-radius: 12px; box-shadow: 0 16px 40px -10px rgba(15, 23, 42, .4); padding: 6px; min-width: 220px; display: flex; flex-direction: column; }
.rd-menu-isi button, .rd-menu-isi a { border: 0; background: none; text-align: left; padding: 9px 12px; border-radius: 8px; font: inherit; font-size: 13px; color: #0f172a; cursor: pointer; text-decoration: none; }
.rd-menu-isi button:hover, .rd-menu-isi a:hover { background: #eef2ff; }
.rd-pesan { display: flex; justify-content: space-between; gap: 10px; padding: 10px 14px; border-radius: 12px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 13px; margin-bottom: 12px; }
.rd-pesan button { border: 0; background: none; cursor: pointer; color: #b45309; }

/* RSVP */
.rd-rsvp { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 16px; background: linear-gradient(120deg, #eef2ff, #faf5ff); border: 1px solid #c7d2fe; margin-bottom: 12px; }
.rd-rsvp span { font-weight: 800; font-size: 14px; color: #3730a3; margin-right: 6px; }
.rd-rsvp button { --c: #4f46e5; border: 1.5px solid #e2e8f0; background: #fff; border-radius: 10px; padding: 7px 14px; font-weight: 800; font-size: 13px; cursor: pointer; color: #334155; transition: all .12s; }
.rd-rsvp button:hover { border-color: var(--c); }
.rd-rsvp button.on { background: var(--c); border-color: var(--c); color: #fff; box-shadow: 0 6px 14px -8px var(--c); }

/* Tata letak */
.rd-tata { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 14px; align-items: start; }
.rd-kiri { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; }
.rd-kanan { min-width: 0; }
.rd-kartu { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.rd-kartu-kepala { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.rd-kartu-kepala b { font-size: 14.5px; color: #0f172a; }
.rd-kartu-kepala small { font-size: 12px; color: #64748b; }
.rd-masuk { border: 0; border-radius: 14px; padding: 14px; font-size: 16px; font-weight: 900; color: #fff; cursor: pointer; background: linear-gradient(120deg, #4f46e5, #7c3aed); box-shadow: 0 10px 22px -10px #6d28d9; transition: transform .15s; }
.rd-masuk.hidup { background: linear-gradient(120deg, #16a34a, #059669); box-shadow: 0 10px 22px -10px #059669; }
.rd-masuk:hover:not(:disabled) { transform: translateY(-2px); }
.rd-masuk:disabled { opacity: .6; cursor: default; }
.rd-batal { text-align: center; padding: 20px 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.rd-batal div { font-size: 40px; }
.rd-tombol { border: 1px solid #e2e8f0; background: #fff; border-radius: 10px; padding: 7px 12px; font-weight: 700; font-size: 12.5px; cursor: pointer; color: #334155; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.rd-tombol:hover:not(:disabled) { border-color: #6366f1; color: #4338ca; }
.rd-tombol:disabled { opacity: .5; cursor: default; }
.rd-tombol.utama { background: linear-gradient(120deg, #4f46e5, #7c3aed); color: #fff; border: 0; }
.rd-tombol.wa { background: #16a34a; color: #fff; border: 0; }
.rd-link { display: flex; gap: 6px; }
.rd-link input { flex: 1; min-width: 0; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-size: 12px; background: #f8fafc; }
.rd-link button { border: 0; background: #0f172a; color: #fff; border-radius: 10px; padding: 0 14px; font-weight: 800; cursor: pointer; }
.rd-link-aksi { display: flex; flex-wrap: wrap; gap: 6px; }

/* Tab */
.rd-tab { display: flex; gap: 3px; background: #f1f5f9; padding: 4px; border-radius: 14px; margin-bottom: 10px; overflow-x: auto; }
.rd-tab button { border: 0; background: none; padding: 8px 14px; border-radius: 10px; font-weight: 800; font-size: 13.5px; cursor: pointer; color: #475569; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.rd-tab button span { background: #e2e8f0; border-radius: 99px; padding: 0 7px; font-size: 11px; }
.rd-tab button span.titik { width: 7px; height: 7px; padding: 0; background: #16a34a; }
.rd-tab button.on { background: #fff; color: #4338ca; box-shadow: 0 2px 8px rgba(15, 23, 42, .1); }
.rd-isi-tab { animation: rd-muncul .25s both; }
@keyframes rd-muncul { from { opacity: 0; transform: translateY(6px); } }
.rd-h { margin: 8px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; font-weight: 800; }
.rd-angka { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.rd-angka div { background: linear-gradient(160deg, #f8fafc, #fff); border: 1px solid #f1f5f9; border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; }
.rd-angka b { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
.rd-angka b small { font-size: 13px; color: #94a3b8; }
.rd-angka span { font-size: 11.5px; color: #64748b; font-weight: 700; }
.rd-agenda { background: #fafaff; border: 1px solid #eef2ff; border-radius: 12px; padding: 10px 14px; }
.rd-agenda p { margin: 2px 0; font-size: 13.5px; color: #1e293b; }
.rd-rsvp-ringkas { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.rd-rsvp-kol { display: flex; flex-direction: column; gap: 6px; }
.rd-rsvp-kol small { font-size: 12px; font-weight: 800; }
.rd-tumpuk { display: flex; align-items: center; min-height: 28px; }
.rd-tumpuk i { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-style: normal; color: #fff; font-size: 10.5px; font-weight: 800; margin-left: -7px; box-shadow: 0 0 0 2px #fff; }
.rd-tumpuk i:first-child { margin-left: 0; }
.rd-tumpuk span { font-size: 11.5px; color: #64748b; margin-left: 6px; font-weight: 700; }
.rd-info { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; margin: 0; font-size: 13px; }
.rd-info dt { color: #94a3b8; font-weight: 700; }
.rd-info dd { margin: 0; color: #1e293b; }

/* Peserta */
.rd-hadir-bar { display: flex; flex-direction: column; gap: 4px; }
.rd-hadir-bar div { height: 8px; border-radius: 99px; background: #f1f5f9; overflow: hidden; }
.rd-hadir-bar i { display: block; height: 100%; background: linear-gradient(90deg, #16a34a, #22c55e); border-radius: 99px; transition: width .4s; }
.rd-hadir-bar small { font-size: 11.5px; color: #64748b; font-weight: 700; }
.rd-orang { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rd-orang li { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid #f8fafc; }
.rd-orang li:hover { background: #fafafa; }
.rd-av { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-style: normal; color: #fff; font-size: 12.5px; font-weight: 800; flex-shrink: 0; position: relative; }
.rd-av.tamu { background: #b45309; }
.rd-av.online::after { content: ''; position: absolute; right: 0; bottom: 0; width: 11px; height: 11px; border-radius: 50%; background: #22c55e; border: 2px solid #fff; }
.rd-av.mini { width: 18px; height: 18px; font-size: 8px; display: inline-grid; vertical-align: middle; margin-right: 4px; }
.rd-orang-isi { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.rd-orang-isi b { font-size: 13.5px; color: #0f172a; }
.rd-orang-isi small { font-size: 11.5px; color: #94a3b8; }
.rd-mod { font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 99px; background: #eef2ff; color: #4338ca; margin-left: 4px; vertical-align: middle; }
.rd-mod.tamu { background: #fef3c7; color: #92400e; }
.rd-lencana { font-size: 11.5px; font-weight: 700; color: #475569; white-space: nowrap; }
.rd-lencana.hijau { color: #16a34a; } .rd-lencana.abu { color: #94a3b8; }
.rd-orang-aksi { display: flex; gap: 4px; }
.rd-orang-aksi button { border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; width: 30px; height: 28px; cursor: pointer; }
.rd-orang-aksi button:hover { background: #f1f5f9; }
.rd-lini { display: flex; flex-direction: column; gap: 5px; }
.rd-lini-baris, .rd-lini-tanda { display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: center; }
.rd-lini-baris span { font-size: 12px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rd-lini-baris div { position: relative; height: 14px; background: #f8fafc; border-radius: 7px; }
.rd-lini-baris i { position: absolute; top: 2px; bottom: 2px; border-radius: 5px; opacity: .85; }
.rd-lini-baris i.aktif { animation: rd-kedip 1.6s infinite; }
.rd-lini-tanda div { display: flex; justify-content: space-between; }
.rd-lini-tanda small { font-size: 10.5px; color: #94a3b8; font-variant-numeric: tabular-nums; }

/* Notulen */
.rd-notulen-alat { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.rd-spasi { flex: 1; }
.rd-segmen { display: inline-flex; background: #f1f5f9; border-radius: 10px; padding: 3px; gap: 2px; }
.rd-segmen button { border: 0; background: none; padding: 5px 12px; border-radius: 8px; font-weight: 700; font-size: 12.5px; cursor: pointer; color: #475569; }
.rd-segmen button.on { background: #fff; color: #4338ca; box-shadow: 0 1px 4px rgba(15, 23, 42, .1); }
.rd-notulen { width: 100%; box-sizing: border-box; min-height: 360px; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; font: 14px/1.6 ui-sans-serif, system-ui, sans-serif; color: #0f172a; resize: vertical; background: linear-gradient(#fff, #fff) padding-box; }
.rd-notulen:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, .15); }
.rd-notulen-tampil { border: 1px solid #f1f5f9; border-radius: 14px; padding: 14px 18px; font-size: 14px; line-height: 1.6; color: #1e293b; background: #fcfcff; }
.rd-notulen-tampil :deep(h3) { margin: 4px 0 8px; font-size: 18px; }
.rd-notulen-tampil :deep(h4) { margin: 12px 0 4px; font-size: 15px; color: #4338ca; }
.rd-notulen-tampil :deep(h5) { margin: 10px 0 2px; font-size: 14px; }
.rd-notulen-tampil :deep(p) { margin: 2px 0; }
.rd-notulen-tampil :deep(p.li) { padding-left: 12px; }
.rd-notulen-tampil :deep(hr) { border: 0; border-top: 1px dashed #cbd5e1; margin: 12px 0; }
.rd-kosong { text-align: center; padding: 28px 10px; color: #94a3b8; font-size: 13px; background: #fafafa; border-radius: 12px; margin: 0; }

/* Tindak lanjut */
.rd-tindak-baru { display: grid; grid-template-columns: minmax(0, 1fr) 170px 140px auto; gap: 6px; padding: 10px; background: #f8fafc; border-radius: 14px; border: 1px dashed #cbd5e1; }
.rd-tindak-baru input, .rd-tindak-baru select { border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 10px; font: inherit; font-size: 13px; background: #fff; min-width: 0; }
.rd-tindak { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rd-tindak li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #f1f5f9; border-radius: 12px; background: #fff; transition: background .15s; }
.rd-tindak li.beres { background: #f0fdf4; border-color: #dcfce7; }
.rd-tindak li.beres .rd-tindak-isi span { text-decoration: line-through; color: #64748b; }
.rd-tindak li.lewat { border-color: #fecaca; background: #fff7f7; }
.rd-centang { width: 24px; height: 24px; border-radius: 7px; border: 2px solid #cbd5e1; background: #fff; cursor: pointer; flex-shrink: 0; color: #fff; font-weight: 900; font-size: 13px; transition: all .15s; }
.rd-centang:hover:not(:disabled) { border-color: #16a34a; }
.rd-centang.on { background: #16a34a; border-color: #16a34a; }
.rd-tindak-isi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rd-tindak-isi span { font-size: 13.5px; font-weight: 600; color: #0f172a; }
.rd-tindak-isi small { font-size: 11.5px; color: #64748b; }
.rd-tindak li.lewat small b { color: #dc2626; }
.rd-tindak-pic { border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 6px; font-size: 12px; max-width: 150px; background: #fff; }
.rd-hapus { border: 0; background: none; cursor: pointer; opacity: .4; }
.rd-hapus:hover { opacity: 1; }

/* Modal undang */
.rd-overlay { position: fixed; inset: 0; z-index: 800; background: rgba(15, 23, 42, .55); backdrop-filter: blur(3px); display: flex; align-items: flex-start; justify-content: center; padding: 6vh 12px; }
.rd-modal { width: 100%; max-width: 520px; background: #fff; border-radius: 20px; padding: 18px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 30px 70px -20px rgba(15, 23, 42, .55); }
.rd-x { border: 0; background: #f1f5f9; width: 30px; height: 30px; border-radius: 50%; font-size: 18px; cursor: pointer; }
.rd-modal-kaki { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 1000px) { .rd-tata { grid-template-columns: 1fr; } .rd-kiri { position: static; } .rd-hero-aksi { max-width: none; justify-content: flex-start; } }
@media (max-width: 640px) {
  .rd-hero { padding: 18px; } .rd-hero h1 { font-size: 21px; }
  .rd-angka { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rd-tindak-baru { grid-template-columns: 1fr 1fr; } .rd-tindak-baru input:first-child { grid-column: 1 / -1; }
  .rd-lini-baris, .rd-lini-tanda { grid-template-columns: 80px 1fr; }
  .rd-tindak li { flex-wrap: wrap; } .rd-tindak-pic { max-width: none; }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
