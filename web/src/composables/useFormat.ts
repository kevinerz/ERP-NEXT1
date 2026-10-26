// Formatter bersama — dipakai lintas halaman agar tampilan angka/tanggal/status
// konsisten. Sebelumnya fmtRupiah/statusLabel disalin-tempel di banyak file
// dengan variasi kecil (mis. `Number(n)||0` vs `n||0`) yang rawan selisih hasil.

export function fmtRupiah(n: number | string | null | undefined): string {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID')
}

export function fmtRupiahPenuh(n: number | string | null | undefined): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(Number(n) || 0)
}

export function fmtDate(d: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', opts ?? { day: '2-digit', month: 'long', year: 'numeric' })
}

export function fmtDateShort(d: string | null | undefined): string {
  return fmtDate(d, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// Tanggal/bulan berjalan menurut zona waktu lokal (WIB), bukan UTC seperti
// toISOString() yang sebelum jam 07:00 masih menghasilkan tanggal kemarin.
export function todayLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function monthLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

// Nilai untuk <input type="datetime-local"> (YYYY-MM-DDTHH:mm, waktu lokal).
export function toDatetimeLocal(d: string | Date | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return `${todayLocal(dt)}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
}

export function statusLabel(s: string | null | undefined): string {
  return (s || '').replace(/_/g, ' ')
}

// Waktu relatif ("5 menit lalu"). compact=true pakai singkatan ("5m lalu") buat
// tempat sempit seperti dropdown notifikasi.
export function fmtRelativeTime(d: string | null | undefined, compact = false): string {
  if (!d) return '—'
  const diffMin = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (diffMin < 1) return 'baru saja'
  if (diffMin < 60) return compact ? `${diffMin}m lalu` : `${diffMin} menit lalu`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return compact ? `${diffH}j lalu` : `${diffH} jam lalu`
  if (compact) return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} hari lalu`
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Escape teks sebelum disisipkan ke HTML (v-html, popup Leaflet, editor). */
export function escapeHtml(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
