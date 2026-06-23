import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLayananDto, UpdateLayananDto } from './dto/layanan.dto';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';
import { CreatePelangganDto, UpdatePelangganDto } from './dto/pelanggan.dto';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';

@Injectable()
export class MasterService {
  constructor(private prisma: PrismaService) {}

  // ─── LAYANAN ────────────────────────────────────────────────

  async findAllLayanan(query: { search?: string; is_aktif?: string }) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { nama_layanan: { contains: query.search } },
        { kode_layanan: { contains: query.search } },
      ];
    }
    if (query.is_aktif !== undefined) {
      where.is_aktif = query.is_aktif === 'true';
    }
    const data = await this.prisma.masterLayanan.findMany({
      where,
      orderBy: { kode_layanan: 'asc' },
    });
    return { data };
  }

  async findOneLayanan(id: number) {
    const data = await this.prisma.masterLayanan.findUnique({
      where: { id_layanan: id },
    });
    if (!data) throw new NotFoundException('Layanan tidak ditemukan');
    return { data };
  }

  async createLayanan(dto: CreateLayananDto) {
    const exists = await this.prisma.masterLayanan.findUnique({
      where: { kode_layanan: dto.kode_layanan },
    });
    if (exists) throw new ConflictException('Kode layanan sudah digunakan');
    const data = await this.prisma.masterLayanan.create({ data: dto });
    return { data, message: 'Layanan berhasil dibuat' };
  }

  async updateLayanan(id: number, dto: UpdateLayananDto) {
    await this.findOneLayanan(id);
    const data = await this.prisma.masterLayanan.update({
      where: { id_layanan: id },
      data: dto,
    });
    return { data, message: 'Layanan berhasil diperbarui' };
  }

  async toggleLayanan(id: number) {
    const layanan = await this.prisma.masterLayanan.findUnique({
      where: { id_layanan: id },
    });
    if (!layanan) throw new NotFoundException('Layanan tidak ditemukan');
    const data = await this.prisma.masterLayanan.update({
      where: { id_layanan: id },
      data: { is_aktif: !layanan.is_aktif },
    });
    return { data, message: `Layanan ${data.is_aktif ? 'diaktifkan' : 'dinonaktifkan'}` };
  }

  // ─── VENDOR ISP ─────────────────────────────────────────────

  async findAllVendor(query: {
    search?: string;
    tipe_vendor?: string;
    is_aktif?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.search) {
      where.OR = [
        { nama_vendor: { contains: query.search } },
        { kontak_pic: { contains: query.search } },
      ];
    }
    if (query.tipe_vendor) where.tipe_vendor = query.tipe_vendor;
    if (query.is_aktif !== undefined) {
      where.is_aktif = query.is_aktif === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.masterVendorIsp.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nama_vendor: 'asc' },
      }),
      this.prisma.masterVendorIsp.count({ where }),
    ]);

    const total_pages = Math.ceil(total / limit);
    return { data, meta: { total, page, limit, total_pages } };
  }

  async findOneVendor(id: number) {
    const data = await this.prisma.masterVendorIsp.findUnique({
      where: { id_vendor: id },
    });
    if (!data) throw new NotFoundException('Vendor tidak ditemukan');
    return { data };
  }

  async createVendor(dto: CreateVendorDto) {
    const exists = await this.prisma.masterVendorIsp.findFirst({
      where: { nama_vendor: dto.nama_vendor },
    });
    if (exists) throw new ConflictException('Nama vendor sudah terdaftar');
    const data = await this.prisma.masterVendorIsp.create({ data: dto });
    return { data, message: 'Vendor berhasil ditambahkan' };
  }

  async updateVendor(id: number, dto: UpdateVendorDto) {
    await this.findOneVendor(id);
    if (dto.nama_vendor) {
      const dup = await this.prisma.masterVendorIsp.findFirst({
        where: { nama_vendor: dto.nama_vendor, NOT: { id_vendor: id } },
      });
      if (dup) throw new ConflictException('Nama vendor sudah digunakan');
    }
    const data = await this.prisma.masterVendorIsp.update({
      where: { id_vendor: id },
      data: dto,
    });
    return { data, message: 'Vendor berhasil diperbarui' };
  }

  async toggleVendor(id: number) {
    const vendor = await this.prisma.masterVendorIsp.findUnique({
      where: { id_vendor: id },
    });
    if (!vendor) throw new NotFoundException('Vendor tidak ditemukan');
    const data = await this.prisma.masterVendorIsp.update({
      where: { id_vendor: id },
      data: { is_aktif: !vendor.is_aktif },
    });
    return { data, message: `Vendor ${data.is_aktif ? 'diaktifkan' : 'dinonaktifkan'}` };
  }

  async getTipeVendorList() {
    const rows = await this.prisma.masterVendorIsp.findMany({
      select: { tipe_vendor: true },
      distinct: ['tipe_vendor'],
      orderBy: { tipe_vendor: 'asc' },
    });
    return { data: rows.map((r) => r.tipe_vendor) };
  }

  // ─── PELANGGAN ───────────────────────────────────────────────

  async findAllPelanggan(query: { search?: string; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.search) {
      where.OR = [
        { nama_pelanggan: { contains: query.search } },
        { kode_pelanggan: { contains: query.search } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.pelanggan.findMany({
        where, skip, take: limit,
        orderBy: { nama_pelanggan: 'asc' },
        include: { _count: { select: { sites: true } } },
      }),
      this.prisma.pelanggan.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async createPelanggan(dto: CreatePelangganDto) {
    const exists = await this.prisma.pelanggan.findUnique({ where: { kode_pelanggan: dto.kode_pelanggan } });
    if (exists) throw new ConflictException('Kode pelanggan sudah digunakan');
    const data = await this.prisma.pelanggan.create({ data: dto });
    return { data, message: 'Pelanggan berhasil ditambahkan' };
  }

  async updatePelanggan(id: number, dto: UpdatePelangganDto) {
    const row = await this.prisma.pelanggan.findUnique({ where: { id_pelanggan: id } });
    if (!row) throw new NotFoundException('Pelanggan tidak ditemukan');
    const data = await this.prisma.pelanggan.update({ where: { id_pelanggan: id }, data: dto });
    return { data, message: 'Pelanggan diperbarui' };
  }

  // ─── SITE PELANGGAN ──────────────────────────────────────────

  async findAllSite(query: { search?: string; id_pelanggan?: string; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.search) {
      where.OR = [
        { nama_site: { contains: query.search } },
        { kode_site: { contains: query.search } },
        { kota: { contains: query.search } },
      ];
    }
    if (query.id_pelanggan) where.id_pelanggan = Number(query.id_pelanggan);
    const [data, total] = await Promise.all([
      this.prisma.sitePelanggan.findMany({
        where, skip, take: limit,
        orderBy: { nama_site: 'asc' },
        include: {
          pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true } },
          layanan: { select: { kode_layanan: true, nama_layanan: true } },
        },
      }),
      this.prisma.sitePelanggan.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async createSite(dto: CreateSiteDto) {
    const exists = await this.prisma.sitePelanggan.findUnique({ where: { kode_site: dto.kode_site } });
    if (exists) throw new ConflictException('Kode site sudah digunakan');
    const data = await this.prisma.sitePelanggan.create({
      data: {
        ...dto,
        tgl_aktif: dto.tgl_aktif ? new Date(dto.tgl_aktif) : undefined,
        updated_at: new Date(),
      },
      include: {
        pelanggan: { select: { nama_pelanggan: true } },
        layanan: { select: { kode_layanan: true, nama_layanan: true } },
      },
    });
    return { data, message: 'Site berhasil ditambahkan' };
  }

  async updateSite(id: number, dto: UpdateSiteDto) {
    const row = await this.prisma.sitePelanggan.findUnique({ where: { id_site: id } });
    if (!row) throw new NotFoundException('Site tidak ditemukan');
    const data = await this.prisma.sitePelanggan.update({
      where: { id_site: id },
      data: {
        ...dto,
        tgl_aktif: dto.tgl_aktif ? new Date(dto.tgl_aktif) : undefined,
        tgl_terminasi: dto.tgl_terminasi ? new Date(dto.tgl_terminasi) : undefined,
        updated_at: new Date(),
      },
    });
    return { data, message: 'Site diperbarui' };
  }

  async getPelangganDropdown() {
    const data = await this.prisma.pelanggan.findMany({
      select: { id_pelanggan: true, kode_pelanggan: true, nama_pelanggan: true },
      orderBy: { nama_pelanggan: 'asc' },
    });
    return { data };
  }
}
