-- Chat: kudos antar karyawan. Jalankan manual: mysql erp_next1 < prisma/migrations/add_chat_kudos.sql
CREATE TABLE IF NOT EXISTS chat_kudos (
  id_kudos INT NOT NULL AUTO_INCREMENT,
  id_dari INT NOT NULL,
  id_untuk INT NOT NULL,
  kategori VARCHAR(30) NOT NULL,
  pesan VARCHAR(300) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_kudos),
  KEY chat_kudos_id_untuk_idx (id_untuk, created_at),
  KEY chat_kudos_id_dari_idx (id_dari, created_at)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
