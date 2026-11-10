import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FolderKind, InboxMessage, MessageDetail } from './imap.client';

/**
 * Klien Hostinger Mail API (https://api.mail.hostinger.com, dok: docs.hostinger.com/emails/mail-api).
 * Pengganti IMAP/SMTP untuk mailbox yang dijangkau token — lewat HTTPS, jadi tidak terganggu
 * port IMAP (993) yang sering timeout dari server ERP.
 *
 * Token (HOSTINGER_MAIL_TOKEN) milik satu email order dan bisa membaca SEMUA mailbox di dalamnya
 * tanpa password, jadi siapa yang boleh memakainya dibatasi di EmailService.
 * Bentuk data yang dikembalikan sama dengan ImapClientService supaya frontend tidak berubah.
 */
const BASE = 'https://api.mail.hostinger.com/api/v1';

const SPECIAL_USE: Record<FolderKind, string | null> = { inbox: null, sent: '\\Sent', drafts: '\\Drafts', trash: '\\Trash', junk: '\\Junk' };
const NAMA_CADANGAN: Record<FolderKind, string[]> = {
  inbox: ['INBOX'],
  sent: ['INBOX.Sent', 'Sent', 'Sent Items', 'Sent Messages'],
  drafts: ['INBOX.Drafts', 'Drafts', 'Draft'],
  trash: ['INBOX.Trash', 'Trash', 'Deleted Items', 'Deleted Messages'],
  junk: ['INBOX.Junk', 'INBOX.Spam', 'Junk', 'Spam'],
};

interface Alamat { name?: string; address?: string }
interface PesanApi {
  uid: number; date?: string; flags?: string[]; unseen?: boolean; subject?: string;
  from?: Alamat[] | Alamat; to?: Alamat[] | Alamat; cc?: Alamat[] | Alamat; bcc?: Alamat[] | Alamat; messageId?: string;
  attachments?: { id: string; contentType?: string; sizeBytes?: number; inline?: boolean; filename?: string }[];
}

// API kadang mengirim alamat sebagai satu objek, kadang sebagai daftar — samakan jadi daftar
const daftarAlamat = (a?: Alamat[] | Alamat | null): Alamat[] => (Array.isArray(a) ? a : a ? [a] : []);
const teksAlamat = (a?: Alamat[] | Alamat | null) =>
  daftarAlamat(a).map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).filter(Boolean).join(', ') || undefined;
const lampiranNyata = (p: PesanApi) => (p.attachments ?? []).filter((a) => !a.inline);

@Injectable()
export class HostingerMailClient {
  private readonly logger = new Logger('HostingerMail');
  private cacheMailbox: { t: number; data: { resourceId: string; address: string }[] } | null = null;
  private cacheFolder = new Map<string, { t: number; data: any[] }>();

  constructor(private config: ConfigService) {}

  get aktif() { return !!this.token; }
  private get token() { return (this.config.get<string>('HOSTINGER_MAIL_TOKEN') || '').trim(); }

  private async minta<T = any>(path: string, init: { method?: string; body?: any; mentah?: boolean; timeoutMs?: number } = {}): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000);
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: init.mentah ? '*/*' : 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: ctrl.signal,
      });
      if (res.status === 204) return undefined as T;
      if (!res.ok) {
        const j: any = await res.json().catch(() => ({}));
        const pesan = j?.error || j?.message || `HTTP ${res.status}`;
        if (res.status === 404) throw new NotFoundException(`Email tidak ditemukan (${pesan})`);
        if (res.status === 429) throw new BadRequestException('Hostinger Mail API sedang membatasi permintaan — coba lagi sebentar lagi');
        throw new BadRequestException(`Hostinger Mail API: ${pesan}`);
      }
      if (init.mentah) return Buffer.from(await res.arrayBuffer()) as T;
      return (await res.json()) as T;
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new BadRequestException('Hostinger Mail API tidak merespons (timeout)');
      throw e;
    } finally { clearTimeout(t); }
  }

  private enc = (s: string) => encodeURIComponent(s);

  /** Mailbox yang bisa dijangkau token (cache 10 menit) */
  async mailboxes(): Promise<{ resourceId: string; address: string }[]> {
    if (!this.aktif) return [];
    if (this.cacheMailbox && Date.now() - this.cacheMailbox.t < 600_000) return this.cacheMailbox.data;
    try {
      const r = await this.minta<{ data: { mailboxes: { resourceId: string; address: string }[] } }>('/me', { timeoutMs: 15_000 });
      this.cacheMailbox = { t: Date.now(), data: r.data?.mailboxes ?? [] };
    } catch (e: any) {
      this.logger.warn(`Gagal membaca daftar mailbox: ${e?.message}`);
      if (!this.cacheMailbox) return [];
    }
    return this.cacheMailbox!.data;
  }

  async cariMailbox(address: string) {
    const a = address.trim().toLowerCase();
    return (await this.mailboxes()).find((m) => m.address.toLowerCase() === a) ?? null;
  }

  private async daftarFolder(rid: string) {
    const c = this.cacheFolder.get(rid);
    if (c && Date.now() - c.t < 600_000) return c.data;
    const r = await this.minta<{ data: any[] }>(`/mailboxes/${rid}/folders?perPage=100`);
    this.cacheFolder.set(rid, { t: Date.now(), data: r.data ?? [] });
    return r.data ?? [];
  }

  async resolveFolder(rid: string, kind: FolderKind): Promise<string> {
    if (kind === 'inbox') return 'INBOX';
    const f = await this.daftarFolder(rid);
    const byUse = f.find((x) => x.specialUse === SPECIAL_USE[kind]);
    if (byUse) return byUse.path;
    for (const n of NAMA_CADANGAN[kind]) {
      const hit = f.find((x) => String(x.path).toLowerCase() === n.toLowerCase() || String(x.name).toLowerCase() === n.toLowerCase());
      if (hit) return hit.path;
    }
    throw new BadRequestException(`Folder ${kind} tidak ditemukan di mailbox`);
  }

  async listMessages(rid: string, path: string, opts: { page: number; limit: number; search?: string }) {
    const q = `page=${opts.page}&perPage=${Math.min(100, opts.limit)}&sort=-uid`;
    const base = `/mailboxes/${rid}/folders/${this.enc(path)}/messages`;
    const r = opts.search
      ? await this.minta<{ data: PesanApi[]; pagination: any }>(`${base}/search?${q}`, { method: 'POST', body: { text: opts.search } })
      : await this.minta<{ data: PesanApi[]; pagination: any }>(`${base}?${q}`);
    const data: InboxMessage[] = (r.data ?? []).map((m) => ({
      uid: m.uid,
      subject: m.subject || '(tanpa subjek)',
      from: daftarAlamat(m.from)[0] ? { name: daftarAlamat(m.from)[0]!.name, address: daftarAlamat(m.from)[0]!.address } : null,
      date: m.date ? new Date(m.date) : null,
      seen: !m.unseen,
      hasAttachments: lampiranNyata(m).length > 0,
    }));
    return { data, meta: { total: r.pagination?.total ?? data.length, page: opts.page, limit: opts.limit } };
  }

  async getMessage(rid: string, path: string, uid: number, markSeen = true): Promise<MessageDetail> {
    const base = `/mailboxes/${rid}/folders/${this.enc(path)}/messages/${uid}`;
    const [meta, teks] = await Promise.all([
      this.minta<{ data: PesanApi }>(base),
      this.minta<{ data: { text?: string; html?: string } }>(`${base}/text`),
    ]);
    const m = meta.data;
    if (markSeen && m.unseen) await this.setSeen(rid, path, uid, true).catch(() => {});
    return {
      uid,
      subject: m.subject || '(tanpa subjek)',
      from: teksAlamat(m.from), to: teksAlamat(m.to), cc: teksAlamat(m.cc), bcc: teksAlamat(m.bcc),
      date: m.date ? new Date(m.date) : undefined,
      html: teks.data?.html || null,
      text: teks.data?.text || null,
      attachments: lampiranNyata(m).map((a, i) => ({
        partId: i, filename: a.filename || `lampiran-${i + 1}`, size: a.sizeBytes ?? 0, contentType: a.contentType || 'application/octet-stream',
      })),
    };
  }

  async getAttachment(rid: string, path: string, uid: number, partId: number) {
    const base = `/mailboxes/${rid}/folders/${this.enc(path)}/messages/${uid}`;
    const m = (await this.minta<{ data: PesanApi }>(base)).data;
    const a = lampiranNyata(m)[partId];
    if (!a) throw new NotFoundException('Lampiran tidak ditemukan');
    const content = await this.minta<Buffer>(`${base}/attachments/${this.enc(a.id)}`, { mentah: true, timeoutMs: 120_000 });
    return { filename: a.filename || `lampiran-${partId + 1}`, contentType: a.contentType || 'application/octet-stream', content };
  }

  async setSeen(rid: string, path: string, uid: number, seen: boolean) {
    await this.minta(`/mailboxes/${rid}/folders/${this.enc(path)}/messages/${uid}`, {
      method: 'PATCH', body: seen ? { addFlags: ['\\Seen'] } : { removeFlags: ['\\Seen'] },
    });
  }

  async moveMessage(rid: string, path: string, uid: number, target: string) {
    await this.minta(`/mailboxes/${rid}/folders/${this.enc(path)}/messages/${uid}/move`, { method: 'POST', body: { targetFolder: target } });
  }

  async deleteMessage(rid: string, path: string, uid: number) {
    await this.minta(`/mailboxes/${rid}/folders/${this.enc(path)}/messages/${uid}`, { method: 'DELETE' });
  }

  /** Kirim email. Hostinger otomatis menyimpan salinan ke folder Terkirim. */
  async send(rid: string, input: {
    to: string; cc?: string; bcc?: string; subject: string; html: string; displayName?: string;
    attachments?: { filename: string; content: Buffer; contentType?: string; cid?: string }[];
  }) {
    const daftar = (s?: string) => (s || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const to = daftar(input.to);
    if (!to.length) throw new BadRequestException('Penerima wajib diisi');
    await this.minta(`/mailboxes/${rid}/send`, {
      method: 'POST',
      timeoutMs: 120_000,
      body: {
        to, cc: daftar(input.cc), bcc: daftar(input.bcc),
        subject: input.subject, html: input.html,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        attachments: (input.attachments ?? []).map((a) => ({
          filename: a.filename, content: a.content.toString('base64'), encoding: 'base64',
          ...(a.contentType ? { contentType: a.contentType } : {}), ...(a.cid ? { cid: a.cid } : {}),
        })),
      },
    });
  }
}
