-- Survey pasang baru: tahap OPS (vendor ISP, IKG, deposit, cover) + teknis opsional
ALTER TABLE pb_survey
  MODIFY status VARCHAR(30) NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS status_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS id_ops INT NULL,
  ADD COLUMN IF NOT EXISTS catatan_ops TEXT NULL,
  ADD COLUMN IF NOT EXISTS catatan_teknis TEXT NULL,
  ADD COLUMN IF NOT EXISTS id_teknis INT NULL;
UPDATE pb_survey SET status = 'Draft' WHERE status = 'Baru';

ALTER TABLE pb_survey_site
  ADD COLUMN IF NOT EXISTS cover VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS ikg_nominal DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ikg_pengelola VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS ikg_catatan VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS catatan_ops TEXT NULL,
  ADD COLUMN IF NOT EXISTS hasil_teknis TEXT NULL;

CREATE TABLE IF NOT EXISTS pb_survey_vendor (
  id_survey_vendor INT NOT NULL AUTO_INCREMENT,
  id_survey_site INT NOT NULL,
  id_vendor_isp INT NOT NULL,
  peruntukan_link VARCHAR(20) NOT NULL DEFAULT 'Main',
  bandwidth_mbps VARCHAR(30) NULL,
  biaya_mrc_vendor DECIMAL(15,2) NOT NULL DEFAULT 0,
  biaya_otc_vendor DECIMAL(15,2) NOT NULL DEFAULT 0,
  deposit_nominal DECIMAL(15,2) NOT NULL DEFAULT 0,
  deposit_jenis VARCHAR(30) NULL,
  catatan VARCHAR(500) NULL,
  PRIMARY KEY (id_survey_vendor),
  KEY pb_survey_vendor_id_survey_site_idx (id_survey_site),
  CONSTRAINT pb_survey_vendor_id_survey_site_fkey FOREIGN KEY (id_survey_site) REFERENCES pb_survey_site (id_survey_site) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT pb_survey_vendor_id_vendor_isp_fkey FOREIGN KEY (id_vendor_isp) REFERENCES master_vendor_isp (id_vendor) ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE pb_order ADD COLUMN IF NOT EXISTS id_survey_site INT NULL;
ALTER TABLE sumber_internet_site ADD COLUMN IF NOT EXISTS deposit_jenis VARCHAR(30) NULL;
