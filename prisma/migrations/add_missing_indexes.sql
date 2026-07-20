-- Jalankan di phpMyAdmin setelah deploy
-- Index yang tertinggal saat tabel dibuat — dibutuhkan scheduler (cek SLA tiket
-- tiap 15 menit, cek kontrak berakhir harian) dan filter status_wo di WorkOrder
-- yang strukturnya mirip operation_tickets tapi sebelumnya tidak diindeks.

ALTER TABLE `operation_tickets` ADD INDEX `idx_ticket_sla` (`sla_due`, `sla_breached`);
ALTER TABLE `work_orders` ADD INDEX `idx_wo_status_jadwal` (`status_wo`, `tgl_jadwal`);
ALTER TABLE `kontrak_layanan` ADD INDEX `idx_kontrak_status_berakhir` (`status_kontrak`, `tgl_berakhir`);
