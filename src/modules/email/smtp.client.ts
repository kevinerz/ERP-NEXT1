import { Injectable, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
// nodemailer tidak meng-export MailComposer lewat entry utama — hanya lewat
// submodule ini. Dipakai untuk membangun pesan mentah (RFC822) TANPA benar-benar
// mengirim, untuk simpan salinan ke Terkirim dan untuk simpan Draf.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailComposer = require('nodemailer/lib/mail-composer');

export interface SmtpCreds {
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  password: string;
}

export interface SendMailInput {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  html?: string;
  in_reply_to?: string;
  attachments?: { filename: string; content: Buffer; cid?: string; contentType?: string }[];
}

@Injectable()
export class SmtpClientService {
  private transporter(creds: SmtpCreds) {
    return nodemailer.createTransport({
      host: creds.smtp_host,
      port: creds.smtp_port,
      secure: creds.smtp_port === 465,
      auth: { user: creds.email_address, pass: creds.password },
    });
  }

  async testConnection(creds: SmtpCreds): Promise<void> {
    try {
      await this.transporter(creds).verify();
    } catch (e: any) {
      throw new BadRequestException(`Gagal konek SMTP: ${e.message}`);
    }
  }

  async sendMail(creds: SmtpCreds, input: SendMailInput) {
    try {
      await this.transporter(creds).sendMail({
        from: creds.email_address,
        to: input.to,
        cc: input.cc || undefined,
        bcc: input.bcc || undefined,
        subject: input.subject,
        html: input.html,
        inReplyTo: input.in_reply_to,
        references: input.in_reply_to,
        attachments: input.attachments,
      });
    } catch (e: any) {
      throw new BadRequestException(`Gagal kirim email: ${e.message}`);
    }
  }

  /** Bangun pesan mentah RFC822 tanpa mengirim — untuk salinan Terkirim & Draf */
  buildRaw(creds: SmtpCreds, input: SendMailInput): Promise<Buffer> {
    const composer = new MailComposer({
      from: creds.email_address,
      to: input.to || undefined,
      cc: input.cc || undefined,
      bcc: input.bcc || undefined,
      subject: input.subject || '(tanpa subjek)',
      html: input.html || '',
      inReplyTo: input.in_reply_to,
      references: input.in_reply_to,
      attachments: input.attachments,
    });
    return new Promise((resolve, reject) => {
      composer.compile().build((err: Error | null, message: Buffer) => {
        if (err) reject(err); else resolve(message);
      });
    });
  }
}
