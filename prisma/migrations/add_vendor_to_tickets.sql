-- Tambah kolom vendor teknisi ke tiket gangguan
ALTER TABLE operation_tickets
  ADD COLUMN id_kontak_teknisi INT NULL AFTER id_teknisi_pic,
  ADD CONSTRAINT fk_ticket_kontak_teknisi
    FOREIGN KEY (id_kontak_teknisi) REFERENCES master_kontak_teknisi (id_kontak);
