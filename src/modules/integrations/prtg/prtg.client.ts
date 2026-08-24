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

export interface PrtgChannel {
  name: string;
  lastvalue: string;
  lastvalue_raw: number;
}

export interface PrtgHistoryPoint {
  datetime: string;
  [channel: string]: string | number;
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

  // Sensor untuk 1 device spesifik (filter by device name exact)
  async getSensorsByDevice(deviceName: string): Promise<PrtgSensor[]> {
    const url = await this.authedUrl(
      `/api/table.json?content=sensors&columns=objid,sensor,device,status,message&filter_device=${encodeURIComponent(deviceName)}&count=200`,
    );
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`PRTG API error ${res.status}`);
    const json: any = await res.json();
    return (json.sensors ?? []) as PrtgSensor[];
  }

  // Channel values saat ini untuk 1 sensor (ping time, packet loss, traffic in/out, dll)
  async getSensorChannels(objid: number): Promise<PrtgChannel[]> {
    const url = await this.authedUrl(`/api/table.json?content=channels&columns=name,lastvalue,lastvalue_raw&id=${objid}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`PRTG API error ${res.status}`);
    const json: any = await res.json();
    return (json.channels ?? []) as PrtgChannel[];
  }

  // Data historis sensor untuk charting (avgSecs: 0=raw, 300=5min, 3600=1jam)
  async getSensorHistory(objid: number, hours = 24, avgSecs = 300): Promise<PrtgHistoryPoint[]> {
    const now   = new Date();
    const start = new Date(now.getTime() - hours * 3_600_000);
    const fmt   = (d: Date) => d.toISOString().replace('T', '-').substring(0, 19).replace(/:/g, '-');
    const url   = await this.authedUrl(
      `/api/historicdata.json?id=${objid}&avg=${avgSecs}&sdate=${fmt(start)}&edate=${fmt(now)}&usecaption=1&count=5000`,
    );
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`PRTG API error ${res.status}`);
    const json: any = await res.json();
    return (json.histdata ?? []) as PrtgHistoryPoint[];
  }

  // Proxy graph image PRTG (menghindari CORS & auth di frontend)
  async getGraphImageBuffer(objid: number, graphid = 0, width = 900, height = 300, hours = 24): Promise<{ buffer: Buffer; contentType: string }> {
    const now   = new Date();
    const start = new Date(now.getTime() - hours * 3_600_000);
    const fmt   = (d: Date) => d.toISOString().replace('T', '-').substring(0, 19).replace(/:/g, '-');
    const url   = await this.authedUrl(
      `/chart.png?type=graph&graphid=${graphid}&id=${objid}&sdate=${fmt(start)}&edate=${fmt(now)}&width=${width}&height=${height}&chartlabels=1`,
    );
    this.logger.log(`PRTG chart req: objid=${objid} hours=${hours} graphid=${graphid}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      this.logger.error(`PRTG chart error: status=${res.status} objid=${objid} hours=${hours}`);
      throw new Error(`PRTG API error ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    this.logger.log(`PRTG chart ok: objid=${objid} hours=${hours} size=${buf.length}`);
    return { buffer: buf, contentType: res.headers.get('content-type') || 'image/png' };
  }
}
