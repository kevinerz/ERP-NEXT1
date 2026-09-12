# Server Documentation — ERP NEXT1

Dokumentasi lengkap konfigurasi server produksi untuk aplikasi ERP NEXT1.

---

## Spesifikasi Server

| Item | Detail |
|------|--------|
| **IP** | `103.12.28.12` |
| **SSH Port** | `2221` |
| **SSH User** | `next1` |
| **OS** | Ubuntu 24.04.3 LTS (Noble Numbat) |
| **Node.js** | v22.23.2 |
| **NPM** | 10.9.8 |
| **Database** | MariaDB 10.11.14 |
| **Web Server** | Nginx 1.24.0 |
| **Process Manager** | PM2 7.0.3 |

---

## Domain & URL

| Domain | Fungsi | SSL |
|--------|--------|-----|
| `https://1erp.nextone.id` | Aplikasi ERP internal (staff) | Let's Encrypt |
| `https://portal.nextone.id` | Portal pelanggan | Let's Encrypt |

SSH alias lokal:
```
Host erp-next1
  HostName 103.12.28.12
  Port 2221
  User next1
  IdentityFile ~/.ssh/erpnext1_key
```

---

## Struktur Direktori di Server

```
/home/next1/erp-next1/
├── .env                        # Environment variables (JANGAN di-commit)
├── dist/                       # Compiled NestJS output
│   └── modules/
├── public/                     # Frontend build (Vue Vite output)
│   ├── assets/
│   └── index.html
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/                        # Source TypeScript
├── web/                        # Source Vue 3
├── mobile/                     # Capacitor mobile
├── node_modules/
├── package.json
├── deploy.sh                   # Script deploy otomatis
└── firebase-service-account.json   # FCM credentials (JANGAN di-commit)
```

---

## Port yang Digunakan

| Port | Service |
|------|---------|
| `80` | Nginx HTTP (redirect ke HTTPS) |
| `443` | Nginx HTTPS |
| `2221` | SSH |
| `3000` | NestJS app (internal, via nginx proxy) |
| `3306` | MariaDB (localhost only) |

---

## Cara Deploy Update

### Otomatis via `deploy.sh`
```bash
ssh erp-next1
cd ~/erp-next1
bash deploy.sh
```

### Manual (jika perlu patch dist saja)
```bash
# 1. Build frontend lokal
cd web && npm run build

# 2. Package assets
tar czf /tmp/web_assets.tar.gz -C public assets/ index.html

# 3. Upload ke server
scp -P 2221 -i ~/.ssh/erpnext1_key /tmp/web_assets.tar.gz next1@103.12.28.12:/tmp/

# 4. Extract di server
ssh erp-next1 "cd ~/erp-next1/public && tar xzf /tmp/web_assets.tar.gz"
```

### Restart PM2
```bash
ssh erp-next1 "pm2 restart erp-next1 --update-env && pm2 save"
```

---

## PM2 Configuration

Process name: `erp-next1`

```bash
# Start (pertama kali)
pm2 start dist/main.js --name erp-next1 --node-args="--env-file=/home/next1/erp-next1/.env"

# Startup otomatis saat reboot
pm2 startup
pm2 save

# Monitoring
pm2 status
pm2 logs erp-next1
pm2 monit
```

PM2 dump tersimpan di: `~/.pm2/dump.pm2`

---

## Database

| Item | Detail |
|------|--------|
| **Engine** | MariaDB 10.11.14 |
| **Host** | `localhost:3306` |
| **Database** | `erp_next1` |
| **User** | `erp_next1` |

```bash
# Akses MySQL
mysql -u erp_next1 -p erp_next1

# Backup database
mysqldump -u erp_next1 -p erp_next1 | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore database
gunzip -c backup.sql.gz | mysql -u erp_next1 -p erp_next1
```

---

## SSL Certificates (Let's Encrypt / Certbot)

```bash
# Cek status SSL
sudo certbot certificates

# Renew (otomatis via systemd timer, manual jika perlu)
sudo certbot renew

# Path sertifikat
/etc/letsencrypt/live/1erp.nextone.id/fullchain.pem
/etc/letsencrypt/live/1erp.nextone.id/privkey.pem
/etc/letsencrypt/live/portal.nextone.id/fullchain.pem
/etc/letsencrypt/live/portal.nextone.id/privkey.pem
```

---

## Nginx

Config tersimpan di: [`nginx/`](nginx/)

```bash
# Test config
sudo nginx -t

# Reload config
sudo systemctl reload nginx

# Status
sudo systemctl status nginx
```

Lihat [`nginx/sites-available/1erp.nextone.id.conf`](nginx/sites-available/1erp.nextone.id.conf) dan [`nginx/sites-available/portal.nextone.id.conf`](nginx/sites-available/portal.nextone.id.conf)

---

## Cek Kesehatan Aplikasi

```bash
# Health check endpoint
curl -s https://1erp.nextone.id/api/health

# PM2 status
pm2 status

# Log error terbaru
pm2 logs erp-next1 --err --lines 50

# Disk usage
df -h

# RAM usage
free -h
```

---

## Environment Variables

Lihat [`env.example`](env.example) untuk daftar lengkap variabel yang dibutuhkan.

File `.env` aktif ada di server: `/home/next1/erp-next1/.env`
**JANGAN pernah commit file `.env` asli ke GitHub.**

---

## Integrasi Eksternal

| Layanan | Keterangan |
|---------|-----------|
| **SMTP Hostinger** | `smtp.hostinger.com:465` — email notifikasi dari `noreply@nextone.id` |
| **Starsender** | API WhatsApp `api.starsender.online` — notifikasi WA |
| **PRTG** | Webhook monitoring jaringan |
| **Firebase FCM** | Push notification mobile app |
| **Let's Encrypt** | SSL otomatis via Certbot |
