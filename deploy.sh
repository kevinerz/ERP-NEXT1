#!/usr/bin/env bash
# Deploy update ERP-NEXT1: tarik kode terbaru, build, restart.
set -e
cd ~/erp-next1
echo ">> git pull"; git pull
echo ">> npm install"; npm install --no-audit --no-fund
echo ">> hapus tsbuildinfo cache"; rm -f tsconfig.tsbuildinfo
echo ">> build (web+api)"; npm run build
echo ">> restart"; pm2 restart erp-next1 --update-env && pm2 save
echo ">> selesai. cek: curl -s https://1erp.nextone.id/api/health"
