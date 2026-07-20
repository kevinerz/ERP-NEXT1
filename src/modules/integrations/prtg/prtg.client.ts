import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';

export interface PrtgSensor {
  objid: number;
  sensor: string;
  device: string;
  status: string;
  status_raw: number;
  message_raw?: string;
}

interface PrtgCreds { base_url: string; username: string; passhash: string; source: 'db' | 'env' | 'none' }

/**
 * PrtgClient — akses PRTG HTTP API (table.json) dgn username+passhash.
 * status_raw: 3=Up, 4=Warning, 5=Down, 13=DownAck, 14=DownPartial
 * Kredensial: DB (integration_prtg_config, diisi lewat UI) diutamakan,
 * fallback ke env var PRTG_* kalau row belum pernah diisi dari UI.
 */
@Injectable()
export class PrtgClient {
  private readonly logger = new Logger('PrtgClient');

  constructor(private config: ConfigService, private prisma: PrismaService, private crypto: SecretCryptoService) {}

  // Passhash lama (sebelum fix ini) tersimpan polos di DB — biar tidak
  // memutus koneksi yang sudah jalan, kalau bukan ciphertext valid anggap
  // itu nilai lama apa adanya. Simpanan BARU (lewat updateConfig) selalu terenkripsi.
  private decryptPasshash(stored: string): string {
    try {
      return this.crypto.decrypt(stored);
    } catch {
      return stored;
    }
  }

  private async creds(): Promise<PrtgCreds> {
    const row = await this.prisma.integrationPrtgConfig.findUnique({ where: { id: 1 } }).catch(() => null);
    if (row && row.base_url && row.username && row.passhash) {
      return { base_url: row.base_url.replace(/\/$/, ''), username: row.username, passhash: this.decryptPasshash(row.passhash), source: 'db' };
    }
    const base_url = (this.config.get<string>('PRTG_BASE_URL') || '').replace(/\/$/, '');
    const username = this.config.get<string>('PRTG_USERNAME') || '';
    const passhash = this.config.get<string>('PRTG_PASSHASH') || '';
    return { base_url, username, passhash, source: base_url && username && passhash ? 'env' : 'none' };
  }

  async isConfigured(): Promise<boolean> {
    const c = await this.creds();
    return c.source !== 'none';
  }

  async statusInfo(): Promise<{ configured: boolean; base_url: string; source: string }> {
    const c = await this.creds();
    return { configured: c.source !== 'none', base_url: c.base_url, source: c.source };
  }

  private async authedUrl(path: string): Promise<string> {
    const c = await this.creds();
    const qs = `username=${encodeURIComponent(c.username)}&passhash=${encodeURIComponent(c.passhash)}`;
    return `${c.base_url}${path}&${qs}`;
  }

  // PRTG "count" adalah batas keras, bukan default — server ini punya ±6.700
  // sensor di ±2.150 device. Set jauh di atas itu (tidak ada penalti kalau lebih).
  private static readonly MAX_COUNT = 20_000;

  // Semua sensor berstatus Down (5) / DownPartial (14)
  async getDownSensors(): Promise<PrtgSensor[]> {
    const url = await this.authedUrl(
      `/api/table.json?content=sensors&columns=objid,sensor,device,status,message&filter_status=5&filter_status=14&count=${PrtgClient.MAX_COUNT}`,
    );
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`PRTG API error ${res.status}`);
    const json: any = await res.json();
    return (json.sensors ?? []) as PrtgSensor[];
  }

  // Semua sensor tanpa filter status — buat halaman audit/daftar device
  async getAllSensors(): Promise<PrtgSensor[]> {
    const url = await this.authedUrl(`/api/table.json?content=sensors&columns=objid,sensor,device,status,message&count=${PrtgClient.MAX_COUNT}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`PRTG API error ${res.status}`);
    const json: any = await res.json();
    return (json.sensors ?? []) as PrtgSensor[];
  }
}
