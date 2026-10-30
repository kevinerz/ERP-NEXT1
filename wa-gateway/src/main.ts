// Gateway WhatsApp (Baileys) untuk ERP NEXT1
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log } from './logger.js';
import { Sesi } from './sesi.js';
import { buatServer } from './server.js';

const sesi = new Map<string, Sesi>();
for (const akun of config.akun) sesi.set(akun, new Sesi(akun));

// Sesi yang sudah pernah login langsung tersambung lagi; yang belum menunggu perintah "mulai" (QR) dari ERP
for (const s of sesi.values()) {
  if (fs.existsSync(path.join(s.dirAuth, 'creds.json'))) {
    s.mulai().catch((e) => log.error({ akun: s.akun, err: e?.message }, 'Gagal memulai sesi'));
  }
}

const server = buatServer(sesi).listen(config.port, config.host, () => {
  log.info({ port: config.port, akun: config.akun }, 'wa-gateway berjalan');
});

// Bersihkan berkala: file media > 7 hari (ERP sudah menyimpan salinannya), kunci unduh media > 30 hari
function bersihkan(dir: string, hari: number) {
  if (!fs.existsSync(dir)) return;
  const batas = Date.now() - hari * 24 * 3600_000;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    try { if (fs.statSync(full).mtimeMs < batas) fs.unlinkSync(full); } catch { /* abaikan */ }
  }
}
setInterval(() => {
  for (const s of sesi.values()) { bersihkan(s.dirMedia, 7); bersihkan(s.dirKunciMedia, 30); }
}, 6 * 3600_000).unref();

function tutup() {
  log.info('wa-gateway berhenti');
  for (const s of sesi.values()) s.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', tutup);
process.on('SIGTERM', tutup);
process.on('unhandledRejection', (e: any) => log.error({ err: e?.message ?? String(e) }, 'unhandledRejection'));
