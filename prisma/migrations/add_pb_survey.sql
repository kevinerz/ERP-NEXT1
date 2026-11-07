-- Pasang Baru: Survey sebagai tahap pertama sebelum SPH
CREATE TABLE IF NOT EXISTS pb_survey (
  id_survey INT NOT NULL AUTO_INCREMENT,
  nomor_survey VARCHAR(40) NOT NULL,
  id_pelanggan INT NULL,
  nama_perusahaan VARCHAR(200) NOT NULL,
  nama_pic VARCHAR(150) NOT NULL,
  telp_pic VARCHAR(30) NULL,
  email_pic VARCHAR(150) NULL,
  catatan TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Baru',
  id_sales INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id_survey),
  UNIQUE KEY pb_survey_nomor_survey_key (nomor_survey),
  KEY pb_survey_status_idx (status)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pb_survey_site (
  id_survey_site INT NOT NULL AUTO_INCREMENT,
  id_survey INT NOT NULL,
  nama_site VARCHAR(150) NOT NULL,
  alamat TEXT NOT NULL,
  lantai_unit VARCHAR(100) NULL,
  kota VARCHAR(100) NULL,
  id_layanan INT NOT NULL,
  urutan INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id_survey_site),
  KEY pb_survey_site_id_survey_idx (id_survey),
  CONSTRAINT pb_survey_site_id_survey_fkey FOREIGN KEY (id_survey) REFERENCES pb_survey (id_survey) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT pb_survey_site_id_layanan_fkey FOREIGN KEY (id_layanan) REFERENCES master_layanan (id_layanan) ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE pb_sph ADD COLUMN IF NOT EXISTS id_survey INT NULL;
ALTER TABLE pb_riwayat ADD COLUMN IF NOT EXISTS id_survey INT NULL;
ALTER TABLE pb_riwayat ADD INDEX IF NOT EXISTS pb_riwayat_id_survey_idx (id_survey);
