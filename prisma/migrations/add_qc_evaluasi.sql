-- QC / evaluasi ERP: daftar modul + catatan revisi / bug / upgrade
CREATE TABLE IF NOT EXISTS qc_modul (
  id          INT NOT NULL AUTO_INCREMENT,
  kode        VARCHAR(60) NOT NULL,
  grup        VARCHAR(40) NOT NULL,
  nama        VARCHAR(100) NOT NULL,
  path        VARCHAR(120) NULL,
  deskripsi   TEXT NULL,
  status      VARCHAR(30) NOT NULL DEFAULT 'Belum dievaluasi',
  skor        INT NULL,
  pic         VARCHAR(100) NULL,
  urutan      INT NOT NULL DEFAULT 0,
  diubah_oleh VARCHAR(100) NULL,
  updated_at  DATETIME(3) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY qc_modul_kode_key (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS qc_catatan (
  id          INT NOT NULL AUTO_INCREMENT,
  id_modul    INT NOT NULL,
  jenis       VARCHAR(20) NOT NULL,
  judul       VARCHAR(200) NOT NULL,
  isi         TEXT NULL,
  prioritas   VARCHAR(10) NOT NULL DEFAULT 'Sedang',
  status      VARCHAR(20) NOT NULL DEFAULT 'Baru',
  pembuat     VARCHAR(100) NOT NULL,
  id_karyawan INT NULL,
  selesai_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY qc_catatan_id_modul_idx (id_modul),
  KEY qc_catatan_status_idx (status),
  CONSTRAINT qc_catatan_id_modul_fkey FOREIGN KEY (id_modul) REFERENCES qc_modul (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
