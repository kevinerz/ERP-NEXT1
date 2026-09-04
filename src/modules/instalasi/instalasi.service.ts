import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentNumberService } from '../../common/document-number/document-number.service';
import {
  CreateInstalasiDto,
  UpdateInstalasiDto,
  AddInstalasiLogDto,
  SaveBASTDto,
  VendorLoginDto,
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

@Injectable()
export class InstalasiService {
  constructor(
    private prisma: PrismaService,
    private docNumber: DocumentNumberService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ── VENDOR AUTH ──────────────────────────────────────────────

  async vendorLogin(dto: VendorLoginDto) {
    const vendor = await this.prisma.masterKontakTeknisi.findUnique({
      where: { username: dto.username },
    });

    if (!vendor || !vendor.pin_hash || !vendor.is_aktif) {
      throw new UnauthorizedException('Username atau PIN salah');
    }

    const match = await bcrypt.compare(dto.pin, vendor.pin_hash);
    if (!match) throw new UnauthorizedException('Username atau PIN salah');

    const token = await this.jwt.signAsync(
      { sub: vendor.id_kontak, username: vendor.username, type: 'vendor_teknisi' },
      { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: '30d' },
    );

    return {
      access_token: token,
      vendor: { id_kontak: vendor.id_kontak, nama: vendor.nama, no_hp: vendor.no_hp },
    };
  }

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

    return { data, total, page, limit };
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

  async update(id: number, dto: UpdateInstalasiDto) {
    const row = await this.prisma.instalasiOrder.findUnique({ where: { id_instalasi: id } });
    if (!row) throw new NotFoundException('Order instalasi tidak ditemukan');

    const updateData: any = { ...dto };
    if (dto.tgl_jadwal) updateData.tgl_jadwal = new Date(dto.tgl_jadwal);

    // Status transitions
    if (dto.status_instalasi && dto.status_instalasi !== row.status_instalasi) {
      if (dto.status_instalasi === 'Dalam_Proses') updateData.tgl_mulai = new Date();
      if (dto.status_instalasi === 'Selesai') {
        updateData.tgl_selesai = new Date();
        // Aktifkan site
        await this.prisma.sitePelanggan.update({
          where: { id_site: row.id_site },
          data: { status_site: 'Aktif', tgl_aktif: new Date() },
        });
      }

      // Catat log perubahan status
      await this.prisma.instalasiLog.create({
        data: {
          id_instalasi: id,
          status_dari: row.status_instalasi,
          status_ke: dto.status_instalasi,
        },
      });
    }

    const data = await this.prisma.instalasiOrder.update({
      where: { id_instalasi: id },
      data: updateData,
      include: INSTALASI_DETAIL_INCLUDE,
    });

    return { data, message: 'Order instalasi diperbarui' };
  }

  async addLog(dto: AddInstalasiLogDto) {
    const row = await this.prisma.instalasiOrder.findUnique({ where: { id_instalasi: dto.id_instalasi } });
    if (!row) throw new NotFoundException('Order instalasi tidak ditemukan');

    const log = await this.prisma.instalasiLog.create({
      data: {
        id_instalasi: dto.id_instalasi,
        status_dari: dto.status_ke ? row.status_instalasi : null,
        status_ke: dto.status_ke ?? null,
        catatan: dto.catatan ?? null,
      },
    });

    if (dto.status_ke) {
      await this.update(dto.id_instalasi, { status_instalasi: dto.status_ke });
    }

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

    const ext = file.mimetype.split('/')[1] ?? 'jpg';
    const filename = `instalasi_${id}_${Date.now()}.${ext}`;
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'uploads', 'instalasi', String(id));
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
    const filePath = path.join(process.cwd(), 'uploads', 'instalasi', String(foto.id_instalasi), foto.filename);
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

  // ── VENDOR SET PIN ────────────────────────────────────────────

  async setVendorPin(id_kontak: number, pin: string) {
    if (pin.length < 4 || pin.length > 10) throw new BadRequestException('PIN harus 4–10 karakter');
    const pin_hash = await bcrypt.hash(pin, 10);
    await this.prisma.masterKontakTeknisi.update({
      where: { id_kontak },
      data: { pin_hash },
    });
    return { message: 'PIN berhasil diset' };
  }
}
