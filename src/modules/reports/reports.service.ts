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

  // ─── LAPORAN BULANAN SLA PER PELANGGAN ───────────────────────

  async getLaporanBulanan(query: { pelanggan_id: number; bulan: number; tahun: number }) {
    const now = new Date();
    const pelangganId = Number(query.pelanggan_id);
    const bulan = Number(query.bulan);
    const tahun = Number(query.tahun);

    const start = new Date(tahun, bulan - 1, 1);
    const end = new Date(tahun, bulan, 0, 23, 59, 59, 999);

    const daysInMonth = new Date(tahun, bulan, 0).getDate();
    const total_menit_bulan = daysInMonth * 24 * 60;

    const BULAN_LABEL = ['Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'];
    const bulanStr = BULAN_LABEL[bulan - 1];

    const durasi_str = (menit: number): string => {
      const m = Math.max(0, Math.round(menit));
      if (m < 60) return `${m}m`;
      const j = Math.floor(m / 60);
      return `${j}j ${m % 60}m`;
    };

    const pad = (n: number) => String(n).padStart(2, '0');

    const pelanggan = await this.prisma.pelanggan.findUnique({
      where: { id_pelanggan: pelangganId },
      select: { nama_pelanggan: true, kode_pelanggan: true, nama_pic_utama: true },
    });

    if (!pelanggan) throw new Error('Pelanggan tidak ditemukan');

    const sites = await this.prisma.sitePelanggan.findMany({
      where: { id_pelanggan: pelangganId },
      include: { layanan: true },
    });

    const siteIds = sites.map(s => s.id_site);

    const tickets = await this.prisma.operationTicket.findMany({
      where: {
        id_site: { in: siteIds },
        tgl_open: { gte: start, lte: end },
      },
      include: { site: { include: { layanan: true } } },
      orderBy: { tgl_open: 'asc' },
    });

    // Per-site downtime aggregation
    const siteDataMap = new Map<number, {
      id_site: number; nama_site: string; kode_site: string;
      kode_layanan: string; nama_layanan: string; target_sla: number;
      downtime_menit: number; ticket_count: number;
    }>();

    for (const s of sites) {
      siteDataMap.set(s.id_site, {
        id_site: s.id_site,
        nama_site: s.nama_site,
        kode_site: s.kode_site,
        kode_layanan: s.layanan?.kode_layanan ?? '—',
        nama_layanan: s.layanan?.nama_layanan ?? '—',
        target_sla: Number(s.layanan?.sla_target_pct ?? 95),
        downtime_menit: 0,
        ticket_count: 0,
      });
    }

    for (const t of tickets) {
      const sd = siteDataMap.get(t.id_site);
      if (!sd) continue;
      const resolved = t.tgl_resolved ?? now;
      sd.downtime_menit += Math.round((resolved.getTime() - t.tgl_open.getTime()) / 60000);
      sd.ticket_count++;
    }

    const sitesResult = Array.from(siteDataMap.values()).map(s => {
      const uptime_pct = Math.round(Math.max(0, Math.min(100,
        (1 - s.downtime_menit / total_menit_bulan) * 100)) * 1000) / 1000;
      return {
        id_site: s.id_site,
        nama_site: s.nama_site,
        kode_site: s.kode_site,
        kode_layanan: s.kode_layanan,
        nama_layanan: s.nama_layanan,
        target_sla: s.target_sla,
        downtime_menit: s.downtime_menit,
        durasi_str: durasi_str(s.downtime_menit),
        uptime_pct,
        sla_ok: uptime_pct >= s.target_sla,
        _ticket_count: s.ticket_count,
      };
    });

    const site_memenuhi_sla = sitesResult.filter(s => s.sla_ok).length;
    const site_tanpa_gangguan = sitesResult.filter(s => s._ticket_count === 0).length;
    const rata_rata_uptime = sitesResult.length > 0
      ? Math.round(sitesResult.reduce((sum, s) => sum + s.uptime_pct, 0) / sitesResult.length * 1000) / 1000
      : 100;

    const resolved_tickets = tickets.filter(t => t.tgl_resolved);
    const avg_mttr_menit = resolved_tickets.length > 0
      ? Math.round(resolved_tickets.reduce((sum, t) =>
          sum + (t.tgl_resolved!.getTime() - t.tgl_open.getTime()) / 60000, 0) / resolved_tickets.length)
      : 0;

    // Per segmen (layanan)
    const segmenMap = new Map<number, {
      kode_layanan: string; nama_layanan: string; target_sla: number;
      siteList: typeof sitesResult;
    }>();

    for (const s of sites) {
      const layId = s.id_layanan;
      if (!segmenMap.has(layId)) {
        segmenMap.set(layId, {
          kode_layanan: s.layanan?.kode_layanan ?? '—',
          nama_layanan: s.layanan?.nama_layanan ?? '—',
          target_sla: Number(s.layanan?.sla_target_pct ?? 95),
          siteList: [],
        });
      }
      const sr = sitesResult.find(r => r.id_site === s.id_site);
      if (sr) segmenMap.get(layId)!.siteList.push(sr);
    }

    const per_segmen = Array.from(segmenMap.values()).map(seg => {
      const memenuhi = seg.siteList.filter(s => s.sla_ok).length;
      const rata_uptime = seg.siteList.length > 0
        ? seg.siteList.reduce((sum, s) => sum + s.uptime_pct, 0) / seg.siteList.length : 100;
      const rata_downtime = seg.siteList.length > 0
        ? seg.siteList.reduce((sum, s) => sum + s.downtime_menit, 0) / seg.siteList.length : 0;
      return {
        kode_layanan: seg.kode_layanan,
        nama_layanan: seg.nama_layanan,
        jumlah_site: seg.siteList.length,
        target_sla: seg.target_sla,
        rata_rata_uptime: Math.round(rata_uptime * 1000) / 1000,
        rata_rata_downtime_menit: Math.round(rata_downtime),
        memenuhi_sla: memenuhi,
        belum_memenuhi: seg.siteList.length - memenuhi,
        status: (rata_uptime >= seg.target_sla ? 'TERCAPAI' : 'PERLU_PERHATIAN') as 'TERCAPAI' | 'PERLU_PERHATIAN',
      };
    });

    // Top 10 by frequency / duration
    const siteTicketMap = new Map<number, { nama_site: string; kode_layanan: string; durations: number[] }>();
    for (const t of tickets) {
      const sd = siteDataMap.get(t.id_site);
      if (!sd) continue;
      if (!siteTicketMap.has(t.id_site)) {
        siteTicketMap.set(t.id_site, { nama_site: sd.nama_site, kode_layanan: sd.kode_layanan, durations: [] });
      }
      const resolved = t.tgl_resolved ?? now;
      siteTicketMap.get(t.id_site)!.durations.push(
        Math.round((resolved.getTime() - t.tgl_open.getTime()) / 60000));
    }

    const siteTicketArr = Array.from(siteTicketMap.values()).map(v => {
      const total = v.durations.reduce((s, d) => s + d, 0);
      return {
        nama_site: v.nama_site,
        kode_layanan: v.kode_layanan,
        jumlah_tiket: v.durations.length,
        total_durasi_menit: total,
        rata_durasi_menit: v.durations.length > 0 ? Math.round(total / v.durations.length) : 0,
      };
    });

    const top10_frekuensi = [...siteTicketArr]
      .sort((a, b) => b.jumlah_tiket - a.jumlah_tiket).slice(0, 10)
      .map(s => ({ ...s, durasi_str: durasi_str(s.total_durasi_menit) }));

    const top10_durasi = [...siteTicketArr]
      .sort((a, b) => b.total_durasi_menit - a.total_durasi_menit).slice(0, 10)
      .map(s => ({ ...s, durasi_str: durasi_str(s.total_durasi_menit) }));

    const ticketsResult = tickets.map(t => {
      const durasi_menit = t.tgl_resolved
        ? Math.round((t.tgl_resolved.getTime() - t.tgl_open.getTime()) / 60000)
        : Math.round((now.getTime() - t.tgl_open.getTime()) / 60000);
      return {
        nomor_tiket: t.nomor_tiket,
        status_tiket: t.status_tiket,
        tgl_open: t.tgl_open,
        tgl_resolved: t.tgl_resolved,
        nama_site: t.site?.nama_site ?? '—',
        kode_layanan: t.site?.layanan?.kode_layanan ?? '—',
        judul_tiket: t.judul_tiket,
        durasi_menit,
        durasi_str: durasi_str(durasi_menit),
      };
    });

    const lastDay = daysInMonth;

    return {
      pelanggan,
      periode: `${bulanStr} ${tahun}`,
      periode_range: `${pad(1)}–${pad(lastDay)} ${bulanStr} ${tahun}`,
      generated_at: now,
      summary: {
        total_site: sitesResult.length,
        site_memenuhi_sla,
        site_tanpa_gangguan,
        rata_rata_uptime,
        total_tiket: tickets.length,
        avg_mttr_menit,
      },
      per_segmen,
      sites: sitesResult.map(({ _ticket_count: _, ...rest }) => rest),
      top10_frekuensi,
      top10_durasi,
      tickets: ticketsResult,
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

    // Fetch tickets in period + semua pelanggan & layanan aktif (untuk tampilkan 100% meski 0 tiket)
    const [tickets, activeSites, activeLayanan] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where: { tgl_open: { gte: start, lte: end } },
        include: { site: { include: { pelanggan: true, layanan: true } } },
      }),
      this.prisma.sitePelanggan.findMany({
        where: { status_site: { in: ['Aktif', 'aktif'] } },
        include: { pelanggan: true, layanan: true },
      }),
      this.prisma.masterLayanan.findMany({
        where: { is_aktif: true },
      }),
    ]);

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

    // Per pelanggan — seed dari semua pelanggan aktif, merge tiket
    const pelangganMap = new Map<number, {
      id_pelanggan: number; nama_pelanggan: string; kode_pelanggan: string;
      total_tiket: number; breach: number; max_target: number;
    }>();
    // Seed: semua pelanggan dengan site aktif
    for (const s of activeSites) {
      const p = s.pelanggan;
      const id = p.id_pelanggan;
      if (!pelangganMap.has(id)) {
        pelangganMap.set(id, {
          id_pelanggan: id,
          nama_pelanggan: p.nama_pelanggan,
          kode_pelanggan: p.kode_pelanggan,
          total_tiket: 0, breach: 0, max_target: slaPct(s.layanan),
        });
      } else {
        const e = pelangganMap.get(id)!;
        const tp = slaPct(s.layanan);
        if (tp > e.max_target) e.max_target = tp;
      }
    }
    // Merge tiket
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
          total_tiket: 0, breach: 0, max_target: slaPct(l),
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

    // Per layanan — seed dari semua layanan aktif, merge tiket
    const layananMap = new Map<number, {
      id_layanan: number; kode_layanan: string; nama_layanan: string;
      target_pct: number; total_tiket: number; breach: number;
    }>();
    for (const l of activeLayanan) {
      layananMap.set(l.id_layanan, {
        id_layanan: l.id_layanan,
        kode_layanan: l.kode_layanan,
        nama_layanan: l.nama_layanan,
        target_pct: slaPct(l),
        total_tiket: 0, breach: 0,
      });
    }
    for (const t of tickets) {
      const l = t.site?.layanan;
      if (!l) continue;
      const entry = layananMap.get(l.id_layanan);
      if (!entry) continue;
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
