export function printDocument(html: string) {
  const win = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes')
  if (!win) { alert('Pop-up diblokir browser. Izinkan pop-up untuk halaman ini.'); return }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.focus(); win.print() }
}

function logoSvg() {
  return `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#1e3a8a"/>
    <text x="16" y="22" font-size="13" font-weight="800" fill="white" text-anchor="middle" font-family="Arial">N1</text>
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
  const now = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `<div class="footer"><span>Dicetak: ${now}</span><span>${nomor}</span></div>`
}

// ─────────────────────────────────────────────
// SURAT TUGAS WORK ORDER
// ─────────────────────────────────────────────
export function printSuratTugas(wo: any) {
  const tglJadwal = wo.tgl_jadwal ? new Date(wo.tgl_jadwal).toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) : '-'
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Surat Tugas ${wo.nomor_wo}</title>${baseStyle()}</head>
  <body><div class="doc">
    <div class="header">
      <div class="header-left">${logoSvg()}<div><div class="company-name">NEXT1</div><div class="company-sub">PT Next One Technology</div></div></div>
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
      <div class="header-left">${logoSvg()}<div><div class="company-name">NEXT1</div><div class="company-sub">PT Next One Technology</div></div></div>
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
      <div class="sign-box"><div class="sign-label">Yang melaksanakan,</div><div class="sign-line"><div class="sign-name">${ba.nama_penandatangan_next1 ? '( ' + ba.nama_penandatangan_next1 + ' )' : '( _________________________ )'}</div><div class="sign-jabatan">PT Next One Technology</div></div></div>
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
      <div class="header-left">${logoSvg()}<div><div class="company-name">NEXT1</div><div class="company-sub">PT Next One Technology</div></div></div>
      <div class="doc-title-block"><div class="doc-title">KONTRAK LAYANAN</div><div class="doc-nomor">${kt.nomor_kontrak}</div><div class="doc-date">${fmtDate(kt.tgl_mulai)} s/d ${fmtDate(kt.tgl_berakhir)}</div></div>
    </div>

    <p style="font-size:10pt;color:#475569;margin-bottom:20px;line-height:1.7">
      Kontrak Layanan ini dibuat dan ditandatangani oleh para pihak sebagai dasar pelaksanaan layanan
      telekomunikasi dan internet antara <strong>PT Next One Technology</strong> dengan pelanggan tersebut di bawah ini.
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
      <div class="sign-box"><div class="sign-label">Pihak Pertama,<br>PT Next One Technology</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">Direktur</div></div></div>
      <div class="sign-box"><div class="sign-label">Pihak Kedua,<br>${kt.site?.pelanggan?.nama_pelanggan || 'Pelanggan'}</div><div class="sign-line"><div class="sign-name">( _________________________ )</div><div class="sign-jabatan">Direktur / Pimpinan</div></div></div>
    </div>
    ${docFooter(kt.nomor_kontrak)}
  </div></body></html>`
  printDocument(html)
}
