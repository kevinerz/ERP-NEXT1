-- Tabel riwayat email keluar (MailerService) untuk dashboard pantau kirim
CREATE TABLE IF NOT EXISTS `email_logs` (
  `id_email_log` INT NOT NULL AUTO_INCREMENT,
  `to_address`   VARCHAR(255) NOT NULL,
  `subject`      VARCHAR(255) NOT NULL,
  `modul`        VARCHAR(50)  NULL,
  `status`       VARCHAR(20)  NOT NULL,
  `error`        TEXT         NULL,
  `batch_id`     VARCHAR(40)  NULL,
  `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_email_log`),
  INDEX `email_logs_created_at_idx` (`created_at`),
  INDEX `email_logs_status_idx` (`status`),
  INDEX `email_logs_batch_id_idx` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
