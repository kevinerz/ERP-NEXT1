import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAsetDto, UpdateAsetDto, CreateMutasiDto } from './dto/aset.dto';

const ASET_INCLUDE = {
  site: { select: { kode_site: true, nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
  _count: { select: { mutasi: true } },
};

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  // ─── ASET ────────────────────────────────────────────────────

  async findAll(query: {
    search?: string; kategori?: string; kondisi?: string;
    status_aset?: string; page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.search) {
      where.OR = [
        { kode_aset: { contains: query.search } },
        { nama_perangkat: { contains: query.search } },
        { serial_number: { contains: query.search } },
        { merk: { contains: query.search } },
      ];
    }
    if (query.kategori) where.kategori = query.kategori;
    if (query.kondisi) where.kondisi = query.kondisi;
    if (query.status_aset) where.status_aset = query.status_aset;

    const [data, total] = await Promise.all([
      this.prisma.gudangAset.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: ASET_INCLUDE,
      }),
      this.prisma.gudangAset.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const data = await this.prisma.gudangAset.findUnique({
      where: { id_aset: id },
      include: {
        ...ASET_INCLUDE,
        mutasi: {
          orderBy: { created_at: 'desc' },
          take: 20,
          include: {
            user: { include: { karyawan: { select: { nama_lengkap: true } } } },
          },
        },
      },
    });
    if (!data) throw new NotFoundException('Aset tidak ditemukan');
    return { data };
  }

  async create(dto: CreateAsetDto, userId?: number) {
    // Auto kode: AST-YYYYMM-XXXX
    const now = new Date();
    const prefix = `AST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const last = await this.prisma.gudangAset.findFirst({
      where: { kode_aset: { startsWith: prefix } },
      orderBy: { kode_aset: 'desc' },
    });
    const seq = last ? parseInt(last.kode_aset.split('-')[2]) + 1 : 1;
    const kode_aset = `${prefix}-${String(seq).padStart(4, '0')}`;

    if (dto.serial_number) {
      const dup = await this.prisma.gudangAset.findUnique({ where: { serial_number: dto.serial_number } });
      if (dup) throw new ConflictException('Serial number sudah terdaftar');
    }

    const data = await this.prisma.gudangAset.create({
      data: {
        ...dto,
        kode_aset,
        stok_jumlah: dto.stok_jumlah ?? 1,
        is_serialized: dto.is_serialized ?? true,
        kondisi: dto.kondisi || 'Baru',
        harga_perolehan: dto.harga_perolehan ?? 0,
        tgl_perolehan: dto.tgl_perolehan ? new Date(dto.tgl_perolehan) : undefined,
      },
      include: ASET_INCLUDE,
    });

    // Log masuk awal
    await this.prisma.gudangMutasiAset.create({
      data: {
        id_aset: data.id_aset,
        jenis_mutasi: 'Masuk',
        jumlah: data.stok_jumlah,
        keterangan: 'Aset baru ditambahkan ke gudang',
        id_user: userId || null,
      },
    });

    return { data, message: `Aset ${kode_aset} berhasil ditambahkan` };
  }

  async update(id: number, dto: UpdateAsetDto) {
    const row = await this.prisma.gudangAset.findUnique({ where: { id_aset: id } });
    if (!row) throw new NotFoundException('Aset tidak ditemukan');
    const data = await this.prisma.gudangAset.update({
      where: { id_aset: id },
      data: dto,
      include: ASET_INCLUDE,
    });
    return { data, message: 'Aset diperbarui' };
  }

  async createMutasi(dto: CreateMutasiDto, userId?: number) {
    const aset = await this.prisma.gudangAset.findUnique({ where: { id_aset: dto.id_aset } });
    if (!aset) throw new NotFoundException('Aset tidak ditemukan');

    const jumlah = dto.jumlah ?? 1;
    let newStatus = aset.status_aset;
    let newStok = aset.stok_jumlah;

    // Update status & stok berdasarkan jenis mutasi
    if (dto.jenis_mutasi === 'Deploy' || dto.jenis_mutasi === 'Keluar') {
      newStatus = dto.jenis_mutasi === 'Deploy' ? 'Terpasang' : aset.status_aset;
      newStok = Math.max(0, aset.stok_jumlah - jumlah);
    } else if (dto.jenis_mutasi === 'Return' || dto.jenis_mutasi === 'Masuk') {
      newStatus = 'Di_Gudang';
      newStok = aset.stok_jumlah + jumlah;
    } else if (dto.jenis_mutasi === 'Pinjam') {
      newStatus = 'Dipinjam';
    } else if (dto.jenis_mutasi === 'Rusak') {
      newStatus = 'Rusak';
    } else if (dto.jenis_mutasi === 'Disposed') {
      newStatus = 'Disposed';
    }

    await this.prisma.gudangAset.update({
      where: { id_aset: dto.id_aset },
      data: {
        status_aset: newStatus,
        stok_jumlah: newStok,
        id_site: dto.id_site_tujuan ?? (dto.jenis_mutasi === 'Return' ? null : aset.id_site),
      },
    });

    const mutasi = await this.prisma.gudangMutasiAset.create({
      data: { ...dto, jumlah, id_user: userId || null },
      include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
    });

    return { data: mutasi, message: 'Mutasi aset dicatat' };
  }

  // ─── HELPERS ──────────────────────────────────────────────────

  async getKategoriList() {
    const rows = await this.prisma.gudangAset.findMany({
      select: { kategori: true },
      distinct: ['kategori'],
      orderBy: { kategori: 'asc' },
    });
    return { data: rows.map((r) => r.kategori) };
  }

  async getSummary() {
    const statuses = ['Di_Gudang', 'Terpasang', 'Dipinjam', 'Rusak', 'Disposed'];
    const rows = await this.prisma.gudangAset.groupBy({
      by: ['status_aset'],
      _count: { id_aset: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.status_aset, r._count.id_aset]));
    const data = statuses.map((s) => ({ status: s, count: map[s] ?? 0 }));
    return { data };
  }
}
