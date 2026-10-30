-- IPAM: IP publik NEXT1 (blok, rencana zona, alokasi, riwayat)
CREATE TABLE IF NOT EXISTS `ip_blok` (
  `id_blok` INT NOT NULL AUTO_INCREMENT,
  `prefix` VARCHAR(43) NOT NULL,
  `asn` VARCHAR(20) NULL,
  `nama` VARCHAR(100) NOT NULL,
  `catatan` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_blok`),
  UNIQUE KEY `ip_blok_prefix_key` (`prefix`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ip_zona` (
  `id_zona` INT NOT NULL AUTO_INCREMENT,
  `id_blok` INT NOT NULL,
  `awal` INT NOT NULL,
  `akhir` INT NOT NULL,
  `prefix` VARCHAR(43) NOT NULL,
  `nama` VARCHAR(100) NOT NULL,
  `peruntukan` VARCHAR(30) NOT NULL,
  `catatan` TEXT NULL,
  PRIMARY KEY (`id_zona`),
  KEY `ip_zona_id_blok_idx` (`id_blok`),
  CONSTRAINT `ip_zona_id_blok_fkey` FOREIGN KEY (`id_blok`) REFERENCES `ip_blok` (`id_blok`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ip_alokasi` (
  `id_alokasi` INT NOT NULL AUTO_INCREMENT,
  `id_blok` INT NOT NULL,
  `awal` INT NOT NULL,
  `akhir` INT NOT NULL,
  `prefix` VARCHAR(43) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `peruntukan` VARCHAR(30) NOT NULL,
  `id_site` INT NULL,
  `gateway` VARCHAR(45) NULL,
  `vlan` INT NULL,
  `perangkat` VARCHAR(150) NULL,
  `keterangan` TEXT NULL,
  `karantina_sampai` DATETIME(3) NULL,
  `dialokasikan_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `dilepas_at` DATETIME(3) NULL,
  `id_karyawan` INT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id_alokasi`),
  KEY `ip_alokasi_id_blok_status_idx` (`id_blok`, `status`),
  KEY `ip_alokasi_id_site_idx` (`id_site`),
  CONSTRAINT `ip_alokasi_id_blok_fkey` FOREIGN KEY (`id_blok`) REFERENCES `ip_blok` (`id_blok`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ip_alokasi_id_site_fkey` FOREIGN KEY (`id_site`) REFERENCES `site_pelanggan` (`id_site`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ip_riwayat` (
  `id_riwayat` INT NOT NULL AUTO_INCREMENT,
  `id_alokasi` INT NOT NULL,
  `aksi` VARCHAR(30) NOT NULL,
  `detail` TEXT NULL,
  `id_karyawan` INT NULL,
  `nama_karyawan` VARCHAR(150) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_riwayat`),
  KEY `ip_riwayat_id_alokasi_idx` (`id_alokasi`),
  CONSTRAINT `ip_riwayat_id_alokasi_fkey` FOREIGN KEY (`id_alokasi`) REFERENCES `ip_alokasi` (`id_alokasi`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Blok awal + rencana pembagian (bisa diubah dari halaman IP Publik)
INSERT IGNORE INTO `ip_blok` (`prefix`, `asn`, `nama`) VALUES ('180.214.165.0/24', 'AS155058', 'Blok utama NEXT1');
INSERT INTO `ip_zona` (`id_blok`, `awal`, `akhir`, `prefix`, `nama`, `peruntukan`)
SELECT b.id_blok, z.awal, z.akhir, z.prefix, z.nama, z.peruntukan
FROM `ip_blok` b
JOIN (
  SELECT 0 awal, 15 akhir, '180.214.165.0/28' prefix, 'Infrastruktur inti' nama, 'Infrastruktur' peruntukan
  UNION ALL SELECT 16, 31, '180.214.165.16/28', 'Server NEXT1', 'Server'
  UNION ALL SELECT 32, 63, '180.214.165.32/27', 'Cadangan / ekspansi', 'Cadangan'
  UNION ALL SELECT 64, 127, '180.214.165.64/26', 'Pelanggan blok (/29, /30)', 'Pelanggan'
  UNION ALL SELECT 128, 255, '180.214.165.128/25', 'Pelanggan IP tunggal (/32)', 'Pelanggan'
) z
WHERE b.prefix = '180.214.165.0/24' AND NOT EXISTS (SELECT 1 FROM `ip_zona` x WHERE x.id_blok = b.id_blok);
