-- Meeting: link tamu (langsung masuk tanpa login) + kehadiran tamu
ALTER TABLE `rapat`
  ADD COLUMN IF NOT EXISTS `tamu_kode` VARCHAR(48) NULL AFTER `selesai_at`,
  ADD COLUMN IF NOT EXISTS `tamu_aktif` TINYINT(1) NOT NULL DEFAULT 0 AFTER `tamu_kode`,
  ADD COLUMN IF NOT EXISTS `tamu_sampai` DATETIME(3) NULL AFTER `tamu_aktif`;
CREATE UNIQUE INDEX IF NOT EXISTS `rapat_tamu_kode_key` ON `rapat` (`tamu_kode`);
ALTER TABLE `rapat_kehadiran`
  MODIFY `id_karyawan` INT NULL,
  ADD COLUMN IF NOT EXISTS `identity` VARCHAR(64) NULL AFTER `id_karyawan`,
  ADD COLUMN IF NOT EXISTS `nama_tamu` VARCHAR(200) NULL AFTER `identity`;
