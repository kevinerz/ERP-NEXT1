import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Klien HTTP ke NOCaaS. Sejak NOCaaS wajib login (sesi cookie), ERP masuk memakai akun layanan
 * NOCAAS_USERNAME / NOCAAS_PASSWORD, menyimpan cookie sesi, dan login ulang otomatis saat dapat 401.
 */
@Injectable()
export class NocaasClient {
  private readonly logger = new Logger('NOCaaS');
  private cookie: string | null = null;
  private sedangLogin: Promise<void> | null = null;
  private gagalLoginSampai = 0; // jeda setelah login ditolak, supaya tidak membanjiri NOCaaS tiap menit

  constructor(private config: ConfigService) {}

  get base() {
    return (this.config.get<string>('NOCAAS_API_URL') || 'http://180.214.165.166:3000').replace(/\/$/, '');
  }

  private get kredensial() {
    const username = this.config.get<string>('NOCAAS_USERNAME') || '';
    const password = this.config.get<string>('NOCAAS_PASSWORD') || '';
    return username && password ? { username, password } : null;
  }

  private async login() {
    const k = this.kredensial;
    if (!k) throw new Error('NOCaaS wajib login — isi NOCAAS_USERNAME & NOCAAS_PASSWORD di .env');
    if (Date.now() < this.gagalLoginSampai) throw new Error('Login NOCaaS ditolak — dicoba lagi nanti');
    const res = await fetch(`${this.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(k),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 422) this.gagalLoginSampai = Date.now() + 10 * 60_000;
      throw new Error(`Login NOCaaS gagal (HTTP ${res.status})`);
    }
    const kue = res.headers.getSetCookie().map((c) => c.split(';')[0]).filter(Boolean);
    if (!kue.length) throw new Error('Login NOCaaS berhasil tapi tidak ada cookie sesi');
    this.cookie = kue.join('; ');
    this.gagalLoginSampai = 0;
    this.logger.log(`Login NOCaaS sebagai ${k.username} berhasil`);
  }

  private pastikanLogin() {
    this.sedangLogin ??= this.login().finally(() => { this.sedangLogin = null; });
    return this.sedangLogin;
  }

  private kirim(path: string, timeout: number) {
    return fetch(`${this.base}${path}`, {
      headers: this.cookie ? { Cookie: this.cookie } : {},
      signal: AbortSignal.timeout(timeout),
    });
  }

  /** GET JSON; lempar error bila gagal */
  async ambil<T = any>(path: string, timeout = 30_000): Promise<T> {
    if (!this.cookie && this.kredensial) await this.pastikanLogin();
    let res = await this.kirim(path, timeout);
    if (res.status === 401 && this.kredensial) {
      this.cookie = null;
      await this.pastikanLogin();
      res = await this.kirim(path, timeout);
    }
    if (res.status === 401 && !this.kredensial) throw new Error('NOCaaS 401 — isi NOCAAS_USERNAME & NOCAAS_PASSWORD di .env');
    if (!res.ok) throw new Error(`NOCaaS ${res.status} ${path}`);
    return res.json() as Promise<T>;
  }
}
