import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { ImapClientService, FolderKind } from './imap.client';
import { SmtpClientService } from './smtp.client';
import { SettingsService } from '../settings/settings.service';
import { MailBrandingService } from '../../common/mailer/mail-branding.service';
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
    private branding: MailBrandingService,
  ) {}

  /** Kontak karyawan (nama + email) untuk dropdown penerima di compose. */
  async listContacts() {
    const rows = await this.prisma.hrisKaryawan.findMany({
      where: { email: { not: null } },
      select: { nama_lengkap: true, email: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    return { data: rows.filter((r) => r.email && r.email.trim()) };
  }

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

  async sendMail(userId: number, dto: SendEmailDto, files?: { originalname: string; buffer: Buffer }[]) {
    const { account, password } = await this.resolveCreds(userId);
    const smtpCreds = this.smtpCreds(account, password);
    const settings = await this.settings.getAll();
    const { html: brandedHtml, logoAttachment } = this.branding.build(dto.html, settings);
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
