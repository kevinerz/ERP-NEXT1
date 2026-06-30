import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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
    const limit = Math.min(Number(query.limit) || 20, 200);
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
        sumber_internet: {
          select: {
            id_sumber: true,
            nomor_pelanggan_isp: true,
            site: { select: { kode_site: true, nama_site: true } },
            vendor: { select: { nama_vendor: true } },
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
    const seq = last ? (parseInt(last.kode_aset.split('-')[2], 10) || 0) + 1 : 1;
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
    // Fix 2: id_site_tujuan wajib untuk Deploy
    if (dto.jenis_mutasi === 'Deploy' && !dto.id_site_tujuan) {
      throw new BadRequestException('id_site_tujuan wajib diisi untuk mutasi Deploy');
    }

    const mutasi = await this.prisma.$transaction(async (tx) => {
      const aset = await tx.gudangAset.findUnique({ where: { id_aset: dto.id_aset } });
      if (!aset) throw new NotFoundException('Aset tidak ditemukan');

      const jumlah = dto.jumlah ?? 1;
      let newStatus = aset.status_aset;
      let newStok = aset.stok_jumlah;

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

      await tx.gudangAset.update({
        where: { id_aset: dto.id_aset },
        data: {
          status_aset: newStatus,
          stok_jumlah: newStok,
          id_site: dto.id_site_tujuan ?? (dto.jenis_mutasi === 'Return' ? null : aset.id_site),
        },
      });

      // Fix 1: Sync Deploy/Return dengan PerangkatSite
      if (dto.jenis_mutasi === 'Deploy') {
        await tx.perangkatSite.create({
          data: {
            id_site: dto.id_site_tujuan!,
            id_aset: dto.id_aset,
            jenis_perangkat: aset.kategori || 'Perangkat',
            merk: aset.merk || '',
            tipe_model: aset.tipe_model || '',
            serial_number: aset.serial_number || '',
            status_perangkat: 'Aktif',
            tgl_pasang: new Date(),
          },
        });
      } else if (dto.jenis_mutasi === 'Return' && aset.id_site) {
        await tx.perangkatSite.updateMany({
          where: { id_aset: dto.id_aset, id_site: aset.id_site, status_perangkat: 'Aktif' },
          data: { status_perangkat: 'Nonaktif' },
        });
      }

      return tx.gudangMutasiAset.create({
        data: { ...dto, jumlah, id_user: userId || null },
        include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
      });
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

  // ─── SIM TOPUP ────────────────────────────────────────────────

  /** Daftar SIM: dari SumberInternetSite khusus mobile operator */
  async getSimCards(query: { search?: string; id_site?: string }) {
    const where: any = {
      vendor: { tipe_vendor: 'Mobile_Operator' },
    };
    if (query.id_site) where.id_site = Number(query.id_site);
    if (query.search) {
      where.AND = [
        {
          OR: [
            { nomor_pelanggan_isp: { contains: query.search } },
            { site: { nama_site: { contains: query.search } } },
            { vendor: { nama_vendor: { contains: query.search } } },
          ],
        },
      ];
    }

    const data = await this.prisma.sumberInternetSite.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        site: { select: { id_site: true, kode_site: true, nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
        vendor: { select: { id_vendor: true, nama_vendor: true, tipe_vendor: true } },
        aset_sim: { select: { kode_aset: true, serial_number: true } },
        _count: { select: { topup: true } },
      },
    });
    return { data };
  }

  async findAllTopup(query: {
    id_sumber?: string; id_site?: string;
    tgl_dari?: string; tgl_sampai?: string;
    page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 25, 200);
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.id_sumber) where.id_sumber = Number(query.id_sumber);
    if (query.id_site) where.id_site = Number(query.id_site);
    if (query.tgl_dari || query.tgl_sampai) {
      where.tgl_topup = {};
      if (query.tgl_dari) where.tgl_topup.gte = new Date(query.tgl_dari);
      if (query.tgl_sampai) where.tgl_topup.lte = new Date(query.tgl_sampai + 'T23:59:59');
    }

    const [data, total, agg] = await Promise.all([
      this.prisma.simTopup.findMany({
        where, skip, take: limit,
        orderBy: { tgl_topup: 'desc' },
        include: {
          sumber: { include: { vendor: { select: { nama_vendor: true } } } },
          site: { select: { kode_site: true, nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
          user: { include: { karyawan: { select: { nama_lengkap: true } } } },
        },
      }),
      this.prisma.simTopup.count({ where }),
      this.prisma.simTopup.aggregate({ _sum: { nominal: true }, where }),
    ]);

    return {
      data,
      meta: {
        total, page, limit,
        total_pages: Math.ceil(total / limit),
        total_nominal: Number(agg._sum.nominal) || 0,
      },
    };
  }

  async createTopup(dto: {
    id_sumber: number; jenis_topup: string;
    nominal: number; tgl_topup: string; keterangan?: string;
  }, userId?: number) {
    const sumber = await this.prisma.sumberInternetSite.findUnique({
      where: { id_sumber: dto.id_sumber },
      select: { id_site: true, id_aset_sim: true },
    });
    if (!sumber) throw new NotFoundException('Sumber internet tidak ditemukan');

    const data = await this.prisma.simTopup.create({
      data: {
        id_sumber: dto.id_sumber,
        id_aset_sim: sumber.id_aset_sim ?? undefined,
        id_site: sumber.id_site,
        jenis_topup: dto.jenis_topup,
        nominal: dto.nominal,
        tgl_topup: new Date(dto.tgl_topup),
        keterangan: dto.keterangan,
        id_user: userId || null,
      },
      include: {
        sumber: { include: { vendor: { select: { nama_vendor: true } } } },
        site: { select: { kode_site: true, nama_site: true } },
        user: { include: { karyawan: { select: { nama_lengkap: true } } } },
      },
    });

    return { data, message: 'Topup berhasil dicatat' };
  }
}
