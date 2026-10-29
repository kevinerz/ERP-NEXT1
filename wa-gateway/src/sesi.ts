// Satu sesi WhatsApp (satu nomor) — koneksi, QR, reconnect, terima/kirim pesan
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestWaWebVersion,
  isJidGroup,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type AnyMessageContent,
  type Contact,
  type WAMessage,
  type WASocket,
  type proto,
} from 'baileys';
import { config } from './config.js';
import { log, logBaileys } from './logger.js';
import { kirimWebhook } from './webhook.js';
import { normalisasi, type JenisMedia, type PayloadPesan } from './normalisasi.js';

export type StatusSesi = 'mati' | 'menghubungkan' | 'qr' | 'terhubung' | 'terputus' | 'logout';

export interface KirimDto {
  ke: string; // JID atau nomor HP (08xx / 628xx)
  teks?: string;
  media?: { base64: string; mimetype: string; jenis: JenisMedia; nama_file?: string; ptt?: boolean };
  kutip?: { id: string; dari_saya: boolean; pengirim_jid?: string | null; teks?: string | null };
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'application/pdf': 'pdf',
};
function ekstensi(mime: string | null, namaFile: string | null, jenis: JenisMedia): string {
  const dariNama = namaFile?.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  if (dariNama) return dariNama.toLowerCase();
  const m = (mime || '').split(';')[0]!.trim();
  return EXT[m] || (jenis === 'sticker' ? 'webp' : jenis === 'audio' ? 'ogg' : 'bin');
}
const aman = (s: string) => s.replace(/[^\w.-]/g, '_');
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

// "0812…" / "+62 812…" / "62812…" → 62812…@s.whatsapp.net
export function keJid(ke: string): string {
  if (ke.includes('@')) return ke;
  let n = ke.replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (!n) throw new Error('Nomor tujuan kosong');
  return `${n}@s.whatsapp.net`;
}

export class Sesi {
  sock: WASocket | null = null;
  status: StatusSesi = 'mati';
  qr: string | null = null; // data URL PNG
  saya: { jid: string | null; nama: string | null } = { jid: null, nama: null };
  putusTerakhir: { kode: number | null; alasan: string; waktu: string } | null = null;

  private qrKe = 0;
  private tunda = 2000;
  private berhenti = false;
  private timerSambung: NodeJS.Timeout | null = null;
  private antreanKirim: Promise<unknown> = Promise.resolve();
  private pesanTerbaru = new Map<string, proto.IMessage>(); // untuk getMessage (kirim ulang/retry)
  private dikirimApi = new Set<string>(); // id pesan yang dikirim lewat API (media tidak perlu diunduh ulang)
  private panggilanDibalas = new Map<string, number>();

  constructor(readonly akun: string) {}

  get dirAuth() { return path.join(config.dataDir, 'auth', this.akun); }
  get dirMedia() { return path.join(config.dataDir, 'media', this.akun); }

  info() {
    return { akun: this.akun, status: this.status, qr: this.qr, saya: this.saya, putus_terakhir: this.putusTerakhir };
  }

  private kabarkan() {
    const { qr, ...tanpaQr } = this.info();
    kirimWebhook({ akun: this.akun, event: 'koneksi', data: { ...tanpaQr, ada_qr: !!qr } });
  }

  private ingat(id: string | null | undefined, m: proto.IMessage | null | undefined) {
    if (!id || !m) return;
    this.pesanTerbaru.set(id, m);
    if (this.pesanTerbaru.size > 3000) this.pesanTerbaru.delete(this.pesanTerbaru.keys().next().value!);
  }

  async mulai() {
    if (this.sock) return;
    this.berhenti = false;
    this.qrKe = 0;
    if (this.timerSambung) { clearTimeout(this.timerSambung); this.timerSambung = null; }
    fs.mkdirSync(this.dirAuth, { recursive: true });
    fs.mkdirSync(this.dirMedia, { recursive: true });
    this.status = 'menghubungkan';
    this.kabarkan();

    const { state, saveCreds } = await useMultiFileAuthState(this.dirAuth);
    let version: [number, number, number] | undefined;
    try { version = (await fetchLatestWaWebVersion({})).version; } catch { /* pakai bawaan Baileys */ }

    const sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logBaileys) },
      logger: logBaileys,
      // Identitas Mac OS/Windows "Desktop" (aplikasi desktop asli) ditolak WhatsApp (428).
      // Ubuntu Desktop diterima dan tetap meminta riwayat penuh (requireFullSync).
      browser: Browsers.ubuntu('Desktop'),
      syncFullHistory: true,
      // Jangan tampil "online" terus — notifikasi di HP helpdesk tetap berbunyi
      markOnlineOnConnect: false,
      getMessage: async (key) => (key.id ? this.pesanTerbaru.get(key.id) : undefined),
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => void this.onKoneksi(sock, u));
    sock.ev.on('messages.upsert', ({ messages, type }) => void this.onPesan(messages, type === 'notify' || type === 'append'));
    sock.ev.on('messaging-history.set', (h) => void this.onRiwayat(h));
    sock.ev.on('messages.update', (list) => void this.onUpdatePesan(list));
    sock.ev.on('contacts.upsert', (c) => void this.onKontak(c));
    sock.ev.on('contacts.update', (c) => void this.onKontak(c as Contact[]));
    sock.ev.on('groups.upsert', (g) => kirimWebhook({ akun: this.akun, event: 'grup', data: g.map((x) => ({ jid: x.id, nama: x.subject })) }));
    sock.ev.on('groups.update', (g) => {
      const data = g.filter((x) => x.id && x.subject).map((x) => ({ jid: x.id!, nama: x.subject! }));
      if (data.length) kirimWebhook({ akun: this.akun, event: 'grup', data });
    });
    sock.ev.on('lid-mapping.update', (m) => kirimWebhook({ akun: this.akun, event: 'lid', data: [{ lid: m.lid, pn: m.pn }] }));
    sock.ev.on('call', (calls) => void this.onPanggilan(calls));
  }

  private async onKoneksi(sock: WASocket, u: Partial<import('baileys').ConnectionState>) {
    if (sock !== this.sock) return;
    if (u.qr) {
      this.qrKe++;
      if (this.qrKe > 8) {
        // ±2 menit tidak di-scan → berhenti, minta ulang dari ERP
        log.info({ akun: this.akun }, 'QR tidak di-scan, sesi dihentikan');
        this.berhenti = true;
        this.status = 'mati';
        this.qr = null;
        sock.end(undefined);
        this.kabarkan();
        return;
      }
      this.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 320 });
      this.status = 'qr';
      this.kabarkan();
    }
    if (u.connection === 'open') {
      this.status = 'terhubung';
      this.qr = null;
      this.qrKe = 0;
      this.tunda = 2000;
      this.saya = { jid: sock.user?.id ? jidNormalizedUser(sock.user.id) : null, nama: sock.user?.name ?? sock.user?.verifiedName ?? null };
      log.info({ akun: this.akun, saya: this.saya }, 'WhatsApp terhubung');
      this.kabarkan();
    }
    if (u.connection === 'close') {
      this.sock = null;
      const kode: number | null = (u.lastDisconnect?.error as any)?.output?.statusCode ?? null;
      const alasan = (u.lastDisconnect?.error as any)?.message ?? 'tidak diketahui';
      this.putusTerakhir = { kode, alasan, waktu: new Date().toISOString() };
      log.warn({ akun: this.akun, kode, alasan }, 'Koneksi WhatsApp tertutup');

      if (kode === DisconnectReason.loggedOut) {
        // Perangkat dilepas dari HP → hapus sesi, harus scan QR ulang
        fs.rmSync(this.dirAuth, { recursive: true, force: true });
        this.status = 'logout';
        this.saya = { jid: null, nama: null };
        this.kabarkan();
        return;
      }
      if (kode === DisconnectReason.connectionReplaced) {
        this.status = 'terputus';
        this.kabarkan();
        return; // sesi dibuka di tempat lain — jangan berebut, tunggu perintah dari ERP
      }
      if (this.berhenti) {
        if (this.status !== 'mati') { this.status = 'mati'; this.kabarkan(); }
        return;
      }
      this.status = 'terputus';
      this.kabarkan();
      const jeda = kode === DisconnectReason.restartRequired ? 0 : this.tunda;
      this.tunda = Math.min(this.tunda * 2, 60_000);
      this.timerSambung = setTimeout(() => { this.timerSambung = null; void this.mulai().catch((e) => log.error({ err: e?.message }, 'Gagal menyambung ulang')); }, jeda);
    }
  }

  // LID → nomor HP bila pemetaannya diketahui
  resolve = async (jid: string | null | undefined, alt?: string | null): Promise<{ jid: string | null; lid: string | null }> => {
    if (!jid) return { jid: null, lid: null };
    const j = jidNormalizedUser(jid);
    if (isPnUser(j)) return { jid: j, lid: alt && isLidUser(alt) ? jidNormalizedUser(alt) : null };
    if (isLidUser(j)) {
      if (alt && isPnUser(alt)) return { jid: jidNormalizedUser(alt), lid: j };
      const pn = await this.sock?.signalRepository.lidMapping.getPNForLID(j).catch(() => null);
      return { jid: pn ? jidNormalizedUser(pn) : j, lid: j };
    }
    return { jid: j, lid: null };
  };

  private async onPesan(messages: WAMessage[], unduhMedia: boolean) {
    for (const msg of messages) {
      try {
        this.ingat(msg.key.id, msg.message);
        const p = await normalisasi(msg, this.resolve);
        if (!p) continue;
        if (p.media && unduhMedia && !this.dikirimApi.has(p.id)) await this.unduh(msg, p);
        kirimWebhook({ akun: this.akun, event: 'pesan', data: p });
      } catch (e: any) {
        log.error({ err: e?.message, id: msg.key?.id }, 'Gagal memproses pesan masuk');
      }
    }
  }

  private async unduh(msg: WAMessage, p: PayloadPesan) {
    const m = p.media!;
    if (m.ukuran && m.ukuran > config.maxMediaMb * 1024 * 1024) return;
    const nama = `${aman(p.id)}.${ekstensi(m.mimetype, m.nama_file, m.jenis)}`;
    try {
      const stream = await downloadMediaMessage(msg, 'stream', {}, { logger: logBaileys, reuploadRequest: this.sock!.updateMediaMessage });
      await pipeline(stream, fs.createWriteStream(path.join(this.dirMedia, nama)));
      m.file = nama;
    } catch (e: any) {
      log.warn({ err: e?.message, id: p.id }, 'Media gagal diunduh');
    }
  }

  private async onRiwayat(h: { chats: any[]; contacts: Contact[]; messages: WAMessage[]; lidPnMappings?: { lid: string; pn: string }[]; isLatest?: boolean; progress?: number | null }) {
    try {
      if (h.lidPnMappings?.length) kirimWebhook({ akun: this.akun, event: 'lid', data: h.lidPnMappings });
      if (h.contacts?.length) await this.onKontak(h.contacts);
      const chats = [];
      for (const c of h.chats ?? []) {
        if (!c.id || c.id === 'status@broadcast' || c.id.endsWith('@newsletter')) continue;
        const r = isJidGroup(c.id) ? { jid: c.id, lid: null } : await this.resolve(c.id, c.pnJid ?? c.lidJid ?? null);
        chats.push({ jid: r.jid ?? c.id, lid: r.lid, nama: c.name ?? null, belum_dibaca: c.unreadCount ?? 0, waktu: c.conversationTimestamp ? Number(c.conversationTimestamp) : null });
      }
      if (chats.length) kirimWebhook({ akun: this.akun, event: 'chat', data: chats });

      const pesan: PayloadPesan[] = [];
      for (const msg of h.messages ?? []) {
        this.ingat(msg.key.id, msg.message);
        const p = await normalisasi(msg, this.resolve, true);
        if (p) pesan.push(p);
      }
      for (let i = 0; i < pesan.length; i += 200) {
        kirimWebhook({ akun: this.akun, event: 'riwayat', data: { pesan: pesan.slice(i, i + 200), progress: h.progress ?? null, terakhir: !!h.isLatest } });
      }
      log.info({ akun: this.akun, chat: chats.length, pesan: pesan.length, progress: h.progress }, 'Riwayat diterima');
    } catch (e: any) {
      log.error({ err: e?.message }, 'Gagal memproses riwayat');
    }
  }

  private async onKontak(list: Partial<Contact>[]) {
    const data = [];
    for (const c of list) {
      if (!c.id) continue;
      const nama = c.name ?? c.notify ?? c.verifiedName ?? null;
      if (!nama && !c.phoneNumber && !c.lid) continue;
      const r = isJidGroup(c.id) ? { jid: c.id, lid: null } : await this.resolve(c.id, c.phoneNumber ?? c.lid ?? null);
      data.push({ jid: r.jid ?? c.id, lid: r.lid ?? c.lid ?? null, nama, nama_simpan: c.name ?? null, nama_wa: c.notify ?? null });
    }
    for (let i = 0; i < data.length; i += 500) kirimWebhook({ akun: this.akun, event: 'kontak', data: data.slice(i, i + 500) });
  }

  private async onUpdatePesan(list: { key: proto.IMessageKey; update: Partial<WAMessage> }[]) {
    const data = [];
    for (const { key, update } of list) {
      if (!key.id || update.status == null || !key.remoteJid) continue;
      const r = isJidGroup(key.remoteJid) ? { jid: key.remoteJid } : await this.resolve(key.remoteJid);
      data.push({ id: key.id, chat_jid: r.jid ?? key.remoteJid, status: update.status });
    }
    if (data.length) kirimWebhook({ akun: this.akun, event: 'status', data });
  }

  private async onPanggilan(calls: import('baileys').WACallEvent[]) {
    for (const c of calls) {
      if (c.status !== 'offer' || !this.sock) continue;
      try {
        await this.sock.rejectCall(c.id, c.from);
        const r = await this.resolve(c.callerPn ?? c.from);
        const tujuan = r.jid ?? c.from;
        kirimWebhook({ akun: this.akun, event: 'panggilan', data: { dari_jid: tujuan, dari_lid: r.lid, video: !!c.isVideo, grup: !!c.isGroup, waktu: Math.floor(c.date.getTime() / 1000) } });
        // Balasan otomatis paling sering sekali per 10 menit per penelepon
        const terakhir = this.panggilanDibalas.get(tujuan) ?? 0;
        if (!c.isGroup && Date.now() - terakhir > 10 * 60_000) {
          this.panggilanDibalas.set(tujuan, Date.now());
          await this.kirim({ ke: tujuan, teks: config.pesanTolakPanggilan });
        }
      } catch (e: any) {
        log.warn({ err: e?.message }, 'Gagal menolak panggilan');
      }
    }
  }

  private pastikanTerhubung(): WASocket {
    if (!this.sock || this.status !== 'terhubung') throw Object.assign(new Error('WhatsApp belum terhubung'), { status: 409 });
    return this.sock;
  }

  // Kirim berurutan dengan jeda acak (anti-blokir)
  kirim(dto: KirimDto): Promise<PayloadPesan | null> {
    const tugas = this.antreanKirim.then(async () => {
      const sock = this.pastikanTerhubung();
      const jid = keJid(dto.ke);
      let content: AnyMessageContent;
      if (dto.media) {
        const buf = Buffer.from(dto.media.base64, 'base64');
        const { mimetype, jenis, nama_file } = dto.media;
        const caption = dto.teks || undefined;
        if (jenis === 'image') content = { image: buf, mimetype, caption };
        else if (jenis === 'video') content = { video: buf, mimetype, caption };
        else if (jenis === 'audio') content = { audio: buf, mimetype, ptt: !!dto.media.ptt };
        else if (jenis === 'sticker') content = { sticker: buf, mimetype };
        else content = { document: buf, mimetype, fileName: nama_file || 'dokumen', caption };
      } else {
        if (!dto.teks?.trim()) throw Object.assign(new Error('Teks pesan kosong'), { status: 400 });
        content = { text: dto.teks };
      }
      const quoted = dto.kutip
        ? ({
            key: { remoteJid: jid, id: dto.kutip.id, fromMe: dto.kutip.dari_saya, participant: isJidGroup(jid) ? dto.kutip.pengirim_jid ?? undefined : undefined },
            message: this.pesanTerbaru.get(dto.kutip.id) ?? { conversation: dto.kutip.teks ?? '' },
          } as WAMessage)
        : undefined;

      await tidur(config.jedaMinMs + Math.random() * (config.jedaMaxMs - config.jedaMinMs));
      if (!isJidGroup(jid)) await sock.sendPresenceUpdate('composing', jid).catch(() => undefined);
      const m = await sock.sendMessage(jid, content, quoted ? { quoted } : undefined);
      if (!isJidGroup(jid)) await sock.sendPresenceUpdate('paused', jid).catch(() => undefined);
      if (!m) return null;
      if (m.key.id) {
        this.dikirimApi.add(m.key.id);
        if (this.dikirimApi.size > 3000) this.dikirimApi.delete(this.dikirimApi.values().next().value!);
      }
      this.ingat(m.key.id, m.message);
      return normalisasi(m, this.resolve);
    });
    this.antreanKirim = tugas.catch(() => undefined);
    return tugas;
  }

  async baca(jid: string, pesan: { id: string; pengirim_jid?: string | null }[]) {
    const sock = this.pastikanTerhubung();
    const grup = isJidGroup(jid);
    await sock.readMessages(pesan.map((p) => ({ remoteJid: jid, id: p.id, fromMe: false, participant: grup ? p.pengirim_jid ?? undefined : undefined })));
  }

  async reaksi(jid: string, target: { id: string; dari_saya: boolean; pengirim_jid?: string | null }, emoji: string) {
    const sock = this.pastikanTerhubung();
    await sock.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: target.id, fromMe: target.dari_saya, participant: isJidGroup(jid) ? target.pengirim_jid ?? undefined : undefined } },
    });
  }

  async grup(jid: string) {
    const sock = this.pastikanTerhubung();
    const g = await sock.groupMetadata(jid);
    const peserta = [];
    for (const p of g.participants) {
      const r = await this.resolve(p.id, p.phoneNumber ?? p.lid ?? null);
      peserta.push({ jid: r.jid ?? p.id, lid: r.lid, admin: p.admin ?? null });
    }
    return { jid: g.id, nama: g.subject, deskripsi: g.desc ?? null, peserta };
  }

  async foto(jid: string) {
    const sock = this.pastikanTerhubung();
    return (await sock.profilePictureUrl(jid, 'image').catch(() => null)) ?? null;
  }

  async logout() {
    this.berhenti = true;
    if (this.sock) await this.sock.logout().catch(() => undefined);
    this.sock = null;
    fs.rmSync(this.dirAuth, { recursive: true, force: true });
    this.status = 'logout';
    this.qr = null;
    this.saya = { jid: null, nama: null };
    this.kabarkan();
  }

  stop() {
    this.berhenti = true;
    this.sock?.end(undefined);
    this.sock = null;
  }
}
