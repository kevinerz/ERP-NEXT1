-- Ping tunnel dari ERP: deteksi VPN "tersambung tapi macet"
ALTER TABLE nocaas_router
  ADD COLUMN ns_ping_ok TINYINT(1) NULL,
  ADD COLUMN un_ping_ok TINYINT(1) NULL,
  ADD COLUMN macet_sejak DATETIME(3) NULL,
  ADD COLUMN macet_lama TINYINT(1) NOT NULL DEFAULT 0;
