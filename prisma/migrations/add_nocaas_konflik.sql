-- Pasangan IP ERP ↔ router NOCaaS yang namanya tidak nyambung (IP basi / tertukar)
ALTER TABLE nocaas_router ADD COLUMN konflik_id_site INT NULL AFTER model;
