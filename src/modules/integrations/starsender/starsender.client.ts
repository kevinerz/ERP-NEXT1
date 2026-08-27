import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * StarSender — WA gateway (https://starsender.online)
 * API: POST /api/send  —  Authorization: Bearer {apiKey}
 * Body: { phone, message, messageType: "text" }
 */
@Injectable()
export class StarsenderClient {
  private readonly logger = new Logger('StarSender');

  constructor(private prisma: PrismaService) {}

  private async getApiKey(): Promise<string | null> {
    const cfg = await this.prisma.integrationStarsenderConfig.findUnique({ where: { id: 1 } });
    if (!cfg?.is_active || !cfg.api_key) return null;
    return cfg.api_key;
  }

  /** Kirim pesan WA. Nomor format: 08xxx atau 628xxx — otomatis dinormalisasi ke 628xxx */
  async send(phone: string, message: string): Promise<boolean> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return false;

    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      this.logger.warn(`Nomor WA tidak valid: ${phone}`);
      return false;
    }

    try {
      const res = await fetch('https://api.starsender.online/api/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: normalized, message, messageType: 'text' }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`StarSender error ${res.status}: ${text}`);
        return false;
      }
      this.logger.log(`WA terkirim ke ${normalized}`);
      return true;
    } catch (e: any) {
      this.logger.error(`StarSender gagal: ${e.message}`);
      return false;
    }
  }

  /** Kirim ke banyak nomor — error satu tidak menghentikan yang lain */
  async sendMany(phones: string[], message: string): Promise<void> {
    await Promise.allSettled(phones.map((p) => this.send(p, message)));
  }

  private normalizePhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('628')) return digits;
    if (digits.startsWith('08')) return '62' + digits.slice(1);
    if (digits.startsWith('8')) return '62' + digits;
    return null;
  }
}
