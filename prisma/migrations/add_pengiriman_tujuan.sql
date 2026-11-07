-- Perangkat dikirim langsung ke store atau ke teknisi vendor
ALTER TABLE pengiriman_perangkat ADD COLUMN IF NOT EXISTS tujuan_kirim VARCHAR(20) NULL;
