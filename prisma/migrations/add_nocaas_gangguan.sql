-- Kategori gangguan NOCaaS lain (jalur, port, sering putus) + riwayat kondisi untuk tiket & laporan
ALTER TABLE nocaas_config ADD COLUMN kategori JSON NULL AFTER wa_pic_aktif;
ALTER TABLE nocaas_router ADD COLUMN wan_status JSON NULL AFTER macet_lama, ADD COLUMN live_at DATETIME(3) NULL AFTER wan_status;
CREATE TABLE IF NOT EXISTS nocaas_gangguan (
  id          INT NOT NULL AUTO_INCREMENT,
  site_key    VARCHAR(150) NOT NULL,
  id_site     INT NULL,
  kategori    VARCHAR(30) NOT NULL,
  detail      VARCHAR(60) NOT NULL DEFAULT '',
  nilai       INT NULL,
  mulai_at    DATETIME(3) NOT NULL,
  terakhir_at DATETIME(3) NOT NULL,
  selesai_at  DATETIME(3) NULL,
  id_ticket   INT NULL,
  PRIMARY KEY (id),
  KEY nocaas_gangguan_selesai_at_idx (selesai_at),
  KEY nocaas_gangguan_id_site_kategori_idx (id_site, kategori),
  KEY nocaas_gangguan_id_ticket_idx (id_ticket),
  KEY nocaas_gangguan_mulai_at_idx (mulai_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
