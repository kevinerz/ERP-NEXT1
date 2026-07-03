import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';

/**
 * SchedulerService — tugas otomatis harian.
 * Tanpa ini, status berbasis-tanggal tidak pernah berubah:
 * - Invoice Terkirim/Sebagian lewat jatuh tempo → Jatuh_Tempo
 * - Kontrak Aktif lewat tgl_berakhir → Berakhir (stop ditagih generateBulk)
 * - Kontrak Aktif H-30 sebelum berakhir → notifikasi
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('Scheduler');

  constructor(
    private prisma: PrismaService,
    private notif: NotificationsService,
  ) {}

  // Tiap hari 00:15 WIB (server diasumsikan Asia/Jakarta; kalau UTC tetap jalan harian)
  @Cron('15 0 * * *')
  async dailyTasks() {
    await this.tandaiInvoiceJatuhTempo();
    await this.tandaiKontrakBerakhir();
    await this.ingatkanKontrakAkanBerakhir();
  }

  async tandaiInvoiceJatuhTempo() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const res = await this.prisma.invoice.updateMany({
      where: {
        status: { in: ['Terkirim', 'Sebagian'] },
        tgl_jatuh_tempo: { lt: today },
      },
      data: { status: 'Jatuh_Tempo' },
    });
    if (res.count > 0) {
      this.logger.log(`${res.count} invoice ditandai Jatuh_Tempo`);
      this.notif.notifyForModul('finance', {
        tipe: 'invoice_jatuh_tempo',
        judul: 'Invoice Jatuh Tempo',
        deskripsi: `${res.count} invoice melewati jatuh tempo`,
        url: '/finance/invoice?status=Jatuh_Tempo',
      }).catch(() => {});
    }
  }

  async tandaiKontrakBerakhir() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const res = await this.prisma.kontrakLayanan.updateMany({
      where: { status_kontrak: 'Aktif', tgl_berakhir: { lt: today } },
      data: { status_kontrak: 'Berakhir' },
    });
    if (res.count > 0) {
      this.logger.log(`${res.count} kontrak ditandai Berakhir`);
      this.notif.notifyForModul('contracts', {
        tipe: 'kontrak_berakhir',
        judul: 'Kontrak Berakhir',
        deskripsi: `${res.count} kontrak melewati tanggal berakhir`,
        url: '/contracts?status_kontrak=Berakhir',
      }).catch(() => {});
    }
  }

  async ingatkanKontrakAkanBerakhir() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const count = await this.prisma.kontrakLayanan.count({
      where: {
        status_kontrak: 'Aktif',
        tgl_berakhir: { gte: today, lte: in30 },
      },
    });
    if (count > 0) {
      this.notif.notifyForModul('contracts', {
        tipe: 'kontrak_akan_berakhir',
        judul: 'Kontrak Akan Berakhir',
        deskripsi: `${count} kontrak berakhir dalam 30 hari — siapkan perpanjangan`,
        url: '/contracts',
      }).catch(() => {});
    }
  }
}
