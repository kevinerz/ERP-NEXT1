import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';

export interface RuijieProject {
  id: string;
  name: string;
}

export interface RuijieDevice {
  id: string;
  name: string;
  mac?: string;
  type?: string;
  online: boolean;
}

interface RuijieCreds { base_url: string; appid: string; secret: string; source: 'db' | 'env' | 'none' }

/**
 * RuijieClient — akses Ruijie Cloud Open API.
 *
 * PENTING: Ruijie tidak punya sandbox/API console publik — appid & secret
 * cuma bisa didapat dengan minta ke service_rj@ruijienetworks.com (bisa makan
 * waktu berminggu-minggu). Endpoint path & nama field response di bawah
 * disusun dari dokumentasi API Reference v1.11 (mirror pihak ketiga, resmi
 * tidak tersedia sebagai halaman statis) + client Python pihak ketiga
 * (pyruijie) — BELUM pernah diuji ke akun Ruijie Cloud asli. Begitu dapat
 * kredensial, jalankan sekali manual dan sesuaikan nama field kalau meleset.
 *
 * Auth: appid+secret -> access_token (query param di setiap request, BUKAN
 * header Bearer — kuirk resmi dari Ruijie, sama seperti pola PRTG di app ini).
 */
@Injectable()
export class RuijieClient {
  private readonly logger = new Logger('RuijieClient');
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private crypto: SecretCryptoService,
  ) {}

  private async creds(): Promise<RuijieCreds> {
    const row = await this.prisma.integrationRuijieConfig.findUnique({ where: { id: 1 } }).catch(() => null);
    if (row?.base_url && row.appid && row.app_secret_enc) {
      try {
        return { base_url: row.base_url.replace(/\/$/, ''), appid: row.appid, secret: this.crypto.decrypt(row.app_secret_enc), source: 'db' };
      } catch {
        this.logger.warn('Kredensial Ruijie di DB rusak (gagal didekripsi) — cek ulang di Pengaturan Ruijie');
      }
    }
    const base_url = (this.config.get<string>('RUIJIE_BASE_URL') || '').replace(/\/$/, '');
    const appid = this.config.get<string>('RUIJIE_APPID') || '';
    const secret = this.config.get<string>('RUIJIE_SECRET') || '';
    return { base_url, appid, secret, source: base_url && appid && secret ? 'env' : 'none' };
  }

  async isConfigured(): Promise<boolean> {
    return (await this.creds()).source !== 'none';
  }

  async statusInfo(): Promise<{ configured: boolean; base_url: string; source: string }> {
    const c = await this.creds();
    return { configured: c.source !== 'none', base_url: c.base_url, source: c.source };
  }

  // Token di-cache di memori proses — cukup untuk 1 instance (sama seperti
  // TokenBlacklistService). Refresh 60 detik sebelum kedaluwarsa supaya aman.
  private async getAccessToken(): Promise<{ token: string; base_url: string }> {
    const c = await this.creds();
    if (c.source === 'none') throw new Error('Ruijie belum dikonfigurasi');

    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return { token: this.tokenCache.token, base_url: c.base_url };
    }

    const url = `${c.base_url}/service/api/oauth20/client/access_token?appid=${encodeURIComponent(c.appid)}&secret=${encodeURIComponent(c.secret)}`;
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Ruijie auth error ${res.status}`);
    const json: any = await res.json();
    const token = json.accessToken || json.access_token;
    const expiresInSec = Number(json.expiresIn ?? json.expires_in ?? 1800);
    if (!token) throw new Error('Ruijie auth: response tanpa access token — cek format respons API');

    this.tokenCache = { token, expiresAt: Date.now() + expiresInSec * 1000 };
    return { token, base_url: c.base_url };
  }

  async getProjects(): Promise<RuijieProject[]> {
    const { token, base_url } = await this.getAccessToken();
    const url = `${base_url}/service/api/group/single/tree?depth=BUILDING&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Ruijie API error ${res.status}`);
    const json: any = await res.json();
    const list = json.data ?? json.value ?? [];
    return list.map((p: any) => ({ id: String(p.id ?? p.projectId), name: p.name ?? p.projectName ?? '' }));
  }

  async getDevices(projectId: string): Promise<RuijieDevice[]> {
    const { token, base_url } = await this.getAccessToken();
    const url = `${base_url}/service/api/device/list?projectId=${encodeURIComponent(projectId)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Ruijie API error ${res.status}`);
    const json: any = await res.json();
    const list = json.data ?? json.value ?? [];
    return list.map((d: any) => ({
      id: String(d.id ?? d.deviceId),
      name: d.name ?? d.deviceName ?? '',
      mac: d.mac ?? d.macAddress,
      type: d.type ?? d.deviceType,
      online: !!(d.online ?? d.isOnline ?? d.status === 'online'),
    }));
  }
}
