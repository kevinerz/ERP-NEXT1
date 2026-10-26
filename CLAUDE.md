# CLAUDE.md — ERP-NEXT1

ERP internal PT. Perdana Global Internet (NEXT1), sebuah ISP. Bahasa komunikasi & commit: **Bahasa Indonesia**.

## Stack
- **Backend** (`src/`): NestJS 11 + Prisma 5 + MySQL/MariaDB. Entry `src/main.ts`, modul di `src/modules/*` (admin, assets, auth, contracts, crm, email, finance, hris, instalasi, integrations, master, mikrotik, mobile, notifications, onboarding, operations, portal, projects, public-wo, reports, sales, settings, tools). Utilitas bersama di `src/common/*` (audit, crypto, guards, mailer, scheduler, upload, document-number, dll).
- **Web** (`web/`): Vue 3 + Vite + Pinia. Hasil build disajikan oleh backend (folder `public/`).
- **Mobile** (`mobile/`): Vue 3 + Capacitor 6 (Android).
- **DB schema**: `prisma/schema.prisma`, migrasi di `prisma/migrations/`, seed `prisma/seed.ts`.

## Perintah
- `npm run start:dev` — API dev (port 3000); `cd web && npm run dev` — web dev (port 5173)
- `npm run build` — build web + API (`build:web`, `build:api`)
- `npm run lint`, `npm run seed`, `npm run version:bump`
- Env: salin `.env.example` → `.env` (jangan commit). Key Google Maps di `web/.env`.

## Server produksi
- Detail lengkap: `docs/server/README.md` (nginx, pm2, deploy).
- SSH: `ssh erp-next1` (host `103.12.28.12`, port `2221`, user `next1`, key `~/.ssh/erpnext1_key`).
- App dir: `/home/next1/erp-next1`, proses PM2 `erp-next1`, DB MariaDB.
- Domain: `https://1erp.nextone.id` (ERP staff), `https://portal.nextone.id` (portal pelanggan).
- Deploy: di server jalankan `~/erp-next1/deploy.sh` (git pull → npm install → build → pm2 restart).
  Cek: `curl -s https://1erp.nextone.id/api/health`.

## Konvensi
- Commit pakai gaya conventional dengan scope modul, deskripsi Bahasa Indonesia, mis. `feat(prtg): ...`, `fix(email): ...`.
- Jangan commit `.env`, `firebase-service-account.json`, atau kredensial apa pun.
- Integrasi PRTG di-gate oleh `PRTG_POLL_ENABLED` (default mati).
