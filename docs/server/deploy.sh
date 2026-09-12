#!/usr/bin/env bash
# Deploy update ERP-NEXT1: tarik kode terbaru, build, restart.
# Jalankan dari server: bash ~/erp-next1/deploy.sh
set -e

cd ~/erp-next1

echo ">> git pull"
git pull

echo ">> npm install"
npm install --no-audit --no-fund

echo ">> hapus tsbuildinfo cache"
rm -f tsconfig.tsbuildinfo

echo ">> build (web + api)"
npm run build

echo ">> prisma generate"
npx prisma generate

echo ">> restart PM2"
pm2 restart erp-next1 --update-env && pm2 save

echo ">> selesai"
curl -s https://1erp.nextone.id/api/health
