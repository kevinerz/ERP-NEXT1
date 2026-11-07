-- Pasang Baru tahap Network: perangkat, pemasangan (ekspedisi + vendor / visit internal), BA aktivasi
ALTER TABLE pb_order
  ADD COLUMN IF NOT EXISTS network_metode VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS id_wo INT NULL,
  ADD COLUMN IF NOT EXISTS ba_nomor VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS ba_nama VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS ba_jabatan VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS ba_ttd VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS ba_nama_next1 VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS ba_tgl DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS ba_sumber VARCHAR(20) NULL;
ALTER TABLE pb_order ADD UNIQUE INDEX IF NOT EXISTS pb_order_ba_nomor_key (ba_nomor);
CREATE TABLE IF NOT EXISTS pb_perangkat (
  id_pb_perangkat INT NOT NULL AUTO_INCREMENT,
  id_pb INT NOT NULL,
  id_aset INT NULL,
  id_pengajuan INT NULL,
  nama_item VARCHAR(150) NOT NULL,
  id_karyawan INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_pb_perangkat),
  KEY pb_perangkat_id_pb_idx (id_pb)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- order yang sudah "Terpasang" (OPS selesai) masuk tahap Network
UPDATE pb_order SET tahap = 'Network' WHERE tahap = 'Terpasang';
