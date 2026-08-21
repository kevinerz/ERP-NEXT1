import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertPicDto, ImportPicRowDto } from './dto/crm.dto';

const PIC_SELECT = {
  id_pic: true, nama_pic: true, jabatan: true, no_kontak: true, email: true,
  is_utama: true, tempat_lahir: true, tgl_lahir: true,
  media_komunikasi: true, rencana_tambah_layanan: true,
  catatan_update: true, tgl_update_data: true, created_at: true,
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true,
      pelanggan: { select: { id_pelanggan: true, nama_pelanggan: true } },
    },
  },
};

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  async listPic(query: { search?: string; id_pelanggan?: string; page?: number; limit?: number }) {
    const page  = Number(query.page)  || 1;
    const limit = Number(query.limit) || 25;
    const skip  = (page - 1) * limit;
    const where: any = {};

    if (query.search) {
      where.OR = [
        { nama_pic: { contains: query.search } },
        { email: { contains: query.search } },
        { no_kontak: { contains: query.search } },
        { site: { pelanggan: { nama_pelanggan: { contains: query.search } } } },
      ];
    }
    if (query.id_pelanggan) {
      where.site = { id_pelanggan: Number(query.id_pelanggan) };
    }

    const [data, total] = await Promise.all([
      this.prisma.picSite.findMany({ where, skip, take: limit, orderBy: { tgl_update_data: 'desc' }, select: PIC_SELECT }),
      this.prisma.picSite.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async getPic(id: number) {
    const data = await this.prisma.picSite.findUnique({
      where: { id_pic: id },
      include: {
        site: { include: { pelanggan: { select: { id_pelanggan: true, nama_pelanggan: true } } } },
        history: { orderBy: { created_at: 'desc' }, take: 20 },
      },
    });
    if (!data) throw new NotFoundException('PIC tidak ditemukan');
    return { data };
  }

  async upsertPic(dto: UpsertPicDto) {
    const now = new Date();
    const payload = {
      id_site: dto.id_site,
      nama_pic: dto.nama_pic,
      jabatan: dto.jabatan,
      no_kontak: dto.no_kontak,
      email: dto.email,
      is_utama: dto.is_utama ?? false,
      tempat_lahir: dto.tempat_lahir,
      tgl_lahir: dto.tgl_lahir ? new Date(dto.tgl_lahir) : undefined,
      media_komunikasi: dto.media_komunikasi,
      rencana_tambah_layanan: dto.rencana_tambah_layanan,
      catatan_update: dto.catatan_update,
      tgl_update_data: now,
    };

    let pic: any;
    if (dto.id_pic) {
      pic = await this.prisma.picSite.update({ where: { id_pic: dto.id_pic }, data: payload });
    } else {
      pic = await this.prisma.picSite.create({ data: payload });
    }

    await this.prisma.crmPicLog.create({
      data: {
        id_pic: pic.id_pic,
        sumber: 'Manual',
        data_snapshot: JSON.stringify({ ...payload, tgl_lahir: dto.tgl_lahir }),
        catatan: dto.catatan_update || null,
      },
    });

    return { data: pic, message: dto.id_pic ? 'PIC diperbarui' : 'PIC ditambahkan' };
  }

  async deletePic(id: number) {
    const row = await this.prisma.picSite.findUnique({ where: { id_pic: id } });
    if (!row) throw new NotFoundException('PIC tidak ditemukan');
    await this.prisma.picSite.delete({ where: { id_pic: id } });
    return { message: 'PIC dihapus' };
  }

  async importPic(rows: ImportPicRowDto[]) {
    const results: { nama_perusahaan: string; nama_pic: string; status: string; keterangan?: string }[] = [];

    for (const row of rows) {
      try {
        const pelanggan = await this.prisma.pelanggan.findFirst({
          where: { nama_pelanggan: { contains: row.nama_perusahaan } },
          include: { sites: { select: { id_site: true, nama_site: true }, take: 1 } },
        });

        if (!pelanggan || !pelanggan.sites.length) {
          results.push({ nama_perusahaan: row.nama_perusahaan, nama_pic: row.nama_pic, status: 'skip', keterangan: 'Perusahaan/site tidak ditemukan di master data' });
          continue;
        }

        const id_site = pelanggan.sites[0].id_site;
        const existing = await this.prisma.picSite.findFirst({
          where: { id_site, email: row.email || undefined },
        });

        const tgl_lahir = row.tgl_lahir ? this.parseDate(row.tgl_lahir) : undefined;
        const payload = {
          id_site,
          nama_pic: row.nama_pic,
          jabatan: row.jabatan || undefined,
          no_kontak: row.no_kontak || undefined,
          email: row.email || undefined,
          tempat_lahir: row.tempat_lahir || undefined,
          tgl_lahir,
          media_komunikasi: row.media_komunikasi || undefined,
          rencana_tambah_layanan: row.rencana_tambah_layanan || undefined,
          catatan_update: row.catatan_update || undefined,
          tgl_update_data: new Date(),
        };

        let pic: any;
        if (existing) {
          pic = await this.prisma.picSite.update({ where: { id_pic: existing.id_pic }, data: payload });
          results.push({ nama_perusahaan: row.nama_perusahaan, nama_pic: row.nama_pic, status: 'updated' });
        } else {
          pic = await this.prisma.picSite.create({ data: payload });
          results.push({ nama_perusahaan: row.nama_perusahaan, nama_pic: row.nama_pic, status: 'created' });
        }

        await this.prisma.crmPicLog.create({
          data: {
            id_pic: pic.id_pic,
            sumber: 'Import',
            data_snapshot: JSON.stringify(payload),
            catatan: row.catatan_update || null,
          },
        });
      } catch (e: any) {
        results.push({ nama_perusahaan: row.nama_perusahaan, nama_pic: row.nama_pic, status: 'error', keterangan: e.message });
      }
    }

    return { data: results, message: `Import selesai: ${results.filter(r => r.status !== 'error' && r.status !== 'skip').length} berhasil dari ${rows.length} baris` };
  }

  private parseDate(s: string): Date | undefined {
    // Handle DD/MM/YYYY and YYYY-MM-DD
    if (!s) return undefined;
    if (s.includes('/')) {
      const [d, m, y] = s.split('/');
      const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
      return isNaN(dt.getTime()) ? undefined : dt;
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? undefined : dt;
  }

  async getStats() {
    const [total, updated30, media, rencana] = await Promise.all([
      this.prisma.picSite.count(),
      this.prisma.picSite.count({ where: { tgl_update_data: { gte: new Date(Date.now() - 30 * 864e5) } } }),
      this.prisma.picSite.groupBy({ by: ['media_komunikasi'], _count: { id_pic: true } }),
      this.prisma.picSite.groupBy({ by: ['rencana_tambah_layanan'], _count: { id_pic: true } }),
    ]);
    return { data: { total, updated_30_hari: updated30, by_media: media, by_rencana: rencana } };
  }
}
