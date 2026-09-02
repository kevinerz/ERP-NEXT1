ALTER TABLE operation_tickets
  ADD COLUMN tgl_berangkat DATETIME NULL,
  ADD COLUMN tgl_sampai    DATETIME NULL;

CREATE TABLE IF NOT EXISTS operation_ticket_photos (
  id_foto    INT NOT NULL AUTO_INCREMENT,
  id_ticket  INT NOT NULL,
  stage      VARCHAR(20) NOT NULL,
  filename   VARCHAR(255) NOT NULL,
  caption    VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_foto),
  KEY idx_ticket_photos_ticket (id_ticket),
  CONSTRAINT fk_ticket_photos_ticket FOREIGN KEY (id_ticket)
    REFERENCES operation_tickets (id_ticket) ON DELETE CASCADE
);
