import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SLA_JAM } from '../../operations/operations.service';
import { PrtgClient, PrtgSensor } from './prtg.client';

const STATUS_TIKET_AKTIF = ['Open', 'In_Progress', 'Pending_Customer'];

/**
 * PrtgService — polling PRTG tiap 5 menit:
 * - Sensor Down → auto-buat tiket (mapping device PRTG ↔ nama site)
 * - Sensor kembali Up → tiket PRTG auto-Resolved + log
 * Dedup: 1 sensor down = 1 tiket aktif (via integration_prtg_webhooks).
 */
@Injectable()
export class PrtgService {
  private readonly logger = new Logger('PRTG');

  constructor(
    private prisma: PrismaService,
    private prtg: PrtgClient,
    private notif: NotificationsService,
  ) {}

  getStatus() {
    return {
      data: {
        configured: this.prtg.isConfigured(),
        base_url: this.prtg.baseUrl,
        pesan: this.prtg.isConfigured()
          ? 'Polling aktif tiap 5 menit'
          : 'Isi PRTG_BASE_URL / PRTG_USERNAME / PRTG_PASSHASH di server',
      },
    };
  }

  async getWebhookLog(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const [data, total] = await Promise.all([
      this.prisma.integrationPrtgWebhook.findMany({
        skip: (page - 1) * limit, take: limit,
        orderBy: { diterima_pada: 'desc' },
        include: { ticket: { select: { id_ticket: true, nomor_tiket: true, status_tiket: true } } },
      }),
      this.prisma.integrationPrtgWebhook.count(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  // Cocokkan nama device PRTG dengan nama site (dua arah, case-insensitive)
  private async cariSite(deviceName: string): Promise<{ id_site: number; nama_site: string } | null> {
    const nama = deviceName.trim();
    if (!nama) return null;
    const site = await this.prisma.sitePelanggan.findFirst({
      where: { nama_site: { contains: nama } },
      select: { id_site: true, nama_site: true },
    });
    if (site) return site;
    // Kebalikan: nama site terkandung di nama device
    const semua = await this.prisma.sitePelanggan.findMany({
      select: { id_site: true, nama_site: true },
      take: 1000,
    });
    const lower = nama.toLowerCase();
    return semua.find((s) => lower.includes(s.nama_site.toLowerCase())) ?? null;
  }

  @Cron('*/5 * * * *')
  async poll() {
    if (!this.prtg.isConfigured()) return;
    let downSensors: PrtgSensor[];
    try {
      downSensors = await this.prtg.getDownSensors();
    } catch (e: any) {
      this.logger.warn(`Polling PRTG gagal: ${e.message}`);
      return;
    }

    const hasil = { tiket_dibuat: 0, dilewati: 0, auto_resolved: 0, tanpa_site: 0 };

    // ── 1. Sensor DOWN → buat tiket (sekali per sensor-down aktif) ──
    for (const s of downSensors) {
      const sensorId = String(s.objid);
      // Sudah ada entri aktif untuk sensor ini?
      const existing = await this.prisma.integrationPrtgWebhook.findFirst({
        where: {
          prtg_sensor_id: sensorId,
          OR: [
            { ticket: { status_tiket: { in: STATUS_TIKET_AKTIF } } },
            // entri tanpa tiket (site tak dikenal) — jangan spam, tahan 24 jam
            { id_ticket_terbentuk: null, diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) } },
          ],
        },
      });
      if (existing) { hasil.dilewati++; continue; }

      const site = await this.cariSite(s.device);
      let ticketId: number | null = null;

      if (site) {
        // Ping Down = link putus total → Critical; sensor lain High
        const prioritas = s.sensor.toLowerCase().includes('ping') ? 'Critical' : 'High';
        const now = new Date();
        const nomor = await this.genNomorTiket(now);
        const ticket = await this.prisma.operationTicket.create({
          data: {
            nomor_tiket: nomor,
            id_site: site.id_site,
            judul_tiket: `[PRTG] ${s.device} — ${s.sensor} DOWN`,
            deskripsi_masalah: s.message_raw || `Sensor ${s.sensor} pada ${s.device} berstatus ${s.status}`,
            prioritas,
            sumber_tiket: 'PRTG',
            sla_due: new Date(now.getTime() + (SLA_JAM[prioritas] ?? 24) * 3600_000),
          },
        });
        await this.prisma.operationTicketLog.create({
          data: { id_ticket: ticket.id_ticket, status_ke: 'Open', catatan: `Tiket dibuat otomatis dari PRTG (sensor #${sensorId})` },
        });
        ticketId = ticket.id_ticket;
        hasil.tiket_dibuat++;
        this.notif.notifyForModul('operations', {
          tipe: 'tiket_baru',
          judul: `🔴 [PRTG] ${s.device} DOWN`,
          deskripsi: `${nomor} — ${s.sensor} (${prioritas})`,
          url: `/operations/${ticket.id_ticket}`,
        }).catch(() => {});
      } else {
        hasil.tanpa_site++;
        this.notif.notifyForModul('operations', {
          tipe: 'tiket_baru',
          judul: `🔴 [PRTG] ${s.device} DOWN — site tidak dikenali`,
          deskripsi: `${s.sensor}: tidak cocok dgn nama site manapun, buat tiket manual`,
          url: '/operations',
        }).catch(() => {});
      }

      await this.prisma.integrationPrtgWebhook.create({
        data: {
          prtg_sensor_id: sensorId,
          prtg_device_name: s.device,
          prtg_sensor_name: s.sensor,
          status_sensor: s.status,
          pesan_alert: s.message_raw,
          id_ticket_terbentuk: ticketId,
        },
      });
    }

    // ── 2. Sensor sudah UP → auto-resolve tiket PRTG yang masih aktif ──
    const downIds = new Set(downSensors.map((s) => String(s.objid)));
    const aktifPrtg = await this.prisma.integrationPrtgWebhook.findMany({
      where: { ticket: { status_tiket: { in: STATUS_TIKET_AKTIF }, sumber_tiket: 'PRTG' } },
      include: { ticket: { select: { id_ticket: true, nomor_tiket: true, status_tiket: true } } },
    });
    for (const w of aktifPrtg) {
      if (!w.prtg_sensor_id || downIds.has(w.prtg_sensor_id) || !w.ticket) continue;
      await this.prisma.operationTicket.update({
        where: { id_ticket: w.ticket.id_ticket },
        data: { status_tiket: 'Resolved', tgl_resolved: new Date() },
      });
      await this.prisma.operationTicketLog.create({
        data: {
          id_ticket: w.ticket.id_ticket,
          status_dari: w.ticket.status_tiket,
          status_ke: 'Resolved',
          catatan: `Sensor PRTG #${w.prtg_sensor_id} kembali UP — auto-resolved`,
        },
      });
      hasil.auto_resolved++;
      this.notif.notifyForModul('operations', {
        tipe: 'tiket_update',
        judul: `🟢 [PRTG] ${w.prtg_device_name} kembali UP`,
        deskripsi: `${w.ticket.nomor_tiket} auto-resolved`,
        url: `/operations/${w.ticket.id_ticket}`,
      }).catch(() => {});
    }

    if (hasil.tiket_dibuat || hasil.auto_resolved || hasil.tanpa_site) {
      this.logger.log(`PRTG poll: ${JSON.stringify(hasil)}`);
    }
    return { data: hasil, message: `Poll selesai: ${hasil.tiket_dibuat} tiket dibuat, ${hasil.auto_resolved} auto-resolved, ${hasil.tanpa_site} site tak dikenali` };
  }

  private async genNomorTiket(now: Date): Promise<string> {
    const prefix = `TKT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const last = await this.prisma.operationTicket.findFirst({
      where: { nomor_tiket: { startsWith: prefix } },
      orderBy: { nomor_tiket: 'desc' },
    });
    const seq = (last ? (parseInt(last.nomor_tiket.split('-')[2], 10) || 0) : 0) + 1;
    return `${prefix}-${String(seq).padStart(4, '0')}`;
  }
}
