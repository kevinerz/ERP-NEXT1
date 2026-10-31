-- Alur Pasang Baru: SPH multi-site (Sales) → approval Director → Order PB per site → OPS → Instalasi → NOC → Finance
CREATE TABLE IF NOT EXISTS `pb_sph` (
  `id_sph` INT NOT NULL AUTO_INCREMENT,
  `nomor_sph` VARCHAR(40) NOT NULL,
  `id_pelanggan` INT NOT NULL,
  `nama_pic` VARCHAR(150) NOT NULL,
  `telp_pic` VARCHAR(30) NULL,
  `email_pic` VARCHAR(150) NULL,
  `durasi_bulan` INT NOT NULL DEFAULT 12,
  `catatan` TEXT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Draft',
  `id_sales` INT NULL,
  `id_approver` INT NULL,
  `tgl_approval` DATETIME(3) NULL,
  `catatan_approval` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id_sph`),
  UNIQUE KEY `pb_sph_nomor_sph_key` (`nomor_sph`),
  KEY `pb_sph_status_idx` (`status`),
  KEY `pb_sph_id_pelanggan_idx` (`id_pelanggan`),
  CONSTRAINT `pb_sph_id_pelanggan_fkey` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan` (`id_pelanggan`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pb_order` (
  `id_pb` INT NOT NULL AUTO_INCREMENT,
  `nomor_pb` VARCHAR(30) NULL,
  `id_sph` INT NOT NULL,
  `id_site` INT NULL,
  `nama_site` VARCHAR(150) NOT NULL,
  `alamat` TEXT NOT NULL,
  `lantai_unit` VARCHAR(100) NULL,
  `kota` VARCHAR(100) NULL,
  `id_layanan` INT NOT NULL,
  `biaya_bulanan` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `biaya_instalasi` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `tgl_rfs` DATE NULL,
  `pic_store_nama` VARCHAR(150) NULL,
  `pic_store_hp` VARCHAR(30) NULL,
  `urutan` INT NOT NULL DEFAULT 0,
  `tahap` VARCHAR(20) NOT NULL DEFAULT 'Draft',
  `tahap_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ikg_nominal` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `ikg_pengelola` VARCHAR(150) NULL,
  `ikg_catatan` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id_pb`),
  UNIQUE KEY `pb_order_nomor_pb_key` (`nomor_pb`),
  KEY `pb_order_tahap_idx` (`tahap`),
  KEY `pb_order_id_sph_idx` (`id_sph`),
  KEY `pb_order_id_site_idx` (`id_site`),
  CONSTRAINT `pb_order_id_sph_fkey` FOREIGN KEY (`id_sph`) REFERENCES `pb_sph` (`id_sph`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pb_order_id_site_fkey` FOREIGN KEY (`id_site`) REFERENCES `site_pelanggan` (`id_site`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pb_order_id_layanan_fkey` FOREIGN KEY (`id_layanan`) REFERENCES `master_layanan` (`id_layanan`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pb_riwayat` (
  `id_riwayat` INT NOT NULL AUTO_INCREMENT,
  `id_sph` INT NULL,
  `id_pb` INT NULL,
  `id_karyawan` INT NULL,
  `aksi` VARCHAR(30) NOT NULL,
  `dari_tahap` VARCHAR(20) NULL,
  `ke_tahap` VARCHAR(20) NULL,
  `catatan` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_riwayat`),
  KEY `pb_riwayat_id_sph_idx` (`id_sph`),
  KEY `pb_riwayat_id_pb_idx` (`id_pb`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dokumen site per jenis (FAB, BA, TOPOLOGI, ...) dan asal order PB
ALTER TABLE `site_dokumen`
  ADD COLUMN IF NOT EXISTS `jenis` VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS `id_pb` INT NULL,
  ADD INDEX IF NOT EXISTS `site_dokumen_id_pb_idx` (`id_pb`);

-- Data OPS per link vendor ISP
ALTER TABLE `sumber_internet_site`
  ADD COLUMN IF NOT EXISTS `sn_modem` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `durasi_bulan` INT NULL,
  ADD COLUMN IF NOT EXISTS `deposit_nominal` DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `deposit_tgl` DATE NULL,
  ADD COLUMN IF NOT EXISTS `deposit_status` VARCHAR(20) NULL;
