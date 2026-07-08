import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  private readonly logger = new Logger(ContractsService.name);

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
        quotation: { select: { id_quotation: true, nomor_quotation: true, harga_mrc: true, harga_otc: true } },
        projects: { select: { id_project: true, nomor_project: true, status_project: true } },
      },
    });
    if (!data) throw new NotFoundException('Kontrak tidak ditemukan');
    return { data };
  }

  async create(dto: CreateKontrakDto) {
    if (dto.id_quotation) {
      const qt = await this.prisma.salesQuotation.findUnique({ where: { id_quotation: dto.id_quotation } });
      if (!qt) throw new NotFoundException('Quotation tidak ditemukan');
      if (qt.status_approval !== 'Approved') throw new BadRequestException('Kontrak hanya bisa dibuat dari Quotation yang sudah Approved');
      const existing = await this.prisma.kontrakLayanan.findFirst({
        where: { id_quotation: dto.id_quotation, status_kontrak: { not: 'Terminasi' } },
      });
      if (existing)
        throw new BadRequestException(`Quotation ini sudah punya kontrak (${existing.nomor_kontrak})`);
    }

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
    if (row.status_kontrak === 'Terminasi')
      throw new BadRequestException('Kontrak yang sudah diterminasi tidak bisa diubah');
    const data = await this.prisma.kontrakLayanan.update({
      where: { id_kontrak: id },
      data: dto,
      include: KONTRAK_INCLUDE,
    });
    return { data, message: 'Kontrak diperbarui' };
  }

  async terminasi(id: number, dto: TerminasiDto) {
    const row = await this.prisma.kontrakLayanan.findUnique({
      where: { id_kontrak: id },
      include: { projects: { select: { nomor_project: true, status_project: true } } },
    });
    if (!row) throw new NotFoundException('Kontrak tidak ditemukan');
    if (row.status_kontrak === 'Terminasi')
      throw new BadRequestException('Kontrak sudah diterminasi');
    const projekBerjalan = row.projects.filter((p) => !['Selesai', 'Ditahan'].includes(p.status_project));
    if (projekBerjalan.length)
      throw new BadRequestException(
        `Masih ada project berjalan: ${projekBerjalan.map((p) => p.nomor_project).join(', ')}. Selesaikan atau tahan dulu.`,
      );

    try {
      const data = await this.prisma.$transaction(
        async (tx) => {
          const updated = await tx.kontrakLayanan.update({
            where: { id_kontrak: id },
            data: {
              status_kontrak: 'Terminasi',
              tanggal_terminasi: new Date(dto.tanggal_terminasi),
              alasan_terminasi: dto.alasan_terminasi,
            },
            include: KONTRAK_INCLUDE,
          });
          
          // Nonaktifkan site kalau tidak ada kontrak Aktif lain di site yg sama
          const kontrakAktifLain = await tx.kontrakLayanan.count({
            where: { id_site: row.id_site, status_kontrak: 'Aktif', id_kontrak: { not: id } },
          });
          
          if (kontrakAktifLain === 0) {
            const site = await tx.sitePelanggan.findUnique({
              where: { id_site: row.id_site },
            });
            
            if (!site) {
              throw new NotFoundException(`Site ${row.id_site} tidak ditemukan saat terminasi`);
            }
            
            await tx.sitePelanggan.update({
              where: { id_site: row.id_site },
              data: { status_site: 'Terminasi', tgl_terminasi: new Date(dto.tanggal_terminasi) },
            });
          }
          
          return updated;
        },
        {
          timeout: 10000, // 10 second timeout
          isolationLevel: 'Serializable', // Prevent race conditions
        },
      );
      
      return { data, message: 'Kontrak diterminasi' };
    } catch (e: any) {
      if (e.message?.includes('not found')) {
        throw new NotFoundException(e.message);
      }
      throw new BadRequestException(`Gagal meneterminasi kontrak: ${e.message}`);
    }
  }

  // Buat Project Delivery dari Kontrak (alur Kontrak → Project)
  async createProject(id_kontrak: number, dto: { id_pm: number; tgl_mulai?: string; tgl_target_selesai?: string; catatan?: string }) {
    const kontrak = await this.prisma.kontrakLayanan.findUnique({
      where: { id_kontrak },
      include: { quotation: { select: { id_opportunity: true } } },
    });
    if (!kontrak) throw new NotFoundException('Kontrak tidak ditemukan');
    if (!kontrak.id_quotation || !kontrak.quotation)
      throw new BadRequestException('Kontrak harus terhubung ke Quotation agar Project bisa dibuat (butuh data Opportunity)');

    const id_opportunity = kontrak.quotation.id_opportunity;

    for (let attempt = 0; attempt < 5; attempt++) {
      const now = new Date();
      const prefix = `PRJ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const last = await this.prisma.projectDelivery.findFirst({
        where: { nomor_project: { startsWith: prefix } },
        orderBy: { nomor_project: 'desc' },
      });
      const seq = (last ? (parseInt(last.nomor_project.split('-')[2], 10) || 0) : 0) + 1;
      const nomor_project = `${prefix}-${String(seq).padStart(4, '0')}`;
      try {
        const data = await this.prisma.projectDelivery.create({
          data: {
            nomor_project,
            id_opportunity,
            id_site: kontrak.id_site,
            id_pm: dto.id_pm,
            id_kontrak,
            tgl_mulai: dto.tgl_mulai ? new Date(dto.tgl_mulai) : undefined,
            tgl_target_selesai: dto.tgl_target_selesai ? new Date(dto.tgl_target_selesai) : undefined,
            catatan: dto.catatan,
            status_project: 'Perencanaan',
          },
        });
        return { data, message: `Project ${nomor_project} dibuat dari kontrak ${kontrak.nomor_kontrak}` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async remove(id: number) {
    const row = await this.prisma.kontrakLayanan.findUnique({
      where: { id_kontrak: id },
      include: { _count: { select: { projects: true } } },
    });
    if (!row) throw new NotFoundException('Kontrak tidak ditemukan');
    if ((row as any)._count.projects > 0)
      throw new BadRequestException('Kontrak tidak bisa dihapus karena sudah punya Project');
    if (row.status_kontrak === 'Aktif')
      throw new BadRequestException('Kontrak Aktif tidak bisa dihapus. Lakukan Terminasi terlebih dahulu.');
    await this.prisma.kontrakLayanan.delete({ where: { id_kontrak: id } });
    return { message: `Kontrak ${row.nomor_kontrak} dihapus` };
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

  // ─── SCHEDULED JOBS ───────────────────────────────────────────
  
  /**
   * Auto-update contract status to "Berakhir" if expiry date passed
   * Also update related sites to "Terminasi"
   * Runs every 15 minutes
   */
  @Cron(CronExpression.EVERY_15_MINUTES)
  async autoUpdateContractStatus() {
    const now = new Date();
    
    try {
      // Find Aktif contracts dengan tgl_berakhir sudah passed
      const contractsToExpire = await this.prisma.kontrakLayanan.findMany({
        where: {
          status_kontrak: 'Aktif',
          tgl_berakhir: { lt: now }, // Expiry date passed
        },
        select: { id_kontrak: true, nomor_kontrak: true, tgl_berakhir: true },
      });

      if (contractsToExpire.length > 0) {
        // Batch update contracts to Berakhir
        await this.prisma.kontrakLayanan.updateMany({
          where: { id_kontrak: { in: contractsToExpire.map(c => c.id_kontrak) } },
          data: { status_kontrak: 'Berakhir' },
        });

        this.logger.log(`[AUTO-UPDATE] Updated ${contractsToExpire.length} contracts to status Berakhir`);
      }
    } catch (err) {
      this.logger.error(`[AUTO-UPDATE] Failed to update contracts: ${err.message}`);
    }
  }
}
