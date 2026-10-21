import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentNumberService } from '../../common/document-number/document-number.service';
import { UPLOAD_ROOT, imageExtOrThrow } from '../../common/upload/upload-root';
import {
  CreateInstalasiDto,
  UpdateInstalasiDto,
  AddInstalasiLogDto,
  SaveBASTDto,
} from './dto/instalasi.dto';

const INSTALASI_INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true, kota: true,
      pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true } },
    },
  },
  layanan: { select: { id_layanan: true, nama_layanan: true, kode_layanan: true } },
  teknisi_internal: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
  kontak_teknisi: { select: { id_kontak: true, nama: true, no_hp: true, asal_vendor: true } },
  _count: { select: { photos: true, logs: true } },
};

const INSTALASI_DETAIL_INCLUDE = {
  ...INSTALASI_INCLUDE,
  photos: { orderBy: { created_at: 'asc' as const } },
  logs: { orderBy: { created_at: 'desc' as const } },
  bast: true,
};

// Alur status (lihat schema InstalasiOrder.status_instalasi):
// Draft → Dijadwalkan → Dalam_Proses → Selesai; Dibatalkan dari status non-final.
// Mundur satu langkah diizinkan; Selesai final; Dibatalkan bisa dibuka lagi ke Draft.
const INSTALASI_TRANSISI = {
  Draft: ['Dijadwalkan', 'Dibatalkan'],
  Dijadwalkan: ['Dalam_Proses', 'Draft', 'Dibatalkan'],
  Dalam_Proses: ['Selesai', 'Dijadwalkan', 'Dibatalkan'],
  Selesai: [],
  Dibatalkan: ['Draft'],
} as const;

@Injectable()
export class InstalasiService {
  constructor(
    private prisma: PrismaService,
    private docNumber: DocumentNumberService,
  ) {}

  // ── CRUD ORDER ───────────────────────────────────────────────

  async findAll(query: {
    search?: string;
    status_instalasi?: string;
    jenis_pelaksana?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.search) {
      where.OR = [
        { nomor_instalasi: { contains: query.search } },
        { site: { nama_site: { contains: query.search } } },
        { site: { pelanggan: { nama_pelanggan: { contains: query.search } } } },
      ];
    }
    if (query.status_instalasi) where.status_instalasi = query.status_instalasi;
    if (query.jenis_pelaksana) where.jenis_pelaksana = query.jenis_pelaksana;

    const [data, total] = await Promise.all([
      this.prisma.instalasiOrder.findMany({
        where,
        include: INSTALASI_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.instalasiOrder.count({ where }),
    ]);

    // `total` di level atas dibuang oleh interceptor — kembalikan lewat meta (dibaca store web)
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const row = await this.prisma.instalasiOrder.findUnique({
      where: { id_instalasi: id },
      include: INSTALASI_DETAIL_INCLUDE,
    });
    if (!row) throw new NotFoundException('Order instalasi tidak ditemukan');
    return { data: row };
  }

  async findByVendor(id_kontak: number) {
    const data = await this.prisma.instalasiOrder.findMany({
      where: { id_kontak_teknisi: id_kontak },
      include: INSTALASI_DETAIL_INCLUDE,
      orderBy: { tgl_jadwal: 'asc' },
    });
    return { data };
  }

  async findTicketsByVendor(id_kontak: number) {
    const data = await this.prisma.operationTicket.findMany({
      where: { id_kontak_teknisi: id_kontak },
      include: {
        site: { include: { pelanggan: { select: { nama_pelanggan: true } } } },
        logs: { orderBy: { created_at: 'desc' }, take: 5 },
        photos: { orderBy: { created_at: 'desc' } },
        kontak_teknisi: { select: { nama: true, no_hp: true } },
      },
      orderBy: { tgl_open: 'desc' },
    });
    return { data };
  }

  async create(dto: CreateInstalasiDto) {
    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: dto.id_site } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');

    const nomor_instalasi = await this.docNumber.generate('INS');

    const data = await this.prisma.instalasiOrder.create({
      data: {
        nomor_instalasi,
        id_site: dto.id_site,
        id_layanan: dto.id_layanan ?? null,
        jenis_pelaksana: dto.jenis_pelaksana ?? 'Internal',
        id_teknisi_internal: dto.id_teknisi_internal ?? null,
        id_kontak_teknisi: dto.id_kontak_teknisi ?? null,
        fee_vendor: dto.fee_vendor ?? 0,
        tgl_jadwal: dto.tgl_jadwal ? new Date(dto.tgl_jadwal) : null,
        catatan: dto.catatan ?? null,
        status_instalasi: 'Draft',
      },
      include: INSTALASI_INCLUDE,
    });

    // Update status site menjadi Instalasi jika masih Prospek
    if (['Prospek', 'Aktif'].includes(site.status_site) === false) {
      // biarkan status lain tidak diubah
    } else if (site.status_site === 'Prospek') {
      await this.prisma.sitePelanggan.update({
        where: { id_site: dto.id_site },
        data: { status_site: 'Instalasi' },
      });
    }

    return { data, message: 'Order instalasi dibuat' };
  }

  /** Validasi transisi status sesuai alur Draft → Dijadwalkan → Dalam_Proses → Selesai. */
  private cekTransisi(dari: string, ke: string) {
    const TRANSISI = INSTALASI_TRANSISI as Record<string, readonly string[]>;
    if (!(ke in TRANSISI)) throw new BadRequestException(`Status instalasi "${ke}" tidak dikenal`);
    const boleh = TRANSISI[dari] ?? [];
    if (!boleh.includes(ke))
      throw new BadRequestException(
        `Tidak bisa ubah status dari ${dari} ke ${ke}` +
          (boleh.length ? ` — status berikutnya yang valid: ${boleh.join(', ')}` : ' — status ini sudah final'),
      );
  }

  /**
   * @param logCatatan catatan untuk log perubahan status (dipakai addLog agar log hanya ditulis sekali)
   */
  async update(id: number, dto: UpdateInstalasiDto, logCatatan?: string | null) {
    const row = await this.prisma.instalasiOrder.findUnique({ where: { id_instalasi: id } });
    if (!row) throw new NotFoundException('Order instalasi tidak ditemukan');

    const updateData: any = { ...dto };
    if (dto.tgl_jadwal) updateData.tgl_jadwal = new Date(dto.tgl_jadwal);

    const gantiStatus = !!dto.status_instalasi && dto.status_instalasi !== row.status_instalasi;
    if (gantiStatus) this.cekTransisi(row.status_instalasi, dto.status_instalasi!);

    // Satu transaksi: ubah status order (bersyarat) + log + aktivasi site
    const data = await this.prisma.$transaction(async (tx) => {
      if (gantiStatus) {
        const ke = dto.status_instalasi!;
        if (ke === 'Dalam_Proses') updateData.tgl_mulai = new Date();
        if (ke === 'Selesai') updateData.tgl_selesai = new Date();

        // Flip bersyarat pada status yang dibaca — cegah dua perubahan bersamaan sama-sama lolos
        const flip = await tx.instalasiOrder.updateMany({
          where: { id_instalasi: id, status_instalasi: row.status_instalasi },
          data: { status_instalasi: ke },
        });
        if (flip.count === 0)
          throw new BadRequestException('Status order baru saja diubah oleh user lain — muat ulang halaman');

        if (ke === 'Selesai') {
          await tx.sitePelanggan.update({
            where: { id_site: row.id_site },
            data: { status_site: 'Aktif', tgl_aktif: new Date() },
          });
        }

        await tx.instalasiLog.create({
          data: {
            id_instalasi: id,
            status_dari: row.status_instalasi,
            status_ke: ke,
            catatan: logCatatan ?? null,
          },
        });
      }

      return tx.instalasiOrder.update({
        where: { id_instalasi: id },
        data: updateData,
        include: INSTALASI_DETAIL_INCLUDE,
      });
    });

    return { data, message: 'Order instalasi diperbarui' };
  }

  async addLog(dto: AddInstalasiLogDto) {
    const row = await this.prisma.instalasiOrder.findUnique({ where: { id_instalasi: dto.id_instalasi } });
    if (!row) throw new NotFoundException('Order instalasi tidak ditemukan');

    // Dengan perubahan status: log ditulis SEKALI oleh update() (sebelumnya tercatat dua kali)
    if (dto.status_ke && dto.status_ke !== row.status_instalasi) {
      await this.update(dto.id_instalasi, { status_instalasi: dto.status_ke }, dto.catatan ?? null);
      const log = await this.prisma.instalasiLog.findFirst({
        where: { id_instalasi: dto.id_instalasi, status_ke: dto.status_ke },
        orderBy: { id_log: 'desc' },
      });
      return { data: log };
    }

    const log = await this.prisma.instalasiLog.create({
      data: {
        id_instalasi: dto.id_instalasi,
        status_dari: null,
        status_ke: null,
        catatan: dto.catatan ?? null,
      },
    });

    return { data: log };
  }

  async saveBAST(id: number, dto: SaveBASTDto) {
    const row = await this.prisma.instalasiOrder.findUnique({ where: { id_instalasi: id } });
    if (!row) throw new NotFoundException('Order instalasi tidak ditemukan');

    const bast = await this.prisma.instalasiBASTSign.upsert({
      where: { id_instalasi: id },
      create: {
        id_instalasi: id,
        ...dto,
        tgl_ditandatangani: new Date(),
      },
      update: {
        ...dto,
        tgl_ditandatangani: new Date(),
      },
    });

    return { data: bast, message: 'BAST disimpan' };
  }

  // ── FOTO ─────────────────────────────────────────────────────

  async addPhoto(id: number, file: { buffer: Buffer; mimetype: string }, stage: string, caption?: string) {
    const row = await this.prisma.instalasiOrder.findUnique({ where: { id_instalasi: id } });
    if (!row) throw new NotFoundException('Order instalasi tidak ditemukan');

    const ext = imageExtOrThrow(file.mimetype);
    const filename = `instalasi_${id}_${Date.now()}.${ext}`;
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(UPLOAD_ROOT, 'instalasi', String(id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), file.buffer);

    const foto = await this.prisma.instalasiPhoto.create({
      data: { id_instalasi: id, stage: stage || 'Proses', filename, caption: caption ?? null },
    });

    return { data: foto, message: 'Foto ditambahkan' };
  }

  async deletePhoto(id_foto: number) {
    const foto = await this.prisma.instalasiPhoto.findUnique({ where: { id_foto } });
    if (!foto) throw new NotFoundException('Foto tidak ditemukan');

    const path = await import('path');
    const fs = await import('fs');
    const filePath = path.join(UPLOAD_ROOT, 'instalasi', String(foto.id_instalasi), foto.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await this.prisma.instalasiPhoto.delete({ where: { id_foto } });
    return { message: 'Foto dihapus' };
  }

  async remove(id: number) {
    const row = await this.prisma.instalasiOrder.findUnique({ where: { id_instalasi: id } });
    if (!row) throw new NotFoundException('Order instalasi tidak ditemukan');
    if (!['Draft', 'Dibatalkan'].includes(row.status_instalasi)) {
      throw new BadRequestException('Hanya order Draft atau Dibatalkan yang bisa dihapus');
    }
    await this.prisma.instalasiOrder.delete({ where: { id_instalasi: id } });
    return { message: `Order ${row.nomor_instalasi} dihapus` };
  }

}
