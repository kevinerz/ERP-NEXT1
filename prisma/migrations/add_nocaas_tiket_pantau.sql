-- Mode pantau NOCaaS: status router saat tiket PRTG dibuat & selesai (tidak mengubah alur tiket)
CREATE TABLE IF NOT EXISTS nocaas_tiket_pantau (
  id_ticket       INT NOT NULL,
  status_buka     VARCHAR(20) NOT NULL,
  site_key        VARCHAR(150) NULL,
  umur_data_detik INT NULL,
  akan_ditahan    TINYINT(1) NOT NULL DEFAULT 0,
  dicatat_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  terburuk        VARCHAR(20) NULL,
  terburuk_at     DATETIME(3) NULL,
  status_selesai  VARCHAR(20) NULL,
  selesai_at      DATETIME(3) NULL,
  durasi_menit    INT NULL,
  buka_ulang      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id_ticket),
  KEY nocaas_tiket_pantau_dicatat_at_idx (dicatat_at),
  CONSTRAINT nocaas_tiket_pantau_id_ticket_fkey FOREIGN KEY (id_ticket) REFERENCES operation_tickets (id_ticket) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
