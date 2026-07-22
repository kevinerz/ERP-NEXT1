import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SmtpClientService, SmtpCreds } from '../../modules/email/smtp.client';
import { SettingsService } from '../../modules/settings/settings.service';
import { MailBrandingService } from './mail-branding.service';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  cid?: string;
  contentType?: string;
}

export interface SendMailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  /** Isi HTML — cukup konten inti, header/footer brand ditambahkan otomatis */
  html: string;
  attachments?: MailAttachment[];
  /** Default true. Set false untuk kirim html apa adanya tanpa bungkus brand. */
  branded?: boolean;
  /** Label sumber untuk EmailLog (mis. 'onboarding', 'invoice'). Default 'manual'. */
  modul?: string;
}

export interface BroadcastResult {
  batch_id: string;
  total: number;
  sent: number;
  failed: { to: string; error: string }[];
}

/**
 * MailerService — layanan email SISTEM terpusat yang mengirim dari satu akun
 * noreply tetap (mis. noreply@nextone.id). Dipakai lintas modul untuk email
 * otomatis: kredensial onboarding, notifikasi, broadcast, dsb. Setiap email
 * keluar dicatat ke tabel email_logs (dashboard pantau kirim).
 *
 * Kredensial dibaca dari environment variable (bukan DB) karena ini akun infra
 * tetap — lebih sederhana, tidak kena masalah decrypt saat JWT_SECRET berubah,
 * dan .env sudah gitignored:
 *   MAIL_HOST       host SMTP        (mis. smtp.hostinger.com)
 *   MAIL_PORT       port SMTP        (default 465 = SSL)
 *   MAIL_USER       alamat pengirim  (mis. noreply@nextone.id)
 *   MAIL_PASSWORD   password mailbox
 *   MAIL_FROM_NAME  nama tampilan opsional (mis. "Next1 ERP")
 *
 * Modul ini @Global — cukup inject MailerService, tanpa import module.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly password: string;
  private readonly fromName: string;
  private readonly secure?: boolean;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private smtp: SmtpClientService,
    private settings: SettingsService,
    private branding: MailBrandingService,
  ) {
    this.host = config.get<string>('MAIL_HOST') || '';
    this.port = Number(config.get<string>('MAIL_PORT')) || 465;
    this.user = config.get<string>('MAIL_USER') || '';
    this.password = config.get<string>('MAIL_PASSWORD') || '';

    // Nama tampilan: dukung MAIL_FROM_NAME (nama saja) ATAU MAIL_FROM
    // ("Nama <alamat>" — ambil bagian namanya).
    const fromName = config.get<string>('MAIL_FROM_NAME');
    const fromFull = config.get<string>('MAIL_FROM');
    this.fromName = (fromName || this.parseFromName(fromFull) || '').trim();

    // MAIL_SECURE opsional ('true'/'false'); default ikut port (465 = SSL).
    const secureRaw = config.get<string>('MAIL_SECURE');
    this.secure = secureRaw === undefined || secureRaw === ''
      ? undefined
      : secureRaw.toLowerCase() === 'true';
  }

  /** "ERP NEXT1 <noreply@x.id>" → "ERP NEXT1"; kalau tanpa <>, pakai apa adanya. */
  private parseFromName(from?: string): string {
    if (!from) return '';
    const m = /^(.*?)\s*<[^>]+>\s*$/.exec(from.trim());
    return (m ? m[1] : from).trim();
  }

  /** true kalau kredensial noreply sudah lengkap di .env */
  isConfigured(): boolean {
    return !!(this.host && this.user && this.password);
  }

  private creds(): SmtpCreds {
    return {
      email_address: this.user,
      smtp_host: this.host,
      smtp_port: this.port,
      password: this.password,
      from_name: this.fromName || undefined,
      secure: this.secure,
    };
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error(
        'MailerService belum dikonfigurasi — set MAIL_HOST, MAIL_USER, dan MAIL_PASSWORD di .env',
      );
    }
  }

  private join(v?: string | string[]): string | undefined {
    if (!v) return undefined;
    const arr = Array.isArray(v) ? v : [v];
    const cleaned = arr.map((s) => s.trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(', ') : undefined;
  }

  /** Tulis satu baris EmailLog — tahan-gagal, tidak boleh menjatuhkan pengiriman. */
  private async writeLog(row: {
    to_address: string;
    subject: string;
    modul?: string;
    status: 'sent' | 'failed';
    error?: string;
    batch_id?: string;
  }) {
    try {
      await this.prisma.emailLog.create({
        data: {
          to_address: row.to_address.slice(0, 255),
          subject: (row.subject || '(tanpa subjek)').slice(0, 255),
          modul: row.modul || 'manual',
          status: row.status,
          error: row.error || null,
          batch_id: row.batch_id || null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Gagal tulis EmailLog: ${e?.message}`);
    }
  }

  /** Bangun body (branded / apa adanya) + logo attachment sekali, untuk dipakai
   * ulang saat broadcast agar tidak query settings berulang. */
  private async buildBody(html: string, branded: boolean) {
    if (branded === false) return { html, attachments: [] as MailAttachment[] };
    const settings = await this.settings.getAll();
    const { html: brandedHtml, logoAttachment } = this.branding.build(html, settings);
    return { html: brandedHtml, attachments: logoAttachment ? [logoAttachment] : [] };
  }

  /** Kirim satu email (boleh banyak penerima di to/cc/bcc, saling terlihat). */
  async send(opts: SendMailOptions): Promise<void> {
    this.assertConfigured();
    const toLabel = this.join(opts.to) || '';
    const body = await this.buildBody(opts.html, opts.branded !== false);
    try {
      await this.smtp.sendMail(this.creds(), {
        to: toLabel,
        cc: this.join(opts.cc),
        bcc: this.join(opts.bcc),
        subject: opts.subject,
        html: body.html,
        attachments: [...(opts.attachments || []), ...body.attachments],
      });
      await this.writeLog({ to_address: toLabel, subject: opts.subject, modul: opts.modul, status: 'sent' });
    } catch (e: any) {
      await this.writeLog({ to_address: toLabel, subject: opts.subject, modul: opts.modul, status: 'failed', error: e?.message });
      throw e;
    }
  }

  /**
   * Broadcast ke banyak penerima — tiap orang menerima email TERPISAH (privasi:
   * tidak saling melihat alamat). Dikirim sekuensial dan tahan-gagal: satu
   * alamat error tidak menghentikan sisanya. Body & logo dibangun sekali saja.
   * Semua baris log dikelompokkan dengan batch_id yang sama.
   */
  async broadcast(
    recipients: string[],
    opts: Omit<SendMailOptions, 'to' | 'cc' | 'bcc'>,
  ): Promise<BroadcastResult> {
    this.assertConfigured();
    const batch_id = randomUUID();
    const targets = [...new Set(recipients.map((r) => r.trim()).filter(Boolean))];
    const body = await this.buildBody(opts.html, opts.branded !== false);
    const attachments = [...(opts.attachments || []), ...body.attachments];

    const failed: { to: string; error: string }[] = [];
    let sent = 0;
    for (const to of targets) {
      try {
        await this.smtp.sendMail(this.creds(), {
          to,
          subject: opts.subject,
          html: body.html,
          attachments,
        });
        sent += 1;
        await this.writeLog({ to_address: to, subject: opts.subject, modul: opts.modul || 'broadcast', status: 'sent', batch_id });
      } catch (e: any) {
        failed.push({ to, error: e?.message || 'unknown error' });
        await this.writeLog({ to_address: to, subject: opts.subject, modul: opts.modul || 'broadcast', status: 'failed', error: e?.message, batch_id });
        this.logger.warn(`Broadcast gagal ke ${to}: ${e?.message}`);
      }
    }
    this.logger.log(`Broadcast ${batch_id}: ${sent}/${targets.length} terkirim, ${failed.length} gagal`);
    return { batch_id, total: targets.length, sent, failed };
  }

  /** Kirim email percobaan (dari dashboard Email Log) — untuk cek konfigurasi
   * SMTP & tampilan branding. Body di-escape karena berasal dari input admin. */
  async sendTest(dto: { to: string; subject?: string; message?: string }) {
    if (!this.isConfigured()) {
      throw new BadRequestException('Mailer belum dikonfigurasi — set MAIL_HOST, MAIL_USER, dan MAIL_PASSWORD di .env server');
    }
    const subject = dto.subject?.trim() || 'Test Email — ERP Next1';
    const pesan = dto.message?.trim()
      || 'Ini email percobaan dari sistem ERP Next1. Jika email ini sampai dengan header dan footer yang benar, konfigurasi pengiriman sudah beres.';
    const body = this.escapeHtml(pesan).replace(/\n/g, '<br/>');
    await this.send({
      to: dto.to,
      subject,
      modul: 'test',
      html: `<p>${body}</p>`,
    });
    return { data: { to: dto.to }, message: `Email test terkirim ke ${dto.to}` };
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ─── Query untuk dashboard ────────────────────────────────────

  async listLogs(query: {
    status?: string;
    modul?: string;
    batch_id?: string;
    search?: string;
    tgl_dari?: string;
    tgl_sampai?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.modul) where.modul = query.modul;
    if (query.batch_id) where.batch_id = query.batch_id;
    if (query.search) {
      where.OR = [
        { to_address: { contains: query.search } },
        { subject: { contains: query.search } },
      ];
    }
    if (query.tgl_dari || query.tgl_sampai) {
      where.created_at = {};
      if (query.tgl_dari) where.created_at.gte = new Date(query.tgl_dari);
      if (query.tgl_sampai) {
        const end = new Date(query.tgl_sampai);
        end.setHours(23, 59, 59, 999);
        where.created_at.lte = end;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.emailLog.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: limit }),
      this.prisma.emailLog.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async stats() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, sent, failed, last24h] = await Promise.all([
      this.prisma.emailLog.count(),
      this.prisma.emailLog.count({ where: { status: 'sent' } }),
      this.prisma.emailLog.count({ where: { status: 'failed' } }),
      this.prisma.emailLog.count({ where: { created_at: { gte: since24h } } }),
    ]);
    return { data: { total, sent, failed, last24h, configured: this.isConfigured() } };
  }
}
