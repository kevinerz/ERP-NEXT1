import { dipegangHelpdesk, ditutupHelpdesk, catatSekali } from '../../../common/utils/tiket-helpdesk';
import { execFile, spawn } from 'child_process';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { cariSiteDariNama } from '../../../common/utils/site-match';
import { PrtgClient } from '../prtg/prtg.client';
import { namaNyambung, PencocokSaran, SiteCalon } from './nocaas-saran';
import { NotificationsService } from '../../notifications/notifications.service';
import { StarsenderService } from '../starsender/starsender.service';
import { WaService } from '../../whatsapp/wa.service';
import { SLA_JAM } from '../../operations/operations.service';
import { withNextTicketNumber } from '../../../common/utils/ticket-number';
import { NocaasClient } from './nocaas.client';

// online = semua tunnel VPN tersambung · partial = salah satu tunnel putus ·
// internet_ok = internet lokasi hidup tapi VPN putus (heartbeat syslog masih masuk) · offline = mati total
export type StatusRouter = 'online' | 'partial' | 'internet_ok' | 'offline';
const BOBOT: Record<string, number> = { offline: 3, macet: 2.5, internet_ok: 2, partial: 1, online: 0 };
const STATUS_TIKET_AKTIF = ['Open', 'In_Progress', 'Pending_Customer'];
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const IP_SAJA = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const normal = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
// Beri giliran ke permintaan HTTP lain di tengah loop berat (event loop Node tidak tersumbat)
const jeda = () => new Promise<void>((r) => setImmediate(r));
// Port uplink (WAN) menurut penamaan interface di router pelanggan ("ether1-FO", "ether2-M2M", "lte1", "pppoe-out1")
const PORT_WAN = /(^|[-_ ])(FO|M2M|WAN|ISP|LTE|INDIHOME|ASTINET|BIZNET|ICON|STARLINK|BACKUP|MODEM|UPLINK)([-_ 0-9]|$)|^lte\d|^pppoe-out/i;
type WanStatus = Record<string, { running: boolean; pernah_hidup: boolean; sejak: string | null }>;

export const KESIMPULAN: Record<StatusRouter | 'macet' | 'tidak_ada', { label: string; saran: string }> = {
  online: { label: 'Online', saran: 'Kedua jalur VPN tersambung — kemungkinan bukan putus koneksi (alarm PRTG palsu / sensor lain).' },
  partial: { label: '1 tunnel putus', saran: 'Salah satu jalur VPN (NS/UN) putus, lokasi masih tersambung lewat jalur lain — cek ISP jalur yang putus.' },
  internet_ok: { label: 'Internet hidup, VPN putus', saran: 'Internet di lokasi hidup, hanya VPN ke NEXT1 yang putus — tangani remote (tunnel/akun VPN), belum perlu visit.' },
  macet: { label: 'VPN macet', saran: 'Sesi VPN tercatat tersambung, tapi tidak satu pun jalur bisa di-ping dari ERP — data tidak lewat, cek router / ISP lokasi.' },
  offline: { label: 'Mati total', saran: 'Router tidak terlihat sama sekali (listrik / perangkat / internet lokasi) — konfirmasi PIC, kandidat visit.' },
  tidak_ada: { label: 'Tidak terpetakan', saran: 'Site ini belum terhubung ke router NOCaaS — petakan di halaman Pembanding NOCaaS.' },
};

// Kategori gangguan lain + ambang bawaan (bisa diubah di /nocaas → Atur).
// Kondisi SELALU dicatat (untuk laporan); 'aktif' = dibuatkan tiket atau tidak.
// Tunnel/VPN putus (jalur, sering putus) bawaannya tidak ditiketkan — yang dipantau koneksi toko, bukan tunnel.
export const KATEGORI_BAWAAN = {
  vpn_macet: { aktif: false },                // sesi VPN ada tapi tidak satu pun jalur bisa di-ping dari ERP ≥ konfirmasi
  jalur: { aktif: false, menit: 60 },         // 1 jalur VPN (NS/UN) putus ≥ menit
  port_wan_down: { aktif: true },             // port uplink (FO/M2M/…) yang tadinya hidup jadi mati
  port_wan_flap: { aktif: true, min: 3 },     // port WAN naik-turun ≥ min kali / jam
  port_lan_flap: { aktif: false, min: 20 },   // port LAN naik-turun ≥ min kali / jam (sering = perangkat toko)
  sering_putus: { aktif: false, min: 4 },     // VPN putus-sambung ≥ min kali / jam
  pulih_menit: 60,                            // naik-turun / sering putus dianggap pulih setelah tenang sekian menit
};
export const LABEL_KATEGORI: Record<string, { label: string; prioritas: string; arti: string }> = {
  vpn_macet: { label: 'VPN macet', prioritas: 'High', arti: 'Sesi VPN tercatat tersambung, tapi tidak satu pun jalur bisa di-ping dari ERP — data VPN tidak lewat.' },
  jalur: { label: '1 jalur putus', prioritas: 'Medium', arti: 'Salah satu jalur VPN putus lama; lokasi masih tersambung lewat jalur lain — cek ISP jalur yang putus.' },
  port_wan_down: { label: 'Port WAN down', prioritas: 'High', arti: 'Port uplink router yang sebelumnya aktif kini mati (kabel / modem / ISP); lokasi mungkin jalan lewat backup.' },
  port_wan_flap: { label: 'Port WAN naik-turun', prioritas: 'High', arti: 'Port uplink router naik-turun berulang — kabel, modem, atau ISP tidak stabil.' },
  port_lan_flap: { label: 'Port LAN naik-turun', prioritas: 'Low', arti: 'Port LAN router naik-turun berulang — kabel / perangkat di toko.' },
  sering_putus: { label: 'Sering putus', prioritas: 'High', arti: 'Koneksi VPN putus-sambung berulang dalam 1 jam — kualitas ISP / jaringan lokasi buruk.' },
};

interface Paired {
  site_key: string; primary_name?: string; brand?: string; public_ip?: string; access_isp?: string;
  // Perangkat non-Mikrotik (RCMS / Ruijie): jenis, nama asli perangkat, model
  jenis?: string; nama?: string; model?: string;
  live_config?: { interfaces?: { name: string; running?: boolean; disabled?: boolean; rx_byte?: number }[]; [k: string]: any } | null; live_config_at?: string | null;
  offline_since?: string | null; downs7?: number; flaps24?: number; any_online?: boolean;
  ns?: { name?: string; tunnel_ip?: string; is_online?: boolean; net_status?: string; hb_at?: string | null; isp?: string; caller_id?: string } | null;
  un?: { name?: string; tunnel_ip?: string; is_online?: boolean; net_status?: string; hb_at?: string | null; isp?: string; caller_id?: string } | null;
}

/** Ringkas live_config NOCaaS → hanya yang dipakai panel site (data besar spt rx/tx byte & route dibuang) */
export function ringkasLive(lc: any) {
  if (!lc) return null;
  const rb = lc.routerboard ?? {}, rs = lc.resource ?? {};
  const leases = (lc.dhcp_leases ?? []) as any[];
  return {
    identity: lc.identity ?? null,
    model: rb.model || rs.board_name || null, board: rs.board_name ?? null, serial: rb.serial ?? null,
    firmware: rb.firmware ?? null, ros: rs.version ?? null, arsitektur: rs.architecture ?? null,
    uptime: rs.uptime ?? null, cpu: rs.cpu_load ?? null,
    mem: rs.total_memory ? { bebas: rs.free_memory, total: rs.total_memory } : null,
    hdd: rs.total_hdd ? { bebas: rs.free_hdd, total: rs.total_hdd } : null,
    interfaces: ((lc.interfaces ?? []) as any[]).slice(0, 24).map((i) => ({
      name: i.name, type: i.type, mac: i.mac, running: !!i.running, disabled: !!i.disabled, speed: i.speed || null, comment: i.comment || null,
    })),
    ip: ((lc.ip_addresses ?? []) as any[]).filter((a) => !a.disabled).map((a) => ({ address: a.address, interface: a.interface, dynamic: !!a.dynamic })).slice(0, 12),
    dhcp_server: ((lc.dhcp_servers ?? []) as any[]).filter((d) => !d.disabled).map((d) => ({ name: d.name, interface: d.interface })),
    dhcp_aktif: leases.filter((l) => l.status === 'bound').length,
    dhcp_klien: leases.filter((l) => l.status === 'bound').slice(0, 30).map((l) => ({ ip: l.address, mac: l.mac, host: l.hostname || null })),
    dns: lc.dns?.servers ?? null,
    l2tp: ((lc.l2tp_clients ?? []) as any[]).map((c) => ({ name: c.name, user: c.user, connect_to: c.connect_to, running: !!c.running, disabled: !!c.disabled })),
  };
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
  // Hasil pencocokan nama & saran disimpan 10 menit — perhitungannya berat (ribuan router × ribuan site)
  private cacheNama: { exp: number; map: Map<string, number | null> } | null = null;
  private saranCache: { exp: number; hasil: Map<string, number> } | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private prtg: PrtgClient,
    private notif: NotificationsService,
    private wa: StarsenderService,
    private waHelpdesk: WaService,
    private klien: NocaasClient,
  ) {}

  private get base() {
    return this.klien.base;
  }

  private ambil<T = any>(path: string, timeout = 30_000): Promise<T> {
    return this.klien.ambil<T>(path, timeout);
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
    await this.ukur('sinkron', () => this.sinkron().catch(() => {}));
    await this.ukur('sapuPing', () => this.sapuPing().catch((e) => this.logger.warn(`Sapuan ping gagal: ${e?.message}`)));
    await this.ukur('prosesTiket', () => this.prosesTiket().catch((e) => this.logger.warn(`Tiket NOCaaS gagal: ${e?.message}`)));
    await this.ukur('prosesKategori', () => this.prosesKategori().catch((e) => this.logger.warn(`Gangguan kategori gagal: ${e?.message}`)));
  }

  /** Catat tahap yang lambat (> 2 dtk) — untuk memantau beban cron terhadap respons aplikasi */
  private async ukur<T>(nama: string, f: () => Promise<T>) {
    const t = Date.now();
    try { return await f(); } finally {
      const ms = Date.now() - t;
      if (ms > 2000) this.logger.warn(`Tahap ${nama} lambat: ${ms} ms`);
    }
  }
  private tandai: Record<string, number> = {};

  async sinkron() {
    if (this.sedang) return { data: this.terakhir, message: 'Sinkronisasi sedang berjalan' };
    this.sedang = true;
    try {
      const t0 = Date.now();
      const { items: mikrotik } = await this.ambil<{ items: Paired[] }>('/api/devices/paired?limit=10000', 60_000);
      this.tandai = { ambil: Date.now() - t0 };
      if (!Array.isArray(mikrotik) || !mikrotik.length) throw new Error('Data NOCaaS kosong');
      // Perangkat lain di NOCaaS (opsional — gagal tidak menghentikan sinkron Mikrotik)
      const lain = await this.perangkatLain();
      const items = [...mikrotik.map((x) => ({ ...x, jenis: 'mikrotik' })), ...lain.items];
      const jenisOk = new Set(['mikrotik', ...lain.jenisOk]);

      const [lama, ipSite, prtgIp] = await Promise.all([
        this.prisma.nocaasRouter.findMany(),
        this.petaIpPerangkat(),
        this.petaHostPrtg(),
      ]);
      const byKey = new Map(lama.map((r) => [r.site_key, r]));
      const cfgTiket = await this.konfigurasi();
      const now = new Date();
      const tulis: any[] = [];
      if (!this.cacheNama || this.cacheNama.exp < Date.now()) this.cacheNama = { exp: Date.now() + 10 * 60_000, map: new Map() };
      const cacheNama = this.cacheNama.map;

      // 1) Pemetaan pasti: manual / abaikan tidak pernah ditimpa; lainnya IP tunnel → host PRTG → nama persis
      const rencana: { x: Paired; status: StatusRouter; ns_ip: string | null; un_ip: string | null; id_site: number | null; sumber_map: string | null; konflik: number | null }[] = [];
      const infoSite = new Map((await this.siteAktif()).map((s) => [s.id_site, `${s.nama_site} ${s.kota ?? ''}`]));
      let n = 0;
      // IP tunnel yang dipakai >1 router di NOCaaS (akun VPN dipakai ulang) ambigu → tidak dipakai untuk memetakan.
      // Contoh nyata: UN 192.168.70.185 dipakai ACE-PLAZA-PONDOK-GEDE (aktif) & ACE-HARDWARE-CIBINONG (lama).
      const jmlIp = new Map<string, number>();
      for (const x of items) for (const ip of [x.ns?.tunnel_ip, x.un?.tunnel_ip]) if (ip) jmlIp.set(ip, (jmlIp.get(ip) ?? 0) + 1);
      const ipUnik = (ip: string | null) => (ip && jmlIp.get(ip) === 1 ? ip : null);
      for (const x of items) {
        if (!x.site_key) continue;
        if (++n % 100 === 0) await jeda();
        const status = NocaasService.hitungStatus(x);
        const ns_ip = x.ns?.tunnel_ip || null, un_ip = x.un?.tunnel_ip || null;
        const r = byKey.get(x.site_key);
        let id_site: number | null = r?.id_site ?? null, sumber_map: string | null = r?.sumber_map ?? null;
        if (sumber_map !== 'manual' && sumber_map !== 'abaikan') {
          id_site = null; sumber_map = null;
          const nsU = ipUnik(ns_ip), unU = ipUnik(un_ip);
          const viaIp = (nsU && ipSite.get(nsU)) || (unU && ipSite.get(unU));
          if (viaIp) { id_site = viaIp; sumber_map = 'ip_perangkat'; }
          if (!id_site) {
            const dev = (nsU && prtgIp.get(nsU)) || (unU && prtgIp.get(unU));
            if (dev) {
              const s = await this.siteDariDevicePrtg(dev, cacheNama);
              if (s) { id_site = s; sumber_map = 'prtg_host'; }
            }
          }
          if (!id_site) {
            const s = await this.siteDariNama((x.nama ?? x.site_key).replace(/[-_]+/g, ' ').trim(), cacheNama);
            if (s) { id_site = s; sumber_map = 'nama'; }
          }
        }
        // Pasangan lewat IP / host PRTG yang namanya sama sekali tidak nyambung = data IP ERP basi → konflik, tinjau manual
        let konflik: number | null = null;
        if (id_site && (sumber_map === 'ip_perangkat' || sumber_map === 'prtg_host') && infoSite.has(id_site) && !namaNyambung(x.nama ?? x.site_key, infoSite.get(id_site)!)) {
          konflik = id_site; id_site = null; sumber_map = 'konflik_ip';
        }
        rencana.push({ x, status, ns_ip, un_ip, id_site, sumber_map, konflik });
      }
      // Perangkat lain yang namanya sama dengan router Mikrotik terpetakan = toko yang sama
      const siteMikrotik = new Map(rencana.filter((p) => p.x.jenis === 'mikrotik' && p.id_site && p.sumber_map !== 'abaikan').map((p) => [normal(p.x.site_key), p.id_site!]));
      for (const p of rencana) {
        if (p.x.jenis === 'mikrotik' || p.sumber_map === 'manual' || p.sumber_map === 'abaikan') continue;
        const id = siteMikrotik.get(normal(p.x.nama ?? ''));
        if (id) { p.id_site = id; p.sumber_map = 'nama_mikrotik'; }
      }

      // Satu site memegang beberapa router lewat IP/host PRTG = data IP ERP basi (IP tunnel dipakai ulang toko lain).
      // Pertahankan router yang namanya paling mirip site; sisanya dilepas → dicoba lewat saran nama di bawah.
      const tok = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
      const skor = (router: string, site: string) => {
        const a = tok(router.replace(/^(NS|UN)-/i, '')), b = new Set(tok(site));
        return a.filter((w) => b.has(w)).length + (a[0] && a[0] === tok(site)[0] ? 1 : 0);
      };
      const perSite = new Map<number, typeof rencana>();
      for (const p of rencana) if (p.id_site && (p.sumber_map === 'ip_perangkat' || p.sumber_map === 'prtg_host')) {
        perSite.set(p.id_site, [...(perSite.get(p.id_site) ?? []), p]);
      }
      for (const [id_site, ps] of perSite) {
        if (ps.length < 2 || !infoSite.has(id_site)) continue;
        const nilai = ps.map((p) => skor(p.x.nama ?? p.x.site_key, infoSite.get(id_site)!))
        const maks = Math.max(...nilai);
        ps.forEach((p, i) => { if (nilai[i]! < maks) { p.id_site = null; p.sumber_map = null; } });
      }

      this.tandai.pass1 = Date.now() - t0;
      // 2) Saran yakin (brand + lokasi) untuk yang masih kosong — hanya ke site yang belum punya router,
      //    dan satu site tidak boleh diklaim dua router (keduanya batal, masuk antrean tinjau)
      const terpakai = new Set(rencana.filter((p) => p.id_site).map((p) => p.id_site!));
      if (!this.saranCache || this.saranCache.exp < Date.now()) {
        const pencocok = await this.buatPencocok(rencana.filter((p) => p.id_site && ['ip_perangkat', 'prtg_host', 'manual'].includes(p.sumber_map ?? '')).map((p) => ({ site_key: p.x.nama ?? p.x.site_key, id_site: p.id_site! })), terpakai);
        const klaim = new Map<number, string[]>();
        let i = 0;
        for (const p of rencana) {
          if (p.id_site || (p.sumber_map && p.sumber_map !== 'konflik_ip')) continue;
          if (++i % 25 === 0) await jeda();
          const { saran, yakin } = pencocok.cari(p.x.nama ?? p.x.site_key);
          if (yakin) klaim.set(saran[0].id_site, [...(klaim.get(saran[0].id_site) ?? []), p.x.site_key]);
        }
        const hasil = new Map<string, number>();
        for (const [id_site, keys] of klaim) if (keys.length === 1) hasil.set(keys[0], id_site);
        this.saranCache = { exp: Date.now() + 10 * 60_000, hasil };
      }
      for (const p of rencana) {
        if (p.id_site || (p.sumber_map && p.sumber_map !== 'konflik_ip')) continue;
        const id = this.saranCache.hasil.get(p.x.site_key);
        if (id && !terpakai.has(id)) { p.id_site = id; p.sumber_map = 'saran'; terpakai.add(id); }
      }

      for (const { x, status, ns_ip, un_ip, id_site, sumber_map, konflik } of rencana) {
        const r = byKey.get(x.site_key);
        // Status port WAN dari snapshot config router — hanya diperbarui bila snapshot baru
        let wan: { wan_status: any; live_at: Date } | null = null;
        if (x.live_config_at && x.live_config?.interfaces && (!r?.live_at || r.live_at.getTime() !== new Date(x.live_config_at).getTime())) {
          const lama = (r?.wan_status ?? {}) as WanStatus, baru: WanStatus = {};
          const at = new Date(x.live_config_at);
          for (const i of x.live_config.interfaces) {
            if (!i?.name || !PORT_WAN.test(i.name) || i.disabled) continue;
            const run = !!i.running, l = lama[i.name];
            // sejak = waktu perubahan yang TERAMATI ERP (snapshot pertama tidak punya 'sejak' → bukan gangguan baru)
            baru[i.name] = { running: run, pernah_hidup: !!(l?.pernah_hidup || run || (i.rx_byte ?? 0) > 0), sejak: l ? (l.running !== run ? at.toISOString() : l.sejak) : null };
          }
          wan = { wan_status: baru, live_at: at };
        }
        // Ringkasan config — diisi saat snapshot baru atau bila belum pernah tersimpan
        const live_ringkas = x.live_config && (wan || !r?.live_ringkas) ? ringkasLive(x.live_config) : undefined;
        const vpnBaru = x.jenis === 'mikrotik' ? {
          ns: x.ns ? { name: x.ns.name ?? null, isp: x.ns.isp ?? null, caller_id: x.ns.caller_id ?? null } : null,
          un: x.un ? { name: x.un.name ?? null, isp: x.un.isp ?? null, caller_id: x.un.caller_id ?? null } : null,
        } : null;
        const vpnBerubah = JSON.stringify(vpnBaru) !== JSON.stringify(r?.vpn_ringkas ?? null);
        const ekstra: any = { ...(live_ringkas !== undefined ? { live_ringkas } : {}), ...(vpnBerubah ? { vpn_ringkas: vpnBaru } : {}) };
        const data = {
          jenis: x.jenis ?? 'mikrotik', model: x.model?.slice(0, 40) ?? null, konflik_id_site: konflik,
          nama_utama: x.jenis === 'mikrotik' ? x.primary_name || x.ns?.name || x.un?.name || null : null,
          id_site, sumber_map, status, ns_ip, un_ip,
          ns_online: x.ns ? !!x.ns.is_online : null, un_online: x.un ? !!x.un.is_online : null,
          offline_since: x.offline_since ? new Date(x.offline_since) : null,
          hb_at: this.hbTerbaru(x),
          public_ip: x.public_ip || null, access_isp: x.access_isp?.slice(0, 100) || null, brand: x.brand?.slice(0, 20) || null,
          downs7: x.downs7 ?? 0, flaps24: x.flaps24 ?? 0,
        };
        if (!r) {
          if (wan) Object.assign(data, wan);
          Object.assign(data, ekstra);
          // Baru pertama tercatat dalam keadaan mati = kondisi lama (sebelum fitur tiket aktif), bukan gangguan baru
          const sejakMati = data.offline_since ?? new Date(Math.min(now.getTime(), cfgTiket.aktif_sejak.getTime()) - 1000);
          tulis.push(this.prisma.nocaasRouter.create({ data: { site_key: x.site_key, ...data, status_sejak: status === 'offline' ? sejakMati : now } }));
          continue;
        }
        const berubah = (Object.keys(data) as (keyof typeof data)[]).some((k) => {
          const a: any = data[k], b: any = (r as any)[k];
          if (k === 'hb_at') return Math.abs((a?.getTime?.() ?? 0) - (b?.getTime?.() ?? 0)) > 5 * 60_000;
          return a instanceof Date || b instanceof Date ? (a?.getTime?.() ?? null) !== (b?.getTime?.() ?? null) : (a ?? null) !== (b ?? null);
        });
        if (berubah || wan || Object.keys(ekstra).length) tulis.push(this.prisma.nocaasRouter.update({ where: { site_key: x.site_key }, data: { ...data, ...(wan ?? {}), ...ekstra, ...(r.status !== status ? { status_sejak: now } : {}) } }));
      }
      // Perangkat yang sudah dihapus dari NOCaaS — hanya untuk jenis yang datanya berhasil diambil lengkap
      const ada = new Set(items.map((x) => x.site_key));
      const hilang = lama.filter((r) => jenisOk.has(r.jenis) && !ada.has(r.site_key)).map((r) => r.site_key);
      if (hilang.length && mikrotik.length > 1000) tulis.push(this.prisma.nocaasRouter.deleteMany({ where: { site_key: { in: hilang } } }));

      this.tandai.pass2 = Date.now() - t0;
      for (let i = 0; i < tulis.length; i += 200) await this.prisma.$transaction(tulis.slice(i, i + 200));
      this.tandai.tulis = Date.now() - t0;
      if (this.tandai.tulis > 2000) this.logger.warn(`Rincian sinkron (kumulatif ms): ${JSON.stringify(this.tandai)}`);
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

  /** Perangkat RCMS (Robustel) & Ruijie dari NOCaaS — status online/offline saja (tanpa tunnel / heartbeat) */
  private async perangkatLain(): Promise<{ items: Paired[]; jenisOk: string[] }> {
    const semua = async (path: string) => {
      const out: any[] = [];
      for (let page = 1; page <= 50; page++) {
        const d = await this.ambil<{ items: any[]; pages?: number }>(`${path}${path.includes('?') ? '&' : '?'}limit=200&page=${page}`, 30_000);
        out.push(...(d.items ?? []));
        if (!d.items?.length || page >= (d.pages ?? 1)) break;
      }
      return out;
    };
    const items: Paired[] = [], jenisOk: string[] = [];
    const unik = (prefix: string, nama: string, sn: string, dipakai: Set<string>) => {
      const k = `${prefix}:${nama}`.slice(0, 150);
      if (!dipakai.has(k)) { dipakai.add(k); return k; }
      const k2 = `${prefix}:${nama}#${sn}`.slice(0, 150); dipakai.add(k2); return k2;
    };
    try {
      const dipakai = new Set<string>();
      for (const d of await semua('/api/rcms/devices')) {
        if (!d.sn || !d.deviceName) continue;
        items.push({ site_key: unik('RCMS', d.deviceName, d.sn, dipakai), jenis: 'rcms', nama: d.deviceName, model: d.deviceModel, brand: 'RCMS', any_online: d.onlineStatus === 1, offline_since: null, access_isp: d.activeLink && d.activeLink !== 'off' ? d.activeLink : null });
      }
      jenisOk.push('rcms');
    } catch (e: any) { this.logger.warn(`RCMS gagal: ${e?.message}`); }
    try {
      const dipakai = new Set<string>();
      for (const d of await semua('/api/ruijie/devices')) {
        // Hanya router/gateway pelanggan; AP & switch internal dan perangkat stok (TEMP) dilewati
        if (!d.serialNumber || !['WR', 'GATEWAY'].includes(d.commonType) || d.groupName === 'TEMP') continue;
        const nama = d.aliasName || d.name;
        const on = d.onlineStatus === 'ON';
        items.push({ site_key: unik('RUIJIE', nama, d.serialNumber, dipakai), jenis: 'ruijie', nama, model: d.productClass, brand: 'RUIJIE', any_online: on, public_ip: d.cpeIp || undefined, offline_since: !on && d.lastOnline ? new Date(d.lastOnline).toISOString() : null });
      }
      jenisOk.push('ruijie');
    } catch (e: any) { this.logger.warn(`Ruijie gagal: ${e?.message}`); }
    return { items, jenisOk };
  }

  private hbTerbaru(x: Paired) {
    const t = [x.ns?.hb_at, x.un?.hb_at].filter(Boolean).map((v) => new Date(v!).getTime());
    return t.length ? new Date(Math.max(...t)) : null;
  }

  /** Site aktif (cache 10 menit) — kandidat saran pemetaan */
  private siteCache: { exp: number; rows: SiteCalon[] } | null = null;
  private async siteAktif() {
    if (!this.siteCache || this.siteCache.exp < Date.now()) {
      const rows = await this.prisma.sitePelanggan.findMany({ where: { status_site: 'Aktif' }, select: { id_site: true, id_pelanggan: true, nama_site: true, kode_site: true, kota: true } });
      this.siteCache = { exp: Date.now() + 10 * 60_000, rows };
    }
    return this.siteCache.rows;
  }

  /** @param pasti pasangan router↔site yang pasti (untuk belajar brand) · @param terpakai site yang sudah punya router */
  private async buatPencocok(pasti: { site_key: string; id_site: number }[], terpakai: Set<number>) {
    const site = await this.siteAktif();
    const pel = new Map(site.map((s) => [s.id_site, s.id_pelanggan]));
    return new PencocokSaran(
      pasti.filter((p) => pel.has(p.id_site)).map((p) => ({ site_key: p.site_key, id_site: p.id_site, id_pelanggan: pel.get(p.id_site)! })),
      site.filter((s) => !terpakai.has(s.id_site)),
      site,
    );
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
  /** Status untuk ditampilkan: mati total > VPN macet (sesi ada tapi ping gagal) > status sesi NOCaaS */
  private statusTampil(r: { status: string; macet_sejak?: Date | null }) {
    return r.status !== 'offline' && r.macet_sejak ? 'macet' : r.status;
  }

  private bentuk(r: any) {
    const status = this.statusTampil(r);
    const k = KESIMPULAN[status as keyof typeof KESIMPULAN] ?? KESIMPULAN.offline;
    return { ...r, status, status_sesi: r.status, label: k.label, saran: k.saran };
  }

  /** Status terburuk per site (untuk badge di daftar tiket) */
  async statusSite(ids: number[]) {
    const id = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))].slice(0, 500);
    if (!id.length) return { data: {} };
    const rows = await this.prisma.nocaasRouter.findMany({ where: { id_site: { in: id } }, select: { id_site: true, status: true, status_sejak: true, macet_sejak: true } });
    const out: Record<number, { status: string; label: string; sejak: Date }> = {};
    for (const r of rows) {
      const st = this.statusTampil(r);
      const cur = out[r.id_site!];
      if (!cur || BOBOT[st] > BOBOT[cur.status]) out[r.id_site!] = { status: st, label: KESIMPULAN[st as keyof typeof KESIMPULAN]?.label ?? st, sejak: st === 'macet' ? r.macet_sejak! : r.status_sejak };
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

  /**
   * Ping IP tunnel langsung dari server ERP. Status NOCaaS "online" hanya berarti sesi VPN terdaftar di
   * Mikrotik pusat — belum tentu data lewat. Ping memastikan jalurnya benar-benar bisa dilewati.
   */
  private ping(ip: string): Promise<{ ip: string; terkirim: number; diterima: number; rtt_ms: number | null }> {
    if (!IP_SAJA.test(ip)) return Promise.resolve({ ip, terkirim: 0, diterima: 0, rtt_ms: null });
    return new Promise((resolve) => {
      execFile('ping', ['-n', '-q', '-c', '4', '-i', '0.3', '-W', '1', ip], { timeout: 8000 }, (_e, out) => {
        const m = /(\d+) packets transmitted, (\d+) (?:packets )?received/.exec(out || '');
        const rtt = /= [\d.]+\/([\d.]+)\//.exec(out || '');
        resolve({ ip, terkirim: m ? +m[1] : 4, diterima: m ? +m[2] : 0, rtt_ms: rtt ? Math.round(+rtt[1]) : null });
      });
    });
  }

  async pingRouter(site_key: string) {
    const r = await this.prisma.nocaasRouter.findUnique({ where: { site_key }, select: { ns_ip: true, un_ip: true, ns_online: true, un_online: true } });
    if (!r) throw new NotFoundException('Router tidak ditemukan');
    const [ns, un] = await Promise.all([r.ns_ip ? this.ping(r.ns_ip) : null, r.un_ip ? this.ping(r.un_ip) : null]);
    return { ns, un };
  }

  /** Pembanding untuk satu tiket — status NOCaaS dilengkapi ping tunnel dari ERP */
  async pembandingTiket(id_ticket: number) {
    const t = await this.prisma.operationTicket.findUnique({
      where: { id_ticket },
      select: { id_site: true, status_tiket: true, prtg_webhooks: { select: { prtg_device_name: true }, take: 1 } },
    });
    if (!t) throw new NotFoundException('Tiket tidak ditemukan');
    const routers: any[] = await this.routerUntukTiket(t);
    await Promise.all(routers.slice(0, 3).map(async (r) => { r.ping = await this.pingRouter(r.site_key); }));
    const utama = routers[0];
    let kesimpulan: { status: string; label: string; saran: string } = utama
      ? { status: utama.status, label: utama.label, saran: utama.saran }
      : { status: 'tidak_ada', ...KESIMPULAN.tidak_ada };
    if (utama?.ping && utama.status !== 'offline') {
      // Sesi VPN "tersambung" tapi ping gagal = jalur tidak bisa dilewati
      const jalur = [['NS', utama.ns_online, utama.ping.ns], ['UN', utama.un_online, utama.ping.un]] as const;
      const macet = jalur.filter(([, on, p]) => on && p && p.diterima === 0).map(([n]) => n);
      const lancar = jalur.filter(([, , p]) => p && p.diterima > 0).map(([n]) => n);
      if (macet.length && lancar.length)
        kesimpulan = { status: 'partial', label: `Jalur ${macet.join(' & ')} macet`, saran: `Sesi VPN ${macet.join(' & ')} tersambung tapi tidak bisa di-ping dari ERP — lokasi masih jalan lewat ${lancar.join(' & ')}. Cek ISP / tunnel jalur ${macet.join(' & ')} (bukan alarm palsu).` };
      else if (macet.length && !lancar.length)
        kesimpulan = { status: 'offline', label: 'VPN tidak bisa dilewati', saran: 'Sesi VPN tercatat tersambung, tapi tidak ada jalur yang bisa di-ping dari ERP — perlakukan sebagai gangguan, cek router/ISP lokasi.' };
    }
    return { data: { routers, kesimpulan, sinkron: this.terakhir, tiket_aktif: STATUS_TIKET_AKTIF.includes(t.status_tiket) } };
  }

  // ── Sapuan ping (fping) ────────────────────────────────────────────────────
  // Tiap menit semua tunnel yang sesinya tersambung (router terpetakan, tidak mati total) di-ping dari ERP.
  // Semua tunnel bersesi tidak menjawab → macet_sejak. Router yang sudah macet saat pertama dicek = macet_lama
  // (kondisi lama / ICMP diblok) → tidak ditiketkan. Lebih dari 30% macet sekaligus = jalur ERP→VPN yang
  // bermasalah → hasil sapuan diabaikan.
  private pingJalan = false;
  pingTerakhir: { at: Date; ok: boolean; pesan: string } | null = null;

  private fping(ips: string[]): Promise<Map<string, boolean> | null> {
    return new Promise((resolve) => {
      let out = '';
      const p = spawn('fping', ['-q', '-C', '2', '-t', '800', '-r', '0', '-i', '2', '-p', '300']);
      const t = setTimeout(() => { p.kill(); resolve(null); }, 50_000);
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d)); // fping -C menulis ringkasan ke stderr
      p.on('error', () => { clearTimeout(t); resolve(null); });
      p.on('close', () => {
        clearTimeout(t);
        const m = new Map<string, boolean>();
        for (const l of out.split('\n')) {
          const [ip, hasil] = l.split(' : ');
          if (ip && hasil !== undefined && IP_SAJA.test(ip.trim())) m.set(ip.trim(), hasil.trim().split(/\s+/).some((x) => x !== '-'));
        }
        resolve(m.size ? m : null);
      });
      p.stdin.end(ips.join('\n') + '\n');
    });
  }

  async sapuPing() {
    if (this.pingJalan) return;
    this.pingJalan = true;
    try {
      const rs = await this.prisma.nocaasRouter.findMany({
        where: { id_site: { not: null }, status: { not: 'offline' } },
        select: { site_key: true, ns_ip: true, un_ip: true, ns_online: true, un_online: true, ns_ping_ok: true, un_ping_ok: true, macet_sejak: true, macet_lama: true },
      });
      const target = new Set<string>();
      for (const r of rs) { if (r.ns_online && r.ns_ip) target.add(r.ns_ip); if (r.un_online && r.un_ip) target.add(r.un_ip); }
      if (!target.size) return;
      const hasil = await this.fping([...target]);
      const now = new Date();
      if (!hasil) { this.pingTerakhir = { at: now, ok: false, pesan: 'fping gagal' }; return; }

      const rencana = rs.map((r) => {
        const ns = r.ns_online && r.ns_ip ? hasil.get(r.ns_ip) ?? false : null;
        const un = r.un_online && r.un_ip ? hasil.get(r.un_ip) ?? false : null;
        const dicek = ns !== null || un !== null;
        return { r, ns, un, macet: dicek && !ns && !un, pertama: r.ns_ping_ok === null && r.un_ping_ok === null };
      });
      const nMacet = rencana.filter((x) => x.macet).length;
      if (nMacet > rs.length * 0.3) {
        this.pingTerakhir = { at: now, ok: false, pesan: `${nMacet} dari ${rs.length} router tidak menjawab — jalur ERP→VPN dicurigai bermasalah, hasil diabaikan` };
        this.logger.warn(this.pingTerakhir.pesan);
        return;
      }
      const tulis: any[] = [];
      for (const { r, ns, un, macet, pertama } of rencana) {
        const data: any = {};
        if (ns !== r.ns_ping_ok) data.ns_ping_ok = ns;
        if (un !== r.un_ping_ok) data.un_ping_ok = un;
        if (macet && !r.macet_sejak) { data.macet_sejak = now; data.macet_lama = pertama; }
        if (!macet && r.macet_sejak) { data.macet_sejak = null; data.macet_lama = false; }
        if (Object.keys(data).length) tulis.push(this.prisma.nocaasRouter.update({ where: { site_key: r.site_key }, data }));
      }
      // Router yang kini mati total / tidak terpetakan tidak lagi dihitung macet
      tulis.push(this.prisma.nocaasRouter.updateMany({ where: { macet_sejak: { not: null }, OR: [{ status: 'offline' }, { id_site: null }] }, data: { macet_sejak: null, macet_lama: false } }));
      for (let i = 0; i < tulis.length; i += 200) await this.prisma.$transaction(tulis.slice(i, i + 200));
      this.pingTerakhir = { at: now, ok: true, pesan: `${target.size} tunnel di-ping, ${nMacet} router macet` };
    } finally {
      this.pingJalan = false;
    }
  }

  // ── Kategori gangguan lain ─────────────────────────────────────────────────
  // Selain mati total / VPN macet: 1 jalur VPN putus lama, port WAN down, port naik-turun, koneksi sering putus.
  // Tiap kondisi dicatat di nocaas_gangguan (mulai → selesai) lalu dibuatkan tiket [NOCaaS] per site + kategori.
  async kategoriKonfigurasi() {
    const cfg = await this.konfigurasi();
    const k = (cfg.kategori ?? {}) as Partial<typeof KATEGORI_BAWAAN>;
    const out: any = {};
    for (const [nama, bawaan] of Object.entries(KATEGORI_BAWAAN)) out[nama] = typeof bawaan === 'object' ? { ...bawaan, ...((k as any)[nama] ?? {}) } : (k as any)[nama] ?? bawaan;
    return { cfg, kat: out as typeof KATEGORI_BAWAAN };
  }

  async prosesKategori() {
    const { cfg, kat } = await this.kategoriKonfigurasi();
    if (!cfg.tiket_aktif) return;
    if (!this.terakhir?.ok || Date.now() - this.terakhir.at.getTime() > 3 * 60_000) return;
    const now = new Date();

    // 1) Kondisi saat ini
    type Kondisi = { site_key: string; id_site: number; kategori: string; detail: string; nilai: number | null; mulai: Date };
    const kini: Kondisi[] = [];
    const routers = await this.prisma.nocaasRouter.findMany({
      where: { id_site: { not: null }, jenis: 'mikrotik', site: { status_site: 'Aktif' } },
      select: { site_key: true, id_site: true, status: true, status_sejak: true, ns_online: true, un_online: true, ns_ip: true, un_ip: true, wan_status: true, macet_sejak: true },
    });
    const peta = new Map(routers.map((r) => [r.site_key, r]));
    // VPN macet: macet baru (bukan kondisi lama), bertahan ≥ durasi konfirmasi
    const batasMacet = now.getTime() - cfg.durasi_konfirmasi_menit * 60_000;
    for (const r of await this.prisma.nocaasRouter.findMany({ where: { id_site: { not: null }, status: { not: 'offline' }, macet_lama: false, macet_sejak: { gte: cfg.aktif_sejak } }, select: { site_key: true, id_site: true, macet_sejak: true } })) {
      if (r.macet_sejak!.getTime() <= batasMacet) kini.push({ site_key: r.site_key, id_site: r.id_site!, kategori: 'vpn_macet', detail: '', nilai: null, mulai: r.macet_sejak! });
    }
    {
      for (const r of routers) {
        if (r.status !== 'partial' || r.status_sejak < cfg.aktif_sejak || now.getTime() - r.status_sejak.getTime() < kat.jalur.menit * 60_000) continue;
        const putus = [r.ns_ip && !r.ns_online ? 'NS' : null, r.un_ip && !r.un_online ? 'UN' : null].filter(Boolean).join(' & ');
        kini.push({ site_key: r.site_key, id_site: r.id_site!, kategori: 'jalur', detail: putus || 'VPN', nilai: null, mulai: r.status_sejak });
      }
    }
    {
      for (const r of routers) {
        if (r.status === 'offline' || r.macet_sejak) continue; // router mati: snapshot basi, sudah ditangani kategori mati
        for (const [iface, w] of Object.entries((r.wan_status ?? {}) as WanStatus)) {
          if (w.running || !w.pernah_hidup || !w.sejak || new Date(w.sejak) < cfg.aktif_sejak) continue;
          kini.push({ site_key: r.site_key, id_site: r.id_site!, kategori: 'port_wan_down', detail: iface, nilai: null, mulai: new Date(w.sejak) });
        }
      }
    }
    const minPort = Math.min(kat.port_wan_flap.min, kat.port_lan_flap.min);
    if (minPort < 999) {
      const d = await this.ambil<{ items: { site_key: string; iface: string; downs: number; is_wan: boolean }[] }>(`/api/heartbeat/port-flaps?hours=1&min_downs=${Math.max(2, minPort)}&limit=200`, 30_000);
      for (const f of d.items ?? []) {
        const r = peta.get(f.site_key);
        if (!r) continue;
        const k = f.is_wan ? 'port_wan_flap' : 'port_lan_flap';
        const c = kat[k];
        if (f.downs < c.min) continue;
        kini.push({ site_key: f.site_key, id_site: r.id_site!, kategori: k, detail: f.iface, nilai: f.downs, mulai: now });
      }
    }
    {
      const d = await this.ambil<{ items: { site_key: string; downs: number }[] }>(`/api/heartbeat/flapping?hours=1&min_downs=${Math.max(2, kat.sering_putus.min)}`, 30_000);
      for (const f of d.items ?? []) {
        const r = peta.get(f.site_key);
        if (r && r.status !== 'offline') kini.push({ site_key: f.site_key, id_site: r.id_site!, kategori: 'sering_putus', detail: '', nilai: f.downs, mulai: now });
      }
    }

    // 2) Riwayat kondisi: buka / perbarui / tutup
    const terbuka = await this.prisma.nocaasGangguan.findMany({ where: { selesai_at: null } });
    const kunci = (x: { site_key: string; kategori: string; detail: string }) => `${x.site_key}|${x.kategori}|${x.detail}`;
    const byKunci = new Map(terbuka.map((g) => [kunci(g), g]));
    const ada = new Set<string>();
    for (const c of kini) {
      const k = kunci(c); ada.add(k);
      const g = byKunci.get(k);
      if (g) await this.prisma.nocaasGangguan.update({ where: { id: g.id }, data: { terakhir_at: now, id_site: c.id_site, ...(c.nilai !== null && c.nilai > (g.nilai ?? 0) ? { nilai: c.nilai } : {}) } });
      else { const baru = await this.prisma.nocaasGangguan.create({ data: { site_key: c.site_key, id_site: c.id_site, kategori: c.kategori, detail: c.detail, nilai: c.nilai, mulai_at: c.mulai, terakhir_at: now } }); byKunci.set(k, baru); }
    }
    // Kondisi keadaan (jalur, port down) selesai begitu tidak terlihat; naik-turun / sering putus setelah tenang sekian menit
    for (const g of terbuka) {
      if (ada.has(kunci(g))) continue;
      const tenang = ['port_wan_flap', 'port_lan_flap', 'sering_putus'].includes(g.kategori) ? kat.pulih_menit * 60_000 : 0;
      if (now.getTime() - g.terakhir_at.getTime() >= tenang) await this.prisma.nocaasGangguan.update({ where: { id: g.id }, data: { selesai_at: now } });
    }

    // 3) Tiket untuk kondisi terbuka yang belum punya tiket (satu tiket per site + kategori)
    const tanpaTiket = await this.prisma.nocaasGangguan.findMany({ where: { selesai_at: null, id_ticket: null, id_site: { not: null } }, orderBy: { mulai_at: 'asc' } });
    const perKat = new Map<string, typeof tanpaTiket>();
    for (const g of tanpaTiket) perKat.set(g.kategori, [...(perKat.get(g.kategori) ?? []), g]);
    let dibuat = 0, ditempel = 0;
    for (const [kategori, gs] of perKat) {
      if (!(kat as any)[kategori]?.aktif) continue; // kategori dicatat saja, tidak ditiketkan
      const info = LABEL_KATEGORI[kategori];
      const site = [...new Set(gs.map((g) => g.id_site!))];
      const aktif = await this.prisma.operationTicket.findMany({
        where: { id_site: { in: site }, sumber_tiket: 'NOCaaS', status_tiket: { in: STATUS_TIKET_AKTIF }, jenis_gangguan: { in: [info.label, 'Mati total', 'VPN macet'] } },
        select: { id_ticket: true, id_site: true, status_tiket: true, jenis_gangguan: true },
      });
      const baruSite = site.filter((id) => !aktif.some((t) => t.id_site === id));
      if (baruSite.length > cfg.maks_tiket_per_putaran) {
        this.logger.warn(`${baruSite.length} site ${info.label} sekaligus — tiket kategori ini ditahan`);
        continue;
      }
      for (const id_site of site) {
        const kondisi = gs.filter((g) => g.id_site === id_site);
        const t = aktif.find((x) => x.id_site === id_site && x.jenis_gangguan === info.label) ?? aktif.find((x) => x.id_site === id_site);
        const rincian = kondisi.map((g) => this.teksKondisi(g)).join('\n');
        let id_ticket: number;
        if (t) {
          id_ticket = t.id_ticket;
          await this.prisma.operationTicketLog.create({ data: { id_ticket, status_ke: t.status_tiket, catatan: `NOCaaS: ${info.label} — ${rincian}` } });
          ditempel++;
        } else {
          // Helpdesk sudah menutup kondisi yang sama di site ini ≤ 24 jam lalu (mis. "VPN saja, internet normal")
          // → ikuti keputusan helpdesk: cukup catat di tiket itu, jangan buat tiket baru
          const lama = await this.prisma.nocaasGangguan.findMany({
            where: { id_site, kategori, id_ticket: { not: null }, terakhir_at: { gte: new Date(now.getTime() - 24 * 3600_000) } },
            orderBy: { terakhir_at: 'desc' }, select: { id_ticket: true }, take: 5,
          });
          const sebelumnya = lama.length ? await this.prisma.operationTicket.findFirst({
            where: { id_ticket: { in: lama.map((g) => g.id_ticket!) }, status_tiket: { in: ['Resolved', 'Closed'] } },
            orderBy: { updated_at: 'desc' }, select: { id_ticket: true, status_tiket: true },
          }) : null;
          if (sebelumnya && (await ditutupHelpdesk(this.prisma, sebelumnya.id_ticket))) {
            id_ticket = sebelumnya.id_ticket;
            await catatSekali(this.prisma, id_ticket, sebelumnya.status_tiket, `NOCaaS: ${info.label} muncul lagi`,
              `NOCaaS: ${info.label} muncul lagi — ${rincian}. Tidak dibuat tiket baru karena kondisi ini sudah ditutup helpdesk ≤ 24 jam lalu.`, new Date(now.getTime() - 3600_000));
            ditempel++;
          } else {
            id_ticket = await this.buatTiketKategori(id_site, kategori, kondisi, rincian);
            dibuat++;
          }
        }
        await this.prisma.nocaasGangguan.updateMany({ where: { id: { in: kondisi.map((g) => g.id) } }, data: { id_ticket } });
      }
    }

    // 4) Auto-resolve tiket kategori ini bila semua kondisinya sudah selesai
    let resolved = 0;
    const tiket = await this.prisma.operationTicket.findMany({
      where: { sumber_tiket: 'NOCaaS', status_tiket: { in: STATUS_TIKET_AKTIF }, jenis_gangguan: { in: Object.values(LABEL_KATEGORI).map((x) => x.label) } },
      select: { id_ticket: true, status_tiket: true },
    });
    for (const t of tiket) {
      const masih = await this.prisma.nocaasGangguan.count({ where: { id_ticket: t.id_ticket, selesai_at: null } });
      if (masih) continue;
      if (await dipegangHelpdesk(this.prisma, t.id_ticket)) {
        await catatSekali(this.prisma, t.id_ticket, t.status_tiket, 'NOCaaS: kondisi sudah normal kembali',
          'NOCaaS: kondisi sudah normal kembali — status tidak diubah otomatis karena tiket ditangani helpdesk; tutup bila sudah beres.');
        continue;
      }
      await this.prisma.operationTicket.update({ where: { id_ticket: t.id_ticket }, data: { status_tiket: 'Resolved', tgl_resolved: now } });
      await this.prisma.operationTicketLog.create({ data: { id_ticket: t.id_ticket, status_dari: t.status_tiket, status_ke: 'Resolved', catatan: 'NOCaaS: kondisi sudah normal kembali — auto-resolved' } });
      await this.prisma.notification.deleteMany({ where: { is_read: false, url: `/operations/${t.id_ticket}` } }).catch(() => {});
      resolved++;
    }
    if (dibuat || ditempel || resolved) this.logger.log(`Gangguan kategori: ${JSON.stringify({ dibuat, ditempel, resolved })}`);
  }

  private teksKondisi(g: { kategori: string; detail: string; nilai: number | null; mulai_at: Date }) {
    switch (g.kategori) {
      case 'vpn_macet': return `VPN tidak bisa di-ping dari ERP sejak ${this.waktuWib(g.mulai_at)}`;
      case 'jalur': return `jalur ${g.detail} putus sejak ${this.waktuWib(g.mulai_at)}`;
      case 'port_wan_down': return `port WAN ${g.detail} down sejak ${this.waktuWib(g.mulai_at)} (dari snapshot config router)`;
      case 'port_wan_flap': case 'port_lan_flap': return `port ${g.detail} naik-turun ${g.nilai}× dalam 1 jam`;
      case 'sering_putus': return `VPN putus-sambung ${g.nilai}× dalam 1 jam`;
      default: return g.kategori;
    }
  }

  private async buatTiketKategori(id_site: number, kategori: string, kondisi: { mulai_at: Date; site_key: string }[], rincian: string) {
    const info = LABEL_KATEGORI[kategori];
    const site = (await this.prisma.sitePelanggan.findUnique({ where: { id_site }, select: { nama_site: true } }))!;
    const now = new Date();
    const mulai = kondisi.reduce((m, g) => (g.mulai_at < m ? g.mulai_at : m), now);
    const detail = [...new Set(kondisi.map((g: any) => g.detail).filter(Boolean))].join(', ');
    const judul = `[NOCaaS] ${site.nama_site} — ${info.label}${detail ? ` (${detail})` : ''}`.slice(0, 255);
    const t = await withNextTicketNumber(this.prisma, now, (nomor_tiket) =>
      this.prisma.$transaction(async (tx) => {
        const x = await tx.operationTicket.create({
          data: {
            nomor_tiket, id_site, judul_tiket: judul, prioritas: info.prioritas, sumber_tiket: 'NOCaaS', jenis_gangguan: info.label,
            deskripsi_masalah: `${info.arti}\n${rincian}\nPerangkat: ${[...new Set(kondisi.map((g) => g.site_key))].join(', ')}`,
            tgl_sensor_down: mulai, sla_due: new Date(mulai.getTime() + (SLA_JAM[info.prioritas] ?? 24) * 3600_000),
          },
        });
        await tx.operationTicketLog.create({ data: { id_ticket: x.id_ticket, status_ke: 'Open', catatan: `NOCaaS: tiket dibuat otomatis — ${info.label}` } });
        return x;
      }),
    );
    this.notif.notifyForModul('operations', { tipe: 'tiket_baru', judul: `🟠 [NOCaaS] ${site.nama_site} — ${info.label}`, deskripsi: `${t.nomor_tiket} — ${rincian.split('\n')[0]}`, url: `/operations/${t.id_ticket}` }).catch(() => {});
    return t.id_ticket;
  }

  // ── Tiket gangguan otomatis ────────────────────────────────────────────────
  // Router site aktif yang menjadi "mati total" (tidak ada VPN & tidak ada heartbeat syslog) setelah fitur aktif,
  // dan bertahan ≥ durasi_konfirmasi → tiket. Router kembali online (atau minimal 1 tunnel) → tiket auto-resolve.
  /** Konfigurasi + kategori lengkap (bawaan digabung dengan yang disimpan) — untuk halaman /nocaas */
  async konfigurasiLengkap() {
    const { cfg, kat } = await this.kategoriKonfigurasi();
    return { ...cfg, kategori: kat };
  }

  async konfigurasi() {
    return this.prisma.nocaasConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  async ubahKonfigurasi(d: { kategori?: Record<string, any>; tiket_aktif?: boolean; wa_pic_aktif?: boolean; durasi_konfirmasi_menit?: number; cooldown_menit?: number; maks_tiket_per_putaran?: number }) {
    await this.konfigurasi();
    const data: any = {};
    if (typeof d.tiket_aktif === 'boolean') data.tiket_aktif = d.tiket_aktif;
    if (typeof d.wa_pic_aktif === 'boolean') data.wa_pic_aktif = d.wa_pic_aktif;
    if (d.kategori && typeof d.kategori === 'object') {
      const { kat } = await this.kategoriKonfigurasi();
      const angka = (v: any, lama: number, min: number, max: number) => (Number.isFinite(+v) ? Math.min(Math.max(Math.round(+v), min), max) : lama);
      const k: any = { ...kat };
      for (const nama of ['vpn_macet', 'jalur', 'port_wan_down', 'port_wan_flap', 'port_lan_flap', 'sering_putus'] as const) {
        const v = d.kategori[nama];
        if (!v || typeof v !== 'object') continue;
        const x: any = { ...(kat as any)[nama] };
        if (typeof v.aktif === 'boolean') x.aktif = v.aktif;
        if ('menit' in x && v.menit !== undefined) x.menit = angka(v.menit, x.menit, 5, 1440);
        if ('min' in x && v.min !== undefined) x.min = angka(v.min, x.min, 2, 500);
        k[nama] = x;
      }
      if (d.kategori.pulih_menit !== undefined) k.pulih_menit = angka(d.kategori.pulih_menit, kat.pulih_menit, 10, 1440);
      data.kategori = k;
    }
    if (d.durasi_konfirmasi_menit !== undefined) data.durasi_konfirmasi_menit = Math.min(Math.max(Math.round(d.durasi_konfirmasi_menit), 1), 240);
    if (d.cooldown_menit !== undefined) data.cooldown_menit = Math.min(Math.max(Math.round(d.cooldown_menit), 0), 1440);
    if (d.maks_tiket_per_putaran !== undefined) data.maks_tiket_per_putaran = Math.min(Math.max(Math.round(d.maks_tiket_per_putaran), 1), 500);
    await this.prisma.nocaasConfig.update({ where: { id: 1 }, data });
    return { data: await this.konfigurasiLengkap(), message: 'Konfigurasi disimpan' };
  }

  private catatanRouter(r: any) {
    if (r.jenis && r.jenis !== 'mikrotik') return `${r.site_key} (${r.jenis.toUpperCase()}${r.model ? ` ${r.model}` : ''}) · ${r.public_ip ? `IP publik ${r.public_ip}` : 'tanpa tunnel VPN'}`;
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

    // 1) Kandidat (router terpetakan ke site aktif, gangguan mulai SETELAH fitur aktif, lewat masa konfirmasi):
    //    - mati total: tidak ada VPN & tidak ada heartbeat syslog
    //    - VPN macet : sesi VPN ada tapi tidak satu pun jalur menjawab ping dari ERP (bukan kondisi lama)
    const batas = new Date(now.getTime() - cfg.durasi_konfirmasi_menit * 60_000);
    const mati = (await this.prisma.nocaasRouter.findMany({
      where: {
        id_site: { not: null }, site: { status_site: 'Aktif' },
        // VPN macet ditangani sistem kategori (vpn_macet) — di sini hanya mati total
        status: 'offline', status_sejak: { gte: cfg.aktif_sejak, lte: batas },
      },
      include: { site: { select: { id_site: true, nama_site: true } } },
    })).map((r) => ({ ...r, jenis: (r.status === 'offline' ? 'mati' : 'macet') as 'mati' | 'macet', sejak: r.status === 'offline' ? r.status_sejak : r.macet_sejak! }))
      .sort((a, b) => a.sejak.getTime() - b.sejak.getTime());
    const perSite = new Map<number, typeof mati>();
    for (const r of mati) perSite.set(r.id_site!, [...(perSite.get(r.id_site!) ?? []), r]);

    const aktif = perSite.size
      ? await this.prisma.operationTicket.findMany({
          where: { id_site: { in: [...perSite.keys()] }, status_tiket: { in: STATUS_TIKET_AKTIF } },
          select: { id_ticket: true, id_site: true, sumber_tiket: true, status_tiket: true, logs: { where: { catatan: { startsWith: 'NOCaaS:' } }, select: { id_log: true }, take: 1 } },
        })
      : [];
    const tiketAktif = new Map(aktif.map((t) => [t.id_site, t]));
    let perluBaru = [...perSite.keys()].filter((id) => !tiketAktif.has(id));

    // Satu gangguan = satu tiket: bila tiket site ini sudah DITUTUP saat router masih mati (episode yang sama —
    // router belum pernah hidup sejak mati), jangan buka ulang / buat tiket baru. Tiket baru hanya bila router
    // sempat hidup lalu mati lagi (status_sejak berganti → episode baru).
    if (perluBaru.length) {
      // Acuan = router yang PALING BARU mati di site itu: ada router lain mati setelah tiket ditutup → gangguan baru
      const matiTerbaru = new Map(perluBaru.map((id) => [id, new Date(Math.max(...perSite.get(id)!.map((r) => r.sejak.getTime())))]));
      const batasAwal = new Date(Math.min(...[...matiTerbaru.values()].map((d) => d.getTime())));
      const sudahDitutup = await this.prisma.operationTicket.findMany({
        where: {
          id_site: { in: perluBaru }, status_tiket: { in: ['Resolved', 'Closed'] },
          // Ditutup langsung ke Closed hanya mengisi tgl_closed
          OR: [{ tgl_resolved: { gte: batasAwal } }, { tgl_closed: { gte: batasAwal } }],
        },
        select: { id_ticket: true, id_site: true, status_tiket: true, tgl_resolved: true, tgl_closed: true },
      });
      const waktuTutup = (x: { tgl_resolved: Date | null; tgl_closed: Date | null }) => Math.max(x.tgl_resolved?.getTime() ?? 0, x.tgl_closed?.getTime() ?? 0);
      const ditahan = new Set<number>();
      for (const id_site of perluBaru) {
        const mulai = matiTerbaru.get(id_site)!;
        const t = sudahDitutup.filter((x) => x.id_site === id_site && waktuTutup(x) >= mulai.getTime()).sort((a, b) => waktuTutup(b) - waktuTutup(a))[0];
        if (!t) continue;
        ditahan.add(id_site);
        // Catat sekali di tiket yang ditutup, supaya helpdesk tahu router memang masih mati
        const kunciLog = 'NOCaaS: router masih mati setelah tiket ditutup';
        const sudah = await this.prisma.operationTicketLog.count({ where: { id_ticket: t.id_ticket, catatan: { startsWith: kunciLog }, created_at: { gte: new Date(waktuTutup(t)) } } });
        if (!sudah) {
          const rs = perSite.get(id_site)!;
          await this.prisma.operationTicketLog.create({
            data: {
              id_ticket: t.id_ticket, status_ke: t.status_tiket,
              catatan: `${kunciLog} — ${rs.map((r) => `${r.site_key} mati sejak ${this.waktuWib(r.sejak)}`).join(', ')}. Tiket tidak dibuka ulang; tiket baru dibuat otomatis hanya bila router sempat hidup lalu mati lagi.`,
            },
          });
        }
      }
      if (ditahan.size) perluBaru = perluBaru.filter((id) => !ditahan.has(id));
    }

    // Pengaman: terlalu banyak sekaligus = kemungkinan gangguan pusat / NOCaaS → jangan buat tiket massal
    if (perluBaru.length > cfg.maks_tiket_per_putaran) {
      this.logger.warn(`${perluBaru.length} site mati / VPN macet sekaligus (> ${cfg.maks_tiket_per_putaran}) — tiket ditahan, kemungkinan gangguan pusat`);
      const kunci = `NOCaaS: ${perluBaru.length} site mati / VPN macet`;
      const sudah = await this.prisma.notification.findFirst({ where: { judul: { startsWith: 'NOCaaS:' }, created_at: { gte: new Date(now.getTime() - 3600_000) } } });
      if (!sudah) this.notif.notifyForModul('operations', { tipe: 'tiket_baru', judul: `${kunci} sekaligus`, deskripsi: 'Tiket otomatis ditahan — cek koneksi pusat / NOCaaS', url: '/nocaas' }).catch(() => {});
    } else {
      for (const id_site of perluBaru) {
        const r = await this.buatTiket(perSite.get(id_site)!, cfg.cooldown_menit);
        if (r.hasil === 'baru') hasil.dibuat++; else if (r.hasil === 'ulang') hasil.dibuka_ulang++; else hasil.dicatat++;
        if (cfg.wa_pic_aktif && r.hasil === 'baru') {
          const rs = perSite.get(id_site)!;
          const mati = rs.some((x) => x.jenis === 'mati');
          this.kirimWaPic(id_site, `Halo Bapak/Ibu PIC *${rs[0].site!.nama_site}*,\n\nNOC NEXT1 mendeteksi ${mati ? 'koneksi di lokasi Anda terputus' : 'koneksi jaringan NEXT1 di lokasi Anda terganggu'} sejak ${this.waktuWib(rs[0].sejak)} (tiket ${r.nomor}). Tim kami sedang menangani.\n\n${mati ? 'Mohon bantu cek apakah listrik dan perangkat router/modem di lokasi menyala. ' : ''}Balas pesan ini bila ada informasi tambahan. Terima kasih 🙏`).catch(() => {});
        }
      }
    }

    // Site yang sudah punya tiket aktif dari sumber lain (WA/manual/PRTG): cukup catat sekali di log
    for (const t of aktif) {
      if (t.sumber_tiket === 'NOCaaS' || t.logs.length) continue;
      const rs = perSite.get(t.id_site)!;
      await this.prisma.operationTicketLog.create({
        data: { id_ticket: t.id_ticket, status_ke: t.status_tiket, catatan: `NOCaaS: router ${rs.some((r) => r.jenis === 'mati') ? 'mati total' : 'VPN macet (tidak bisa di-ping)'} sejak ${this.waktuWib(rs[0].sejak)} — ${rs.map((r) => this.catatanRouter(r)).join(' | ')}` },
      });
      hasil.dicatat++;
    }

    // 2) Auto-resolve tiket NOCaaS yang routernya sudah hidup lagi
    const tiketNoc = await this.prisma.operationTicket.findMany({
      where: { sumber_tiket: 'NOCaaS', status_tiket: { in: STATUS_TIKET_AKTIF }, OR: [{ jenis_gangguan: null }, { jenis_gangguan: 'Mati total' }] },
      select: {
        id_ticket: true, nomor_tiket: true, judul_tiket: true, status_tiket: true, id_site: true,
        site: { select: { nama_site: true, id_pelanggan: true, pelanggan: { select: { nama_pelanggan: true, no_hp_pic_utama: true } } } },
      },
    });
    for (const t of tiketNoc) {
      const rs = await this.prisma.nocaasRouter.findMany({ where: { id_site: t.id_site } });
      // Yang menahan resolve hanya gangguan baru — perangkat yang sudah mati / macet sebelum fitur aktif diabaikan
      const masihGanggu = rs.some((r) => (r.status === 'offline' && r.status_sejak >= cfg.aktif_sejak) || (r.macet_sejak && !r.macet_lama));
      if (!rs.length || masihGanggu || rs.every((r) => r.status === 'offline')) continue;
      // Router yang masih melapor lewat syslog (internet lokasi hidup) dianggap tersambung walau VPN putus —
      // VPN putus saja dibiarkan, tidak ditiketkan (arahan Kevin, 11 Nov 2026)
      const hidup = rs.filter((r) => r.status === 'online' || r.status === 'partial' || r.status === 'internet_ok');
      if (await dipegangHelpdesk(this.prisma, t.id_ticket)) {
        await catatSekali(this.prisma, t.id_ticket, t.status_tiket, 'NOCaaS: router sudah tersambung kembali',
          `NOCaaS: router sudah tersambung kembali (${hidup.map((r) => `${r.site_key} ${KESIMPULAN[r.status as StatusRouter].label}`).join(', ')}) — status tidak diubah otomatis karena tiket ditangani helpdesk; tutup bila sudah beres.`);
        continue;
      }
      await this.prisma.operationTicket.update({ where: { id_ticket: t.id_ticket }, data: { status_tiket: 'Resolved', tgl_resolved: now } });
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
      if (cfg.wa_pic_aktif) this.kirimWaPic(t.id_site, `Halo Bapak/Ibu PIC *${t.site.nama_site}*,\n\nKoneksi di lokasi Anda sudah kembali normal (${now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} WIB, tiket ${t.nomor_tiket}). Terima kasih atas kesabarannya 🙏\n\n— NOC NEXT1`).catch(() => {});
    }
    if (hasil.dibuat || hasil.dibuka_ulang || hasil.dicatat || hasil.resolved) this.logger.log(`Tiket NOCaaS: ${JSON.stringify(hasil)}`);
  }

  /** Tiket baru (atau buka ulang tiket yang baru saja resolve — flapping) untuk satu site */
  private async buatTiket(rs: any[], cooldownMenit: number): Promise<{ hasil: 'baru' | 'ulang' | 'dicatat'; nomor: string }> {
    const site = rs[0].site as { id_site: number; nama_site: string };
    const now = new Date();
    const downAt: Date = rs[0].sejak;
    const prioritas = 'Critical';
    const mati = rs.some((r) => r.jenis === 'mati');
    const jenisTeks = mati ? 'Mati total' : 'VPN macet';
    const rincian = rs.map((r) => this.catatanRouter(r)).join('\n');

    const flapping = await this.prisma.operationTicket.findFirst({
      where: {
        id_site: site.id_site, sumber_tiket: 'NOCaaS', status_tiket: { in: ['Resolved', 'Closed'] },
        // jenis bisa sudah diganti helpdesk (mis. "FO Cut") — kenali juga dari judul tiket otomatis
        AND: [
          { OR: [{ jenis_gangguan: { in: ['Mati total', 'VPN macet'] } }, { judul_tiket: { contains: '— Mati total' } }, { judul_tiket: { contains: '— VPN macet' } }] },
          { OR: [{ tgl_resolved: { gte: new Date(now.getTime() - cooldownMenit * 60_000) } }, { tgl_closed: { gte: new Date(now.getTime() - cooldownMenit * 60_000) } }] },
        ],
      },
      orderBy: { updated_at: 'desc' },
    });
    if (flapping && (await ditutupHelpdesk(this.prisma, flapping.id_ticket))) {
      // Ditutup helpdesk → ikuti keputusannya: jangan dibuka ulang, cukup catat. Lewat cooldown & masih mati → tiket baru.
      const ditutupAt = flapping.tgl_resolved ?? flapping.tgl_closed ?? now;
      await catatSekali(this.prisma, flapping.id_ticket, flapping.status_tiket, 'NOCaaS: router mati lagi setelah tiket ditutup helpdesk',
        `NOCaaS: router mati lagi setelah tiket ditutup helpdesk (${jenisTeks.toLowerCase()} sejak ${this.waktuWib(downAt)}) — tidak dibuka ulang. Bila masih mati lewat ${cooldownMenit} menit, tiket baru dibuat.\n${rincian}`, ditutupAt);
      return { hasil: 'dicatat', nomor: flapping.nomor_tiket };
    }
    if (flapping) {
      const menit = Math.round((now.getTime() - (flapping.tgl_resolved ?? flapping.tgl_closed ?? now).getTime()) / 60_000);
      const ke = (await this.prisma.operationTicketLog.count({ where: { id_ticket: flapping.id_ticket, catatan: { contains: 'flapping' } } })) + 1;
      await this.prisma.operationTicket.update({
        where: { id_ticket: flapping.id_ticket },
        data: { status_tiket: 'In_Progress', tgl_resolved: null, tgl_sensor_down: downAt, sla_due: new Date(downAt.getTime() + (SLA_JAM[flapping.prioritas] ?? 4) * 3600_000), sla_breached: false },
      });
      await this.prisma.operationTicketLog.create({
        data: { id_ticket: flapping.id_ticket, status_dari: flapping.status_tiket, status_ke: 'In_Progress', catatan: `NOCaaS: ⚠️ flapping #${ke} — router ${jenisTeks.toLowerCase()} lagi ${menit} menit setelah tersambung\n${rincian}` },
      });
      this.notif.notifyForModul('operations', {
        tipe: 'tiket_update', judul: `⚠️ Flapping #${ke}: ${site.nama_site} mati lagi`, deskripsi: `${flapping.nomor_tiket} — ${menit} menit setelah tersambung`, url: `/operations/${flapping.id_ticket}`,
      }).catch(() => {});
      return { hasil: 'ulang', nomor: flapping.nomor_tiket };
    }

    const judul = `[NOCaaS] ${site.nama_site} — ${jenisTeks}`;
    const ticket = await withNextTicketNumber(this.prisma, now, (nomor_tiket) =>
      this.prisma.$transaction(async (tx) => {
        const t = await tx.operationTicket.create({
          data: {
            nomor_tiket, id_site: site.id_site, judul_tiket: judul, prioritas, sumber_tiket: 'NOCaaS', jenis_gangguan: jenisTeks,
            deskripsi_masalah: mati
              ? rs.every((r) => r.jenis !== 'mikrotik')
                ? `Perangkat ${[...new Set(rs.map((r) => r.jenis.toUpperCase()))].join('/')} offline di NOCaaS sejak ${this.waktuWib(downAt)} (listrik / perangkat / internet lokasi).\n${rincian}`
                : `Router tidak terlihat di NOCaaS sejak ${this.waktuWib(downAt)}: kedua VPN putus dan tidak ada heartbeat syslog (listrik / perangkat / internet lokasi).\n${rincian}`
              : `Sesi VPN tercatat tersambung, tapi tidak satu pun jalur bisa di-ping dari ERP sejak ${this.waktuWib(downAt)} — data tidak lewat (ISP / router lokasi).\n${rincian}`,
            tgl_sensor_down: downAt,
            sla_due: new Date(downAt.getTime() + (SLA_JAM[prioritas] ?? 4) * 3600_000),
          },
        });
        await tx.operationTicketLog.create({ data: { id_ticket: t.id_ticket, status_ke: 'Open', catatan: `NOCaaS: tiket dibuat otomatis — router ${jenisTeks.toLowerCase()} ≥ ${Math.round((now.getTime() - downAt.getTime()) / 60_000)} menit` } });
        return t;
      }),
    );
    this.notif.notifyForModul('operations', {
      tipe: 'tiket_baru', judul: `🔴 [NOCaaS] ${site.nama_site} ${jenisTeks.toLowerCase()}`, deskripsi: `${ticket.nomor_tiket} — ${rs.map((r) => r.site_key).join(', ')}`, url: `/operations/${ticket.id_ticket}`,
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
        sensor_detail: mati ? 'Router mati total (VPN & heartbeat NOCaaS)' : 'VPN macet (sesi ada, ping gagal)', waktu_down: this.waktuWib(downAt),
      });
    })().catch(() => {});
    return { hasil: 'baru', nomor: ticket.nomor_tiket };
  }

  /**
   * WA ke PIC site lewat akun helpdesk. Penerima hanya yang PASTI: PIC site di ERP (bukan placeholder PRTG)
   * dan kontak WA yang sudah dikonfirmasi sebagai PIC — saran otomatis dari nama kontak tidak ikut.
   */
  private async kirimWaPic(id_site: number, teks: string) {
    const [pic, kontak] = await Promise.all([
      this.prisma.picSite.findMany({ where: { id_site, no_kontak: { not: null }, NOT: { nama_pic: { contains: 'PRTG' } } }, select: { no_kontak: true } }),
      this.prisma.waKontak.findMany({ where: { id_site, id_pic: { not: null }, nomor: { not: null } }, select: { nomor: true } }),
    ]);
    const nomor = [...new Set([...pic.map((p) => p.no_kontak!), ...kontak.map((k) => k.nomor!)].map((n) => n.replace(/\D/g, '').replace(/^0/, '62')).filter((n) => n.length >= 10))].slice(0, 5);
    for (const n of nomor) {
      try { await this.waHelpdesk.kirimKeNomor(n, teks, 0); } catch (e: any) { this.logger.warn(`WA ke PIC ${n} gagal: ${e?.message}`); }
    }
    if (nomor.length) this.logger.log(`WA tiket NOCaaS → ${nomor.length} PIC site#${id_site}`);
  }

  // ── Kontak WA helpdesk ↔ PIC site ──────────────────────────────────────────
  // Nama kontak di HP helpdesk berformat "<Nama> <Brand> <Lokasi>" ("Hamka KK Palembang Square"). Kontak yang belum
  // tertaut lewat nomor PIC dicocokkan ke site dengan pencocok saran yang sama dengan router NOCaaS.
  // Hasil yakin disimpan sebagai site_sumber 'saran' (tampil di WA Inbox, perlu dikonfirmasi jadi PIC resmi).
  @Cron('7 * * * *')
  async cronKontakWa() { await this.cocokkanKontakWa().catch((e) => this.logger.warn(`Cocokkan kontak WA gagal: ${e?.message}`)); }

  async cocokkanKontakWa() {
    const routers = await this.prisma.nocaasRouter.findMany({ where: { id_site: { not: null }, sumber_map: { in: ['ip_perangkat', 'prtg_host', 'manual', 'saran'] } }, select: { site_key: true, id_site: true } });
    const pencocok = await this.buatPencocok(routers.map((r) => ({ site_key: r.site_key.replace(/^[A-Z]+:/, ''), id_site: r.id_site! })), new Set());
    const site = new Map((await this.siteAktif()).map((x) => [x.id_site, x]));
    const kontak = await this.prisma.waKontak.findMany({
      where: { id_pic: null, NOT: { jid: { endsWith: '@g.us' } }, OR: [{ site_sumber: 'saran' }, { site_sumber: null, id_site: null }] },
      select: { id_kontak: true, nama_kustom: true, nama_simpan: true, id_site: true, site_sumber: true },
    });
    let baru = 0, lepas = 0;
    const tulis: any[] = [];
    let n = 0;
    for (const k of kontak) {
      if (++n % 50 === 0) await jeda();
      const nama = (k.nama_kustom || k.nama_simpan || '').trim();
      const t = nama.split(/\s+/);
      let id: number | null = null;
      // Lewati nama orang di depan: cari posisi kata yang dikenali sebagai awalan brand
      for (let i = 0; i < Math.min(3, t.length - 1); i++) {
        const sisa = t.slice(i).join('-');
        if (!pencocok.pelangganDari(sisa)) continue;
        const r = pencocok.cari(sisa);
        if (r.yakin) id = r.saran[0].id_site;
        break;
      }
      if (id && id !== k.id_site) {
        const s = site.get(id)!;
        tulis.push(this.prisma.waKontak.update({ where: { id_kontak: k.id_kontak }, data: { id_site: id, id_pelanggan: s.id_pelanggan, site_sumber: 'saran', nama_erp: `${nama} · ${s.nama_site}`.slice(0, 200) } }));
        baru++;
      } else if (!id && k.site_sumber === 'saran') {
        tulis.push(this.prisma.waKontak.update({ where: { id_kontak: k.id_kontak }, data: { id_site: null, id_pelanggan: null, site_sumber: null, nama_erp: null } }));
        lepas++;
      }
    }
    for (let i = 0; i < tulis.length; i += 200) await this.prisma.$transaction(tulis.slice(i, i + 200));
    if (baru || lepas) this.logger.log(`Kontak WA ↔ site: ${baru} tertaut (saran), ${lepas} dilepas`);
    return { data: { dicek: kontak.length, tertaut: baru, dilepas: lepas }, message: `${baru} kontak WA tertaut ke site (saran), ${lepas} dilepas` };
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
    const [tiket, bermasalah, grup, total, macet] = await Promise.all([
      this.prisma.operationTicket.findMany({
        where: { status_tiket: { in: STATUS_TIKET_AKTIF } },
        select: { id_ticket: true, nomor_tiket: true, judul_tiket: true, sumber_tiket: true, status_tiket: true, prioritas: true, tgl_open: true, id_site: true, site: { select: { kode_site: true, nama_site: true, kota: true } } },
        orderBy: { tgl_open: 'desc' }, take: 500,
      }),
      this.prisma.nocaasRouter.findMany({
        where: { OR: [{ status: { in: ['offline', 'internet_ok'] } }, { macet_sejak: { not: null } }], id_site: { not: null }, site: { status_site: 'Aktif' } },
        include: { site: { select: { kode_site: true, nama_site: true, kota: true, pelanggan: { select: { nama_pelanggan: true } } } } },
        orderBy: { status_sejak: 'desc' },
      }),
      this.prisma.nocaasRouter.groupBy({ by: ['status', 'sumber_map'], _count: { _all: true } }),
      this.prisma.sitePelanggan.count({ where: { status_site: 'Aktif' } }),
      this.prisma.nocaasRouter.count({ where: { macet_sejak: { not: null }, status: { not: 'offline' } } }),
    ]);
    const perJenis = await this.prisma.nocaasRouter.groupBy({ by: ['jenis'], _count: { _all: true }, orderBy: { jenis: 'asc' } });
    const st = await this.statusSite(tiket.map((t) => t.id_site));
    const siteTiket = new Set(tiket.map((t) => t.id_site));
    const tanpaTiket = bermasalah.filter((r) => !siteTiket.has(r.id_site!)).map((r) => this.bentuk(r));
    const siteTerpeta = await this.prisma.nocaasRouter.findMany({ where: { id_site: { not: null } }, distinct: ['id_site'], select: { id_site: true } });

    const per = (f: (g: (typeof grup)[number]) => boolean) => grup.filter(f).reduce((n, g) => n + g._count._all, 0);
    return {
      data: {
        sinkron: this.terakhir,
        per_jenis: perJenis.map((j) => ({ jenis: j.jenis, n: j._count._all })),
        tiket: tiket.map((t) => {
          const s = st.data[t.id_site];
          return { ...t, nocaas: s ? { ...s, saran: KESIMPULAN[s.status as keyof typeof KESIMPULAN]?.saran } : null };
        }),
        tanpa_tiket: tanpaTiket,
        pemetaan: {
          router: per(() => true),
          terpeta: per((g) => !!g.sumber_map && g.sumber_map !== 'abaikan' && g.sumber_map !== 'konflik_ip'),
          per_sumber: ['ip_perangkat', 'prtg_host', 'nama', 'nama_mikrotik', 'saran', 'manual', 'konflik_ip'].map((s) => ({ sumber: s, n: per((g) => g.sumber_map === s) })),
          abaikan: per((g) => g.sumber_map === 'abaikan'),
          belum: per((g) => !g.sumber_map || g.sumber_map === 'konflik_ip'),
          site_aktif: total,
          site_terpeta: siteTerpeta.length,
        },
        status: [
          ...['online', 'partial', 'internet_ok', 'offline'].map((s) => ({ status: s, label: KESIMPULAN[s as StatusRouter].label, n: per((g) => g.status === s) })),
          { status: 'macet', label: KESIMPULAN.macet.label, n: macet },
        ],
      },
    };
  }

  // ── Tinjau pemetaan ────────────────────────────────────────────────────────
  private pencocokTinjau: { exp: number; p: PencocokSaran } | null = null;
  private async pencocokUntukTinjau() {
    if (this.pencocokTinjau && this.pencocokTinjau.exp > Date.now()) return this.pencocokTinjau.p;
    const rows = await this.prisma.nocaasRouter.findMany({ where: { id_site: { not: null } }, select: { site_key: true, id_site: true, sumber_map: true } });
    const p = await this.buatPencocok(
      rows.filter((r) => ['ip_perangkat', 'prtg_host', 'manual'].includes(r.sumber_map ?? '')).map((r) => ({ site_key: r.site_key, id_site: r.id_site! })),
      new Set(rows.map((r) => r.id_site!)),
    );
    this.pencocokTinjau = { exp: Date.now() + 2 * 60_000, p };
    return p;
  }

  /**
   * Antrean tinjau: jenis 'belum' (belum terpetakan, dengan 3 saran site — urut skor tertinggi dulu),
   * 'saran' (dipetakan otomatis dari saran — periksa), 'abaikan' (ditandai tidak punya site ERP)
   */
  async tinjau(q: { cari?: string; page?: number; jenis?: string }) {
    const jenis = ['belum', 'saran', 'abaikan'].includes(q.jenis ?? '') ? q.jenis! : 'belum';
    const page = Math.max(1, Number(q.page) || 1), take = 50;
    const cari = q.cari?.trim();
    const where: any = {
      ...(jenis === 'belum' ? { OR: [{ sumber_map: null }, { sumber_map: 'konflik_ip', id_site: null }] } : { sumber_map: jenis }),
      ...(cari ? { AND: [{ OR: [{ site_key: { contains: cari } }, { ns_ip: { contains: cari } }, { un_ip: { contains: cari } }] }] } : {}),
    };
    const [rows, jumlah] = await Promise.all([
      this.prisma.nocaasRouter.findMany({ where, orderBy: { site_key: 'asc' }, include: { site: { select: { nama_site: true, kode_site: true, kota: true, pelanggan: { select: { nama_pelanggan: true } } } } } }),
      this.prisma.nocaasRouter.groupBy({ by: ['sumber_map'], where: { sumber_map: { in: ['saran', 'abaikan'] } }, _count: { _all: true } }),
    ]);
    let data: any[] = rows.map((r) => this.bentuk(r));
    if (jenis === 'belum') {
      const p = await this.pencocokUntukTinjau();
      const idKonflik = [...new Set(rows.map((r) => r.konflik_id_site).filter((x): x is number => !!x))];
      const siteKonflik = new Map((await this.prisma.sitePelanggan.findMany({ where: { id_site: { in: idKonflik } }, select: { id_site: true, nama_site: true, kode_site: true, kota: true } })).map((s) => [s.id_site, s]));
      const hasil: any[] = [];
      for (const r of data) {
        if (hasil.length % 25 === 24) await jeda();
        hasil.push({ ...r, saran: p.cari(r.jenis !== 'mikrotik' ? r.site_key.replace(/^[A-Z]+:/, '') : r.site_key).saran, konflik: r.konflik_id_site ? siteKonflik.get(r.konflik_id_site) ?? null : null });
      }
      data = hasil
        .sort((a, b) => (b.saran[0]?.skor ?? 0) - (a.saran[0]?.skor ?? 0) || a.site_key.localeCompare(b.site_key));
    }
    const n = (s: string) => jumlah.find((j) => j.sumber_map === s)?._count._all ?? 0;
    const belum = jenis === 'belum' && !cari ? rows.length : await this.prisma.nocaasRouter.count({ where: { OR: [{ sumber_map: null }, { sumber_map: 'konflik_ip', id_site: null }] } });
    return {
      data: data.slice((page - 1) * take, page * take),
      meta: { total: data.length, page, pages: Math.max(1, Math.ceil(data.length / take)), jumlah: { belum, saran: n('saran'), abaikan: n('abaikan') } },
    };
  }

  /** Router milik satu site (detail site / pemetaan) */
  async routerSite(id_site: number) {
    const rows = await this.prisma.nocaasRouter.findMany({ where: { id_site }, orderBy: { site_key: 'asc' } });
    return { data: rows.map((r) => this.bentuk(r)) };
  }

  /** id_site → petakan manual · abaikan → router tidak punya site ERP · keduanya kosong → kembalikan ke otomatis */
  async petakan(site_key: string, id_site: number | null, abaikan = false) {
    const r = await this.prisma.nocaasRouter.findUnique({ where: { site_key } });
    if (!r) throw new NotFoundException('Router tidak ditemukan');
    if (id_site) {
      const s = await this.prisma.sitePelanggan.findUnique({ where: { id_site }, select: { id_site: true } });
      if (!s) throw new BadRequestException('Site tidak ditemukan');
    }
    const data = id_site ? { id_site, sumber_map: 'manual' } : abaikan ? { id_site: null, sumber_map: 'abaikan' } : { id_site: null, sumber_map: null };
    await this.prisma.nocaasRouter.update({ where: { site_key }, data });
    this.pencocokTinjau = null;
    this.saranCache = null;
    return { message: id_site ? 'Router dipetakan ke site' : abaikan ? 'Router ditandai tidak punya site ERP' : 'Dikembalikan ke pencocokan otomatis' };
  }

}
