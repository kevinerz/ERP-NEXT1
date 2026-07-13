import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import { pino } from 'pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { usePrismaAuthState, clearAuthState } from './whatsapp-prisma-auth-state';

export type WaStatus = 'disconnected' | 'connecting' | 'qr_pending' | 'connected';

/**
 * WhatsappClientService — pegang SATU koneksi Baileys (WhatsApp Web tidak
 * resmi) untuk seluruh tim, hidup selama proses Nest berjalan. Beda dari
 * integrasi lain (Email/Digiflazz) yang connect-per-request: ini koneksi
 * WebSocket yang harus tetap hidup supaya pesan masuk bisa ditangkap
 * real-time lewat event, bukan ditarik on-demand.
 */
@Injectable()
export class WhatsappClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsappClient');
  private sock: WASocket | null = null;
  private status: WaStatus = 'disconnected';
  private currentQr: string | null = null;
  private reconnecting = false;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Cuma auto-connect kalau memang sudah pernah login sebelumnya (ada
    // creds tersimpan) — supaya server baru tidak langsung minta scan QR.
    const existing = await this.prisma.whatsappAuthCreds.findUnique({ where: { id: 1 } });
    if (existing) await this.connect();
  }

  onModuleDestroy() {
    this.sock?.end(undefined);
  }

  getStatus() { return this.status; }
  getQr() { return this.currentQr; }

  async connect(): Promise<void> {
    if (this.sock) return;
    this.status = 'connecting';

    const { state, saveCreds } = await usePrismaAuthState(this.prisma);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }) as any,
      printQRInTerminal: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        this.currentQr = await QRCode.toDataURL(qr);
        this.status = 'qr_pending';
      }
      if (connection === 'open') {
        this.status = 'connected';
        this.currentQr = null;
        this.logger.log('WhatsApp tersambung');
      }
      if (connection === 'close') {
        this.status = 'disconnected';
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        this.sock = null;
        if (loggedOut) {
          this.logger.warn('WhatsApp logout — sesi dihapus, perlu scan QR baru');
          await clearAuthState(this.prisma);
        } else if (!this.reconnecting) {
          this.logger.warn(`WhatsApp terputus (${statusCode}) — reconnect...`);
          this.reconnecting = true;
          setTimeout(() => { this.reconnecting = false; this.connect().catch((e) => this.logger.error(e.message)); }, 3000);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) await this.handleIncoming(msg);
    });
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      await this.sock.logout().catch(() => {});
      this.sock = null;
    }
    await clearAuthState(this.prisma);
    this.status = 'disconnected';
    this.currentQr = null;
  }

  async sendMessage(jid: string, text: string, userId?: number) {
    if (!this.sock || this.status !== 'connected') throw new Error('WhatsApp belum tersambung');
    const result = await this.sock.sendMessage(jid, { text });

    const chat = await this.prisma.whatsappChat.upsert({
      where: { jid },
      create: { jid, pesan_terakhir: text, waktu_terakhir: new Date() },
      update: { pesan_terakhir: text, waktu_terakhir: new Date(), unread_count: 0 },
    });
    await this.prisma.whatsappMessage.create({
      data: {
        id_chat: chat.id_chat,
        message_id: result?.key?.id || `local-${Date.now()}`,
        from_me: true,
        body: text,
        tipe: 'text',
        waktu: new Date(),
        id_user: userId || null,
      },
    });
    return chat;
  }

  private async handleIncoming(msg: proto.IWebMessageInfo) {
    if (!msg.message || !msg.key.remoteJid || msg.key.remoteJid === 'status@broadcast') return;
    const jid = msg.key.remoteJid;
    const fromMe = !!msg.key.fromMe;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      null;
    const tipe = msg.message.conversation || msg.message.extendedTextMessage
      ? 'text'
      : msg.message.imageMessage ? 'image'
      : msg.message.videoMessage ? 'video'
      : msg.message.documentMessage ? 'document'
      : msg.message.audioMessage ? 'audio'
      : 'lainnya';
    const waktu = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();
    const namaKontak = msg.pushName || undefined;

    const chat = await this.prisma.whatsappChat.upsert({
      where: { jid },
      create: { jid, nama_kontak: namaKontak, pesan_terakhir: text || `[${tipe}]`, waktu_terakhir: waktu, unread_count: fromMe ? 0 : 1 },
      update: {
        ...(namaKontak ? { nama_kontak: namaKontak } : {}),
        pesan_terakhir: text || `[${tipe}]`,
        waktu_terakhir: waktu,
        ...(fromMe ? {} : { unread_count: { increment: 1 } }),
      },
    });

    await this.prisma.whatsappMessage.upsert({
      where: { id_chat_message_id: { id_chat: chat.id_chat, message_id: msg.key.id || `unknown-${Date.now()}` } },
      create: {
        id_chat: chat.id_chat,
        message_id: msg.key.id || `unknown-${Date.now()}`,
        from_me: fromMe,
        body: text,
        tipe,
        waktu,
      },
      update: {},
    });
  }
}
