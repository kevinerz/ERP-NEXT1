import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { ImapClientService, FolderKind } from './imap.client';
import { SmtpClientService } from './smtp.client';
import { HostingerMailClient } from './hostinger-mail.client';
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
    private hmail: HostingerMailClient,
  ) {}

  // ─── Hostinger Mail API ──────────────────────────────────────────
  // Akun yang alamatnya dijangkau HOSTINGER_MAIL_TOKEN dilayani lewat API (HTTPS),
  // bukan IMAP/SMTP — port IMAP dari server sering timeout.

  /** Mailbox API untuk akun ini, atau null kalau akun memakai IMAP/SMTP biasa */
  private async mailboxApi(address: string): Promise<string | null> {
    if (!this.hmail.aktif) return null;
    return (await this.hmail.cariMailbox(address))?.resourceId ?? null;
  }

  /**
   * Siapa boleh menghubungkan mailbox API TANPA password: token bisa membaca seluruh isi
   * mailbox, jadi hanya Admin/Director atau pemilik alamat itu (email karyawannya sama).
   */
  private async bolehPakaiApi(userId: number, address: string): Promise<boolean> {
    const u = await this.prisma.coreUser.findUnique({
      where: { id_user: userId },
      select: { karyawan: { select: { email: true } }, user_roles: { select: { role: { select: { nama_role: true } } } } },
    });
    if (!u) return false;
    if (u.user_roles.some((r) => ['Admin', 'Director'].includes(r.role.nama_role))) return true;
    return (u.karyawan?.email || '').trim().toLowerCase() === address.trim().toLowerCase();
  }

  /** Mailbox Hostinger yang boleh dihubungkan user ini lewat API (untuk tombol di halaman connect) */
  async apiMailboxes(userId: number) {
    const semua = await this.hmail.mailboxes();
    const boleh = [];
    for (const m of semua) if (await this.bolehPakaiApi(userId, m.address)) boleh.push({ address: m.address });
    return { data: boleh };
  }

  async connectApi(userId: number, email_address: string) {
    const mb = await this.hmail.cariMailbox(email_address || '');
    if (!mb) throw new BadRequestException('Alamat ini tidak tersedia di Hostinger Mail API');
    if (!(await this.bolehPakaiApi(userId, mb.address))) {
      throw new BadRequestException('Hanya Admin/Director atau pemilik alamat ini yang boleh menghubungkannya tanpa password');
    }
    // Uji akses dulu — supaya token yang dicabut ketahuan sebelum tersimpan
    await this.hmail.resolveFolder(mb.resourceId, 'sent');
    const data = {
      email_address: mb.address, imap_host: 'api.mail.hostinger.com', imap_port: 443,
      smtp_host: 'api.mail.hostinger.com', smtp_port: 443, password_enc: this.crypto.encrypt(''),
    };
    const row = await this.prisma.emailAccount.upsert({
      where: { id_user: userId },
      create: { id_user: userId, ...data },
      update: { ...data, is_aktif: true, last_error: null, connected_at: new Date() },
    });
    const { password_enc: _p, ...safe } = row;
    return { data: safe, message: `Terhubung ke ${mb.address} lewat Hostinger Mail API` };
  }

  /** Akun + mailbox API (bila ada) — dipakai semua operasi kotak surat */
  private async jalur(userId: number) {
    const row = await this.prisma.emailAccount.findUnique({ where: { id_user: userId } });
    if (!row || !row.is_aktif) throw new BadRequestException('Belum terhubung ke akun email — buka menu Email untuk connect');
    const rid = await this.mailboxApi(row.email_address);
    return { row, rid };
  }

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
    const via_api = !!(await this.mailboxApi(row.email_address));
    // Fitur yang tersedia beda antara mode API dan IMAP — dipakai UI untuk menampilkan tombol
    const fitur = { bintang: true, massal: true, kuota: via_api, draf: !via_api, hitung_folder: via_api };
    return { data: { ...safe, via_api, fitur } };
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
    const { rid } = await this.jalur(userId);
    if (rid) {
      const hitung = await this.hmail.hitungFolder(rid).catch(() => ({} as Record<string, { total: number; unread: number }>));
      const data = await Promise.all(FOLDER_KEYS.map(async (key) => {
        const path = await this.hmail.resolveFolder(rid, key).catch(() => null);
        return { key, label: FOLDER_LABELS[key], path, total: path ? hitung[path]?.total ?? null : null, unread: path ? hitung[path]?.unread ?? null : null };
      }));
      return { data };
    }
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const data = await Promise.all(
      FOLDER_KEYS.map(async (key) => ({ key, label: FOLDER_LABELS[key], path: await this.imap.resolveFolder(creds, key), total: null, unread: null })),
    );
    return { data };
  }

  async listMessages(userId: number, folder: string | undefined, query: { page?: number; limit?: number; search?: string }) {
    const key = this.normalizeFolder(folder);
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 25, 100);
    const { rid } = await this.jalur(userId);
    try {
      if (rid) {
        const path = await this.hmail.resolveFolder(rid, key);
        const r = await this.hmail.listMessages(rid, path, { page, limit, search: query.search });
        await this.prisma.emailAccount.update({ where: { id_user: userId }, data: { last_error: null } }).catch(() => {});
        return r;
      }
      const path = await this.imap.resolveFolder(creds, key);
      return await this.imap.listMessages(creds, path, { page, limit, search: query.search });
    } catch (e: any) {
      await this.prisma.emailAccount.update({ where: { id_user: userId }, data: { last_error: e.message } }).catch(() => {});
      throw e;
    }
  }

  async getMessage(userId: number, folder: string | undefined, uid: number) {
    const key = this.normalizeFolder(folder);
    const { rid } = await this.jalur(userId);
    if (rid) return { data: await this.hmail.getMessage(rid, await this.hmail.resolveFolder(rid, key), uid, key !== 'drafts') };
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const path = await this.imap.resolveFolder(creds, key);
    // Buka draf tidak perlu menandai terbaca — bukan surat masuk yang "dibaca"
    const data = await this.imap.getMessage(creds, path, uid, key !== 'drafts');
    return { data };
  }

  async getAttachment(userId: number, folder: string | undefined, uid: number, partId: number) {
    const key = this.normalizeFolder(folder);
    const { rid } = await this.jalur(userId);
    if (rid) return this.hmail.getAttachment(rid, await this.hmail.resolveFolder(rid, key), uid, partId);
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const path = await this.imap.resolveFolder(creds, key);
    return this.imap.getAttachment(creds, path, uid, partId);
  }

  async setSeen(userId: number, folder: string | undefined, uid: number, seen: boolean) {
    const key = this.normalizeFolder(folder);
    const { rid } = await this.jalur(userId);
    if (rid) {
      await this.hmail.setSeen(rid, await this.hmail.resolveFolder(rid, key), uid, seen);
      return { message: seen ? 'Ditandai dibaca' : 'Ditandai belum dibaca' };
    }
    const { account, password } = await this.resolveCreds(userId);
    const creds = this.imapCreds(account, password);
    const path = await this.imap.resolveFolder(creds, key);
    await this.imap.setSeen(creds, path, uid, seen);
    return { message: seen ? 'Ditandai dibaca' : 'Ditandai belum dibaca' };
  }

  async deleteMessage(userId: number, folder: string | undefined, uid: number) {
    const key = this.normalizeFolder(folder);
    const { rid } = await this.jalur(userId);
    if (rid) {
      const path = await this.hmail.resolveFolder(rid, key);
      if (key === 'trash') {
        await this.hmail.deleteMessage(rid, path, uid);
        return { message: 'Email dihapus permanen' };
      }
      await this.hmail.moveMessage(rid, path, uid, await this.hmail.resolveFolder(rid, 'trash'));
      return { message: 'Email dipindah ke Sampah' };
    }
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

  /** Bintangi / lepas bintang */
  async setFlagged(userId: number, folder: string | undefined, uid: number, on: boolean) {
    const key = this.normalizeFolder(folder);
    const { rid } = await this.jalur(userId);
    if (rid) await this.hmail.setFlag(rid, await this.hmail.resolveFolder(rid, key), uid, '\\Flagged', on);
    else {
      const { account, password } = await this.resolveCreds(userId);
      const creds = this.imapCreds(account, password);
      await this.imap.setFlag(creds, await this.imap.resolveFolder(creds, key), uid, '\\Flagged', on);
    }
    return { message: on ? 'Diberi bintang' : 'Bintang dilepas' };
  }

  /** Aksi massal untuk pesan terpilih: baca | belum | bintang | lepas_bintang | sampah | hapus | spam | inbox */
  async massal(userId: number, body: { folder?: string; uids?: number[]; aksi?: string }) {
    const key = this.normalizeFolder(body.folder);
    const uids = [...new Set((body.uids ?? []).map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 100);
    if (!uids.length) throw new BadRequestException('Pilih minimal satu email');
    const aksi = String(body.aksi || '');
    const FLAG: Record<string, [string[], string[]]> = {
      baca: [['\\Seen'], []], belum: [[], ['\\Seen']], bintang: [['\\Flagged'], []], lepas_bintang: [[], ['\\Flagged']],
    };
    const TUJUAN: Record<string, FolderKind> = { sampah: 'trash', spam: 'junk', inbox: 'inbox' };
    if (!FLAG[aksi] && !TUJUAN[aksi] && aksi !== 'hapus') throw new BadRequestException(`Aksi tidak dikenal: ${aksi}`);
    if (aksi === 'sampah' && key === 'trash') throw new BadRequestException('Email sudah di Sampah — pakai Hapus permanen');

    const { rid } = await this.jalur(userId);
    if (rid) {
      const path = await this.hmail.resolveFolder(rid, key);
      if (FLAG[aksi]) await this.hmail.flagsMassal(rid, path, uids, FLAG[aksi][0], FLAG[aksi][1]);
      else if (aksi === 'hapus') await this.hmail.hapusMassal(rid, path, uids);
      else await this.hmail.pindahMassal(rid, path, uids, await this.hmail.resolveFolder(rid, TUJUAN[aksi]));
    } else {
      const { account, password } = await this.resolveCreds(userId);
      const creds = this.imapCreds(account, password);
      const path = await this.imap.resolveFolder(creds, key);
      const target = TUJUAN[aksi] ? await this.imap.resolveFolder(creds, TUJUAN[aksi]) : null;
      for (const uid of uids) {
        if (aksi === 'baca' || aksi === 'belum') await this.imap.setSeen(creds, path, uid, aksi === 'baca');
        else if (FLAG[aksi]) await this.imap.setFlag(creds, path, uid, '\\Flagged', aksi === 'bintang');
        else if (aksi === 'hapus') await this.imap.expungeMessage(creds, path, uid);
        else if (target) await this.imap.moveMessage(creds, path, uid, target);
      }
    }
    const LABEL: Record<string, string> = {
      baca: 'ditandai dibaca', belum: 'ditandai belum dibaca', bintang: 'diberi bintang', lepas_bintang: 'dilepas bintangnya',
      sampah: 'dipindah ke Sampah', hapus: 'dihapus permanen', spam: 'dipindah ke Spam', inbox: 'dipindah ke Kotak Masuk',
    };
    return { message: `${uids.length} email ${LABEL[aksi]}` };
  }

  /** Pemakaian kapasitas mailbox (hanya mode API) */
  async quota(userId: number) {
    const { rid } = await this.jalur(userId);
    if (!rid) return { data: null };
    return { data: await this.hmail.kuota(rid).catch(() => null) };
  }

  async sendMail(userId: number, dto: SendEmailDto, files?: { originalname: string; buffer: Buffer }[]) {
    const { rid } = await this.jalur(userId);
    if (rid) {
      const settings = await this.settings.getAll();
      const { html, logoAttachment } = this.branding.build(dto.html, settings);
      await this.hmail.send(rid, {
        to: dto.to, cc: dto.cc, bcc: dto.bcc, subject: dto.subject, html,
        ...(dto.ref_uid && dto.ref_folder && (dto.ref_jenis === 'balas' || dto.ref_jenis === 'teruskan')
          ? { [dto.ref_jenis === 'balas' ? 'balasKe' : 'teruskanDari']: {
              uid: Number(dto.ref_uid), folder: await this.hmail.resolveFolder(rid, this.normalizeFolder(dto.ref_folder)),
            } }
          : {}),
        attachments: [
          ...(files?.map((f) => ({ filename: f.originalname, content: f.buffer })) || []),
          ...(logoAttachment ? [logoAttachment] : []),
        ],
      });
      // Salinan Terkirim dibuat otomatis oleh Hostinger. Draf asal dihapus bila ada.
      if (dto.draft_uid) {
        await this.hmail.deleteMessage(rid, await this.hmail.resolveFolder(rid, 'drafts'), Number(dto.draft_uid))
          .catch((e) => this.logger.warn(`Gagal hapus draf ${dto.draft_uid}: ${e.message}`));
      }
      return { message: 'Email terkirim' };
    }
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
    if ((await this.jalur(userId)).rid) {
      throw new BadRequestException('Simpan draf belum didukung Hostinger Mail API — kirim langsung, atau salin isinya dulu');
    }
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
    const { rid } = await this.jalur(userId);
    if (rid) {
      await this.hmail.deleteMessage(rid, await this.hmail.resolveFolder(rid, 'drafts'), uid);
      return { message: 'Draf dihapus' };
    }
    const { account, password } = await this.resolveCreds(userId);
    const imapCreds = this.imapCreds(account, password);
    const draftsPath = await this.imap.resolveFolder(imapCreds, 'drafts');
    await this.imap.expungeMessage(imapCreds, draftsPath, uid);
    return { message: 'Draf dihapus' };
  }
}
