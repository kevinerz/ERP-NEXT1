import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { StarsenderService } from '../starsender/starsender.service';
import { SLA_JAM } from '../../operations/operations.service';
import { PrtgClient, PrtgSensor } from './prtg.client';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';

const STATUS_TIKET_AKTIF = ['Open', 'In_Progress', 'Pending_Customer'];

/**
 * PrtgService — polling PRTG tiap 5 menit:
 * - Sensor Down → auto-buat tiket (1 tiket per device, dedup by device)
 * - Sensor kembali Up → tiket PRTG auto-Resolved + log + WA notif UP
 */
@Injectable()
export class PrtgService {
  private readonly logger = new Logger('PRTG');

  constructor(
    private prisma: PrismaService,
    private prtg: PrtgClient,
    private notif: NotificationsService,
    private wa: StarsenderService,
    private crypto: SecretCryptoService,
  ) {}

  async getStatus() {
    const info = await this.prtg.statusInfo();
    const is_aktif = await this.isEnabled();
    return {
      data: {
        ...info,
        is_aktif,
        pesan: !is_aktif
          ? 'Polling PRTG DIJEDA — tidak ada pengecekan otomatis sampai diaktifkan lagi'
          : info.configured
            ? `Polling aktif tiap 5 menit (kredensial dari ${info.source === 'db' ? 'Pengaturan PRTG' : 'env server'})`
            : 'Isi kredensial PRTG lewat Pengaturan PRTG (atau PRTG_BASE_URL/USERNAME/PASSHASH di server)',
      },
    };
  }

  /** Polling aktif? Default true kalau row config belum ada. Fail-safe: kalau
   * query error (mis. kolom is_aktif belum di-migrate), anggap aktif — jangan
   * sampai melempar di dalam cron dan menjatuhkan proses. */
  async isEnabled(): Promise<boolean> {
    try {
      const row = await this.prisma.integrationPrtgConfig.findUnique({ where: { id: 1 } });
      return row?.is_aktif ?? true;
    } catch (e: any) {
      this.logger.warn(`Cek status aktif PRTG gagal (anggap aktif): ${e.message}`);
      return true;
    }
  }

  /** Aktif/jeda polling — dipanggil dari tombol toggle di UI. */
  async setAktif(aktif: boolean) {
    await this.prisma.integrationPrtgConfig.upsert({
      where: { id: 1 },
      create: { id: 1, is_aktif: aktif },
      update: { is_aktif: aktif },
    });
    this.logger.log(`Polling PRTG di-${aktif ? 'AKTIFKAN' : 'JEDA'}`);
    return {
      data: { is_aktif: aktif },
      message: aktif ? 'Polling PRTG diaktifkan' : 'Polling PRTG dijeda — hemat resource',
    };
  }

  // Rincian downtime tiket dari PRTG:
  // - Waktu Down  = diterima_pada webhook Down paling awal
  // - Waktu Up    = tgl_resolved tiket (UP tidak disimpan sebagai webhook,
  //                 sistem langsung update tgl_resolved saat polling deteksi UP)
  async getTicketPrtgEvents(id_ticket: number) {
    const [rows, tiket] = await Promise.all([
      this.prisma.integrationPrtgWebhook.findMany({
        where: { id_ticket_terbentuk: id_ticket },
        orderBy: { diterima_pada: 'asc' },
      }),
      this.prisma.operationTicket.findUnique({
        where: { id_ticket },
        select: { tgl_resolved: true, status_tiket: true, sumber_tiket: true },
      }),
    ]);

    if (!rows.length) return { data: null };

    const waktuDown = rows[0].diterima_pada;
    // Sensor dengan pesan Down paling kritis
    const firstDown = rows[0];

    // Waktu Up = tgl_resolved tiket (diset saat polling deteksi device kembali UP)
    const waktuUp = tiket?.tgl_resolved ?? null;
    const sudahUp = !!waktuUp && ['Resolved', 'Closed'].includes(tiket?.status_tiket ?? '');

    let durasiMs: number | null = null;
    let durasiLabel = '—';
    if (waktuDown && waktuUp && sudahUp) {
      durasiMs = new Date(waktuUp).getTime() - new Date(waktuDown).getTime();
      const totalSec = Math.floor(durasiMs / 1000);
      const jam   = Math.floor(totalSec / 3600);
      const menit = Math.floor((totalSec % 3600) / 60);
      const dtk   = totalSec % 60;
      durasiLabel = jam > 0
        ? `${jam} jam ${menit > 0 ? menit + ' menit' : ''}`
        : menit > 0 ? `${menit} menit ${dtk} detik`
        : `${dtk} detik`;
    }

    // Kumpulkan sensor-sensor yang down (bisa lebih dari 1)
    const sensors = rows.map(r => ({
      sensor_id:   r.prtg_sensor_id,
      sensor_name: r.prtg_sensor_name,
      pesan:       r.pesan_alert,
      waktu:       r.diterima_pada,
    }));

    return {
      data: {
        device_name:  firstDown.prtg_device_name,
        waktu_down:   waktuDown,
        waktu_up:     waktuUp,
        sudah_up:     sudahUp,
        durasi_ms:    durasiMs,
        durasi_label: durasiLabel,
        pesan_down:   firstDown.pesan_alert,
        sensors,
      },
    };
  }

  async getWebhookLog(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const [data, total] = await Promise.all([
      this.prisma.integrationPrtgWebhook.findMany({
        skip: (page - 1) * limit, take: limit,
        orderBy: { diterima_pada: 'desc' },
        include: { ticket: { select: { id_ticket: true, nomor_tiket: true, status_tiket: true } } },
      }),
      this.prisma.integrationPrtgWebhook.count(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  // Cocokkan nama device PRTG dengan site: mapping manual dulu (persis &
  // pasti benar), baru fallback ke substring nama site (dua arah, ci).
  private async cariSite(deviceName: string): Promise<{ id_site: number; nama_site: string } | null> {
    const nama = deviceName.trim();
    if (!nama) return null;

    const mapping = await this.prisma.integrationPrtgMapping.findUnique({
      where: { device_name: nama },
      select: { site: { select: { id_site: true, nama_site: true } } },
    });
    if (mapping) return mapping.site;

    const site = await this.prisma.sitePelanggan.findFirst({
      where: { nama_site: { contains: nama } },
      select: { id_site: true, nama_site: true },
    });
    if (site) return site;
    // Kebalikan: nama site terkandung di nama device
    const semua = await this.prisma.sitePelanggan.findMany({
      select: { id_site: true, nama_site: true },
      take: 1000,
    });
    const lower = nama.toLowerCase();
    return semua.find((s) => lower.includes(s.nama_site.toLowerCase())) ?? null;
  }

  @Cron('*/5 * * * *')
  async poll() {
    // PAUSE TOTAL: polling PRTG MATI kecuali env PRTG_POLL_ENABLED=true.
    // Dicek DULUAN sebelum menyentuh DB/API — jadi saat DB/resource bermasalah,
    // cron ini benar-benar tidak melakukan apa pun (nol query, nol fetch).
    // Aktifkan lagi: set PRTG_POLL_ENABLED=true di .env server + restart.
    if (process.env.PRTG_POLL_ENABLED !== 'true') return { data: null, message: 'Polling PRTG dimatikan (PRTG_POLL_ENABLED != true)' };
    // Jeda manual (tombol nonaktif) — berhenti sebelum sentuh API/DB apa pun.
    if (!(await this.isEnabled())) return { data: null, message: 'Polling PRTG sedang dijeda' };
    if (!(await this.prtg.isConfigured())) return;
    let downSensors: PrtgSensor[];
    try {
      downSensors = await this.prtg.getDownSensors();
    } catch (e: any) {
      this.logger.warn(`Polling PRTG gagal: ${e.message}`);
      return;
    }

    const hasil = { tiket_dibuat: 0, dilewati: 0, auto_resolved: 0, tanpa_site: 0 };

    // ── 1. Group sensor DOWN per device — 1 device = 1 tiket ──────────
    // Kumpulkan semua sensor ID yang sudah ada entri aktif (tiket aktif atau
    // tanpa-tiket dalam 24 jam) agar kita tidak re-query per sensor.
    const activeEntries = await this.prisma.integrationPrtgWebhook.findMany({
      where: {
        OR: [
          { ticket: { status_tiket: { in: STATUS_TIKET_AKTIF } } },
          { id_ticket_terbentuk: null, diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) } },
        ],
      },
      select: { prtg_sensor_id: true, prtg_device_name: true, id_ticket_terbentuk: true },
    });
    const activeDevices = new Set(activeEntries.map((e) => e.prtg_device_name));

    // Group sensor yang benar-benar baru (device-nya belum ada entri aktif)
    const byDevice = new Map<string, PrtgSensor[]>();
    for (const s of downSensors) {
      if (activeDevices.has(s.device)) { hasil.dilewati++; continue; }
      const arr = byDevice.get(s.device) ?? [];
      arr.push(s);
      byDevice.set(s.device, arr);
    }

    for (const [device, sensors] of byDevice) {
      const site = await this.cariSite(device);
      let ticketId: number | null = null;

      if (site) {
        const sensorNames = sensors.map((s) => s.sensor).join(', ');
        const ticket = await this.buatTiketPrtg(
          { sensorId: String(sensors[0].objid), device, sensor: sensorNames, message: sensors[0].message_raw },
          site,
        );
        ticketId = ticket.id_ticket;
        hasil.tiket_dibuat++;
        // Acknowledge alarm di PRTG — semua sensor device ini, fire-and-forget
        for (const s of sensors) {
          this.prtg.acknowledgeAlarm(s.objid, `Tiket ${ticket.nomor_tiket} dibuat oleh sistem ERP`).catch(() => {});
        }
        this.wa.notifMonitorDown({
          sumber: 'PRTG', nama: device, nama_site: site.nama_site,
          msg: sensorNames,
        }).catch(() => {});
      } else {
        hasil.tanpa_site++;
        this.notif.notifyForModul('operations', {
          tipe: 'tiket_baru',
          judul: `🔴 [PRTG] ${device} DOWN — site tidak dikenali`,
          deskripsi: `${sensors.map(s => s.sensor).join(', ')}: tidak cocok dgn nama site, buat tiket manual`,
          url: '/operations',
        }).catch(() => {});
        // tidak kirim WA untuk device yang belum di-mapping ke site
      }

      // Buat 1 baris webhook per sensor (semua menunjuk tiket yang sama)
      for (const s of sensors) {
        await this.prisma.integrationPrtgWebhook.create({
          data: {
            prtg_sensor_id: String(s.objid),
            prtg_device_name: device,
            prtg_sensor_name: s.sensor,
            status_sensor: s.status,
            pesan_alert: s.message_raw,
            id_ticket_terbentuk: ticketId,
          },
        });
      }
    }

    // ── 2. Device kembali UP → resolve tiket saat SEMUA sensornya UP ──
    const downDevices = new Set(downSensors.map((s) => s.device));
    const aktifPrtg = await this.prisma.integrationPrtgWebhook.findMany({
      where: { ticket: { status_tiket: { in: STATUS_TIKET_AKTIF }, sumber_tiket: 'PRTG' } },
      include: { ticket: { select: { id_ticket: true, nomor_tiket: true, status_tiket: true } } },
    });
    // Group by tiket — resolve hanya kalau semua sensornya sudah UP
    const tiketSensors = new Map<number, { ticket: typeof aktifPrtg[0]['ticket']; devices: string[]; allUp: boolean }>();
    for (const w of aktifPrtg) {
      if (!w.ticket) continue;
      const entry = tiketSensors.get(w.ticket.id_ticket) ?? { ticket: w.ticket, devices: [], allUp: true };
      entry.devices.push(w.prtg_device_name ?? '');
      if (w.prtg_sensor_id && downDevices.has(w.prtg_device_name ?? '')) entry.allUp = false;
      tiketSensors.set(w.ticket.id_ticket, entry);
    }
    for (const { ticket, devices, allUp } of tiketSensors.values()) {
      if (!allUp) continue;
      await this.prisma.operationTicket.update({
        where: { id_ticket: ticket.id_ticket },
        data: { status_tiket: 'Resolved', tgl_resolved: new Date() },
      });
      await this.prisma.operationTicketLog.create({
        data: {
          id_ticket: ticket.id_ticket,
          status_dari: ticket.status_tiket,
          status_ke: 'Resolved',
          catatan: `Device PRTG kembali UP — auto-resolved`,
        },
      });
      hasil.auto_resolved++;
      await this.prisma.notification.deleteMany({
        where: { is_read: false, url: `/operations/${ticket.id_ticket}` },
      }).catch(() => {});
      const deviceName = devices[0] ?? '';
      this.wa.notifMonitorUp({ sumber: 'PRTG', nama: deviceName }).catch(() => {});

      // WA notif ke grup pelanggan — device kembali UP
      this.prisma.operationTicket.findUnique({
        where: { id_ticket: ticket.id_ticket },
        select: { nomor_tiket: true, judul_tiket: true, id_site: true, site: { select: { nama_site: true, id_pelanggan: true, pelanggan: { select: { nama_pelanggan: true, no_hp_pic_utama: true } } } } },
      }).then((t) => {
        if (!t?.site) return;
        this.wa.notifTiketUpdate({
          nomor_tiket: t.nomor_tiket,
          judul: t.judul_tiket,
          status_dari: ticket.status_tiket ?? 'Open',
          status_ke: 'Resolved',
          nama_site: t.site.nama_site,
          nama_pelanggan: t.site.pelanggan?.nama_pelanggan ?? '',
          id_pelanggan: t.site.id_pelanggan,
          no_hp_customer: t.site.pelanggan?.no_hp_pic_utama,
        });
      }).catch(() => {});
    }

    // ── 3. Device UP tanpa tiket (site tak dikenali) — bersihkan penanda ──
    const tanpaTiket = await this.prisma.integrationPrtgWebhook.findMany({
      where: {
        id_ticket_terbentuk: null,
        diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
    });
    for (const w of tanpaTiket) {
      if (!w.prtg_sensor_id || downDevices.has(w.prtg_device_name ?? '')) continue;
      await this.prisma.notification.deleteMany({
        where: { is_read: false, judul: { contains: `[PRTG] ${w.prtg_device_name} DOWN` } },
      }).catch(() => {});
      await this.prisma.integrationPrtgWebhook.delete({ where: { id_webhook: w.id_webhook } }).catch(() => {});
    }

    if (hasil.tiket_dibuat || hasil.auto_resolved || hasil.tanpa_site) {
      this.logger.log(`PRTG poll: ${JSON.stringify(hasil)}`);
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

  // Dipakai poll() (sensor down real-time) & createMapping() (retroaktif utk
  // webhook yang sudah tersimpan tanpa tiket sebelum device-nya di-mapping).
  private async buatTiketPrtg(
    info: { sensorId: string; device: string; sensor: string; message?: string | null },
    site: { id_site: number; nama_site: string },
  ) {
    const prioritas = info.sensor.toLowerCase().includes('ping') ? 'Critical' : 'High';
    const now = new Date();
    const nomor = await this.genNomorTiket(now);
    const ticket = await this.prisma.operationTicket.create({
      data: {
        nomor_tiket: nomor,
        id_site: site.id_site,
        judul_tiket: `[PRTG] ${info.device} — ${info.sensor} DOWN`,
        deskripsi_masalah: info.message || `Sensor ${info.sensor} pada ${info.device} down`,
        prioritas,
        sumber_tiket: 'PRTG',
        sla_due: new Date(now.getTime() + (SLA_JAM[prioritas] ?? 24) * 3600_000),
      },
    });
    await this.prisma.operationTicketLog.create({
      data: { id_ticket: ticket.id_ticket, status_ke: 'Open', catatan: `Tiket dibuat otomatis dari PRTG (sensor #${info.sensorId})` },
    });
    this.notif.notifyForModul('operations', {
      tipe: 'tiket_baru',
      judul: `🔴 [PRTG] ${info.device} DOWN`,
      deskripsi: `${nomor} — ${info.sensor} (${prioritas})`,
      url: `/operations/${ticket.id_ticket}`,
    }).catch(() => {});

    // WA notif ke grup pelanggan (ambil id_pelanggan dari site)
    this.prisma.sitePelanggan.findUnique({
      where: { id_site: site.id_site },
      select: { id_pelanggan: true, pelanggan: { select: { nama_pelanggan: true, no_hp_pic_utama: true } } },
    }).then((sp) => {
      if (!sp) return;
      this.wa.notifTiketBaru({
        nomor_tiket: nomor,
        judul: `[PRTG] ${info.device} — ${info.sensor} DOWN`,
        nama_site: site.nama_site,
        nama_pelanggan: sp.pelanggan?.nama_pelanggan ?? '',
        id_pelanggan: sp.id_pelanggan,
        no_hp_customer: sp.pelanggan?.no_hp_pic_utama,
      });
    }).catch(() => {});

    return ticket;
  }

  // ─── KONFIGURASI KONEKSI ────────────────────────────────────────

  async getConfig() {
    const row = await this.prisma.integrationPrtgConfig.findUnique({ where: { id: 1 } });
    return {
      data: {
        base_url: row?.base_url || '',
        username: row?.username || '',
        has_passhash: !!row?.passhash,
      },
    };
  }

  async updateConfig(dto: { base_url?: string; username?: string; passhash?: string }) {
    const existing = await this.prisma.integrationPrtgConfig.findUnique({ where: { id: 1 } });
    await this.prisma.integrationPrtgConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        base_url: dto.base_url || null,
        username: dto.username || null,
        passhash: dto.passhash ? this.crypto.encrypt(dto.passhash) : null,
      },
      update: {
        base_url: dto.base_url !== undefined ? dto.base_url : undefined,
        username: dto.username !== undefined ? dto.username : undefined,
        // Passhash kosong dari form (tidak diubah user) jangan menimpa yang sudah ada
        passhash: dto.passhash ? this.crypto.encrypt(dto.passhash) : undefined,
      },
    });
    return { message: 'Konfigurasi PRTG disimpan' };
  }

  // ─── MAPPING DEVICE → SITE ──────────────────────────────────────

  async listMapping() {
    const data = await this.prisma.integrationPrtgMapping.findMany({
      orderBy: { created_at: 'desc' },
      include: { site: { select: { id_site: true, kode_site: true, nama_site: true } } },
    });
    return { data };
  }

  /** Device PRTG yang pernah gagal matching & masih "aktif" (belum diselesaikan) */
  async listUnmatched() {
    const rows = await this.prisma.integrationPrtgWebhook.findMany({
      where: { id_ticket_terbentuk: null, diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) } },
      orderBy: { diterima_pada: 'desc' },
      distinct: ['prtg_device_name'],
    });
    return { data: rows.filter((r) => r.prtg_device_name) };
  }

  async createMapping(dto: { device_name: string; id_site: number }) {
    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: dto.id_site } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');

    const mapping = await this.prisma.integrationPrtgMapping.upsert({
      where: { device_name: dto.device_name },
      create: { device_name: dto.device_name, id_site: dto.id_site },
      update: { id_site: dto.id_site },
      include: { site: { select: { id_site: true, kode_site: true, nama_site: true } } },
    });

    // Retroaktif: kalau ada webhook down yang belum bertiket untuk device ini,
    // langsung buatkan tiketnya sekarang — tidak perlu nunggu poll berikutnya.
    const pending = await this.prisma.integrationPrtgWebhook.findFirst({
      where: {
        prtg_device_name: dto.device_name,
        id_ticket_terbentuk: null,
        diterima_pada: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
      orderBy: { diterima_pada: 'desc' },
    });
    let tiket_dibuat = false;
    if (pending && pending.prtg_sensor_id) {
      const ticket = await this.buatTiketPrtg(
        { sensorId: pending.prtg_sensor_id, device: dto.device_name, sensor: pending.prtg_sensor_name || 'Sensor', message: pending.pesan_alert },
        site,
      );
      await this.prisma.integrationPrtgWebhook.update({ where: { id_webhook: pending.id_webhook }, data: { id_ticket_terbentuk: ticket.id_ticket } });
      this.prtg.acknowledgeAlarm(Number(pending.prtg_sensor_id), `Tiket ${ticket.nomor_tiket} dibuat oleh sistem ERP`).catch(() => {});
      await this.prisma.notification.deleteMany({
        where: { is_read: false, judul: { contains: `[PRTG] ${dto.device_name} DOWN` } },
      }).catch(() => {});
      tiket_dibuat = true;
    }

    return { data: mapping, message: tiket_dibuat ? 'Mapping disimpan — tiket langsung dibuat untuk alert yang tertunda' : 'Mapping disimpan' };
  }

  async removeMapping(id: number) {
    const row = await this.prisma.integrationPrtgMapping.findUnique({ where: { id_mapping: id } });
    if (!row) throw new NotFoundException('Mapping tidak ditemukan');
    await this.prisma.integrationPrtgMapping.delete({ where: { id_mapping: id } });
    return { message: 'Mapping dihapus' };
  }

  // ─── SENSOR PING & ETHER PER SITE ──────────────────────────────

  // Keyword untuk detect jenis sensor
  private isPing  = (name: string) => /ping|icmp/i.test(name);
  private isEther = (name: string) => /traffic|ether|bandwidth|bps|byte|in\/out|interface/i.test(name);

  async getSiteSensors(id_site: number) {
    if (!(await this.prtg.isConfigured())) return { data: { device_name: null, sensors: [] } };

    const mapping = await this.prisma.integrationPrtgMapping.findFirst({ where: { id_site } });
    if (!mapping) return { data: { device_name: null, sensors: [] } };

    const sensors = await this.prtg.getSensorsByDevice(mapping.device_name);
    return {
      data: {
        device_name: mapping.device_name,
        sensors,   // semua sensor apa adanya dari PRTG, tidak difilter
      },
    };
  }

  async getSensorChannels(objid: number) {
    if (!(await this.prtg.isConfigured())) return { data: [] };
    const channels = await this.prtg.getSensorChannels(objid);
    return { data: channels };
  }

  async getSensorHistory(objid: number, hours = 24) {
    if (!(await this.prtg.isConfigured())) return { data: [] };
    const avgSecs = hours <= 6 ? 60 : hours <= 48 ? 300 : 3600;
    const data = await this.prtg.getSensorHistory(objid, hours, avgSecs);
    return { data };
  }

  async getSensorGraph(objid: number, graphid = 0): Promise<{ buffer: Buffer; contentType: string }> {
    return this.prtg.getGraphImageBuffer(objid, graphid, 900, 250);
  }

  // ─── AUDIT DAFTAR SENSOR/DEVICE ─────────────────────────────────

  async getDeviceOverview() {
    if (!(await this.prtg.isConfigured())) return { data: [] };
    const sensors = await this.prtg.getAllSensors();

    // Muat sites & mapping SEKALI SAJA, lalu cocokkan di memori. Versi lama
    // menembak ~3 query DB PER device (±2.150 device = ribuan query serentak,
    // + findMany 1000 site berulang) → connection pool & memori habis → app
    // down. Sekarang cukup 2 query total.
    const [sites, mappings] = await Promise.all([
      this.prisma.sitePelanggan.findMany({ select: { id_site: true, kode_site: true, nama_site: true } }),
      this.prisma.integrationPrtgMapping.findMany({
        select: { device_name: true, site: { select: { id_site: true, kode_site: true, nama_site: true } } },
      }),
    ]);
    const mapByDevice = new Map(mappings.map((m) => [m.device_name, m.site]));
    const sitesLower = sites.map((s) => ({ ...s, lower: s.nama_site.toLowerCase() }));

    // Matching di memori: mapping manual dulu, lalu substring nama (dua arah).
    const matchSite = (device: string): { site: any; manual: boolean } => {
      const mapped = mapByDevice.get(device);
      if (mapped) return { site: mapped, manual: true };
      const dl = device.trim().toLowerCase();
      if (!dl) return { site: null, manual: false };
      const fwd = sitesLower.find((s) => s.lower.includes(dl));   // nama_site memuat device
      const hit = fwd ?? sitesLower.find((s) => dl.includes(s.lower)); // device memuat nama_site
      return { site: hit ?? null, manual: false };
    };

    const byDevice = new Map<string, PrtgSensor[]>();
    for (const s of sensors) {
      if (!byDevice.has(s.device)) byDevice.set(s.device, []);
      byDevice.get(s.device)!.push(s);
    }

    const data = Array.from(byDevice.entries()).map(([device, list]) => {
      const { site, manual } = matchSite(device);
      return {
        device_name: device,
        jumlah_sensor: list.length,
        ada_down: list.some((s) => ['5', '14', 'Down', 'Down Partial'].includes(String(s.status_raw ?? s.status))),
        matched: !!site,
        site: site ? { id_site: site.id_site, kode_site: site.kode_site, nama_site: site.nama_site } : null,
        mapped_manual: manual,
      };
    });
    data.sort((a, b) => a.device_name.localeCompare(b.device_name));
    return { data };
  }
}
