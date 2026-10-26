import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePresalesSurveyDto, UpdatePresalesSurveyDto } from './dto/presales.dto';

const INCLUDE = {
  opportunity: {
    select: {
      id_opportunity: true,
      nama_opportunity: true,
      lead: { select: { nama_prospek: true, nama_perusahaan: true } },
    },
  },
  layanan: { select: { id_layanan: true, kode_layanan: true, nama_layanan: true } },
  presales_pic: { select: { id_karyawan: true, nama_lengkap: true } },
};

@Injectable()
export class PresalesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { search?: string; status_presales?: string; id_layanan?: string; status_odp?: string; page?: number; limit?: number }) {
    const page  = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip  = (page - 1) * limit;
    const where: any = {};

    if (query.search) {
      where.OR = [
        { nama_prospek: { contains: query.search } },
        { kota: { contains: query.search } },
        { nama_odp: { contains: query.search } },
        { nomor_order_vendor: { contains: query.search } },
        { sn_modem: { contains: query.search } },
        { vendor: { contains: query.search } },
        { opportunity: { nama_opportunity: { contains: query.search } } },
      ];
    }
    if (query.status_presales) where.status_presales = query.status_presales;
    if (query.id_layanan) where.id_layanan = Number(query.id_layanan);
    if (query.status_odp) where.status_odp = query.status_odp;

    const [data, total] = await Promise.all([
      this.prisma.presalesSurvey.findMany({ where, include: INCLUDE, orderBy: { created_at: 'desc' }, skip, take: limit }),
      this.prisma.presalesSurvey.count({ where }),
    ]);
    // ResponseInterceptor hanya meneruskan data + meta — total di top-level hilang
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const row = await this.prisma.presalesSurvey.findUnique({ where: { id_survey: id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Survey tidak ditemukan');
    return row;
  }

  async create(dto: CreatePresalesSurveyDto) {
    const data: any = { ...dto };
    if (data.tanggal_survey) data.tanggal_survey = new Date(data.tanggal_survey);
    if (data.tgl_order) data.tgl_order = new Date(data.tgl_order);
    if (data.tgl_estimasi_selesai) data.tgl_estimasi_selesai = new Date(data.tgl_estimasi_selesai);
    if (data.tgl_selesai) data.tgl_selesai = new Date(data.tgl_selesai);
    const row = await this.prisma.presalesSurvey.create({ data, include: INCLUDE });
    return row;
  }

  async update(id: number, dto: UpdatePresalesSurveyDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (data.tanggal_survey) data.tanggal_survey = new Date(data.tanggal_survey);
    if (data.tgl_order) data.tgl_order = new Date(data.tgl_order);
    if (data.tgl_estimasi_selesai) data.tgl_estimasi_selesai = new Date(data.tgl_estimasi_selesai);
    if (data.tgl_selesai) data.tgl_selesai = new Date(data.tgl_selesai);
    return this.prisma.presalesSurvey.update({ where: { id_survey: id }, data, include: INCLUDE });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.presalesSurvey.delete({ where: { id_survey: id } });
  }

  async getKaryawanList() {
    return this.prisma.hrisKaryawan.findMany({
      where: { status_aktif: true },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true },
      orderBy: { nama_lengkap: 'asc' },
    });
  }

  async getLayananList() {
    return this.prisma.masterLayanan.findMany({
      where: { is_aktif: true },
      select: { id_layanan: true, kode_layanan: true, nama_layanan: true },
      orderBy: { nama_layanan: 'asc' },
    });
  }

  async getOpportunityList() {
    return this.prisma.salesOpportunity.findMany({
      where: { tahapan: { notIn: ['Won', 'Lost'] } },
      select: {
        id_opportunity: true,
        nama_opportunity: true,
        lead: { select: { nama_prospek: true, nama_perusahaan: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
