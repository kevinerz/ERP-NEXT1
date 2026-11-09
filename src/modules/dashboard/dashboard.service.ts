import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WaStatistikService } from '../whatsapp/wa-statistik.service';

export interface UserDashboard {
  id_karyawan?: number;
  nama_lengkap: string;
  departemen: string;
  roles: string[];
  modul_akses: string[];
}

const WIB = 7 * 3600_000;
const TIKET_AKTIF = ['Open', 'In_Progress', 'Pending'];
const WO_SELESAI = ['Completed', 'Cancelled'];
const TAHAP_PB = ['Draft', 'Sales', 'OPS', 'Network', 'Instalasi', 'NOC', 'Finance'];

/** Awal hari & awal bulan WIB (dalam UTC) */
function batasWaktu() {
  const s = new Date(Date.now() + WIB);
  const hari = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - WIB);
  const bulan = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1) - WIB);
  const tgl = s.toISOString().slice(0, 10);
  return { hari, besok: new Date(hari.getTime() + 86_400_000), bulan, tgl };
}

/**
 * Dashboard per akun: tiap bagian hanya dihitung bila user punya akses modulnya,
 * sehingga Helpdesk, NOC, Teknisi, Sales, OPS, dan Finance melihat pekerjaannya sendiri
 * tanpa butuh akses modul Laporan.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger('Dashboard');
  private cacheWa: { t: number; data: any } | null = null;

  constructor(private prisma: PrismaService, private waStat: WaStatistikService) {}

  async saya(u: UserDashboard) {
    const semua = !u.modul_akses?.length;
    const bisa = (...m: string[]) => semua || m.some((x) => u.modul_akses.includes(x));
    const idk = u.id_karyawan ?? -1;
    const w = batasWaktu();

    const tugas = async <T>(nama: string, f: () => Promise<T>): Promise<T | null> => {
      try { return await f(); } catch (e: any) { this.logger.warn(`Bagian ${nama} gagal: ${e?.message}`); return null; }
    };

    const [helpdesk, wa, noc, tugasSaya, pasangBaru, sales, keuangan] = await Promise.all([
      bisa('operations') ? tugas('helpdesk', () => this.helpdesk(idk, w)) : null,
      bisa('whatsapp') ? tugas('wa', () => this.wa(idk, u.nama_lengkap, w.tgl)) : null,
      bisa('operations') ? tugas('noc', () => this.noc(w)) : null,
      u.id_karyawan ? tugas('tugas', () => this.tugasSaya(idk)) : null,
      bisa('sales', 'operations', 'instalasi', 'finance') ? tugas('pasang_baru', () => this.pasangBaru(idk)) : null,
      bisa('sales', 'crm') ? tugas('sales', () => this.sales(idk)) : null,
      bisa('finance') ? tugas('keuangan', () => this.keuangan()) : null,
    ]);

    return {
      data: {
        divisi: u.departemen,
        eksekutif: bisa('reports'),
        helpdesk, wa, noc, tugas_saya: tugasSaya, pasang_baru: pasangBaru, sales, keuangan,
      },
    };
  }

  private async helpdesk(idk: number, w: ReturnType<typeof batasWaktu>) {
    const t = this.prisma.operationTicket;
    const [perStatus, dibukaHariIni, selesaiHariIni, bulanIni, breach, punyaSaya, daftar] = await Promise.all([
      t.groupBy({ by: ['status_tiket'], where: { status_tiket: { in: TIKET_AKTIF } }, _count: { _all: true } }),
      t.count({ where: { tgl_open: { gte: w.hari } } }),
      t.count({ where: { tgl_resolved: { gte: w.hari } } }),
      t.count({ where: { tgl_open: { gte: w.bulan } } }),
      t.count({ where: { tgl_open: { gte: w.bulan }, sla_breached: true } }),
      t.count({ where: { status_tiket: { in: TIKET_AKTIF }, id_teknisi_pic: idk } }),
      t.findMany({
        where: { status_tiket: { in: TIKET_AKTIF } },
        orderBy: { tgl_open: 'asc' },
        take: 8,
        select: {
          id_ticket: true, nomor_tiket: true, judul_tiket: true, status_tiket: true, tgl_open: true, sla_breached: true,
          site: { select: { nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
          teknisi: { select: { nama_lengkap: true } },
        },
      }),
    ]);
    const n = (s: string) => perStatus.find((r) => r.status_tiket === s)?._count._all ?? 0;
    return {
      open: n('Open'), in_progress: n('In_Progress'), pending: n('Pending'),
      dibuka_hari_ini: dibukaHariIni, selesai_hari_ini: selesaiHariIni, saya: punyaSaya,
      tiket_bulan_ini: bulanIni, sla_breach: breach,
      sla_pct: bulanIni ? Math.round(((bulanIni - breach) / bulanIni) * 1000) / 10 : 100,
      daftar,
    };
  }

  private async wa(idk: number, nama: string, tgl: string) {
    // Statistik WA cukup berat (memindai pesan 8 hari) — cukup dihitung ulang tiap menit
    if (!this.cacheWa || Date.now() - this.cacheWa.t > 60_000) {
      this.cacheWa = { t: Date.now(), data: await this.waStat.ringkasan({ dari: tgl, sampai: tgl } as any) };
    }
    const r = this.cacheWa.data;
    const [picSaya, belumDibaca] = await Promise.all([
      this.prisma.waChat.count({ where: { id_karyawan_pic: idk, status: 'Terbuka' } }),
      this.prisma.waChat.count({ where: { status: 'Terbuka', belum_dibaca: { gt: 0 } } }),
    ]);
    const saya = (r.staf as any[]).find((s) => s.nama === nama) ?? null;
    return {
      masuk: r.kpi.masuk, keluar: r.kpi.keluar, chat_aktif: r.kpi.chat_aktif,
      dibalas: r.kpi.dibalas, tidak_dibalas: r.kpi.tidak_dibalas, respon_median: r.kpi.respon_median,
      pct_15menit: r.kpi.pct_15menit, antrean: r.kpi.antrean, belum_dibaca: belumDibaca,
      pic_saya: picSaya,
      saya: saya ? { pesan: saya.pesan, chat: saya.chat, respon_median: saya.respon_median } : null,
      daftar_antrean: (r.antrean as any[]).slice(0, 6),
    };
  }

  private async noc(w: ReturnType<typeof batasWaktu>) {
    const [router, gangguan, woAktif, visitHariIni, antreVisit, offlineTerbaru] = await Promise.all([
      this.prisma.nocaasRouter.groupBy({ by: ['status'], where: { id_site: { not: null } }, _count: { _all: true } }),
      this.prisma.nocaasGangguan.groupBy({ by: ['kategori'], where: { selesai_at: null }, _count: { _all: true } }),
      this.prisma.workOrder.count({ where: { status_wo: { notIn: WO_SELESAI } } }),
      this.prisma.workOrder.count({ where: { tgl_jadwal: { gte: w.hari, lt: w.besok }, status_wo: { not: 'Cancelled' } } }),
      this.prisma.workOrder.count({ where: { tgl_jadwal: null, status_wo: 'Open' } }),
      this.prisma.nocaasRouter.findMany({
        where: { status: 'offline', id_site: { not: null } },
        orderBy: { status_sejak: 'desc' },
        take: 6,
        select: { site_key: true, status_sejak: true, site: { select: { id_site: true, nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } } },
      }),
    ]);
    const r = (s: string) => router.find((x) => x.status === s)?._count._all ?? 0;
    return {
      online: r('online'), partial: r('partial') + r('internet_ok'), offline: r('offline'),
      gangguan: gangguan.map((g) => ({ kategori: g.kategori, n: g._count._all })),
      wo_aktif: woAktif, visit_hari_ini: visitHariIni, antre_visit: antreVisit,
      offline_terbaru: offlineTerbaru,
    };
  }

  private async tugasSaya(idk: number) {
    const [wo, tiket] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { id_teknisi_internal: idk, status_wo: { notIn: WO_SELESAI } },
        orderBy: [{ tgl_jadwal: 'asc' }, { id_wo: 'asc' }],
        take: 8,
        select: {
          id_wo: true, nomor_wo: true, status_wo: true, tgl_jadwal: true, jam_jadwal: true, deskripsi_tugas: true,
          site: { select: { nama_site: true, kota: true } },
        },
      }),
      this.prisma.operationTicket.findMany({
        where: { id_teknisi_pic: idk, status_tiket: { in: TIKET_AKTIF } },
        orderBy: { tgl_open: 'asc' },
        take: 8,
        select: { id_ticket: true, nomor_tiket: true, judul_tiket: true, status_tiket: true, tgl_open: true, site: { select: { nama_site: true } } },
      }),
    ]);
    return wo.length || tiket.length ? { wo, tiket } : null;
  }

  private async pasangBaru(idk: number) {
    const [order, survey, sph, surveySaya, sphSaya] = await Promise.all([
      this.prisma.pbOrder.groupBy({ by: ['tahap'], where: { tahap: { in: TAHAP_PB } }, _count: { _all: true } }),
      this.prisma.pbSurvey.groupBy({ by: ['status'], where: { status: { notIn: ['Batal', 'Lanjut SPH'] } }, _count: { _all: true } }),
      this.prisma.pbSph.groupBy({ by: ['status'], where: { status: { in: ['Draft', 'Menunggu Director'] } }, _count: { _all: true } }),
      this.prisma.pbSurvey.count({ where: { id_sales: idk, status: { notIn: ['Batal', 'Lanjut SPH'] } } }),
      this.prisma.pbSph.count({ where: { id_sales: idk, status: { in: ['Draft', 'Menunggu Director'] } } }),
    ]);
    return {
      order: order.map((o) => ({ tahap: o.tahap, n: o._count._all })),
      survey: survey.map((o) => ({ status: o.status, n: o._count._all })),
      sph: sph.map((o) => ({ status: o.status, n: o._count._all })),
      survey_saya: surveySaya, sph_saya: sphSaya,
    };
  }

  private async sales(idk: number) {
    const [lead, leadSaya, opp, oppSaya, quoDraft, quoSaya] = await Promise.all([
      this.prisma.salesLead.count({ where: { status_lead: { notIn: ['Disqualified', 'Converted'] } } }),
      this.prisma.salesLead.count({ where: { id_sales_pic: idk, status_lead: { notIn: ['Disqualified', 'Converted'] } } }),
      this.prisma.salesOpportunity.count({ where: { tahapan: { notIn: ['Won', 'Lost'] } } }),
      this.prisma.salesOpportunity.count({ where: { id_sales_pic: idk, tahapan: { notIn: ['Won', 'Lost'] } } }),
      this.prisma.salesQuotation.count({ where: { status_approval: 'Draft' } }),
      this.prisma.salesQuotation.count({ where: { id_sales_pic: idk, status_approval: 'Draft' } }),
    ]);
    return { lead, lead_saya: leadSaya, opportunity: opp, opportunity_saya: oppSaya, quotation_draft: quoDraft, quotation_saya: quoSaya };
  }

  private async keuangan() {
    const now = new Date();
    const in30 = new Date(Date.now() + 30 * 86_400_000);
    const [overdue, mrc, kontrakAktif, berakhir] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { status: 'Jatuh_Tempo' }, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.kontrakLayanan.aggregate({ where: { status_kontrak: 'Aktif' }, _sum: { harga_mrc: true } }),
      this.prisma.kontrakLayanan.count({ where: { status_kontrak: 'Aktif' } }),
      this.prisma.kontrakLayanan.count({ where: { status_kontrak: 'Aktif', tgl_berakhir: { gte: now, lte: in30 } } }),
    ]);
    return {
      invoice_overdue: overdue._count._all, nilai_overdue: Number(overdue._sum.total) || 0,
      mrc_aktif: Number(mrc._sum.harga_mrc) || 0, kontrak_aktif: kontrakAktif, kontrak_berakhir_30: berakhir,
    };
  }
}
