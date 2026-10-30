-- Meeting internal (LiveKit): rapat, peserta, kehadiran
CREATE TABLE IF NOT EXISTS `rapat` (
  `id_rapat` INT NOT NULL AUTO_INCREMENT,
  `room` VARCHAR(64) NOT NULL,
  `judul` VARCHAR(200) NOT NULL,
  `deskripsi` TEXT NULL,
  `jadwal_at` DATETIME(3) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'Terjadwal',
  `id_pembuat` INT NOT NULL,
  `mulai_at` DATETIME(3) NULL,
  `selesai_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id_rapat`),
  UNIQUE KEY `rapat_room_key` (`room`),
  KEY `rapat_status_jadwal_at_idx` (`status`, `jadwal_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rapat_peserta` (
  `id_peserta` INT NOT NULL AUTO_INCREMENT,
  `id_rapat` INT NOT NULL,
  `id_karyawan` INT NOT NULL,
  `peran` VARCHAR(20) NOT NULL DEFAULT 'peserta',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_peserta`),
  UNIQUE KEY `rapat_peserta_id_rapat_id_karyawan_key` (`id_rapat`, `id_karyawan`),
  KEY `rapat_peserta_id_karyawan_idx` (`id_karyawan`),
  CONSTRAINT `rapat_peserta_id_rapat_fkey` FOREIGN KEY (`id_rapat`) REFERENCES `rapat` (`id_rapat`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rapat_kehadiran` (
  `id_hadir` INT NOT NULL AUTO_INCREMENT,
  `id_rapat` INT NOT NULL,
  `id_karyawan` INT NOT NULL,
  `masuk_at` DATETIME(3) NOT NULL,
  `keluar_at` DATETIME(3) NULL,
  PRIMARY KEY (`id_hadir`),
  KEY `rapat_kehadiran_id_rapat_id_karyawan_idx` (`id_rapat`, `id_karyawan`),
  CONSTRAINT `rapat_kehadiran_id_rapat_fkey` FOREIGN KEY (`id_rapat`) REFERENCES `rapat` (`id_rapat`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
