import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAsetDto, UpdateAsetDto, CreateMutasiDto } from './dto/aset.dto';

const ASET_INCLUDE = {
  site: { select: { kode_site: true, nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
  gudang: { select: { id_gudang: true, kode_gudang: true, nama_gudang: true, kota: true } },
  _count: { select: { mutasi: true } },
};

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  // ─── ASET ────────────────────────────────────────────────────

  async findAll(query: {
    search?: string; kategori?: string; kondisi?: string;
    status_aset?: string; id_gudang?: string; page?: number; limit?: number;
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
    if (query.id_gudang) where.id_gudang = Number(query.id_gudang);

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
    if (dto.serial_number) {
      const dup = await this.prisma.gudangAset.findUnique({ where: { serial_number: dto.serial_number } });
      if (dup) throw new ConflictException('Serial number sudah terdaftar');
    }

    // Gudang wajib jelas — default ke gudang aktif pertama bila tidak dipilih
    let id_gudang = dto.id_gudang;
    if (id_gudang) {
      const g = await this.prisma.masterGudang.findUnique({ where: { id_gudang } });
      if (!g) throw new NotFoundException('Gudang tidak ditemukan');
    } else {
      const g = await this.prisma.masterGudang.findFirst({ where: { is_aktif: true }, orderBy: { id_gudang: 'asc' } });
      id_gudang = g?.id_gudang;
    }

    // Auto kode AST-YYYYMM-XXXX — retry 5x saat tabrakan, transaksional dgn log Masuk
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = new Date();
      const prefix = `AST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const last = await this.prisma.gudangAset.findFirst({
        where: { kode_aset: { startsWith: prefix } },
        orderBy: { kode_aset: 'desc' },
      });
      const seq = last ? (parseInt(last.kode_aset.split('-')[2], 10) || 0) + 1 : 1;
      const kode_aset = `${prefix}-${String(seq).padStart(4, '0')}`;

      try {
        const data = await this.prisma.$transaction(async (tx) => {
          const created = await tx.gudangAset.create({
            data: {
              ...dto,
              id_gudang,
              kode_aset,
              stok_jumlah: dto.stok_jumlah ?? 1,
              is_serialized: dto.is_serialized ?? true,
              kondisi: dto.kondisi || 'Baru',
              harga_perolehan: dto.harga_perolehan ?? 0,
              tgl_perolehan: dto.tgl_perolehan ? new Date(dto.tgl_perolehan) : undefined,
            },
            include: ASET_INCLUDE,
          });
          await tx.gudangMutasiAset.create({
            data: {
              id_aset: created.id_aset,
              jenis_mutasi: 'Masuk',
              jumlah: created.stok_jumlah,
              keterangan: 'Aset baru ditambahkan ke gudang',
              id_user: userId || null,
            },
          });
          return created;
        });
        return { data, message: `Aset ${kode_aset} berhasil ditambahkan` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async remove(id: number) {
    const row = await this.prisma.gudangAset.findUnique({
      where: { id_aset: id },
      include: { _count: { select: { mutasi: true } } },
    });
    if (!row) throw new NotFoundException('Aset tidak ditemukan');
    if (row.status_aset !== 'Di_Gudang')
      throw new BadRequestException('Hanya aset berstatus Di_Gudang yang bisa dihapus');
    if ((row as any)._count.mutasi > 1)
      throw new BadRequestException('Aset sudah memiliki riwayat mutasi, tidak bisa dihapus');
    await this.prisma.gudangAset.delete({ where: { id_aset: id } });
    return { message: `Aset ${row.kode_aset} dihapus` };
  }

  async update(id: number, dto: UpdateAsetDto) {
    const row = await this.prisma.gudangAset.findUnique({ where: { id_aset: id } });
    if (!row) throw new NotFoundException('Aset tidak ditemukan');
    // status_aset & id_site TIDAK boleh diubah lewat edit — wajib lewat mutasi
    // (agar log gudang & sinkron PerangkatSite tidak bisa dilompati)
    const { status_aset: _s, id_site: _i, id_gudang: _g, ...aman } = dto as any;
    if (aman.serial_number && aman.serial_number !== row.serial_number) {
      const dup = await this.prisma.gudangAset.findUnique({ where: { serial_number: aman.serial_number } });
      if (dup) throw new ConflictException('Serial number sudah terdaftar');
    }
    const data = await this.prisma.gudangAset.update({
      where: { id_aset: id },
      data: aman,
      include: ASET_INCLUDE,
    });
    return { data, message: 'Aset diperbarui' };
  }

  async createMutasi(dto: CreateMutasiDto, userId?: number) {
    const mutasi = await this.prisma.$transaction((tx) => this.applyMutasiTx(tx, dto, userId));
    return { data: mutasi, message: 'Mutasi aset dicatat' };
  }

  // Logika inti mutasi — dipakai createMutasi & modul lain (mis. material BA)
  // di dalam transaksi masing-masing, supaya aturan stok/status satu pintu.
  async applyMutasiTx(tx: any, dto: CreateMutasiDto, userId?: number) {
    if (dto.jenis_mutasi === 'Deploy' && !dto.id_site_tujuan) {
      throw new BadRequestException('id_site_tujuan wajib diisi untuk mutasi Deploy');
    }
      const aset = await tx.gudangAset.findUnique({ where: { id_aset: dto.id_aset } });
      if (!aset) throw new NotFoundException('Aset tidak ditemukan');

      const jumlah = dto.jumlah ?? 1;
      if (jumlah < 1) throw new BadRequestException('Jumlah minimal 1');

      let newStatus = aset.status_aset;
      let newStok = aset.stok_jumlah;
      let newSite: number | null | undefined = undefined;   // undefined = tidak diubah
      let newGudang: number | undefined = undefined;        // undefined = tidak diubah

      // Transfer antar gudang: validasi tujuan di depan (berlaku serial & stok)
      if (dto.jenis_mutasi === 'Transfer') {
        if (!dto.id_gudang_tujuan)
          throw new BadRequestException('id_gudang_tujuan wajib diisi untuk Transfer antar gudang');
        if (dto.id_gudang_tujuan === aset.id_gudang)
          throw new BadRequestException('Gudang tujuan sama dengan gudang asal');
        const gTujuan = await tx.masterGudang.findUnique({ where: { id_gudang: dto.id_gudang_tujuan } });
        if (!gTujuan || !gTujuan.is_aktif)
          throw new BadRequestException('Gudang tujuan tidak ditemukan / nonaktif');
      }

      // ── STATE MACHINE ────────────────────────────────────────
      // Serialized (1 unit ber-serial): status yang berpindah.
      // Non-serialized (stok): jumlah stok yang berpindah, status tetap Di_Gudang.

      if (aset.is_serialized) {
        switch (dto.jenis_mutasi) {
          case 'Deploy':
            if (aset.status_aset !== 'Di_Gudang')
              throw new BadRequestException(`Aset berstatus ${aset.status_aset} — hanya aset Di_Gudang yang bisa di-Deploy`);
            newStatus = 'Terpasang';
            newSite = dto.id_site_tujuan!;
            break;
          case 'Return':
            if (!['Terpasang', 'Dipinjam'].includes(aset.status_aset))
              throw new BadRequestException(`Aset berstatus ${aset.status_aset} — tidak ada yang bisa di-Return`);
            newStatus = 'Di_Gudang';
            newSite = null;
            if (dto.id_gudang_tujuan) newGudang = dto.id_gudang_tujuan; // kembali ke gudang tertentu
            break;
          case 'Transfer':
            if (aset.status_aset !== 'Di_Gudang')
              throw new BadRequestException(`Aset berstatus ${aset.status_aset} — hanya aset Di_Gudang yang bisa ditransfer antar gudang`);
            newGudang = dto.id_gudang_tujuan!;
            break;
          case 'Pinjam':
            if (aset.status_aset !== 'Di_Gudang')
              throw new BadRequestException(`Aset berstatus ${aset.status_aset} — hanya aset Di_Gudang yang bisa dipinjam`);
            newStatus = 'Dipinjam';
            break;
          case 'Rusak':
          case 'Disposed':
            if (aset.status_aset === 'Disposed')
              throw new BadRequestException('Aset sudah Disposed');
            newStatus = dto.jenis_mutasi;
            newSite = null;
            break;
          case 'Masuk':
            throw new BadRequestException('Aset ber-serial tidak bisa mutasi Masuk — tambahkan sebagai aset baru');
          case 'Keluar':
            throw new BadRequestException('Aset ber-serial pakai Deploy/Pinjam/Disposed, bukan Keluar');
          default:
            throw new BadRequestException(`Jenis mutasi ${dto.jenis_mutasi} tidak dikenal`);
        }
      } else {
        // Non-serialized: validasi stok, status tidak berubah
        switch (dto.jenis_mutasi) {
          case 'Deploy':
          case 'Keluar':
          case 'Rusak':
          case 'Disposed':
            if (jumlah > aset.stok_jumlah)
              throw new BadRequestException(`Stok tidak cukup: tersisa ${aset.stok_jumlah}, diminta ${jumlah}`);
            newStok = aset.stok_jumlah - jumlah;
            break;
          case 'Masuk':
          case 'Return':
            newStok = aset.stok_jumlah + jumlah;
            break;
          case 'Transfer': {
            if (jumlah > aset.stok_jumlah)
              throw new BadRequestException(`Stok tidak cukup: tersisa ${aset.stok_jumlah}, diminta ${jumlah}`);
            newStok = aset.stok_jumlah - jumlah;
            // Cari record barang yang sama di gudang tujuan → tambah stoknya;
            // kalau belum ada, buatkan record baru di sana.
            const kembar = await tx.gudangAset.findFirst({
              where: {
                id_gudang: dto.id_gudang_tujuan!,
                is_serialized: false,
                nama_perangkat: aset.nama_perangkat,
                merk: aset.merk,
                tipe_model: aset.tipe_model,
                kategori: aset.kategori,
              },
            });
            if (kembar) {
              await tx.gudangAset.update({
                where: { id_aset: kembar.id_aset },
                data: { stok_jumlah: kembar.stok_jumlah + jumlah, status_aset: 'Di_Gudang' },
              });
            } else {
              const now = new Date();
              const prefix = `AST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
              const lastKode = await tx.gudangAset.findFirst({
                where: { kode_aset: { startsWith: prefix } },
                orderBy: { kode_aset: 'desc' },
              });
              const seq = lastKode ? (parseInt(lastKode.kode_aset.split('-')[2], 10) || 0) + 1 : 1;
              await tx.gudangAset.create({
                data: {
                  kode_aset: `${prefix}-${String(seq).padStart(4, '0')}`,
                  nama_perangkat: aset.nama_perangkat,
                  merk: aset.merk,
                  tipe_model: aset.tipe_model,
                  kategori: aset.kategori,
                  kondisi: aset.kondisi,
                  is_serialized: false,
                  stok_jumlah: jumlah,
                  status_aset: 'Di_Gudang',
                  id_gudang: dto.id_gudang_tujuan!,
                  harga_perolehan: aset.harga_perolehan,
                  catatan: `Transfer dari ${aset.kode_aset}`,
                },
              });
            }
            break;
          }
          case 'Pinjam':
            throw new BadRequestException('Barang stok tidak bisa dipinjam per-unit — gunakan Keluar/Masuk');
          default:
            throw new BadRequestException(`Jenis mutasi ${dto.jenis_mutasi} tidak dikenal`);
        }
      }

      await tx.gudangAset.update({
        where: { id_aset: dto.id_aset },
        data: {
          status_aset: newStatus,
          stok_jumlah: newStok,
          ...(newSite !== undefined ? { id_site: newSite } : {}),
          ...(newGudang !== undefined ? { id_gudang: newGudang } : {}),
        },
      });

      // ── SINKRON PERANGKAT SITE (hanya aset ber-serial) ────────
      if (aset.is_serialized) {
        if (dto.jenis_mutasi === 'Deploy') {
          // Nonaktifkan sisa row Aktif lama dulu (cegah perangkat hantu saat re-deploy)
          await tx.perangkatSite.updateMany({
            where: { id_aset: dto.id_aset, status_perangkat: 'Aktif' },
            data: { status_perangkat: 'Nonaktif' },
          });
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
        } else if (['Return', 'Rusak', 'Disposed'].includes(dto.jenis_mutasi)) {
          // Nonaktifkan SEMUA row Aktif aset ini di site manapun (fix perangkat hantu)
          await tx.perangkatSite.updateMany({
            where: { id_aset: dto.id_aset, status_perangkat: 'Aktif' },
            data: { status_perangkat: 'Nonaktif' },
          });
        }
      }

      return tx.gudangMutasiAset.create({
        data: {
          ...dto,
          jumlah,
          id_gudang_asal: dto.id_gudang_asal ?? aset.id_gudang,
          id_user: userId || null,
        },
        include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
      });
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
    const [rows, gudangRows] = await Promise.all([
      this.prisma.gudangAset.groupBy({
        by: ['status_aset'],
        _count: { id_aset: true },
      }),
      // Stok per gudang (hanya yang masih di gudang)
      this.prisma.masterGudang.findMany({
        where: { is_aktif: true },
        select: {
          id_gudang: true, kode_gudang: true, nama_gudang: true, kota: true,
          _count: { select: { aset: { where: { status_aset: 'Di_Gudang' } } } },
        },
        orderBy: { nama_gudang: 'asc' },
      }),
    ]);
    const map = Object.fromEntries(rows.map((r) => [r.status_aset, r._count.id_aset]));
    const data = statuses.map((s) => ({ status: s, count: map[s] ?? 0 }));
    const by_gudang = gudangRows.map((g) => ({
      id_gudang: g.id_gudang, kode_gudang: g.kode_gudang,
      nama_gudang: g.nama_gudang, kota: g.kota,
      count: (g as any)._count.aset,
    }));
    return { data: { by_status: data, by_gudang } };
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

  async removeTopup(id: number) {
    const row = await this.prisma.simTopup.findUnique({ where: { id_topup: id } });
    if (!row) throw new NotFoundException('Topup tidak ditemukan');
    await this.prisma.simTopup.delete({ where: { id_topup: id } });
    return { message: 'Topup dihapus' };
  }
}
