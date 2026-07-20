import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SLA_JAM } from '../../operations/operations.service';

const STATUS_TIKET_AKTIF = ['Open', 'In_Progress', 'Pending_Customer'];

// Kode status heartbeat Uptime Kuma (lihat dokumentasi resmi):
// 0 = DOWN, 1 = UP, 2 = PENDING (belum dikonfirmasi, masih retry), 3 = MAINTENANCE
const HB_DOWN = 0;
const HB_UP = 1;

/**
 * UptimeKumaService — beda dari PRTG/Ruijie: Uptime Kuma self-hosted &
 * punya notifikasi Webhook bawaan yang POST ke URL kita tiap monitor
 * berubah status (up/down). Jadi ini WEBHOOK RECEIVER asli (event-driven),
 * bukan polling — lebih ringan & real-time dibanding integrasi lain di app ini.
 *
 * Keamanan: Uptime Kuma tidak punya signature/HMAC bawaan untuk webhook,
 * jadi kita pakai token rahasia yang disisipkan di URL
 * (/api/webhook/uptime-kuma/:token) — dibuat sistem, bukan diisi manual.
 */
@Injectable()
export class UptimeKumaService {
  private readonly logger = new Logger('UptimeKuma');

  constructor(
    private prisma: PrismaService,
    private notif: NotificationsService,
  ) {}

  async getStatus() {
    const row = await this.prisma.integrationUptimeKumaConfig.findUnique({ where: { id: 1 } });
    const configured = !!row?.webhook_token;
    return {
      data: {
        configured,
        pesan: configured
          ? 'Menunggu webhook dari Uptime Kuma — tidak ada polling, event-driven'
          : 'Buat token webhook dulu lewat Pengaturan Uptime Kuma, lalu daftarkan URL-nya sebagai notifikasi Webhook di Uptime Kuma (Notifications > Setup Notification > Webhook)',
      },
    };
  }

  async getWebhookLog(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const [data, total] = await Promise.all([
      this.prisma.integrationUptimeKumaWebhook.findMany({
        skip: (page - 1) * limit, take: limit,
        orderBy: { diterima_pada: 'desc' },
        include: { ticket: { select: { id_ticket: true, nomor_tiket: true, status_tiket: true } } },
      }),
      this.prisma.integrationUptimeKumaWebhook.count(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  private async cariSite(monitorId: string, monitorName: string): Promise<{ id_site: number; nama_site: string } | null> {
    const mapping = await this.prisma.integrationUptimeKumaMapping.findUnique({
      where: { monitor_id: monitorId },
      select: { site: { select: { id_site: true, nama_site: true } } },
    });
    if (mapping) return mapping.site;

    const nama = monitorName.trim();
    if (!nama) return null;

    const site = await this.prisma.sitePelanggan.findFirst({
      where: { nama_site: { contains: nama } },
      select: { id_site: true, nama_site: true },
    });
    if (site) return site;
    const semua = await this.prisma.sitePelanggan.findMany({
      select: { id_site: true, nama_site: true },
      take: 1000,
    });
    const lower = nama.toLowerCase();
    return semua.find((s) => lower.includes(s.nama_site.toLowerCase())) ?? null;
  }

  // ─── HANDLER WEBHOOK ────────────────────────────────────────────

  async handleWebhook(token: string, body: any) {
    const config = await this.prisma.integrationUptimeKumaConfig.findUnique({ where: { id: 1 } });
    if (!config?.webhook_token || token !== config.webhook_token) {
      // Pesan generik — jangan bocorkan apakah token salah atau belum dikonfigurasi sama sekali
      throw new ForbiddenException('Token webhook tidak valid');
    }

    const monitorId = String(body?.monitor?.id ?? '');
    const monitorName = body?.monitor?.name ?? '';
    const status = body?.heartbeat?.status;
    const msg = body?.msg || body?.heartbeat?.msg || '';

    if (!monitorId) return { message: 'Diabaikan — payload tanpa monitor.id' };
    // Cuma proses status yang sudah pasti (DOWN/UP) — PENDING/MAINTENANCE diabaikan
    if (status !== HB_DOWN && status !== HB_UP) {
      return { message: `Diabaikan — status ${status} (bukan DOWN/UP)` };
    }

    if (status === HB_DOWN) {
      await this.prosesDown(monitorId, monitorName, msg);
    } else {
      await this.prosesUp(monitorId, monitorName, msg);
    }
    return { message: 'OK' };
  }

  private async prosesDown(monitorId: string, monitorName: string, msg: string) {
    const existing = await this.prisma.integrationUptimeKumaWebhook.findFirst({
      where: {
        monitor_id: monitorId,
        OR: [
          { ticket: { status_tiket: { in: STATUS_TIKET_AKTIF } } },
          { id_ticket_terbentuk: null, diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) } },
        ],
      },
    });
    if (existing) return; // sudah ada tiket aktif / penanda pending — jangan duplikat (mis. retry webhook)

    const site = await this.cariSite(monitorId, monitorName);
    let ticketId: number | null = null;

    if (site) {
      const ticket = await this.buatTiketUptimeKuma({ monitorId, monitorName, msg }, site);
      ticketId = ticket.id_ticket;
    } else {
      this.notif.notifyForModul('operations', {
        tipe: 'tiket_baru',
        judul: `🔴 [Uptime Kuma] ${monitorName} DOWN — site tidak dikenali`,
        deskripsi: `${msg || 'Monitor down'} — buat tiket manual atau tambah mapping site`,
        url: '/operations',
      }).catch(() => {});
    }

    await this.prisma.integrationUptimeKumaWebhook.create({
      data: {
        monitor_id: monitorId,
        monitor_name: monitorName,
        status_monitor: 'down',
        pesan_raw: msg,
        id_ticket_terbentuk: ticketId,
      },
    });
  }

  private async prosesUp(monitorId: string, monitorName: string, msg: string) {
    const aktif = await this.prisma.integrationUptimeKumaWebhook.findFirst({
      where: { monitor_id: monitorId, ticket: { status_tiket: { in: STATUS_TIKET_AKTIF }, sumber_tiket: 'Uptime Kuma' } },
      include: { ticket: { select: { id_ticket: true, nomor_tiket: true, status_tiket: true } } },
    });
    if (aktif?.ticket) {
      await this.prisma.operationTicket.update({
        where: { id_ticket: aktif.ticket.id_ticket },
        data: { status_tiket: 'Resolved', tgl_resolved: new Date() },
      });
      await this.prisma.operationTicketLog.create({
        data: {
          id_ticket: aktif.ticket.id_ticket,
          status_dari: aktif.ticket.status_tiket,
          status_ke: 'Resolved',
          catatan: `Monitor Uptime Kuma "${monitorName}" kembali UP — auto-resolved${msg ? ` (${msg})` : ''}`,
        },
      });
      await this.prisma.notification.deleteMany({
        where: { is_read: false, url: `/operations/${aktif.ticket.id_ticket}` },
      }).catch(() => {});
    }

    // Bersihkan penanda "pending tanpa tiket" (site tak dikenali) untuk monitor ini
    await this.prisma.integrationUptimeKumaWebhook.deleteMany({
      where: { monitor_id: monitorId, id_ticket_terbentuk: null },
    }).catch(() => {});
  }

  private async genNomorTiket(now: Date): Promise<string> {
    const prefix = `TKT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const last = await this.prisma.operationTicket.findFirst({
      where: { nomor_tiket: { startsWith: prefix } },
      orderBy: { nomor_tiket: 'desc' },
    });
    const seq = (last ? (parseInt(last.nomor_tiket.split('-')[2], 10) || 0) : 0) + 1;
    return `${prefix}-${String(seq).padStart(4, '0')}`;
  }

  private async buatTiketUptimeKuma(
    info: { monitorId: string; monitorName: string; msg: string },
    site: { id_site: number; nama_site: string },
  ) {
    const now = new Date();
    const nomor = await this.genNomorTiket(now);
    const ticket = await this.prisma.operationTicket.create({
      data: {
        nomor_tiket: nomor,
        id_site: site.id_site,
        judul_tiket: `[Uptime Kuma] ${info.monitorName} — DOWN`,
        deskripsi_masalah: info.msg || `Monitor ${info.monitorName} down`,
        prioritas: 'Critical',
        sumber_tiket: 'Uptime Kuma',
        sla_due: new Date(now.getTime() + (SLA_JAM['Critical'] ?? 4) * 3600_000),
      },
    });
    await this.prisma.operationTicketLog.create({
      data: { id_ticket: ticket.id_ticket, status_ke: 'Open', catatan: `Tiket dibuat otomatis dari Uptime Kuma (monitor #${info.monitorId})` },
    });
    this.notif.notifyForModul('operations', {
      tipe: 'tiket_baru',
      judul: `🔴 [Uptime Kuma] ${info.monitorName} DOWN`,
      deskripsi: `${nomor} — ${info.msg || 'monitor down'}`,
      url: `/operations/${ticket.id_ticket}`,
    }).catch(() => {});
    return ticket;
  }

  // ─── KONFIGURASI ────────────────────────────────────────────────

  async getConfig() {
    const row = await this.prisma.integrationUptimeKumaConfig.findUnique({ where: { id: 1 } });
    return {
      data: {
        base_url: row?.base_url || '',
        status_page_slug: row?.status_page_slug || '',
        webhook_path: row?.webhook_token ? `/api/webhook/uptime-kuma/${row.webhook_token}` : null,
      },
    };
  }

  async updateConfig(dto: { base_url?: string; status_page_slug?: string }) {
    await this.prisma.integrationUptimeKumaConfig.upsert({
      where: { id: 1 },
      create: { id: 1, base_url: dto.base_url || null, status_page_slug: dto.status_page_slug || null },
      update: {
        base_url: dto.base_url !== undefined ? dto.base_url : undefined,
        status_page_slug: dto.status_page_slug !== undefined ? dto.status_page_slug : undefined,
      },
    });
    return { message: 'Konfigurasi Uptime Kuma disimpan' };
  }

  /** Buat/regenerasi token webhook. Token lama otomatis tidak berlaku lagi. */
  async regenerateToken() {
    const token = randomBytes(24).toString('hex');
    await this.prisma.integrationUptimeKumaConfig.upsert({
      where: { id: 1 },
      create: { id: 1, webhook_token: token },
      update: { webhook_token: token },
    });
    return { data: { webhook_path: `/api/webhook/uptime-kuma/${token}` }, message: 'Token webhook baru dibuat — daftarkan URL ini di Uptime Kuma (Notifications > Webhook)' };
  }

  // ─── MAPPING MONITOR → SITE ──────────────────────────────────────

  async listMapping() {
    const data = await this.prisma.integrationUptimeKumaMapping.findMany({
      orderBy: { created_at: 'desc' },
      include: { site: { select: { id_site: true, kode_site: true, nama_site: true } } },
    });
    return { data };
  }

  async listUnmatched() {
    const rows = await this.prisma.integrationUptimeKumaWebhook.findMany({
      where: { id_ticket_terbentuk: null, diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) } },
      orderBy: { diterima_pada: 'desc' },
      take: 100,
    });
    const seen = new Set<string>();
    const data = rows.filter((r) => {
      const key = r.monitor_id || String(r.id_webhook);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { data };
  }

  async createMapping(dto: { monitor_id: string; monitor_name: string; id_site: number }) {
    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: dto.id_site } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');

    const mapping = await this.prisma.integrationUptimeKumaMapping.upsert({
      where: { monitor_id: dto.monitor_id },
      create: { monitor_id: dto.monitor_id, monitor_name: dto.monitor_name, id_site: dto.id_site },
      update: { monitor_name: dto.monitor_name, id_site: dto.id_site },
      include: { site: { select: { id_site: true, kode_site: true, nama_site: true } } },
    });
    return { data: mapping, message: 'Mapping disimpan' };
  }

  async removeMapping(id: number) {
    const row = await this.prisma.integrationUptimeKumaMapping.findUnique({ where: { id_mapping: id } });
    if (!row) throw new NotFoundException('Mapping tidak ditemukan');
    await this.prisma.integrationUptimeKumaMapping.delete({ where: { id_mapping: id } });
    return { message: 'Mapping dihapus' };
  }

  // ─── AUDIT DAFTAR MONITOR ─────────────────────────────────────────
  // Pakai Status Page API publik Uptime Kuma (tanpa login) — admin cukup
  // buat 1 status page berisi semua monitor yang mau di-mapping ke site.

  async getMonitorOverview() {
    const config = await this.prisma.integrationUptimeKumaConfig.findUnique({ where: { id: 1 } });
    if (!config?.base_url || !config.status_page_slug) return { data: [], message: 'Isi Base URL & slug status page dulu di tab Koneksi' };

    const base = config.base_url.replace(/\/$/, '');
    const slug = config.status_page_slug;

    const [pageRes, hbRes] = await Promise.all([
      fetch(`${base}/api/status-page/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(15_000) }),
      fetch(`${base}/api/status-page/heartbeat/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(15_000) }),
    ]);
    if (!pageRes.ok) throw new Error(`Uptime Kuma status page error ${pageRes.status} — cek Base URL/slug`);
    const pageJson: any = await pageRes.json();
    const hbJson: any = hbRes.ok ? await hbRes.json() : { heartbeatList: {} };

    const monitors: { id: string; name: string }[] = (pageJson.publicGroupList ?? [])
      .flatMap((g: any) => g.monitorList ?? [])
      .map((m: any) => ({ id: String(m.id), name: m.name }));

    const mappings = await this.prisma.integrationUptimeKumaMapping.findMany();
    const mappingByMonitor = new Map(mappings.map((m) => [m.monitor_id, m]));

    const data = await Promise.all(
      monitors.map(async (m) => {
        const hbList = hbJson.heartbeatList?.[m.id] ?? [];
        const last = hbList[hbList.length - 1];
        const site = await this.cariSite(m.id, m.name);
        return {
          monitor_id: m.id,
          monitor_name: m.name,
          status_terakhir: last ? (last.status === HB_UP ? 'up' : last.status === HB_DOWN ? 'down' : 'lainnya') : 'tidak_diketahui',
          matched: !!site,
          site: site || null,
          mapped_manual: mappingByMonitor.has(m.id),
        };
      }),
    );
    data.sort((a, b) => a.monitor_name.localeCompare(b.monitor_name));
    return { data };
  }
}
