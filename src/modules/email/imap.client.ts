import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface ImapCreds {
  email_address: string;
  imap_host: string;
  imap_port: number;
  password: string;
}

export interface InboxMessage {
  uid: number;
  subject: string;
  from: { name?: string; address?: string } | null;
  date: Date | null;
  seen: boolean;
  hasAttachments: boolean;
}

export interface MessageDetail {
  uid: number;
  subject: string;
  from?: string;
  to?: string;
  date?: Date;
  html: string | null;
  text: string | null;
  attachments: { partId: number; filename: string; size: number; contentType: string }[];
}

function hasAttachmentPart(struct: any): boolean {
  if (!struct) return false;
  if (struct.disposition && String(struct.disposition).toLowerCase() === 'attachment') return true;
  if (struct.dispositionParameters?.filename || struct.parameters?.name) {
    if (struct.disposition) return true;
  }
  return (struct.childNodes || []).some(hasAttachmentPart);
}

@Injectable()
export class ImapClientService {
  private readonly logger = new Logger('ImapClient');

  private async open(creds: ImapCreds): Promise<ImapFlow> {
    const client = new ImapFlow({
      host: creds.imap_host,
      port: creds.imap_port,
      secure: creds.imap_port === 993,
      auth: { user: creds.email_address, pass: creds.password },
      logger: false,
    });
    try {
      await client.connect();
    } catch (e: any) {
      throw new BadRequestException(`Gagal konek IMAP: ${e.message}`);
    }
    return client;
  }

  private async withInbox<T>(creds: ImapCreds, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = await this.open(creds);
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        return await fn(client);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }

  /** Tes koneksi — dipakai saat user connect akun baru, supaya error kredensial ketahuan langsung */
  async testConnection(creds: ImapCreds): Promise<void> {
    const client = await this.open(creds);
    await client.logout().catch(() => {});
  }

  async listInbox(creds: ImapCreds, opts: { page: number; limit: number; search?: string }) {
    return this.withInbox(creds, async (client) => {
      if (opts.search) {
        const found = await client.search({
          or: [{ subject: opts.search }, { from: opts.search }, { body: opts.search }],
        } as any, { uid: true });
        const uids = (found as number[]).sort((a, b) => b - a);
        const total = uids.length;
        const pageUids = uids.slice((opts.page - 1) * opts.limit, (opts.page - 1) * opts.limit + opts.limit);
        const data: InboxMessage[] = [];
        for (const uid of pageUids) {
          for await (const msg of client.fetch({ uid: String(uid) }, { envelope: true, flags: true, uid: true, bodyStructure: true })) {
            data.push(this.mapMsg(msg));
          }
        }
        return { data, meta: { total, page: opts.page, limit: opts.limit } };
      }

      const total = client.mailbox && typeof client.mailbox !== 'boolean' ? client.mailbox.exists : 0;
      if (!total) return { data: [] as InboxMessage[], meta: { total: 0, page: opts.page, limit: opts.limit } };

      const end = total - (opts.page - 1) * opts.limit;
      const start = Math.max(1, end - opts.limit + 1);
      if (end < 1) return { data: [] as InboxMessage[], meta: { total, page: opts.page, limit: opts.limit } };

      const data: InboxMessage[] = [];
      for await (const msg of client.fetch(`${start}:${end}`, { envelope: true, flags: true, uid: true, bodyStructure: true })) {
        data.push(this.mapMsg(msg));
      }
      data.reverse();
      return { data, meta: { total, page: opts.page, limit: opts.limit } };
    });
  }

  async getMessage(creds: ImapCreds, uid: number, markSeen = true): Promise<MessageDetail> {
    return this.withInbox(creds, async (client) => {
      const { content } = await client.download(String(uid), undefined, { uid: true });
      const parsed = await simpleParser(content);
      if (markSeen) await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen']).catch(() => {});
      return {
        uid,
        subject: parsed.subject || '(tanpa subjek)',
        from: parsed.from?.text,
        to: parsed.to && 'text' in parsed.to ? parsed.to.text : undefined,
        date: parsed.date,
        html: parsed.html || null,
        text: parsed.text || null,
        attachments: parsed.attachments.map((a, i) => ({
          partId: i,
          filename: a.filename || `lampiran-${i + 1}`,
          size: a.size,
          contentType: a.contentType,
        })),
      };
    });
  }

  async getAttachment(creds: ImapCreds, uid: number, partId: number) {
    return this.withInbox(creds, async (client) => {
      const { content } = await client.download(String(uid), undefined, { uid: true });
      const parsed = await simpleParser(content);
      const att = parsed.attachments[partId];
      if (!att) throw new BadRequestException('Lampiran tidak ditemukan');
      return { filename: att.filename || `lampiran-${partId + 1}`, contentType: att.contentType, content: att.content };
    });
  }

  async setSeen(creds: ImapCreds, uid: number, seen: boolean) {
    return this.withInbox(creds, async (client) => {
      if (seen) await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen']);
      else await client.messageFlagsRemove({ uid: String(uid) }, ['\\Seen']);
    });
  }

  async deleteMessage(creds: ImapCreds, uid: number) {
    return this.withInbox(creds, async (client) => {
      await client.messageDelete({ uid: String(uid) });
    });
  }

  private mapMsg(msg: any): InboxMessage {
    const from = msg.envelope?.from?.[0];
    return {
      uid: msg.uid,
      subject: msg.envelope?.subject || '(tanpa subjek)',
      from: from ? { name: from.name, address: from.address } : null,
      date: msg.envelope?.date ?? null,
      seen: !!msg.flags?.has?.('\\Seen'),
      hasAttachments: hasAttachmentPart(msg.bodyStructure),
    };
  }
}
