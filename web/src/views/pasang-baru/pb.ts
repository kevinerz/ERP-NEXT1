// Bersama untuk halaman Pasang Baru
// Tahap order setelah SPH disetujui. Sementara: OPS (pasang vendor ISP) → Terpasang; tahap berikutnya ditata menyusul.
export const TAHAP_ORDER = ['OPS', 'Terpasang'] as const

export const KELAS_TAHAP: Record<string, string> = {
  Draft: 'badge-gray', OPS: 'badge-purple', Terpasang: 'badge-green', Batal: 'badge-red',
}
export const KELAS_SPH: Record<string, string> = {
  Draft: 'badge-gray', 'Menunggu Director': 'badge-amber', Disetujui: 'badge-green', Ditolak: 'badge-red',
}

// Role yang memegang tahap (Admin & Director selalu boleh) — cermin dari backend
export const PEMEGANG: Record<string, string[]> = {
  Draft: ['Sales'], OPS: ['OPS', 'Manager_Ops'], Terpasang: ['OPS', 'Manager_Ops'],
}

export interface Layanan { id_layanan: number; nama_layanan: string }
export interface Vendor { id_vendor: number; nama_vendor: string; tipe_vendor: string }

/** Lama di tahap sekarang, mis. "3 hr" */
export function umur(d: string) {
  const jam = (Date.now() - new Date(d).getTime()) / 3600_000
  return jam < 24 ? `${Math.max(0, Math.floor(jam))} jam` : `${Math.floor(jam / 24)} hr`
}

/** "1.500.000" / "Rp 1,5jt" dari Excel → angka */
export function angka(s: string | number | null | undefined) {
  if (typeof s === 'number') return s
  const t = String(s ?? '').replace(/[^\d,.-]/g, '')
  if (!t) return 0
  // format Indonesia: titik ribuan, koma desimal
  return Number(t.replace(/\./g, '').replace(',', '.')) || 0
}

/** Tanggal dari Excel: 2026-11-10, 10/11/2026, 10-11-2026 → YYYY-MM-DD */
export function tanggal(s: string) {
  const t = (s || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return ''
}

// Survey: Draft (Sales) → OPS → [Teknis] → Siap SPH / Hold → Lanjut SPH
export const ALUR_SURVEY = ['Draft', 'OPS', 'Teknis', 'Siap SPH', 'Lanjut SPH'] as const
export const KELAS_SURVEY: Record<string, string> = {
  Draft: 'badge-gray', OPS: 'badge-purple', Teknis: 'badge-sky', 'Siap SPH': 'badge-green', Hold: 'badge-amber',
  'Lanjut SPH': 'badge-blue', Batal: 'badge-red',
}
export const DEPOSIT_JENIS = ['Kembali setelah pasang', 'Ditahan sampai berhenti'] as const
