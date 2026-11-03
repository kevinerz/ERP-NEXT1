-- Jadwal Visit tahap 3: maintenance rutin otomatis + log kejadian untuk KPI teknisi
ALTER TABLE `work_orders` ADD COLUMN IF NOT EXISTS `id_aturan` INT NULL AFTER `gagal_count`;
CREATE TABLE IF NOT EXISTS `visit_pm_aturan` (
  `id_aturan` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `id_pelanggan` INT NULL,
  `kota` VARCHAR(100) NULL,
  `interval_hari` INT NOT NULL,
  `maks_per_hari` INT NOT NULL DEFAULT 5,
  `tgl_mulai` DATETIME(3) NULL,
  `prioritas` VARCHAR(10) NOT NULL DEFAULT 'Rendah',
  `deskripsi` TEXT NOT NULL,
  `is_aktif` BOOLEAN NOT NULL DEFAULT TRUE,
  `terakhir_jalan` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id_aturan`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `visit_log` (
  `id_log` INT NOT NULL AUTO_INCREMENT,
  `id_wo` INT NOT NULL,
  `id_karyawan` INT NULL,
  `aksi` VARCHAR(20) NOT NULL,
  `catatan` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_log`),
  INDEX `visit_log_created_at_idx` (`created_at`),
  INDEX `visit_log_id_wo_idx` (`id_wo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `visit_pm_aturan` ADD COLUMN IF NOT EXISTS `tgl_mulai` DATETIME(3) NULL AFTER `maks_per_hari`;
