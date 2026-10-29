# wa-gateway

Gateway WhatsApp (Baileys 7) untuk inbox helpdesk ERP. Berjalan terpisah di VM `whatsapp-Gateway`
(192.168.200.186, Ubuntu 24.04, Node 24, PM2) supaya koneksi WhatsApp tidak membebani ERP.

- ERP → gateway: REST `http://192.168.200.186:3100` (header `X-Api-Key`), port dibatasi firewall Proxmox ke IP ERP.
- Gateway → ERP: webhook `POST /api/wa/webhook` (pesan, riwayat, status, kontak, koneksi, panggilan).
- Sesi login di `data/auth/<akun>` (jangan dihapus — kalau hilang harus scan QR ulang); media sementara di `data/media/<akun>` (7 hari).

## Deploy di VM

```bash
cd /opt/wa-gateway
npm ci
npx tsc -p .
pm2 restart wa-gateway   # pertama kali: pm2 start ecosystem.config.cjs && pm2 save
```
