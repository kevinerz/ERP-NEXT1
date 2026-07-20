-- Jalankan di phpMyAdmin setelah deploy
-- Cegah 2 kontrak terbuat untuk 1 quotation yang sama kalau ada 2 request
-- approve/convert yang masuk bersamaan (race condition) — sebelumnya cuma
-- dicek via SELECT di application code, tidak dijamin database.
ALTER TABLE `kontrak_layanan` ADD UNIQUE INDEX `kontrak_layanan_id_quotation_key` (`id_quotation`);
