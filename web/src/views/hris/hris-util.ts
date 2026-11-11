// Utilitas bersama HRIS — nuansa "buku tim": warna departemen bernada tanah, umur, masa kerja, ulang tahun, kelengkapan profil
import type { Karyawan } from '@/stores/hris'

export const DEPT: Record<string, { warna: string; lembut: string; ikon: string }> = {
  Management: { warna: '#7c2d12', lembut: '#fbeee6', ikon: '🏛️' },
  Sales: { warna: '#b45309', lembut: '#fdf3e2', ikon: '💼' },
  'Pre Sales': { warna: '#a16207', lembut: '#fbf5dc', ikon: '🔍' },
  CRM: { warna: '#9d174d', lembut: '#fbeaf1', ikon: '🤝' },
  Helpdesk: { warna: '#0f766e', lembut: '#e3f4f1', ikon: '🎧' },
  NOC: { warna: '#1e40af', lembut: '#e8eefb', ikon: '📡' },
  Teknisi: { warna: '#166534', lembut: '#e6f3ea', ikon: '🛠️' },
  Finance: { warna: '#4d7c0f', lembut: '#eef5e1', ikon: '💰' },
  AR: { warna: '#6b21a8', lembut: '#f2e9f9', ikon: '🧾' },
  AP: { warna: '#57534e', lembut: '#f1efed', ikon: '📤' },
}
export const infoDept = (d: string | null | undefined) => DEPT[d ?? ''] ?? { warna: '#475569', lembut: '#f1f5f9', ikon: '🏷️' }

export const inisial = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('') || '?'

const TZ = 'Asia/Jakarta'
const hariIni = () => new Date(new Date().toLocaleDateString('en-CA', { timeZone: TZ }) + 'T00:00:00')
export const tgl = (d?: string | null) => (d ? new Date(d).toLocaleDateString('id-ID', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }) : '—')
export const tglPendek = (d?: string | null) => (d ? new Date(d).toLocaleDateString('id-ID', { timeZone: TZ, day: 'numeric', month: 'short' }) : '—')

export function umur(lahir?: string | null) {
  if (!lahir) return null
  const l = new Date(lahir)
  const h = hariIni()
  let u = h.getFullYear() - l.getFullYear()
  if (h.getMonth() < l.getMonth() || (h.getMonth() === l.getMonth() && h.getDate() < l.getDate())) u--
  return u
}

/** Masa kerja dalam bulan */
export function masaKerjaBulan(gabung?: string | null) {
  if (!gabung) return null
  const g = new Date(gabung)
  const h = hariIni()
  return Math.max(0, (h.getFullYear() - g.getFullYear()) * 12 + h.getMonth() - g.getMonth() - (h.getDate() < g.getDate() ? 1 : 0))
}
export function masaKerjaTeks(gabung?: string | null) {
  const b = masaKerjaBulan(gabung)
  if (b == null) return '—'
  if (b < 1) return 'Baru bergabung'
  const t = Math.floor(b / 12)
  const s = b % 12
  return t ? `${t} th${s ? ` ${s} bln` : ''}` : `${s} bln`
}

/** Berapa hari lagi menuju tanggal (bulan & hari) berikutnya — untuk ulang tahun / hari jadi kerja */
export function hariMenuju(tanggal?: string | null) {
  if (!tanggal) return null
  const t = new Date(tanggal)
  const h = hariIni()
  let berikut = new Date(h.getFullYear(), t.getMonth(), t.getDate())
  if (berikut < h) berikut = new Date(h.getFullYear() + 1, t.getMonth(), t.getDate())
  return Math.round((+berikut - +h) / 86400_000)
}

export const FIELD_PROFIL: { kunci: keyof Karyawan | 'foto'; label: string }[] = [
  { kunci: 'foto', label: 'Foto' },
  { kunci: 'no_hp', label: 'No. HP' },
  { kunci: 'email', label: 'Email' },
  { kunci: 'tgl_bergabung', label: 'Tgl bergabung' },
  { kunci: 'tempat_lahir', label: 'Tempat lahir' },
  { kunci: 'tgl_lahir', label: 'Tgl lahir' },
  { kunci: 'jenis_kelamin', label: 'Jenis kelamin' },
  { kunci: 'agama', label: 'Agama' },
  { kunci: 'status_pernikahan', label: 'Status nikah' },
  { kunci: 'no_ktp', label: 'No. KTP' },
  { kunci: 'alamat_ktp', label: 'Alamat KTP' },
  { kunci: 'no_npwp', label: 'NPWP' },
  { kunci: 'pendidikan_terakhir', label: 'Pendidikan' },
  { kunci: 'kontak_darurat_nama', label: 'Kontak darurat' },
  { kunci: 'kontak_darurat_hp', label: 'HP kontak darurat' },
  { kunci: 'bank_nama', label: 'Bank' },
  { kunci: 'bank_no_rekening', label: 'No. rekening' },
]
export function kelengkapan(k: Karyawan & { ada_foto?: boolean }) {
  const kurang = FIELD_PROFIL.filter((f) => (f.kunci === 'foto' ? !(k.ada_foto || k.foto_url) : !String((k as any)[f.kunci] ?? '').trim()))
  return { persen: Math.round(((FIELD_PROFIL.length - kurang.length) / FIELD_PROFIL.length) * 100), kurang: kurang.map((f) => f.label) }
}

export function nomorWa(hp?: string | null) {
  const d = String(hp || '').replace(/\D/g, '')
  if (!d) return ''
  return d.startsWith('62') ? d : d.startsWith('0') ? `62${d.slice(1)}` : d
}
