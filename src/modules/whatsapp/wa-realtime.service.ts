import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Response } from 'express';

/**
 * Aliran real-time ke browser (Server-Sent Events).
 * EventSource tidak bisa mengirim header Authorization → klien minta tiket sekali pakai
 * (POST /wa/stream-tiket, butuh login), lalu membuka GET /wa/stream?tiket=...
 */
@Injectable()
export class WaRealtimeService {
  private klien = new Set<Response>();
  private tiket = new Map<string, { id_karyawan: number; exp: number }>();

  buatTiket(id_karyawan: number): string {
    const t = randomBytes(24).toString('hex');
    this.tiket.set(t, { id_karyawan, exp: Date.now() + 60_000 });
    for (const [k, v] of this.tiket) if (v.exp < Date.now()) this.tiket.delete(k);
    return t;
  }

  pakaiTiket(t: string): number | null {
    const v = this.tiket.get(t);
    this.tiket.delete(t);
    return v && v.exp >= Date.now() ? v.id_karyawan : null;
  }

  sambung(res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx: jangan buffer SSE
    res.flushHeaders();
    res.write('retry: 5000\n\n');
    this.klien.add(res);
    // Ping berkala supaya proxy (proxy_read_timeout) tidak memutus koneksi
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    res.on('close', () => { clearInterval(ping); this.klien.delete(res); });
  }

  siarkan(data: Record<string, unknown>) {
    if (!this.klien.size) return;
    const pesan = `data: ${JSON.stringify(data)}\n\n`;
    for (const r of this.klien) r.write(pesan);
  }
}
