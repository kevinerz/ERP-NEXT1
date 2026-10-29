-- WhatsApp helpdesk (gateway Baileys)
CREATE TABLE IF NOT EXISTS `wa_akun` (
  `id_akun` INT NOT NULL AUTO_INCREMENT,
  `kode` VARCHAR(30) NOT NULL,
  `nama` VARCHAR(100) NOT NULL,
  `nomor_jid` VARCHAR(80) NULL,
  `nama_wa` VARCHAR(150) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'mati',
  `terhubung_at` DATETIME(3) NULL,
  `putus_terakhir` TEXT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_akun`),
  UNIQUE INDEX `wa_akun_kode_key` (`kode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wa_kontak` (
  `id_kontak` INT NOT NULL AUTO_INCREMENT,
  `id_akun` INT NOT NULL,
  `jid` VARCHAR(80) NOT NULL,
  `lid` VARCHAR(80) NULL,
  `nomor` VARCHAR(30) NULL,
  `nama_wa` VARCHAR(150) NULL,
  `nama_simpan` VARCHAR(150) NULL,
  `id_pelanggan` INT NULL,
  `id_site` INT NULL,
  `id_pic` INT NULL,
  `nama_erp` VARCHAR(200) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_kontak`),
  UNIQUE INDEX `wa_kontak_id_akun_jid_key` (`id_akun`, `jid`),
  INDEX `wa_kontak_id_akun_lid_idx` (`id_akun`, `lid`),
  INDEX `wa_kontak_nomor_idx` (`nomor`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wa_chat` (
  `id_chat` INT NOT NULL AUTO_INCREMENT,
  `id_akun` INT NOT NULL,
  `jid` VARCHAR(80) NOT NULL,
  `lid` VARCHAR(80) NULL,
  `is_grup` BOOLEAN NOT NULL DEFAULT FALSE,
  `nama` VARCHAR(200) NULL,
  `belum_dibaca` INT NOT NULL DEFAULT 0,
  `pesan_terakhir` VARCHAR(300) NULL,
  `waktu_terakhir` DATETIME(3) NULL,
  `id_karyawan_pic` INT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'Terbuka',
  `label` VARCHAR(100) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_chat`),
  UNIQUE INDEX `wa_chat_id_akun_jid_key` (`id_akun`, `jid`),
  INDEX `wa_chat_id_akun_lid_idx` (`id_akun`, `lid`),
  INDEX `wa_chat_id_akun_waktu_terakhir_idx` (`id_akun`, `waktu_terakhir`),
  CONSTRAINT `wa_chat_id_akun_fkey` FOREIGN KEY (`id_akun`) REFERENCES `wa_akun` (`id_akun`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wa_pesan` (
  `id_pesan` INT NOT NULL AUTO_INCREMENT,
  `id_chat` INT NOT NULL,
  `wa_id` VARCHAR(100) NOT NULL,
  `dari_saya` BOOLEAN NOT NULL DEFAULT FALSE,
  `pengirim_jid` VARCHAR(80) NULL,
  `nama_pengirim` VARCHAR(150) NULL,
  `tipe` VARCHAR(20) NOT NULL,
  `teks` TEXT NULL,
  `media_jenis` VARCHAR(20) NULL,
  `media_mime` VARCHAR(100) NULL,
  `media_nama` VARCHAR(255) NULL,
  `media_ukuran` INT NULL,
  `media_durasi` INT NULL,
  `media_path` VARCHAR(255) NULL,
  `ptt` BOOLEAN NOT NULL DEFAULT FALSE,
  `kutip_id` VARCHAR(100) NULL,
  `kutip_teks` TEXT NULL,
  `kutip_pengirim` VARCHAR(80) NULL,
  `lokasi` JSON NULL,
  `kontak` JSON NULL,
  `reaksi` JSON NULL,
  `status` INT NULL,
  `diedit` BOOLEAN NOT NULL DEFAULT FALSE,
  `dihapus` BOOLEAN NOT NULL DEFAULT FALSE,
  `riwayat` BOOLEAN NOT NULL DEFAULT FALSE,
  `id_karyawan` INT NULL,
  `waktu` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_pesan`),
  UNIQUE INDEX `wa_pesan_id_chat_wa_id_key` (`id_chat`, `wa_id`),
  INDEX `wa_pesan_id_chat_waktu_idx` (`id_chat`, `waktu`),
  INDEX `wa_pesan_wa_id_idx` (`wa_id`),
  CONSTRAINT `wa_pesan_id_chat_fkey` FOREIGN KEY (`id_chat`) REFERENCES `wa_chat` (`id_chat`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wa_template` (
  `id_template` INT NOT NULL AUTO_INCREMENT,
  `judul` VARCHAR(100) NOT NULL,
  `isi` TEXT NOT NULL,
  `urutan` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_template`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `wa_akun` (`kode`, `nama`) VALUES ('helpdesk', 'Helpdesk');
