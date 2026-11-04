import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { cariSiteDariNama } from '../../../common/utils/site-match';
import { PrtgClient } from '../prtg/prtg.client';
import { NotificationsService } from '../../notifications/notifications.service';
import { StarsenderService } from '../starsender/starsender.service';
import { SLA_JAM } from '../../operations/operations.service';
import { withNextTicketNumber } from '../../../common/utils/ticket-number';

// online = semua tunnel VPN tersambung · partial = salah satu tunnel putus ·
// internet_ok = internet lokasi hidup tapi VPN putus (heartbeat syslog masih masuk) · offline = mati total
export type StatusRouter = 'online' | 'partial' | 'internet_ok' | 'offline';
const BOBOT: Record<string, number> = { offline: 3, internet_ok: 2, partial: 1, online: 0 };
const STATUS_TIKET_AKTIF = ['Open', 'In_Progress', 'Pending_Customer'];
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const IP_SAJA = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export const KESIMPULAN: Record<StatusRouter | 'tidak_ada', { label: string; saran: string }> = {
  online: { label: 'Online', saran: 'Kedua jalur VPN tersambung — kemungkinan bukan putus koneksi (alarm PRTG palsu / sensor lain).' },
  partial: { label: '1 tunnel putus', saran: 'Salah satu jalur VPN (NS/UN) putus, lokasi masih tersambung lewat jalur lain — cek ISP jalur yang putus.' },
  internet_ok: { label: 'Internet hidup, VPN putus', saran: 'Internet di lokasi hidup, hanya VPN ke NEXT1 yang putus — tangani remote (tunnel/akun VPN), belum perlu visit.' },
  offline: { label: 'Mati total', saran: 'Router tidak terlihat sama sekali (listrik / perangkat / internet lokasi) — konfirmasi PIC, kandidat visit.' },
  tidak_ada: { label: 'Tidak terpetakan', saran: 'Site ini belum terhubung ke router NOCaaS — petakan di halaman Pembanding NOCaaS.' },
};

interface Paired {
  site_key: string; primary_name?: string; brand?: string; public_ip?: string; access_isp?: string;
  offline_since?: string | null; downs7?: number; flaps24?: number; any_online?: boolean;
  ns?: { name?: string; tunnel_ip?: string; is_online?: boolean; net_status?: string; hb_at?: string | null } | null;
  un?: { name?: string; tunnel_ip?: string; is_online?: boolean; net_status?: string; hb_at?: string | null } | null;
}

/**
 * Integrasi NOCaaS — status router pelanggan dari aplikasi NOC (FastAPI, tanpa auth, jaringan internal)
 * disalin ke tabel nocaas_router tiap menit, lalu dipakai sebagai pembanding tiket gangguan PRTG:
 * PRTG bilang down, NOCaaS bilang apa?
 */
@Injectable()
export class NocaasService {
  private readonly logger = new Logger('NOCaaS');
  private sedang = false;
  private terakhir: { at: Date; ok: boolean; pesan: string; jumlah: number } | null = null;
  private prtgHost: { exp: number; ipKeDevice: Map<string, string> } | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private prtg: PrtgClient,
    private notif: NotificationsService,
    private wa: StarsenderService,
  ) {}

  private get base() {
    return (this.config.get<string>('NOCAAS_API_URL') || 'http://192.168.200.225:8000').replace(/\/$/, '');
  }

  private async ambil<T = any>(path: string, timeout = 30_000): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`NOCaaS ${res.status} ${path}`);
    return res.json() as Promise<T>;
  }

  static hitungStatus(x: Paired): StatusRouter {
    const t = [x.ns, x.un].filter((v): v is NonNullable<Paired['ns']> => !!v);
    const on = t.filter((v) => v.is_online).length;
    if (t.length && on === t.length) return 'online';
    if (on > 0 || (!t.length && x.any_online)) return t.length ? 'partial' : 'online';
    return t.some((v) => v.net_status === 'internet_ok') ? 'internet_ok' : 'offline';
  }

  // ── Sinkronisasi ───────────────────────────────────────────────────────────
  @Cron('*/1 * * * *')
  async cronSinkron() {
    if (this.config.get<string>('NOCAAS_SYNC_ENABLED') === 'false') return;
    await this.sinkron().catch(() => {});
    await this.prosesTiket().catch((e) => this.logger.warn(`Tiket NOCaaS gagal: ${e?.message}`));
  }

  async sinkron() {
    if (this.sedang) return { data: this.terakhir, message: 'Sinkronisasi sedang berjalan' };
    this.sedang = true;
    try {
      const { items } = await this.ambil<{ items: Paired[] }>('/api/devices/paired?limit=10000', 60_000);
      if (!Array.isArray(items) || !items.length) throw new Error('Data NOCaaS kosong');

      const [lama, ipSite, prtgIp] = await Promise.all([
        this.prisma.nocaasRouter.findMany(),
        this.petaIpPerangkat(),
        this.petaHostPrtg(),
      ]);
      const byKey = new Map(lama.map((r) => [r.site_key, r]));
      const now = new Date();
      const tulis: any[] = [];
      const cacheNama = new Map<string, number | null>();

      for (const x of items) {
        if (!x.site_key) continue;
        const status = NocaasService.hitungStatus(x);
        const ns_ip = x.ns?.tunnel_ip || null, un_ip = x.un?.tunnel_ip || null;
        const r = byKey.get(x.site_key);

        // Pemetaan site: manual tidak pernah ditimpa
        let id_site: number | null = r?.id_site ?? null, sumber_map: string | null = r?.sumber_map ?? null;
        if (sumber_map !== 'manual') {
          id_site = null; sumber_map = null;
          const viaIp = (ns_ip && ipSite.get(ns_ip)) || (un_ip && ipSite.get(un_ip));
          if (viaIp) { id_site = viaIp; sumber_map = 'ip_perangkat'; }
          if (!id_site) {
            const dev = (ns_ip && prtgIp.get(ns_ip)) || (un_ip && prtgIp.get(un_ip));
            if (dev) {
              const s = await this.siteDariDevicePrtg(dev, cacheNama);
              if (s) { id_site = s; sumber_map = 'prtg_host'; }
            }
          }
          if (!id_site) {
            const s = await this.siteDariNama(x.site_key.replace(/[-_]+/g, ' ').trim(), cacheNama);
            if (s) { id_site = s; sumber_map = 'nama'; }
          }
        }

        const data = {
          nama_utama: x.primary_name || x.ns?.name || x.un?.name || null,
          id_site, sumber_map, status, ns_ip, un_ip,
          ns_online: x.ns ? !!x.ns.is_online : null, un_online: x.un ? !!x.un.is_online : null,
          offline_since: x.offline_since ? new Date(x.offline_since) : null,
          hb_at: this.hbTerbaru(x),
          public_ip: x.public_ip || null, access_isp: x.access_isp?.slice(0, 100) || null, brand: x.brand?.slice(0, 20) || null,
          downs7: x.downs7 ?? 0, flaps24: x.flaps24 ?? 0,
        };
        if (!r) {
          tulis.push(this.prisma.nocaasRouter.create({ data: { site_key: x.site_key, ...data, status_sejak: status === 'offline' && data.offline_since ? data.offline_since : now } }));
          continue;
        }
        const berubah = (Object.keys(data) as (keyof typeof data)[]).some((k) => {
          const a: any = data[k], b: any = (r as any)[k];
          if (k === 'hb_at') return Math.abs((a?.getTime?.() ?? 0) - (b?.getTime?.() ?? 0)) > 5 * 60_000;
          return a instanceof Date || b instanceof Date ? (a?.getTime?.() ?? null) !== (b?.getTime?.() ?? null) : (a ?? null) !== (b ?? null);
        });
        if (berubah) tulis.push(this.prisma.nocaasRouter.update({ where: { site_key: x.site_key }, data: { ...data, ...(r.status !== status ? { status_sejak: now } : {}) } }));
      }
      // Router yang sudah dihapus dari NOCaaS (jaga-jaga: hanya bila datanya lengkap)
      const ada = new Set(items.map((x) => x.site_key));
      const hilang = lama.filter((r) => !ada.has(r.site_key)).map((r) => r.site_key);
      if (hilang.length && items.length > 1000) tulis.push(this.prisma.nocaasRouter.deleteMany({ where: { site_key: { in: hilang } } }));

      for (let i = 0; i < tulis.length; i += 200) await this.prisma.$transaction(tulis.slice(i, i + 200));
      this.terakhir = { at: now, ok: true, pesan: `${items.length} router, ${tulis.length} perubahan`, jumlah: items.length };
      await this.prisma.nocaasConfig.upsert({ where: { id: 1 }, create: { id: 1, terakhir_sinkron: now }, update: { terakhir_sinkron: now } });
      return { data: this.terakhir, message: `Sinkron NOCaaS: ${this.terakhir.pesan}` };
    } catch (e: any) {
      this.terakhir = { at: new Date(), ok: false, pesan: e?.message || String(e), jumlah: this.terakhir?.jumlah ?? 0 };
      this.logger.warn(`Sinkron gagal: ${this.terakhir.pesan}`);
      throw e;
    } finally {
      this.sedang = false;
    }
  }

  private hbTerbaru(x: Paired) {
    const t = [x.ns?.hb_at, x.un?.hb_at].filter(Boolean).map((v) => new Date(v!).getTime());
    return t.length ? new Date(Math.max(...t)) : null;
  }

  /** IP tunnel yang tercatat di perangkat site (site aktif) → id_site; IP yang dipakai >1 site diabaikan */
  private async petaIpPerangkat() {
    const rows = await this.prisma.perangkatSite.findMany({
      where: { ip_address: { not: null }, site: { status_site: 'Aktif' } },
      select: { id_site: true, ip_address: true },
    });
    const m = new Map<string, number>(), ganda = new Set<string>();
    for (const r of rows) for (const ip of r.ip_address!.match(IP_RE) ?? []) {
      if (m.has(ip) && m.get(ip) !== r.id_site) ganda.add(ip);
      m.set(ip, r.id_site);
    }
    ganda.forEach((ip) => m.delete(ip));
    return m;
  }

  /** Host (IP) device PRTG → nama device; disegarkan tiap jam (PRTG lambat untuk daftar device) */
  private async petaHostPrtg() {
    if (this.prtgHost && this.prtgHost.exp > Date.now()) return this.prtgHost.ipKeDevice;
    const ipKeDevice = new Map<string, string>();
    try {
      if (await this.prtg.isConfigured()) for (const d of await this.prtg.getDevices()) if (IP_SAJA.test(d.host?.trim() || '')) ipKeDevice.set(d.host.trim(), d.device);
    } catch (e: any) {
      this.logger.warn(`Daftar device PRTG gagal: ${e?.message}`);
      if (this.prtgHost) return this.prtgHost.ipKeDevice; // pakai yang lama
    }
    this.prtgHost = { exp: Date.now() + 3600_000, ipKeDevice };
    return ipKeDevice;
  }

  private async siteDariDevicePrtg(device: string, cache: Map<string, number | null>) {
    const k = `prtg:${device}`;
    if (cache.has(k)) return cache.get(k)!;
    const m = await this.prisma.integrationPrtgMapping.findUnique({ where: { device_name: device.trim() }, select: { id_site: true } });
    const id = m?.id_site ?? (await cariSiteDariNama(this.prisma, device))?.id_site ?? null;
    cache.set(k, id);
    return id;
  }

  private async siteDariNama(nama: string, cache: Map<string, number | null>) {
    if (cache.has(nama)) return cache.get(nama)!;
    const id = (await cariSiteDariNama(this.prisma, nama))?.id_site ?? null;
    cache.set(nama, id);
    return id;
  }

  // ── Pembanding ─────────────────────────────────────────────────────────────
  private bentuk(r: any) {
    const k = KESIMPULAN[r.status as StatusRouter] ?? KESIMPULAN.offline;
    return { ...r, label: k.label, saran: k.saran };
  }

  /** Status terburuk per site (untuk badge di daftar tiket) */
  async statusSite(ids: number[]) {
    const id = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))].slice(0, 500);
    if (!id.length) return { data: {} };
    const rows = await this.prisma.nocaasRouter.findMany({ where: { id_site: { in: id } }, select: { id_site: true, status: true, status_sejak: true } });
    const out: Record<number, { status: string; label: string; sejak: Date }> = {};
    for (const r of rows) {
      const cur = out[r.id_site!];
      if (!cur || BOBOT[r.status] > BOBOT[cur.status]) out[r.id_site!] = { status: r.status, label: KESIMPULAN[r.status as StatusRouter]?.label ?? r.status, sejak: r.status_sejak };
    }
    return { data: out };
  }

  /** Router site tiket + router yang IP tunnel-nya = host device PRTG tiket, status terburuk di depan */
  private async routerUntukTiket(t: { id_site: number; prtg_webhooks: { prtg_device_name: string | null }[] }) {
    const where: any[] = [{ id_site: t.id_site }];
    const dev = t.prtg_webhooks[0]?.prtg_device_name;
    if (dev) {
      const peta = await this.petaHostPrtg();
      const ip = [...peta.entries()].filter(([, d]) => d === dev).map(([ip]) => ip);
      if (ip.length) where.push({ ns_ip: { in: ip } }, { un_ip: { in: ip } });
    }
    const rows = await this.prisma.nocaasRouter.findMany({ where: { OR: where }, orderBy: { site_key: 'asc' } });
    return rows.map((r) => this.bentuk(r)).sort((a, b) => BOBOT[b.status] - BOBOT[a.status]);
  }

  /** Pembanding untuk satu tiket */
  async pembandingTiket(id_ticket: number) {
    const t = await this.prisma.operationTicket.findUnique({
      where: { id_ticket },
      select: { id_site: true, status_tiket: true, prtg_webhooks: { select: { prtg_device_name: true }, take: 1 } },
    });
    if (!t) throw new NotFoundException('Tiket tidak ditemukan');
    const routers = await this.routerUntukTiket(t);
    const utama = routers[0];
    return {
      data: {
        routers,
        kesimpulan: utama ? { status: utama.status, label: utama.label, saran: utama.saran } : { status: 'tidak_ada', ...KESIMPULAN.tidak_ada },
        sinkron: this.terakhir,
        tiket_aktif: STATUS_TIKET_AKTIF.includes(t.status_tiket),
      },
    };
  }

  // ── Tiket gangguan otomatis ────────────────────────────────────────────────
  // Router site aktif yang menjadi "mati total" (tidak ada VPN & tidak ada heartbeat syslog) setelah fitur aktif,
  // dan bertahan ≥ durasi_konfirmasi → tiket. Router kembali online (atau minimal 1 tunnel) → tiket auto-resolve.
  async konfigurasi() {
    return this.prisma.nocaasConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  async ubahKonfigurasi(d: { tiket_aktif?: boolean; durasi_konfirmasi_menit?: number; cooldown_menit?: number; maks_tiket_per_putaran?: number }) {
    await this.konfigurasi();
    const data: any = {};
    if (typeof d.tiket_aktif === 'boolean') data.tiket_aktif = d.tiket_aktif;
    if (d.durasi_konfirmasi_menit !== undefined) data.durasi_konfirmasi_menit = Math.min(Math.max(Math.round(d.durasi_konfirmasi_menit), 1), 240);
    if (d.cooldown_menit !== undefined) data.cooldown_menit = Math.min(Math.max(Math.round(d.cooldown_menit), 0), 1440);
    if (d.maks_tiket_per_putaran !== undefined) data.maks_tiket_per_putaran = Math.min(Math.max(Math.round(d.maks_tiket_per_putaran), 1), 500);
    return { data: await this.prisma.nocaasConfig.update({ where: { id: 1 }, data }), message: 'Konfigurasi disimpan' };
  }

  private catatanRouter(r: any) {
    const tunnel = [r.ns_ip && `NS ${r.ns_ip}`, r.un_ip && `UN ${r.un_ip}`].filter(Boolean).join(', ');
    const hb = r.hb_at ? `heartbeat terakhir ${new Date(r.hb_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` : 'belum pernah heartbeat';
    return `${r.site_key} (${tunnel || 'tanpa tunnel'}) · internet ${r.access_isp || '—'}${r.public_ip ? ` ${r.public_ip}` : ''} · ${hb}`;
  }

  private waktuWib(d: Date) {
    return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) + ' WIB';
  }

  async prosesTiket() {
    const cfg = await this.konfigurasi();
    if (!cfg.tiket_aktif) return;
    // Data harus segar — tanpa itu semua router bisa tampak mati dan membanjiri tiket
    if (!this.terakhir?.ok || Date.now() - this.terakhir.at.getTime() > 3 * 60_000) return;
    const now = new Date();
    const hasil = { dibuat: 0, dibuka_ulang: 0, dicatat: 0, resolved: 0 };

    // 1) Kandidat: router mati total, sudah dipetakan ke site aktif, berubah mati SETELAH fitur aktif, lewat masa konfirmasi
    const mati = await this.prisma.nocaasRouter.findMany({
      where: {
        status: 'offline', id_site: { not: null }, site: { status_site: 'Aktif' },
        status_sejak: { gte: cfg.aktif_sejak, lte: new Date(now.getTime() - cfg.durasi_konfirmasi_menit * 60_000) },
      },
      include: { site: { select: { id_site: true, nama_site: true } } },
      orderBy: { status_sejak: 'asc' },
    });
    const perSite = new Map<number, typeof mati>();
    for (const r of mati) perSite.set(r.id_site!, [...(perSite.get(r.id_site!) ?? []), r]);

    const aktif = perSite.size
      ? await this.prisma.operationTicket.findMany({
          where: { id_site: { in: [...perSite.keys()] }, status_tiket: { in: STATUS_TIKET_AKTIF } },
          select: { id_ticket: true, id_site: true, sumber_tiket: true, status_tiket: true, logs: { where: { catatan: { startsWith: 'NOCaaS:' } }, select: { id_log: true }, take: 1 } },
        })
      : [];
    const tiketAktif = new Map(aktif.map((t) => [t.id_site, t]));
    const perluBaru = [...perSite.keys()].filter((id) => !tiketAktif.has(id));

    // Pengaman: terlalu banyak sekaligus = kemungkinan gangguan pusat / NOCaaS → jangan buat tiket massal
    if (perluBaru.length > cfg.maks_tiket_per_putaran) {
      this.logger.warn(`${perluBaru.length} site mati total sekaligus (> ${cfg.maks_tiket_per_putaran}) — tiket ditahan, kemungkinan gangguan pusat`);
      const kunci = `NOCaaS: ${perluBaru.length} site mati total`;
      const sudah = await this.prisma.notification.findFirst({ where: { judul: { startsWith: 'NOCaaS:' }, created_at: { gte: new Date(now.getTime() - 3600_000) } } });
      if (!sudah) this.notif.notifyForModul('operations', { tipe: 'tiket_baru', judul: `${kunci} sekaligus`, deskripsi: 'Tiket otomatis ditahan — cek koneksi pusat / NOCaaS', url: '/nocaas' }).catch(() => {});
    } else {
      for (const id_site of perluBaru) {
        const r = await this.buatTiket(perSite.get(id_site)!, cfg.cooldown_menit);
        if (r === 'baru') hasil.dibuat++; else if (r === 'ulang') hasil.dibuka_ulang++;
      }
    }

    // Site yang sudah punya tiket aktif dari sumber lain (WA/manual/PRTG): cukup catat sekali di log
    for (const t of aktif) {
      if (t.sumber_tiket === 'NOCaaS' || t.logs.length) continue;
      const rs = perSite.get(t.id_site)!;
      await this.prisma.operationTicketLog.create({
        data: { id_ticket: t.id_ticket, status_ke: t.status_tiket, catatan: `NOCaaS: router mati total sejak ${this.waktuWib(rs[0].status_sejak)} — ${rs.map((r) => this.catatanRouter(r)).join(' | ')}` },
      });
      hasil.dicatat++;
    }

    // 2) Auto-resolve tiket NOCaaS yang routernya sudah hidup lagi
    const tiketNoc = await this.prisma.operationTicket.findMany({
      where: { sumber_tiket: 'NOCaaS', status_tiket: { in: STATUS_TIKET_AKTIF } },
      select: {
        id_ticket: true, nomor_tiket: true, judul_tiket: true, status_tiket: true, id_site: true,
        site: { select: { nama_site: true, id_pelanggan: true, pelanggan: { select: { nama_pelanggan: true, no_hp_pic_utama: true } } } },
        logs: { where: { catatan: { startsWith: 'NOCaaS: internet lokasi kembali' } }, select: { id_log: true }, take: 1 },
      },
    });
    for (const t of tiketNoc) {
      const rs = await this.prisma.nocaasRouter.findMany({ where: { id_site: t.id_site } });
      if (!rs.length || rs.some((r) => r.status === 'offline')) continue;
      if (rs.every((r) => r.status === 'internet_ok')) {
        // Internet lokasi hidup lagi tapi VPN belum → tiket tetap terbuka, tangani remote
        if (!t.logs.length) await this.prisma.operationTicketLog.create({
          data: { id_ticket: t.id_ticket, status_ke: t.status_tiket, catatan: 'NOCaaS: internet lokasi kembali (heartbeat syslog masuk), VPN masih putus — tangani remote' },
        });
        continue;
      }
      await this.prisma.operationTicket.update({ where: { id_ticket: t.id_ticket }, data: { status_tiket: 'Resolved', tgl_resolved: now } });
      const hidup = rs.filter((r) => r.status === 'online' || r.status === 'partial');
      await this.prisma.operationTicketLog.create({
        data: { id_ticket: t.id_ticket, status_dari: t.status_tiket, status_ke: 'Resolved', catatan: `NOCaaS: router kembali tersambung (${hidup.map((r) => `${r.site_key} ${KESIMPULAN[r.status as StatusRouter].label}`).join(', ')}) — auto-resolved` },
      });
      await this.prisma.notification.deleteMany({ where: { is_read: false, url: `/operations/${t.id_ticket}` } }).catch(() => {});
      this.wa.notifMonitorUp({ sumber: 'NOCaaS', nama: t.site.nama_site, nama_site: t.site.nama_site }).catch(() => {});
      this.wa.notifTiketUpdate({
        nomor_tiket: t.nomor_tiket, judul: t.judul_tiket, status_dari: t.status_tiket, status_ke: 'Resolved',
        nama_site: t.site.nama_site, nama_pelanggan: t.site.pelanggan?.nama_pelanggan ?? '', id_pelanggan: t.site.id_pelanggan, no_hp_customer: t.site.pelanggan?.no_hp_pic_utama,
      }).catch(() => {});
      hasil.resolved++;
    }
    if (hasil.dibuat || hasil.dibuka_ulang || hasil.dicatat || hasil.resolved) this.logger.log(`Tiket NOCaaS: ${JSON.stringify(hasil)}`);
  }

  /** Tiket baru (atau buka ulang tiket yang baru saja resolve — flapping) untuk satu site */
  private async buatTiket(rs: any[], cooldownMenit: number): Promise<'baru' | 'ulang'> {
    const site = rs[0].site as { id_site: number; nama_site: string };
    const now = new Date();
    const downAt: Date = rs[0].status_sejak;
    const prioritas = 'Critical';
    const rincian = rs.map((r) => this.catatanRouter(r)).join('\n');

    const flapping = await this.prisma.operationTicket.findFirst({
      where: { id_site: site.id_site, sumber_tiket: 'NOCaaS', status_tiket: { in: ['Resolved', 'Closed'] }, tgl_resolved: { gte: new Date(now.getTime() - cooldownMenit * 60_000) } },
      orderBy: { tgl_resolved: 'desc' },
    });
    if (flapping) {
      const menit = Math.round((now.getTime() - flapping.tgl_resolved!.getTime()) / 60_000);
      const ke = (await this.prisma.operationTicketLog.count({ where: { id_ticket: flapping.id_ticket, catatan: { contains: 'flapping' } } })) + 1;
      await this.prisma.operationTicket.update({
        where: { id_ticket: flapping.id_ticket },
        data: { status_tiket: 'In_Progress', tgl_resolved: null, tgl_sensor_down: downAt, sla_due: new Date(downAt.getTime() + (SLA_JAM[flapping.prioritas] ?? 4) * 3600_000), sla_breached: false },
      });
      await this.prisma.operationTicketLog.create({
        data: { id_ticket: flapping.id_ticket, status_dari: flapping.status_tiket, status_ke: 'In_Progress', catatan: `NOCaaS: ⚠️ flapping #${ke} — router mati total lagi ${menit} menit setelah tersambung\n${rincian}` },
      });
      this.notif.notifyForModul('operations', {
        tipe: 'tiket_update', judul: `⚠️ Flapping #${ke}: ${site.nama_site} mati lagi`, deskripsi: `${flapping.nomor_tiket} — ${menit} menit setelah tersambung`, url: `/operations/${flapping.id_ticket}`,
      }).catch(() => {});
      return 'ulang';
    }

    const judul = `[NOCaaS] ${site.nama_site} — Mati total`;
    const ticket = await withNextTicketNumber(this.prisma, now, (nomor_tiket) =>
      this.prisma.$transaction(async (tx) => {
        const t = await tx.operationTicket.create({
          data: {
            nomor_tiket, id_site: site.id_site, judul_tiket: judul, prioritas, sumber_tiket: 'NOCaaS',
            deskripsi_masalah: `Router tidak terlihat di NOCaaS sejak ${this.waktuWib(downAt)}: kedua VPN putus dan tidak ada heartbeat syslog (listrik / perangkat / internet lokasi).\n${rincian}`,
            tgl_sensor_down: downAt,
            sla_due: new Date(downAt.getTime() + (SLA_JAM[prioritas] ?? 4) * 3600_000),
          },
        });
        await tx.operationTicketLog.create({ data: { id_ticket: t.id_ticket, status_ke: 'Open', catatan: `NOCaaS: tiket dibuat otomatis — router mati total ≥ ${Math.round((now.getTime() - downAt.getTime()) / 60_000)} menit` } });
        return t;
      }),
    );
    this.notif.notifyForModul('operations', {
      tipe: 'tiket_baru', judul: `🔴 [NOCaaS] ${site.nama_site} mati total`, deskripsi: `${ticket.nomor_tiket} — ${rs.map((r) => r.site_key).join(', ')}`, url: `/operations/${ticket.id_ticket}`,
    }).catch(() => {});
    (async () => {
      const sp = await this.prisma.sitePelanggan.findUnique({
        where: { id_site: site.id_site },
        select: { id_pelanggan: true, alamat_lengkap: true, koordinat_gps: true, pelanggan: { select: { nama_pelanggan: true, no_hp_pic_utama: true } }, pic: { where: { is_utama: true }, select: { no_kontak: true }, take: 1 } },
      });
      if (!sp) return;
      await this.wa.notifTiketBaru({
        nomor_tiket: ticket.nomor_tiket, judul, nama_site: site.nama_site,
        nama_pelanggan: sp.pelanggan?.nama_pelanggan ?? '', id_pelanggan: sp.id_pelanggan, no_hp_customer: sp.pelanggan?.no_hp_pic_utama,
        alamat_site: sp.alamat_lengkap ?? '', koordinat_site: sp.koordinat_gps ?? '', no_hp_pic: sp.pic[0]?.no_kontak ?? '',
        sensor_detail: 'Router mati total (VPN & heartbeat NOCaaS)', waktu_down: this.waktuWib(downAt),
      });
    })().catch(() => {});
    return 'baru';
  }

  /** Riwayat kejadian tunnel/port dari NOCaaS (langsung, tidak disimpan) */
  async kejadian(site_key: string, jam = 72) {
    const r = await this.prisma.nocaasRouter.findUnique({ where: { site_key }, select: { nama_utama: true } });
    if (!r?.nama_utama) throw new NotFoundException('Router tidak ditemukan');
    const h = Math.min(Math.max(jam || 72, 1), 24 * 14);
    const d = await this.ambil<{ items: any[] }>(`/api/heartbeat/events?name=${encodeURIComponent(r.nama_utama)}&hours=${h}&limit=100`, 15_000);
    return { data: d.items ?? [] };
  }

  /** Halaman pembanding: tiket aktif vs NOCaaS, gangguan NOCaaS tanpa tiket, ringkasan pemetaan */
  async ringkasan() {
    const [tiket, bermasalah, grup, total] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where: { status_tiket: { in: STATUS_TIKET_AKTIF } },
        select: { id_ticket: true, nomor_tiket: true, judul_tiket: true, sumber_tiket: true, status_tiket: true, prioritas: true, tgl_open: true, id_site: true, site: { select: { kode_site: true, nama_site: true, kota: true } } },
        orderBy: { tgl_open: 'desc' }, take: 500,
      }),
      this.prisma.nocaasRouter.findMany({
        where: { status: { in: ['offline', 'internet_ok'] }, id_site: { not: null }, site: { status_site: 'Aktif' } },
        include: { site: { select: { kode_site: true, nama_site: true, kota: true, pelanggan: { select: { nama_pelanggan: true } } } } },
        orderBy: { status_sejak: 'desc' },
      }),
      this.prisma.nocaasRouter.groupBy({ by: ['status', 'sumber_map'], _count: { _all: true } }),
      this.prisma.sitePelanggan.count({ where: { status_site: 'Aktif' } }),
    ]);
    const st = await this.statusSite(tiket.map((t) => t.id_site));
    const siteTiket = new Set(tiket.map((t) => t.id_site));
    const tanpaTiket = bermasalah.filter((r) => !siteTiket.has(r.id_site!)).map((r) => this.bentuk(r));
    const siteTerpeta = await this.prisma.nocaasRouter.findMany({ where: { id_site: { not: null } }, distinct: ['id_site'], select: { id_site: true } });

    const per = (f: (g: (typeof grup)[number]) => boolean) => grup.filter(f).reduce((n, g) => n + g._count._all, 0);
    return {
      data: {
        sinkron: this.terakhir,
        tiket: tiket.map((t) => {
          const s = st.data[t.id_site];
          return { ...t, nocaas: s ? { ...s, saran: KESIMPULAN[s.status as StatusRouter]?.saran } : null };
        }),
        tanpa_tiket: tanpaTiket,
        pemetaan: {
          router: per(() => true),
          terpeta: per((g) => !!g.sumber_map),
          per_sumber: ['ip_perangkat', 'prtg_host', 'nama', 'manual'].map((s) => ({ sumber: s, n: per((g) => g.sumber_map === s) })),
          belum: per((g) => !g.sumber_map),
          site_aktif: total,
          site_terpeta: siteTerpeta.length,
        },
        status: ['online', 'partial', 'internet_ok', 'offline'].map((s) => ({ status: s, label: KESIMPULAN[s as StatusRouter].label, n: per((g) => g.status === s) })),
      },
    };
  }

  async belumTerpeta(q: { cari?: string; page?: number }) {
    const page = Math.max(1, Number(q.page) || 1), take = 50;
    const where: any = { sumber_map: null, ...(q.cari ? { OR: [{ site_key: { contains: q.cari } }, { ns_ip: { contains: q.cari } }, { un_ip: { contains: q.cari } }] } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.nocaasRouter.findMany({ where, orderBy: { site_key: 'asc' }, skip: (page - 1) * take, take }),
      this.prisma.nocaasRouter.count({ where }),
    ]);
    return { data: data.map((r) => this.bentuk(r)), meta: { total, page, pages: Math.ceil(total / take) } };
  }

  /** Router milik satu site (detail site / pemetaan) */
  async routerSite(id_site: number) {
    const rows = await this.prisma.nocaasRouter.findMany({ where: { id_site }, orderBy: { site_key: 'asc' } });
    return { data: rows.map((r) => this.bentuk(r)) };
  }

  async petakan(site_key: string, id_site: number | null) {
    const r = await this.prisma.nocaasRouter.findUnique({ where: { site_key } });
    if (!r) throw new NotFoundException('Router tidak ditemukan');
    if (id_site) {
      const s = await this.prisma.sitePelanggan.findUnique({ where: { id_site }, select: { id_site: true } });
      if (!s) throw new BadRequestException('Site tidak ditemukan');
    }
    // Lepas pemetaan manual → dicocokkan otomatis lagi pada sinkron berikutnya
    await this.prisma.nocaasRouter.update({ where: { site_key }, data: id_site ? { id_site, sumber_map: 'manual' } : { id_site: null, sumber_map: null } });
    return { message: id_site ? 'Router dipetakan ke site' : 'Pemetaan dilepas (akan dicocokkan otomatis lagi)' };
  }
}
