import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLayananDto, UpdateLayananDto } from './dto/layanan.dto';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';
import { CreatePelangganDto, UpdatePelangganDto } from './dto/pelanggan.dto';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import {
  CreateSumberInternetDto, UpdateSumberInternetDto,
  CreatePerangkatDto, UpdatePerangkatDto,
  CreatePicDto, UpdatePicDto,
} from './dto/site-detail.dto';

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

  async removeLayanan(id: number) {
    const row = await this.prisma.masterLayanan.findUnique({
      where: { id_layanan: id },
      include: { _count: { select: { sites: true } } },
    });
    if (!row) throw new NotFoundException('Layanan tidak ditemukan');
    if ((row as any)._count.sites > 0)
      throw new BadRequestException('Layanan tidak bisa dihapus karena sudah dipakai oleh Site');
    await this.prisma.masterLayanan.delete({ where: { id_layanan: id } });
    return { message: `Layanan ${row.nama_layanan} dihapus` };
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

  async removeVendor(id: number) {
    const row = await this.prisma.masterVendorIsp.findUnique({
      where: { id_vendor: id },
      include: { _count: { select: { sumber_internet: true } } },
    });
    if (!row) throw new NotFoundException('Vendor tidak ditemukan');
    if ((row as any)._count.sumber_internet > 0)
      throw new BadRequestException('Vendor tidak bisa dihapus karena masih dipakai di Sumber Internet Site');
    await this.prisma.masterVendorIsp.delete({ where: { id_vendor: id } });
    return { message: `Vendor ${row.nama_vendor} dihapus` };
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

  async removePelanggan(id: number) {
    const row = await this.prisma.pelanggan.findUnique({
      where: { id_pelanggan: id },
      include: { _count: { select: { sites: true } } },
    });
    if (!row) throw new NotFoundException('Pelanggan tidak ditemukan');
    if ((row as any)._count.sites > 0)
      throw new BadRequestException('Pelanggan masih memiliki Site, tidak bisa dihapus');
    await this.prisma.pelanggan.delete({ where: { id_pelanggan: id } });
    return { message: `Pelanggan ${row.nama_pelanggan} dihapus` };
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
    return { data, message: `Site ditambahkan: ${dto.kode_site} — ${dto.nama_site}` };
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
    return { data, message: `Site diperbarui: ${data.kode_site} — ${data.nama_site}` };
  }

  async removeSite(id: number, force = false) {
    const row = await this.prisma.sitePelanggan.findUnique({
      where: { id_site: id },
      include: {
        _count: { select: { tickets: true, projects: true, kontrak: true, work_orders: true, invoices: true } },
      },
    });
    if (!row) throw new NotFoundException('Site tidak ditemukan');
    const c = (row as any)._count;

    if (!force) {
      if (c.tickets > 0 || c.projects > 0 || c.kontrak > 0)
        throw new BadRequestException(
          'Site masih memiliki Tiket/Project/Kontrak aktif, tidak bisa dihapus. ' +
          'Gunakan force delete untuk menghapus site BESERTA seluruh datanya.',
        );
      await this.prisma.sitePelanggan.delete({ where: { id_site: id } });
      return { message: `Site ${row.kode_site} — ${row.nama_site} dihapus` };
    }

    // ─── FORCE DELETE: hapus site + SEMUA data terkait, transaksional ───
    // Urutan penting: cucu → anak → site.
    // Cascade otomatis: WO(foto/BA/material/pengiriman), Tiket(log/RCA),
    // Invoice(pembayaran), Site(perangkat/pic/sumber_internet). Aset: id_site SetNull.
    await this.prisma.$transaction(async (tx) => {
      // Lepas referensi mutasi gudang (riwayat gudang tetap disimpan)
      await tx.gudangMutasiAset.updateMany({
        where: { wo: { id_site: id } }, data: { id_wo: null },
      });
      await tx.gudangMutasiAset.updateMany({
        where: { project: { id_site: id } }, data: { id_project: null },
      });
      // Lepas referensi webhook monitoring ke tiket site ini
      await tx.integrationPrtgWebhook.updateMany({
        where: { ticket: { id_site: id } }, data: { id_ticket_terbentuk: null },
      });
      await tx.integrationRcmsWebhook.updateMany({
        where: { ticket: { id_site: id } }, data: { id_ticket_terbentuk: null },
      });
      await tx.integrationRuijieWebhook.updateMany({
        where: { ticket: { id_site: id } }, data: { id_ticket_terbentuk: null },
      });

      // Anak-anak WO & Tiket & Project
      await tx.workOrder.deleteMany({ where: { id_site: id } });
      await tx.operationTicket.deleteMany({ where: { id_site: id } });
      await tx.projectDokumenLegal.deleteMany({ where: { project: { id_site: id } } });
      await tx.projectDelivery.deleteMany({ where: { id_site: id } });

      // Finance & integrasi
      await tx.invoice.deleteMany({ where: { id_site: id } });
      await tx.integrationJurnalAr.deleteMany({ where: { id_site: id } });
      await tx.simTopup.deleteMany({ where: { id_site: id } });

      // Kontrak, lalu site (perangkat/pic/sumber ikut cascade)
      await tx.kontrakLayanan.deleteMany({ where: { id_site: id } });
      await tx.sitePelanggan.delete({ where: { id_site: id } });
    });

    return {
      message: `Site ${row.kode_site} — ${row.nama_site} beserta ${c.tickets} tiket, ${c.projects} project, ${c.kontrak} kontrak, ${c.work_orders} WO, dan ${c.invoices} invoice DIHAPUS PERMANEN`,
    };
  }

  async getPelangganDropdown() {
    const data = await this.prisma.pelanggan.findMany({
      select: { id_pelanggan: true, kode_pelanggan: true, nama_pelanggan: true },
      orderBy: { nama_pelanggan: 'asc' },
      take: 500,
    });
    return { data };
  }

  async getVendorDropdown() {
    const data = await this.prisma.masterVendorIsp.findMany({
      where: { is_aktif: true },
      select: { id_vendor: true, nama_vendor: true, tipe_vendor: true },
      orderBy: { nama_vendor: 'asc' },
      take: 500,
    });
    return { data };
  }

  // ─── SITE DETAIL ─────────────────────────────────────────────

  async findOneSite(id: number) {
    const data = await this.prisma.sitePelanggan.findUnique({
      where: { id_site: id },
      include: {
        pelanggan: true,
        layanan: true,
        sumber_internet: {
          orderBy: { created_at: 'asc' },
          include: {
            vendor: { select: { nama_vendor: true, tipe_vendor: true } },
            aset_sim: { select: { kode_aset: true, nama_perangkat: true, serial_number: true } },
          },
        },
        perangkat: {
          orderBy: { jenis_perangkat: 'asc' },
          include: { aset: { select: { kode_aset: true, nama_perangkat: true } } },
        },
        pic: { orderBy: { is_utama: 'desc' } },
        kontrak: {
          where: { status_kontrak: 'Aktif' },
          include: { layanan: { select: { nama_layanan: true } } },
          orderBy: { created_at: 'desc' },
        },
        projects: {
          orderBy: { created_at: 'desc' },
          select: {
            id_project: true, nomor_project: true, status_project: true,
            tgl_mulai: true, tgl_target_selesai: true,
            pm: { select: { nama_lengkap: true } },
          },
        },
        tickets: {
          orderBy: { tgl_open: 'desc' },
          take: 20,
          select: {
            id_ticket: true, nomor_tiket: true, judul_tiket: true,
            status_tiket: true, prioritas: true, tgl_open: true,
          },
        },
      },
    });
    if (!data) throw new NotFoundException('Site tidak ditemukan');
    return { data };
  }

  // Sumber Internet
  async findAllSumberInternet(query: { id_site?: string; unlinked_only?: string }) {
    const where: any = {};
    if (query.id_site) where.id_site = Number(query.id_site);
    if (query.unlinked_only === 'true') where.id_aset_sim = null;
    const data = await this.prisma.sumberInternetSite.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id_sumber: true,
        nomor_pelanggan_isp: true,
        status_link: true,
        id_aset_sim: true,
        site: { select: { id_site: true, kode_site: true, nama_site: true } },
        vendor: { select: { nama_vendor: true } },
      },
    });
    return { data };
  }

  async createSumberInternet(dto: CreateSumberInternetDto) {
    const data = await this.prisma.sumberInternetSite.create({
      data: {
        ...dto,
        biaya_mrc_vendor: dto.biaya_mrc_vendor ?? 0,
        peruntukan_link: dto.peruntukan_link || 'Main',
        status_link: dto.status_link || 'Aktif',
        tgl_mulai: dto.tgl_mulai ? new Date(dto.tgl_mulai) : undefined,
        tgl_berakhir: dto.tgl_berakhir ? new Date(dto.tgl_berakhir) : undefined,
      },
      include: {
        vendor: { select: { nama_vendor: true, tipe_vendor: true } },
        aset_sim: { select: { kode_aset: true, nama_perangkat: true, serial_number: true } },
        site: { select: { kode_site: true, nama_site: true } },
      },
    });
    const site = (data as any).site;
    const vendor = (data as any).vendor;
    const nomorSuffix = dto.nomor_pelanggan_isp ? ` — ${dto.nomor_pelanggan_isp}` : '';
    return {
      data,
      message: `Sumber internet ditambahkan: ${vendor?.nama_vendor} [${dto.peruntukan_link || 'Main'}] di ${site?.nama_site || 'site ID ' + dto.id_site}${nomorSuffix}`,
    };
  }

  async updateSumberInternet(id: number, dto: UpdateSumberInternetDto) {
    // Link SIM: aset target harus berkategori SIM
    if (dto.id_aset_sim) {
      const sim = await this.prisma.gudangAset.findUnique({ where: { id_aset: dto.id_aset_sim } });
      if (!sim) throw new NotFoundException('Aset SIM tidak ditemukan');
      if (!/sim/i.test(sim.kategori))
        throw new BadRequestException(`Aset ${sim.kode_aset} berkategori ${sim.kategori}, bukan SIM`);
    }
    const data = await this.prisma.sumberInternetSite.update({
      where: { id_sumber: id },
      data: {
        ...dto,
        tgl_mulai: dto.tgl_mulai ? new Date(dto.tgl_mulai) : undefined,
        tgl_berakhir: dto.tgl_berakhir ? new Date(dto.tgl_berakhir) : undefined,
      },
      include: {
        vendor: { select: { nama_vendor: true, tipe_vendor: true } },
        aset_sim: { select: { kode_aset: true, nama_perangkat: true, serial_number: true } },
        site: { select: { kode_site: true, nama_site: true } },
      },
    });
    const site = (data as any).site;
    const vendor = (data as any).vendor;
    return { data, message: `Sumber internet diperbarui: ${vendor?.nama_vendor} di ${site?.nama_site || 'site ID ' + data.id_site}` };
  }

  async deleteSumberInternet(id: number) {
    const existing = await this.prisma.sumberInternetSite.findUnique({
      where: { id_sumber: id },
      include: {
        vendor: { select: { nama_vendor: true } },
        site: { select: { nama_site: true } },
      },
    });
    await this.prisma.sumberInternetSite.delete({ where: { id_sumber: id } });
    const vendor = (existing as any)?.vendor;
    const site = (existing as any)?.site;
    return { data: null, message: `Sumber internet dihapus: ${vendor?.nama_vendor || 'ID ' + id} dari ${site?.nama_site || 'site'}` };
  }

  // Perangkat
  async createPerangkat(dto: CreatePerangkatDto) {
    const data = await this.prisma.perangkatSite.create({
      data: {
        ...dto,
        status_perangkat: dto.status_perangkat || 'Aktif',
        tgl_pasang: dto.tgl_pasang ? new Date(dto.tgl_pasang) : undefined,
      },
      include: {
        aset: { select: { kode_aset: true, nama_perangkat: true } },
        site: { select: { kode_site: true, nama_site: true } },
      },
    });

    // Update status aset → Terpasang dan catat mutasi Deploy
    if (dto.id_aset) {
      await this.prisma.gudangAset.update({
        where: { id_aset: dto.id_aset },
        data: { status_aset: 'Terpasang', id_site: dto.id_site },
      });
      await this.prisma.gudangMutasiAset.create({
        data: {
          id_aset: dto.id_aset,
          jenis_mutasi: 'Deploy',
          jumlah: 1,
          id_site_tujuan: dto.id_site,
          keterangan: `Deploy ke site via Site Detail`,
        },
      });
    }

    const aset = (data as any).aset;
    const site = (data as any).site;
    return {
      data,
      message: `Perangkat dipasang: ${aset?.nama_perangkat || data.jenis_perangkat} [${aset?.kode_aset || ''}] di ${site?.nama_site || 'site ID ' + dto.id_site}`,
    };
  }

  async updatePerangkat(id: number, dto: UpdatePerangkatDto) {
    const data = await this.prisma.perangkatSite.update({
      where: { id_perangkat: id },
      data: {
        ...dto,
        tgl_pasang: dto.tgl_pasang ? new Date(dto.tgl_pasang) : undefined,
      },
      include: {
        aset: { select: { kode_aset: true, nama_perangkat: true } },
        site: { select: { kode_site: true, nama_site: true } },
      },
    });
    const aset = (data as any).aset;
    const site = (data as any).site;
    return { data, message: `Perangkat diperbarui: ${aset?.nama_perangkat || data.jenis_perangkat} di ${site?.nama_site || 'site ID ' + data.id_site}` };
  }

  async deletePerangkat(id: number) {
    const perangkat = await this.prisma.perangkatSite.findUnique({
      where: { id_perangkat: id },
      include: {
        aset: { select: { kode_aset: true, nama_perangkat: true } },
        site: { select: { nama_site: true } },
      },
    });

    await this.prisma.perangkatSite.delete({ where: { id_perangkat: id } });

    // Kembalikan status aset → Di_Gudang dan catat mutasi Return
    if (perangkat?.id_aset) {
      await this.prisma.gudangAset.update({
        where: { id_aset: perangkat.id_aset },
        data: { status_aset: 'Di_Gudang', id_site: null },
      });
      await this.prisma.gudangMutasiAset.create({
        data: {
          id_aset: perangkat.id_aset,
          jenis_mutasi: 'Return',
          jumlah: 1,
          id_site_asal: perangkat.id_site,
          keterangan: `Return dari site — perangkat dilepas`,
        },
      });
    }

    const aset = (perangkat as any)?.aset;
    const site = (perangkat as any)?.site;
    return { data: null, message: `Perangkat dilepas: ${aset?.nama_perangkat || perangkat?.jenis_perangkat || 'ID ' + id} [${aset?.kode_aset || ''}] dari ${site?.nama_site || 'site'}` };
  }

  // PIC
  async createPic(dto: CreatePicDto) {
    const data = await this.prisma.picSite.create({
      data: dto,
      include: { site: { select: { kode_site: true, nama_site: true } } },
    });
    const site = (data as any).site;
    return {
      data,
      message: `PIC ditambahkan: ${dto.nama_pic}${dto.jabatan ? ' (' + dto.jabatan + ')' : ''} di ${site?.nama_site || 'site ID ' + dto.id_site}${dto.no_kontak ? ' — ' + dto.no_kontak : ''}`,
    };
  }

  async updatePic(id: number, dto: UpdatePicDto) {
    const data = await this.prisma.picSite.update({
      where: { id_pic: id },
      data: dto,
      include: { site: { select: { kode_site: true, nama_site: true } } },
    });
    const site = (data as any).site;
    return { data, message: `PIC diperbarui: ${data.nama_pic} di ${site?.nama_site || 'site ID ' + data.id_site}` };
  }

  async deletePic(id: number) {
    const existing = await this.prisma.picSite.findUnique({
      where: { id_pic: id },
      include: { site: { select: { nama_site: true } } },
    });
    await this.prisma.picSite.delete({ where: { id_pic: id } });
    const site = (existing as any)?.site;
    return { data: null, message: `PIC dihapus: ${existing?.nama_pic || 'ID ' + id} dari ${site?.nama_site || 'site'}` };
  }

  // ─── KONTAK TEKNISI / PEMASANG (pihak ketiga) ─────────────────

  async findAllKontakTeknisi(query: { search?: string; is_aktif?: string; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.search) {
      where.OR = [
        { nama: { contains: query.search } },
        { no_hp: { contains: query.search } },
        { asal_vendor: { contains: query.search } },
        { keahlian: { contains: query.search } },
      ];
    }
    if (query.is_aktif === 'true') where.is_aktif = true;
    if (query.is_aktif === 'false') where.is_aktif = false;

    const [data, total] = await Promise.all([
      this.prisma.masterKontakTeknisi.findMany({
        where, skip, take: limit,
        orderBy: { nama: 'asc' },
      }),
      this.prisma.masterKontakTeknisi.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async createKontakTeknisi(dto: any) {
    const data = await this.prisma.masterKontakTeknisi.create({ data: dto });
    return { data, message: `Kontak ${data.nama} ditambahkan` };
  }

  async updateKontakTeknisi(id: number, dto: any) {
    const row = await this.prisma.masterKontakTeknisi.findUnique({ where: { id_kontak: id } });
    if (!row) throw new NotFoundException('Kontak tidak ditemukan');
    const data = await this.prisma.masterKontakTeknisi.update({ where: { id_kontak: id }, data: dto });
    return { data, message: 'Kontak diperbarui' };
  }

  async toggleKontakTeknisi(id: number) {
    const row = await this.prisma.masterKontakTeknisi.findUnique({ where: { id_kontak: id } });
    if (!row) throw new NotFoundException('Kontak tidak ditemukan');
    const data = await this.prisma.masterKontakTeknisi.update({
      where: { id_kontak: id },
      data: { is_aktif: !row.is_aktif },
    });
    return { data, message: `Kontak ${data.is_aktif ? 'diaktifkan' : 'dinonaktifkan'}` };
  }

  async removeKontakTeknisi(id: number) {
    const row = await this.prisma.masterKontakTeknisi.findUnique({ where: { id_kontak: id } });
    if (!row) throw new NotFoundException('Kontak tidak ditemukan');
    await this.prisma.masterKontakTeknisi.delete({ where: { id_kontak: id } });
    return { message: `Kontak ${row.nama} dihapus` };
  }
}
