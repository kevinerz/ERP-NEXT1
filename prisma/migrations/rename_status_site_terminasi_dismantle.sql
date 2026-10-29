-- Status site "Terminasi" diganti "Dismantle" supaya tidak ambigu dengan Terminasi kontrak.
-- (status_kontrak di kontrak_layanan TETAP 'Terminasi'.)
UPDATE `site_pelanggan` SET `status_site` = 'Dismantle' WHERE `status_site` = 'Terminasi';
