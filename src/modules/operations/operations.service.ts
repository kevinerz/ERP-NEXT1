import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StarsenderService } from '../integrations/starsender/starsender.service';
import { FcmService } from '../mobile/fcm.service';
import { CreateTicketDto, UpdateTicketDto, AddLogDto } from './dto/ticket.dto';
import { ticketPrefix } from '../../common/utils/ticket-number';
import { wibStartOfDay, wibYearMonth, wibMonthRange } from '../../common/utils/wib';

const TICKET_INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true, kota: true,
      pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true } },
    },
  },
  teknisi: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
  kontak_teknisi: { select: { id_kontak: true, nama: true, no_hp: true, asal_vendor: true } },
  _count: { select: { work_orders: true, logs: true } },
};

const TICKET_DETAIL_INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true, kota: true, alamat_lengkap: true,
      pelanggan: { select: { nama_pelanggan: true, kode_pelanggan: true, no_telp: true, nama_pic_utama: true, no_hp_pic_utama: true } },
      layanan: { select: { kode_layanan: true, nama_layanan: true } },
      pic: {
        select: { id_pic: true, nama_pic: true, jabatan: true, no_kontak: true, email: true, is_utama: true, media_komunikasi: true },
        orderBy: [{ is_utama: 'desc' as const }, { nama_pic: 'asc' as const }],
      },
      sumber_internet: {
        select: {
          id_sumber: true, peruntukan_link: true, bandwidth_mbps: true, nomor_pelanggan_isp: true, status_link: true,
          vendor: { select: { id_vendor: true, nama_vendor: true, kontak_pic: true, no_telp: true, email_pic: true } },
        },
        where: { status_link: 'Aktif' },
        orderBy: { peruntukan_link: 'asc' as const },
      },
    },
  },
  teknisi: { select: { id_karyawan: true, nama_lengkap: true, jabatan: true } },
  kontak_teknisi: { select: { id_kontak: true, nama: true, no_hp: true, asal_vendor: true } },
  work_orders: {
    include: {
      teknisi: { select: { id_karyawan: true, nama_lengkap: true } },
      vendor: { select: { id_vendor: true, nama_vendor: true } },
    },
    orderBy: { tgl_jadwal: 'desc' as const },
  },
  logs: {
    include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
    orderBy: { created_at: 'desc' as const },
  },
};

// Target resolve SLA per prioritas (jam)
export const SLA_JAM: Record<string, number> = {
  Critical: 4,
  High: 8,
  Medium: 24,
  Low: 72,
};

function hitungSlaDue(prioritas: string, dariWaktu: Date): Date {
  const jam = SLA_JAM[prioritas] ?? SLA_JAM.Medium;
  return new Date(dariWaktu.getTime() + jam * 3600_000);
}

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private prisma: PrismaService,
    private notifService: NotificationsService,
    private wa: StarsenderService,
    private fcm: FcmService,
  ) {}

  // ─── TIKET ────────────────────────────────────────────────────

  /** Bangun filter daftar tiket — dipakai daftar, kanban & ekspor */
  private whereDaftar(query: Record<string, any>) {
    const where: any = { AND: [] as any[] };
    const q = String(query.search ?? '').trim();
    if (q) {
      where.AND.push({ OR: [
        { nomor_tiket: { contains: q } },
        { judul_tiket: { contains: q } },
        { site: { nama_site: { contains: q } } },
        { site: { kode_site: { contains: q } } },
        { site: { pelanggan: { nama_pelanggan: { contains: q } } } },
      ] });
    }
    const daftar = (v: any) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const st = daftar(query.status_tiket);
    if (st.length) where.status_tiket = { in: st };
    const pr = daftar(query.prioritas);
    if (pr.length) where.prioritas = { in: pr };
    const sb = daftar(query.sumber_tiket);
    if (sb.length) where.sumber_tiket = { in: sb };
    if (query.id_teknisi === 'none') where.id_teknisi_pic = null;
    else if (query.id_teknisi) where.id_teknisi_pic = Number(query.id_teknisi);
    if (query.jenis_gangguan === 'none') where.jenis_gangguan = null;
    else if (query.jenis_gangguan) where.jenis_gangguan = String(query.jenis_gangguan);
    if (query.id_site) where.id_site = Number(query.id_site);
    const dari = query.dari ? new Date(`${query.dari}T00:00:00+07:00`) : null;
    const sampai = query.sampai ? new Date(`${query.sampai}T23:59:59.999+07:00`) : null;
    if ((dari && !isNaN(+dari)) || (sampai && !isNaN(+sampai))) {
      where.tgl_open = { ...(dari && !isNaN(+dari) ? { gte: dari } : {}), ...(sampai && !isNaN(+sampai) ? { lte: sampai } : {}) };
    }
    // Tampilan cepat
    const AKTIF = ['Open', 'In_Progress', 'Pending_Customer'];
    switch (query.tampilan) {
      case 'aktif': where.status_tiket = st.length ? { in: st.filter((x) => AKTIF.includes(x)) } : { in: AKTIF }; break;
      case 'tanpa_pic': where.status_tiket = { in: AKTIF }; where.id_teknisi_pic = null; where.id_kontak_teknisi = null; break;
      case 'lewat_sla': where.status_tiket = { in: AKTIF }; where.sla_due = { lt: new Date() }; break;
      case 'selesai_hari_ini': where.status_tiket = { in: ['Resolved', 'Closed'] }; where.tgl_resolved = { gte: wibStartOfDay() }; break;
    }
    if (!where.AND.length) delete where.AND;
    return where;
  }

  async findAll(query: Record<string, any>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const where = this.whereDaftar(query);
    const URUT: Record<string, any> = {
      terbaru: [{ tgl_open: 'desc' }],
      terlama: [{ tgl_open: 'asc' }],
      sla: [{ sla_due: 'asc' }, { tgl_open: 'asc' }],
      update: [{ updated_at: 'desc' }],
    };
    const [data, total] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where, skip, take: limit,
        orderBy: URUT[String(query.urut)] ?? URUT.terbaru,
        include: TICKET_INCLUDE,
      }),
      this.prisma.operationTicket.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  /** Ringkasan pusat gangguan: KPI, tren harian, sebaran sumber/jenis, site berulang, beban teknisi */
  async insight(hariQ?: string) {
    const hari = Math.min(30, Math.max(3, Number(hariQ) || 7));
    const AKTIF = ['Open', 'In_Progress', 'Pending_Customer'];
    const now = new Date();
    const awalHari = wibStartOfDay();
    const awal = new Date(awalHari.getTime() - (hari - 1) * 86400_000);

    const [aktif, selesaiHariIni, periode] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where: { status_tiket: { in: AKTIF } },
        select: { prioritas: true, status_tiket: true, sla_due: true, id_teknisi_pic: true, id_kontak_teknisi: true, tgl_open: true,
          teknisi: { select: { id_karyawan: true, nama_lengkap: true } } },
      }),
      this.prisma.operationTicket.findMany({
        where: { tgl_resolved: { gte: awalHari } },
        select: { tgl_open: true, tgl_resolved: true, tgl_sensor_down: true },
      }),
      this.prisma.operationTicket.findMany({
        where: { tgl_open: { gte: awal } },
        select: { tgl_open: true, tgl_resolved: true, sumber_tiket: true, jenis_gangguan: true, sla_breached: true, status_tiket: true, prioritas: true,
          id_site: true, site: { select: { nama_site: true, kode_site: true } } },
      }),
    ]);
    const selesaiPeriode = await this.prisma.operationTicket.findMany({
      where: { tgl_resolved: { gte: awal } }, select: { tgl_resolved: true, tgl_open: true, sla_breached: true },
    });

    const menit = (a: Date, b: Date) => Math.max(0, (+b - +a) / 60000);
    const mttr = (rows: { tgl_open: Date; tgl_resolved: Date | null }[]) => {
      const r = rows.filter((x) => x.tgl_resolved);
      return r.length ? Math.round(r.reduce((s, x) => s + menit(x.tgl_open, x.tgl_resolved!), 0) / r.length) : null;
    };
    const kunciHari = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const label: string[] = [];
    for (let i = 0; i < hari; i++) label.push(kunciHari(new Date(awal.getTime() + i * 86400_000)));
    const masuk = Object.fromEntries(label.map((l) => [l, 0]));
    const selesai = Object.fromEntries(label.map((l) => [l, 0]));
    for (const t of periode) { const k = kunciHari(t.tgl_open); if (k in masuk) masuk[k]!++; }
    for (const t of selesaiPeriode) { const k = kunciHari(t.tgl_resolved!); if (k in selesai) selesai[k]!++; }

    // Jam rawan (WIB) dalam periode
    const perJam = Array.from({ length: 24 }, () => 0);
    for (const t of periode) perJam[new Date(t.tgl_open.getTime() + 7 * 3600_000).getUTCHours()]!++;

    const hitung = <T>(rows: T[], f: (r: T) => string) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
      return [...m.entries()].map(([nama, n]) => ({ nama, n })).sort((a, b) => b.n - a.n);
    };
    const siteMap = new Map<number, { id_site: number; nama: string; kode: string; n: number; aktif: number }>();
    for (const t of periode) {
      const x = siteMap.get(t.id_site) ?? { id_site: t.id_site, nama: t.site?.nama_site ?? `#${t.id_site}`, kode: t.site?.kode_site ?? '', n: 0, aktif: 0 };
      x.n++; if (AKTIF.includes(t.status_tiket)) x.aktif++;
      siteMap.set(t.id_site, x);
    }
    const bebanMap = new Map<string, { id: number | null; nama: string; n: number; kritis: number }>();
    for (const t of aktif) {
      const nama = t.teknisi?.nama_lengkap?.trim() || (t.id_kontak_teknisi ? 'Vendor / mitra' : 'Belum ada PIC');
      const x = bebanMap.get(nama) ?? { id: t.teknisi?.id_karyawan ?? null, nama, n: 0, kritis: 0 };
      x.n++; if (t.prioritas === 'Critical') x.kritis++;
      bebanMap.set(nama, x);
    }
    const tepat = selesaiPeriode.filter((t) => !t.sla_breached).length;

    return { data: {
      hari,
      kpi: {
        aktif: aktif.length,
        open: aktif.filter((t) => t.status_tiket === 'Open').length,
        proses: aktif.filter((t) => t.status_tiket === 'In_Progress').length,
        pending: aktif.filter((t) => t.status_tiket === 'Pending_Customer').length,
        kritis: aktif.filter((t) => t.prioritas === 'Critical').length,
        lewat_sla: aktif.filter((t) => t.sla_due && t.sla_due < now).length,
        tanpa_pic: aktif.filter((t) => !t.id_teknisi_pic && !t.id_kontak_teknisi).length,
        tertua_menit: aktif.length ? Math.round(Math.max(...aktif.map((t) => menit(t.tgl_open, now)))) : 0,
        selesai_hari_ini: selesaiHariIni.length,
        masuk_hari_ini: periode.filter((t) => t.tgl_open >= awalHari).length,
        mttr_hari_ini: mttr(selesaiHariIni),
        mttr_periode: mttr(selesaiPeriode),
        sla_persen: selesaiPeriode.length ? Math.round((tepat / selesaiPeriode.length) * 1000) / 10 : null,
        total_periode: periode.length,
      },
      tren: { label, masuk: label.map((l) => masuk[l]), selesai: label.map((l) => selesai[l]) },
      per_jam: perJam,
      per_sumber: hitung(periode, (t) => t.sumber_tiket || 'Lainnya'),
      per_jenis: hitung(periode, (t) => t.jenis_gangguan || 'Belum diisi').slice(0, 8),
      per_prioritas: hitung(periode, (t) => t.prioritas),
      site_berulang: [...siteMap.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 10),
      beban_teknisi: [...bebanMap.values()].sort((a, b) => b.n - a.n).slice(0, 10),
      jenis_list: (await this.prisma.operationTicket.groupBy({ by: ['jenis_gangguan'], where: { jenis_gangguan: { not: null } }, _count: { _all: true } }))
        .map((x) => x.jenis_gangguan!).sort(),
    } };
  }

  /** Aksi massal — tiap tiket lewat update() agar log, notifikasi & SLA tetap konsisten */
  async massal(dto: { ids: number[]; aksi: string; nilai?: any }, userId?: number) {
    const ids = [...new Set((dto.ids || []).map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 100);
    if (!ids.length) throw new BadRequestException('Pilih minimal satu tiket');
    let patch: UpdateTicketDto;
    if (dto.aksi === 'assign') patch = { id_teknisi_pic: dto.nilai ? Number(dto.nilai) : null } as any;
    else if (dto.aksi === 'status') {
      if (!['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed'].includes(dto.nilai)) throw new BadRequestException('Status tidak valid');
      patch = { status_tiket: dto.nilai };
    } else if (dto.aksi === 'prioritas') {
      if (!['Critical', 'High', 'Medium', 'Low'].includes(dto.nilai)) throw new BadRequestException('Prioritas tidak valid');
      patch = { prioritas: dto.nilai };
    } else if (dto.aksi === 'jenis') {
      const j = String(dto.nilai ?? '').trim().slice(0, 100);
      if (!j) throw new BadRequestException('Jenis gangguan wajib diisi');
      patch = { jenis_gangguan: j };
    } else throw new BadRequestException('Aksi tidak dikenal');
    let berhasil = 0; const gagal: { id: number; pesan: string }[] = [];
    for (const id of ids) {
      try { await this.update(id, { ...patch }, userId); berhasil++; }
      catch (e: any) { gagal.push({ id, pesan: e?.message ?? 'gagal' }); }
    }
    return { data: { berhasil, gagal }, message: `${berhasil} tiket diperbarui${gagal.length ? `, ${gagal.length} gagal` : ''}` };
  }

  async findOne(id: number) {
    const data = await this.prisma.operationTicket.findUnique({
      where: { id_ticket: id },
      include: TICKET_DETAIL_INCLUDE,
    });
    if (!data) throw new NotFoundException('Tiket tidak ditemukan');

    const related_tickets = await this.prisma.operationTicket.findMany({
      where: { id_site: data.id_site, id_ticket: { not: id } },
      orderBy: { tgl_open: 'desc' },
      take: 5,
      select: {
        id_ticket: true, nomor_tiket: true, judul_tiket: true,
        status_tiket: true, prioritas: true, tgl_open: true,
      },
    });

    return { data: { ...data, related_tickets } };
  }

  async create(dto: CreateTicketDto, userId?: number) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = new Date();
      const prefix = ticketPrefix(now);
      const last = await this.prisma.operationTicket.findFirst({
        where: { nomor_tiket: { startsWith: prefix } },
        orderBy: { nomor_tiket: 'desc' },
      });
      const seq = (last ? (parseInt(last.nomor_tiket.split('-')[2], 10) || 0) : 0) + 1;
      const nomor_tiket = `${prefix}-${String(seq).padStart(4, '0')}`;
      try {
        const prioritas = dto.prioritas || 'Medium';
        const data = await this.prisma.operationTicket.create({
          data: {
            ...dto,
            nomor_tiket,
            prioritas,
            sumber_tiket: dto.sumber_tiket || 'Internal',
            sla_due: hitungSlaDue(prioritas, now),
          },
          include: TICKET_INCLUDE,
        });

        await this.prisma.operationTicketLog.create({
          data: { id_ticket: data.id_ticket, id_user: userId || null, status_ke: 'Open', catatan: 'Tiket dibuat' },
        });

        this.notifService.notifyForModul('operations', {
          tipe: 'tiket_baru',
          judul: `Tiket Baru: ${dto.judul_tiket}`,
          deskripsi: `${nomor_tiket}`,
          url: `/operations/${data.id_ticket}`,
        }).catch(() => {});

        // WA notifikasi tiket baru
        (async () => {
          const site = await this.prisma.sitePelanggan.findUnique({
            where: { id_site: dto.id_site },
            select: {
              nama_site: true, id_pelanggan: true, alamat_lengkap: true, koordinat_gps: true,
              pelanggan: { select: { nama_pelanggan: true, no_hp_pic_utama: true } },
              pic: { where: { is_utama: true }, select: { no_kontak: true }, take: 1 },
            },
          });
          if (!site) return;
          const perangkat = dto.id_perangkat ? await this.prisma.perangkatSite.findUnique({
            where: { id_perangkat: dto.id_perangkat },
            select: { jenis_perangkat: true, merk: true, tipe_model: true },
          }) : null;
          const tipePerangkat = perangkat
            ? [perangkat.jenis_perangkat, perangkat.merk, perangkat.tipe_model].filter(Boolean).join(' / ')
            : '';
          const now = new Date();
          const waktuDown = now.toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
          }) + ' ' + now.toLocaleTimeString('id-ID', {
            timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit',
          }) + ' WIB';
          await this.wa.notifTiketBaru({
            nomor_tiket, judul: dto.judul_tiket,
            nama_site: site.nama_site,
            nama_pelanggan: site.pelanggan?.nama_pelanggan ?? '',
            id_pelanggan: site.id_pelanggan,
            no_hp_customer: site.pelanggan?.no_hp_pic_utama,
            alamat_site: site.alamat_lengkap ?? '',
            koordinat_site: site.koordinat_gps ?? '',
            no_hp_pic: site.pic[0]?.no_kontak ?? '',
            tipe_perangkat: tipePerangkat,
            sensor_detail: dto.deskripsi_masalah ?? '',
            waktu_down: waktuDown,
          });
        })().catch(() => {});

        return { data, message: `Tiket ${nomor_tiket} dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async update(id: number, dto: UpdateTicketDto, userId?: number) {
    const ticket = await this.prisma.operationTicket.findUnique({ where: { id_ticket: id } });
    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');

    const updateData: any = { ...dto, updated_at: new Date() };

    // Assign internal → bersihkan vendor, dan sebaliknya
    if ('id_teknisi_pic' in dto) {
      updateData.id_kontak_teknisi = null;
    } else if ('id_kontak_teknisi' in dto) {
      updateData.id_teknisi_pic = null;
    }

    const transisi = this.statusTransitionFields(ticket, dto.status_tiket, dto.prioritas);
    Object.assign(updateData, transisi);
    const isReopened = 'sla_due' in transisi;
    // Prioritas berubah → hitung ulang deadline SLA dari tgl_open
    if (!isReopened && dto.prioritas && dto.prioritas !== ticket.prioritas) {
      updateData.sla_due = hitungSlaDue(dto.prioritas, ticket.tgl_open);
      updateData.sla_breached = false;
    }
    if (dto.tgl_berangkat !== undefined) updateData.tgl_berangkat = dto.tgl_berangkat ? new Date(dto.tgl_berangkat) : null;
    if (dto.tgl_sampai   !== undefined) updateData.tgl_sampai   = dto.tgl_sampai   ? new Date(dto.tgl_sampai)   : null;

    const data = await this.prisma.operationTicket.update({
      where: { id_ticket: id },
      data: updateData,
      include: TICKET_INCLUDE,
    });

    // Log status change
    if (dto.status_tiket && dto.status_tiket !== ticket.status_tiket) {
      await this.prisma.operationTicketLog.create({
        data: {
          id_ticket: id,
          id_user: userId || null,
          status_dari: ticket.status_tiket,
          status_ke: dto.status_tiket,
          catatan: `Status diubah ke ${dto.status_tiket}`,
        },
      });

      // Notifikasi status berubah
      this.notifService.notifyForModul('operations', {
        tipe: 'tiket_update',
        judul: `Status Tiket: ${ticket.status_tiket} → ${dto.status_tiket}`,
        deskripsi: ticket.nomor_tiket,
        url: `/operations/${id}`,
      }).catch(() => {});

      // WA notifikasi update status
      this.prisma.sitePelanggan.findUnique({
        where: { id_site: ticket.id_site },
        select: { nama_site: true, id_pelanggan: true, pelanggan: { select: { nama_pelanggan: true, no_hp_pic_utama: true } } },
      }).then((site) => {
        this.wa.notifTiketUpdate({
          nomor_tiket: ticket.nomor_tiket,
          judul: ticket.judul_tiket,
          status_dari: ticket.status_tiket ?? '',
          status_ke: dto.status_tiket!,
          nama_site: site?.nama_site ?? '',
          nama_pelanggan: site?.pelanggan?.nama_pelanggan ?? '',
          id_pelanggan: site?.id_pelanggan,
          no_hp_customer: site?.pelanggan?.no_hp_pic_utama,
        });
      }).catch(() => {});
    }

    // FCM push ke teknisi baru jika id_teknisi_pic berubah
    const prevTeknisi = (ticket as any).id_teknisi_pic;
    const rawTeknisi = (dto as any).id_teknisi_pic;
    const newTeknisi = rawTeknisi ? Number(rawTeknisi) : null;
    this.logger.log(`FCM check: prevTeknisi=${prevTeknisi} newTeknisi=${newTeknisi}`);
    if (newTeknisi && newTeknisi !== prevTeknisi) {
      this.prisma.coreUser.findFirst({
        where: { id_karyawan: newTeknisi },
        select: { fcm_token: true },
      }).then((u) => {
        this.logger.log(`FCM user found: ${!!u}, has_token: ${!!u?.fcm_token}`);
        if (u?.fcm_token) {
          return this.fcm.sendTicketAssigned(u.fcm_token, ticket.nomor_tiket, ticket.judul_tiket, ticket.prioritas, id);
        }
      }).catch((e) => { this.logger.error('FCM send error: ' + e.message); });
    }

    return { data, message: 'Tiket diperbarui' };
  }

  async addLog(dto: AddLogDto, userId?: number) {
    const ticket = await this.prisma.operationTicket.findUnique({ where: { id_ticket: dto.id_ticket } });
    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');

    const log = await this.prisma.$transaction(async (tx) => {
      const created = await tx.operationTicketLog.create({
        data: {
          id_ticket: dto.id_ticket,
          id_user: userId || null,
          status_dari: dto.status_ke ? (ticket.status_tiket || null) : null,
          status_ke: dto.status_ke || null,
          catatan: dto.catatan || null,
        },
        include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
      });
      if (dto.status_ke) {
        await tx.operationTicket.update({
          where: { id_ticket: dto.id_ticket },
          data: {
            status_tiket: dto.status_ke,
            updated_at: new Date(),
            ...this.statusTransitionFields(ticket, dto.status_ke),
          } as any,
        });
      }
      return created;
    });

    return { data: log, message: 'Log ditambahkan' };
  }

  /**
   * Field waktu & SLA yang ikut berubah saat status berpindah. Hanya diisi saat
   * status BENAR-BENAR berubah — mengedit tiket yang sudah Resolved (mis. menambah
   * root cause) tidak boleh menggeser tgl_resolved ke "sekarang" (MTTR membengkak).
   */
  private statusTransitionFields(
    ticket: { status_tiket: string | null; prioritas: string | null },
    statusBaru?: string | null,
    prioritasBaru?: string | null,
  ): Record<string, any> {
    if (!statusBaru || statusBaru === ticket.status_tiket) return {};
    const now = new Date();
    const fields: Record<string, any> = {};
    if (statusBaru === 'Resolved') fields.tgl_resolved = now;
    if (statusBaru === 'Closed') fields.tgl_closed = now;
    const wasDone = ['Resolved', 'Closed'].includes(ticket.status_tiket ?? '');
    if (wasDone && !['Resolved', 'Closed'].includes(statusBaru)) {
      // Reopen: SLA dihitung ulang dari sekarang agar tiket tidak langsung TELAT
      fields.tgl_resolved = null;
      fields.tgl_closed = null;
      fields.sla_due = hitungSlaDue(prioritasBaru ?? ticket.prioritas ?? 'Medium', now);
      fields.sla_breached = false;
    }
    return fields;
  }

  // ─── HELPERS ──────────────────────────────────────────────────

  // ─── NOC BOARD — snapshot real-time untuk wallboard ───────────
  async getNocBoard() {
    const now = new Date();
    const awalHari = wibStartOfDay(now);

    const [aktif, resolvedHariIni, woLapangan] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where: { status_tiket: { in: ['Open', 'In_Progress', 'Pending_Customer'] } },
        select: {
          id_ticket: true, nomor_tiket: true, judul_tiket: true,
          prioritas: true, status_tiket: true, tgl_open: true,
          sla_due: true, sla_breached: true,
          site: { select: { nama_site: true, kota: true, pelanggan: { select: { nama_pelanggan: true } } } },
          teknisi: { select: { nama_lengkap: true } },
        },
        orderBy: [{ sla_due: 'asc' }],
        take: 100,
      }),
      this.prisma.operationTicket.count({
        where: { status_tiket: { in: ['Resolved', 'Closed'] }, tgl_resolved: { gte: awalHari } },
      }),
      // Teknisi yang sedang bertugas di lapangan (WO Dispatch/On-Site)
      this.prisma.workOrder.findMany({
        where: { status_wo: { in: ['Dispatch', 'On-Site'] } },
        select: {
          nomor_wo: true, status_wo: true, jenis_wo: true,
          teknisi: { select: { nama_lengkap: true } },
          vendor: { select: { nama_vendor: true } },
          site: { select: { nama_site: true } },
        },
        orderBy: { tgl_jadwal: 'asc' },
        take: 30,
      }),
    ]);

    const byPrioritas: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    let slaBreach = 0;
    let slaWarning = 0; // < 2 jam menuju deadline
    for (const t of aktif) {
      byPrioritas[t.prioritas] = (byPrioritas[t.prioritas] ?? 0) + 1;
      if (t.sla_breached || (t.sla_due && t.sla_due < now)) slaBreach++;
      else if (t.sla_due && t.sla_due.getTime() - now.getTime() < 2 * 3600_000) slaWarning++;
    }

    return {
      data: {
        waktu_server: now,
        total_aktif: aktif.length,
        by_prioritas: byPrioritas,
        sla_breach: slaBreach,
        sla_warning: slaWarning,
        resolved_hari_ini: resolvedHariIni,
        tiket: aktif,
        wo_lapangan: woLapangan,
      },
    };
  }

  // ─── METRIK NOC: MTTA / MTTR / kepatuhan SLA ──────────────────
  async getMetrics(query: { bulan?: string; tahun?: string }) {
    const kini = wibYearMonth();
    const bulan = Number(query.bulan) || kini.month;
    const tahun = Number(query.tahun) || kini.year;
    const { start: awal, end: akhir } = wibMonthRange(tahun, bulan);

    const tikets = await this.prisma.operationTicket.findMany({
      where: { tgl_open: { gte: awal, lt: akhir } },
      select: {
        prioritas: true, status_tiket: true, tgl_open: true, tgl_resolved: true,
        sla_breached: true,
        teknisi: { select: { nama_lengkap: true } },
        logs: {
          where: { NOT: { catatan: 'Tiket dibuat' } },
          orderBy: { created_at: 'asc' },
          take: 1,
          select: { created_at: true },
        },
      },
    });

    const menit = (ms: number) => Math.round(ms / 60000);
    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

    const mttaList: number[] = [];
    const mttrList: number[] = [];
    const perPrioritas: Record<string, { total: number; resolved: number; mttr: number[]; breach: number }> = {};
    const perTeknisi: Record<string, { resolved: number; mttr: number[] }> = {};
    let totalBreach = 0;

    for (const t of tikets) {
      const p = (perPrioritas[t.prioritas] ??= { total: 0, resolved: 0, mttr: [], breach: 0 });
      p.total++;
      if (t.sla_breached) { p.breach++; totalBreach++; }
      // MTTA: respon pertama = log pertama setelah log pembuatan
      if (t.logs[0]) mttaList.push(menit(t.logs[0].created_at.getTime() - t.tgl_open.getTime()));
      // MTTR: open -> resolved
      if (t.tgl_resolved) {
        const durasi = menit(t.tgl_resolved.getTime() - t.tgl_open.getTime());
        mttrList.push(durasi);
        p.resolved++;
        p.mttr.push(durasi);
        const nama = t.teknisi?.nama_lengkap ?? 'Tanpa PIC';
        const tek = (perTeknisi[nama] ??= { resolved: 0, mttr: [] });
        tek.resolved++;
        tek.mttr.push(durasi);
      }
    }

    const total = tikets.length;
    const resolved = mttrList.length;
    return {
      data: {
        periode: `${tahun}-${String(bulan).padStart(2, '0')}`,
        total_tiket: total,
        resolved,
        mtta_menit: avg(mttaList),
        mttr_menit: avg(mttrList),
        sla_compliance: total ? Math.round(((total - totalBreach) / total) * 100) : null,
        sla_breach: totalBreach,
        per_prioritas: Object.entries(perPrioritas).map(([prioritas, v]) => ({
          prioritas, total: v.total, resolved: v.resolved,
          mttr_menit: avg(v.mttr), sla_breach: v.breach,
        })),
        per_teknisi: Object.entries(perTeknisi)
          .map(([nama, v]) => ({ nama, resolved: v.resolved, mttr_menit: avg(v.mttr) }))
          .sort((a, b) => b.resolved - a.resolved),
      },
    };
  }

  async getStatusSummary() {
    const statuses = ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed'];
    const rows = await this.prisma.operationTicket.groupBy({
      by: ['status_tiket'],
      _count: { id_ticket: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.status_tiket, r._count.id_ticket]));
    const data = statuses.map((s) => ({ status: s, count: map[s] ?? 0 }));
    return { data };
  }

  async getFotos(id_ticket: number) {
    const fotos = await this.prisma.operationTicketPhoto.findMany({
      where: { id_ticket },
      orderBy: { created_at: 'asc' },
    });
    const BASE = process.env.APP_URL || 'https://1erp.nextone.id';
    return { data: fotos.map(f => ({
      ...f,
      url: `${BASE}/uploads/tickets/${id_ticket}/${f.filename}`,
    })) };
  }

  async remove(id: number) {
    const row = await this.prisma.operationTicket.findUnique({ where: { id_ticket: id } });
    if (!row) throw new NotFoundException('Tiket tidak ditemukan');
    // Hapus webhook PRTG terkait agar dedup tidak memblokir pembuatan tiket baru
    await this.prisma.integrationPrtgWebhook.deleteMany({ where: { id_ticket_terbentuk: id } });
    await this.prisma.operationTicket.delete({ where: { id_ticket: id } });
    return { message: `Tiket ${row.nomor_tiket} dihapus` };
  }

  async getNocDevices() {
    const perangkat = await this.prisma.perangkatSite.findMany({
      include: {
        site: {
          select: {
            nama_site: true, kota: true,
            pelanggan: { select: { nama_pelanggan: true } },
          },
        },
      },
      orderBy: [{ site: { pelanggan: { nama_pelanggan: 'asc' } } }, { id_perangkat: 'asc' }],
    });

    let syslogDevices: any[] = [];
    try {
      const resp = await fetch('http://103.12.28.10:8080/api/devices', {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) syslogDevices = await resp.json();
    } catch {}

    const syslogByIp = new Map<string, any>(syslogDevices.map((d: any) => [d.ip, d]));

    return {
      perangkat: perangkat.map(p => ({
        id_perangkat: p.id_perangkat,
        jenis_perangkat: p.jenis_perangkat,
        merk: p.merk,
        tipe_model: p.tipe_model,
        ip_address: p.ip_address,
        mac_address: p.mac_address,
        status_perangkat: p.status_perangkat,
        site: p.site,
        syslog: p.ip_address ? (syslogByIp.get(p.ip_address) ?? null) : null,
      })),
      syslogDevices,
    };
  }

  async getTeknisiList() {
    const data = await this.prisma.hrisKaryawan.findMany({
      where: {
        status_aktif: true,
        departemen: 'Teknisi',
      },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    return { data };
  }
}
