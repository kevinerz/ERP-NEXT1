-- Tiket gangguan dari NOCaaS: konfigurasi + hapus tabel mode pantau (tidak dipakai lagi)
CREATE TABLE IF NOT EXISTS nocaas_config (
  id                      INT NOT NULL DEFAULT 1,
  tiket_aktif             TINYINT(1) NOT NULL DEFAULT 1,
  aktif_sejak             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  durasi_konfirmasi_menit INT NOT NULL DEFAULT 10,
  cooldown_menit          INT NOT NULL DEFAULT 60,
  maks_tiket_per_putaran  INT NOT NULL DEFAULT 30,
  terakhir_sinkron        DATETIME(3) NULL,
  updated_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TABLE IF EXISTS nocaas_tiket_pantau;
