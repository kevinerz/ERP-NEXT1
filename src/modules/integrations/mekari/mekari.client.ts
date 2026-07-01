import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

/**
 * MekariClient — HTTP client dengan HMAC signature auth ala Mekari API Gateway.
 *
 * Mekari memakai skema IETF HTTP Signatures:
 *   Authorization: hmac username="{client_id}", algorithm="hmac-sha256",
 *                  headers="date request-line", signature="{base64 hmac}"
 * signing string:
 *   date: {RFC1123}\nrequest-line: {METHOD} {path} HTTP/1.1
 *
 * CATATAN: path & payload spesifik Jurnal harus dikonfirmasi dgn dokumentasi
 * Mekari milik Anda. Struktur di sini mengikuti pola umum Mekari Jurnal API.
 */
@Injectable()
export class MekariClient {
  private readonly logger = new Logger('MekariClient');

  constructor(private config: ConfigService) {}

  get clientId(): string {
    return this.config.get<string>('MEKARI_CLIENT_ID') || '';
  }
  get clientSecret(): string {
    return this.config.get<string>('MEKARI_CLIENT_SECRET') || '';
  }
  get baseUrl(): string {
    return this.config.get<string>('MEKARI_BASE_URL') || 'https://api.mekari.com';
  }

  // Credentials belum diisi (masih placeholder) → mode simulasi
  isConfigured(): boolean {
    const id = this.clientId;
    const secret = this.clientSecret;
    return (
      !!id && !!secret &&
      id !== 'your_client_id' && secret !== 'your_client_secret'
    );
  }

  private buildSignature(method: string, path: string, date: string): string {
    const requestLine = `${method.toUpperCase()} ${path} HTTP/1.1`;
    const signingString = `date: ${date}\nrequest-line: ${requestLine}`;
    const digest = createHmac('sha256', this.clientSecret)
      .update(signingString)
      .digest('base64');
    return `hmac username="${this.clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${digest}"`;
  }

  /**
   * Kirim request ke Mekari. `path` harus diawali '/' (contoh: '/jurnal/v1/sales_invoices').
   * Mengembalikan JSON hasil. Melempar error kalau non-2xx.
   */
  async request<T = any>(method: string, path: string, body?: any): Promise<T> {
    const date = new Date().toUTCString();
    const headers: Record<string, string> = {
      Date: date,
      'Content-Type': 'application/json',
      Authorization: this.buildSignature(method, path, date),
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

    if (!res.ok) {
      this.logger.warn(`Mekari ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
      throw new Error(json?.message || `Mekari API error ${res.status}`);
    }
    return json as T;
  }
}
