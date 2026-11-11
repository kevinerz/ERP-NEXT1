-- Meeting: durasi/kategori/lokasi, notulen, pengingat, RSVP peserta, tindak lanjut (action items)
ALTER TABLE `rapat`
  ADD COLUMN IF NOT EXISTS `durasi_menit` INT NULL AFTER `jadwal_at`,
  ADD COLUMN IF NOT EXISTS `kategori` VARCHAR(30) NULL AFTER `durasi_menit`,
  ADD COLUMN IF NOT EXISTS `lokasi` VARCHAR(200) NULL AFTER `kategori`,
  ADD COLUMN IF NOT EXISTS `notulen` MEDIUMTEXT NULL AFTER `selesai_at`,
  ADD COLUMN IF NOT EXISTS `notulen_oleh` INT NULL AFTER `notulen`,
  ADD COLUMN IF NOT EXISTS `notulen_at` DATETIME(3) NULL AFTER `notulen_oleh`,
  ADD COLUMN IF NOT EXISTS `diingatkan_at` DATETIME(3) NULL AFTER `notulen_at`;
ALTER TABLE `rapat_peserta`
  ADD COLUMN IF NOT EXISTS `respon` VARCHAR(10) NULL AFTER `peran`,
  ADD COLUMN IF NOT EXISTS `respon_at` DATETIME(3) NULL AFTER `respon`;
CREATE TABLE IF NOT EXISTS `rapat_tindak` (
  `id_tindak` INT NOT NULL AUTO_INCREMENT,
  `id_rapat` INT NOT NULL,
  `judul` VARCHAR(300) NOT NULL,
  `id_pic` INT NULL,
  `tenggat` DATE NULL,
  `selesai` TINYINT(1) NOT NULL DEFAULT 0,
  `selesai_at` DATETIME(3) NULL,
  `dibuat_oleh` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_tindak`),
  INDEX `rapat_tindak_id_rapat_idx` (`id_rapat`),
  INDEX `rapat_tindak_id_pic_idx` (`id_pic`, `selesai`),
  CONSTRAINT `rapat_tindak_id_rapat_fkey` FOREIGN KEY (`id_rapat`) REFERENCES `rapat` (`id_rapat`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
