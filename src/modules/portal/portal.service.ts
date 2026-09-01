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
