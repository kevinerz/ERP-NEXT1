import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PrtgService } from '../integrations/prtg/prtg.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private prtg: PrtgService,
  ) {}

  // ── Auth ──────────────────────────────────────────────────

  async login(email: string, password: string) {
    const user = await this.prisma.customerUser.findUnique({
      where: { email },
      include: { pelanggan: { select: { id_pelanggan: true, nama_pelanggan: true, kode_pelanggan: true } } },
    });

    if (!user) throw new UnauthorizedException('Email atau password salah');
    if (!user.is_aktif) throw new UnauthorizedException('Akun tidak aktif');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('Email atau password salah');

    await this.prisma.customerUser.update({
      where: { id_user: user.id_user },
      data: { last_login: new Date() },
    });

    const token = this.jwt.sign({
      sub: user.id_user,
      email: user.email,
      id_pelanggan: user.id_pelanggan,
      type: 'customer',
    });

    return {
      access_token: token,
      user: {
        id_user:      user.id_user,
        email:        user.email,
        nama:         user.nama,
        id_pelanggan: user.id_pelanggan,
        pelanggan:    user.pelanggan,
      },
    };
  }

  // ── Sites ─────────────────────────────────────────────────

  async getSites(id_pelanggan: number) {
    const sites = await this.prisma.sitePelanggan.findMany({
      where: { id_pelanggan },
      orderBy: { nama_site: 'asc' },
      include: {
        layanan:    { select: { nama_layanan: true, kode_layanan: true } },
        perangkat:  { select: { jenis_perangkat: true, merk: true, tipe_model: true, ip_address: true, status_perangkat: true } },
        tickets:    { where: { status_tiket: { in: ['Open', 'In_Progress'] } }, select: { id_ticket: true } },
        prtg_mapping:       { select: { device_name: true }, take: 1 },
        uptimekuma_mapping: { select: { monitor_id: true, monitor_name: true }, take: 1 },
      },
    });

    return sites.map((s: any) => ({
      id_site:     s.id_site,
      kode_site:   s.kode_site,
      nama_site:   s.nama_site,
      alamat:      s.alamat_lengkap,
      kota:        s.kota,
      provinsi:    s.provinsi,
      status_site: s.status_site,
      tgl_aktif:   s.tgl_aktif,
      layanan:     s.layanan,
      tiket_aktif: s.tickets.length,
      perangkat:   s.perangkat,
      monitoring:  this.resolveMonitorStatus(s.prtg_mapping[0] ?? null, s.uptimekuma_mapping[0] ?? null),
    }));
  }

  private resolveMonitorStatus(prtg: any, uptime: any) {
    if (uptime) return { sumber: 'UptimeKuma', status: null, sensor: uptime.monitor_name };
    if (prtg)   return { sumber: 'PRTG',       status: null, sensor: prtg.device_name };
    return null;
  }

  // ── Tickets ───────────────────────────────────────────────

  async getTickets(id_pelanggan: number, query: { status?: string; id_site?: string; page?: number; limit?: number }) {
    const page  = Number(query.page)  || 1;
    const limit = Number(query.limit) || 20;
    const skip  = (page - 1) * limit;

    const where: any = { site: { id_pelanggan } };
    if (query.status)  where.status_tiket = query.status;
    if (query.id_site) where.id_site = Number(query.id_site);

    const [data, total] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where,
        orderBy: { tgl_open: 'desc' },
        skip,
        take: limit,
        include: {
          site: { select: { nama_site: true, kode_site: true } },
          logs: { orderBy: { created_at: 'desc' }, take: 1, select: { catatan: true, created_at: true } },
        },
      }),
      this.prisma.operationTicket.count({ where }),
    ]);

    return {
      data: (data as any[]).map(t => ({
        id_ticket:       t.id_ticket,
        nomor_tiket:     t.nomor_tiket,
        judul:           t.judul_tiket,
        deskripsi:       t.deskripsi_masalah,
        status:          t.status_tiket,
        prioritas:       t.prioritas,
        tgl_open:        t.tgl_open,
        tgl_resolved:    t.tgl_resolved,
        tgl_closed:      t.tgl_closed,
        sla_due:         t.sla_due,
        sla_breached:    t.sla_breached,
        site:            t.site,
        update_terakhir: t.logs[0] ?? null,
      })),
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  async getTicketDetail(id_pelanggan: number, id_ticket: number) {
    const ticket = await this.prisma.operationTicket.findFirst({
      where: { id_ticket, site: { id_pelanggan } },
      include: {
        site: { select: { nama_site: true, kode_site: true } },
        logs: {
          orderBy: { created_at: 'desc' },
          select: { id_log: true, catatan: true, status_dari: true, status_ke: true, created_at: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');
    return ticket;
  }

  // ── Sensor Ping & Traffic per Site (portal customer) ─────

  async getSiteSensorsForPortal(id_pelanggan: number, id_site: number) {
    // Pastikan site memang milik pelanggan ini
    const site = await this.prisma.sitePelanggan.findFirst({ where: { id_site, id_pelanggan } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');
    return this.prtg.getSiteSensors(id_site);
  }

  async getSensorHistoryForPortal(id_pelanggan: number, id_site: number, objid: number, hours = 24) {
    const site = await this.prisma.sitePelanggan.findFirst({ where: { id_site, id_pelanggan } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');
    return this.prtg.getSensorHistory(objid, hours);
  }

  async getSensorGraphForPortal(id_pelanggan: number, id_site: number, objid: number, graphid = 0) {
    const site = await this.prisma.sitePelanggan.findFirst({ where: { id_site, id_pelanggan } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');
    return this.prtg.getSensorGraph(objid, graphid);
  }

  // ── SLA Portal ────────────────────────────────────────────

  async getSlaForPortal(id_pelanggan: number, query: { bulan?: number; tahun?: number; mode?: string }) {
    const now   = new Date();
    const tahun = Number(query.tahun) || now.getFullYear();
    const bulan = Number(query.bulan) || (now.getMonth() + 1);
    const mode  = query.mode;

    // Date range
    let start: Date, end: Date, periodeLabel: string;
    if (mode === 'year') {
      start = new Date(tahun, 0, 1);
      end   = new Date(tahun, 11, 31, 23, 59, 59, 999);
      periodeLabel = `Tahun ${tahun}`;
    } else {
      start = new Date(tahun, bulan - 1, 1);
      end   = new Date(tahun, bulan, 0, 23, 59, 59, 999);
      const BULAN_IDN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      periodeLabel = `${BULAN_IDN[bulan - 1]} ${tahun}`;
    }

    // Get all sites for this pelanggan including layanan
    const sites = await this.prisma.sitePelanggan.findMany({
      where: { id_pelanggan },
      include: { layanan: true },
    });
    const siteIds = sites.map((s: any) => s.id_site);

    // Compute max target_pct from all layanan
    let maxTargetPct = 99.0;
    for (const s of sites as any[]) {
      if (s.layanan?.sla_target_pct != null) {
        const v = Number(s.layanan.sla_target_pct);
        if (v > maxTargetPct) maxTargetPct = v;
      }
    }

    // Build a map siteId → site info
    const siteMap: Record<number, any> = {};
    for (const s of sites as any[]) {
      siteMap[s.id_site] = s;
    }

    // Fetch tickets in range
    const tickets = await this.prisma.operationTicket.findMany({
      where: {
        id_site: { in: siteIds },
        tgl_open: { gte: start, lte: end },
      },
      select: {
        id_site:      true,
        nomor_tiket:  true,
        judul_tiket:  true,
        prioritas:    true,
        status_tiket: true,
        tgl_open:     true,
        tgl_resolved: true,
        sla_due:      true,
        sla_breached: true,
      },
    });

    // Summary
    const total_tiket   = tickets.length;
    const total_breach  = (tickets as any[]).filter(t => t.sla_breached).length;
    const compliance_pct = total_tiket === 0 ? 100.0 : Number(((total_tiket - total_breach) / total_tiket * 100).toFixed(2));

    // MTTR: only resolved tickets
    const resolvedTickets = (tickets as any[]).filter(t => t.tgl_resolved && t.tgl_open);
    const avg_mttr_menit = resolvedTickets.length === 0 ? 0 : Math.round(
      resolvedTickets.reduce((sum: number, t: any) => {
        return sum + (new Date(t.tgl_resolved).getTime() - new Date(t.tgl_open).getTime()) / 60000;
      }, 0) / resolvedTickets.length,
    );

    // Per-site calculation — seed all sites
    const perSiteMap: Record<number, { total: number; breach: number }> = {};
    for (const s of sites as any[]) perSiteMap[s.id_site] = { total: 0, breach: 0 };
    for (const t of tickets as any[]) {
      perSiteMap[t.id_site].total++;
      if (t.sla_breached) perSiteMap[t.id_site].breach++;
    }
    const per_site = sites.map((s: any) => {
      const { total, breach } = perSiteMap[s.id_site];
      const comp = total === 0 ? 100.0 : Number(((total - breach) / total * 100).toFixed(2));
      const tgt  = s.layanan?.sla_target_pct != null ? Number(s.layanan.sla_target_pct) : maxTargetPct;
      return {
        id_site:        s.id_site,
        nama_site:      s.nama_site,
        kode_site:      s.kode_site,
        kode_layanan:   s.layanan?.kode_layanan ?? '',
        nama_layanan:   s.layanan?.nama_layanan ?? '',
        target_pct:     tgt,
        total_tiket:    total,
        breach,
        compliance_pct: comp,
        status:         comp >= tgt ? 'OK' : 'BREACH',
      };
    });

    // Trend: last 6 months always
    const BULAN_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const trend: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const tYear = d.getFullYear();
      const tMon  = d.getMonth(); // 0-based
      const tStart = new Date(tYear, tMon, 1);
      const tEnd   = new Date(tYear, tMon + 1, 0, 23, 59, 59, 999);
      const monthTickets = await this.prisma.operationTicket.findMany({
        where: { id_site: { in: siteIds }, tgl_open: { gte: tStart, lte: tEnd } },
        select: { sla_breached: true },
      });
      const mTotal  = monthTickets.length;
      const mBreach = (monthTickets as any[]).filter(t => t.sla_breached).length;
      const mComp   = mTotal === 0 ? 100.0 : Number(((mTotal - mBreach) / mTotal * 100).toFixed(2));
      trend.push({
        bulan:          `${BULAN_SHORT[tMon]} ${String(tYear).slice(2)}`,
        total:          mTotal,
        breach:         mBreach,
        compliance_pct: mComp,
        target_pct:     maxTargetPct,
      });
    }

    // Breach detail: last 20 breached tickets in period
    const breachedTickets = (tickets as any[])
      .filter(t => t.sla_breached)
      .sort((a, b) => new Date(b.tgl_open).getTime() - new Date(a.tgl_open).getTime())
      .slice(0, 20);

    const nowMs = Date.now();
    const breach_detail = breachedTickets.map(t => {
      const slaMs    = t.sla_due ? new Date(t.sla_due).getTime() : null;
      const resolvedMs = t.tgl_resolved ? new Date(t.tgl_resolved).getTime() : nowMs;
      const terlambat_menit = slaMs ? Math.max(0, Math.round((resolvedMs - slaMs) / 60000)) : 0;
      return {
        nomor_tiket:    t.nomor_tiket,
        judul_tiket:    t.judul_tiket,
        prioritas:      t.prioritas,
        nama_site:      siteMap[t.id_site]?.nama_site ?? '',
        kode_layanan:   siteMap[t.id_site]?.layanan?.kode_layanan ?? '',
        tgl_open:       t.tgl_open,
        sla_due:        t.sla_due,
        tgl_resolved:   t.tgl_resolved,
        terlambat_menit,
        status_tiket:   t.status_tiket,
      };
    });

    return {
      periode:  periodeLabel,
      summary:  { total_tiket, total_breach, compliance_pct, avg_mttr_menit },
      target_pct: maxTargetPct,
      per_site,
      trend,
      breach_detail,
    };
  }

  // ── Admin: kelola customer users ─────────────────────────

  private safeSelect = {
    id_user: true, id_pelanggan: true, email: true, nama: true,
    is_aktif: true, last_login: true, created_at: true,
  };

  async listUsers(id_pelanggan?: number) {
    const users = await this.prisma.customerUser.findMany({
      where: id_pelanggan ? { id_pelanggan } : undefined,
      orderBy: { created_at: 'desc' },
      select: { ...this.safeSelect, pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true } } },
    });
    return users;
  }

  async createUser(dto: { id_pelanggan: number; email: string; password: string; nama?: string }) {
    const exists = await this.prisma.customerUser.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Email sudah terdaftar');

    const password_hash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.customerUser.create({
      data: { id_pelanggan: dto.id_pelanggan, email: dto.email, nama: dto.nama, password_hash },
      select: this.safeSelect,
    });
    return user;
  }

  async toggleUser(id: number) {
    const user = await this.prisma.customerUser.findUnique({ where: { id_user: id } });
    if (!user) throw new NotFoundException();
    return this.prisma.customerUser.update({
      where: { id_user: id },
      data: { is_aktif: !user.is_aktif },
      select: this.safeSelect,
    });
  }

  async resetUserPassword(id: number, password: string) {
    const user = await this.prisma.customerUser.findUnique({ where: { id_user: id } });
    if (!user) throw new NotFoundException();
    const password_hash = await bcrypt.hash(password, 12);
    await this.prisma.customerUser.update({ where: { id_user: id }, data: { password_hash } });
    return { message: 'Password direset' };
  }
}
