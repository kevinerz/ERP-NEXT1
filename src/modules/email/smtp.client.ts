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
  /** Nama tampilan pengirim opsional → header From jadi "Nama <alamat>".
   * Auth SMTP tetap pakai email_address polos. */
  from_name?: string;
  /** Paksa SSL/TLS. Kalau undefined, ditentukan dari port (465 = SSL). */
  secure?: boolean;
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
      secure: creds.secure ?? creds.smtp_port === 465,
      auth: { user: creds.email_address, pass: creds.password },
      // Timeout eksplisit — di shared hosting koneksi SMTP keluar bisa
      // menggantung; tanpa ini request bisa hang sampai proxy balas 502/504.
      // Lebih baik gagal cepat dengan pesan jelas.
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  async testConnection(creds: SmtpCreds): Promise<void> {
    try {
      await this.transporter(creds).verify();
    } catch (e: any) {
      throw new BadRequestException(`Gagal konek SMTP: ${e.message}`);
    }
  }

  private fromHeader(creds: SmtpCreds): string {
    return creds.from_name ? `"${creds.from_name}" <${creds.email_address}>` : creds.email_address;
  }

  async sendMail(creds: SmtpCreds, input: SendMailInput) {
    try {
      await this.transporter(creds).sendMail({
        from: this.fromHeader(creds),
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
      from: this.fromHeader(creds),
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
