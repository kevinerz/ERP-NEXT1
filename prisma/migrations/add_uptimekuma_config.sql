-- Tabel konfigurasi Uptime Kuma: ada di schema.prisma tetapi belum pernah dibuat di basis data,
-- sehingga halaman Pengaturan → Uptime Kuma selalu gagal (500).
CREATE TABLE IF NOT EXISTS `integration_uptimekuma_config` (
  `id` int NOT NULL DEFAULT 1,
  `base_url` varchar(255) DEFAULT NULL,
  `status_page_slug` varchar(150) DEFAULT NULL,
  `webhook_token` varchar(100) DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
