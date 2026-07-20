import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { TokenBlacklistService } from '../../modules/auth/token-blacklist.service';

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
    private tokenBlacklist: TokenBlacklistService,
  ) {}

  // Tiap jam — buang token blacklist yang sudah kedaluwarsa (cegah Map tumbuh tanpa batas)
  @Cron('0 * * * *')
  cekBlacklistToken() {
    const sebelum = this.tokenBlacklist.size;
    this.tokenBlacklist.cleanup();
    const sesudah = this.tokenBlacklist.size;
    if (sebelum !== sesudah) this.logger.log(`Token blacklist dibersihkan: ${sebelum - sesudah} entri kedaluwarsa dibuang`);
  }

  // Tiap hari 00:15 WIB (server diasumsikan Asia/Jakarta; kalau UTC tetap jalan harian)
  @Cron('15 0 * * *')
  async dailyTasks() {
    await this.tandaiInvoiceJatuhTempo();
    await this.tandaiKontrakBerakhir();
    await this.ingatkanKontrakAkanBerakhir();
    await this.ingatkanTiketDingin();
  }

  // Tiap 15 menit — SLA tiket harus dicek lebih sering dari harian
  @Cron('*/15 * * * *')
  async cekSlaTiket() {
    try {
      const now = new Date();
      const telat = await this.prisma.operationTicket.findMany({
        where: {
          status_tiket: { in: ['Open', 'In_Progress', 'Pending_Customer'] },
          sla_breached: false,
          sla_due: { lt: now },
        },
        select: { id_ticket: true, nomor_tiket: true, judul_tiket: true, prioritas: true },
      });
      if (!telat.length) return;

      await this.prisma.operationTicket.updateMany({
        where: { id_ticket: { in: telat.map((t) => t.id_ticket) } },
        data: { sla_breached: true },
      });
      this.logger.warn(`${telat.length} tiket melewati SLA`);
      for (const t of telat) {
        this.notif.notifyForModul('operations', {
          tipe: 'sla_breach',
          judul: `⚠️ SLA TERLEWATI [${t.prioritas}]`,
          deskripsi: `${t.nomor_tiket} — ${t.judul_tiket}`,
          url: `/operations/${t.id_ticket}`,
        }).catch(() => {});
      }
    } catch (e: any) {
      // Cron @nestjs/schedule TIDAK menangkap promise rejection dari job-nya —
      // kalau tidak ditangkap di sini, ini jadi unhandledRejection dan bisa
      // MEMATIKAN SELURUH PROSES (bukan cuma melewatkan 1 run cron).
      this.logger.error(`cekSlaTiket gagal: ${e.message}`, e.stack);
    }
  }

  // Tiket open tanpa aktivitas (log) > 24 jam — ingatkan tim ops
  async ingatkanTiketDingin() {
    try {
      const batas = new Date(Date.now() - 24 * 3600_000);
      const dingin = await this.prisma.operationTicket.findMany({
        where: {
          status_tiket: { in: ['Open', 'In_Progress'] },
          updated_at: { lt: batas },
          logs: { none: { created_at: { gte: batas } } },
        },
        select: { id_ticket: true, nomor_tiket: true, judul_tiket: true },
        take: 20,
      });
      if (!dingin.length) return;
      this.notif.notifyForModul('operations', {
        tipe: 'tiket_dingin',
        judul: `${dingin.length} tiket tanpa aktivitas >24 jam`,
        deskripsi: dingin.slice(0, 5).map((t) => t.nomor_tiket).join(', ') + (dingin.length > 5 ? ', …' : ''),
        url: '/operations',
      }).catch(() => {});
    } catch (e: any) {
      this.logger.error(`ingatkanTiketDingin gagal: ${e.message}`, e.stack);
    }
  }

  async tandaiInvoiceJatuhTempo() {
    try {
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
    } catch (e: any) {
      this.logger.error(`tandaiInvoiceJatuhTempo gagal: ${e.message}`, e.stack);
    }
  }

  async tandaiKontrakBerakhir() {
    try {
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
    } catch (e: any) {
      this.logger.error(`tandaiKontrakBerakhir gagal: ${e.message}`, e.stack);
    }
  }

  async ingatkanKontrakAkanBerakhir() {
    try {
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
    } catch (e: any) {
      this.logger.error(`ingatkanKontrakAkanBerakhir gagal: ${e.message}`, e.stack);
    }
  }
}
