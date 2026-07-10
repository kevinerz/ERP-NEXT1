import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { ImapClientService } from './imap.client';
import { SmtpClientService } from './smtp.client';
import { ConnectEmailDto, SendEmailDto } from './dto/email.dto';

@Injectable()
export class EmailService {
  constructor(
    private prisma: PrismaService,
    private crypto: SecretCryptoService,
    private imap: ImapClientService,
    private smtp: SmtpClientService,
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
    if (!row || !row.is_aktif) throw new BadRequestException('Belum terhubung ke akun email — buka Settings untuk connect');
    const password = this.crypto.decrypt(row.password_enc);
    return { account: row, password };
  }

  async listInbox(userId: number, query: { page?: number; limit?: number; search?: string }) {
    const { account, password } = await this.resolveCreds(userId);
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 25, 100);
    try {
      const result = await this.imap.listInbox(
        { email_address: account.email_address, imap_host: account.imap_host, imap_port: account.imap_port, password },
        { page, limit, search: query.search },
      );
      return result;
    } catch (e: any) {
      await this.prisma.emailAccount.update({ where: { id_user: userId }, data: { last_error: e.message } }).catch(() => {});
      throw e;
    }
  }

  async getMessage(userId: number, uid: number) {
    const { account, password } = await this.resolveCreds(userId);
    const data = await this.imap.getMessage(
      { email_address: account.email_address, imap_host: account.imap_host, imap_port: account.imap_port, password },
      uid,
    );
    return { data };
  }

  async getAttachment(userId: number, uid: number, partId: number) {
    const { account, password } = await this.resolveCreds(userId);
    return this.imap.getAttachment(
      { email_address: account.email_address, imap_host: account.imap_host, imap_port: account.imap_port, password },
      uid, partId,
    );
  }

  async setSeen(userId: number, uid: number, seen: boolean) {
    const { account, password } = await this.resolveCreds(userId);
    await this.imap.setSeen(
      { email_address: account.email_address, imap_host: account.imap_host, imap_port: account.imap_port, password },
      uid, seen,
    );
    return { message: seen ? 'Ditandai dibaca' : 'Ditandai belum dibaca' };
  }

  async deleteMessage(userId: number, uid: number) {
    const { account, password } = await this.resolveCreds(userId);
    await this.imap.deleteMessage(
      { email_address: account.email_address, imap_host: account.imap_host, imap_port: account.imap_port, password },
      uid,
    );
    return { message: 'Email dihapus' };
  }

  async sendMail(userId: number, dto: SendEmailDto, files?: { originalname: string; buffer: Buffer }[]) {
    const { account, password } = await this.resolveCreds(userId);
    await this.smtp.sendMail(
      { email_address: account.email_address, smtp_host: account.smtp_host, smtp_port: account.smtp_port, password },
      {
        to: dto.to, cc: dto.cc, bcc: dto.bcc, subject: dto.subject, html: dto.html, in_reply_to: dto.in_reply_to,
        attachments: files?.map((f) => ({ filename: f.originalname, content: f.buffer })),
      },
    );
    return { message: 'Email terkirim' };
  }
}
