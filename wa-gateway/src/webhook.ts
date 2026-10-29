// Pengirim event ke ERP: antrean berurutan (urutan pesan terjaga) + coba ulang bila ERP sedang mati
import { config } from './config.js';
import { log } from './logger.js';

export type EventWebhook = { akun: string; event: string; data: unknown };

// Jalur cepat: pesan baru, status, koneksi, panggilan. Jalur massal: riwayat, kontak, chat, pemetaan LID.
// Supaya chat pelanggan yang masuk saat sinkron riwayat tidak menunggu di belakang ribuan pesan lama.
const MASSAL = new Set(['riwayat', 'kontak', 'chat', 'lid']);
const cepat: EventWebhook[] = [];
const massal: EventWebhook[] = [];
let jalan = false;
let terakhirPeringatan = 0;

export function panjangAntrean() {
  return { cepat: cepat.length, massal: massal.length };
}

export function kirimWebhook(ev: EventWebhook) {
  const massalkah = MASSAL.has(ev.event) || (ev.event === 'pesan' && (ev.data as any)?.riwayat);
  (massalkah ? massal : cepat).push(ev);
  if (cepat.length + massal.length > 5000 && Date.now() - terakhirPeringatan > 60_000) {
    terakhirPeringatan = Date.now();
    log.warn(panjangAntrean(), 'Antrean webhook menumpuk — ERP lambat/mati?');
  }
  void proses();
}

async function proses() {
  if (jalan) return;
  jalan = true;
  let tunda = 1000;
  try {
    while (cepat.length || massal.length) {
      const antrean = cepat.length ? cepat : massal;
      const ev = antrean[0]!;
      try {
        const res = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.apiKey },
          body: JSON.stringify(ev),
          signal: AbortSignal.timeout(30_000),
        });
        // 4xx selain 429 = payload ditolak ERP → buang supaya antrean tidak macet
        if (!res.ok && (res.status >= 500 || res.status === 429)) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) log.error({ status: res.status, event: ev.event, body: (await res.text()).slice(0, 300) }, 'Webhook ditolak ERP, event dibuang');
        antrean.shift();
        tunda = 1000;
      } catch (e: any) {
        log.warn({ err: e?.message, event: ev.event, coba_lagi_ms: tunda }, 'Webhook gagal, dicoba lagi');
        await new Promise((r) => setTimeout(r, tunda));
        tunda = Math.min(tunda * 2, 60_000);
      }
    }
  } finally {
    jalan = false;
  }
}
