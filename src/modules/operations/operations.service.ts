import { Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class OperationsService {
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
        const data = await this.prisma.operationTicket.create({
          data: {
            ...dto,
            nomor_tiket,
            prioritas: dto.prioritas || 'Medium',
            sumber_tiket: dto.sumber_tiket || 'Internal',
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
}
