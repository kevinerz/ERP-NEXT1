import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class MobileService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // ── AUTH ─────────────────────────────────────────────────────

  async login(username: string, password: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { username },
      include: { karyawan: true },
    });

    if (!user || !user.is_aktif) {
      throw new UnauthorizedException('Username atau password salah');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Username atau password salah');

    const payload = {
      sub: user.id_user,
      id_karyawan: user.id_karyawan,
      username: user.username,
      type: 'mobile' as const,
    };

    const token = this.jwt.sign(payload);

    return {
      token,
      user: {
        id_user:      user.id_user,
        id_karyawan:  user.id_karyawan,
        username:     user.username,
        nama_lengkap: user.karyawan.nama_lengkap,
        jabatan:      user.karyawan.jabatan,
        departemen:   user.karyawan.departemen,
        no_hp:        user.karyawan.no_hp,
      },
    };
  }

  async updateFcmToken(id_user: number, fcm_token: string) {
    await this.prisma.coreUser.update({
      where: { id_user },
      data: { fcm_token },
    });
    return { message: 'FCM token berhasil diperbarui' };
  }

  // ── TICKETS ──────────────────────────────────────────────────

  async getMyTickets(id_karyawan: number, status?: string) {
    const statusFilter = status
      ? { status_tiket: status }
      : { status_tiket: { in: ['Open', 'In_Progress'] } };

    // Priority sort order: Critical=1, High=2, Medium=3, Low=4
    const priorityOrder: Record<string, number> = {
      Critical: 1,
      High:     2,
      Medium:   3,
      Low:      4,
    };

    const tickets = await this.prisma.operationTicket.findMany({
      where: {
        id_teknisi_pic: id_karyawan,
        ...statusFilter,
      },
      include: {
        site: {
          select: {
            kode_site:     true,
            nama_site:     true,
            alamat_lengkap: true,
            pelanggan: {
              select: { nama_pelanggan: true },
            },
          },
        },
      },
      orderBy: [{ tgl_open: 'asc' }],
    });

    // Sort by priority in-memory
    tickets.sort((a, b) => {
      const pa = priorityOrder[a.prioritas] ?? 5;
      const pb = priorityOrder[b.prioritas] ?? 5;
      if (pa !== pb) return pa - pb;
      return new Date(a.tgl_open).getTime() - new Date(b.tgl_open).getTime();
    });

    return tickets.map((t) => ({
      id_ticket:        t.id_ticket,
      nomor_tiket:      t.nomor_tiket,
      judul_tiket:      t.judul_tiket,
      deskripsi_masalah: t.deskripsi_masalah,
      prioritas:        t.prioritas,
      status_tiket:     t.status_tiket,
      tgl_open:         t.tgl_open,
      sla_due:          t.sla_due,
      sla_breached:     t.sla_breached,
      site: {
        kode_site:      t.site.kode_site,
        nama_site:      t.site.nama_site,
        alamat_lengkap: t.site.alamat_lengkap,
        nama_pelanggan: t.site.pelanggan.nama_pelanggan,
      },
    }));
  }

  async getTicketDetail(id_karyawan: number, id_ticket: number) {
    const ticket = await this.prisma.operationTicket.findUnique({
      where: { id_ticket },
      include: {
        site: {
          include: {
            pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true } },
            layanan:   { select: { nama_layanan: true, kode_layanan: true } },
          },
        },
        logs: {
          orderBy: { created_at: 'desc' },
          take: 10,
        },
      },
    });

    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');
    if (ticket.id_teknisi_pic !== id_karyawan) {
      throw new ForbiddenException('Tiket bukan milik Anda');
    }

    return ticket;
  }

  async acceptTicket(id_karyawan: number, id_ticket: number) {
    const ticket = await this.prisma.operationTicket.findUnique({
      where: { id_ticket },
    });

    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');
    if (ticket.id_teknisi_pic !== id_karyawan) {
      throw new ForbiddenException('Tiket bukan milik Anda');
    }
    if (ticket.status_tiket !== 'Open') {
      throw new BadRequestException('Tiket harus berstatus Open untuk diterima');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.operationTicket.update({
        where: { id_ticket },
        data: { status_tiket: 'In_Progress' },
      }),
      this.prisma.operationTicketLog.create({
        data: {
          id_ticket,
          catatan:     'Tiket diterima oleh teknisi',
          status_dari: 'Open',
          status_ke:   'In_Progress',
          created_at:  new Date(),
        },
      }),
    ]);

    return updated;
  }

  async resolveTicket(id_karyawan: number, id_ticket: number, catatan_resolusi: string) {
    const ticket = await this.prisma.operationTicket.findUnique({
      where: { id_ticket },
    });

    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');
    if (ticket.id_teknisi_pic !== id_karyawan) {
      throw new ForbiddenException('Tiket bukan milik Anda');
    }
    if (ticket.status_tiket !== 'In_Progress') {
      throw new BadRequestException('Tiket harus berstatus In_Progress untuk diselesaikan');
    }

    const now = new Date();
    const sla_breached =
      ticket.sla_due != null ? now > ticket.sla_due : ticket.sla_breached;

    const [updated] = await this.prisma.$transaction([
      this.prisma.operationTicket.update({
        where: { id_ticket },
        data: {
          status_tiket:  'Resolved',
          tgl_resolved:  now,
          sla_breached,
        },
      }),
      this.prisma.operationTicketLog.create({
        data: {
          id_ticket,
          catatan:     catatan_resolusi,
          status_dari: 'In_Progress',
          status_ke:   'Resolved',
          created_at:  now,
        },
      }),
    ]);

    return updated;
  }

  // ── LOKASI ───────────────────────────────────────────────────

  async updateLokasi(
    id_karyawan: number,
    latitude: number,
    longitude: number,
    akurasi?: number,
  ) {
    const result = await this.prisma.teknisiLokasi.upsert({
      where:  { id_karyawan },
      update: { latitude, longitude, akurasi: akurasi ?? null, updated_at: new Date() },
      create: { id_karyawan, latitude, longitude, akurasi: akurasi ?? null },
    });
    return result;
  }

  async getAllTeknisiLokasi() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.prisma.teknisiLokasi.findMany({
      where: { updated_at: { gt: oneHourAgo } },
      include: {
        karyawan: {
          select: { nama_lengkap: true, jabatan: true, no_hp: true },
        },
      },
    });
  }
}
