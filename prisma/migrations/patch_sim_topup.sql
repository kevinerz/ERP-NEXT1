-- Patch: sim_topup menggunakan id_sumber (SumberInternetSite) sebagai referensi utama
-- id_aset_sim dijadikan nullable (opsional)

ALTER TABLE `sim_topup`
  MODIFY COLUMN `id_aset_sim` INT NULL,
  ADD COLUMN `id_sumber` INT NULL AFTER `id_topup`,
  ADD CONSTRAINT `fk_simtopup_sumber` FOREIGN KEY (`id_sumber`) REFERENCES `sumber_internet_site`(`id_sumber`) ON DELETE SET NULL;
