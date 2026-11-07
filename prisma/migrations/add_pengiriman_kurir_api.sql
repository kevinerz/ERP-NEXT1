-- Pengiriman perangkat dipesan lewat api.co.id (resi dilacak otomatis)
ALTER TABLE pengiriman_perangkat
  ADD COLUMN IF NOT EXISTS kurir_order_id VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS kurir_kode VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS kurir_layanan VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS kurir_status VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS kurir_biaya DECIMAL(15,2) NULL,
  ADD COLUMN IF NOT EXISTS kurir_riwayat TEXT NULL,
  ADD COLUMN IF NOT EXISTS kurir_cek_at DATETIME(3) NULL;
