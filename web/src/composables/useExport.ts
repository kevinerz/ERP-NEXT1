// Export util — zero dependency. CSV dibuka mulus di Excel/LibreOffice.

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCell(v: any): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Cegah CSV/formula injection — Excel/LibreOffice mengeksekusi cell yang diawali
  // =, +, -, @ sebagai formula. Prefix kutip agar dibaca sebagai teks literal.
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  // Bungkus dengan quote bila mengandung koma, kutip, atau newline
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export interface CsvSection {
  title?: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
}

// Ekspor satu atau banyak "section" ke satu file CSV.
// BOM ﻿ di depan agar Excel membaca UTF-8 (karakter Indonesia aman).
export function exportCsv(filename: string, sections: CsvSection[]) {
  const lines: string[] = []
  for (const sec of sections) {
    if (sec.title) lines.push(escapeCell(sec.title))
    lines.push(sec.headers.map(escapeCell).join(','))
    for (const row of sec.rows) {
      lines.push(row.map(escapeCell).join(','))
    }
    lines.push('') // baris kosong pemisah antar-section
  }
  downloadBlob('﻿' + lines.join('\r\n'), filename, 'text/csv;charset=utf-8')
}
