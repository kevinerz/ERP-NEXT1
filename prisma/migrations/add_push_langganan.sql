-- Web Push (browser) langganan. Jalankan manual: mysql erp_next1 < prisma/migrations/add_push_langganan.sql
CREATE TABLE IF NOT EXISTS push_langganan (
  id_langganan INT NOT NULL AUTO_INCREMENT,
  id_karyawan INT NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_langganan),
  UNIQUE KEY push_langganan_endpoint_hash_key (endpoint_hash),
  KEY push_langganan_id_karyawan_idx (id_karyawan)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
