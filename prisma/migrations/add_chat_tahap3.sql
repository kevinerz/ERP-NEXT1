-- Chat Tahap 3: reaksi emoji. Jalankan manual: mysql erp_next1 < prisma/migrations/add_chat_tahap3.sql
CREATE TABLE IF NOT EXISTS chat_reaksi (
  id_reaksi INT NOT NULL AUTO_INCREMENT,
  id_pesan INT NOT NULL,
  id_karyawan INT NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_reaksi),
  UNIQUE KEY chat_reaksi_unik (id_pesan, id_karyawan, emoji),
  KEY chat_reaksi_id_pesan_idx (id_pesan)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
