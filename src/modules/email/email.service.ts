import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { ImapClientService, FolderKind } from './imap.client';
import { SmtpClientService } from './smtp.client';
import { SettingsService } from '../settings/settings.service';
import { ConnectEmailDto, SendEmailDto, SaveDraftDto } from './dto/email.dto';

const FOLDER_KEYS: FolderKind[] = ['inbox', 'sent', 'drafts', 'trash', 'junk'];
const FOLDER_LABELS: Record<FolderKind, string> = {
  inbox: 'Kotak Masuk',
  sent: 'Terkirim',
  drafts: 'Draf',
  trash: 'Sampah',
  junk: 'Spam',
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');

  constructor(
    private prisma: PrismaService,
    private crypto: SecretCryptoService,
    private imap: ImapClientService,
    private smtp: SmtpClientService,
    private settings: SettingsService,
  ) {}

  async getAccount(userId: number) {
    const row = await this.prisma.emailAccount.findUnique({ where: { id_user: userId } });
    if (!row) return { data: null };
    const { password_enc, ...safe } = row;
    return { data: safe };
  }

  async connectAccount(userId: number, dto: ConnectEmailDto) {
    // Validasi kredensial dulu — supaya salah host/password ketahuan sebelum tersimpan
    await this.imap.testConnection({
      email_address: dto.email_address, imap_host: dto.imap_host, imap_port: dto.imap_port, password: dto.password,
    });
    await this.smtp.testConnection({
      email_address: dto.email_address, smtp_host: dto.smtp_host, smtp_port: dto.smtp_port, password: dto.password,
    });

    const password_enc = this.crypto.encrypt(dto.password);
    const row = await this.prisma.emailAccount.upsert({
      where: { id_user: userId },
      create: {
        id_user: userId,
        email_address: dto.email_address,
        imap_host: dto.imap_host,
        imap_port: dto.imap_port,
        smtp_host: dto.smtp_host,
        smtp_port: dto.smtp_port,
        password_enc,
      },
      update: {
        email_address: dto.email_address,
        imap_host: dto.imap_host,
        imap_port: dto.imap_port,
        smtp_host: dto.smtp_host,
        smtp_port: dto.smtp_port,
        password_enc,
        is_aktif: true,
        last_error: null,
        connected_at: new Date(),
      },
    });
    const { password_enc: _p, ...safe } = row;
    return { data: safe, message: `Terhubung ke ${dto.email_address}` };
  }

  async disconnectAccount(userId: number) {
    const row = await this.prisma.emailAccount.findUnique({ where: { id_user: userId } });
    if (!row) throw new NotFoundException('Belum ada akun email yang terhubung');
    this.imap.disconnect({ email_address: row.email_address, imap_host: row.imap_host, imap_port: row.imap_port, password: '' });
    await this.prisma.emailAccount.delete({ where: { id_user: userId } });
    return { message: 'Akun email diputus' };
  }

  private async resolveCreds(userId: number) {
    const row = await this.prisma.emailAccount.findUnique({ where: { id_user: userId } });
    if (!row || !row.is_aktif) throw new BadRequestException('Belum terhubung ke akun email — buka menu Email untuk connect');
    try {
      const password = this.crypto.decrypt(row.password_enc);
      return { account: row, password };
    } catch {
      // Kunci enkripsi tidak cocok lagi (mis. JWT_SECRET pernah berubah) —
      // password tersimpan jadi tidak terbaca. Bukan hal yang bisa diperbaiki
      // otomatis, minta user connect ulang daripada crash 500 mentah.
      throw new BadRequestException('Koneksi email bermasalah (kredensial tidak terbaca) — putuskan lalu connect ulang di menu Email');
    }
  }

  private imapCreds(account: { email_address: string; imap_host: string; imap_port: number }, password: string) {
    return { email_address: account.email_address, imap_host: account.imap_host, imap_port: account.imap_port, password };
  }
  private smtpCreds(account: { email_address: string; smtp_host: string; smtp_port: number }, password: string) {
    return { email_address: account.email_address, smtp_host: account.smtp_host, smtp_port: account.smtp_port, password };
  }

  private normalizeFolder(folder?: string): FolderKind {
    const key = (folder || 'inbox') as FolderKind;
    if (!FOLDER_KEYS.includes(key)) throw new BadRequestException(`Folder tidak dikenal: ${folder}`);
    return key;
  }

  async listFolders(userId: number) {
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const data = await Promise.all(
      FOLDER_KEYS.map(async (key) => ({ key, label: FOLDER_LABELS[key], path: await this.imap.resolveFolder(creds, key) })),
    );
    return { data };
  }

  async listMessages(userId: number, folder: string | undefined, query: { page?: number; limit?: number; search?: string }) {
    const key = this.normalizeFolder(folder);
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 25, 100);
    try {
      const path = await this.imap.resolveFolder(creds, key);
      return await this.imap.listMessages(creds, path, { page, limit, search: query.search });
    } catch (e: any) {
      await this.prisma.emailAccount.update({ where: { id_user: userId }, data: { last_error: e.message } }).catch(() => {});
      throw e;
    }
  }

  async getMessage(userId: number, folder: string | undefined, uid: number) {
    const key = this.normalizeFolder(folder);
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const path = await this.imap.resolveFolder(creds, key);
    // Buka draf tidak perlu menandai terbaca — bukan surat masuk yang "dibaca"
    const data = await this.imap.getMessage(creds, path, uid, key !== 'drafts');
    return { data };
  }

  async getAttachment(userId: number, folder: string | undefined, uid: number, partId: number) {
    const key = this.normalizeFolder(folder);
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const path = await this.imap.resolveFolder(creds, key);
    return this.imap.getAttachment(creds, path, uid, partId);
  }

  async setSeen(userId: number, folder: string | undefined, uid: number, seen: boolean) {
    const key = this.normalizeFolder(folder);
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const path = await this.imap.resolveFolder(creds, key);
    await this.imap.setSeen(creds, path, uid, seen);
    return { message: seen ? 'Ditandai dibaca' : 'Ditandai belum dibaca' };
  }

  async deleteMessage(userId: number, folder: string | undefined, uid: number) {
    const key = this.normalizeFolder(folder);
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const path = await this.imap.resolveFolder(creds, key);
    if (key === 'trash') {
      await this.imap.expungeMessage(creds, path, uid);
      return { message: 'Email dihapus permanen' };
    }
    const trashPath = await this.imap.resolveFolder(creds, 'trash');
    await this.imap.moveMessage(creds, path, uid, trashPath);
    return { message: 'Email dipindah ke Sampah' };
  }

  private parseLogoDataUrl(dataUrl?: string): { buffer: Buffer; contentType: string } | null {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return null;
    return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
  }

  /** Settings (company_name dkk) diisi lewat form admin biasa, bukan input
   * tepercaya — kalau mengandung "<"/'"' harus lolos sebagai teks apa adanya,
   * bukan ikut jadi HTML/atribut, di setiap email yang keluar. */
  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Bungkus isi email dengan header (logo+nama perusahaan) dan footer (alamat,
   * kontak, disclaimer) otomatis — dipakai hanya saat KIRIM, bukan saat simpan
   * Draf, supaya draf yang diedit berulang kali tidak menumpuk header/footer. */
  private buildBrandedEmail(bodyHtml: string, settingsRaw: Record<string, string>) {
    const settings = Object.fromEntries(
      Object.entries(settingsRaw).map(([k, v]) => [k, this.escapeHtml(String(v ?? ''))]),
    );
    const name = settings.company_name || 'Next1';
    const tagline = settings.company_tagline || '';
    const address = [settings.company_address, settings.company_city].filter(Boolean).join(', ');
    const contactParts = [
      settings.company_phone && `📞 ${settings.company_phone}`,
      settings.company_email && `✉️ ${settings.company_email}`,
      settings.company_website && `🌐 ${settings.company_website}`,
    ].filter(Boolean);
    const logo = this.parseLogoDataUrl(settingsRaw.company_logo_url);

    const headerRow = logo
      ? `<td style="padding:14px 16px;vertical-align:middle;width:60px;"><img src="cid:company-logo" alt="${name}" width="44" style="display:block;max-height:44px;height:auto;"/></td>
         <td style="padding:14px 20px 14px 0;vertical-align:middle;"><div style="font-size:16px;font-weight:700;color:#0f172a;">${name}</div>${tagline ? `<div style="font-size:12px;color:#64748b;">${tagline}</div>` : ''}</td>`
      : `<td style="padding:14px 20px;vertical-align:middle;"><div style="font-size:16px;font-weight:700;color:#0f172a;">${name}</div>${tagline ? `<div style="font-size:12px;color:#64748b;">${tagline}</div>` : ''}</td>`;

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid #1e40af;"><tr>${headerRow}</tr></table>
  <div style="padding:24px 20px;color:#0f172a;font-size:14px;line-height:1.6;">${bodyHtml || ''}</div>
  <div style="padding:16px 20px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;">
    <div style="font-weight:600;color:#334155;margin-bottom:2px;">${name}</div>
    ${address ? `<div>${address}</div>` : ''}
    ${contactParts.length ? `<div>${contactParts.join(' &nbsp;&middot;&nbsp; ')}</div>` : ''}
    <div style="margin-top:10px;color:#94a3b8;font-size:11px;">Email ini beserta lampirannya bersifat rahasia dan hanya diperuntukkan bagi penerima yang dituju. Jika Anda menerima email ini secara tidak sengaja, mohon segera hapus dan beri tahu pengirim.</div>
  </div>
</div>`.trim();

    const logoAttachment = logo
      ? { filename: 'logo', content: logo.buffer, cid: 'company-logo', contentType: logo.contentType }
      : undefined;
    return { html, logoAttachment };
  }

  async sendMail(userId: number, dto: SendEmailDto, files?: { originalname: string; buffer: Buffer }[]) {
    const { account, password } = await this.resolveCreds(userId);
    const smtpCreds = this.smtpCreds(account, password);
    const settings = await this.settings.getAll();
    const { html: brandedHtml, logoAttachment } = this.buildBrandedEmail(dto.html, settings);
    const input = {
      to: dto.to, cc: dto.cc, bcc: dto.bcc, subject: dto.subject, html: brandedHtml, in_reply_to: dto.in_reply_to,
      attachments: [
        ...(files?.map((f) => ({ filename: f.originalname, content: f.buffer })) || []),
        ...(logoAttachment ? [logoAttachment] : []),
      ],
    };
    await this.smtp.sendMail(smtpCreds, input);

    // Simpan salinan ke folder Terkirim — SMTP submission polos tidak otomatis
    // menyalin ke Sent di kebanyakan provider (termasuk Hostinger), jadi harus
    // di-APPEND manual lewat IMAP. Email SUDAH terkirim di titik ini, jadi
    // kegagalan langkah ini tidak boleh membuat request gagal — cukup dicatat.
    try {
      const imapCreds = this.imapCreds(account, password);
      const raw = await this.smtp.buildRaw(smtpCreds, input);
      const sentPath = await this.imap.resolveFolder(imapCreds, 'sent');
      await this.imap.appendMessage(imapCreds, sentPath, raw, ['\\Seen']);
      if (dto.draft_uid) {
        const draftsPath = await this.imap.resolveFolder(imapCreds, 'drafts');
        await this.imap.expungeMessage(imapCreds, draftsPath, Number(dto.draft_uid)).catch(() => {});
      }
    } catch (e: any) {
      this.logger.warn(`Gagal simpan salinan Terkirim/hapus draf untuk user ${userId}: ${e.message}`);
    }
    return { message: 'Email terkirim' };
  }

  async saveDraft(userId: number, dto: SaveDraftDto, files?: { originalname: string; buffer: Buffer }[]) {
    const { account, password } = await this.resolveCreds(userId);
    const imapCreds = this.imapCreds(account, password);
    const raw = await this.smtp.buildRaw(this.smtpCreds(account, password), {
      to: dto.to, cc: dto.cc, bcc: dto.bcc, subject: dto.subject, html: dto.html,
      attachments: files?.map((f) => ({ filename: f.originalname, content: f.buffer })),
    });
    const draftsPath = await this.imap.resolveFolder(imapCreds, 'drafts');
    const result: any = await this.imap.appendMessage(imapCreds, draftsPath, raw, ['\\Draft']);
    if (dto.replace_uid) {
      await this.imap.expungeMessage(imapCreds, draftsPath, Number(dto.replace_uid)).catch(() => {});
    }
    return { message: 'Draf disimpan', data: { uid: result?.uid ?? null } };
  }

  async deleteDraft(userId: number, uid: number) {
    const { account, password } = await this.resolveCreds(userId);
    const imapCreds = this.imapCreds(account, password);
    const draftsPath = await this.imap.resolveFolder(imapCreds, 'drafts');
    await this.imap.expungeMessage(imapCreds, draftsPath, uid);
    return { message: 'Draf dihapus' };
  }
}
