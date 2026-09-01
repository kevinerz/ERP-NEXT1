-- Tambah kolom sla_target_pct ke master_layanan
ALTER TABLE master_layanan ADD COLUMN sla_target_pct DECIMAL(5,2) NOT NULL DEFAULT 95.00;

-- Set target per jenis layanan
UPDATE master_layanan SET sla_target_pct = 99.0 WHERE kode_layanan IN ('FO','DUAL_FO','DED_FO','FO_DUAL_TLPN');

-- Tambah layanan SD-WAN baru
INSERT IGNORE INTO master_layanan (kode_layanan, nama_layanan, sla_target_pct, is_managed, is_aktif) VALUES
  ('SDWAN_BB',  'SD-WAN Broadband Internet',   98.0, 1, 1),
  ('SDWAN_GSM', 'SD-WAN GSM/LTE',              96.0, 1, 1),
  ('SDWAN',     'SD-WAN (Broadband + GSM)',     99.5, 1, 1),
  ('SDWAN_HW',  'SD-WAN Hardware Appliance',   99.9, 1, 1);
