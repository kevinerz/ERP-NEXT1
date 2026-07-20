import DOMPurify from 'dompurify'
import { useSettingsStore } from '@/stores/settings'
import QRCode from 'qrcode'

function getCompany() {
  try {
    const s = useSettingsStore().settings
    return {
      name:    s.company_name  || 'PT Perdana Global Internet',
      brand:   s.company_brand || 'Next1',
      address: s.company_address || '',
      city:    s.company_city || '',
      phone:   s.company_phone || '',
      email:   s.company_email || '',
      npwp:    s.company_npwp || '',
      logo:    s.company_logo_url || '',
      footer:  s.invoice_footer || '',
    }
  } catch {
    return { name: 'PT Perdana Global Internet', brand: 'Next1', address: '', city: '', phone: '', email: '', npwp: '', logo: '', footer: '' }
  }
}

// Field freeform (catatan, deskripsi tugas, dll.) diselipkan mentah ke template
// HTML di bawah — tanpa sanitasi, isi field itu bisa membawa <script>/onerror
// yang jalan saat dokumen dibuka untuk di-print (stored XSS lintas-user).
// WHOLE_DOCUMENT: true supaya <style>/<head> dari template tetap utuh.
function sanitizeFullDocument(html: string): string {
  return DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'], FORCE_BODY: true })
}

export function printDocument(html: string) {
  const win = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes')
  if (!win) { alert('Pop-up diblokir browser. Izinkan pop-up untuk halaman ini.'); return }
  win.document.open()
  win.document.write(sanitizeFullDocument(html))
  win.document.close()
  win.onload = () => { win.focus(); win.print() }
}

function logoSvg() {
  const c = getCompany()
  if (c.logo) {
    return `<img src="${c.logo}" style="width:40px;height:40px;object-fit:contain;border-radius:6px;" />`
  }
  const abbr = c.brand.slice(0, 2).toUpperCase()
  return `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#1e3a8a"/>
    <text x="20" y="27" font-size="14" font-weight="800" fill="white" text-anchor="middle" font-family="Arial">${abbr}</text>
  </svg>`
}

function baseStyle() {
  return `<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; }
    .doc { max-width: 800px; margin: 0 auto; padding: 40px 48px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid #1e3a8a; padding-bottom:16px; margin-bottom:24px; }
    .header-left { display:flex; align-items:center; gap:12px; }
    .company-name { font-size:16pt; font-weight:800; color:#1e3a8a; line-height:1.1; }
    .company-sub { font-size:8pt; color:#64748b; margin-top:2px; }
    .doc-title-block { text-align:right; }
    .doc-title { font-size:14pt; font-weight:700; color:#1e3a8a; }
    .doc-nomor { font-size:10pt; color:#475569; margin-top:4px; }
    .doc-date { font-size:9pt; color:#94a3b8; margin-top:2px; }
    .section { margin-bottom:20px; }
    .section-title { font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:#1e3a8a; margin-bottom:10px; padding-bottom:4px; border-bottom:1px solid #e2e8f0; }
    table.info { width:100%; border-collapse:collapse; }
    table.info td { padding:5px 0; vertical-align:top; font-size:10pt; }
    table.info td:first-child { width:180px; color:#64748b; }
    table.info td:nth-child(2) { width:16px; color:#94a3b8; }
    table.info td:last-child { font-weight:600; color:#0f172a; }
    table.grid { width:100%; border-collapse:collapse; margin-top:8px; }
    table.grid th { background:#1e3a8a; color:#fff; padding:7px 10px; font-size:9pt; text-align:left; font-weight:600; }
    table.grid td { padding:6px 10px; font-size:10pt; border-bottom:1px solid #f1f5f9; }
    table.grid tr:nth-child(even) td { background:#f8fafc; }
    .signature-row { display:flex; gap:40px; margin-top:40px; }
    .sign-box { flex:1; text-align:center; }
    .sign-label { font-size:9pt; color:#64748b; margin-bottom:60px; }
    .sign-line { border-top:1.5px solid #334155; padding-top:6px; }
    .sign-name { font-size:10pt; font-weight:700; color:#0f172a; }
    .sign-jabatan { font-size:8pt; color:#64748b; }
    .badge { display:inline-block; padding:2px 10px; border-radius:10px; font-size:9pt; font-weight:600; }
    .badge-blue { background:#dbeafe; color:#1e40af; }
    .badge-green { background:#dcfce7; color:#15803d; }
    .badge-yellow { background:#fef9c3; color:#a16207; }
    .footer { margin-top:32px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:8pt; color:#94a3b8; display:flex; justify-content:space-between; }
    .desc-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; font-size:10pt; line-height:1.6; white-space:pre-wrap; }
    .no-print { display:none; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display:none !important; }
    }
  </style>`
}

function docFooter(nomor: string) {
  const c = getCompany()
  const now = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const footerText = c.footer ? `<span>${c.footer}</span>` : ''
  return `<div class="footer">${footerText}<span>Dicetak: ${now}</span><span>${nomor}</span></div>`
}

function companyHeader() {
  const c = getCompany()
  const sub = [c.address, c.city].filter(Boolean).join(', ')
  return `${logoSvg()}<div>
    <div class="company-name">${c.brand}</div>
    <div class="company-sub">${c.name}</div>
    ${sub ? `<div class="company-sub" style="font-size:8pt">${sub}</div>` : ''}
  </div>`
}

// ─────────────────────────────────────────────
// SURAT TUGAS WORK ORDER
// ─────────────────────────────────────────────
export function printSuratTugas(wo: any) {
  const tglJadwal = wo.tgl_jadwal ? new Date(wo.tgl_jadwal).toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) : '-'
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Surat Tugas ${wo.nomor_wo}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">SURAT TUGAS</div><div class="doc-nomor">${wo.nomor_wo}</div><div class="doc-date">Jadwal: ${tglJadwal}</div></div>
    </div>

    <div class="section">
      <div class="section-title">Informasi Penugasan</div>
      <table class="info">
        <tr><td>Nomor WO</td><td>:</td><td>${wo.nomor_wo}</td></tr>
        <tr><td>Jenis Pekerjaan</td><td>:</td><td>${wo.jenis_wo}</td></tr>
        <tr><td>Tanggal Pelaksanaan</td><td>:</td><td>${tglJadwal}</td></tr>
        <tr><td>Tipe Eksekutor</td><td>:</td><td>${wo.tipe_eksekutor?.replace('_', ' ')}</td></tr>
        ${wo.teknisi ? `<tr><td>Teknisi</td><td>:</td><td>${wo.teknisi.nama_lengkap}${wo.teknisi.jabatan ? ' — ' + wo.teknisi.jabatan : ''}</td></tr>` : ''}
        ${wo.vendor ? `<tr><td>Vendor</td><td>:</td><td>${wo.vendor.nama_vendor}</td></tr>` : ''}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Lokasi Pekerjaan</div>
      <table class="info">
        <tr><td>Site</td><td>:</td><td>${wo.site?.kode_site} — ${wo.site?.nama_site}</td></tr>
        <tr><td>Pelanggan</td><td>:</td><td>${wo.site?.pelanggan?.nama_pelanggan}</td></tr>
        <tr><td>Kota</td><td>:</td><td>${wo.site?.kota || '-'}</td></tr>
        <tr><td>Alamat</td><td>:</td><td>${wo.site?.alamat_lengkap || '-'}</td></tr>
        <tr><td>PIC Pelanggan</td><td>:</td><td>${wo.site?.pelanggan?.nama_pic_utama || '-'}</td></tr>
        <tr><td>No. Telp</td><td>:</td><td>${wo.site?.pelanggan?.no_telp || '-'}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Deskripsi Tugas</div>
      <div class="desc-box">${wo.deskripsi_tugas || '-'}</div>
    </div>

    ${wo.catatan_teknisi ? `<div class="section"><div class="section-title">Catatan Teknisi</div><div class="desc-box">${wo.catatan_teknisi}</div></div>` : ''}

    <div class="signature-row">
      <div class="sign-box"><div class="sign-label">Disiapkan oleh,</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">Manager Operasional</div></div></div>
      <div class="sign-box"><div class="sign-label">Dilaksanakan oleh,</div><div class="sign-line"><div class="sign-name">${wo.teknisi ? '( ' + wo.teknisi.nama_lengkap + ' )' : '( _________________________ )'}</div><div class="sign-jabatan">${wo.teknisi?.jabatan || 'Teknisi'}</div></div></div>
    </div>
    ${docFooter(wo.nomor_wo)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// BERITA ACARA
// ─────────────────────────────────────────────
export function printBeritaAcara(wo: any, ba: any) {
  const tglCetak = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
  const materialRows = ba.material?.length
    ? ba.material.map((m: any, i: number) => `<tr><td>${i+1}</td><td>${m.nama_material}</td><td>${m.spesifikasi || '-'}</td><td style="text-align:right">${m.jumlah}</td><td>${m.satuan || '-'}</td><td>${m.keterangan || '-'}</td></tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:12px">Tidak ada material</td></tr>`

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Berita Acara ${ba.nomor_ba}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">BERITA ACARA</div><div class="doc-nomor">${ba.nomor_ba}</div><div class="doc-date">${ba.jenis_ba?.replace('_', ' ')}</div></div>
    </div>

    <div class="section">
      <div class="section-title">Informasi Pekerjaan</div>
      <table class="info">
        <tr><td>Nomor BA</td><td>:</td><td>${ba.nomor_ba}</td></tr>
        <tr><td>Nomor WO</td><td>:</td><td>${wo.nomor_wo}</td></tr>
        <tr><td>Jenis BA</td><td>:</td><td>${ba.jenis_ba?.replace('_', ' ')}</td></tr>
        <tr><td>Jenis Pekerjaan</td><td>:</td><td>${wo.jenis_wo}</td></tr>
        <tr><td>Tanggal</td><td>:</td><td>${tglCetak}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Lokasi</div>
      <table class="info">
        <tr><td>Site</td><td>:</td><td>${wo.site?.kode_site} — ${wo.site?.nama_site}</td></tr>
        <tr><td>Pelanggan</td><td>:</td><td>${wo.site?.pelanggan?.nama_pelanggan}</td></tr>
        <tr><td>Alamat</td><td>:</td><td>${wo.site?.alamat_lengkap || wo.site?.kota || '-'}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Deskripsi Pekerjaan</div>
      <div class="desc-box">${wo.deskripsi_tugas || '-'}</div>
    </div>

    ${wo.catatan_teknisi ? `<div class="section"><div class="section-title">Hasil Pekerjaan / Catatan Teknisi</div><div class="desc-box">${wo.catatan_teknisi}</div></div>` : ''}
    ${ba.catatan ? `<div class="section"><div class="section-title">Catatan BA</div><div class="desc-box">${ba.catatan}</div></div>` : ''}

    <div class="section">
      <div class="section-title">Daftar Material</div>
      <table class="grid">
        <thead><tr><th>No</th><th>Nama Material</th><th>Spesifikasi</th><th style="text-align:right">Qty</th><th>Satuan</th><th>Keterangan</th></tr></thead>
        <tbody>${materialRows}</tbody>
      </table>
    </div>

    <p style="font-size:10pt;color:#475569;margin-bottom:8px;">Dengan ditandatanganinya dokumen ini, para pihak menyatakan bahwa pekerjaan di atas telah dilaksanakan sesuai dengan ketentuan yang berlaku.</p>

    <div class="signature-row">
      <div class="sign-box"><div class="sign-label">Yang melaksanakan,</div><div class="sign-line"><div class="sign-name">${ba.nama_penandatangan_next1 ? '( ' + ba.nama_penandatangan_next1 + ' )' : '( _________________________ )'}</div><div class="sign-jabatan">${getCompany().name}</div></div></div>
      <div class="sign-box"><div class="sign-label">Yang menerima,</div><div class="sign-line"><div class="sign-name">${ba.nama_penandatangan_pelanggan ? '( ' + ba.nama_penandatangan_pelanggan + ' )' : '( _________________________ )'}</div><div class="sign-jabatan">${ba.jabatan_penandatangan_pelanggan || wo.site?.pelanggan?.nama_pelanggan || 'Pelanggan'}</div></div></div>
    </div>
    ${docFooter(ba.nomor_ba)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// KONTRAK LAYANAN
// ─────────────────────────────────────────────
export function printKontrak(kt: any) {
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-'
  const fmtRp = (n: any) => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(Number(n) || 0)

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Kontrak ${kt.nomor_kontrak}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">KONTRAK LAYANAN</div><div class="doc-nomor">${kt.nomor_kontrak}</div><div class="doc-date">${fmtDate(kt.tgl_mulai)} s/d ${fmtDate(kt.tgl_berakhir)}</div></div>
    </div>

    <p style="font-size:10pt;color:#475569;margin-bottom:20px;line-height:1.7">
      Kontrak Layanan ini dibuat dan ditandatangani oleh para pihak sebagai dasar pelaksanaan layanan
      telekomunikasi dan internet antara <strong>${getCompany().name}</strong> dengan pelanggan tersebut di bawah ini.
    </p>

    <div class="section">
      <div class="section-title">Identitas Kontrak</div>
      <table class="info">
        <tr><td>Nomor Kontrak</td><td>:</td><td>${kt.nomor_kontrak}</td></tr>
        <tr><td>Status</td><td>:</td><td>${kt.status_kontrak}</td></tr>
        <tr><td>Tanggal Mulai</td><td>:</td><td>${fmtDate(kt.tgl_mulai)}</td></tr>
        <tr><td>Tanggal Berakhir</td><td>:</td><td>${fmtDate(kt.tgl_berakhir)}</td></tr>
        <tr><td>Durasi</td><td>:</td><td>${kt.durasi_bulan} bulan</td></tr>
        ${kt.quotation ? `<tr><td>Referensi Quotation</td><td>:</td><td>${kt.quotation.nomor_quotation}</td></tr>` : ''}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Data Pelanggan & Site</div>
      <table class="info">
        <tr><td>Pelanggan</td><td>:</td><td>${kt.site?.pelanggan?.nama_pelanggan || '-'}</td></tr>
        <tr><td>Site</td><td>:</td><td>${kt.site?.kode_site} — ${kt.site?.nama_site}</td></tr>
        <tr><td>Layanan</td><td>:</td><td>${kt.layanan?.nama_layanan || '-'}${kt.layanan?.kode_layanan ? ' (' + kt.layanan.kode_layanan + ')' : ''}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Nilai Kontrak</div>
      <table class="info">
        <tr><td>Harga MRC (Monthly)</td><td>:</td><td><strong>${fmtRp(kt.harga_mrc)}</strong> / bulan</td></tr>
        <tr><td>Harga OTC (One-time)</td><td>:</td><td><strong>${fmtRp(kt.harga_otc)}</strong></td></tr>
        <tr><td>Total Nilai Kontrak</td><td>:</td><td><strong>${fmtRp(Number(kt.harga_mrc) * Number(kt.durasi_bulan) + Number(kt.harga_otc))}</strong></td></tr>
      </table>
    </div>

    ${kt.catatan ? `<div class="section"><div class="section-title">Catatan</div><div class="desc-box">${kt.catatan}</div></div>` : ''}

    <div class="section">
      <div class="section-title">Ketentuan Umum</div>
      <ol style="padding-left:18px;font-size:10pt;color:#475569;line-height:1.8">
        <li>Layanan diberikan sesuai spesifikasi teknis yang tercantum dalam penawaran.</li>
        <li>Pembayaran MRC dilakukan setiap bulan paling lambat tanggal 10.</li>
        <li>Pemutusan kontrak sebelum berakhirnya masa berlaku dikenakan penalti.</li>
        <li>Gangguan layanan akan ditangani sesuai SLA yang berlaku.</li>
        <li>Kontrak ini tunduk pada hukum yang berlaku di Republik Indonesia.</li>
      </ol>
    </div>

    <div class="signature-row">
      <div class="sign-box"><div class="sign-label">Pihak Pertama,<br>${getCompany().name}</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">Direktur</div></div></div>
      <div class="sign-box"><div class="sign-label">Pihak Kedua,<br>${kt.site?.pelanggan?.nama_pelanggan || 'Pelanggan'}</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">Direktur / Pimpinan</div></div></div>
    </div>
    ${docFooter(kt.nomor_kontrak)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// SURAT PENAWARAN (QUOTATION)
// ─────────────────────────────────────────────
export function printQuotation(qt: any) {
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-'
  const fmtRp = (n: any) => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(Number(n) || 0)
  const totalKontrak = (Number(qt.harga_mrc) * 12 + Number(qt.harga_otc))

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Penawaran ${qt.nomor_quotation}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">SURAT PENAWARAN HARGA</div><div class="doc-nomor">${qt.nomor_quotation}</div><div class="doc-date">${fmtDate(qt.tgl_quotation)}</div></div>
    </div>

    <p style="font-size:10pt;color:#475569;margin-bottom:20px;line-height:1.7">
      Dengan hormat,<br>
      Bersama ini kami sampaikan penawaran harga layanan telekomunikasi dan internet kepada:
    </p>

    <div class="section">
      <div class="section-title">Kepada Yth.</div>
      <table class="info">
        <tr><td>Perusahaan</td><td>:</td><td><strong>${qt.opportunity?.lead?.nama_perusahaan || qt.opportunity?.lead?.nama_prospek || '-'}</strong></td></tr>
        <tr><td>Perihal</td><td>:</td><td>${qt.opportunity?.nama_opportunity || '-'}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Detail Penawaran</div>
      <table class="info">
        <tr><td>Nomor Penawaran</td><td>:</td><td>${qt.nomor_quotation}</td></tr>
        <tr><td>Tanggal Penawaran</td><td>:</td><td>${fmtDate(qt.tgl_quotation)}</td></tr>
        <tr><td>Berlaku Sampai</td><td>:</td><td>${fmtDate(qt.tgl_berlaku_sampai)}</td></tr>
        <tr><td>Layanan</td><td>:</td><td>${qt.opportunity?.layanan?.nama_layanan || '-'}</td></tr>
        <tr><td>Sales PIC</td><td>:</td><td>${qt.sales_pic?.nama_lengkap || '-'}${qt.sales_pic?.jabatan ? ' — ' + qt.sales_pic.jabatan : ''}</td></tr>
        <tr><td>Status</td><td>:</td><td>${qt.status_approval}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Harga Layanan</div>
      <table class="grid">
        <thead><tr><th>Komponen</th><th>Keterangan</th><th style="text-align:right">Harga</th></tr></thead>
        <tbody>
          <tr><td>MRC (Monthly Recurring Charge)</td><td>Biaya langganan per bulan</td><td style="text-align:right"><strong>${fmtRp(qt.harga_mrc)}</strong></td></tr>
          <tr><td>OTC (One Time Charge)</td><td>Biaya instalasi / setup</td><td style="text-align:right"><strong>${fmtRp(qt.harga_otc)}</strong></td></tr>
          <tr style="background:#f0fdf4"><td colspan="2" style="font-weight:700;color:#15803d">Estimasi Total Nilai (12 bulan)</td><td style="text-align:right;font-weight:700;color:#15803d">${fmtRp(totalKontrak)}</td></tr>
        </tbody>
      </table>
    </div>

    ${qt.catatan_approval ? `<div class="section"><div class="section-title">Catatan</div><div class="desc-box">${qt.catatan_approval}</div></div>` : ''}

    <div class="section">
      <div class="section-title">Ketentuan</div>
      <ol style="padding-left:18px;font-size:10pt;color:#475569;line-height:1.8">
        <li>Penawaran ini berlaku sampai dengan tanggal ${fmtDate(qt.tgl_berlaku_sampai)}.</li>
        <li>Harga belum termasuk PPN 11% kecuali disebutkan lain.</li>
        <li>Layanan akan aktif setelah penandatanganan kontrak dan pembayaran OTC.</li>
        <li>Spesifikasi teknis mengikuti dokumen teknis terpisah.</li>
      </ol>
    </div>

    <div class="signature-row">
      <div class="sign-box"><div class="sign-label">Hormat kami,<br>${getCompany().name}</div><div class="sign-line"><div class="sign-name">${qt.sales_pic ? '( ' + qt.sales_pic.nama_lengkap + ' )' : '( _________________________ )'}</div><div class="sign-jabatan">${qt.sales_pic?.jabatan || 'Sales'}</div></div></div>
      <div class="sign-box"><div class="sign-label">Menyetujui,</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">${qt.opportunity?.lead?.nama_perusahaan || 'Pelanggan'}</div></div></div>
    </div>
    ${docFooter(qt.nomor_quotation)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// BAST — BERITA ACARA SERAH TERIMA PROJECT
// ─────────────────────────────────────────────
export function printBAST(project: any) {
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-'
  const tglSelesai = project.tgl_actual_selesai || project.tgl_target_selesai
  const woRows = project.work_orders?.length
    ? project.work_orders.map((wo: any, i: number) => `<tr><td>${i+1}</td><td>${wo.nomor_wo}</td><td>${wo.jenis_wo}</td><td>${wo.teknisi?.nama_lengkap || wo.vendor?.nama_vendor || '-'}</td><td>${fmtDate(wo.tgl_jadwal)}</td></tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">Tidak ada Work Order terkait</td></tr>`

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>BAST ${project.nomor_project}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">BERITA ACARA SERAH TERIMA</div><div class="doc-nomor">${project.nomor_project}</div><div class="doc-date">${fmtDate(tglSelesai)}</div></div>
    </div>

    <p style="font-size:10pt;color:#475569;margin-bottom:20px;line-height:1.7">
      Pada hari ini telah dilaksanakan serah terima pekerjaan instalasi / layanan antara
      <strong>${getCompany().name}</strong> dengan pelanggan sebagaimana tercantum di bawah ini.
    </p>

    <div class="section">
      <div class="section-title">Informasi Project</div>
      <table class="info">
        <tr><td>Nomor Project</td><td>:</td><td>${project.nomor_project}</td></tr>
        <tr><td>Status</td><td>:</td><td>${project.status_project}</td></tr>
        <tr><td>Tanggal Mulai</td><td>:</td><td>${fmtDate(project.tgl_mulai)}</td></tr>
        <tr><td>Tanggal Selesai</td><td>:</td><td>${fmtDate(tglSelesai)}</td></tr>
        <tr><td>Project Manager</td><td>:</td><td>${project.pm?.nama_lengkap || '-'}${project.pm?.jabatan ? ' — ' + project.pm.jabatan : ''}</td></tr>
        ${project.kontrak ? `<tr><td>Nomor Kontrak</td><td>:</td><td>${project.kontrak.nomor_kontrak}</td></tr>` : ''}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Lokasi</div>
      <table class="info">
        <tr><td>Site</td><td>:</td><td>${project.site?.kode_site} — ${project.site?.nama_site}</td></tr>
        <tr><td>Kota</td><td>:</td><td>${project.site?.kota || '-'}</td></tr>
        <tr><td>Alamat</td><td>:</td><td>${project.site?.alamat_lengkap || '-'}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Daftar Pekerjaan yang Diserahterimakan</div>
      <table class="grid">
        <thead><tr><th>No</th><th>Nomor WO</th><th>Jenis</th><th>Pelaksana</th><th>Tanggal</th></tr></thead>
        <tbody>${woRows}</tbody>
      </table>
    </div>

    ${project.catatan ? `<div class="section"><div class="section-title">Catatan</div><div class="desc-box">${project.catatan}</div></div>` : ''}

    <p style="font-size:10pt;color:#475569;margin-top:16px;line-height:1.7">
      Demikian Berita Acara Serah Terima ini dibuat dengan sebenarnya dan para pihak menyatakan
      bahwa seluruh pekerjaan telah diselesaikan sesuai spesifikasi yang disepakati.
    </p>

    <div class="signature-row">
      <div class="sign-box"><div class="sign-label">Diserahkan oleh,<br>${getCompany().name}</div><div class="sign-line"><div class="sign-name">${project.pm ? '( ' + project.pm.nama_lengkap + ' )' : '( _________________________ )'}</div><div class="sign-jabatan">Project Manager</div></div></div>
      <div class="sign-box"><div class="sign-label">Diterima oleh,<br>Pelanggan</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">Pimpinan / PIC</div></div></div>
    </div>
    ${docFooter(project.nomor_project)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// LAPORAN TIKET / SURAT LAPORAN GANGGUAN
// ─────────────────────────────────────────────
export function printLaporanTiket(tiket: any) {
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-'
  const fmtDt = (d: string | null) => d ? new Date(d).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-'

  const PRIO_COLOR: Record<string,string> = { Critical:'#dc2626', High:'#ea580c', Medium:'#ca8a04', Low:'#16a34a' }
  const logRows = tiket.logs?.length
    ? tiket.logs.slice().reverse().map((l: any) => `<tr>
        <td>${fmtDt(l.created_at)}</td>
        <td>${l.user?.karyawan?.nama_lengkap || '-'}</td>
        <td>${l.status_dari || '-'} → ${l.status_ke || '-'}</td>
        <td>${l.catatan || '-'}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px">Tidak ada log</td></tr>`

  const woRows = tiket.work_orders?.length
    ? tiket.work_orders.map((wo: any, i: number) => `<tr><td>${i+1}</td><td>${wo.nomor_wo}</td><td>${wo.jenis_wo}</td><td>${wo.teknisi?.nama_lengkap || wo.vendor?.nama_vendor || '-'}</td><td>${wo.status_wo}</td></tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">Tidak ada WO</td></tr>`

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Laporan Tiket ${tiket.nomor_tiket}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">LAPORAN GANGGUAN</div><div class="doc-nomor">${tiket.nomor_tiket}</div><div class="doc-date">${fmtDate(tiket.tgl_open)}</div></div>
    </div>

    <div class="section">
      <div class="section-title">Informasi Tiket</div>
      <table class="info">
        <tr><td>Nomor Tiket</td><td>:</td><td>${tiket.nomor_tiket}</td></tr>
        <tr><td>Judul</td><td>:</td><td><strong>${tiket.judul_tiket}</strong></td></tr>
        <tr><td>Prioritas</td><td>:</td><td><span style="color:${PRIO_COLOR[tiket.prioritas]||'#475569'};font-weight:700">${tiket.prioritas}</span></td></tr>
        <tr><td>Status</td><td>:</td><td>${tiket.status_tiket}</td></tr>
        <tr><td>Sumber</td><td>:</td><td>${tiket.sumber_tiket}</td></tr>
        <tr><td>Tanggal Buka</td><td>:</td><td>${fmtDt(tiket.tgl_open)}</td></tr>
        ${tiket.tgl_resolved ? `<tr><td>Tanggal Resolved</td><td>:</td><td>${fmtDt(tiket.tgl_resolved)}</td></tr>` : ''}
        ${tiket.tgl_closed ? `<tr><td>Tanggal Closed</td><td>:</td><td>${fmtDt(tiket.tgl_closed)}</td></tr>` : ''}
        <tr><td>Teknisi PIC</td><td>:</td><td>${tiket.teknisi?.nama_lengkap || '-'}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Lokasi</div>
      <table class="info">
        <tr><td>Site</td><td>:</td><td>${tiket.site?.kode_site} — ${tiket.site?.nama_site}</td></tr>
        <tr><td>Pelanggan</td><td>:</td><td>${tiket.site?.pelanggan?.nama_pelanggan}</td></tr>
        <tr><td>Layanan</td><td>:</td><td>${tiket.site?.layanan?.nama_layanan || '-'}</td></tr>
        <tr><td>Alamat</td><td>:</td><td>${tiket.site?.alamat_lengkap || tiket.site?.kota || '-'}</td></tr>
        <tr><td>PIC Pelanggan</td><td>:</td><td>${tiket.site?.pelanggan?.nama_pic_utama || '-'} | ${tiket.site?.pelanggan?.no_telp || '-'}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Deskripsi Masalah</div>
      <div class="desc-box">${tiket.deskripsi_masalah || '-'}</div>
    </div>

    <div class="section">
      <div class="section-title">Work Order Terkait</div>
      <table class="grid">
        <thead><tr><th>No</th><th>Nomor WO</th><th>Jenis</th><th>Pelaksana</th><th>Status</th></tr></thead>
        <tbody>${woRows}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Log Penanganan</div>
      <table class="grid">
        <thead><tr><th>Waktu</th><th>Oleh</th><th>Status</th><th>Catatan</th></tr></thead>
        <tbody>${logRows}</tbody>
      </table>
    </div>

    <div class="signature-row">
      <div class="sign-box"><div class="sign-label">Ditangani oleh,</div><div class="sign-line"><div class="sign-name">${tiket.teknisi ? '( ' + tiket.teknisi.nama_lengkap + ' )' : '( _________________________ )'}</div><div class="sign-jabatan">Teknisi / Helpdesk</div></div></div>
      <div class="sign-box"><div class="sign-label">Diketahui oleh,<br>${tiket.site?.pelanggan?.nama_pelanggan || 'Pelanggan'}</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">PIC Pelanggan</div></div></div>
    </div>
    ${docFooter(tiket.nomor_tiket)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// SURAT JALAN PENGIRIMAN PERANGKAT
// ─────────────────────────────────────────────
export function printSuratJalan(wo: any, pengiriman: any) {
  const fmtDt = (d: string | null) => d ? new Date(d).toLocaleString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-'
  const itemRows = pengiriman.items?.length
    ? pengiriman.items.map((item: any, i: number) => `<tr><td>${i+1}</td><td>${item.nama_perangkat || item.keterangan || '-'}</td><td>${item.serial_number || '-'}</td><td style="text-align:center">${item.jumlah || 1}</td><td>${item.kondisi || '-'}</td></tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">Tidak ada item perangkat</td></tr>`

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Surat Jalan ${wo.nomor_wo}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">SURAT JALAN</div><div class="doc-nomor">${wo.nomor_wo}</div><div class="doc-date">${fmtDt(pengiriman.created_at)}</div></div>
    </div>

    <div class="section">
      <div class="section-title">Informasi Pengiriman</div>
      <table class="info">
        <tr><td>Referensi WO</td><td>:</td><td>${wo.nomor_wo}</td></tr>
        <tr><td>Jenis Pengiriman</td><td>:</td><td>${pengiriman.jenis_pengiriman?.replace('_', ' ')}</td></tr>
        <tr><td>Status</td><td>:</td><td>${pengiriman.status_pengiriman}</td></tr>
        ${pengiriman.nomor_resi ? `<tr><td>Nomor Resi</td><td>:</td><td>${pengiriman.nomor_resi}</td></tr>` : ''}
        <tr><td>Tanggal</td><td>:</td><td>${fmtDt(pengiriman.created_at)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Tujuan Pengiriman</div>
      <table class="info">
        <tr><td>Site</td><td>:</td><td>${wo.site?.kode_site} — ${wo.site?.nama_site}</td></tr>
        <tr><td>Pelanggan</td><td>:</td><td>${wo.site?.pelanggan?.nama_pelanggan}</td></tr>
        <tr><td>Alamat</td><td>:</td><td>${wo.site?.alamat_lengkap || wo.site?.kota || '-'}</td></tr>
        <tr><td>PIC Penerima</td><td>:</td><td>${wo.site?.pelanggan?.nama_pic_utama || '-'}</td></tr>
        <tr><td>Telp</td><td>:</td><td>${wo.site?.pelanggan?.no_telp || '-'}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Daftar Perangkat</div>
      <table class="grid">
        <thead><tr><th>No</th><th>Nama Perangkat</th><th>Serial Number</th><th style="text-align:center">Qty</th><th>Kondisi</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    <div class="signature-row">
      <div class="sign-box"><div class="sign-label">Dikirim oleh,<br>${getCompany().name}</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">Pengirim</div></div></div>
      <div class="sign-box"><div class="sign-label">Diterima oleh,</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">Penerima / ${wo.site?.pelanggan?.nama_pelanggan || 'Pelanggan'}</div></div></div>
    </div>
    ${docFooter(wo.nomor_wo)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// INVOICE / TAGIHAN BULANAN
// ─────────────────────────────────────────────
export function printInvoice(kt: any, bulan?: string) {
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-'
  const fmtRp = (n: any) => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(Number(n) || 0)
  const now = new Date()
  const bulanLabel = bulan || now.toLocaleDateString('id-ID', { month:'long', year:'numeric' })
  const tglJatuhTempo = new Date(now.getFullYear(), now.getMonth(), 10)
  const nomorInv = `INV-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${String(kt.id_kontrak).padStart(4,'0')}`
  const ppn = Math.round(Number(kt.harga_mrc) * 0.11)
  const total = Number(kt.harga_mrc) + ppn

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Invoice ${nomorInv}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">INVOICE</div><div class="doc-nomor">${nomorInv}</div><div class="doc-date">Periode: ${bulanLabel}</div></div>
    </div>

    <div style="display:flex;gap:40px;margin-bottom:20px">
      <div style="flex:1">
        <div class="section-title" style="margin-bottom:8px">Ditagihkan kepada</div>
        <div style="font-size:13pt;font-weight:700;color:#0f172a">${kt.site?.pelanggan?.nama_pelanggan || '-'}</div>
        <div style="font-size:10pt;color:#64748b;margin-top:4px">${kt.site?.kode_site} — ${kt.site?.nama_site}</div>
      </div>
      <div style="flex:1;text-align:right">
        <table class="info" style="text-align:right">
          <tr><td style="color:#64748b">No. Invoice</td><td>:</td><td><strong>${nomorInv}</strong></td></tr>
          <tr><td style="color:#64748b">Tanggal</td><td>:</td><td>${fmtDate(now.toISOString())}</td></tr>
          <tr><td style="color:#64748b">Jatuh Tempo</td><td>:</td><td style="color:#dc2626;font-weight:700">${fmtDate(tglJatuhTempo.toISOString())}</td></tr>
          <tr><td style="color:#64748b">Ref. Kontrak</td><td>:</td><td>${kt.nomor_kontrak}</td></tr>
        </table>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Detail Tagihan — Periode ${bulanLabel}</div>
      <table class="grid">
        <thead><tr><th>Deskripsi Layanan</th><th>Layanan</th><th style="text-align:right">Jumlah</th></tr></thead>
        <tbody>
          <tr><td>MRC (Monthly Recurring Charge) — Periode ${bulanLabel}</td><td>${kt.layanan?.nama_layanan || '-'}</td><td style="text-align:right">${fmtRp(kt.harga_mrc)}</td></tr>
          <tr><td colspan="2" style="text-align:right;color:#64748b">Sub Total</td><td style="text-align:right">${fmtRp(kt.harga_mrc)}</td></tr>
          <tr><td colspan="2" style="text-align:right;color:#64748b">PPN 11%</td><td style="text-align:right">${fmtRp(ppn)}</td></tr>
          <tr style="background:#eff6ff"><td colspan="2" style="text-align:right;font-weight:700;color:#1e40af;font-size:12pt">TOTAL</td><td style="text-align:right;font-weight:700;color:#1e40af;font-size:12pt">${fmtRp(total)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px">
      <div class="section-title" style="border:none;padding:0;margin-bottom:8px">Informasi Pembayaran</div>
      <table class="info">
        <tr><td>Bank</td><td>:</td><td>BCA / Mandiri / BNI (sesuai konfirmasi tim Finance)</td></tr>
        <tr><td>Atas Nama</td><td>:</td><td>${getCompany().name}</td></tr>
        <tr><td>Jatuh Tempo</td><td>:</td><td style="color:#dc2626;font-weight:700">${fmtDate(tglJatuhTempo.toISOString())}</td></tr>
      </table>
      <p style="font-size:9pt;color:#94a3b8;margin-top:8px">Harap cantumkan nomor invoice pada bukti transfer. Keterlambatan pembayaran dikenakan denda 2% per bulan.</p>
    </div>

    ${docFooter(nomorInv)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// LAPORAN OPERASIONAL & BISNIS (rekap)
// ─────────────────────────────────────────────
export function printLaporan(payload: {
  periode?: string
  kpi?: any
  revenue?: any[]
  tiket?: any
  proyek?: any
  aset?: any
}) {
  const fmtRp = (n: any) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID')
  const k = payload.kpi || {}
  const t = payload.tiket || {}
  const p = payload.proyek || {}
  const a = payload.aset || {}

  const kpiRows = [
    ['Kontrak Aktif', k.kontrak_aktif ?? '-'],
    ['Kontrak Akan Berakhir', k.kontrak_akan_berakhir ?? '-'],
    ['Total MRC Aktif', fmtRp(k.total_mrc_aktif)],
    ['Tiket Open', k.tiket_open ?? '-'],
    ['Tiket In Progress', k.tiket_in_progress ?? '-'],
    ['Proyek Berjalan', k.proyek_berjalan ?? '-'],
    ['Aset di Gudang', k.aset_di_gudang ?? '-'],
  ].map(([l, v]) => `<tr><td>${l}</td><td>:</td><td>${v}</td></tr>`).join('')

  const gridSection = (title: string, headers: string[], rows: string[][]) => {
    if (!rows.length) return ''
    return `<div class="section">
      <div class="section-title">${title}</div>
      <table class="grid">
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`
  }

  const revenueRows = (payload.revenue || []).map((m: any) => [m.label, fmtRp(m.mrc)])
  const tiketStatusRows = (t.by_status || []).map((s: any) => [String(s.status).replace('_', ' '), String(s.count)])
  const proyekStatusRows = (p.by_status || []).map((s: any) => [s.status, String(s.count)])
  const asetStatusRows = (a.by_status || []).map((s: any) => [String(s.status).replace('_', ' '), `${s.count} unit`])
  const asetKatRows = (a.by_kategori || []).map((s: any) => [s.kategori, String(s.count)])

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Laporan ${payload.periode || ''}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">LAPORAN</div><div class="doc-nomor">Operasional & Bisnis</div>${payload.periode ? `<div class="doc-date">${payload.periode}</div>` : ''}</div>
    </div>

    <div class="section">
      <div class="section-title">Ringkasan (KPI)</div>
      <table class="info">${kpiRows}</table>
    </div>

    ${gridSection('Tren MRC Bulanan', ['Bulan', 'MRC'], revenueRows)}
    ${t.total !== undefined ? `<div class="section"><div class="section-title">Laporan Tiket</div><table class="info"><tr><td>Total Tiket</td><td>:</td><td>${t.total}</td></tr><tr><td>Selesai</td><td>:</td><td>${t.resolved ?? '-'}</td></tr><tr><td>Resolution Rate</td><td>:</td><td>${t.resolution_rate ?? '-'}%</td></tr></table></div>` : ''}
    ${gridSection('Tiket per Status', ['Status', 'Jumlah'], tiketStatusRows)}
    ${gridSection('Proyek per Status', ['Status', 'Jumlah'], proyekStatusRows)}
    ${gridSection('Aset per Status', ['Status', 'Jumlah'], asetStatusRows)}
    ${gridSection('Aset per Kategori', ['Kategori', 'Jumlah'], asetKatRows)}

    ${docFooter('Laporan')}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// INVOICE (dari modul Finance — data invoice nyata)
// ─────────────────────────────────────────────
export function printInvoiceDoc(inv: any) {
  const fmtRp = (n: any) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID')
  const pelanggan = inv.site?.pelanggan?.nama_pelanggan || '-'
  const sisa = (Number(inv.total) || 0) - (Number(inv.jumlah_dibayar) || 0)
  const statusLunas = inv.status === 'Lunas'

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Invoice ${inv.nomor_invoice}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${companyHeader()}</div>
      <div class="doc-title-block"><div class="doc-title">INVOICE</div><div class="doc-nomor">${inv.nomor_invoice}</div><div class="doc-date">Periode: ${inv.periode || '-'}</div></div>
    </div>

    <div class="section">
      <table class="info">
        <tr><td>Kepada</td><td>:</td><td><strong>${pelanggan}</strong></td></tr>
        <tr><td>Site</td><td>:</td><td>${inv.site?.kode_site || ''} — ${inv.site?.nama_site || '-'}</td></tr>
        ${inv.kontrak ? `<tr><td>Kontrak</td><td>:</td><td>${inv.kontrak.nomor_kontrak}</td></tr>` : ''}
        <tr><td>Tanggal Invoice</td><td>:</td><td>${fmtDate(inv.tgl_invoice)}</td></tr>
        <tr><td>Jatuh Tempo</td><td>:</td><td style="color:#dc2626;font-weight:700">${fmtDate(inv.tgl_jatuh_tempo)}</td></tr>
        <tr><td>Status</td><td>:</td><td>${String(inv.status).replace('_', ' ')}</td></tr>
      </table>
    </div>

    <div class="section">
      <table class="grid">
        <thead><tr><th>Deskripsi</th><th style="text-align:right">Jumlah</th></tr></thead>
        <tbody>
          <tr><td>${inv.catatan || 'Tagihan layanan'} (periode ${inv.periode || '-'})</td><td style="text-align:right">${fmtRp(inv.subtotal)}</td></tr>
          <tr><td style="text-align:right;color:#64748b">PPN ${Number(inv.ppn_persen)}%</td><td style="text-align:right">${fmtRp(inv.ppn_nominal)}</td></tr>
          <tr style="background:#eff6ff"><td style="text-align:right;font-weight:700;color:#1e40af;font-size:12pt">TOTAL</td><td style="text-align:right;font-weight:700;color:#1e40af;font-size:12pt">${fmtRp(inv.total)}</td></tr>
          ${Number(inv.jumlah_dibayar) > 0 ? `<tr><td style="text-align:right;color:#15803d">Sudah Dibayar</td><td style="text-align:right;color:#15803d">${fmtRp(inv.jumlah_dibayar)}</td></tr>` : ''}
          ${!statusLunas ? `<tr><td style="text-align:right;font-weight:700;color:#dc2626">SISA TAGIHAN</td><td style="text-align:right;font-weight:700;color:#dc2626">${fmtRp(sisa)}</td></tr>` : ''}
        </tbody>
      </table>
      ${statusLunas ? '<p style="margin-top:12px;text-align:center;font-size:14pt;font-weight:800;color:#15803d;border:2px solid #22c55e;border-radius:8px;padding:8px">✓ LUNAS</p>' : ''}
    </div>

    <div class="section" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px">
      <div class="section-title" style="border:none;padding:0;margin-bottom:8px">Informasi Pembayaran</div>
      <table class="info">
        <tr><td>Bank</td><td>:</td><td>BCA / Mandiri / BNI (sesuai konfirmasi tim Finance)</td></tr>
        <tr><td>Atas Nama</td><td>:</td><td>${getCompany().name}</td></tr>
      </table>
      <p style="font-size:9pt;color:#94a3b8;margin-top:8px">Harap cantumkan nomor invoice pada bukti transfer.</p>
    </div>

    ${docFooter(inv.nomor_invoice)}
  </div></body></html>`
  printDocument(html)
}

// ─────────────────────────────────────────────
// LABEL ASET — QR code + kode, ditempel di fisik perangkat
// Scan QR → langsung ke halaman detail aset (butuh login; tujuan
// disimpan lewat ?redirect= kalau belum login — lihat router/index.ts)
// ─────────────────────────────────────────────
export async function printLabelAset(asetList: any[]) {
  if (!asetList.length) return
  // window.open HARUS dipanggil sinkron (langsung dari klik user) agar
  // tidak diblokir popup blocker — baru generate QR (async) setelah itu.
  const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes')
  if (!win) { alert('Pop-up diblokir browser. Izinkan pop-up untuk halaman ini.'); return }
  win.document.write('<p style="padding:40px;font-family:sans-serif;color:#64748b">Menyiapkan label…</p>')

  const baseUrl = window.location.origin
  const c = getCompany()

  const items = await Promise.all(asetList.map(async (a) => {
    const url = `${baseUrl}/assets/${a.id_aset}`
    let qr = ''
    try { qr = await QRCode.toDataURL(url, { width: 200, margin: 1 }) } catch { /* label tampil tanpa QR kalau gagal generate */ }
    return { a, qr }
  }))

  const labelsHtml = items.map(({ a, qr }) => `
    <div class="label">
      <div class="label-qr">${qr ? `<img src="${qr}" />` : ''}</div>
      <div class="label-info">
        <div class="label-brand">${c.brand}</div>
        <div class="label-kode">${a.kode_aset}</div>
        <div class="label-nama">${a.nama_perangkat}</div>
        ${a.merk || a.tipe_model ? `<div class="label-model">${[a.merk, a.tipe_model].filter(Boolean).join(' ')}</div>` : ''}
        ${a.serial_number ? `<div class="label-sn">SN: ${a.serial_number}</div>` : ''}
      </div>
    </div>
  `).join('')

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Label Aset (${asetList.length})</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; background:#fff; }
    .toolbar { padding:10px 14px; background:#f1f5f9; display:flex; justify-content:space-between; align-items:center; }
    .toolbar button { background:#1e3a8a; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-size:10pt; cursor:pointer; }
    .sheet { display:flex; flex-wrap:wrap; gap:2mm; padding:5mm; }
    .label {
      width:70mm; height:37mm; border:1px dashed #cbd5e1; border-radius:2mm;
      display:flex; align-items:center; gap:3mm; padding:3mm; page-break-inside:avoid;
    }
    .label-qr img { width:28mm; height:28mm; display:block; }
    .label-info { flex:1; overflow:hidden; min-width:0; }
    .label-brand { font-size:7pt; font-weight:700; color:#1e3a8a; text-transform:uppercase; letter-spacing:0.5pt; }
    .label-kode { font-size:11pt; font-weight:800; font-family:'Consolas',monospace; color:#0f172a; margin-top:1mm; }
    .label-nama { font-size:8pt; color:#334155; margin-top:0.5mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .label-model { font-size:7pt; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .label-sn { font-size:6.5pt; color:#94a3b8; font-family:'Consolas',monospace; margin-top:0.5mm; }
    @media print {
      .toolbar { display:none; }
      .label { border-color:#e2e8f0; }
      @page { size: A4; margin: 5mm; }
    }
  </style>
  </head>
  <body>
    <div class="toolbar no-print">
      <span style="font-size:10pt;color:#475569">${asetList.length} label siap cetak — tempel di stiker label ukuran 70×37mm</span>
      <button onclick="window.print()">🖨 Cetak</button>
    </div>
    <div class="sheet">${labelsHtml}</div>
  </body></html>`

  win.document.open()
  win.document.write(sanitizeFullDocument(html))
  win.document.close()
}
