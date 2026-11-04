-- Kontak WA ↔ PIC site (saran dari nama kontak) & notifikasi WA ke PIC untuk tiket NOCaaS
ALTER TABLE wa_kontak ADD COLUMN site_sumber VARCHAR(20) NULL AFTER nama_erp;
ALTER TABLE nocaas_config ADD COLUMN wa_pic_aktif TINYINT(1) NOT NULL DEFAULT 0 AFTER maks_tiket_per_putaran;
