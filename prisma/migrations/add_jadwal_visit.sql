-- Jadwal Visit teknis: work order bisa masuk antrean tanpa jadwal + info penugasan & notifikasi WA
ALTER TABLE `work_orders`
  MODIFY `tgl_jadwal` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `jam_jadwal` VARCHAR(5) NULL AFTER `tgl_jadwal`,
  ADD COLUMN IF NOT EXISTS `prioritas` VARCHAR(10) NOT NULL DEFAULT 'Normal' AFTER `jam_jadwal`,
  ADD COLUMN IF NOT EXISTS `urutan` INT NOT NULL DEFAULT 0 AFTER `prioritas`,
  ADD COLUMN IF NOT EXISTS `id_pb` INT NULL AFTER `urutan`,
  ADD COLUMN IF NOT EXISTS `dibuat_oleh` INT NULL AFTER `id_pb`,
  ADD COLUMN IF NOT EXISTS `wa_teknisi_at` DATETIME(3) NULL AFTER `dibuat_oleh`,
  ADD COLUMN IF NOT EXISTS `wa_pic_at` DATETIME(3) NULL AFTER `wa_teknisi_at`;
CREATE INDEX IF NOT EXISTS `work_orders_id_pb_idx` ON `work_orders` (`id_pb`);
