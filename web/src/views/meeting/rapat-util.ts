// Utilitas bersama modul Meeting: kategori, avatar, waktu, kalender (.ics / Google Calendar)

export const KATEGORI = [
  { kode: 'Koordinasi', ikon: '🧭', warna: '#2563eb' },
  { kode: 'Mingguan', ikon: '🔁', warna: '#7c3aed' },
  { kode: '1on1', ikon: '🤝', warna: '#0d9488' },
  { kode: 'Proyek', ikon: '🏗️', warna: '#ea580c' },
  { kode: 'Klien', ikon: '💼', warna: '#db2777' },
  { kode: 'Pelatihan', ikon: '🎓', warna: '#16a34a' },
  { kode: 'Darurat', ikon: '🚨', warna: '#dc2626' },
  { kode: 'Lainnya', ikon: '📌', warna: '#64748b' },
] as const
export const infoKategori = (k: string | null | undefined) => KATEGORI.find((x) => x.kode === k) ?? { kode: k || 'Umum', ikon: '📹', warna: '#475569' }
export const labelKategori = (k: string | null | undefined) => (k === '1on1' ? '1-on-1' : k || 'Umum')

export const TEMPLAT = [
  { judul: 'Koordinasi NOC harian', kategori: 'Koordinasi', durasi: 30, agenda: '1. Gangguan aktif & SLA\n2. Jadwal visit teknisi\n3. Kendala & eskalasi' },
  { judul: 'Rapat mingguan tim', kategori: 'Mingguan', durasi: 60, agenda: '1. Capaian minggu lalu\n2. Target minggu ini\n3. Kendala\n4. Lain-lain' },
  { judul: 'Review proyek pasang baru', kategori: 'Proyek', durasi: 45, agenda: '1. Progres per site\n2. Material & vendor\n3. Risiko & keputusan' },
  { judul: '1-on-1', kategori: '1on1', durasi: 30, agenda: '1. Kabar & kendala\n2. Prioritas\n3. Pengembangan diri' },
  { judul: 'Presentasi ke klien', kategori: 'Klien', durasi: 60, agenda: '1. Perkenalan\n2. Paparan solusi\n3. Tanya jawab\n4. Langkah berikutnya' },
  { judul: 'Rapat darurat gangguan massal', kategori: 'Darurat', durasi: 30, agenda: '1. Dampak & cakupan\n2. Penyebab sementara\n3. Pembagian tugas\n4. Komunikasi ke pelanggan' },
]

export const STATUS_WARNA: Record<string, string> = { Berlangsung: '#16a34a', Terjadwal: '#2563eb', Selesai: '#64748b', Dibatalkan: '#dc2626' }
export const RESPON: Record<string, { label: string; ikon: string; warna: string }> = {
  hadir: { label: 'Hadir', ikon: '✅', warna: '#16a34a' },
  mungkin: { label: 'Mungkin', ikon: '🤔', warna: '#d97706' },
  tidak: { label: 'Tidak hadir', ikon: '❌', warna: '#dc2626' },
}
export const infoRespon = (k: string | null | undefined) => RESPON[k ?? ''] ?? { label: 'Belum', ikon: '…', warna: '#94a3b8' }

const PALET = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#16a34a', '#0891b2', '#9333ea', '#c2410c', '#4f46e5']
export function warnaNama(nama: string) {
  let h = 0
  for (const c of nama) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALET[h % PALET.length]
}
export const inisial = (n: string) => n.replace(/\(Anda\)|· Tamu/g, '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('') || '?'

// ── Waktu (zona WIB) ──────────────────────────────────────────────────────────
const TZ = 'Asia/Jakarta'
export const kunciHari = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })
export const jam = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '-')
export const tglPanjang = (d: string | Date) => new Date(d).toLocaleDateString('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const tglPendek = (d: string | Date) => new Date(d).toLocaleDateString('id-ID', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })

export function durasiTeks(menit: number) {
  if (menit < 1) return '< 1 mnt'
  const j = Math.floor(menit / 60)
  const m = Math.round(menit % 60)
  return j ? `${j} j${m ? ` ${m} mnt` : ''}` : `${m} mnt`
}

/** "dalam 25 mnt", "2 jam lagi", "besok 09.00" */
export function hitungMundur(target: string | Date, now = Date.now()) {
  const sel = (+new Date(target) - now) / 60_000
  if (sel <= 0) return 'sekarang'
  if (sel < 60) return `${Math.ceil(sel)} mnt lagi`
  if (sel < 24 * 60) return `${Math.floor(sel / 60)} j ${Math.round(sel % 60)} mnt lagi`
  const hari = Math.round(sel / 1440)
  return hari === 1 ? 'besok' : `${hari} hari lagi`
}

/** "02:15:09" sejak waktu tertentu */
export function lamaJalan(dari: string | Date, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - +new Date(dari)) / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(s / 3600) ? `${p(Math.floor(s / 3600))}:` : ''}${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

// ── Kalender ──────────────────────────────────────────────────────────────────
interface UntukKalender { id_rapat: number; judul: string; deskripsi?: string | null; jadwal_at: string | null; durasi_menit?: number | null; lokasi?: string | null }
const icsWaktu = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsTeks = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`)

export function unduhIcs(r: UntukKalender, asal: string) {
  if (!r.jadwal_at) return
  const mulai = new Date(r.jadwal_at)
  const akhir = new Date(+mulai + (r.durasi_menit || 60) * 60_000)
  const link = `${asal}/meeting/${r.id_rapat}`
  const isi = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NEXT1//ERP Meeting//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:rapat-${r.id_rapat}@1erp.nextone.id`,
    `DTSTAMP:${icsWaktu(new Date())}`,
    `DTSTART:${icsWaktu(mulai)}`,
    `DTEND:${icsWaktu(akhir)}`,
    `SUMMARY:${icsTeks(r.judul)}`,
    `DESCRIPTION:${icsTeks(`${r.deskripsi ? `${r.deskripsi}\n\n` : ''}Masuk rapat: ${link}`)}`,
    `LOCATION:${icsTeks(r.lokasi || link)}`,
    `URL:${link}`,
    'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${icsTeks(r.judul)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([isi], { type: 'text/calendar;charset=utf-8' }))
  a.download = `rapat-${r.id_rapat}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function linkGoogleCalendar(r: UntukKalender, asal: string) {
  if (!r.jadwal_at) return ''
  const mulai = new Date(r.jadwal_at)
  const akhir = new Date(+mulai + (r.durasi_menit || 60) * 60_000)
  const link = `${asal}/meeting/${r.id_rapat}`
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: r.judul, dates: `${icsWaktu(mulai)}/${icsWaktu(akhir)}`,
    details: `${r.deskripsi ? `${r.deskripsi}\n\n` : ''}Masuk rapat: ${link}`, location: r.lokasi || link,
  })
  return `https://calendar.google.com/calendar/render?${q}`
}

export async function salin(teks: string) {
  try { await navigator.clipboard.writeText(teks); return true } catch { return false }
}
