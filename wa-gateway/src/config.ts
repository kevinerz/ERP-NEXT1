// Konfigurasi gateway dari environment (.env dimuat lewat `node --env-file`)
import path from 'node:path';

function wajib(nama: string): string {
  const v = process.env[nama];
  if (!v) throw new Error(`Env ${nama} wajib diisi`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3100),
  host: process.env.HOST || '0.0.0.0',
  // Kunci bersama ERP <-> gateway (header X-Api-Key, dua arah)
  apiKey: wajib('API_KEY'),
  webhookUrl: wajib('WEBHOOK_URL'),
  // Akun WA yang dijalankan, dipisah koma (sekarang: helpdesk)
  akun: (process.env.AKUN || 'helpdesk').split(',').map((s) => s.trim()).filter(Boolean),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  // Media lebih besar dari ini tidak diunduh (MB)
  maxMediaMb: Number(process.env.MAX_MEDIA_MB || 100),
  // Jeda acak antar pesan keluar (ms) — mengurangi risiko blokir
  jedaMinMs: Number(process.env.JEDA_MIN_MS || 1200),
  jedaMaxMs: Number(process.env.JEDA_MAX_MS || 2500),
  pesanTolakPanggilan:
    process.env.PESAN_TOLAK_PANGGILAN ||
    'Mohon maaf, nomor helpdesk ini tidak menerima panggilan telepon. Silakan sampaikan kebutuhan Anda melalui chat, tim kami akan segera membalas. 🙏',
};
