import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsappClientService } from './whatsapp-client.service';
import { KirimPesanDto } from './dto/whatsapp.dto';

@Injectable()
export class SocialchatService {
  constructor(
    private prisma: PrismaService,
    private waClient: WhatsappClientService,
  ) {}

  getStatus() {
    return { data: { status: this.waClient.getStatus() } };
  }

  getQr() {
    return { data: { qr: this.waClient.getQr(), status: this.waClient.getStatus() } };
  }

  async connect() {
    await this.waClient.connect();
    return { message: 'Menyiapkan koneksi WhatsApp — scan QR kalau diminta' };
  }

  async disconnect() {
    await this.waClient.disconnect();
    return { message: 'WhatsApp diputus, sesi dihapus' };
  }

  async listChats() {
    const data = await this.prisma.whatsappChat.findMany({
      orderBy: { waktu_terakhir: 'desc' },
      take: 100,
    });
    return { data };
  }

  async getMessages(idChat: number, query: { page?: number; limit?: number }) {
    const chat = await this.prisma.whatsappChat.findUnique({ where: { id_chat: idChat } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');

    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const [rows, total] = await Promise.all([
      this.prisma.whatsappMessage.findMany({
        where: { id_chat: idChat },
        orderBy: { waktu: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
      }),
      this.prisma.whatsappMessage.count({ where: { id_chat: idChat } }),
    ]);
    const data = rows.reverse(); // tampilkan lama -> baru

    if (chat.unread_count > 0) {
      await this.prisma.whatsappChat.update({ where: { id_chat: idChat }, data: { unread_count: 0 } });
    }

    return { data, meta: { total, page, limit }, chat };
  }

  async kirim(dto: KirimPesanDto, userId?: number) {
    const chat = await this.prisma.whatsappChat.findUnique({ where: { id_chat: dto.id_chat } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');
    try {
      await this.waClient.sendMessage(chat.jid, dto.text, userId);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Gagal kirim pesan WhatsApp');
    }
    return { message: 'Pesan terkirim' };
  }
}
