import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLayananDto, UpdateLayananDto } from './dto/layanan.dto';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';

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
}
