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

  // ─── LAPORAN SLA ──────────────────────────────────────────────

  async getSlaReport(query: { bulan?: number; tahun?: number; mode?: string }) {
    const now = new Date();
    const tahun = Number(query.tahun) || now.getFullYear();
    const bulan = Number(query.bulan) || now.getMonth() + 1;
    const mode: 'month' | 'year' = query.mode === 'year' ? 'year' : 'month';

    let start: Date, end: Date;
    if (mode === 'year') {
      start = new Date(tahun, 0, 1);
      end = new Date(tahun, 11, 31, 23, 59, 59);
    } else {
      start = new Date(tahun, bulan - 1, 1);
      end = new Date(tahun, bulan, 0, 23, 59, 59);
    }

    const BULAN_LABEL = ['Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'];
    const periode = mode === 'year' ? `${tahun}` : `${BULAN_LABEL[bulan - 1]} ${tahun}`;

    const slaPct = (l: { sla_target_pct: any } | null | undefined): number =>
      l ? Number(l.sla_target_pct) : 95;

    const compliance = (total: number, breach: number): number =>
      total === 0 ? 100.0 : Math.round(((total - breach) / total) * 1000) / 10;

    // Fetch all tickets in period
    const tickets = await this.prisma.operationTicket.findMany({
      where: { tgl_open: { gte: start, lte: end } },
      include: {
        site: { include: { pelanggan: true, layanan: true } },
      },
    });

    // Summary — "FO" = semua layanan dengan target >= 99%
    const total_tiket = tickets.length;
    const total_resolved = tickets.filter(t => t.status_tiket === 'Resolved' || t.status_tiket === 'Closed').length;
    const total_breach = tickets.filter(t => t.sla_breached).length;
    const fo_tickets = tickets.filter(t => slaPct(t.site?.layanan) >= 99);
    const fo_breach = fo_tickets.filter(t => t.sla_breached).length;
    const resolved_with_time = tickets.filter(t => t.tgl_resolved);
    const avg_mttr_menit = resolved_with_time.length > 0
      ? Math.round(resolved_with_time.reduce((sum, t) =>
          sum + (t.tgl_resolved!.getTime() - t.tgl_open.getTime()) / 60000, 0) / resolved_with_time.length)
      : 0;

    // Trend: last 12 months (always, ignoring mode)
    const trend: Array<{
      bulan: string; total: number; breach: number; compliance_pct: number;
      fo_total: number; fo_breach: number; fo_compliance_pct: number;
    }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });

      const mTickets = await this.prisma.operationTicket.findMany({
        where: { tgl_open: { gte: mStart, lte: mEnd } },
        include: { site: { include: { layanan: true } } },
      });
      const mTotal = mTickets.length;
      const mBreach = mTickets.filter(t => t.sla_breached).length;
      const mFo = mTickets.filter(t => slaPct(t.site?.layanan) >= 99);
      const mFoTotal = mFo.length;
      const mFoBreach = mFo.filter(t => t.sla_breached).length;

      trend.push({
        bulan: label,
        total: mTotal,
        breach: mBreach,
        compliance_pct: compliance(mTotal, mBreach),
        fo_total: mFoTotal,
        fo_breach: mFoBreach,
        fo_compliance_pct: compliance(mFoTotal, mFoBreach),
      });
    }

    // Per pelanggan — target = target tertinggi dari layanan yg dipakai pelanggan tsb
    const pelangganMap = new Map<number, {
      id_pelanggan: number; nama_pelanggan: string; kode_pelanggan: string;
      total_tiket: number; breach: number; max_target: number;
    }>();
    for (const t of tickets) {
      const p = t.site?.pelanggan;
      const l = t.site?.layanan;
      if (!p) continue;
      const id = p.id_pelanggan;
      if (!pelangganMap.has(id)) {
        pelangganMap.set(id, {
          id_pelanggan: id,
          nama_pelanggan: p.nama_pelanggan,
          kode_pelanggan: p.kode_pelanggan,
          total_tiket: 0, breach: 0, max_target: 95,
        });
      }
      const entry = pelangganMap.get(id)!;
      entry.total_tiket++;
      if (t.sla_breached) entry.breach++;
      const tp = slaPct(l);
      if (tp > entry.max_target) entry.max_target = tp;
    }
    const per_pelanggan = Array.from(pelangganMap.values()).map(p => {
      const target_pct = p.max_target;
      const compliance_pct = compliance(p.total_tiket, p.breach);
      return {
        id_pelanggan: p.id_pelanggan,
        nama_pelanggan: p.nama_pelanggan,
        kode_pelanggan: p.kode_pelanggan,
        total_tiket: p.total_tiket,
        breach: p.breach,
        compliance_pct,
        target_pct,
        status: (compliance_pct >= target_pct ? 'OK' : 'BREACH') as 'OK' | 'BREACH',
      };
    }).sort((a, b) => a.compliance_pct - b.compliance_pct);

    // Per layanan — target dari sla_target_pct di DB
    const layananMap = new Map<number, {
      id_layanan: number; kode_layanan: string; nama_layanan: string;
      target_pct: number; total_tiket: number; breach: number;
    }>();
    for (const t of tickets) {
      const l = t.site?.layanan;
      if (!l) continue;
      const id = l.id_layanan;
      if (!layananMap.has(id)) {
        layananMap.set(id, {
          id_layanan: id,
          kode_layanan: l.kode_layanan,
          nama_layanan: l.nama_layanan,
          target_pct: slaPct(l),
          total_tiket: 0, breach: 0,
        });
      }
      const entry = layananMap.get(id)!;
      entry.total_tiket++;
      if (t.sla_breached) entry.breach++;
    }
    const per_layanan = Array.from(layananMap.values()).map(l => {
      const compliance_pct = compliance(l.total_tiket, l.breach);
      return {
        id_layanan: l.id_layanan,
        kode_layanan: l.kode_layanan,
        nama_layanan: l.nama_layanan,
        target_pct: l.target_pct,
        total_tiket: l.total_tiket,
        breach: l.breach,
        compliance_pct,
        status: (compliance_pct >= l.target_pct ? 'OK' : 'BREACH') as 'OK' | 'BREACH',
      };
    }).sort((a, b) => a.compliance_pct - b.compliance_pct);

    // Breach detail: sla_breached tickets in period
    const breachTickets = await this.prisma.operationTicket.findMany({
      where: { tgl_open: { gte: start, lte: end }, sla_breached: true },
      include: { site: { include: { pelanggan: true, layanan: true } } },
      take: 100,
    });
    const breach_detail = breachTickets.map(t => {
      const terlambat_menit = t.sla_due
        ? Math.round(((t.tgl_resolved ?? now).getTime() - t.sla_due.getTime()) / 60000)
        : 0;
      return {
        id_ticket: t.id_ticket,
        nomor_tiket: t.nomor_tiket,
        judul_tiket: t.judul_tiket,
        prioritas: t.prioritas,
        nama_pelanggan: t.site?.pelanggan?.nama_pelanggan ?? '—',
        nama_site: t.site?.nama_site ?? '—',
        kode_layanan: t.site?.layanan?.kode_layanan ?? '—',
        tgl_open: t.tgl_open,
        sla_due: t.sla_due,
        tgl_resolved: t.tgl_resolved,
        terlambat_menit,
        status_tiket: t.status_tiket,
      };
    }).sort((a, b) => b.terlambat_menit - a.terlambat_menit);

    return {
      data: {
        periode,
        mode,
        target_umum: 95,
        target_fo: 99,
        summary: {
          total_tiket,
          total_resolved,
          total_breach,
          compliance_pct: compliance(total_tiket, total_breach),
          compliance_fo_pct: compliance(fo_tickets.length, fo_breach),
          avg_mttr_menit,
        },
        trend,
        per_pelanggan,
        per_layanan,
        breach_detail,
      },
    };
  }

}
