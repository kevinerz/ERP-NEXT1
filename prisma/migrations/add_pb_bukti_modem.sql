-- Pasang Baru tahap OPS: bukti pemasangan modem vendor per link
ALTER TABLE sumber_internet_site
  ADD COLUMN IF NOT EXISTS foto_modem VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS speedtest_down DECIMAL(10,2) NULL,
  ADD COLUMN IF NOT EXISTS speedtest_up DECIMAL(10,2) NULL,
  ADD COLUMN IF NOT EXISTS speedtest_ping DECIMAL(10,2) NULL,
  ADD COLUMN IF NOT EXISTS foto_speedtest VARCHAR(255) NULL;
-- order lama di tahap yang kini ditiadakan (tidak ada data saat migrasi)
UPDATE pb_order SET tahap = 'OPS' WHERE tahap IN ('Sales');
