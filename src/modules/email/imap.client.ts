import { Injectable, Logger, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface ImapCreds {
  email_address: string;
  imap_host: string;
  imap_port: number;
  password: string;
}

export type FolderKind = 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk';

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

// Nama folder khusus tidak standar antar provider — andalkan flag SPECIAL-USE
// (RFC 6154) dulu kalau server mendukung, baru jatuh ke tebakan nama umum.
const SPECIAL_USE_FLAG: Record<FolderKind, string | null> = {
  inbox: null,
  sent: '\\Sent',
  drafts: '\\Drafts',
  trash: '\\Trash',
  junk: '\\Junk',
};
const FALLBACK_NAMES: Record<FolderKind, string[]> = {
  inbox: ['INBOX'],
  sent: ['Sent', 'Sent Items', 'Sent Messages', 'INBOX.Sent', 'INBOX/Sent', '[Gmail]/Sent Mail'],
  drafts: ['Drafts', 'Draft', 'INBOX.Drafts', 'INBOX/Drafts'],
  trash: ['Trash', 'Deleted Items', 'Deleted Messages', 'INBOX.Trash', 'INBOX/Trash', '[Gmail]/Trash'],
  junk: ['Junk', 'Spam', 'INBOX.Junk', 'INBOX/Junk', '[Gmail]/Spam'],
};

interface PooledConn { client: ImapFlow; timer: NodeJS.Timeout }

/**
 * ImapClientService — konek+login IMAP makan waktu ~3-4 detik (TLS handshake
 * + auth roundtrip ke server Hostinger), jauh lebih lambat daripada operasi
 * fetch itu sendiri. Simpan koneksi yang sudah login per akun ("pool") dan
 * pakai ulang untuk request berikutnya — hanya reconnect kalau memang idle
 * lama atau koneksi putus, bukan setiap request.
 */
@Injectable()
export class ImapClientService implements OnModuleDestroy {
  private readonly logger = new Logger('ImapClient');
  private pool = new Map<string, PooledConn>();
  private folderCache = new Map<string, string>();
  private static readonly IDLE_TIMEOUT_MS = 4 * 60 * 1000;

  private poolKey(creds: ImapCreds) { return `${creds.email_address}@${creds.imap_host}`; }

  private evict(key: string, reason: string) {
    const entry = this.pool.get(key);
    if (!entry) return;
    this.pool.delete(key);
    clearTimeout(entry.timer);
    this.logger.debug(`Menutup koneksi IMAP idle (${key}): ${reason}`);
    entry.client.logout().catch(() => {});
    for (const fk of this.folderCache.keys()) {
      if (fk.startsWith(`${key}::`)) this.folderCache.delete(fk);
    }
  }

  private async connect(creds: ImapCreds): Promise<ImapFlow> {
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

  /** Ambil koneksi yang sudah login — dari pool kalau masih hidup, buat baru kalau tidak */
  private async getClient(creds: ImapCreds): Promise<{ client: ImapFlow; key: string }> {
    const key = this.poolKey(creds);
    const existing = this.pool.get(key);
    if (existing && existing.client.usable) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.evict(key, 'idle timeout'), ImapClientService.IDLE_TIMEOUT_MS);
      return { client: existing.client, key };
    }
    if (existing) this.pool.delete(key); // stale — bukan usable lagi

    const client = await this.connect(creds);
    const timer = setTimeout(() => this.evict(key, 'idle timeout'), ImapClientService.IDLE_TIMEOUT_MS);
    this.pool.set(key, { client, timer });
    return { client, key };
  }

  private async withMailbox<T>(creds: ImapCreds, mailboxPath: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const { client, key } = await this.getClient(creds);
    try {
      const lock = await client.getMailboxLock(mailboxPath);
      try {
        return await fn(client);
      } finally {
        lock.release();
      }
    } catch (e: any) {
      // Koneksi basi/putus di tengah jalan — buang dari pool, biar request
      // berikutnya (bukan yang ini, supaya user tidak nunggu 2x) bikin baru.
      this.evict(key, `error: ${e.message}`);
      throw e;
    }
  }

  /** Cari path folder asli di server untuk folder khusus (Sent/Drafts/Trash/Junk) —
   * dicache per akun karena nama folder tidak berubah selama sesi berjalan. */
  async resolveFolder(creds: ImapCreds, kind: FolderKind): Promise<string> {
    if (kind === 'inbox') return 'INBOX';
    const key = this.poolKey(creds);
    const cacheKey = `${key}::${kind}`;
    const cached = this.folderCache.get(cacheKey);
    if (cached) return cached;

    const { client } = await this.getClient(creds);
    try {
      const list = await client.list();
      const specialFlag = SPECIAL_USE_FLAG[kind];
      const bySpecialUse = specialFlag && list.find((m: any) => m.specialUse === specialFlag);
      if (bySpecialUse) {
        this.folderCache.set(cacheKey, bySpecialUse.path);
        return bySpecialUse.path;
      }
      const names = FALLBACK_NAMES[kind].map((n) => n.toLowerCase());
      const byName = list.find((m: any) => names.includes(m.path.toLowerCase()) || names.includes(m.name?.toLowerCase()));
      if (byName) {
        this.folderCache.set(cacheKey, byName.path);
        return byName.path;
      }
      // Tidak ketemu sama sekali — pakai tebakan pertama; kalau salah, operasi
      // berikutnya akan gagal dengan error IMAP yang jelas ("mailbox tidak ada").
      return FALLBACK_NAMES[kind][0];
    } catch (e: any) {
      this.evict(key, `error: ${e.message}`);
      throw e;
    }
  }

  /** Tes koneksi — dipakai saat user connect akun baru. Sengaja tidak pakai pool
   * (harus benar-benar connect+logout bersih untuk memvalidasi kredensial). */
  async testConnection(creds: ImapCreds): Promise<void> {
    const client = await this.connect(creds);
    await client.logout().catch(() => {});
  }

  /** Putus & buang koneksi dari pool — dipanggil saat user disconnect akun */
  disconnect(creds: ImapCreds) {
    this.evict(this.poolKey(creds), 'user disconnect');
  }

  onModuleDestroy() {
    for (const key of this.pool.keys()) this.evict(key, 'module shutdown');
  }

  async listMessages(creds: ImapCreds, mailboxPath: string, opts: { page: number; limit: number; search?: string }) {
    return this.withMailbox(creds, mailboxPath, async (client) => {
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

  async getMessage(creds: ImapCreds, mailboxPath: string, uid: number, markSeen = true): Promise<MessageDetail> {
    return this.withMailbox(creds, mailboxPath, async (client) => {
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

  async getAttachment(creds: ImapCreds, mailboxPath: string, uid: number, partId: number) {
    return this.withMailbox(creds, mailboxPath, async (client) => {
      const { content } = await client.download(String(uid), undefined, { uid: true });
      const parsed = await simpleParser(content);
      const att = parsed.attachments[partId];
      if (!att) throw new BadRequestException('Lampiran tidak ditemukan');
      return { filename: att.filename || `lampiran-${partId + 1}`, contentType: att.contentType, content: att.content };
    });
  }

  async setSeen(creds: ImapCreds, mailboxPath: string, uid: number, seen: boolean) {
    return this.withMailbox(creds, mailboxPath, async (client) => {
      if (seen) await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen']);
      else await client.messageFlagsRemove({ uid: String(uid) }, ['\\Seen']);
    });
  }

  /** Pindah pesan ke folder lain (dipakai untuk "hapus" = pindah ke Sampah) */
  async moveMessage(creds: ImapCreds, fromPath: string, uid: number, toPath: string) {
    return this.withMailbox(creds, fromPath, async (client) => {
      await client.messageMove({ uid: String(uid) }, toPath);
    });
  }

  /** Hapus permanen — dipakai untuk hapus dari Sampah, atau hapus Draf */
  async expungeMessage(creds: ImapCreds, mailboxPath: string, uid: number) {
    return this.withMailbox(creds, mailboxPath, async (client) => {
      await client.messageDelete({ uid: String(uid) });
    });
  }

  /** Tulis pesan mentah (RFC822) langsung ke sebuah folder — dipakai untuk
   * menyimpan salinan ke Terkirim setelah kirim SMTP, dan untuk simpan Draf. */
  async appendMessage(creds: ImapCreds, mailboxPath: string, raw: Buffer, flags: string[] = []) {
    const { client, key } = await this.getClient(creds);
    try {
      return await client.append(mailboxPath, raw, flags);
    } catch (e: any) {
      this.evict(key, `error: ${e.message}`);
      throw e;
    }
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
