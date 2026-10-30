-- Pin (sematkan) chat di inbox ERP — berlaku untuk semua staf helpdesk
ALTER TABLE `wa_chat` ADD COLUMN IF NOT EXISTS `disematkan_at` DATETIME(3) NULL AFTER `label`;
