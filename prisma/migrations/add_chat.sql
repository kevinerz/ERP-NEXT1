-- Chat internal karyawan (Tahap 1). Jalankan manual: mysql erp_next1 < prisma/migrations/add_chat.sql
CREATE TABLE IF NOT EXISTS chat_ruang (
  id_ruang INT NOT NULL AUTO_INCREMENT,
  tipe VARCHAR(10) NOT NULL,
  nama VARCHAR(100) NULL,
  kunci VARCHAR(120) NULL,
  id_pembuat INT NULL,
  pesan_terakhir_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id_ruang),
  UNIQUE KEY chat_ruang_kunci_key (kunci)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_anggota (
  id_anggota INT NOT NULL AUTO_INCREMENT,
  id_ruang INT NOT NULL,
  id_karyawan INT NOT NULL,
  peran VARCHAR(10) NOT NULL DEFAULT 'anggota',
  terakhir_baca_id INT NOT NULL DEFAULT 0,
  bisu TINYINT(1) NOT NULL DEFAULT 0,
  bergabung_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_anggota),
  UNIQUE KEY chat_anggota_id_ruang_id_karyawan_key (id_ruang, id_karyawan),
  KEY chat_anggota_id_karyawan_idx (id_karyawan),
  CONSTRAINT chat_anggota_id_ruang_fkey FOREIGN KEY (id_ruang) REFERENCES chat_ruang (id_ruang) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_pesan (
  id_pesan INT NOT NULL AUTO_INCREMENT,
  id_ruang INT NOT NULL,
  id_pengirim INT NULL,
  isi TEXT NOT NULL,
  id_balas INT NULL,
  mention TEXT NULL,
  lampiran_file VARCHAR(255) NULL,
  lampiran_nama VARCHAR(255) NULL,
  lampiran_tipe VARCHAR(100) NULL,
  lampiran_ukuran INT NULL,
  diedit_at DATETIME(3) NULL,
  dihapus_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_pesan),
  KEY chat_pesan_id_ruang_id_pesan_idx (id_ruang, id_pesan),
  CONSTRAINT chat_pesan_id_ruang_fkey FOREIGN KEY (id_ruang) REFERENCES chat_ruang (id_ruang) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_status (
  id_karyawan INT NOT NULL,
  terakhir_aktif DATETIME(3) NOT NULL,
  mengetik_ruang INT NULL,
  mengetik_at DATETIME(3) NULL,
  PRIMARY KEY (id_karyawan)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
