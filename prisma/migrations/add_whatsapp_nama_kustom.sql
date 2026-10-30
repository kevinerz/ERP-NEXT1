-- Nama kontak yang diberikan staf helpdesk di ERP (tidak tertimpa sinkron kontak HP)
ALTER TABLE `wa_kontak` ADD COLUMN IF NOT EXISTS `nama_kustom` VARCHAR(150) NULL AFTER `nama_simpan`;
