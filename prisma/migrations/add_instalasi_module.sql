-- Tambah kolom login vendor ke master_kontak_teknisi
ALTER TABLE master_kontak_teknisi
  ADD COLUMN username VARCHAR(80) NULL UNIQUE AFTER catatan,
  ADD COLUMN pin_hash VARCHAR(255) NULL AFTER username;

-- Tabel utama order instalasi
CREATE TABLE IF NOT EXISTS instalasi_orders (
  id_instalasi        INT NOT NULL AUTO_INCREMENT,
  nomor_instalasi     VARCHAR(100) NOT NULL,
  id_site             INT NOT NULL,
  id_layanan          INT NULL,
  jenis_pelaksana     VARCHAR(20) NOT NULL DEFAULT 'Internal',
  id_teknisi_internal INT NULL,
  id_kontak_teknisi   INT NULL,
  fee_vendor          DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  status_instalasi    VARCHAR(30) NOT NULL DEFAULT 'Draft',
  tgl_jadwal          DATE NULL,
  tgl_mulai           DATETIME NULL,
  tgl_selesai         DATETIME NULL,
  catatan             TEXT NULL,
  lokasi_lat          DECIMAL(10,7) NULL,
  lokasi_lng          DECIMAL(10,7) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_instalasi),
  UNIQUE KEY uq_nomor_instalasi (nomor_instalasi),
  KEY idx_instalasi_status (status_instalasi),
  CONSTRAINT fk_instalasi_site      FOREIGN KEY (id_site)             REFERENCES site_pelanggan (id_site),
  CONSTRAINT fk_instalasi_layanan   FOREIGN KEY (id_layanan)          REFERENCES master_layanan (id_layanan),
  CONSTRAINT fk_instalasi_teknisi   FOREIGN KEY (id_teknisi_internal) REFERENCES hris_karyawan (id_karyawan),
  CONSTRAINT fk_instalasi_kontak    FOREIGN KEY (id_kontak_teknisi)   REFERENCES master_kontak_teknisi (id_kontak)
);

-- Foto dokumentasi per order
CREATE TABLE IF NOT EXISTS instalasi_photos (
  id_foto      INT NOT NULL AUTO_INCREMENT,
  id_instalasi INT NOT NULL,
  stage        VARCHAR(30) NOT NULL DEFAULT 'Proses',
  filename     VARCHAR(255) NOT NULL,
  caption      VARCHAR(500) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_foto),
  KEY idx_instalasi_photos_order (id_instalasi),
  CONSTRAINT fk_instalasi_photos_order FOREIGN KEY (id_instalasi)
    REFERENCES instalasi_orders (id_instalasi) ON DELETE CASCADE
);

-- Log perubahan status
CREATE TABLE IF NOT EXISTS instalasi_logs (
  id_log       INT NOT NULL AUTO_INCREMENT,
  id_instalasi INT NOT NULL,
  status_dari  VARCHAR(50) NULL,
  status_ke    VARCHAR(50) NULL,
  catatan      TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_log),
  CONSTRAINT fk_instalasi_logs_order FOREIGN KEY (id_instalasi)
    REFERENCES instalasi_orders (id_instalasi) ON DELETE CASCADE
);

-- BAST tanda tangan
CREATE TABLE IF NOT EXISTS instalasi_bast_sign (
  id_bast                      INT NOT NULL AUTO_INCREMENT,
  id_instalasi                 INT NOT NULL,
  nama_penandatangan_pelanggan VARCHAR(150) NULL,
  jabatan_penandatangan        VARCHAR(100) NULL,
  ttd_teknisi_path             VARCHAR(255) NULL,
  ttd_pelanggan_path           VARCHAR(255) NULL,
  tgl_ditandatangani           DATETIME NULL,
  created_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_bast),
  UNIQUE KEY uq_bast_instalasi (id_instalasi),
  CONSTRAINT fk_instalasi_bast_order FOREIGN KEY (id_instalasi)
    REFERENCES instalasi_orders (id_instalasi) ON DELETE CASCADE
);
