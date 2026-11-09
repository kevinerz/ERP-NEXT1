import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Klien HTTP ke NOCaaS (wajib autentikasi). Utama: API key NOCAAS_API_KEY (header X-API-Key).
 * Cadangan bila key kosong: akun layanan NOCAAS_USERNAME / NOCAAS_PASSWORD dengan sesi cookie,
 * login ulang otomatis saat dapat 401.
 */
@Injectable()
export class NocaasClient {
  private readonly logger = new Logger('NOCaaS');
  private cookie: string | null = null;
  private sedangLogin: Promise<void> | null = null;
  private gagalLoginSampai = 0; // jeda setelah login ditolak, supaya tidak membanjiri NOCaaS tiap menit

  constructor(private config: ConfigService) {}

  get base() {
    return (this.config.get<string>('NOCAAS_API_URL') || 'https://noc.nextone.id').replace(/\/$/, '');
  }

  private get apiKey() {
    return this.config.get<string>('NOCAAS_API_KEY') || '';
  }

  private get kredensial() {
    if (this.apiKey) return null;
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

  private kirim(path: string, timeout: number, body?: unknown) {
    const auth: Record<string, string> = this.apiKey ? { 'X-API-Key': this.apiKey } : this.cookie ? { Cookie: this.cookie } : {};
    return fetch(`${this.base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? auth : { ...auth, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  }

  /** GET JSON; lempar error bila gagal */
  async ambil<T = any>(path: string, timeout = 30_000): Promise<T> {
    return this.minta<T>(path, timeout);
  }

  /** POST JSON; pesan error NOCaaS (field detail) diteruskan */
  async kirimJson<T = any>(path: string, body: unknown, timeout = 60_000): Promise<T> {
    return this.minta<T>(path, timeout, body ?? {});
  }

  private async minta<T>(path: string, timeout: number, body?: unknown): Promise<T> {
    if (!this.cookie && this.kredensial) await this.pastikanLogin();
    let res = await this.kirim(path, timeout, body);
    if (res.status === 401 && this.kredensial) {
      this.cookie = null;
      await this.pastikanLogin();
      res = await this.kirim(path, timeout, body);
    }
    if (res.status === 401 && this.apiKey) throw new Error('NOCaaS 401 — NOCAAS_API_KEY ditolak');
    if (res.status === 401 && !this.kredensial) throw new Error('NOCaaS 401 — isi NOCAAS_API_KEY di .env');
    if (!res.ok) {
      const detail = await res.json().then((j: any) => (typeof j?.detail === 'string' ? j.detail : j?.detail ? JSON.stringify(j.detail) : '')).catch(() => '');
      throw new Error(`NOCaaS ${res.status} ${path}${detail ? ` — ${detail}` : ''}`);
    }
    return res.json() as Promise<T>;
  }
}
