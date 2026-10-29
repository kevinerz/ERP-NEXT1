// Pengirim event ke ERP: antrean berurutan (urutan pesan terjaga) + coba ulang bila ERP sedang mati
import { config } from './config.js';
import { log } from './logger.js';

export type EventWebhook = { akun: string; event: string; data: unknown };

const antrean: EventWebhook[] = [];
let jalan = false;

export function kirimWebhook(ev: EventWebhook) {
  antrean.push(ev);
  if (antrean.length > 5000) log.warn({ panjang: antrean.length }, 'Antrean webhook menumpuk — ERP lambat/mati?');
  void proses();
}

async function proses() {
  if (jalan) return;
  jalan = true;
  let tunda = 1000;
  try {
    while (antrean.length) {
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
