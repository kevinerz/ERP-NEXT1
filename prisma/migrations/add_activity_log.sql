-- Migration: Add activity_log table
-- Jalankan di Hostinger phpMyAdmin / DB tool

CREATE TABLE IF NOT EXISTS `activity_log` (
  `id_log`     INT          NOT NULL AUTO_INCREMENT,
  `id_user`    INT          NULL,
  `username`   VARCHAR(80)  NOT NULL,
  `nama`       VARCHAR(150) NULL,
  `aksi`       VARCHAR(20)  NOT NULL,
  `modul`      VARCHAR(30)  NULL,
  `entitas`    VARCHAR(60)  NULL,
  `deskripsi`  TEXT         NULL,
  `ip_address` VARCHAR(45)  NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_log`),
  INDEX `activity_log_id_user_idx` (`id_user`),
  INDEX `activity_log_created_at_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
