-- WO dikerjakan teknisi pihak ketiga dari Master Kontak Teknisi (pasang baru: kirim + vendor teknisi)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS id_kontak_teknisi INT NULL;
ALTER TABLE work_orders ADD INDEX IF NOT EXISTS work_orders_id_kontak_teknisi_fkey (id_kontak_teknisi);
SET @ada := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'work_orders' AND CONSTRAINT_NAME = 'work_orders_id_kontak_teknisi_fkey');
SET @q := IF(@ada = 0, 'ALTER TABLE work_orders ADD CONSTRAINT work_orders_id_kontak_teknisi_fkey FOREIGN KEY (id_kontak_teknisi) REFERENCES master_kontak_teknisi (id_kontak) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;
