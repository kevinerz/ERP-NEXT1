import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ─── DASHBOARD UTAMA ──────────────────────────────────────────

  async getDashboardKpi() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);

    const [
      totalKontrakAktif,
      kontrakAkanBerakhir,
      tiketOpen,
      tiketInProgress,
      proyekBerjalan,
      totalAset,
      mrcRow,
    ] = await Promise.all([
      this.prisma.kontrakLayanan.count({ where: { status_kontrak: 'Aktif' } }),
      this.prisma.kontrakLayanan.count({
        where: { status_kontrak: 'Aktif', tgl_berakhir: { lte: in30, gte: now } },
      }),
      this.prisma.operationTicket.count({ where: { status_tiket: 'Open' } }),
      this.prisma.operationTicket.count({ where: { status_tiket: 'In_Progress' } }),
      this.prisma.projectDelivery.count({ where: { status_project: { in: ['Kickoff', 'Instalasi', 'Testing'] } } }),
      this.prisma.gudangAset.count({ where: { status_aset: 'Di_Gudang' } }),
      this.prisma.kontrakLayanan.aggregate({
        _sum: { harga_mrc: true },
        where: { status_kontrak: 'Aktif' },
      }),
    ]);

    return {
      data: {
        kontrak_aktif: totalKontrakAktif,
        kontrak_akan_berakhir: kontrakAkanBerakhir,
        tiket_open: tiketOpen,
        tiket_in_progress: tiketInProgress,
        proyek_berjalan: proyekBerjalan,
        aset_di_gudang: totalAset,
        total_mrc_aktif: Number(mrcRow._sum.harga_mrc) || 0,
      },
    };
  }

  // ─── LAPORAN REVENUE (MRC per bulan 12 bulan terakhir) ────────

  async getRevenueChart() {
    const months: { label: string; mrc: number; kontrak_count: number }[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      const kontrak = await this.prisma.kontrakLayanan.findMany({
        where: {
          tgl_mulai: { lte: new Date(d.getFullYear(), d.getMonth() + 1, 0) },
          OR: [
            { tgl_berakhir: null },
            { tgl_berakhir: { gte: d } },
          ],
          status_kontrak: { in: ['Aktif', 'Akan_Berakhir'] },
        },
        select: { harga_mrc: true },
      });
      const mrc = kontrak.reduce((s, k) => s + Number(k.harga_mrc), 0);
      months.push({ label, mrc, kontrak_count: kontrak.length });
    }

    return { data: months };
  }

  // ─── LAPORAN TIKET ────────────────────────────────────────────

  async getTicketReport(query: { bulan?: number; tahun?: number }) {
    const now = new Date();
    const tahun = Number(query.tahun) || now.getFullYear();
    const bulan = Number(query.bulan) || now.getMonth() + 1;
    const start = new Date(tahun, bulan - 1, 1);
    const end = new Date(tahun, bulan, 0, 23, 59, 59);

    const [byStatus, byPrioritas, total, resolved] = await Promise.all([
      this.prisma.operationTicket.groupBy({
        by: ['status_tiket'],
        _count: { id_ticket: true },
        where: { tgl_open: { gte: start, lte: end } },
      }),
      this.prisma.operationTicket.groupBy({
        by: ['prioritas'],
        _count: { id_ticket: true },
        where: { tgl_open: { gte: start, lte: end } },
      }),
      this.prisma.operationTicket.count({ where: { tgl_open: { gte: start, lte: end } } }),
      this.prisma.operationTicket.count({ where: { tgl_open: { gte: start, lte: end }, status_tiket: { in: ['Resolved', 'Closed'] } } }),
    ]);

    return {
      data: {
        total,
        resolved,
        resolution_rate: total > 0 ? Math.round((resolved / total) * 100) : 0,
        by_status: byStatus.map((r) => ({ status: r.status_tiket, count: r._count.id_ticket })),
        by_prioritas: byPrioritas.map((r) => ({ prioritas: r.prioritas, count: r._count.id_ticket })),
      },
    };
  }

  // ─── LAPORAN PROYEK ───────────────────────────────────────────

  async getProyekReport() {
    const [byStatus, woByStatus, totalProyek] = await Promise.all([
      this.prisma.projectDelivery.groupBy({
        by: ['status_project'],
        _count: { id_project: true },
      }),
      this.prisma.workOrder.groupBy({
        by: ['status_wo'],
        _count: { id_wo: true },
      }),
      this.prisma.projectDelivery.count(),
    ]);

    return {
      data: {
        total_proyek: totalProyek,
        by_status: byStatus.map((r) => ({ status: r.status_project, count: r._count.id_project })),
        wo_by_status: woByStatus.map((r) => ({ status: r.status_wo, count: r._count.id_wo })),
      },
    };
  }

  // ─── LAPORAN ASET ─────────────────────────────────────────────

  async getAsetReport() {
    const [byStatus, byKategori, totalNilai] = await Promise.all([
      this.prisma.gudangAset.groupBy({
        by: ['status_aset'],
        _count: { id_aset: true },
        _sum: { stok_jumlah: true },
      }),
      this.prisma.gudangAset.groupBy({
        by: ['kategori'],
        _count: { id_aset: true },
      }),
      this.prisma.gudangAset.aggregate({
        _sum: { harga_perolehan: true },
      }),
    ]);

    return {
      data: {
        total_nilai: Number(totalNilai._sum.harga_perolehan) || 0,
        by_status: byStatus.map((r) => ({ status: r.status_aset, count: r._count.id_aset, stok: r._sum.stok_jumlah })),
        by_kategori: byKategori.map((r) => ({ kategori: r.kategori, count: r._count.id_aset })),
      },
    };
  }

  // ─── DASHBOARD SUMMARY (semua data untuk halaman dashboard) ───

  async getDashboardSummary() {
    const now = new Date();
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalPelanggan,
      kontrakAktif,
      mrcRow,
      tiketOpen,
      tiketInProgress,
      proyekBerjalan,
      kontrakAkanBerakhir,
      asetDiGudang,
      tiketByStatus,
      salesPipeline,
      tiketTerbaru,
      quotationTerbaru,
    ] = await Promise.all([
      this.prisma.pelanggan.count(),
      this.prisma.kontrakLayanan.count({ where: { status_kontrak: 'Aktif' } }),
      this.prisma.kontrakLayanan.aggregate({
        _sum: { harga_mrc: true },
        where: { status_kontrak: 'Aktif' },
      }),
      this.prisma.operationTicket.count({ where: { status_tiket: 'Open' } }),
      this.prisma.operationTicket.count({ where: { status_tiket: 'In_Progress' } }),
      this.prisma.projectDelivery.count({ where: { status_project: { in: ['Kickoff', 'Instalasi', 'Testing'] } } }),
      this.prisma.kontrakLayanan.count({ where: { status_kontrak: 'Aktif', tgl_berakhir: { lte: in30, gte: now } } }),
      this.prisma.gudangAset.count({ where: { status_aset: 'Di_Gudang' } }),
      this.prisma.operationTicket.groupBy({
        by: ['status_tiket'],
        _count: { id_ticket: true },
      }),
      Promise.all([
        this.prisma.salesLead.count({ where: { status_lead: { notIn: ['Disqualified'] } } }),
        this.prisma.salesOpportunity.count({ where: { tahapan: { notIn: ['Lost', 'Won'] } } }),
        this.prisma.salesQuotation.count({ where: { status_approval: 'Draft' } }),
        this.prisma.salesQuotation.count({ where: { status_approval: 'Approved' } }),
      ]),
      this.prisma.operationTicket.findMany({
        take: 6,
        orderBy: { tgl_open: 'desc' },
        include: {
          site: { select: { nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
          teknisi: { select: { nama_lengkap: true } },
        },
      }),
      this.prisma.salesQuotation.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
          opportunity: { select: { nama_opportunity: true, lead: { select: { nama_prospek: true } } } },
          sales_pic: { select: { nama_lengkap: true } },
        },
      }),
    ]);

    const [leads, opportunities, quotationDraft, quotationApproved] = salesPipeline;

    return {
      data: {
        kpi: {
          total_pelanggan: totalPelanggan,
          kontrak_aktif: kontrakAktif,
          total_mrc_aktif: Number(mrcRow._sum.harga_mrc) || 0,
          tiket_aktif: tiketOpen + tiketInProgress,
          tiket_open: tiketOpen,
          tiket_in_progress: tiketInProgress,
          proyek_berjalan: proyekBerjalan,
          kontrak_akan_berakhir: kontrakAkanBerakhir,
          aset_di_gudang: asetDiGudang,
        },
        tiket_by_status: tiketByStatus.map((r) => ({
          status: r.status_tiket,
          count: r._count.id_ticket,
        })),
        sales_pipeline: { leads, opportunities, quotation_draft: quotationDraft, quotation_approved: quotationApproved },
        tiket_terbaru: tiketTerbaru,
        quotation_terbaru: quotationTerbaru,
      },
    };
  }

  // ─── LAPORAN PELANGGAN ────────────────────────────────────────

  async getPelangganReport() {
    const pelanggan = await this.prisma.pelanggan.findMany({
      select: {
        nama_pelanggan: true,
        _count: { select: { sites: true } },
      },
      orderBy: { nama_pelanggan: 'asc' },
    });

    // Ambil kontrak aktif per pelanggan via site
    const kontrakPerPelanggan = await this.prisma.kontrakLayanan.groupBy({
      by: ['id_site'],
      _count: { id_kontrak: true },
      _sum: { harga_mrc: true },
      where: { status_kontrak: 'Aktif' },
    });

    return {
      data: {
        total_pelanggan: pelanggan.length,
        pelanggan: pelanggan.map((p) => ({
          nama: p.nama_pelanggan,
          total_site: p._count.sites,
        })),
        total_kontrak_aktif: kontrakPerPelanggan.reduce((s, r) => s + r._count.id_kontrak, 0),
      },
    };
  }
}
