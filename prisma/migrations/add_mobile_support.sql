-- FCM token untuk push notifications
ALTER TABLE core_users ADD COLUMN fcm_token VARCHAR(255) NULL;

-- Tabel lokasi realtime teknisi (upsert by id_karyawan)
CREATE TABLE IF NOT EXISTS teknisi_lokasi (
  id_lokasi   INT          NOT NULL AUTO_INCREMENT,
  id_karyawan INT          NOT NULL,
  latitude    DECIMAL(10,7) NOT NULL,
  longitude   DECIMAL(10,7) NOT NULL,
  akurasi     FLOAT         NULL,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_lokasi),
  UNIQUE KEY uq_teknisi_lokasi (id_karyawan),
  CONSTRAINT fk_teknisi_lokasi_karyawan FOREIGN KEY (id_karyawan) REFERENCES hris_karyawan (id_karyawan) ON DELETE CASCADE
);
