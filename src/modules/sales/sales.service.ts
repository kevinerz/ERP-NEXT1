import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';
import { CreateOpportunityDto, UpdateOpportunityDto } from './dto/opportunity.dto';
import { CreateQuotationDto, UpdateQuotationDto, ApproveQuotationDto } from './dto/quotation.dto';
import { CreateActivityDto } from './dto/activity.dto';

const LEAD_INCLUDE = {
  sales_pic: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
};

const OPP_INCLUDE = {
  lead: { select: { id_lead: true, nama_prospek: true, nama_perusahaan: true } },
  layanan: { select: { id_layanan: true, kode_layanan: true, nama_layanan: true } },
  sales_pic: { select: { id_karyawan: true, nama_lengkap: true } },
};

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  // ─── PIPELINE SUMMARY ───────────────────────────────────────
  async getPipeline() {
    const tahapan = ['Prospecting', 'Presentasi', 'Survey', 'Negosiasi', 'Penawaran', 'Won', 'Lost'];
    const rows = await this.prisma.salesOpportunity.groupBy({
      by: ['tahapan'],
      _count: { id_opportunity: true },
      _sum: { estimasi_nilai: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.tahapan, r]));
    const data = tahapan.map((t) => ({
      tahapan: t,
      count: map[t]?._count?.id_opportunity ?? 0,
      total_nilai: Number(map[t]?._sum?.estimasi_nilai ?? 0),
    }));
    return { data };
  }

  // ─── LEAD ────────────────────────────────────────────────────
  async findAllLead(query: {
    search?: string; status_lead?: string;
    id_sales_pic?: string; page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.search) {
      where.OR = [
        { nama_prospek: { contains: query.search } },
        { nama_perusahaan: { contains: query.search } },
        { no_kontak: { contains: query.search } },
      ];
    }
    if (query.status_lead) where.status_lead = query.status_lead;
    if (query.id_sales_pic) where.id_sales_pic = Number(query.id_sales_pic);

    const [data, total] = await Promise.all([
      this.prisma.salesLead.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          ...LEAD_INCLUDE,
          _count: { select: { opportunities: true, activities: true } },
        },
      }),
      this.prisma.salesLead.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOneLead(id: number) {
    const data = await this.prisma.salesLead.findUnique({
      where: { id_lead: id },
      include: {
        ...LEAD_INCLUDE,
        opportunities: { include: OPP_INCLUDE, orderBy: { created_at: 'desc' } },
        activities: {
          include: { sales_pic: { select: { nama_lengkap: true } } },
          orderBy: { tanggal_aktivitas: 'desc' },
        },
      },
    });
    if (!data) throw new NotFoundException('Lead tidak ditemukan');
    return { data };
  }

  async createLead(dto: CreateLeadDto) {
    const data = await this.prisma.salesLead.create({
      data: { ...dto, updated_at: new Date() },
      include: LEAD_INCLUDE,
    });
    return { data, message: 'Lead berhasil ditambahkan' };
  }

  async updateLead(id: number, dto: UpdateLeadDto) {
    await this._checkLead(id);
    const data = await this.prisma.salesLead.update({
      where: { id_lead: id },
      data: { ...dto, updated_at: new Date() },
      include: LEAD_INCLUDE,
    });
    return { data, message: 'Lead diperbarui' };
  }

  private async _checkLead(id: number) {
    const row = await this.prisma.salesLead.findUnique({ where: { id_lead: id } });
    if (!row) throw new NotFoundException('Lead tidak ditemukan');
    return row;
  }

  // ─── OPPORTUNITY ─────────────────────────────────────────────
  async findAllOpportunity(query: {
    search?: string; tahapan?: string; id_sales_pic?: string;
    page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.search) where.nama_opportunity = { contains: query.search };
    if (query.tahapan) where.tahapan = query.tahapan;
    if (query.id_sales_pic) where.id_sales_pic = Number(query.id_sales_pic);

    const [data, total] = await Promise.all([
      this.prisma.salesOpportunity.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          ...OPP_INCLUDE,
          _count: { select: { quotations: true, activities: true } },
        },
      }),
      this.prisma.salesOpportunity.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOneOpportunity(id: number) {
    const data = await this.prisma.salesOpportunity.findUnique({
      where: { id_opportunity: id },
      include: {
        ...OPP_INCLUDE,
        quotations: {
          include: {
            sales_pic: { select: { nama_lengkap: true } },
            approver: { select: { nama_lengkap: true } },
          },
          orderBy: { created_at: 'desc' },
        },
        activities: {
          include: { sales_pic: { select: { nama_lengkap: true } } },
          orderBy: { tanggal_aktivitas: 'desc' },
        },
        surveys: {
          include: { presales_pic: { select: { nama_lengkap: true } } },
          orderBy: { created_at: 'desc' },
        },
      },
    });
    if (!data) throw new NotFoundException('Opportunity tidak ditemukan');
    return { data };
  }

  async createOpportunity(dto: CreateOpportunityDto) {
    await this._checkLead(dto.id_lead);
    const data = await this.prisma.salesOpportunity.create({
      data: {
        ...dto,
        estimasi_nilai: dto.estimasi_nilai ?? 0,
        tgl_target_close: dto.tgl_target_close ? new Date(dto.tgl_target_close) : undefined,
        updated_at: new Date(),
      },
      include: OPP_INCLUDE,
    });
    return { data, message: 'Opportunity berhasil dibuat' };
  }

  async updateOpportunity(id: number, dto: UpdateOpportunityDto) {
    const opp = await this.prisma.salesOpportunity.findUnique({ where: { id_opportunity: id } });
    if (!opp) throw new NotFoundException('Opportunity tidak ditemukan');
    const data = await this.prisma.salesOpportunity.update({
      where: { id_opportunity: id },
      data: {
        ...dto,
        tgl_target_close: dto.tgl_target_close ? new Date(dto.tgl_target_close) : undefined,
        updated_at: new Date(),
      },
      include: OPP_INCLUDE,
    });
    return { data, message: 'Opportunity diperbarui' };
  }

  // ─── QUOTATION ───────────────────────────────────────────────
  async findAllQuotation(query: {
    id_opportunity?: string; status_approval?: string;
    page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.id_opportunity) where.id_opportunity = Number(query.id_opportunity);
    if (query.status_approval) where.status_approval = query.status_approval;

    const [data, total] = await Promise.all([
      this.prisma.salesQuotation.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          opportunity: { select: { nama_opportunity: true, lead: { select: { nama_prospek: true } } } },
          sales_pic: { select: { nama_lengkap: true } },
          approver: { select: { nama_lengkap: true } },
        },
      }),
      this.prisma.salesQuotation.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async createQuotation(dto: CreateQuotationDto) {
    const opp = await this.prisma.salesOpportunity.findUnique({ where: { id_opportunity: dto.id_opportunity } });
    if (!opp) throw new NotFoundException('Opportunity tidak ditemukan');

    // Generate nomor quotation: QT-YYYYMM-XXXX
    const now = new Date();
    const prefix = `QT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const last = await this.prisma.salesQuotation.findFirst({
      where: { nomor_quotation: { startsWith: prefix } },
      orderBy: { nomor_quotation: 'desc' },
    });
    const seq = last ? parseInt(last.nomor_quotation.split('-')[2]) + 1 : 1;
    const nomor_quotation = `${prefix}-${String(seq).padStart(4, '0')}`;

    const data = await this.prisma.salesQuotation.create({
      data: {
        ...dto,
        nomor_quotation,
        harga_mrc: dto.harga_mrc ?? 0,
        harga_otc: dto.harga_otc ?? 0,
        tgl_quotation: new Date(dto.tgl_quotation),
        tgl_berlaku_sampai: dto.tgl_berlaku_sampai ? new Date(dto.tgl_berlaku_sampai) : undefined,
        updated_at: new Date(),
      },
    });
    return { data, message: `Quotation ${nomor_quotation} dibuat` };
  }

  async updateQuotation(id: number, dto: UpdateQuotationDto) {
    const qt = await this.prisma.salesQuotation.findUnique({ where: { id_quotation: id } });
    if (!qt) throw new NotFoundException('Quotation tidak ditemukan');
    const data = await this.prisma.salesQuotation.update({
      where: { id_quotation: id },
      data: {
        ...dto,
        tgl_quotation: dto.tgl_quotation ? new Date(dto.tgl_quotation) : undefined,
        tgl_berlaku_sampai: dto.tgl_berlaku_sampai ? new Date(dto.tgl_berlaku_sampai) : undefined,
        updated_at: new Date(),
      },
    });
    return { data, message: 'Quotation diperbarui' };
  }

  async approveQuotation(id: number, dto: ApproveQuotationDto) {
    const qt = await this.prisma.salesQuotation.findUnique({ where: { id_quotation: id } });
    if (!qt) throw new NotFoundException('Quotation tidak ditemukan');
    const data = await this.prisma.salesQuotation.update({
      where: { id_quotation: id },
      data: {
        status_approval: dto.status_approval,
        id_approver: dto.id_approver,
        tgl_approval: new Date(),
        catatan_approval: dto.catatan_approval,
        updated_at: new Date(),
      },
    });
    return { data, message: `Quotation ${dto.status_approval}` };
  }

  // ─── ACTIVITY ────────────────────────────────────────────────
  async createActivity(dto: CreateActivityDto) {
    const data = await this.prisma.salesActivity.create({
      data: {
        ...dto,
        tanggal_aktivitas: new Date(dto.tanggal_aktivitas),
        hasil: dto.hasil ?? 'Netral',
      },
      include: { sales_pic: { select: { nama_lengkap: true } } },
    });
    return { data, message: 'Aktivitas dicatat' };
  }

  // ─── HELPER: Sales List ──────────────────────────────────────
  async getSalesList() {
    const data = await this.prisma.hrisKaryawan.findMany({
      where: {
        status_aktif: true,
        user: {
          is_aktif: true,
          user_roles: { some: { role: { nama_role: { in: ['Sales', 'Director', 'Admin'] } } } },
        },
      },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    return { data };
  }
}
