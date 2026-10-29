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

// Media yang sudah lebih dari 7 hari dihapus (ERP sudah menyimpan salinannya)
setInterval(() => {
  const batas = Date.now() - 7 * 24 * 3600_000;
  for (const s of sesi.values()) {
    if (!fs.existsSync(s.dirMedia)) continue;
    for (const f of fs.readdirSync(s.dirMedia)) {
      const full = path.join(s.dirMedia, f);
      try { if (fs.statSync(full).mtimeMs < batas) fs.unlinkSync(full); } catch { /* abaikan */ }
    }
  }
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
