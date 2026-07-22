-- Toggle aktif/nonaktif polling PRTG (jeda saat resource hosting penuh)
ALTER TABLE `integration_prtg_config`
  ADD COLUMN `is_aktif` BOOLEAN NOT NULL DEFAULT TRUE;
