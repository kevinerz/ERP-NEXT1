<script setup lang="ts">
// Pusat Gangguan — daftar tiket gangguan / helpdesk dengan KPI live, analitik, tabel & papan kanban,
// aksi cepat per tiket, aksi massal, ekspor CSV, auto-refresh, dan pintasan keyboard.
import { ref, computed, onMounted, onBeforeUnmount, watch, reactive } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useOperationsStore } from '@/stores/operations'
import { useAuthStore } from '@/stores/auth'
import { fmtDateTime, statusLabel } from '@/composables/useFormat'
import { useFilterUrl } from '@/composables/useFilterUrl'
import { confirmDialog, promptDialog, alertError, toast } from '@/composables/useDialog'
import { exportCsv } from '@/composables/useExport'
import BasePagination from '@/components/BasePagination.vue'
import CariPilih, { type OpsiCari } from '@/components/CariPilih.vue'
import AngkaNaik from '@/components/grafik/AngkaNaik.vue'
import GrafikTren from '@/components/grafik/GrafikTren.vue'
import GrafikDonat from '@/components/grafik/GrafikDonat.vue'
import GrafikBatang from '@/components/grafik/GrafikBatang.vue'
import BatangMendatar from '@/components/grafik/BatangMendatar.vue'
import CincinProgres from '@/components/grafik/CincinProgres.vue'
import { SERI } from '@/components/grafik/warna'

const router = useRouter()
const ops = useOperationsStore()
const auth = useAuthStore()

// ── Konstanta tampilan ───────────────────────────────────────────────────────
const AKTIF = ['Open', 'In_Progress', 'Pending_Customer']
const KOLOM = [
  { s: 'Open', judul: 'Open', ikon: '🆕', warna: '#2563eb' },
  { s: 'In_Progress', judul: 'Dikerjakan', ikon: '🔧', warna: '#d97706' },
  { s: 'Pending_Customer', judul: 'Menunggu pelanggan', ikon: '⏳', warna: '#7c3aed' },
  { s: 'Resolved', judul: 'Selesai', ikon: '✅', warna: '#16a34a' },
]
const STATUS_WARNA: Record<string, string> = { Open: '#2563eb', In_Progress: '#d97706', Pending_Customer: '#7c3aed', Resolved: '#16a34a', Closed: '#64748b' }
const PRIORITAS = [
  { p: 'Critical', ikon: '🔥', warna: '#dc2626', sla: 4 },
  { p: 'High', ikon: '⚠️', warna: '#ea580c', sla: 8 },
  { p: 'Medium', ikon: '🔷', warna: '#2563eb', sla: 24 },
  { p: 'Low', ikon: '🌿', warna: '#64748b', sla: 72 },
]
const PRIO = Object.fromEntries(PRIORITAS.map((x) => [x.p, x]))
const SUMBER = [
  { s: 'PRTG', ikon: '📡' }, { s: 'NOCaaS', ikon: '🛰️' }, { s: 'Internal', ikon: '🏢' }, { s: 'WhatsApp', ikon: '💬' },
  { s: 'WA', ikon: '💬' }, { s: 'Email', ikon: '✉️' }, { s: 'Telepon', ikon: '📞' }, { s: 'Portal', ikon: '🌐' }, { s: 'UptimeKuma', ikon: '📈' },
]
const SUMBER_IKON: Record<string, string> = Object.fromEntries(SUMBER.map((x) => [x.s, x.ikon]))
const TAMPILAN = [
  { k: 'aktif', label: 'Aktif', ikon: '🚨' },
  { k: 'tanpa_pic', label: 'Butuh PIC', ikon: '🙋' },
  { k: 'lewat_sla', label: 'Lewat SLA', ikon: '⏰' },
  { k: 'selesai_hari_ini', label: 'Selesai hari ini', ikon: '🎉' },
  { k: 'semua', label: 'Semua', ikon: '🗂️' },
]
const NOC_WARNA: Record<string, string> = { online: '#16a34a', partial: '#d97706', internet_ok: '#7c3aed', macet: '#ea580c', offline: '#dc2626' }
const TEMPLATE_JUDUL = ['Link down', 'Internet lambat', 'Koneksi putus-putus', 'Mati total', 'Port WAN down', 'Tidak bisa akses situs tertentu', 'Perangkat mati / restart']

// ── Filter (tersimpan di URL) ────────────────────────────────────────────────
const tampilan = ref('aktif')
const search = ref('')
const status = ref('')
const prioritas = ref('')
const sumber = ref('')
const teknisi = ref('')
const jenis = ref('')
const idSite = ref('')
const dari = ref('')
const sampai = ref('')
const urut = ref('terbaru')
const mode = ref<'tabel' | 'papan'>('tabel')
const page = ref(1)
useFilterUrl({ v: tampilan, q: search, status, prioritas, sumber, teknisi, jenis, site: idSite, dari, sampai, urut, mode, page })
if (status.value === 'Pending') status.value = 'Pending_Customer' // tautan lama dashboard
// Tautan lama "?status=X" (tanpa ?v=) → tampilkan semua dengan status itu
if (status.value && !AKTIF.includes(status.value) && tampilan.value === 'aktif') tampilan.value = 'semua'

const filterLanjut = ref(false)
const jumlahFilter = computed(() => [status.value, prioritas.value, sumber.value, teknisi.value, jenis.value, idSite.value, dari.value, sampai.value].filter(Boolean).length)

function params(extra: Record<string, any> = {}) {
  const p: Record<string, any> = { page: page.value, limit: 25, urut: urut.value }
  if (tampilan.value !== 'semua') p.tampilan = tampilan.value
  if (search.value.trim()) p.search = search.value.trim()
  if (status.value) p.status_tiket = status.value
  if (prioritas.value) p.prioritas = prioritas.value
  if (sumber.value) p.sumber_tiket = sumber.value
  if (teknisi.value) p.id_teknisi = teknisi.value
  if (jenis.value) p.jenis_gangguan = jenis.value
  if (idSite.value) p.id_site = idSite.value
  if (dari.value) p.dari = dari.value
  if (sampai.value) p.sampai = sampai.value
  return { ...p, ...extra }
}

// ── Data ─────────────────────────────────────────────────────────────────────
interface Insight {
  hari: number
  kpi: Record<string, number | null>
  tren: { label: string[]; masuk: number[]; selesai: number[] }
  per_jam: number[]
  per_sumber: { nama: string; n: number }[]
  per_jenis: { nama: string; n: number }[]
  per_prioritas: { nama: string; n: number }[]
  site_berulang: { id_site: number; nama: string; kode: string; n: number; aktif: number }[]
  beban_teknisi: { id: number | null; nama: string; n: number; kritis: number }[]
  jenis_list: string[]
}
const insight = ref<Insight | null>(null)
const hariInsight = ref(7)
const papan = ref<any[]>([])
const memuatPapan = ref(false)
const terakhir = ref<Date | null>(null)
const sekarang = ref(Date.now())

async function muatInsight(cekBaru = false) {
  try {
    const { data } = await api.get('/operations/insight', { params: { hari: hariInsight.value } })
    const lama = insight.value?.kpi.masuk_hari_ini ?? null
    insight.value = data.data
    const baru = (insight.value?.kpi.masuk_hari_ini ?? 0) - (lama ?? 0)
    if (cekBaru && lama !== null && baru > 0) {
      toast(`🔔 ${baru} gangguan baru masuk`, 'warning', 6000)
      denting()
    }
  } catch { /* panel analitik opsional */ }
}
async function muatDaftar() {
  if (mode.value === 'papan') return muatPapan()
  await ops.fetchList(params())
  terakhir.value = new Date()
}
async function muatPapan() {
  memuatPapan.value = true
  try {
    // Papan: tiket aktif + yang selesai hari ini, maksimal 300
    const p = params({ page: 1, limit: 300, urut: 'sla' })
    delete p.tampilan
    const [a, b] = await Promise.all([
      api.get('/operations', { params: { ...p, tampilan: tampilan.value === 'semua' || tampilan.value === 'selesai_hari_ini' ? 'aktif' : tampilan.value } }),
      api.get('/operations', { params: { ...p, tampilan: 'selesai_hari_ini', limit: 60 } }),
    ])
    papan.value = [...(a.data.data ?? []), ...(b.data.data ?? [])]
    terakhir.value = new Date()
  } catch (e: any) { ops.error = e?.response?.data?.message || 'Gagal memuat papan' }
  finally { memuatPapan.value = false }
}
function segarkan(cekBaru = false) { muatDaftar(); muatInsight(cekBaru) }
function terapkan() { page.value = 1; pilih.value = new Set(); muatDaftar() }

let tCari: ReturnType<typeof setTimeout> | undefined
watch(search, () => { clearTimeout(tCari); tCari = setTimeout(terapkan, 350) })
watch([tampilan, status, prioritas, sumber, teknisi, jenis, idSite, dari, sampai, urut, mode], terapkan)
watch(hariInsight, () => muatInsight())
// Status selesai dipilih saat tampilan "Aktif" → pindah ke "Semua" agar hasilnya tidak kosong
watch(status, (v) => { if (v && !AKTIF.includes(v) && ['aktif', 'tanpa_pic', 'lewat_sla'].includes(tampilan.value)) tampilan.value = 'semua' })

// Status router NOCaaS untuk tiket aktif yang tampil
const nocStatus = ref<Record<number, { status: string; label: string }>>({})
const barisTampil = computed<any[]>(() => (mode.value === 'papan' ? papan.value : ops.list))
watch(barisTampil, async (list) => {
  const ids = [...new Set(list.filter((t) => AKTIF.includes(t.status_tiket)).map((t) => t.id_site))].filter((id) => !(id in nocStatus.value))
  if (!ids.length) return
  try {
    const { data } = await api.get('/nocaas/status-site', { params: { ids: ids.slice(0, 200).join(',') } })
    nocStatus.value = { ...nocStatus.value, ...data.data }
  } catch { /* NOCaaS opsional */ }
})
const nocDari = (t: any) => (AKTIF.includes(t.status_tiket) ? nocStatus.value[t.id_site] : undefined)

// ── Auto-refresh & jam ───────────────────────────────────────────────────────
const autoRefresh = ref(bacaLokal('gg-auto', '1') === '1')
const tampilAnalitik = ref(bacaLokal('gg-analitik', '1') === '1')
const suara = ref(bacaLokal('gg-suara', '0') === '1')
watch(autoRefresh, (v) => simpanLokal('gg-auto', v ? '1' : '0'))
watch(tampilAnalitik, (v) => simpanLokal('gg-analitik', v ? '1' : '0'))
watch(suara, (v) => simpanLokal('gg-suara', v ? '1' : '0'))
function bacaLokal(k: string, d: string) { try { return localStorage.getItem(k) ?? d } catch { return d } }
function simpanLokal(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* abaikan */ } }
function denting() {
  if (!suara.value) return
  try {
    const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain()
    o.frequency.value = 880; g.gain.setValueAtTime(0.08, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4)
  } catch { /* abaikan */ }
}
let tAuto: ReturnType<typeof setInterval> | undefined
let tJam: ReturnType<typeof setInterval> | undefined

// ── Format waktu ─────────────────────────────────────────────────────────────
function durasi(menit: number) {
  if (menit < 1) return 'baru saja'
  const h = Math.floor(menit / 1440), j = Math.floor((menit % 1440) / 60), m = Math.floor(menit % 60)
  return h ? `${h}h ${j}j` : j ? `${j}j ${m}m` : `${m}m`
}
const umurMenit = (t: any) => ((t.tgl_resolved ? +new Date(t.tgl_resolved) : sekarang.value) - +new Date(t.tgl_open)) / 60000
const fmtMenit = (n: number | null | undefined) => (n == null ? '—' : durasi(n))
const sejak = computed(() => {
  if (!terakhir.value) return ''
  const d = Math.round((sekarang.value - +terakhir.value) / 1000)
  return d < 10 ? 'baru saja' : d < 60 ? `${d} dtk lalu` : `${Math.floor(d / 60)} mnt lalu`
})

/** SLA: persen terpakai (0–100+), label, nada */
function sla(t: any): { pct: number; label: string; nada: 'aman' | 'waspada' | 'lewat' | 'selesai' | 'telat' | 'none' } {
  const selesai = !AKTIF.includes(t.status_tiket)
  if (selesai) return t.sla_breached ? { pct: 100, label: 'Telat SLA', nada: 'telat' } : { pct: 100, label: 'Tepat SLA', nada: 'selesai' }
  if (!t.sla_due) return { pct: 0, label: '—', nada: 'none' }
  const mulai = +new Date(t.tgl_open), due = +new Date(t.sla_due)
  const pct = Math.max(0, ((sekarang.value - mulai) / Math.max(1, due - mulai)) * 100)
  const sisa = (due - sekarang.value) / 60000
  if (sisa <= 0) return { pct: 100, label: `lewat ${durasi(-sisa)}`, nada: 'lewat' }
  return { pct, label: `sisa ${durasi(sisa)}`, nada: pct >= 75 ? 'waspada' : 'aman' }
}
const inisial = (n?: string) => (n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
const warnaNama = (n?: string) => SERI[[...(n || '?')].reduce((s, c) => s + c.charCodeAt(0), 0) % SERI.length]

// ── Analitik turunan ─────────────────────────────────────────────────────────
const trenSeri = computed(() => insight.value ? [
  { nama: 'Masuk', nilai: insight.value.tren.masuk, warna: SERI[1] },
  { nama: 'Selesai', nilai: insight.value.tren.selesai, warna: SERI[2] },
] : [])
const trenLabel = computed(() => (insight.value?.tren.label ?? []).map((l) => new Date(`${l}T00:00:00+07:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })))
const trenPanjang = computed(() => (insight.value?.tren.label ?? []).map((l) => new Date(`${l}T00:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })))
const donatSumber = computed(() => (insight.value?.per_sumber ?? []).slice(0, 6).map((x, i) => ({ nama: `${SUMBER_IKON[x.nama] ?? '•'} ${x.nama}`, n: x.n, warna: SERI[i] })))
const batangJenis = computed(() => (insight.value?.per_jenis ?? []).map((x) => ({ nama: x.nama, n: x.n })))
const jamLabel = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const jamSekarang = computed(() => new Date(sekarang.value + 7 * 3600_000).getUTCHours())
const jamRawan = computed(() => {
  const a = insight.value?.per_jam ?? []
  const maks = Math.max(0, ...a)
  return maks ? a.indexOf(maks) : -1
})

// ── Pilihan & aksi massal ────────────────────────────────────────────────────
const pilih = ref<Set<number>>(new Set())
const semuaTerpilih = computed(() => ops.list.length > 0 && ops.list.every((t) => pilih.value.has(t.id_ticket)))
function togglePilih(id: number) { const s = new Set(pilih.value); s.has(id) ? s.delete(id) : s.add(id); pilih.value = s }
function togglSemua() { pilih.value = semuaTerpilih.value ? new Set() : new Set(ops.list.map((t) => t.id_ticket)) }
const massal = reactive({ buka: '' as '' | 'assign' | 'status' | 'prioritas', nilai: '' as any, jalan: false })

async function jalankanMassal(aksi: 'assign' | 'status' | 'prioritas' | 'jenis', nilai: any) {
  const n = pilih.value.size
  if (!n) return
  const teks: Record<string, string> = {
    assign: nilai ? `ditugaskan ke ${ops.teknisiList.find((x) => x.id_karyawan === Number(nilai))?.nama_lengkap ?? 'teknisi'}` : 'dilepas dari PIC',
    status: `diubah statusnya ke "${statusLabel(nilai)}"`,
    prioritas: `diubah prioritasnya ke ${nilai}`,
    jenis: `diisi jenis gangguan "${nilai}"`,
  }
  const notifWa = aksi === 'status'
  const ok = await confirmDialog({
    title: `${n} tiket akan ${teks[aksi]}`,
    message: notifWa ? 'Perubahan status mengirim notifikasi WhatsApp ke pelanggan seperti biasa. Lanjutkan?' : 'Lanjutkan?',
    confirmLabel: 'Ya, terapkan', variant: aksi === 'status' && ['Resolved', 'Closed'].includes(nilai) ? 'success' : 'default',
  })
  if (!ok) return
  massal.jalan = true
  try {
    const { data } = await api.post('/operations/massal', { ids: [...pilih.value], aksi, nilai })
    toast(data.message || 'Selesai', data.data?.gagal?.length ? 'warning' : 'success')
    pilih.value = new Set(); massal.buka = ''
    segarkan()
  } catch (e) { alertError(e, 'Aksi massal gagal') }
  finally { massal.jalan = false }
}
async function massalJenis() {
  const j = await promptDialog({ title: 'Isi jenis gangguan', message: `Untuk ${pilih.value.size} tiket terpilih`, placeholder: 'mis. Mati total, Port WAN down…', confirmLabel: 'Terapkan' })
  if (j?.trim()) jalankanMassal('jenis', j.trim())
}

// ── Aksi cepat per tiket ─────────────────────────────────────────────────────
const sibuk = ref<number | null>(null)
async function ubahStatus(t: any, ke: string, tanya = true) {
  if (t.status_tiket === ke) return
  if (tanya && !(await confirmDialog({
    title: `${t.nomor_tiket} → ${statusLabel(ke)}?`,
    message: `${t.site?.nama_site ?? ''}\nPelanggan akan menerima notifikasi WhatsApp perubahan status.`,
    confirmLabel: statusLabel(ke), variant: ['Resolved', 'Closed'].includes(ke) ? 'success' : 'default',
  }))) return false
  sibuk.value = t.id_ticket
  try {
    await ops.update(t.id_ticket, { status_tiket: ke })
    toast(`${t.nomor_tiket} → ${statusLabel(ke)}`)
    segarkan()
    return true
  } catch (e) { alertError(e, 'Gagal mengubah status'); return false }
  finally { sibuk.value = null }
}
async function ambil(t: any) {
  if (!auth.user?.id_karyawan) return alertError(null, 'Akun Anda belum terhubung ke data karyawan')
  if (!(await confirmDialog({ title: `Ambil ${t.nomor_tiket}?`, message: `Anda akan menjadi PIC untuk ${t.site?.nama_site ?? 'tiket ini'} dan status menjadi "Dikerjakan".`, confirmLabel: 'Ambil tiket' }))) return
  sibuk.value = t.id_ticket
  try {
    await ops.update(t.id_ticket, { id_teknisi_pic: auth.user.id_karyawan, ...(t.status_tiket === 'Open' ? { status_tiket: 'In_Progress' } : {}) })
    toast(`${t.nomor_tiket} sekarang milik Anda 💪`)
    segarkan()
  } catch (e) { alertError(e, 'Gagal mengambil tiket') }
  finally { sibuk.value = null }
}
async function salinNomor(t: any) {
  try { await navigator.clipboard.writeText(`${t.nomor_tiket} — ${t.judul_tiket} — ${t.site?.nama_site ?? ''}`); toast('Disalin ke clipboard', 'default', 2000) } catch { /* abaikan */ }
}
const buka = (t: any) => router.push(`/operations/${t.id_ticket}`)

// ── Papan (kanban) drag & drop ───────────────────────────────────────────────
const seret = ref<any | null>(null)
const kolomSorot = ref('')
const kartuKolom = (s: string) => papan.value.filter((t) => (s === 'Resolved' ? ['Resolved', 'Closed'].includes(t.status_tiket) : t.status_tiket === s))
async function jatuhkan(s: string) {
  kolomSorot.value = ''
  const t = seret.value; seret.value = null
  if (!t || t.status_tiket === s || (s === 'Resolved' && t.status_tiket === 'Closed')) return
  await ubahStatus(t, s)
}

// ── Ekspor CSV ───────────────────────────────────────────────────────────────
const mengekspor = ref(false)
async function ekspor() {
  mengekspor.value = true
  try {
    const semua: any[] = []
    for (let hal = 1; hal <= 10; hal++) {
      const { data } = await api.get('/operations', { params: params({ page: hal, limit: 500 }) })
      semua.push(...(data.data ?? []))
      if (hal >= (data.meta?.total_pages ?? 1)) break
    }
    exportCsv(`gangguan-${new Date().toISOString().slice(0, 10)}.csv`, [{
      headers: ['No. Tiket', 'Judul', 'Status', 'Prioritas', 'Sumber', 'Jenis Gangguan', 'Kode Site', 'Site', 'Pelanggan', 'Kota', 'Teknisi', 'Dibuka', 'Selesai', 'Durasi (menit)', 'SLA Due', 'Lewat SLA', 'Root Cause'],
      rows: semua.map((t) => [
        t.nomor_tiket, t.judul_tiket, statusLabel(t.status_tiket), t.prioritas, t.sumber_tiket, t.jenis_gangguan,
        t.site?.kode_site, t.site?.nama_site, t.site?.pelanggan?.nama_pelanggan, t.site?.kota,
        t.teknisi?.nama_lengkap ?? t.kontak_teknisi?.nama, fmtDateTime(t.tgl_open), t.tgl_resolved ? fmtDateTime(t.tgl_resolved) : '',
        Math.round(umurMenit(t)), t.sla_due ? fmtDateTime(t.sla_due) : '', t.sla_breached || (AKTIF.includes(t.status_tiket) && t.sla_due && +new Date(t.sla_due) < Date.now()) ? 'Ya' : 'Tidak', t.root_cause,
      ]),
    }])
    toast(`${semua.length} tiket diekspor`)
  } catch (e) { alertError(e, 'Ekspor gagal') }
  finally { mengekspor.value = false }
}

// ── Buat tiket ───────────────────────────────────────────────────────────────
const formBuka = ref(false)
const formKosong = () => ({ id_site: null as number | null, judul_tiket: '', deskripsi_masalah: '', prioritas: 'High', sumber_tiket: 'Internal', id_teknisi_pic: 0 })
const form = ref(formKosong())
const siteLabel = ref('')
const submitting = ref(false)
const formError = ref('')
async function cariSite(q: string): Promise<OpsiCari[]> {
  const r = await api.get('/master/site', { params: { search: q || undefined, limit: 30 } })
  return (r.data.data as any[]).map((s) => ({ value: s.id_site, label: `[${s.kode_site}] ${s.nama_site}`, sub: [s.pelanggan?.nama_pelanggan, s.kota].filter(Boolean).join(' · ') }))
}
function bukaForm() { form.value = formKosong(); siteLabel.value = ''; formError.value = ''; formBuka.value = true }
async function simpanTiket() {
  if (!form.value.id_site) { formError.value = 'Pilih site terlebih dahulu'; return }
  if (!form.value.judul_tiket.trim()) { formError.value = 'Judul tiket wajib diisi'; return }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...form.value, judul_tiket: form.value.judul_tiket.trim() }
    if (!payload.id_teknisi_pic) delete payload.id_teknisi_pic
    const r = await ops.create(payload)
    formBuka.value = false
    toast(`Tiket ${r.nomor_tiket ?? ''} dibuat`)
    router.push(`/operations/${r.id_ticket}`)
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal membuat tiket' }
  finally { submitting.value = false }
}

// ── Filter dari analitik ─────────────────────────────────────────────────────
function saringJenis(nama: string) { jenis.value = nama === 'Belum diisi' ? 'none' : nama; tampilan.value = 'semua'; filterLanjut.value = true }
function saringSumber(nama: string) { sumber.value = nama.replace(/^\S+\s/, ''); tampilan.value = 'semua'; filterLanjut.value = true }
function saringSite(s: { id_site: number }) { idSite.value = String(s.id_site); tampilan.value = 'semua'; filterLanjut.value = true }
function saringTeknisi(b: { id: number | null; nama: string }) {
  teknisi.value = b.id ? String(b.id) : b.nama === 'Belum ada PIC' ? 'none' : ''
  tampilan.value = 'aktif'; filterLanjut.value = true
}
function resetFilter() {
  search.value = ''; status.value = ''; prioritas.value = ''; sumber.value = ''; teknisi.value = ''; jenis.value = ''; idSite.value = ''; dari.value = ''; sampai.value = ''
}
function togglePrio(p: string) {
  const s = new Set(prioritas.value.split(',').filter(Boolean))
  s.has(p) ? s.delete(p) : s.add(p)
  prioritas.value = [...s].join(',')
}
const prioAktif = (p: string) => prioritas.value.split(',').includes(p)
const namaSiteFilter = computed(() => insight.value?.site_berulang.find((s) => String(s.id_site) === idSite.value)?.nama ?? `#${idSite.value}`)
const hitungTampilan = (k: string) => {
  const kpi = insight.value?.kpi
  if (!kpi) return null
  return k === 'aktif' ? kpi.aktif : k === 'tanpa_pic' ? kpi.tanpa_pic : k === 'lewat_sla' ? kpi.lewat_sla : k === 'selesai_hari_ini' ? kpi.selesai_hari_ini : null
}

// ── Pintasan keyboard ────────────────────────────────────────────────────────
const inputCari = ref<HTMLInputElement | null>(null)
const bantuan = ref(false)
function tombol(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) {
    if (e.key === 'Escape' && el === inputCari.value) { search.value = ''; el.blur() }
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-overlay, .dh-overlay')) return
  if (e.key === '/') { e.preventDefault(); inputCari.value?.focus() }
  else if (e.key === 'n') { e.preventDefault(); bukaForm() }
  else if (e.key === 'r') { e.preventDefault(); segarkan() }
  else if (e.key === 'k') { e.preventDefault(); mode.value = mode.value === 'papan' ? 'tabel' : 'papan' }
  else if (e.key === 'a') { e.preventDefault(); tampilAnalitik.value = !tampilAnalitik.value }
  else if (e.key === '?') { e.preventDefault(); bantuan.value = !bantuan.value }
  else if (e.key === 'Escape') { pilih.value = new Set(); bantuan.value = false }
  else if (/^[1-5]$/.test(e.key)) { tampilan.value = TAMPILAN[Number(e.key) - 1]!.k }
}

onMounted(async () => {
  ops.fetchTeknisiList()
  segarkan()
  tAuto = setInterval(() => { if (autoRefresh.value && document.visibilityState === 'visible' && !pilih.value.size && !seret.value) segarkan(true) }, 30_000)
  tJam = setInterval(() => { sekarang.value = Date.now() }, 15_000)
  window.addEventListener('keydown', tombol)
})
onBeforeUnmount(() => { clearInterval(tAuto); clearInterval(tJam); clearTimeout(tCari); window.removeEventListener('keydown', tombol) })
</script>

<template>
  <div class="page gg">
    <!-- ── HERO ─────────────────────────────────────────────────────────── -->
    <section class="gg-hero">
      <div class="gg-hero-kiri">
        <div class="gg-hero-judul">
          <span class="gg-radar" :class="{ diam: !autoRefresh }"><i /></span>
          <div>
            <h2>Pusat Gangguan</h2>
            <p>Pantau, tugaskan & tuntaskan gangguan pelanggan secara real-time</p>
          </div>
        </div>
        <div class="gg-hero-meta">
          <button type="button" class="gg-pil" :class="{ nyala: autoRefresh }" :aria-pressed="autoRefresh" @click="autoRefresh = !autoRefresh" title="Perbarui otomatis tiap 30 detik">
            {{ autoRefresh ? '🟢 Live' : '⏸️ Jeda' }}
          </button>
          <button type="button" class="gg-pil" :class="{ nyala: suara }" :aria-pressed="suara" @click="suara = !suara" title="Bunyi saat ada gangguan baru">
            {{ suara ? '🔔 Suara' : '🔕 Senyap' }}
          </button>
          <span v-if="sejak" class="gg-sejak">diperbarui {{ sejak }}</span>
        </div>
      </div>
      <div class="gg-hero-aksi">
        <button type="button" class="gg-btn-kaca" title="Muat ulang (R)" @click="segarkan()">🔄</button>
        <button type="button" class="gg-btn-kaca" :disabled="mengekspor" title="Ekspor CSV sesuai filter" @click="ekspor">{{ mengekspor ? '⏳' : '📥' }} <span class="hp-sembunyi">Ekspor</span></button>
        <button type="button" class="gg-btn-kaca" title="Pintasan keyboard (?)" @click="bantuan = !bantuan">⌨️</button>
        <button type="button" class="gg-btn-baru" @click="bukaForm">＋ Buat tiket <kbd>N</kbd></button>
      </div>
    </section>

    <div v-if="bantuan" class="gg-bantuan">
      <b>⌨️ Pintasan</b>
      <span><kbd>/</kbd> cari</span><span><kbd>N</kbd> tiket baru</span><span><kbd>R</kbd> muat ulang</span>
      <span><kbd>K</kbd> tabel ⇄ papan</span><span><kbd>A</kbd> analitik</span><span><kbd>1</kbd>–<kbd>5</kbd> tampilan</span><span><kbd>Esc</kbd> batal pilih</span>
      <button type="button" class="gg-x" aria-label="Tutup" @click="bantuan = false">✕</button>
    </div>

    <!-- ── KPI ───────────────────────────────────────────────────────────── -->
    <section class="gg-kpi">
      <button type="button" class="gg-k k-merah" :class="{ aktif: tampilan === 'aktif' }" @click="tampilan = 'aktif'">
        <span class="gg-k-ikon">🚨</span>
        <b><AngkaNaik :nilai="insight?.kpi.aktif ?? 0" /></b>
        <small>Gangguan aktif</small>
        <em v-if="insight">{{ insight.kpi.open }} open · {{ insight.kpi.proses }} dikerjakan · {{ insight.kpi.pending }} pending</em>
      </button>
      <button type="button" class="gg-k k-api" @click="prioritas = 'Critical'; tampilan = 'aktif'">
        <span class="gg-k-ikon">🔥</span>
        <b><AngkaNaik :nilai="insight?.kpi.kritis ?? 0" /></b>
        <small>Kritis aktif</small>
        <em>target SLA 4 jam</em>
      </button>
      <button type="button" class="gg-k k-oranye" :class="{ aktif: tampilan === 'lewat_sla', denyut: (insight?.kpi.lewat_sla ?? 0) > 0 }" @click="tampilan = 'lewat_sla'">
        <span class="gg-k-ikon">⏰</span>
        <b><AngkaNaik :nilai="insight?.kpi.lewat_sla ?? 0" /></b>
        <small>Lewat SLA</small>
        <em>{{ insight?.kpi.lewat_sla ? 'segera tangani!' : 'semua aman 👍' }}</em>
      </button>
      <button type="button" class="gg-k k-ungu" :class="{ aktif: tampilan === 'tanpa_pic' }" @click="tampilan = 'tanpa_pic'">
        <span class="gg-k-ikon">🙋</span>
        <b><AngkaNaik :nilai="insight?.kpi.tanpa_pic ?? 0" /></b>
        <small>Belum ada PIC</small>
        <em>klik untuk menugaskan</em>
      </button>
      <div class="gg-k k-biru">
        <span class="gg-k-ikon">📥</span>
        <b><AngkaNaik :nilai="insight?.kpi.masuk_hari_ini ?? 0" /></b>
        <small>Masuk hari ini</small>
        <em>tertua aktif: {{ fmtMenit(insight?.kpi.tertua_menit) }}</em>
      </div>
      <button type="button" class="gg-k k-hijau" :class="{ aktif: tampilan === 'selesai_hari_ini' }" @click="tampilan = 'selesai_hari_ini'">
        <span class="gg-k-ikon">🎉</span>
        <b><AngkaNaik :nilai="insight?.kpi.selesai_hari_ini ?? 0" /></b>
        <small>Selesai hari ini</small>
        <em>MTTR {{ fmtMenit(insight?.kpi.mttr_hari_ini) }}</em>
      </button>
      <div class="gg-k k-cincin">
        <CincinProgres :persen="insight?.kpi.sla_persen ?? 0" :ukuran="78" />
        <div>
          <small>Kepatuhan SLA</small>
          <em>{{ insight?.kpi.sla_persen == null ? 'belum ada data' : `${insight.hari} hari terakhir` }}</em>
          <em>MTTR rata-rata {{ fmtMenit(insight?.kpi.mttr_periode) }}</em>
        </div>
      </div>
    </section>

    <!-- ── ANALITIK ──────────────────────────────────────────────────────── -->
    <section class="gg-analitik-kepala">
      <button type="button" class="gg-lipat" :aria-expanded="tampilAnalitik" @click="tampilAnalitik = !tampilAnalitik">
        <span :class="{ putar: tampilAnalitik }">▸</span> 📊 Analitik gangguan
      </button>
      <div v-if="tampilAnalitik" class="gg-seg kecil">
        <button v-for="h in [7, 14, 30]" :key="h" type="button" :class="{ on: hariInsight === h }" @click="hariInsight = h">{{ h }} hari</button>
      </div>
    </section>
    <Transition name="gg-lipat">
      <section v-if="tampilAnalitik && insight" class="gg-analitik">
        <div class="gg-kartu lebar">
          <div class="gg-kartu-kepala"><h4>📈 Tren masuk vs selesai</h4><small>{{ insight.kpi.total_periode }} tiket · {{ insight.hari }} hari</small></div>
          <GrafikTren :label="trenLabel" :label-panjang="trenPanjang" :seri="trenSeri" :tinggi="190" judul-aria="Tren tiket masuk dan selesai per hari" />
        </div>
        <div class="gg-kartu">
          <div class="gg-kartu-kepala"><h4>🧭 Sumber</h4><small>klik untuk saring</small></div>
          <GrafikDonat :data="donatSumber" :ukuran="140" label-tengah="tiket" @pilih="(i) => saringSumber(i.nama)" />
        </div>
        <div class="gg-kartu">
          <div class="gg-kartu-kepala"><h4>🧩 Jenis gangguan</h4><small>klik untuk saring</small></div>
          <div v-if="!batangJenis.length" class="gg-kosong-kecil">Belum ada data</div>
          <div v-else class="gg-klik-batang">
            <button v-for="b in batangJenis" :key="b.nama" type="button" class="gg-batang-baris" @click="saringJenis(b.nama)">
              <span class="nama">{{ b.nama }}</span>
              <span class="trek"><i :style="{ width: `${(b.n / Math.max(1, batangJenis[0]!.n)) * 100}%` }" /></span>
              <b>{{ b.n }}</b>
            </button>
          </div>
        </div>
        <div class="gg-kartu lebar">
          <div class="gg-kartu-kepala">
            <h4>🕐 Jam rawan gangguan (WIB)</h4>
            <small v-if="jamRawan >= 0">paling sering pukul <b>{{ String(jamRawan).padStart(2, '0') }}:00</b></small>
          </div>
          <GrafikBatang :label="jamLabel" :label-panjang="jamLabel.map((j) => `Pukul ${j}:00–${j}:59`)" :seri="[{ nama: 'Tiket', nilai: insight.per_jam, warna: SERI[0] }]" :sorot="jamSekarang" :tinggi="150" judul-aria="Jumlah tiket per jam" />
        </div>
        <div class="gg-kartu">
          <div class="gg-kartu-kepala"><h4>🔁 Site paling sering gangguan</h4><small>{{ insight.hari }} hari</small></div>
          <div v-if="!insight.site_berulang.length" class="gg-kosong-kecil">Tidak ada site berulang 🎉</div>
          <ol v-else class="gg-rank">
            <li v-for="(s, i) in insight.site_berulang.slice(0, 7)" :key="s.id_site">
              <button type="button" @click="saringSite(s)">
                <span class="no" :class="`no${i}`">{{ i + 1 }}</span>
                <span class="nm"><b>{{ s.nama }}</b><small>{{ s.kode }}</small></span>
                <span v-if="s.aktif" class="gg-titik-merah" title="Masih ada gangguan aktif">●</span>
                <span class="jml">{{ s.n }}×</span>
              </button>
            </li>
          </ol>
        </div>
        <div class="gg-kartu">
          <div class="gg-kartu-kepala"><h4>👷 Beban PIC saat ini</h4><small>tiket aktif</small></div>
          <div v-if="!insight.beban_teknisi.length" class="gg-kosong-kecil">Tidak ada tiket aktif 🎉</div>
          <ul v-else class="gg-beban">
            <li v-for="b in insight.beban_teknisi.slice(0, 7)" :key="b.nama">
              <button type="button" @click="saringTeknisi(b)">
                <span class="ava" :style="{ background: b.nama === 'Belum ada PIC' ? '#94a3b8' : warnaNama(b.nama) }">{{ b.nama === 'Belum ada PIC' ? '?' : inisial(b.nama) }}</span>
                <span class="nm">{{ b.nama }}</span>
                <span v-if="b.kritis" class="gg-chip-kritis">🔥 {{ b.kritis }}</span>
                <span class="jml">{{ b.n }}</span>
              </button>
            </li>
          </ul>
        </div>
      </section>
    </Transition>

    <!-- ── TAMPILAN & TOOLBAR ────────────────────────────────────────────── -->
    <section class="gg-toolbar">
      <div class="gg-tab" role="tablist">
        <button v-for="(t, i) in TAMPILAN" :key="t.k" type="button" role="tab" :aria-selected="tampilan === t.k" :class="{ on: tampilan === t.k }" :title="`Pintasan: ${i + 1}`" @click="tampilan = t.k">
          {{ t.ikon }} {{ t.label }}
          <span v-if="hitungTampilan(t.k) != null" class="gg-tab-n" :class="{ merah: t.k === 'lewat_sla' && hitungTampilan(t.k) }">{{ hitungTampilan(t.k) }}</span>
        </button>
      </div>
      <div class="gg-cari-baris">
        <div class="gg-cari">
          <span>🔎</span>
          <input ref="inputCari" v-model="search" placeholder="Cari no. tiket, judul, site, kode site, pelanggan…" aria-label="Cari tiket" />
          <kbd v-if="!search">/</kbd>
          <button v-else type="button" class="gg-x" aria-label="Hapus pencarian" @click="search = ''">✕</button>
        </div>
        <div class="gg-prio-chip">
          <button v-for="p in PRIORITAS" :key="p.p" type="button" :class="{ on: prioAktif(p.p) }" :style="prioAktif(p.p) ? { background: p.warna, borderColor: p.warna } : { color: p.warna }" :aria-pressed="prioAktif(p.p)" @click="togglePrio(p.p)">
            {{ p.ikon }} {{ p.p }}
          </button>
        </div>
        <button type="button" class="gg-btn-filter" :class="{ on: filterLanjut || jumlahFilter }" :aria-expanded="filterLanjut" @click="filterLanjut = !filterLanjut">
          ⚙️ Filter <span v-if="jumlahFilter" class="gg-badge">{{ jumlahFilter }}</span>
        </button>
        <select v-model="urut" class="gg-select" aria-label="Urutkan">
          <option value="terbaru">↓ Terbaru</option>
          <option value="terlama">↑ Terlama</option>
          <option value="sla">⏰ SLA terdekat</option>
          <option value="update">✏️ Baru diubah</option>
        </select>
        <div class="gg-seg" role="group" aria-label="Mode tampilan">
          <button type="button" :class="{ on: mode === 'tabel' }" title="Tabel (K)" @click="mode = 'tabel'">☰ Tabel</button>
          <button type="button" :class="{ on: mode === 'papan' }" title="Papan kanban (K)" @click="mode = 'papan'">▦ Papan</button>
        </div>
      </div>
      <Transition name="gg-lipat">
        <div v-if="filterLanjut" class="gg-filter-lanjut">
          <label>Status
            <select v-model="status" class="gg-select">
              <option value="">Semua</option>
              <option v-for="k in ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed']" :key="k" :value="k">{{ statusLabel(k) }}</option>
            </select>
          </label>
          <label>Sumber
            <select v-model="sumber" class="gg-select">
              <option value="">Semua</option>
              <option v-for="s in SUMBER" :key="s.s" :value="s.s">{{ s.ikon }} {{ s.s }}</option>
            </select>
          </label>
          <label>PIC / teknisi
            <select v-model="teknisi" class="gg-select">
              <option value="">Semua</option>
              <option value="none">🙋 Belum ada PIC</option>
              <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="String(t.id_karyawan)">{{ t.nama_lengkap }}</option>
            </select>
          </label>
          <label>Jenis gangguan
            <select v-model="jenis" class="gg-select">
              <option value="">Semua</option>
              <option value="none">Belum diisi</option>
              <option v-for="j in insight?.jenis_list ?? []" :key="j" :value="j">{{ j }}</option>
            </select>
          </label>
          <label>Dibuka dari <input v-model="dari" type="date" class="gg-select" /></label>
          <label>sampai <input v-model="sampai" type="date" class="gg-select" /></label>
          <span v-if="idSite" class="gg-chip-site">📍 {{ namaSiteFilter }} <button type="button" aria-label="Hapus filter site" @click="idSite = ''">✕</button></span>
          <button v-if="jumlahFilter || search" type="button" class="gg-reset" @click="resetFilter">↺ Reset filter</button>
        </div>
      </Transition>
    </section>

    <div v-if="ops.error" class="alert alert-danger">{{ ops.error }}</div>

    <!-- ── TABEL ─────────────────────────────────────────────────────────── -->
    <section v-if="mode === 'tabel'" class="gg-tabel-kartu">
      <div v-if="ops.loading && !ops.list.length" class="gg-skeleton">
        <div v-for="i in 6" :key="i" class="gg-sk-baris" :style="{ animationDelay: `${i * 80}ms` }" />
      </div>
      <div v-else-if="!ops.list.length" class="gg-kosong">
        <div class="gg-kosong-ikon">{{ tampilan === 'aktif' || tampilan === 'lewat_sla' || tampilan === 'tanpa_pic' ? '🌤️' : '🔍' }}</div>
        <b>{{ tampilan === 'aktif' ? 'Tidak ada gangguan aktif — jaringan aman!' : tampilan === 'lewat_sla' ? 'Tidak ada tiket lewat SLA 🎯' : tampilan === 'tanpa_pic' ? 'Semua tiket sudah punya PIC 👏' : 'Tidak ada tiket yang cocok' }}</b>
        <small v-if="jumlahFilter || search">Coba longgarkan filter atau pencarian.</small>
      </div>
      <div v-else class="gg-tabel-wrap" :class="{ redup: ops.loading }">
        <table class="gg-tabel">
          <thead>
            <tr>
              <th class="c-cek"><input type="checkbox" :checked="semuaTerpilih" :indeterminate="pilih.size > 0 && !semuaTerpilih" aria-label="Pilih semua" @change="togglSemua" /></th>
              <th>Tiket</th>
              <th>Site & pelanggan</th>
              <th>Durasi</th>
              <th>SLA</th>
              <th>Status</th>
              <th>PIC</th>
              <th class="c-aksi"><span class="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <TransitionGroup tag="tbody" name="gg-baris">
            <tr v-for="t in ops.list" :key="t.id_ticket" v-baris
              :class="['gg-tr', `p-${t.prioritas}`, { dipilih: pilih.has(t.id_ticket), selesai: !AKTIF.includes(t.status_tiket), sibuk: sibuk === t.id_ticket }]"
              :style="{ '--prio': PRIO[t.prioritas]?.warna ?? '#94a3b8' }"
              @click="buka(t)">
              <td class="c-cek" @click.stop><input type="checkbox" :checked="pilih.has(t.id_ticket)" :aria-label="`Pilih ${t.nomor_tiket}`" @change="togglePilih(t.id_ticket)" /></td>
              <td class="c-tiket">
                <div class="gg-tiket-atas">
                  <span class="gg-prio" :class="{ denyut: t.prioritas === 'Critical' && AKTIF.includes(t.status_tiket) }" :style="{ background: PRIO[t.prioritas]?.warna }">{{ PRIO[t.prioritas]?.ikon }} {{ t.prioritas }}</span>
                  <span class="gg-nomor" title="Klik kanan baris untuk buka di tab baru">{{ t.nomor_tiket }}</span>
                </div>
                <div class="gg-judul">{{ t.judul_tiket }}</div>
                <div class="gg-tag">
                  <span class="gg-sumber">{{ SUMBER_IKON[t.sumber_tiket] ?? '•' }} {{ t.sumber_tiket }}</span>
                  <span v-if="t.jenis_gangguan" class="gg-jenis">🧩 {{ t.jenis_gangguan }}</span>
                  <span v-if="t._count?.work_orders" class="gg-jenis">🛠️ {{ t._count.work_orders }} WO</span>
                </div>
              </td>
              <td class="c-site">
                <div class="gg-site">{{ t.site?.nama_site || '—' }}</div>
                <small class="gg-pel">{{ t.site?.pelanggan?.nama_pelanggan }}<template v-if="t.site?.kota"> · {{ t.site.kota }}</template></small>
                <span v-if="nocDari(t)" class="gg-noc" :style="{ color: NOC_WARNA[nocDari(t)!.status], borderColor: NOC_WARNA[nocDari(t)!.status] }" title="Status router saat ini menurut NOCaaS">🛰️ {{ nocDari(t)!.label }}</span>
              </td>
              <td class="c-durasi">
                <b :class="{ lama: AKTIF.includes(t.status_tiket) && umurMenit(t) > 240 }">{{ durasi(umurMenit(t)) }}</b>
                <small>{{ fmtDateTime(t.tgl_open) }}</small>
              </td>
              <td class="c-sla">
                <div class="gg-sla" :class="`s-${sla(t).nada}`">
                  <span class="trek"><i :style="{ width: `${Math.min(100, sla(t).pct)}%` }" /></span>
                  <small>{{ sla(t).nada === 'lewat' ? '⏰ ' : sla(t).nada === 'selesai' ? '✓ ' : '' }}{{ sla(t).label }}</small>
                </div>
              </td>
              <td><span class="gg-status" :style="{ '--st': STATUS_WARNA[t.status_tiket] ?? '#64748b' }"><i />{{ statusLabel(t.status_tiket) }}</span></td>
              <td class="c-pic">
                <span v-if="t.teknisi || t.kontak_teknisi" class="gg-pic">
                  <span class="ava" :style="{ background: warnaNama(t.teknisi?.nama_lengkap ?? t.kontak_teknisi?.nama) }">{{ inisial(t.teknisi?.nama_lengkap ?? t.kontak_teknisi?.nama) }}</span>
                  <span class="nm">{{ t.teknisi?.nama_lengkap ?? t.kontak_teknisi?.nama }}<small v-if="t.kontak_teknisi">{{ t.kontak_teknisi.asal_vendor || 'vendor' }}</small></span>
                </span>
                <button v-else-if="AKTIF.includes(t.status_tiket)" type="button" class="gg-ambil" :disabled="sibuk === t.id_ticket" @click.stop="ambil(t)">🙋 Ambil</button>
                <span v-else class="muted">—</span>
              </td>
              <td class="c-aksi" @click.stop>
                <div class="gg-aksi">
                  <button v-if="t.status_tiket === 'Open'" type="button" title="Mulai kerjakan" :disabled="sibuk === t.id_ticket" @click="ubahStatus(t, 'In_Progress')">▶️</button>
                  <button v-if="AKTIF.includes(t.status_tiket)" type="button" title="Tandai selesai" :disabled="sibuk === t.id_ticket" @click="ubahStatus(t, 'Resolved')">✅</button>
                  <button type="button" title="Salin ringkasan tiket" @click="salinNomor(t)">📋</button>
                  <a :href="`/operations/${t.id_ticket}`" target="_blank" rel="noopener" title="Buka di tab baru">↗</a>
                </div>
              </td>
            </tr>
          </TransitionGroup>
        </table>
      </div>
      <div class="gg-kaki">
        <span class="muted">{{ ops.meta.total.toLocaleString('id-ID') }} tiket<template v-if="ops.meta.total_pages > 1"> · hal. {{ page }} / {{ ops.meta.total_pages }}</template></span>
        <BasePagination :page="page" :total-pages="ops.meta.total_pages" @change="(p: number) => { page = p; muatDaftar() }" />
      </div>
    </section>

    <!-- ── PAPAN KANBAN ──────────────────────────────────────────────────── -->
    <section v-else class="gg-papan" :class="{ redup: memuatPapan }">
      <div v-for="k in KOLOM" :key="k.s" class="gg-kolom" :class="{ sorot: kolomSorot === k.s }" :style="{ '--kol': k.warna }"
        @dragover.prevent="kolomSorot = k.s" @dragleave="kolomSorot = kolomSorot === k.s ? '' : kolomSorot" @drop.prevent="jatuhkan(k.s)">
        <div class="gg-kolom-kepala">
          <span>{{ k.ikon }} {{ k.judul }}</span>
          <b>{{ kartuKolom(k.s).length }}</b>
        </div>
        <div class="gg-kolom-isi">
          <div v-if="!kartuKolom(k.s).length" class="gg-kolom-kosong">{{ k.s === 'Resolved' ? 'Belum ada yang selesai hari ini' : 'Kosong ✨' }}</div>
          <TransitionGroup name="gg-kartu-anim">
            <article v-for="t in kartuKolom(k.s)" :key="t.id_ticket" v-baris class="gg-kanban" draggable="true"
              :style="{ '--prio': PRIO[t.prioritas]?.warna ?? '#94a3b8' }" :class="{ sibuk: sibuk === t.id_ticket }"
              @dragstart="seret = t" @dragend="seret = null; kolomSorot = ''" @click="buka(t)">
              <div class="gg-kanban-atas">
                <span class="gg-prio kecil" :style="{ background: PRIO[t.prioritas]?.warna }">{{ PRIO[t.prioritas]?.ikon }} {{ t.prioritas }}</span>
                <small class="gg-nomor">{{ t.nomor_tiket }}</small>
              </div>
              <b class="gg-kanban-site">{{ t.site?.nama_site || '—' }}</b>
              <small class="gg-kanban-judul">{{ t.judul_tiket }}</small>
              <div class="gg-sla" :class="`s-${sla(t).nada}`">
                <span class="trek"><i :style="{ width: `${Math.min(100, sla(t).pct)}%` }" /></span>
                <small>{{ sla(t).label }}</small>
              </div>
              <div class="gg-kanban-bawah">
                <span class="gg-sumber">{{ SUMBER_IKON[t.sumber_tiket] ?? '•' }} {{ durasi(umurMenit(t)) }}</span>
                <span v-if="nocDari(t)" class="gg-noc kecil" :style="{ color: NOC_WARNA[nocDari(t)!.status], borderColor: NOC_WARNA[nocDari(t)!.status] }">🛰️ {{ nocDari(t)!.label }}</span>
                <span v-if="t.teknisi || t.kontak_teknisi" class="ava kecil" :title="t.teknisi?.nama_lengkap ?? t.kontak_teknisi?.nama" :style="{ background: warnaNama(t.teknisi?.nama_lengkap ?? t.kontak_teknisi?.nama) }">{{ inisial(t.teknisi?.nama_lengkap ?? t.kontak_teknisi?.nama) }}</span>
                <button v-else-if="AKTIF.includes(t.status_tiket)" type="button" class="gg-ambil kecil" @click.stop="ambil(t)">🙋</button>
              </div>
            </article>
          </TransitionGroup>
        </div>
      </div>
      <p class="gg-papan-tips">💡 Seret kartu ke kolom lain untuk mengubah status · papan menampilkan maks. 300 tiket aktif + yang selesai hari ini</p>
    </section>

    <!-- ── BAR AKSI MASSAL ───────────────────────────────────────────────── -->
    <Transition name="gg-naik">
      <div v-if="pilih.size && mode === 'tabel'" class="gg-massal" role="toolbar" aria-label="Aksi massal">
        <b>{{ pilih.size }} dipilih</b>
        <div class="gg-massal-grup">
          <select :disabled="massal.jalan" aria-label="Tugaskan ke" @change="(e) => { const v = (e.target as HTMLSelectElement).value; (e.target as HTMLSelectElement).value = ''; if (v) jalankanMassal('assign', v === 'lepas' ? null : Number(v)) }">
            <option value="">👷 Tugaskan ke…</option>
            <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
            <option value="lepas">— Lepas PIC —</option>
          </select>
          <select :disabled="massal.jalan" aria-label="Ubah status" @change="(e) => { const v = (e.target as HTMLSelectElement).value; (e.target as HTMLSelectElement).value = ''; if (v) jalankanMassal('status', v) }">
            <option value="">🔁 Ubah status…</option>
            <option v-for="k in ['In_Progress', 'Pending_Customer', 'Resolved', 'Closed', 'Open']" :key="k" :value="k">{{ statusLabel(k) }}</option>
          </select>
          <select :disabled="massal.jalan" aria-label="Ubah prioritas" @change="(e) => { const v = (e.target as HTMLSelectElement).value; (e.target as HTMLSelectElement).value = ''; if (v) jalankanMassal('prioritas', v) }">
            <option value="">🎚️ Prioritas…</option>
            <option v-for="p in PRIORITAS" :key="p.p" :value="p.p">{{ p.ikon }} {{ p.p }}</option>
          </select>
          <button type="button" :disabled="massal.jalan" @click="massalJenis">🧩 Jenis gangguan</button>
        </div>
        <button type="button" class="gg-massal-batal" @click="pilih = new Set()">✕ Batal</button>
      </div>
    </Transition>

    <!-- ── MODAL BUAT TIKET ──────────────────────────────────────────────── -->
    <div v-if="formBuka" class="modal-overlay" @click.self="formBuka = false">
      <div class="modal gg-modal" role="dialog" aria-modal="true" aria-labelledby="gg-modal-judul">
        <div class="gg-modal-kepala">
          <div>
            <h3 id="gg-modal-judul">🎫 Tiket gangguan baru</h3>
            <small>Catat keluhan pelanggan & tugaskan teknisi</small>
          </div>
          <button type="button" class="btn-modal-close" aria-label="Tutup" @click="formBuka = false">✕</button>
        </div>
        <div class="modal-body gg-form">
          <label class="gg-field">
            <span class="form-label form-required">Site pelanggan</span>
            <CariPilih v-model="form.id_site" :cari="cariSite" :label-terpilih="siteLabel" placeholder="Ketik nama / kode site / pelanggan…" @pilih="(o) => (siteLabel = o?.label ?? '')" />
          </label>
          <label class="gg-field">
            <span class="form-label form-required">Judul gangguan</span>
            <input v-model="form.judul_tiket" class="form-input" maxlength="255" placeholder="Contoh: Link down sejak pagi" />
          </label>
          <div class="gg-template">
            <button v-for="j in TEMPLATE_JUDUL" :key="j" type="button" :class="{ on: form.judul_tiket === j }" @click="form.judul_tiket = j">{{ j }}</button>
          </div>
          <div class="gg-field">
            <span class="form-label">Prioritas</span>
            <div class="gg-prio-pilih">
              <button v-for="p in PRIORITAS" :key="p.p" type="button" :class="{ on: form.prioritas === p.p }" :style="{ '--pw': p.warna }" @click="form.prioritas = p.p">
                <span>{{ p.ikon }}</span><b>{{ p.p }}</b><small>SLA {{ p.sla }} jam</small>
              </button>
            </div>
          </div>
          <div class="gg-dua">
            <label class="gg-field">
              <span class="form-label">Sumber laporan</span>
              <select v-model="form.sumber_tiket" class="form-select">
                <option v-for="s in ['Internal', 'WhatsApp', 'Telepon', 'Email', 'PRTG']" :key="s" :value="s">{{ SUMBER_IKON[s] }} {{ s }}</option>
              </select>
            </label>
            <label class="gg-field">
              <span class="form-label">Teknisi PIC</span>
              <select v-model="form.id_teknisi_pic" class="form-select">
                <option :value="0">— Tugaskan nanti —</option>
                <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
              </select>
            </label>
          </div>
          <label class="gg-field">
            <span class="form-label">Deskripsi masalah</span>
            <textarea v-model="form.deskripsi_masalah" class="form-textarea" rows="3" placeholder="Gejala, sejak kapan, yang sudah dicoba pelanggan…" />
          </label>
          <div v-if="formError" class="alert alert-danger">{{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="formBuka = false">Batal</button>
          <button type="button" class="btn btn-primary" :disabled="submitting" @click="simpanTiket">{{ submitting ? 'Membuat…' : '🚀 Buat tiket' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gg { --gg-r: 16px; padding-bottom: 90px; }
.muted { color: #94a3b8; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
kbd { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 5px; border: 1px solid rgba(15, 23, 42, .18); border-bottom-width: 2px; font: 700 10.5px/16px ui-monospace, monospace; text-align: center; background: rgba(255, 255, 255, .7); color: #334155; }

/* HERO */
.gg-hero { position: relative; overflow: hidden; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 24px; border-radius: 22px; color: #fff; margin-bottom: 14px;
  background: radial-gradient(circle at 12% 20%, rgba(255, 255, 255, .18), transparent 40%), linear-gradient(120deg, #be123c 0%, #e11d48 30%, #f97316 70%, #f59e0b 100%); box-shadow: 0 14px 34px -14px rgba(225, 29, 72, .6); }
.gg-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px; border-radius: 50%; background: rgba(255, 255, 255, .08); }
.gg-hero-judul { display: flex; align-items: center; gap: 14px; }
.gg-hero h2 { margin: 0; font-size: 25px; font-weight: 900; letter-spacing: -.5px; color: #fff; }
.gg-hero p { margin: 2px 0 0; font-size: 13px; opacity: .9; }
.gg-radar { position: relative; width: 46px; height: 46px; border-radius: 50%; background: rgba(255, 255, 255, .18); display: grid; place-items: center; flex-shrink: 0; }
.gg-radar i { width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 0 rgba(255, 255, 255, .7); animation: gg-ping 1.8s infinite; }
.gg-radar.diam i { animation: none; opacity: .6; }
@keyframes gg-ping { 0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, .7); } 80%, 100% { box-shadow: 0 0 0 18px rgba(255, 255, 255, 0); } }
.gg-hero-meta { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.gg-pil { border: 1px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .12); color: #fff; border-radius: 99px; padding: 4px 11px; font-size: 12px; font-weight: 700; cursor: pointer; }
.gg-pil.nyala { background: rgba(255, 255, 255, .95); color: #be123c; }
.gg-sejak { font-size: 12px; opacity: .85; }
.gg-hero-aksi { display: flex; gap: 8px; position: relative; z-index: 1; flex-wrap: wrap; }
.gg-btn-kaca { border: 1px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .15); color: #fff; border-radius: 12px; padding: 9px 13px; font-weight: 700; font-size: 13.5px; cursor: pointer; backdrop-filter: blur(6px); transition: background .15s, transform .15s; }
.gg-btn-kaca:hover { background: rgba(255, 255, 255, .28); transform: translateY(-1px); }
.gg-btn-baru { border: 0; background: #fff; color: #be123c; border-radius: 12px; padding: 10px 16px; font-weight: 800; font-size: 14px; cursor: pointer; box-shadow: 0 6px 16px rgba(0, 0, 0, .15); transition: transform .15s; display: inline-flex; align-items: center; gap: 8px; }
.gg-btn-baru:hover { transform: translateY(-2px) scale(1.02); }
.gg-bantuan { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 14px; border-radius: 12px; background: #fff7ed; border: 1px dashed #fdba74; font-size: 12.5px; color: #7c2d12; margin-bottom: 14px; }
.gg-x { border: 0; background: none; cursor: pointer; color: #94a3b8; font-size: 13px; margin-left: auto; }

/* KPI */
.gg-kpi { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
.gg-k { --c: #2563eb; position: relative; text-align: left; border: 1px solid color-mix(in srgb, var(--c) 22%, #e2e8f0); background: linear-gradient(160deg, color-mix(in srgb, var(--c) 10%, #fff), #fff 70%); border-radius: var(--gg-r); padding: 13px 14px; display: flex; flex-direction: column; gap: 1px; cursor: pointer; font: inherit; color: inherit; transition: transform .18s, box-shadow .18s; animation: gg-muncul .45s both; }
.gg-k:nth-child(2) { animation-delay: 50ms } .gg-k:nth-child(3) { animation-delay: 100ms } .gg-k:nth-child(4) { animation-delay: 150ms } .gg-k:nth-child(5) { animation-delay: 200ms } .gg-k:nth-child(6) { animation-delay: 250ms } .gg-k:nth-child(7) { animation-delay: 300ms }
div.gg-k { cursor: default; }
.gg-k:hover { transform: translateY(-3px); box-shadow: 0 10px 22px -12px color-mix(in srgb, var(--c) 70%, transparent); }
.gg-k.aktif { outline: 2.5px solid var(--c); outline-offset: -1px; }
.gg-k-ikon { position: absolute; right: 10px; top: 8px; font-size: 22px; transition: transform .3s; }
.gg-k:hover .gg-k-ikon { transform: rotate(-12deg) scale(1.2); }
.gg-k b { font-size: 28px; font-weight: 900; color: var(--c); line-height: 1.05; letter-spacing: -1px; }
.gg-k small { font-size: 12px; font-weight: 700; color: #334155; }
.gg-k em { font-style: normal; font-size: 11px; color: #64748b; }
.k-merah { --c: #e11d48; } .k-api { --c: #dc2626; } .k-oranye { --c: #ea580c; } .k-ungu { --c: #7c3aed; } .k-biru { --c: #2563eb; } .k-hijau { --c: #16a34a; }
.k-cincin { --c: #0d9488; flex-direction: row; align-items: center; gap: 12px; grid-column: span 2; }
.k-cincin > div { display: flex; flex-direction: column; }
.gg-k.denyut { animation: gg-muncul .45s both, gg-denyut 1.6s 0.5s infinite; }
@keyframes gg-denyut { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 18%, transparent); } }
@keyframes gg-muncul { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }

/* ANALITIK */
.gg-analitik-kepala { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.gg-lipat { border: 0; background: none; font-weight: 800; font-size: 14px; color: #0f172a; cursor: pointer; padding: 4px 0; display: inline-flex; gap: 6px; align-items: center; }
.gg-lipat span { display: inline-block; transition: transform .2s; color: #94a3b8; }
.gg-lipat span.putar { transform: rotate(90deg); }
.gg-analitik { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.gg-kartu { background: #fff; border: 1px solid #e2e8f0; border-radius: var(--gg-r); padding: 14px; min-width: 0; animation: gg-muncul .4s both; }
.gg-kartu.lebar { grid-column: span 2; }
.gg-kartu-kepala { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.gg-kartu-kepala h4 { margin: 0; font-size: 13.5px; font-weight: 800; color: #0f172a; }
.gg-kartu-kepala small { font-size: 11px; color: #94a3b8; }
.gg-kosong-kecil { padding: 26px 0; text-align: center; color: #94a3b8; font-size: 12.5px; }
.gg-klik-batang { display: flex; flex-direction: column; gap: 6px; }
.gg-batang-baris { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; border: 0; background: none; padding: 3px 4px; border-radius: 8px; cursor: pointer; font: inherit; text-align: left; }
.gg-batang-baris:hover { background: #f8fafc; }
.gg-batang-baris .nama { font-size: 12px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-batang-baris .trek { height: 9px; border-radius: 99px; background: #f1f5f9; overflow: hidden; }
.gg-batang-baris .trek i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #6250d6, #e87ba4); animation: gg-isi .8s both; }
.gg-batang-baris b { font-size: 12px; color: #0f172a; }
@keyframes gg-isi { from { width: 0 !important; } }
.gg-rank, .gg-beban { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.gg-rank button, .gg-beban button { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; background: none; padding: 5px 6px; border-radius: 10px; cursor: pointer; font: inherit; text-align: left; transition: background .15s; }
.gg-rank button:hover, .gg-beban button:hover { background: #f8fafc; }
.gg-rank .no { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; font-size: 11px; font-weight: 800; background: #f1f5f9; color: #475569; flex-shrink: 0; }
.gg-rank .no0 { background: #fee2e2; color: #b91c1c; } .gg-rank .no1 { background: #ffedd5; color: #c2410c; } .gg-rank .no2 { background: #fef9c3; color: #a16207; }
.gg-rank .nm, .gg-beban .nm { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12.5px; overflow: hidden; }
.gg-rank .nm b { font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gg-rank .nm small { font-size: 10.5px; color: #94a3b8; }
.gg-beban .nm { flex-direction: row; white-space: nowrap; text-overflow: ellipsis; color: #0f172a; font-weight: 600; }
.jml { font-weight: 800; font-size: 13px; color: #0f172a; }
.gg-titik-merah { color: #dc2626; font-size: 10px; animation: gg-kedip 1.2s infinite; }
@keyframes gg-kedip { 50% { opacity: .25; } }
.gg-chip-kritis { font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: #fee2e2; color: #b91c1c; }
.ava { width: 26px; height: 26px; border-radius: 50%; color: #fff; font-size: 10.5px; font-weight: 800; display: inline-grid; place-items: center; flex-shrink: 0; box-shadow: 0 0 0 2px #fff; }
.ava.kecil { width: 22px; height: 22px; font-size: 9.5px; margin-left: auto; }

/* TOOLBAR */
.gg-toolbar { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg, #f8fafc) 92%, transparent); backdrop-filter: blur(8px); padding: 6px 0 10px; margin-bottom: 4px; }
.gg-tab { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; }
.gg-tab button { border: 1px solid #e2e8f0; background: #fff; border-radius: 12px; padding: 8px 13px; font-weight: 700; font-size: 13px; color: #475569; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
.gg-tab button:hover { border-color: #fda4af; color: #be123c; }
.gg-tab button.on { background: linear-gradient(120deg, #e11d48, #f97316); border-color: transparent; color: #fff; box-shadow: 0 6px 14px -8px rgba(225, 29, 72, .8); }
.gg-tab-n { min-width: 20px; padding: 0 6px; border-radius: 99px; background: #f1f5f9; color: #334155; font-size: 11px; line-height: 18px; text-align: center; }
.gg-tab button.on .gg-tab-n { background: rgba(255, 255, 255, .25); color: #fff; }
.gg-tab-n.merah { background: #dc2626; color: #fff; }
.gg-cari-baris { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.gg-cari { flex: 1 1 260px; display: flex; align-items: center; gap: 8px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 0 12px; height: 40px; transition: border-color .15s, box-shadow .15s; }
.gg-cari:focus-within { border-color: #fb7185; box-shadow: 0 0 0 4px rgba(251, 113, 133, .15); }
.gg-cari input { flex: 1; border: 0; outline: 0; background: none; font-size: 13.5px; min-width: 0; color: #0f172a; }
.gg-prio-chip { display: flex; gap: 5px; flex-wrap: wrap; }
.gg-prio-chip button { border: 1.5px solid #e2e8f0; background: #fff; border-radius: 99px; padding: 6px 11px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all .15s; }
.gg-prio-chip button.on { color: #fff; }
.gg-prio-chip button:hover { transform: translateY(-1px); }
.gg-btn-filter { border: 1.5px solid #e2e8f0; background: #fff; border-radius: 12px; height: 40px; padding: 0 13px; font-weight: 700; font-size: 13px; color: #475569; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.gg-btn-filter.on { border-color: #fb7185; color: #be123c; background: #fff1f2; }
.gg-badge { background: #e11d48; color: #fff; border-radius: 99px; font-size: 10.5px; padding: 0 6px; line-height: 17px; }
.gg-select { height: 40px; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 0 10px; background: #fff; font-size: 13px; color: #0f172a; cursor: pointer; }
.gg-seg { display: inline-flex; background: #f1f5f9; border-radius: 12px; padding: 3px; gap: 2px; }
.gg-seg button { border: 0; background: none; border-radius: 9px; padding: 0 12px; height: 34px; font-weight: 700; font-size: 12.5px; color: #64748b; cursor: pointer; transition: all .15s; }
.gg-seg button.on { background: #fff; color: #be123c; box-shadow: 0 1px 4px rgba(15, 23, 42, .12); }
.gg-seg.kecil button { height: 28px; font-size: 11.5px; padding: 0 10px; }
.gg-filter-lanjut { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-top: 10px; padding: 12px; background: #fff; border: 1px dashed #fda4af; border-radius: 14px; }
.gg-filter-lanjut label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .3px; }
.gg-filter-lanjut .gg-select { height: 36px; min-width: 150px; text-transform: none; }
.gg-chip-site { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; background: #fff1f2; color: #be123c; border-radius: 99px; font-size: 12.5px; font-weight: 700; }
.gg-chip-site button { border: 0; background: none; cursor: pointer; color: inherit; }
.gg-reset { height: 36px; border: 0; background: #fee2e2; color: #b91c1c; border-radius: 10px; padding: 0 12px; font-weight: 700; font-size: 12.5px; cursor: pointer; }

/* TABEL */
.gg-tabel-kartu { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; }
.gg-tabel-wrap { overflow-x: auto; transition: opacity .2s; }
.redup { opacity: .55; pointer-events: none; }
.gg-tabel { width: 100%; border-collapse: separate; border-spacing: 0; min-width: 1050px; }
.gg-tabel th { position: sticky; top: 0; background: #f8fafc; padding: 10px 12px; font-size: 10.5px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: .6px; text-align: left; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
.gg-tabel td { padding: 11px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; font-size: 13px; color: #0f172a; }
.gg-tr { cursor: pointer; transition: background .15s; }
.gg-tr td:first-child { box-shadow: inset 4px 0 0 var(--prio); }
.gg-tr:hover td { background: #fff7f7; }
.gg-tr.dipilih td { background: #fff1f2; }
.gg-tr.selesai td { opacity: .78; }
.gg-tr.selesai td:first-child { box-shadow: inset 4px 0 0 #22c55e; }
.gg-tr.sibuk { opacity: .5; pointer-events: none; }
.c-cek { width: 40px; text-align: center; }
.c-cek input { width: 16px; height: 16px; accent-color: #e11d48; cursor: pointer; }
.c-tiket { max-width: 340px; }
.gg-tiket-atas { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
.gg-prio { display: inline-flex; align-items: center; gap: 3px; color: #fff; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 99px; letter-spacing: .2px; white-space: nowrap; }
.gg-prio.kecil { font-size: 10px; padding: 1px 7px; }
.gg-prio.denyut { animation: gg-denyut-prio 1.4s infinite; }
@keyframes gg-denyut-prio { 50% { box-shadow: 0 0 0 4px rgba(220, 38, 38, .2); } }
.gg-nomor { font: 700 11.5px ui-monospace, monospace; color: #64748b; }
.gg-judul { font-weight: 700; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gg-tag { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.gg-sumber, .gg-jenis { font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 6px; background: #f1f5f9; color: #475569; white-space: nowrap; }
.gg-jenis { background: #f5f3ff; color: #6d28d9; }
.c-site { max-width: 260px; }
.gg-site { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-pel { display: block; color: #64748b; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-noc { display: inline-block; margin-top: 3px; font-size: 10.5px; font-weight: 700; padding: 0 7px; border: 1px solid; border-radius: 99px; background: #fff; white-space: nowrap; }
.gg-noc.kecil { margin-top: 0; }
.c-durasi { white-space: nowrap; }
.c-durasi b { display: block; font-size: 13.5px; }
.c-durasi b.lama { color: #dc2626; }
.c-durasi small { font-size: 11px; color: #94a3b8; }
.c-sla { min-width: 130px; }
.gg-sla { display: flex; flex-direction: column; gap: 3px; }
.gg-sla .trek { height: 6px; border-radius: 99px; background: #f1f5f9; overflow: hidden; }
.gg-sla .trek i { display: block; height: 100%; border-radius: 99px; transition: width .6s; }
.gg-sla small { font-size: 11px; font-weight: 700; white-space: nowrap; }
.s-aman .trek i { background: #22c55e; } .s-aman small { color: #15803d; }
.s-waspada .trek i { background: #f59e0b; } .s-waspada small { color: #b45309; }
.s-lewat .trek i { background: repeating-linear-gradient(45deg, #dc2626 0 6px, #ef4444 6px 12px); animation: gg-geser 1s linear infinite; background-size: 17px 17px; } .s-lewat small { color: #dc2626; }
.s-selesai .trek i { background: #86efac; } .s-selesai small { color: #16a34a; }
.s-telat .trek i { background: #fca5a5; } .s-telat small { color: #dc2626; }
.s-none small { color: #cbd5e1; }
@keyframes gg-geser { to { background-position: 17px 0; } }
.gg-status { --st: #64748b; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 99px; background: color-mix(in srgb, var(--st) 12%, #fff); color: var(--st); font-size: 11.5px; font-weight: 800; white-space: nowrap; }
.gg-status i { width: 7px; height: 7px; border-radius: 50%; background: var(--st); }
.c-pic { min-width: 140px; }
.gg-pic { display: inline-flex; align-items: center; gap: 7px; }
.gg-pic .nm { display: flex; flex-direction: column; font-size: 12.5px; font-weight: 600; line-height: 1.2; }
.gg-pic .nm small { font-size: 10.5px; color: #94a3b8; font-weight: 500; }
.gg-ambil { border: 1.5px dashed #c4b5fd; background: #f5f3ff; color: #6d28d9; border-radius: 10px; padding: 4px 10px; font-size: 12px; font-weight: 800; cursor: pointer; transition: all .15s; }
.gg-ambil:hover { background: #7c3aed; color: #fff; border-style: solid; transform: scale(1.04); }
.gg-ambil.kecil { margin-left: auto; padding: 1px 7px; }
.c-aksi { width: 130px; }
.gg-aksi { display: flex; gap: 3px; justify-content: flex-end; opacity: .35; transition: opacity .15s; }
.gg-tr:hover .gg-aksi, .gg-tr:focus-within .gg-aksi { opacity: 1; }
.gg-aksi button, .gg-aksi a { width: 30px; height: 30px; border: 1px solid #e2e8f0; background: #fff; border-radius: 9px; cursor: pointer; font-size: 13px; display: grid; place-items: center; text-decoration: none; color: #475569; transition: transform .12s, background .12s; }
.gg-aksi button:hover, .gg-aksi a:hover { transform: scale(1.12); background: #fff7ed; }
.gg-kaki { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px; border-top: 1px solid #f1f5f9; font-size: 12.5px; }
.gg-skeleton { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.gg-sk-baris { height: 54px; border-radius: 12px; background: linear-gradient(90deg, #f1f5f9 25%, #fafafa 50%, #f1f5f9 75%); background-size: 200% 100%; animation: gg-kilau 1.2s infinite; }
@keyframes gg-kilau { to { background-position: -200% 0; } }
.gg-kosong { padding: 60px 20px; text-align: center; display: flex; flex-direction: column; gap: 6px; align-items: center; color: #475569; }
.gg-kosong-ikon { font-size: 54px; animation: gg-melayang 3s ease-in-out infinite; }
.gg-kosong small { color: #94a3b8; }
@keyframes gg-melayang { 50% { transform: translateY(-8px); } }

/* PAPAN */
.gg-papan { display: grid; grid-template-columns: repeat(4, minmax(250px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 6px; transition: opacity .2s; }
.gg-kolom { --kol: #2563eb; background: color-mix(in srgb, var(--kol) 6%, #f8fafc); border: 1.5px solid color-mix(in srgb, var(--kol) 18%, #e2e8f0); border-radius: 18px; display: flex; flex-direction: column; min-height: 300px; max-height: 72vh; transition: all .15s; }
.gg-kolom.sorot { border-style: dashed; border-color: var(--kol); background: color-mix(in srgb, var(--kol) 14%, #fff); transform: scale(1.01); }
.gg-kolom-kepala { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px 8px; font-weight: 800; font-size: 13.5px; color: #0f172a; border-top: 4px solid var(--kol); border-radius: 18px 18px 0 0; }
.gg-kolom-kepala b { background: var(--kol); color: #fff; border-radius: 99px; padding: 0 9px; font-size: 12px; line-height: 21px; }
.gg-kolom-isi { padding: 4px 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.gg-kolom-kosong { text-align: center; padding: 30px 8px; color: #94a3b8; font-size: 12.5px; }
.gg-kanban { background: #fff; border-radius: 13px; padding: 10px 11px; border: 1px solid #e2e8f0; box-shadow: inset 4px 0 0 var(--prio), 0 1px 2px rgba(15, 23, 42, .04); cursor: grab; display: flex; flex-direction: column; gap: 5px; transition: transform .15s, box-shadow .15s; }
.gg-kanban:hover { transform: translateY(-2px) rotate(-.4deg); box-shadow: inset 4px 0 0 var(--prio), 0 10px 20px -12px rgba(15, 23, 42, .35); }
.gg-kanban:active { cursor: grabbing; }
.gg-kanban.sibuk { opacity: .45; }
.gg-kanban-atas { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.gg-kanban-site { font-size: 13px; line-height: 1.3; }
.gg-kanban-judul { color: #64748b; font-size: 11.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gg-kanban-bawah { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.gg-papan-tips { grid-column: 1 / -1; margin: 2px 0 0; font-size: 12px; color: #94a3b8; }

/* MASSAL */
.gg-massal { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 40; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: calc(100vw - 32px); background: #0f172a; color: #fff; padding: 10px 14px; border-radius: 16px; box-shadow: 0 20px 40px -12px rgba(15, 23, 42, .55); }
.gg-massal b { font-size: 13px; white-space: nowrap; }
.gg-massal-grup { display: flex; gap: 6px; flex-wrap: wrap; }
.gg-massal select, .gg-massal-grup button { height: 34px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .18); background: rgba(255, 255, 255, .08); color: #fff; font-size: 12.5px; font-weight: 700; padding: 0 10px; cursor: pointer; }
.gg-massal select option { color: #0f172a; }
.gg-massal-batal { border: 0; background: none; color: #fda4af; font-weight: 700; cursor: pointer; font-size: 12.5px; }

/* MODAL */
.gg-modal { max-width: 620px; }
.gg-modal-kepala { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 20px 14px; background: linear-gradient(120deg, #fff1f2, #fff7ed); border-bottom: 1px solid #fde2e2; border-radius: inherit; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.gg-modal-kepala h3 { margin: 0; font-size: 18px; font-weight: 900; }
.gg-modal-kepala small { color: #9a3412; font-size: 12px; }
.gg-form { display: flex; flex-direction: column; gap: 12px; }
.gg-field { display: flex; flex-direction: column; gap: 5px; }
.gg-template { display: flex; flex-wrap: wrap; gap: 5px; margin-top: -4px; }
.gg-template button { border: 1px solid #fecdd3; background: #fff; color: #be123c; border-radius: 99px; padding: 3px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer; transition: all .12s; }
.gg-template button:hover, .gg-template button.on { background: #e11d48; color: #fff; border-color: #e11d48; }
.gg-prio-pilih { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.gg-prio-pilih button { --pw: #64748b; border: 2px solid #e2e8f0; background: #fff; border-radius: 13px; padding: 9px 4px; display: flex; flex-direction: column; align-items: center; gap: 1px; cursor: pointer; transition: all .15s; }
.gg-prio-pilih button span { font-size: 20px; }
.gg-prio-pilih button b { font-size: 12.5px; color: var(--pw); }
.gg-prio-pilih button small { font-size: 10.5px; color: #94a3b8; }
.gg-prio-pilih button.on { border-color: var(--pw); background: color-mix(in srgb, var(--pw) 9%, #fff); transform: translateY(-2px); box-shadow: 0 8px 16px -10px var(--pw); }
.gg-dua { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* TRANSISI */
.gg-lipat-enter-active, .gg-lipat-leave-active { transition: opacity .25s, transform .25s; }
.gg-lipat-enter-from, .gg-lipat-leave-to { opacity: 0; transform: translateY(-6px); }
.gg-naik-enter-active, .gg-naik-leave-active { transition: opacity .25s, transform .25s; }
.gg-naik-enter-from, .gg-naik-leave-to { opacity: 0; transform: translate(-50%, 20px); }
.gg-baris-enter-active { transition: opacity .35s, transform .35s; }
.gg-baris-enter-from { opacity: 0; transform: translateX(-10px); }
.gg-kartu-anim-move, .gg-kartu-anim-enter-active { transition: transform .3s, opacity .3s; }
.gg-kartu-anim-enter-from { opacity: 0; transform: scale(.95); }

@media (max-width: 1200px) { .gg-analitik { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 768px) {
  .gg-hero { padding: 18px 16px; border-radius: 18px; }
  .gg-hero h2 { font-size: 21px; }
  .hp-sembunyi { display: none; }
  .gg-btn-baru kbd { display: none; }
  .gg-kpi { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .k-cincin { grid-column: span 2; }
  .gg-analitik { grid-template-columns: minmax(0, 1fr); }
  .gg-kartu.lebar { grid-column: auto; }
  .gg-cari { flex-basis: 100%; }
  .gg-cari input { font-size: 16px; }
  .gg-papan { grid-template-columns: repeat(4, 82vw); scroll-snap-type: x mandatory; }
  .gg-kolom { scroll-snap-align: start; }
  .gg-prio-pilih { grid-template-columns: repeat(2, 1fr); }
  .gg-dua { grid-template-columns: 1fr; }
  .gg-massal { bottom: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .gg *, .gg *::before, .gg *::after { animation: none !important; transition: none !important; }
}
</style>
