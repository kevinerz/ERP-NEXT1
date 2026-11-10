-- Ringkasan konfigurasi router dari NOCaaS (model, SN, RouterOS, interface, LAN, DHCP, VPN) untuk panel di detail site
ALTER TABLE nocaas_router
  ADD COLUMN live_ringkas JSON NULL AFTER live_at,
  ADD COLUMN vpn_ringkas JSON NULL AFTER live_ringkas;
