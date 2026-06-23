-- Jalankan di phpMyAdmin setelah deploy
-- Tabel notifikasi in-app per user

CREATE TABLE IF NOT EXISTS `notifications` (
  `id_notif`   INT           NOT NULL AUTO_INCREMENT,
  `id_user`    INT           NOT NULL,
  `tipe`       VARCHAR(50)   NOT NULL,
  `judul`      VARCHAR(200)  NOT NULL,
  `deskripsi`  TEXT          NULL,
  `url`        VARCHAR(255)  NULL,
  `is_read`    TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_notif`),
  INDEX `idx_notif_user_read` (`id_user`, `is_read`),
  INDEX `idx_notif_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
