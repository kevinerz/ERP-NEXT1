import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { CreateWoDto, UpdateWoDto } from './dto/wo.dto';
import { CreateBastDto, UpdateBastDto } from './dto/bast.dto';

const PROJECT_INCLUDE = {
  opportunity: {
    select: {
      nama_opportunity: true,
      lead: { select: { nama_prospek: true, nama_perusahaan: true } },
    },
  },
  site: { select: { id_site: true, kode_site: true, nama_site: true, alamat_lengkap: true, kota: true } },
  pm: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
  kontrak: { select: { id_kontrak: true, nomor_kontrak: true, status_kontrak: true } },
};

const WO_INCLUDE = {
  teknisi: { select: { id_karyawan: true, nama_lengkap: true } },
  vendor: { select: { id_vendor: true, nama_vendor: true } },
  site: { select: { kode_site: true, nama_site: true } },
};

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  // ─── PROJECT ─────────────────────────────────────────────────

  async findAll(query: {
    search?: string; status_project?: string;
    id_pm?: string; page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.search) {
      where.OR = [
        { nomor_project: { contains: query.search } },
        { site: { nama_site: { contains: query.search } } },
      ];
    }
    if (query.status_project) where.status_project = query.status_project;
    if (query.id_pm) where.id_pm = Number(query.id_pm);

    const [data, total] = await Promise.all([
      this.prisma.projectDelivery.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          ...PROJECT_INCLUDE,
          _count: { select: { work_orders: true } },
        },
      }),
      this.prisma.projectDelivery.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const data = await this.prisma.projectDelivery.findUnique({
      where: { id_project: id },
      include: {
        ...PROJECT_INCLUDE,
        work_orders: {
          include: WO_INCLUDE,
          orderBy: { tgl_jadwal: 'asc' },
        },
        bast: { orderBy: { created_at: 'desc' } },
      },
    });
    if (!data) throw new NotFoundException('Project tidak ditemukan');
    return { data };
  }

  async create(dto: CreateProjectDto) {
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
            ...dto,
            nomor_project,
            tgl_mulai: dto.tgl_mulai ? new Date(dto.tgl_mulai) : undefined,
            tgl_target_selesai: dto.tgl_target_selesai ? new Date(dto.tgl_target_selesai) : undefined,
            updated_at: new Date(),
          },
          include: PROJECT_INCLUDE,
        });
        return { data, message: `Project ${nomor_project} dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async update(id: number, dto: UpdateProjectDto) {
    const existing = await this._check(id);
    const data = await this.prisma.projectDelivery.update({
      where: { id_project: id },
      data: {
        ...dto,
        tgl_mulai: dto.tgl_mulai ? new Date(dto.tgl_mulai) : undefined,
        tgl_target_selesai: dto.tgl_target_selesai ? new Date(dto.tgl_target_selesai) : undefined,
        tgl_actual_selesai: dto.tgl_actual_selesai ? new Date(dto.tgl_actual_selesai) : undefined,
        updated_at: new Date(),
      },
      include: PROJECT_INCLUDE,
    });

    // Saat project baru saja berubah ke Selesai, aktifkan site terkait
    if (dto.status_project === 'Selesai' && existing.status_project !== 'Selesai') {
      await this.prisma.sitePelanggan.update({
        where: { id_site: existing.id_site },
        data: { status_site: 'Aktif' },
      });
    }

    return { data, message: 'Project diperbarui' };
  }

  private async _check(id: number) {
    const row = await this.prisma.projectDelivery.findUnique({ where: { id_project: id } });
    if (!row) throw new NotFoundException('Project tidak ditemukan');
    return row;
  }

  // ─── WORK ORDER ───────────────────────────────────────────────

  async createWo(dto: CreateWoDto) {
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
          data: { ...dto, nomor_wo, fee_vendor: dto.fee_vendor ?? 0, tgl_jadwal: new Date(dto.tgl_jadwal) },
          include: WO_INCLUDE,
        });
        return { data, message: `Work Order ${nomor_wo} dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async updateWo(id: number, dto: UpdateWoDto) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id_wo: id } });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    const data = await this.prisma.workOrder.update({
      where: { id_wo: id },
      data: {
        ...dto,
        tgl_jadwal: dto.tgl_jadwal ? new Date(dto.tgl_jadwal) : undefined,
        completed_at: dto.status_wo === 'Selesai' ? new Date() : undefined,
      },
      include: WO_INCLUDE,
    });
    return { data, message: 'Work Order diperbarui' };
  }

  async removeWo(id: number) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id_wo: id },
      include: { _count: { select: { berita_acara: true, foto: true } } },
    });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    if (!['Open', 'Dibatalkan'].includes(wo.status_wo))
      throw new BadRequestException('Hanya WO berstatus Open atau Dibatalkan yang bisa dihapus');
    if ((wo as any)._count.berita_acara > 0)
      throw new BadRequestException('WO sudah punya Berita Acara, tidak bisa dihapus');
    await this.prisma.workOrder.delete({ where: { id_wo: id } });
    return { message: `Work Order ${wo.nomor_wo} dihapus` };
  }

  // ─── BAST ─────────────────────────────────────────────────────

  async findAllBast(query: { id_project?: string }) {
    const where: any = {};
    if (query.id_project) where.id_project = Number(query.id_project);
    const data = await this.prisma.projectDokumenLegal.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        project: {
          select: {
            nomor_project: true,
            site: { select: { nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
          },
        },
      },
    });
    return { data };
  }

  async findOneBast(id: number) {
    const data = await this.prisma.projectDokumenLegal.findUnique({
      where: { id_dokumen: id },
      include: {
        project: {
          select: {
            nomor_project: true,
            site: { select: { nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
          },
        },
      },
    });
    if (!data) throw new NotFoundException('BAST tidak ditemukan');
    return { data };
  }

  async removeBast(id: number) {
    const bast = await this.prisma.projectDokumenLegal.findUnique({ where: { id_dokumen: id } });
    if (!bast) throw new NotFoundException('BAST tidak ditemukan');
    await this.prisma.projectDokumenLegal.delete({ where: { id_dokumen: id } });
    return { message: `BAST ${bast.nomor_bast} dihapus` };
  }

  async createBast(dto: CreateBastDto) {
    await this._check(dto.id_project);
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = new Date();
      const prefix = `BAST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const last = await this.prisma.projectDokumenLegal.findFirst({
        where: { nomor_bast: { startsWith: prefix } },
        orderBy: { nomor_bast: 'desc' },
      });
      const seq = (last ? (parseInt(last.nomor_bast.split('-')[2], 10) || 0) : 0) + 1;
      const nomor_bast = `${prefix}-${String(seq).padStart(4, '0')}`;
      try {
        const data = await this.prisma.projectDokumenLegal.create({
          data: { ...dto, nomor_bast, tgl_ditandatangani: dto.tgl_ditandatangani ? new Date(dto.tgl_ditandatangani) : undefined },
        });
        return { data, message: `BAST ${nomor_bast} dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async updateBast(id: number, dto: UpdateBastDto) {
    const bast = await this.prisma.projectDokumenLegal.findUnique({ where: { id_dokumen: id } });
    if (!bast) throw new NotFoundException('BAST tidak ditemukan');
    const data = await this.prisma.projectDokumenLegal.update({
      where: { id_dokumen: id },
      data: {
        ...dto,
        tgl_ditandatangani: dto.tgl_ditandatangani ? new Date(dto.tgl_ditandatangani) : undefined,
      },
    });
    return { data, message: 'BAST diperbarui' };
  }

  // ─── HELPERS ─────────────────────────────────────────────────

  async getPmList() {
    const data = await this.prisma.hrisKaryawan.findMany({
      where: {
        status_aktif: true,
        user: {
          is_aktif: true,
          user_roles: { some: { role: { nama_role: { in: ['Manager_Ops', 'Director', 'Admin', 'Teknisi'] } } } },
        },
      },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    return { data };
  }

  async getTeknisiList() {
    const data = await this.prisma.hrisKaryawan.findMany({
      where: {
        status_aktif: true,
        user: {
          is_aktif: true,
          user_roles: { some: { role: { nama_role: { in: ['Teknisi', 'Manager_Ops', 'Admin'] } } } },
        },
      },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    return { data };
  }

  async getSiteList(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { nama_site: { contains: search } },
        { kode_site: { contains: search } },
      ];
    }
    const data = await this.prisma.sitePelanggan.findMany({
      where,
      select: {
        id_site: true, kode_site: true, nama_site: true, kota: true,
        pelanggan: { select: { nama_pelanggan: true } },
        layanan: { select: { kode_layanan: true } },
      },
      orderBy: { nama_site: 'asc' },
      take: 50,
    });
    return { data };
  }

  async remove(id: number) {
    const row = await this.prisma.projectDelivery.findUnique({
      where: { id_project: id },
      include: { _count: { select: { work_orders: true, bast: true } } },
    });
    if (!row) throw new NotFoundException('Project tidak ditemukan');
    if (row.status_project !== 'Perencanaan')
      throw new BadRequestException('Hanya project berstatus Perencanaan yang bisa dihapus');
    if ((row as any)._count.work_orders > 0 || (row as any)._count.bast > 0)
      throw new BadRequestException('Project sudah memiliki WO atau BAST, tidak bisa dihapus');
    await this.prisma.projectDelivery.delete({ where: { id_project: id } });
    return { message: `Project ${row.nomor_project} dihapus` };
  }

  async getStatusSummary() {
    const statuses = ['Perencanaan', 'Instalasi', 'Testing', 'Selesai', 'Ditahan'];
    const rows = await this.prisma.projectDelivery.groupBy({
      by: ['status_project'],
      _count: { id_project: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.status_project, r._count.id_project]));
    const data = statuses.map((s) => ({ status: s, count: map[s] ?? 0 }));
    return { data };
  }
}
