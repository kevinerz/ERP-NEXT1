-- Jadwal Visit tahap 2: link lapangan teknisi (check-in GPS, foto, TTD PIC, gagal/jadwal ulang)
ALTER TABLE `work_orders`
  ADD COLUMN IF NOT EXISTS `token_lapangan` VARCHAR(48) NULL AFTER `wa_pic_at`,
  ADD COLUMN IF NOT EXISTS `checkin_at` DATETIME(3) NULL AFTER `token_lapangan`,
  ADD COLUMN IF NOT EXISTS `ttd_path` VARCHAR(255) NULL AFTER `checkin_at`,
  ADD COLUMN IF NOT EXISTS `ttd_nama` VARCHAR(150) NULL AFTER `ttd_path`,
  ADD COLUMN IF NOT EXISTS `gagal_count` INT NOT NULL DEFAULT 0 AFTER `ttd_nama`;
CREATE UNIQUE INDEX IF NOT EXISTS `work_orders_token_lapangan_key` ON `work_orders` (`token_lapangan`);
