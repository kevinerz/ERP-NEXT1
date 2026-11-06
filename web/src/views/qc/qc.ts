// Tipe, warna, dan ekspor Excel untuk halaman QC & evaluasi ERP
export interface QcCatatan {
  id: number; id_modul: number; jenis: string; judul: string; isi: string | null; prioritas: string; status: string
  pembuat: string; id_karyawan: number | null; selesai_at: string | null; created_at: string; updated_at: string
}
export interface QcModul {
  id: number; kode: string; grup: string; nama: string; path: string | null; deskripsi: string | null
  status: string; skor: number | null; pic: string | null; urutan: number; diubah_oleh: string | null; updated_at: string
  catatan: QcCatatan[]
}

export const WARNA_STATUS: Record<string, string> = {
  'Baik': '#16a34a', 'Perlu revisi': '#d97706', 'Kritis': '#dc2626', 'Belum dipakai': '#64748b', 'Belum dievaluasi': '#2563eb',
}
export const WARNA_PRIORITAS: Record<string, string> = { Tinggi: '#dc2626', Sedang: '#d97706', Rendah: '#64748b' }
export const IKON_JENIS: Record<string, string> = { Bug: '🐞', Revisi: '✏️', Upgrade: '🚀', Data: '🗂️', Keamanan: '🔒', Saran: '💡' }

const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase()
const tglId = (d: string | null) => (d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/** Unduh Excel (.xlsx): sheet Ringkasan, Modul, Catatan */
export async function eksporExcel(modul: QcModul[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ERP NEXT1'
  wb.created = new Date()
  const judulGaya = (ws: any) => {
    const r = ws.getRow(1)
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    r.alignment = { vertical: 'middle' }
    r.height = 20
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
  }

  // Ringkasan
  const semua = modul.flatMap((m) => m.catatan)
  const buka = semua.filter((c) => c.status === 'Baru' || c.status === 'Dikerjakan')
  const rs = wb.addWorksheet('Ringkasan')
  rs.columns = [{ header: 'Keterangan', key: 'k', width: 34 }, { header: 'Jumlah', key: 'n', width: 12 }]
  rs.addRows([
    { k: 'Tanggal ekspor', n: tglId(new Date().toISOString()) },
    { k: 'Jumlah modul', n: modul.length },
    ...Object.keys(WARNA_STATUS).map((s) => ({ k: `Modul — ${s}`, n: modul.filter((m) => m.status === s).length })),
    { k: 'Catatan total', n: semua.length },
    { k: 'Catatan terbuka', n: buka.length },
    ...Object.keys(WARNA_PRIORITAS).map((p) => ({ k: `Terbuka — prioritas ${p}`, n: buka.filter((c) => c.prioritas === p).length })),
    { k: 'Catatan selesai', n: semua.filter((c) => c.status === 'Selesai').length },
  ])
  judulGaya(rs)

  // Modul
  const ws = wb.addWorksheet('Modul')
  ws.columns = [
    { header: 'No', key: 'no', width: 5 }, { header: 'Grup', key: 'grup', width: 18 }, { header: 'Modul', key: 'nama', width: 28 },
    { header: 'Halaman', key: 'path', width: 22 }, { header: 'Kondisi', key: 'status', width: 17 }, { header: 'Skor (1–5)', key: 'skor', width: 10 },
    { header: 'PIC', key: 'pic', width: 18 }, { header: 'Catatan terbuka', key: 'buka', width: 10 }, { header: 'Tinggi', key: 'tinggi', width: 8 },
    { header: 'Deskripsi', key: 'deskripsi', width: 70 }, { header: 'Diperbarui', key: 'upd', width: 18 },
  ]
  modul.forEach((m, i) => {
    const b = m.catatan.filter((c) => c.status === 'Baru' || c.status === 'Dikerjakan')
    const row = ws.addRow({
      no: i + 1, grup: m.grup, nama: m.nama, path: m.path ?? '', status: m.status, skor: m.skor ?? '', pic: m.pic ?? '',
      buka: b.length, tinggi: b.filter((c) => c.prioritas === 'Tinggi').length, deskripsi: m.deskripsi ?? '', upd: tglId(m.updated_at),
    })
    row.getCell('status').font = { bold: true, color: { argb: argb(WARNA_STATUS[m.status] ?? '#334155') } }
    row.alignment = { vertical: 'top', wrapText: true }
  })
  judulGaya(ws)

  // Catatan
  const wc = wb.addWorksheet('Catatan')
  wc.columns = [
    { header: 'No', key: 'no', width: 5 }, { header: 'Grup', key: 'grup', width: 16 }, { header: 'Modul', key: 'modul', width: 24 },
    { header: 'Jenis', key: 'jenis', width: 11 }, { header: 'Prioritas', key: 'prioritas', width: 10 }, { header: 'Status', key: 'status', width: 12 },
    { header: 'Judul', key: 'judul', width: 50 }, { header: 'Detail', key: 'isi', width: 70 }, { header: 'Pembuat', key: 'pembuat', width: 22 },
    { header: 'Dibuat', key: 'dibuat', width: 17 }, { header: 'Selesai', key: 'selesai', width: 17 },
  ]
  let no = 0
  for (const m of modul) for (const c of m.catatan) {
    const row = wc.addRow({
      no: ++no, grup: m.grup, modul: m.nama, jenis: c.jenis, prioritas: c.prioritas, status: c.status, judul: c.judul, isi: c.isi ?? '',
      pembuat: c.pembuat, dibuat: tglId(c.created_at), selesai: tglId(c.selesai_at),
    })
    row.getCell('prioritas').font = { bold: true, color: { argb: argb(WARNA_PRIORITAS[c.prioritas] ?? '#334155') } }
    row.alignment = { vertical: 'top', wrapText: true }
  }
  judulGaya(wc)

  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `QC-ERP-NEXT1-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
