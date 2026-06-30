import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWoDto, UpdateWoDto, CreateBeritaAcaraDto } from './dto/wo.dto';

const WO_INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true, kota: true,
      pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true } },
    },
  },
  teknisi: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
  vendor: { select: { id_vendor: true, nama_vendor: true } },
  ticket: { select: { id_ticket: true, nomor_tiket: true, judul_tiket: true } },
  _count: { select: { foto: true, berita_acara: true } },
};

const WO_DETAIL_INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true, kota: true, alamat_lengkap: true,
      pelanggan: {
        select: { nama_pelanggan: true, kode_pelanggan: true, no_telp: true, nama_pic_utama: true },
      },
    },
  },
  teknisi: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
  vendor: { select: { id_vendor: true, nama_vendor: true } },
  ticket: { select: { id_ticket: true, nomor_tiket: true, judul_tiket: true, status_tiket: true } },
  project: { select: { id_project: true, nomor_project: true, status_project: true } },
  foto: { orderBy: { created_at: 'desc' as const } },
  berita_acara: {
    include: { material: true },
    orderBy: { created_at: 'desc' as const },
  },
  pengiriman: {
    include: { items: true },
    orderBy: { created_at: 'desc' as const },
  },
};

@Injectable()
export class PublicWoService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    search?: string;
    status_wo?: string;
    jenis_wo?: string;
    id_teknisi?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.search) {
      where.OR = [
        { nomor_wo: { contains: query.search } },
        { deskripsi_tugas: { contains: query.search } },
        { site: { nama_site: { contains: query.search } } },
        { site: { pelanggan: { nama_pelanggan: { contains: query.search } } } },
      ];
    }
    if (query.status_wo) where.status_wo = query.status_wo;
    if (query.jenis_wo) where.jenis_wo = query.jenis_wo;
    if (query.id_teknisi) where.id_teknisi_internal = Number(query.id_teknisi);

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: WO_INCLUDE,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const data = await this.prisma.workOrder.findUnique({
      where: { id_wo: id },
      include: WO_DETAIL_INCLUDE,
    });
    if (!data) throw new NotFoundException('Work Order tidak ditemukan');
    return { data };
  }

  async create(dto: CreateWoDto) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = new Date();
      const prefix = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const last = await this.prisma.workOrder.findFirst({
        where: { nomor_wo: { startsWith: prefix } },
        orderBy: { nomor_wo: 'desc' },
      });
      const seq = (last ? (parseInt(last.nomor_wo.split('-')[2], 10) || 0) : 0) + 1;
      const nomor_wo = `${prefix}-${String(seq).padStart(4, '0')}`;
      try {
        const data = await this.prisma.workOrder.create({
          data: { ...dto, nomor_wo, fee_vendor: dto.fee_vendor ?? 0 },
          include: WO_INCLUDE,
        });
        return { data, message: `Work Order ${nomor_wo} dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async update(id: number, dto: UpdateWoDto) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id_wo: id } });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');

    const updateData: any = { ...dto };
    if (dto.status_wo === 'Completed') updateData.completed_at = new Date();

    const data = await this.prisma.workOrder.update({
      where: { id_wo: id },
      data: updateData,
      include: WO_INCLUDE,
    });

    return { data, message: 'Work Order diperbarui' };
  }

  async createBeritaAcara(id_wo: number, dto: CreateBeritaAcaraDto) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id_wo } });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');

    for (let attempt = 0; attempt < 5; attempt++) {
      const now = new Date();
      const prefix = `BA-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const last = await this.prisma.woBeritaAcara.findFirst({
        where: { nomor_ba: { startsWith: prefix } },
        orderBy: { nomor_ba: 'desc' },
      });
      const seq = (last ? (parseInt(last.nomor_ba.split('-')[2], 10) || 0) : 0) + 1;
      const nomor_ba = `${prefix}-${String(seq).padStart(4, '0')}`;
      try {
        const data = await this.prisma.woBeritaAcara.create({
          data: { id_wo, nomor_ba, ...dto },
        });
        return { data, message: `Berita Acara ${nomor_ba} dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async getStatusSummary() {
    const statuses = ['Open', 'In_Progress', 'Completed', 'Cancelled'];
    const rows = await this.prisma.workOrder.groupBy({
      by: ['status_wo'],
      _count: { id_wo: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.status_wo, r._count.id_wo]));
    return { data: statuses.map((s) => ({ status: s, count: map[s] ?? 0 })) };
  }

  async getTeknisiList() {
    const data = await this.prisma.hrisKaryawan.findMany({
      where: {
        status_aktif: true,
        user: {
          is_aktif: true,
          user_roles: {
            some: { role: { nama_role: { in: ['Teknisi', 'Manager_Ops', 'Admin'] } } },
          },
        },
      },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    return { data };
  }

  async remove(id: number) {
    const row = await this.prisma.workOrder.findUnique({ where: { id_wo: id } });
    if (!row) throw new NotFoundException('Work Order tidak ditemukan');
    if (!['Open', 'Cancelled'].includes(row.status_wo))
      throw new BadRequestException('Hanya WO berstatus Open atau Cancelled yang bisa dihapus');
    await this.prisma.workOrder.delete({ where: { id_wo: id } });
    return { message: `Work Order ${row.nomor_wo} dihapus` };
  }

  async getSiteDropdown() {
    const data = await this.prisma.sitePelanggan.findMany({
      where: { status_site: 'Aktif' },
      select: {
        id_site: true, kode_site: true, nama_site: true,
        pelanggan: { select: { nama_pelanggan: true } },
      },
      orderBy: { nama_site: 'asc' },
      take: 500,
    });
    return { data };
  }
}
