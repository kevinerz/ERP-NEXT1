import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTicketDto, UpdateTicketDto, AddLogDto } from './dto/ticket.dto';

const TICKET_INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true, kota: true,
      pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true } },
    },
  },
  teknisi: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
  _count: { select: { work_orders: true, logs: true } },
};

const TICKET_DETAIL_INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true, kota: true, alamat_lengkap: true,
      pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true, no_telp: true, nama_pic_utama: true } },
      layanan: { select: { kode_layanan: true, nama_layanan: true } },
    },
  },
  teknisi: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
  work_orders: {
    include: {
      teknisi: { select: { id_karyawan: true, nama_lengkap: true } },
      vendor: { select: { id_vendor: true, nama_vendor: true } },
    },
    orderBy: { tgl_jadwal: 'desc' as const },
  },
  logs: {
    include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
    orderBy: { created_at: 'desc' as const },
  },
};

// Target resolve SLA per prioritas (jam)
export const SLA_JAM: Record<string, number> = {
  Critical: 4,
  High: 8,
  Medium: 24,
  Low: 72,
};

function hitungSlaDue(prioritas: string, dariWaktu: Date): Date {
  const jam = SLA_JAM[prioritas] ?? SLA_JAM.Medium;
  return new Date(dariWaktu.getTime() + jam * 3600_000);
}

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private prisma: PrismaService,
    private notifService: NotificationsService,
  ) {}

  // ─── TIKET ────────────────────────────────────────────────────

  async findAll(query: {
    search?: string;
    status_tiket?: string;
    prioritas?: string;
    id_teknisi?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.search) {
      where.OR = [
        { nomor_tiket: { contains: query.search } },
        { judul_tiket: { contains: query.search } },
        { site: { nama_site: { contains: query.search } } },
        { site: { pelanggan: { nama_pelanggan: { contains: query.search } } } },
      ];
    }
    if (query.status_tiket) where.status_tiket = query.status_tiket;
    if (query.prioritas) where.prioritas = query.prioritas;
    if (query.id_teknisi) where.id_teknisi_pic = Number(query.id_teknisi);

    const [data, total] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where, skip, take: limit,
        orderBy: { tgl_open: 'desc' },
        include: TICKET_INCLUDE,
      }),
      this.prisma.operationTicket.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const data = await this.prisma.operationTicket.findUnique({
      where: { id_ticket: id },
      include: TICKET_DETAIL_INCLUDE,
    });
    if (!data) throw new NotFoundException('Tiket tidak ditemukan');

    const related_tickets = await this.prisma.operationTicket.findMany({
      where: { id_site: data.id_site, id_ticket: { not: id } },
      orderBy: { tgl_open: 'desc' },
      take: 5,
      select: {
        id_ticket: true, nomor_tiket: true, judul_tiket: true,
        status_tiket: true, prioritas: true, tgl_open: true,
      },
    });

    return { data: { ...data, related_tickets } };
  }

  async create(dto: CreateTicketDto, userId?: number) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = new Date();
      const prefix = `TKT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const last = await this.prisma.operationTicket.findFirst({
        where: { nomor_tiket: { startsWith: prefix } },
        orderBy: { nomor_tiket: 'desc' },
      });
      const seq = (last ? (parseInt(last.nomor_tiket.split('-')[2], 10) || 0) : 0) + 1;
      const nomor_tiket = `${prefix}-${String(seq).padStart(4, '0')}`;
      try {
        const prioritas = dto.prioritas || 'Medium';
        const data = await this.prisma.operationTicket.create({
          data: {
            ...dto,
            nomor_tiket,
            prioritas,
            sumber_tiket: dto.sumber_tiket || 'Internal',
            sla_due: hitungSlaDue(prioritas, now),
          },
          include: TICKET_INCLUDE,
        });

        await this.prisma.operationTicketLog.create({
          data: { id_ticket: data.id_ticket, id_user: userId || null, status_ke: 'Open', catatan: 'Tiket dibuat' },
        });

        this.notifService.notifyForModul('operations', {
          tipe: 'tiket_baru',
          judul: `Tiket Baru: ${dto.judul_tiket}`,
          deskripsi: `${nomor_tiket}`,
          url: `/operations/${data.id_ticket}`,
        }).catch(() => {});

        return { data, message: `Tiket ${nomor_tiket} dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async update(id: number, dto: UpdateTicketDto, userId?: number) {
    const ticket = await this.prisma.operationTicket.findUnique({ where: { id_ticket: id } });
    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');

    const updateData: any = { ...dto, updated_at: new Date() };

    if (dto.status_tiket === 'Resolved') {
      updateData.tgl_resolved = new Date();
    }
    if (dto.status_tiket === 'Closed') {
      updateData.tgl_closed = new Date();
    }
    // Prioritas berubah → hitung ulang deadline SLA dari tgl_open
    if (dto.prioritas && dto.prioritas !== ticket.prioritas) {
      updateData.sla_due = hitungSlaDue(dto.prioritas, ticket.tgl_open);
      updateData.sla_breached = false; // dinilai ulang oleh scheduler
    }

    const data = await this.prisma.operationTicket.update({
      where: { id_ticket: id },
      data: updateData,
      include: TICKET_INCLUDE,
    });

    // Log status change
    if (dto.status_tiket && dto.status_tiket !== ticket.status_tiket) {
      await this.prisma.operationTicketLog.create({
        data: {
          id_ticket: id,
          id_user: userId || null,
          status_dari: ticket.status_tiket,
          status_ke: dto.status_tiket,
          catatan: `Status diubah ke ${dto.status_tiket}`,
        },
      });

      // Notifikasi status berubah
      this.notifService.notifyForModul('operations', {
        tipe: 'tiket_update',
        judul: `Status Tiket: ${ticket.status_tiket} → ${dto.status_tiket}`,
        deskripsi: ticket.nomor_tiket,
        url: `/operations/${id}`,
      }).catch(() => {});
    }

    return { data, message: 'Tiket diperbarui' };
  }

  async addLog(dto: AddLogDto, userId?: number) {
    const ticket = await this.prisma.operationTicket.findUnique({ where: { id_ticket: dto.id_ticket } });
    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');

    const log = await this.prisma.operationTicketLog.create({
      data: {
        id_ticket: dto.id_ticket,
        id_user: userId || null,
        status_dari: dto.status_ke ? (ticket.status_tiket || null) : null,
        status_ke: dto.status_ke || null,
        catatan: dto.catatan || null,
      },
      include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
    });

    // Update status if status_ke provided
    if (dto.status_ke) {
      const updateData: any = { status_tiket: dto.status_ke, updated_at: new Date() };
      if (dto.status_ke === 'Resolved') updateData.tgl_resolved = new Date();
      if (dto.status_ke === 'Closed') updateData.tgl_closed = new Date();
      await this.prisma.operationTicket.update({ where: { id_ticket: dto.id_ticket }, data: updateData });
    }

    return { data: log, message: 'Log ditambahkan' };
  }

  // ─── HELPERS ──────────────────────────────────────────────────

  // ─── NOC BOARD — snapshot real-time untuk wallboard ───────────
  async getNocBoard() {
    const now = new Date();
    const awalHari = new Date(now); awalHari.setHours(0, 0, 0, 0);

    const [aktif, resolvedHariIni, woLapangan] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where: { status_tiket: { in: ['Open', 'In_Progress', 'Pending_Customer'] } },
        select: {
          id_ticket: true, nomor_tiket: true, judul_tiket: true,
          prioritas: true, status_tiket: true, tgl_open: true,
          sla_due: true, sla_breached: true,
          site: { select: { nama_site: true, kota: true, pelanggan: { select: { nama_pelanggan: true } } } },
          teknisi: { select: { nama_lengkap: true } },
        },
        orderBy: [{ sla_due: 'asc' }],
        take: 100,
      }),
      this.prisma.operationTicket.count({
        where: { status_tiket: { in: ['Resolved', 'Closed'] }, tgl_resolved: { gte: awalHari } },
      }),
      // Teknisi yang sedang bertugas di lapangan (WO Dispatch/On-Site)
      this.prisma.workOrder.findMany({
        where: { status_wo: { in: ['Dispatch', 'On-Site'] } },
        select: {
          nomor_wo: true, status_wo: true, jenis_wo: true,
          teknisi: { select: { nama_lengkap: true } },
          vendor: { select: { nama_vendor: true } },
          site: { select: { nama_site: true } },
        },
        orderBy: { tgl_jadwal: 'asc' },
        take: 30,
      }),
    ]);

    const byPrioritas: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    let slaBreach = 0;
    let slaWarning = 0; // < 2 jam menuju deadline
    for (const t of aktif) {
      byPrioritas[t.prioritas] = (byPrioritas[t.prioritas] ?? 0) + 1;
      if (t.sla_breached || (t.sla_due && t.sla_due < now)) slaBreach++;
      else if (t.sla_due && t.sla_due.getTime() - now.getTime() < 2 * 3600_000) slaWarning++;
    }

    return {
      data: {
        waktu_server: now,
        total_aktif: aktif.length,
        by_prioritas: byPrioritas,
        sla_breach: slaBreach,
        sla_warning: slaWarning,
        resolved_hari_ini: resolvedHariIni,
        tiket: aktif,
        wo_lapangan: woLapangan,
      },
    };
  }

  // ─── METRIK NOC: MTTA / MTTR / kepatuhan SLA ──────────────────
  async getMetrics(query: { bulan?: string; tahun?: string }) {
    const now = new Date();
    const bulan = Number(query.bulan) || now.getMonth() + 1;
    const tahun = Number(query.tahun) || now.getFullYear();
    const awal = new Date(tahun, bulan - 1, 1);
    const akhir = new Date(tahun, bulan, 1);

    const tikets = await this.prisma.operationTicket.findMany({
      where: { tgl_open: { gte: awal, lt: akhir } },
      select: {
        prioritas: true, status_tiket: true, tgl_open: true, tgl_resolved: true,
        sla_breached: true,
        teknisi: { select: { nama_lengkap: true } },
        logs: {
          where: { NOT: { catatan: 'Tiket dibuat' } },
          orderBy: { created_at: 'asc' },
          take: 1,
          select: { created_at: true },
        },
      },
    });

    const menit = (ms: number) => Math.round(ms / 60000);
    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

    const mttaList: number[] = [];
    const mttrList: number[] = [];
    const perPrioritas: Record<string, { total: number; resolved: number; mttr: number[]; breach: number }> = {};
    const perTeknisi: Record<string, { resolved: number; mttr: number[] }> = {};
    let totalBreach = 0;

    for (const t of tikets) {
      const p = (perPrioritas[t.prioritas] ??= { total: 0, resolved: 0, mttr: [], breach: 0 });
      p.total++;
      if (t.sla_breached) { p.breach++; totalBreach++; }
      // MTTA: respon pertama = log pertama setelah log pembuatan
      if (t.logs[0]) mttaList.push(menit(t.logs[0].created_at.getTime() - t.tgl_open.getTime()));
      // MTTR: open -> resolved
      if (t.tgl_resolved) {
        const durasi = menit(t.tgl_resolved.getTime() - t.tgl_open.getTime());
        mttrList.push(durasi);
        p.resolved++;
        p.mttr.push(durasi);
        const nama = t.teknisi?.nama_lengkap ?? 'Tanpa PIC';
        const tek = (perTeknisi[nama] ??= { resolved: 0, mttr: [] });
        tek.resolved++;
        tek.mttr.push(durasi);
      }
    }

    const total = tikets.length;
    const resolved = mttrList.length;
    return {
      data: {
        periode: `${tahun}-${String(bulan).padStart(2, '0')}`,
        total_tiket: total,
        resolved,
        mtta_menit: avg(mttaList),
        mttr_menit: avg(mttrList),
        sla_compliance: total ? Math.round(((total - totalBreach) / total) * 100) : null,
        sla_breach: totalBreach,
        per_prioritas: Object.entries(perPrioritas).map(([prioritas, v]) => ({
          prioritas, total: v.total, resolved: v.resolved,
          mttr_menit: avg(v.mttr), sla_breach: v.breach,
        })),
        per_teknisi: Object.entries(perTeknisi)
          .map(([nama, v]) => ({ nama, resolved: v.resolved, mttr_menit: avg(v.mttr) }))
          .sort((a, b) => b.resolved - a.resolved),
      },
    };
  }

  async getStatusSummary() {
    const statuses = ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed'];
    const rows = await this.prisma.operationTicket.groupBy({
      by: ['status_tiket'],
      _count: { id_ticket: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.status_tiket, r._count.id_ticket]));
    const data = statuses.map((s) => ({ status: s, count: map[s] ?? 0 }));
    return { data };
  }

  async remove(id: number) {
    const row = await this.prisma.operationTicket.findUnique({ where: { id_ticket: id } });
    if (!row) throw new NotFoundException('Tiket tidak ditemukan');
    if (!['Open', 'Closed'].includes(row.status_tiket))
      throw new BadRequestException('Hanya tiket berstatus Open atau Closed yang bisa dihapus');
    await this.prisma.operationTicket.delete({ where: { id_ticket: id } });
    return { message: `Tiket ${row.nomor_tiket} dihapus` };
  }

  async getTeknisiList() {
    const data = await this.prisma.hrisKaryawan.findMany({
      where: {
        status_aktif: true,
        user: {
          is_aktif: true,
          user_roles: { some: { role: { nama_role: { in: ['Teknisi', 'Helpdesk', 'Manager_Ops', 'Admin'] } } } },
        },
      },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    return { data };
  }

  // ─── SCHEDULED JOBS ───────────────────────────────────────────
  
  /**
   * Auto-update ticket status to "Overdue" if SLA passed
   * Runs every 10 minutes (setiap 10 menit check & update)
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async autoUpdateTicketStatus() {
    const now = new Date();
    
    try {
      // Find open tickets dengan SLA yang sudah passed
      const ticketsToUpdate = await this.prisma.operationTicket.findMany({
        where: {
          status_tiket: { in: ['Open', 'In_Progress', 'Pending_Customer'] },
          sla_due: { lt: now }, // SLA passed
          sla_breached: false, // Belum di-mark sebagai breached
        },
        select: { id_ticket: true, nomor_tiket: true, sla_due: true },
      });

      if (ticketsToUpdate.length > 0) {
        // Batch update semua tickets yang breached
        await this.prisma.operationTicket.updateMany({
          where: { id_ticket: { in: ticketsToUpdate.map(t => t.id_ticket) } },
          data: { sla_breached: true },
        });

        this.logger.log(`[AUTO-UPDATE] Updated ${ticketsToUpdate.length} tickets to sla_breached=true`);
      }
    } catch (err) {
      this.logger.error(`[AUTO-UPDATE] Failed to update tickets: ${err.message}`);
    }
  }
}
