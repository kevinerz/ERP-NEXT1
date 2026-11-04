-- Perangkat non-Mikrotik dari NOCaaS (RCMS / Ruijie)
ALTER TABLE nocaas_router
  ADD COLUMN jenis VARCHAR(20) NOT NULL DEFAULT 'mikrotik' AFTER nama_utama,
  ADD COLUMN model VARCHAR(40) NULL AFTER jenis;
