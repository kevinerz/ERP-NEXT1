import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SLA_JAM } from '../../operations/operations.service';
import { RuijieClient, RuijieProject } from './ruijie.client';

const STATUS_TIKET_AKTIF = ['Open', 'In_Progress', 'Pending_Customer'];

/**
 * RuijieService — polling Ruijie Cloud tiap 10 menit (Ruijie tidak punya
 * webhook resmi ke pihak ketiga, cuma Email/WeChat internal — lihat
 * catatan di schema.prisma pada IntegrationRuijieWebhook):
 * - Device offline → auto-buat tiket (mapping project Ruijie ↔ site)
 * - Device kembali online → tiket auto-Resolved + log
 * Struktur & dedup logic sengaja dibuat 1:1 mirip PrtgService supaya
 * konsisten dgn integrasi monitoring lain di app ini.
 */
@Injectable()
export class RuijieService {
  private readonly logger = new Logger('Ruijie');

  constructor(
    private prisma: PrismaService,
    private ruijie: RuijieClient,
    private crypto: SecretCryptoService,
    private notif: NotificationsService,
  ) {}

  async getStatus() {
    const info = await this.ruijie.statusInfo();
    return {
      data: {
        ...info,
        pesan: info.configured
          ? `Polling aktif tiap 10 menit (kredensial dari ${info.source === 'db' ? 'Pengaturan Ruijie' : 'env server'})`
          : 'Isi kredensial Ruijie lewat Pengaturan Ruijie (atau RUIJIE_BASE_URL/APPID/SECRET di server) — appid & secret cuma bisa diminta ke service_rj@ruijienetworks.com, tidak ada self-service.',
      },
    };
  }

  async getWebhookLog(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const [data, total] = await Promise.all([
      this.prisma.integrationRuijieWebhook.findMany({
        skip: (page - 1) * limit, take: limit,
        orderBy: { diterima_pada: 'desc' },
        include: { ticket: { select: { id_ticket: true, nomor_tiket: true, status_tiket: true } } },
      }),
      this.prisma.integrationRuijieWebhook.count(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  // Cocokkan project Ruijie dgn site: mapping manual dulu, baru fallback ke
  // substring nama (dua arah, ci) — sama pola dgn PrtgService.cariSite.
  private async cariSite(project: RuijieProject): Promise<{ id_site: number; nama_site: string } | null> {
    const mapping = await this.prisma.integrationRuijieMapping.findUnique({
      where: { ruijie_project_id: project.id },
      select: { site: { select: { id_site: true, nama_site: true } } },
    });
    if (mapping) return mapping.site;

    const nama = project.name.trim();
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

  @Cron('*/10 * * * *')
  async poll() {
    if (!(await this.ruijie.isConfigured())) return;

    let projects: RuijieProject[];
    try {
      projects = await this.ruijie.getProjects();
    } catch (e: any) {
      this.logger.warn(`Polling Ruijie gagal (ambil daftar project): ${e.message}`);
      return;
    }

    const hasil = { tiket_dibuat: 0, dilewati: 0, auto_resolved: 0, tanpa_site: 0 };
    const offlineIds = new Set<string>();

    for (const project of projects) {
      let devices;
      try {
        devices = await this.ruijie.getDevices(project.id);
      } catch (e: any) {
        this.logger.warn(`Polling Ruijie gagal (project ${project.name}): ${e.message}`);
        continue;
      }

      const site = await this.cariSite(project);
      const offline = devices.filter((d) => !d.online);

      for (const d of offline) {
        offlineIds.add(d.id);
        const existing = await this.prisma.integrationRuijieWebhook.findFirst({
          where: {
            ruijie_device_id: d.id,
            OR: [
              { ticket: { status_tiket: { in: STATUS_TIKET_AKTIF } } },
              { id_ticket_terbentuk: null, diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) } },
            ],
          },
        });
        if (existing) { hasil.dilewati++; continue; }

        let ticketId: number | null = null;
        if (site) {
          const ticket = await this.buatTiketRuijie({ deviceId: d.id, deviceName: d.name, projectName: project.name }, site);
          ticketId = ticket.id_ticket;
          hasil.tiket_dibuat++;
        } else {
          hasil.tanpa_site++;
          this.notif.notifyForModul('operations', {
            tipe: 'tiket_baru',
            judul: `🔴 [Ruijie] ${d.name} OFFLINE — site tidak dikenali`,
            deskripsi: `Project "${project.name}" tidak cocok dgn nama site manapun, buat tiket manual`,
            url: '/operations',
          }).catch(() => {});
        }

        await this.prisma.integrationRuijieWebhook.create({
          data: {
            ruijie_device_id: d.id,
            device_mac: d.mac,
            device_type: d.type,
            status_device: 'offline',
            jenis_alert: 'Device Offline',
            pesan_raw: `${d.name} (project: ${project.name}) offline`,
            id_ticket_terbentuk: ticketId,
          },
        });
      }
    }

    // Device sudah online lagi → auto-resolve tiket Ruijie yang masih aktif
    const aktifRuijie = await this.prisma.integrationRuijieWebhook.findMany({
      where: { ticket: { status_tiket: { in: STATUS_TIKET_AKTIF }, sumber_tiket: 'Ruijie' } },
      include: { ticket: { select: { id_ticket: true, nomor_tiket: true, status_tiket: true } } },
    });
    for (const w of aktifRuijie) {
      if (!w.ruijie_device_id || offlineIds.has(w.ruijie_device_id) || !w.ticket) continue;
      await this.prisma.operationTicket.update({
        where: { id_ticket: w.ticket.id_ticket },
        data: { status_tiket: 'Resolved', tgl_resolved: new Date() },
      });
      await this.prisma.operationTicketLog.create({
        data: {
          id_ticket: w.ticket.id_ticket,
          status_dari: w.ticket.status_tiket,
          status_ke: 'Resolved',
          catatan: `Device Ruijie #${w.ruijie_device_id} kembali online — auto-resolved`,
        },
      });
      hasil.auto_resolved++;
      await this.prisma.notification.deleteMany({
        where: { is_read: false, url: `/operations/${w.ticket.id_ticket}` },
      }).catch(() => {});
    }

    // Device online lagi tapi belum sempat bertiket (site tak dikenali) — bersihkan penanda
    const tanpaTiket = await this.prisma.integrationRuijieWebhook.findMany({
      where: { id_ticket_terbentuk: null, diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) } },
    });
    // Catatan: tidak ada kolom nama device/project tersendiri di tabel ini
    // (beda dgn PRTG yg punya prtg_device_name) untuk mencocokkan & membersihkan
    // notifikasi "site tidak dikenali" secara presisi — jadi cukup buang
    // penanda basi-nya saja; notifikasi lama dibiarkan (kosmetik, bukan bug).
    for (const w of tanpaTiket) {
      if (!w.ruijie_device_id || offlineIds.has(w.ruijie_device_id)) continue;
      await this.prisma.integrationRuijieWebhook.delete({ where: { id_webhook: w.id_webhook } }).catch(() => {});
    }

    if (hasil.tiket_dibuat || hasil.auto_resolved || hasil.tanpa_site) {
      this.logger.log(`Ruijie poll: ${JSON.stringify(hasil)}`);
    }
    return { data: hasil, message: `Poll selesai: ${hasil.tiket_dibuat} tiket dibuat, ${hasil.auto_resolved} auto-resolved, ${hasil.tanpa_site} site tak dikenali` };
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

  private async buatTiketRuijie(
    info: { deviceId: string; deviceName: string; projectName: string },
    site: { id_site: number; nama_site: string },
  ) {
    const now = new Date();
    const nomor = await this.genNomorTiket(now);
    const ticket = await this.prisma.operationTicket.create({
      data: {
        nomor_tiket: nomor,
        id_site: site.id_site,
        judul_tiket: `[Ruijie] ${info.deviceName} — OFFLINE`,
        deskripsi_masalah: `Device ${info.deviceName} pada project ${info.projectName} offline`,
        prioritas: 'High',
        sumber_tiket: 'Ruijie',
        sla_due: new Date(now.getTime() + (SLA_JAM['High'] ?? 24) * 3600_000),
      },
    });
    await this.prisma.operationTicketLog.create({
      data: { id_ticket: ticket.id_ticket, status_ke: 'Open', catatan: `Tiket dibuat otomatis dari Ruijie (device #${info.deviceId})` },
    });
    this.notif.notifyForModul('operations', {
      tipe: 'tiket_baru',
      judul: `🔴 [Ruijie] ${info.deviceName} OFFLINE`,
      deskripsi: `${nomor} — project ${info.projectName}`,
      url: `/operations/${ticket.id_ticket}`,
    }).catch(() => {});
    return ticket;
  }

  // ─── KONFIGURASI KONEKSI ────────────────────────────────────────

  async getConfig() {
    const row = await this.prisma.integrationRuijieConfig.findUnique({ where: { id: 1 } });
    return {
      data: {
        base_url: row?.base_url || '',
        appid: row?.appid || '',
        has_secret: !!row?.app_secret_enc,
      },
    };
  }

  async updateConfig(dto: { base_url?: string; appid?: string; app_secret?: string }) {
    await this.prisma.integrationRuijieConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        base_url: dto.base_url || null,
        appid: dto.appid || null,
        app_secret_enc: dto.app_secret ? this.crypto.encrypt(dto.app_secret) : null,
      },
      update: {
        base_url: dto.base_url !== undefined ? dto.base_url : undefined,
        appid: dto.appid !== undefined ? dto.appid : undefined,
        // Secret kosong dari form (tidak diubah user) jangan menimpa yang sudah ada
        app_secret_enc: dto.app_secret ? this.crypto.encrypt(dto.app_secret) : undefined,
      },
    });
    return { message: 'Konfigurasi Ruijie disimpan' };
  }

  // ─── MAPPING PROJECT → SITE ──────────────────────────────────────

  async listMapping() {
    const data = await this.prisma.integrationRuijieMapping.findMany({
      orderBy: { created_at: 'desc' },
      include: { site: { select: { id_site: true, kode_site: true, nama_site: true } } },
    });
    return { data };
  }

  async listUnmatched() {
    // Tidak distinct() di kolom Text (pesan_raw) — MySQL bermasalah dgn
    // DISTINCT/index di kolom TEXT/BLOB. Dedup ringan dilakukan di JS.
    const rows = await this.prisma.integrationRuijieWebhook.findMany({
      where: { id_ticket_terbentuk: null, diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) } },
      orderBy: { diterima_pada: 'desc' },
      take: 100,
    });
    const seen = new Set<string>();
    const data = rows.filter((r) => {
      const key = r.pesan_raw || String(r.id_webhook);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { data };
  }

  async createMapping(dto: { ruijie_project_id: string; project_name: string; id_site: number }) {
    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: dto.id_site } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');

    const mapping = await this.prisma.integrationRuijieMapping.upsert({
      where: { ruijie_project_id: dto.ruijie_project_id },
      create: { ruijie_project_id: dto.ruijie_project_id, project_name: dto.project_name, id_site: dto.id_site },
      update: { project_name: dto.project_name, id_site: dto.id_site },
      include: { site: { select: { id_site: true, kode_site: true, nama_site: true } } },
    });
    return { data: mapping, message: 'Mapping disimpan — berlaku di poll berikutnya (maks. 10 menit)' };
  }

  async removeMapping(id: number) {
    const row = await this.prisma.integrationRuijieMapping.findUnique({ where: { id_mapping: id } });
    if (!row) throw new NotFoundException('Mapping tidak ditemukan');
    await this.prisma.integrationRuijieMapping.delete({ where: { id_mapping: id } });
    return { message: 'Mapping dihapus' };
  }

  // ─── AUDIT DAFTAR PROJECT/DEVICE ─────────────────────────────────

  async getDeviceOverview() {
    if (!(await this.ruijie.isConfigured())) return { data: [] };
    const projects = await this.ruijie.getProjects();

    const data = await Promise.all(
      projects.map(async (p) => {
        const [devices, site, mapping] = await Promise.all([
          this.ruijie.getDevices(p.id).catch(() => []),
          this.cariSite(p),
          this.prisma.integrationRuijieMapping.findUnique({ where: { ruijie_project_id: p.id } }),
        ]);
        return {
          project_id: p.id,
          project_name: p.name,
          jumlah_device: devices.length,
          ada_offline: devices.some((d) => !d.online),
          matched: !!site,
          site: site || null,
          mapped_manual: !!mapping,
        };
      }),
    );
    data.sort((a, b) => a.project_name.localeCompare(b.project_name));
    return { data };
  }
}
