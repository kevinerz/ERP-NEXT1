-- Rekonsiliasi sementara nama device PRTG ↔ site ERP (halaman publik /rekon-prtg)
CREATE TABLE IF NOT EXISTS `prtg_rekonsiliasi` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `prtg_objid` INT NOT NULL,
  `device_name_awal` VARCHAR(150) NOT NULL,
  `nama_baru` VARCHAR(150) NULL,
  `id_site` INT NULL,
  `kota` VARCHAR(100) NULL,
  `provinsi` VARCHAR(100) NULL,
  `alamat_lengkap` TEXT NULL,
  `koordinat_gps` VARCHAR(50) NULL,
  `catatan` TEXT NULL,
  `is_done` BOOLEAN NOT NULL DEFAULT FALSE,
  `done_at` DATETIME(3) NULL,
  `applied_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `prtg_rekonsiliasi_prtg_objid_key` (`prtg_objid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
