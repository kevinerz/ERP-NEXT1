import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  onModuleInit() {
    // JANGAN `await this.$connect()` di sini. NestFactory menunggu semua
    // onModuleInit selesai sebelum app.listen(), sedangkan Hostinger Node
    // hosting MEMBUNUH proses kalau listen() tidak dipanggil dalam 3 detik.
    // Kalau DB remote (srv*.hstgr.io) lambat/telat, connect blocking bikin
    // bootstrap menggantung → crash-loop. Prisma connect otomatis saat query
    // pertama; di sini cukup hangatkan koneksi di background tanpa menahan boot.
    this.$connect().catch((e) => {
      this.logger.warn(`Koneksi awal DB gagal (akan retry otomatis saat query): ${e?.message}`);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
