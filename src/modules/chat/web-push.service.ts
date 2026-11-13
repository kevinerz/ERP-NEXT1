import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

/** Web Push (VAPID) untuk browser — tetap sampai walau tab ERP tertutup. Nonaktif bila kunci VAPID belum diisi di .env. */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger('WebPush');
  private readonly aktif: boolean;
  readonly kunciPublik: string;

  constructor(private prisma: PrismaService) {
    const pub = process.env.VAPID_PUBLIC_KEY || '';
    const priv = process.env.VAPID_PRIVATE_KEY || '';
    this.kunciPublik = pub;
    this.aktif = !!(pub && priv);
    if (this.aktif) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://1erp.nextone.id', pub, priv);
    else this.logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY belum diisi — Web Push dinonaktifkan');
  }

  get siap() { return this.aktif; }

  async simpan(id_karyawan: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
    const endpoint_hash = createHash('sha256').update(sub.endpoint).digest('hex');
    const data = { id_karyawan, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: (userAgent ?? '').slice(0, 250) || null };
    await this.prisma.pushLangganan.upsert({ where: { endpoint_hash }, create: { endpoint_hash, ...data }, update: data });
    return true;
  }

  async batal(id_karyawan: number, endpoint: string) {
    const endpoint_hash = createHash('sha256').update(endpoint).digest('hex');
    await this.prisma.pushLangganan.deleteMany({ where: { endpoint_hash, id_karyawan } });
    return true;
  }

  async punya(id_karyawan: number, endpoint?: string) {
    if (!endpoint) return (await this.prisma.pushLangganan.count({ where: { id_karyawan } })) > 0;
    const endpoint_hash = createHash('sha256').update(endpoint).digest('hex');
    return (await this.prisma.pushLangganan.count({ where: { endpoint_hash, id_karyawan } })) > 0;
  }

  /** Kirim ke semua perangkat browser milik para karyawan; langganan yang sudah mati (404/410) dibersihkan. */
  async kirim(ids: number[], muatan: { judul: string; isi: string; url: string; tag?: string }) {
    if (!this.aktif || !ids.length) return;
    const subs = await this.prisma.pushLangganan.findMany({ where: { id_karyawan: { in: ids } } });
    const payload = JSON.stringify(muatan);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'normal' });
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await this.prisma.pushLangganan.delete({ where: { id_langganan: s.id_langganan } }).catch(() => null);
        else this.logger.warn(`web push gagal (${e?.statusCode ?? e?.message})`);
      }
    }));
  }
}
