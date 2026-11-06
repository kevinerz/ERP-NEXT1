// Isi awal halaman QC ERP: daftar modul + temuan evaluasi sistem (6 Nov 2026).
// Temuan diambil dari isi database, log error aplikasi, dan pekerjaan yang sudah dilakukan.
// Dimasukkan sekali saat tabel qc_modul masih kosong; setelah itu sepenuhnya dikelola dari halaman /qc.

type Catatan = { jenis: 'Bug' | 'Revisi' | 'Upgrade' | 'Data' | 'Keamanan' | 'Saran'; prioritas: 'Tinggi' | 'Sedang' | 'Rendah'; judul: string; isi?: string };
type Modul = { kode: string; grup: string; nama: string; path?: string; deskripsi: string; status: string; skor?: number; catatan?: Catatan[] };

export const PEMBUAT_SEED = 'Evaluasi sistem (Claude)';

export const QC_SEED: Modul[] = [
  // ── Umum ──
  {
    kode: 'dashboard', grup: 'Umum', nama: 'Dashboard', path: '/dashboard', status: 'Belum dievaluasi',
    deskripsi: 'Ringkasan KPI perusahaan di halaman awal.',
    catatan: [{ jenis: 'Saran', prioritas: 'Sedang', judul: 'Tambah ringkasan operasional langsung', isi: 'Widget: site mati total (NOCaaS), tiket aktif per jenis, chat WA belum ditangani, visit hari ini — supaya manajemen tidak perlu membuka banyak halaman.' }],
  },
  {
    kode: 'email', grup: 'Umum', nama: 'Email', path: '/email', status: 'Belum dipakai',
    deskripsi: 'Inbox email per pengguna (IMAP/SMTP).',
    catatan: [{ jenis: 'Data', prioritas: 'Rendah', judul: 'Belum ada akun email yang terhubung (0 akun)', isi: 'Putuskan: dipakai (hubungkan email kantor tiap staf) atau sembunyikan menu supaya tidak membingungkan.' }],
  },
  {
    kode: 'whatsapp', grup: 'Umum', nama: 'WhatsApp Inbox', path: '/whatsapp', status: 'Baik', skor: 4,
    deskripsi: 'Inbox WA helpdesk lewat gateway Baileys: chat pribadi & grup, balasan cepat, PIC, foto/media, tarik & edit pesan, emoji, pencarian isi pesan, status NOCaaS per site.',
    catatan: [
      { jenis: 'Data', prioritas: 'Tinggi', judul: '1.127 kontak WA tertaut ke site sebagai SARAN, perlu dikonfirmasi', isi: 'Konfirmasi di panel profil chat (✓ Benar, jadikan PIC). Setelah dikonfirmasi, kontak jadi PIC resmi dan bisa menerima notifikasi tiket.' },
      { jenis: 'Data', prioritas: 'Sedang', judul: 'Balasan cepat (template) masih kosong', isi: 'Isi template salam, minta restart modem, konfirmasi pulih, dll. lewat tombol ⚡ atau ketik "/".' },
      { jenis: 'Revisi', prioritas: 'Sedang', judul: 'Uji tarik & edit pesan dengan nomor internal', isi: 'Fitur sudah aktif tapi belum diuji ke pesan sungguhan.' },
      { jenis: 'Bug', prioritas: 'Rendah', judul: 'Foto profil gagal dimuat saat gateway restart (40 error "fetch failed")', isi: 'Tidak mengganggu chat; foto muncul lagi setelah gateway tersambung. Bisa diberi cache / jeda ulang.' },
      { jenis: 'Upgrade', prioritas: 'Rendah', judul: 'Halaman sempat tertahan ±1 menit setelah deploy', isi: 'Aplikasi baru restart belum siap. Solusi: pm2 cluster/zero-downtime reload.' },
    ],
  },
  {
    kode: 'wa-statistik', grup: 'Umum', nama: 'Statistik Helpdesk', path: '/whatsapp/statistik', status: 'Baik', skor: 4,
    deskripsi: 'Kinerja helpdesk WA: waktu respon, volume chat, per staf, tiket.',
    catatan: [{ jenis: 'Upgrade', prioritas: 'Rendah', judul: 'Target SLA respon per staf + ekspor', isi: 'Tampilkan pencapaian target (mis. respon < 5 menit) dan unduh Excel/PDF untuk evaluasi bulanan.' }],
  },
  {
    kode: 'meeting', grup: 'Umum', nama: 'Meeting', path: '/meeting', status: 'Baik', skor: 4,
    deskripsi: 'Rapat video LiveKit (meet.nextone.id) dengan link tamu, TURN lewat port 443.',
    catatan: [
      { jenis: 'Revisi', prioritas: 'Sedang', judul: 'Uji rapat nyata dari iPhone/Safari & jaringan ketat', isi: 'Perbaikan Safari & TURN sudah terpasang tapi belum diuji dengan rapat sungguhan.' },
      { jenis: 'Upgrade', prioritas: 'Rendah', judul: 'Rekaman rapat belum tersedia' },
    ],
  },

  // ── SDM ──
  {
    kode: 'hris', grup: 'SDM', nama: 'HRIS', path: '/hris/karyawan', status: 'Belum dievaluasi',
    deskripsi: 'Data karyawan (17 aktif), jabatan, departemen.',
    catatan: [{ jenis: 'Data', prioritas: 'Sedang', judul: 'Lengkapi no. HP & departemen teknisi', isi: 'Dipakai Jadwal Visit (WA ke teknisi) dan pencocokan kontak WA. Fitur undangan HRIS belum pernah dipakai.' }],
  },
  {
    kode: 'master', grup: 'SDM', nama: 'Master Data', path: '/master', status: 'Perlu revisi', skor: 2,
    deskripsi: 'Pelanggan (172), site (3.213), layanan (123), vendor ISP (99), perangkat site (1.834), PIC site.',
    catatan: [
      { jenis: 'Data', prioritas: 'Tinggi', judul: 'IP tunnel di perangkat site banyak basi / tertukar', isi: '31 router NOCaaS konflik: IP-nya tercatat di site lain (mis. "Chatime Teraskota" memegang IP router KK, ACE, Fore, Informa; IP Ace Sumedang ↔ Tsukaramen saling tertukar). Tinjau di /nocaas → Tinjau pemetaan.' },
      { jenis: 'Data', prioritas: 'Tinggi', judul: 'PIC site hampir kosong', isi: 'Hanya 56 PIC (48 placeholder "PIC (dari PRTG)"), 7 site aktif punya PIC asli. Sumber terbaik: kontak HP helpdesk (1.127 saran di WA Inbox).' },
      { jenis: 'Data', prioritas: 'Sedang', judul: '72 site memegang IP lebih dari satu router', isi: 'Sebagian wajar (internal/eksternal), sebagian salah input.' },
      { jenis: 'Data', prioritas: 'Sedang', judul: 'Site impor tanpa tanggal aktif & koordinat GPS', isi: '±3.161 site hasil impor Sept–Okt. Koordinat terisi otomatis dari check-in Jadwal Visit; tanggal aktif dibutuhkan untuk SLA & maintenance.' },
      { jenis: 'Bug', prioritas: 'Rendah', judul: 'Riwayat error dokumen site & grup pelanggan (Sept)', isi: 'GET /master/site/:id/dokumen dan /master/grup sempat 500 ("findMany of undefined"). Pastikan sudah tidak terjadi.' },
    ],
  },

  // ── Komersial ──
  {
    kode: 'pasang-baru', grup: 'Komersial', nama: 'Pasang Baru', path: '/pasang-baru', status: 'Perlu revisi', skor: 3,
    deskripsi: 'Alur SPH → order → OPS → instalasi → NOC → finance, PDF SPH, hapus permanen (Admin).',
    catatan: [
      { jenis: 'Upgrade', prioritas: 'Tinggi', judul: 'Isian IP tunnel di tahap NOC', isi: 'Supaya site baru langsung lurus dengan router NOCaaS (tanpa pencocokan nama).' },
      { jenis: 'Upgrade', prioritas: 'Sedang', judul: 'Tahap 2 & 3 Pasang Baru belum dikerjakan' },
      { jenis: 'Revisi', prioritas: 'Sedang', judul: 'Belum ada data nyata (0 order) — uji end-to-end', isi: 'Jalankan satu pemasangan nyata dari SPH sampai finance.' },
    ],
  },
  {
    kode: 'presales', grup: 'Komersial', nama: 'Pre-Sales', path: '/presales', status: 'Belum dipakai',
    deskripsi: 'Survei pra-penjualan.',
    catatan: [{ jenis: 'Saran', prioritas: 'Rendah', judul: '0 survei — gabungkan ke Pasang Baru atau sembunyikan' }],
  },
  {
    kode: 'sales', grup: 'Komersial', nama: 'Sales', path: '/sales', status: 'Belum dipakai',
    deskripsi: 'Lead, opportunity, quotation, aktivitas sales.',
    catatan: [{ jenis: 'Saran', prioritas: 'Sedang', judul: 'Lead/opportunity/quotation/aktivitas semuanya 0', isi: 'Tim sales belum memakai. Tentukan alur resmi (mis. lead → SPH Pasang Baru) atau sembunyikan.' }],
  },
  {
    kode: 'crm', grup: 'Komersial', nama: 'CRM (PIC)', path: '/crm/pic', status: 'Belum dipakai',
    deskripsi: 'Data & riwayat PIC pelanggan.',
    catatan: [{ jenis: 'Data', prioritas: 'Tinggi', judul: 'Hanya 8 log PIC — isi lewat konfirmasi PIC dari WA Inbox' }],
  },
  {
    kode: 'projects', grup: 'Komersial', nama: 'Proyek', path: '/projects', status: 'Belum dipakai',
    deskripsi: 'Proyek, delivery, dokumen legal.',
    catatan: [{ jenis: 'Saran', prioritas: 'Rendah', judul: 'Delivery & dokumen legal 0 data', isi: 'Pastikan perannya berbeda dari Pasang Baru; bila sama, satukan.' }],
  },
  {
    kode: 'contracts', grup: 'Komersial', nama: 'Kontrak', path: '/contracts', status: 'Belum dipakai',
    deskripsi: 'Kontrak layanan pelanggan.',
    catatan: [{ jenis: 'Data', prioritas: 'Tinggi', judul: 'Kontrak layanan 0 data', isi: 'Kontrak dibutuhkan untuk SLA per pelanggan, penagihan, dan jadwal maintenance rutin.' }],
  },

  // ── Tiket ──
  {
    kode: 'operations', grup: 'Tiket', nama: 'Gangguan (Tiket)', path: '/operations', status: 'Perlu revisi', skor: 3,
    deskripsi: 'Tiket gangguan: otomatis dari NOCaaS (mati total, port WAN) & PRTG (cadangan), WA, manual; SLA, log, surat tugas.',
    catatan: [
      { jenis: 'Bug', prioritas: 'Tinggi', judul: 'Notifikasi WA tiket lewat StarSender gagal ±2.100× dalam seminggu', isi: '"fetch failed" / timeout. Pelanggan & grup tidak menerima notifikasi tiket. Usul: pindahkan ke gateway WA helpdesk (sudah stabil).' },
      { jenis: 'Revisi', prioritas: 'Sedang', judul: 'RCA & foto tiket tidak pernah diisi (0)', isi: 'Wajibkan akar masalah / tindakan saat tiket ditutup supaya laporan gangguan bermakna.' },
      { jenis: 'Data', prioritas: 'Sedang', judul: 'Riwayat tiket PRTG sebelum 4 Nov dihapus', isi: 'Atas permintaan (mulai bersih dari NOCaaS). Backup: /root/backup-hapus-prtg-20261104-052012. Laporan SLA bulan Sept–Okt ikut hilang.' },
      { jenis: 'Bug', prioritas: 'Rendah', judul: 'PATCH /operations/:id sempat 500 (Okt)', isi: 'Prisma update error — cek apakah masih terjadi.' },
    ],
  },
  {
    kode: 'instalasi', grup: 'Tiket', nama: 'Pemasangan (Instalasi)', path: '/instalasi', status: 'Belum dipakai',
    deskripsi: 'Order instalasi, BAST, foto.',
    catatan: [{ jenis: 'Saran', prioritas: 'Sedang', judul: '0 order — tumpang tindih dengan Pasang Baru & Jadwal Visit', isi: 'Satukan alur instalasi ke Pasang Baru → Jadwal Visit (link lapor teknisi sudah ada foto & TTD).' }],
  },
  {
    kode: 'jadwal-visit', grup: 'Tiket', nama: 'Jadwal Visit', path: '/jadwal-visit', status: 'Baik', skor: 4,
    deskripsi: 'Antrean & papan jadwal teknisi, WA ke teknisi/PIC, link lapor lapangan (GPS, foto, TTD), maintenance rutin, KPI & peta.',
    catatan: [
      { jenis: 'Data', prioritas: 'Sedang', judul: 'Belum dipakai lapangan (0 laporan, 0 aturan maintenance)', isi: 'Buat aturan maintenance per pelanggan besar dan latih teknisi memakai link lapor.' },
    ],
  },
  {
    kode: 'laporan-gangguan', grup: 'Tiket', nama: 'Laporan Gangguan', path: '/nocaas/laporan', status: 'Baik', skor: 4,
    deskripsi: 'Laporan gabungan PRTG + NOCaaS: KPI, per jenis, site & pelanggan teratas, ISP, CSV.',
    catatan: [{ jenis: 'Upgrade', prioritas: 'Rendah', judul: 'Kirim laporan bulanan otomatis ke manajemen (email/WA PDF)' }],
  },
  {
    kode: 'public-wo', grup: 'Tiket', nama: 'Work Order', path: '/public-wo', status: 'Belum dipakai',
    deskripsi: 'Surat tugas / WO publik, berita acara, material.',
    catatan: [{ jenis: 'Saran', prioritas: 'Rendah', judul: 'Hanya 1 WO, BA & material 0 — selaraskan dengan Jadwal Visit' }],
  },

  // ── Infrastruktur ──
  {
    kode: 'assets', grup: 'Infrastruktur', nama: 'Aset & Gudang', path: '/assets', status: 'Belum dievaluasi',
    deskripsi: 'Aset gudang (77), mutasi (91), pengajuan, stok opname, pengiriman perangkat.',
    catatan: [{ jenis: 'Data', prioritas: 'Sedang', judul: 'Stok opname & pengajuan aset belum pernah dipakai (0)' }],
  },
  {
    kode: 'sim-topup', grup: 'Infrastruktur', nama: 'SIM Topup', path: '/assets/sim-topup', status: 'Belum dipakai',
    deskripsi: 'Pengisian pulsa/paket SIM modem lewat Digiflazz.',
    catatan: [{ jenis: 'Bug', prioritas: 'Rendah', judul: 'Digiflazz belum dikonfigurasi tapi saldo/harga tetap dipanggil (error 500)', isi: 'Tampilkan "belum dikonfigurasi" alih-alih error.' }],
  },
  { kode: 'network-tools', grup: 'Infrastruktur', nama: 'Network Tools', path: '/tools/network', status: 'Belum dievaluasi', deskripsi: 'Ping / traceroute / alat jaringan dari server ERP.' },
  {
    kode: 'noc-board', grup: 'Infrastruktur', nama: 'NOC Board', path: '/operations/noc', status: 'Belum dievaluasi',
    deskripsi: 'Papan pantau NOC (layar TV).',
    catatan: [{ jenis: 'Upgrade', prioritas: 'Sedang', judul: 'Tampilkan status NOCaaS (mati total / port WAN) di NOC Board' }],
  },
  {
    kode: 'nocaas', grup: 'Infrastruktur', nama: 'Pembanding NOCaaS', path: '/nocaas', status: 'Baik', skor: 4,
    deskripsi: 'Sinkron router Mikrotik/RCMS/Ruijie dari NOCaaS tiap menit, ping tunnel, tiket otomatis (mati total, port WAN), pemetaan router ↔ site.',
    catatan: [
      { jenis: 'Keamanan', prioritas: 'Tinggi', judul: 'API NOCaaS (180.214.165.166:8000) terbuka ke internet tanpa login', isi: 'API punya reboot router, ubah NAT/DNS, hapus akun VPN. Batasi firewall hanya untuk IP ERP atau tambah token.' },
      { jenis: 'Data', prioritas: 'Tinggi', judul: '±1.455 router belum terpetakan ke site (+31 konflik IP)', isi: 'Site tanpa router NOCaaS masih memakai PRTG. Tinjau di tab "Tinjau pemetaan" (pintasan 1/2/3/0).' },
      { jenis: 'Upgrade', prioritas: 'Sedang', judul: 'Tarik data 9,6 MB/menit lewat internet tanpa kompresi', isi: 'Aktifkan GZipMiddleware di FastAPI NOCaaS (±13 GB/hari → ±1 GB).' },
      { jenis: 'Bug', prioritas: 'Sedang', judul: 'Perangkat Omada tidak bisa diambil (API NOCaaS timeout)' },
      { jenis: 'Upgrade', prioritas: 'Rendah', judul: 'Port WAN down terdeteksi terlambat 1–3 jam', isi: 'Hanya dari snapshot config router; perlu event port real-time dari NOCaaS.' },
    ],
  },
  {
    kode: 'mikrotik', grup: 'Infrastruktur', nama: 'Remote Mikrotik', path: '/tools/mikrotik', status: 'Belum dievaluasi',
    deskripsi: 'Akses & aksi remote ke router pelanggan.',
    catatan: [{ jenis: 'Keamanan', prioritas: 'Tinggi', judul: 'Satu kredensial API/SSH untuk semua router pelanggan', isi: 'Kredensial sempat dibagikan di chat (4 Nov). Rotasi dan pertimbangkan akun per tingkat akses.' }],
  },
  {
    kode: 'ipam', grup: 'Infrastruktur', nama: 'IP Publik (IPAM)', path: '/ipam', status: 'Belum dipakai',
    deskripsi: 'Blok & alokasi IP publik NEXT1.',
    catatan: [{ jenis: 'Data', prioritas: 'Sedang', judul: 'Baru 1 blok & 2 alokasi — impor data IP publik yang dipakai' }],
  },

  // ── Keuangan ──
  {
    kode: 'finance', grup: 'Keuangan', nama: 'Finance', path: '/finance', status: 'Perlu revisi', skor: 2,
    deskripsi: 'Invoice, pembayaran, jurnal AR/AP (Mekari).',
    catatan: [
      { jenis: 'Data', prioritas: 'Tinggi', judul: '2.055 invoice tetapi 0 pembayaran tercatat', isi: 'Piutang & status lunas tidak akurat. Catat pembayaran atau sinkron dari Mekari.' },
      { jenis: 'Revisi', prioritas: 'Sedang', judul: 'Jurnal AR/AP Mekari belum tersambung (0 data)' },
    ],
  },
  { kode: 'reports', grup: 'Keuangan', nama: 'Laporan', path: '/reports', status: 'Belum dievaluasi', deskripsi: 'Laporan bulanan, KPI, revenue, aset.' },
  {
    kode: 'laporan-sla', grup: 'Keuangan', nama: 'Laporan SLA', path: '/reports/sla', status: 'Perlu revisi', skor: 3,
    deskripsi: 'SLA per pelanggan dari tiket.',
    catatan: [{ jenis: 'Data', prioritas: 'Sedang', judul: 'SLA sebelum 4 Nov hilang (riwayat tiket PRTG dihapus)', isi: 'Bila perlu, pulihkan dari backup ke tabel arsip khusus laporan.' }],
  },

  // ── Admin & integrasi ──
  { kode: 'admin-users', grup: 'Admin & Integrasi', nama: 'Pengguna & Role', status: 'Belum dievaluasi', deskripsi: 'Akun login (17), role, hak modul.' },
  {
    kode: 'portal', grup: 'Admin & Integrasi', nama: 'Portal Pelanggan', path: '/admin/portal-users', status: 'Belum dipakai',
    deskripsi: 'portal.nextone.id — pelanggan melihat tiket & SLA.',
    catatan: [{ jenis: 'Saran', prioritas: 'Sedang', judul: '0 akun pelanggan — mulai dari 2–3 pelanggan besar' }],
  },
  {
    kode: 'activity-log', grup: 'Admin & Integrasi', nama: 'Activity Log & Email Log', path: '/admin/logs', status: 'Belum dievaluasi',
    deskripsi: 'Jejak aktivitas pengguna (4.728) & log email keluar.',
    catatan: [{ jenis: 'Upgrade', prioritas: 'Rendah', judul: 'Kebijakan retensi log & notifikasi (9.555 notifikasi)' }],
  },
  {
    kode: 'prtg', grup: 'Admin & Integrasi', nama: 'Integrasi PRTG', path: '/integrations/prtg', status: 'Baik', skor: 3,
    deskripsi: 'Polling PRTG — kini cadangan untuk site yang belum terpetakan ke NOCaaS / saat NOCaaS bermasalah.',
    catatan: [{ jenis: 'Bug', prioritas: 'Rendah', judul: 'Rekon PRTG sering timeout (/prtg-rekon)' }],
  },
  {
    kode: 'uptime-kuma', grup: 'Admin & Integrasi', nama: 'Integrasi Uptime Kuma', path: '/integrations/uptime-kuma', status: 'Kritis', skor: 1,
    deskripsi: 'Pemantauan lewat Uptime Kuma.',
    catatan: [{ jenis: 'Bug', prioritas: 'Sedang', judul: 'Halaman config/status error 500, mapping & webhook 0', isi: 'Tidak dipakai. Perbaiki tabel / konfigurasi atau hapus menu & route.' }],
  },
  {
    kode: 'starsender', grup: 'Admin & Integrasi', nama: 'StarSender WA', path: '/integrations/starsender', status: 'Kritis', skor: 1,
    deskripsi: 'Gateway WA pihak ketiga untuk notifikasi tiket.',
    catatan: [{ jenis: 'Bug', prioritas: 'Tinggi', judul: 'Gagal terus (±2.100× seminggu: fetch failed / timeout)', isi: 'Ganti ke gateway WA helpdesk sendiri; matikan StarSender setelah dipindah.' }],
  },
  { kode: 'settings', grup: 'Admin & Integrasi', nama: 'Pengaturan', path: '/settings', status: 'Belum dievaluasi', deskripsi: 'Pengaturan aplikasi (17 parameter).' },
  {
    kode: 'mobile', grup: 'Admin & Integrasi', nama: 'Aplikasi Mobile (Android)', status: 'Belum dipakai',
    deskripsi: 'Aplikasi teknisi (Capacitor).',
    catatan: [{ jenis: 'Saran', prioritas: 'Rendah', judul: 'Lokasi teknisi 0 data — evaluasi perlu tidaknya dibanding link lapor Jadwal Visit' }],
  },

  // ── Sistem ──
  {
    kode: 'sistem', grup: 'Sistem', nama: 'Infrastruktur, Deploy & Keamanan', status: 'Kritis', skor: 2,
    deskripsi: 'Server, database, deploy, backup, pengujian, keamanan lintas modul.',
    catatan: [
      { jenis: 'Data', prioritas: 'Tinggi', judul: 'Tidak ada backup database terjadwal di server ERP', isi: 'Tidak ada cron mysqldump (kecuali ada backup di Proxmox). Buat backup harian + simpan di luar server.' },
      { jenis: 'Upgrade', prioritas: 'Tinggi', judul: 'Tidak ada tes otomatis (0) & CI', isi: 'Mulai dari tes alur kritis: tiket otomatis, invoice, WA kirim.' },
      { jenis: 'Revisi', prioritas: 'Tinggi', judul: 'Deploy dengan menyalin file; server bukan git; 61 commit belum di-merge ke main', isi: 'Gabungkan branch claude/whatsapp-helpdesk ke main, lalu deploy lewat git (deploy.sh) supaya versi server terlacak.' },
      { jenis: 'Keamanan', prioritas: 'Tinggi', judul: 'Rotasi kredensial yang pernah dibagikan', isi: 'Password root VM, .env NOCaaS (DB, Mikrotik). Postgres 5432 & Redis 6379 NOCaaS terbuka 0.0.0.0.' },
      { jenis: 'Upgrade', prioritas: 'Sedang', judul: 'Zero-downtime deploy (pm2 cluster / reload)', isi: 'Saat ini restart membuat halaman tertahan sesaat.' },
    ],
  },
];
