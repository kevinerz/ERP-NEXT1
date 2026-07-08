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

export function statusLabel(s: string | null | undefined): string {
  return (s || '').replace(/_/g, ' ')
}
