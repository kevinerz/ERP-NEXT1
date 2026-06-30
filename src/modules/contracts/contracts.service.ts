import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKontrakDto, UpdateKontrakDto, TerminasiDto } from './dto/kontrak.dto';

const KONTRAK_INCLUDE = {
  site: {
    select: {
      kode_site: true, nama_site: true,
      pelanggan: { select: { nama_pelanggan: true } },
    },
  },
  layanan: { select: { nama_layanan: true, kode_layanan: true } },
};

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    search?: string; status_kontrak?: string; id_pelanggan?: number;
    page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.status_kontrak) where.status_kontrak = query.status_kontrak;
    if (query.search) {
      where.OR = [
        { nomor_kontrak: { contains: query.search } },
        { site: { nama_site: { contains: query.search } } },
        { site: { pelanggan: { nama_pelanggan: { contains: query.search } } } },
      ];
    }
    if (query.id_pelanggan) {
      where.site = { id_pelanggan: Number(query.id_pelanggan) };
    }

    const [data, total] = await Promise.all([
      this.prisma.kontrakLayanan.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: KONTRAK_INCLUDE,
      }),
      this.prisma.kontrakLayanan.count({ where }),
    ]);

    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const data = await this.prisma.kontrakLayanan.findUnique({
      where: { id_kontrak: id },
      include: {
        ...KONTRAK_INCLUDE,
        quotation: { select: { nomor_quotation: true, harga_mrc: true, harga_otc: true } },
      },
    });
    if (!data) throw new NotFoundException('Kontrak tidak ditemukan');
    return { data };
  }

  async create(dto: CreateKontrakDto) {
    const durasi_bulan = dto.durasi_bulan ?? 12;
    let tgl_berakhir = dto.tgl_berakhir ? new Date(dto.tgl_berakhir) : null;
    if (!tgl_berakhir) {
      tgl_berakhir = new Date(dto.tgl_mulai);
      tgl_berakhir.setMonth(tgl_berakhir.getMonth() + durasi_bulan);
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const now = new Date();
      const prefix = `KTR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const last = await this.prisma.kontrakLayanan.findFirst({
        where: { nomor_kontrak: { startsWith: prefix } },
        orderBy: { nomor_kontrak: 'desc' },
      });
      const seq = (last ? (parseInt(last.nomor_kontrak.split('-')[2], 10) || 0) : 0) + 1;
      const nomor_kontrak = `${prefix}-${String(seq).padStart(4, '0')}`;
      try {
        const data = await this.prisma.kontrakLayanan.create({
          data: {
            ...dto,
            nomor_kontrak,
            durasi_bulan,
            tgl_mulai: new Date(dto.tgl_mulai),
            tgl_berakhir,
            harga_otc: dto.harga_otc ?? 0,
            status_kontrak: 'Aktif',
          },
          include: KONTRAK_INCLUDE,
        });
        return { data, message: `Kontrak ${nomor_kontrak} berhasil dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async update(id: number, dto: UpdateKontrakDto) {
    const row = await this.prisma.kontrakLayanan.findUnique({ where: { id_kontrak: id } });
    if (!row) throw new NotFoundException('Kontrak tidak ditemukan');
    const data = await this.prisma.kontrakLayanan.update({
      where: { id_kontrak: id },
      data: dto,
      include: KONTRAK_INCLUDE,
    });
    return { data, message: 'Kontrak diperbarui' };
  }

  async terminasi(id: number, dto: TerminasiDto) {
    const row = await this.prisma.kontrakLayanan.findUnique({ where: { id_kontrak: id } });
    if (!row) throw new NotFoundException('Kontrak tidak ditemukan');
    const data = await this.prisma.kontrakLayanan.update({
      where: { id_kontrak: id },
      data: {
        status_kontrak: 'Terminasi',
        tanggal_terminasi: new Date(dto.tanggal_terminasi),
        alasan_terminasi: dto.alasan_terminasi,
      },
      include: KONTRAK_INCLUDE,
    });
    return { data, message: 'Kontrak diterminasi' };
  }

  async getSummary() {
    const statuses = ['Aktif', 'Akan_Berakhir', 'Berakhir', 'Terminasi'];
    const rows = await this.prisma.kontrakLayanan.groupBy({
      by: ['status_kontrak'],
      _count: { id_kontrak: true },
      _sum: { harga_mrc: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.status_kontrak, { count: r._count.id_kontrak, mrc: Number(r._sum.harga_mrc) }]));

    // Kontrak yang berakhir dalam 30 hari ke depan (update status otomatis)
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const akan_berakhir = await this.prisma.kontrakLayanan.count({
      where: {
        status_kontrak: 'Aktif',
        tgl_berakhir: { lte: in30, gte: new Date() },
      },
    });

    const total_mrc = rows.reduce((s, r) => s + (r.status_kontrak === 'Aktif' ? Number(r._sum.harga_mrc) : 0), 0);

    return {
      data: {
        statuses: statuses.map((s) => ({ status: s, count: map[s]?.count ?? 0 })),
        akan_berakhir,
        total_mrc_aktif: total_mrc,
      },
    };
  }
}
