import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';

type UserRingkas = { id_user: number; roles?: string[] };
const PENGELOLA = ['Admin', 'Director', 'Manager_Ops'];
// Pemetaan router↔site yang cukup kuat untuk sinkron massal (saran / konflik ditinjau manual per site)
const PETA_KUAT = ['ip_perangkat', 'manual', 'prtg_host', 'nama', 'nama_mikrotik'];
const MERK: Record<string, string> = { mikrotik: 'Mikrotik', rcms: 'Robustel', ruijie: 'Ruijie' };
const KOLOM = ['merk', 'tipe_model', 'serial_number', 'mac_address', 'ip_address'] as const;
type Kolom = (typeof KOLOM)[number];
const LABEL: Record<Kolom, string> = { merk: 'Merk', tipe_model: 'Tipe / model', serial_number: 'Serial number', mac_address: 'MAC address', ip_address: 'IP (tunnel)' };

export interface BarisBeda { kolom: Kolom; label: string; lama: string | null; baru: string; aksi: 'isi' | 'beda' | 'sama' }

/**
 * Data NOCaaS untuk halaman site pelanggan:
 *  - panel: router yang terpetakan ke site + ringkasan config (model, SN, RouterOS, interface, LAN, DHCP, VPN)
 *  - sinkron: salin identitas router (merk, tipe, SN, MAC, IP tunnel) ke data perangkat site ERP.
 *    Default hanya mengisi kolom KOSONG; menimpa nilai berbeda hanya Admin/Director/Manager Ops.
 */
@Injectable()
export class NocaasSiteService {
  private readonly logger = new Logger('NocaasSite');
  constructor(private prisma: PrismaService) {}

  // MAC / SN yang muncul di lebih dari satu router NOCaaS tidak bisa dipercaya
  // (config router sering disalin dari backup router lain — MAC ikut tersalin) → tidak dipakai.
  private kembar: { exp: number; mac: Set<string>; sn: Set<string> } | null = null;
  private async dataKembar() {
    if (this.kembar && this.kembar.exp > Date.now()) return this.kembar;
    const rows = await this.prisma.nocaasRouter.findMany({ where: { live_ringkas: { not: null as any } }, select: { live_ringkas: true } });
    const hitMac = new Map<string, number>(), hitSn = new Map<string, number>();
    for (const r of rows) {
      const l: any = r.live_ringkas;
      if (l?.serial) { const k = String(l.serial).toUpperCase(); hitSn.set(k, (hitSn.get(k) ?? 0) + 1); }
      const m = this.macUtama(l);
      if (m) hitMac.set(m, (hitMac.get(m) ?? 0) + 1);
    }
    const ganda = (m: Map<string, number>) => new Set([...m].filter(([, n]) => n > 1).map(([k]) => k));
    this.kembar = { exp: Date.now() + 10 * 60_000, mac: ganda(hitMac), sn: ganda(hitSn) };
    return this.kembar;
  }
  private macUtama(live: any): string | null {
    const ifs: any[] = live?.interfaces ?? [];
    const e = ifs.find((i) => /^ether1\b/i.test(i.name) && i.mac) ?? ifs.find((i) => i.type === 'ether' && i.mac) ?? ifs.find((i) => i.mac);
    return e?.mac ? String(e.mac).toUpperCase().slice(0, 20) : null;
  }

  private bolehKelola(u: UserRingkas) { return (u.roles ?? []).some((r) => PENGELOLA.includes(r)); }

  async panel(id_site: number) {
    const [routers, perangkat] = await Promise.all([
      this.prisma.nocaasRouter.findMany({ where: { id_site }, orderBy: [{ jenis: 'asc' }, { site_key: 'asc' }] }),
      this.prisma.perangkatSite.findMany({ where: { id_site }, orderBy: { id_perangkat: 'asc' } }),
    ]);
    return {
      data: {
        routers: routers.map((r) => ({
          site_key: r.site_key, nama: r.nama_utama ?? r.site_key, jenis: r.jenis, brand: r.brand, model: r.model,
          status: r.status, status_sejak: r.status_sejak, offline_since: r.offline_since,
          ns_ip: r.ns_ip, un_ip: r.un_ip, ns_online: r.ns_online, un_online: r.un_online,
          public_ip: r.public_ip, access_isp: r.access_isp, downs7: r.downs7, flaps24: r.flaps24,
          hb_at: r.hb_at, live_at: r.live_at, sumber_map: r.sumber_map,
          live: r.live_ringkas, vpn: r.vpn_ringkas,
        })),
        perangkat_jumlah: perangkat.length,
      },
    };
  }

  /** Router utama site: Mikrotik dengan config terbaru, kalau tidak ada perangkat lain */
  private async routerUtama(id_site: number) {
    const rs = await this.prisma.nocaasRouter.findMany({ where: { id_site, sumber_map: { not: 'abaikan' } } });
    rs.sort((a, b) => (a.jenis === 'mikrotik' ? 0 : 1) - (b.jenis === 'mikrotik' ? 0 : 1) || (b.live_at?.getTime() ?? 0) - (a.live_at?.getTime() ?? 0));
    return rs[0] ?? null;
  }

  /** Nilai dari NOCaaS untuk kolom perangkat site */
  private async nilaiNocaas(r: NonNullable<Awaited<ReturnType<NocaasSiteService['routerUtama']>>>): Promise<Partial<Record<Kolom, string>>> {
    const live: any = r.live_ringkas ?? {};
    const k = await this.dataKembar();
    const mac = this.macUtama(live);
    const sn = live.serial ? String(live.serial).slice(0, 100) : undefined;
    const v: Partial<Record<Kolom, string>> = {
      merk: MERK[r.jenis] ?? r.brand ?? undefined,
      tipe_model: (live.model || r.model || undefined)?.slice(0, 100),
      serial_number: sn && !k.sn.has(sn.toUpperCase()) ? sn : undefined,
      mac_address: mac && !k.mac.has(mac) ? mac : undefined,
      ip_address: (r.un_ip || r.ns_ip || undefined) ?? undefined,
    };
    for (const k of KOLOM) if (!v[k]) delete v[k];
    return v;
  }

  /** Baris perangkat site yang mewakili router ini (dicocokkan IP tunnel / SN, lalu Router, lalu CPE) */
  private async targetPerangkat(id_site: number, ip: (string | null)[], sn?: string) {
    const rows = await this.prisma.perangkatSite.findMany({ where: { id_site, status_perangkat: { not: 'Dicabut' } }, orderBy: { id_perangkat: 'asc' } });
    const ips = ip.filter(Boolean);
    return rows.find((p) => p.ip_address && ips.includes(p.ip_address))
      ?? (sn ? rows.find((p) => p.serial_number && p.serial_number.toUpperCase() === sn.toUpperCase()) : undefined)
      ?? rows.find((p) => /router/i.test(p.jenis_perangkat))
      ?? rows.find((p) => /cpe/i.test(p.jenis_perangkat))
      ?? null;
  }

  private bandingkan(lama: Record<string, any> | null, baru: Partial<Record<Kolom, string>>): BarisBeda[] {
    return KOLOM.filter((k) => baru[k]).map((k) => {
      const l = (lama?.[k] ?? null) as string | null;
      const b = baru[k]!;
      const aksi: BarisBeda['aksi'] = !l || !String(l).trim() ? 'isi' : String(l).trim().toUpperCase() === b.toUpperCase() ? 'sama' : 'beda';
      return { kolom: k, label: LABEL[k], lama: l, baru: b, aksi };
    });
  }

  /** Pratinjau sinkron satu site */
  async pratinjau(id_site: number) {
    const r = await this.routerUtama(id_site);
    if (!r) throw new NotFoundException('Site ini belum terpetakan ke router NOCaaS');
    const baru = await this.nilaiNocaas(r);
    const target = await this.targetPerangkat(id_site, [r.ns_ip, r.un_ip], baru.serial_number);
    return {
      data: {
        router: r.nama_utama ?? r.site_key, live_at: r.live_at, sumber_map: r.sumber_map,
        peringatan: r.sumber_map === 'saran' ? 'Router ini dipetakan lewat SARAN otomatis — pastikan memang router site ini sebelum menyinkronkan.' : null,
        target: target ? { id_perangkat: target.id_perangkat, jenis: target.jenis_perangkat } : null,
        akan_dibuat: !target,
        baris: this.bandingkan(target, baru),
      },
    };
  }

  /** Terapkan sinkron satu site. timpa=true juga mengganti nilai yang berbeda (khusus pengelola). */
  async terapkan(id_site: number, timpa: boolean, u: UserRingkas) {
    if (timpa && !this.bolehKelola(u)) throw new ForbiddenException('Menimpa data yang sudah ada hanya untuk Admin / Director / Manager Ops');
    const r = await this.routerUtama(id_site);
    if (!r) throw new NotFoundException('Site ini belum terpetakan ke router NOCaaS');
    const baru = await this.nilaiNocaas(r);
    const target = await this.targetPerangkat(id_site, [r.ns_ip, r.un_ip], baru.serial_number);
    const beda = this.bandingkan(target, baru);
    const ubah: Record<string, string> = {};
    for (const b of beda) if (b.aksi === 'isi' || (timpa && b.aksi === 'beda')) ubah[b.kolom] = b.baru;
    if (!target) {
      const dibuat = await this.prisma.perangkatSite.create({
        data: { id_site, jenis_perangkat: 'Router', status_perangkat: 'Aktif', ...ubah, catatan: `Dibuat dari NOCaaS (${r.nama_utama ?? r.site_key})` },
      });
      this.logger.log(`Site ${id_site}: perangkat ${dibuat.id_perangkat} dibuat dari NOCaaS oleh user ${u.id_user}`);
      return { message: `Perangkat router dibuat dari data NOCaaS (${Object.keys(ubah).length} kolom)`, data: { diubah: Object.keys(ubah) } };
    }
    if (!Object.keys(ubah).length) return { message: 'Data perangkat sudah sesuai NOCaaS — tidak ada yang diubah', data: { diubah: [] } };
    await this.prisma.perangkatSite.update({ where: { id_perangkat: target.id_perangkat }, data: ubah });
    this.logger.log(`Site ${id_site}: perangkat ${target.id_perangkat} disinkron (${Object.keys(ubah).join(', ')}) oleh user ${u.id_user}`);
    return { message: `${Object.keys(ubah).length} kolom diperbarui dari NOCaaS`, data: { diubah: Object.keys(ubah) } };
  }

  /**
   * Sinkron massal — HANYA mengisi kolom kosong (tidak pernah menimpa), khusus pengelola.
   * mode 'pratinjau' menghitung saja; 'terapkan' menyimpan cadangan JSON baris lama lalu menulis.
   */
  async massal(mode: 'pratinjau' | 'terapkan', u: UserRingkas) {
    if (!this.bolehKelola(u)) throw new ForbiddenException('Sinkron massal hanya untuk Admin / Director / Manager Ops');
    if (mode !== 'pratinjau' && mode !== 'terapkan') throw new BadRequestException('Mode tidak dikenal');
    const sites = await this.prisma.nocaasRouter.findMany({ where: { id_site: { not: null }, sumber_map: { in: PETA_KUAT } }, select: { id_site: true }, distinct: ['id_site'] });
    const hitung: Record<string, number> = { site: 0, isi_kolom: 0, buat_perangkat: 0, beda_dilewati: 0 };
    const perKolom: Record<string, number> = {};
    const rencana: { id_site: number; id_perangkat: number | null; ubah: Record<string, string>; lama: any }[] = [];
    for (const { id_site } of sites) {
      const r = await this.routerUtama(id_site!);
      if (!r || !r.live_ringkas || !PETA_KUAT.includes(r.sumber_map ?? '')) continue;
      const baru = await this.nilaiNocaas(r);
      const target = await this.targetPerangkat(id_site!, [r.ns_ip, r.un_ip], baru.serial_number);
      const beda = this.bandingkan(target, baru);
      const ubah: Record<string, string> = {};
      for (const b of beda) {
        if (b.aksi === 'isi') { ubah[b.kolom] = b.baru; perKolom[b.kolom] = (perKolom[b.kolom] ?? 0) + 1; }
        if (b.aksi === 'beda') hitung.beda_dilewati++;
      }
      if (!Object.keys(ubah).length) continue;
      hitung.site++; hitung.isi_kolom += Object.keys(ubah).length;
      if (!target) hitung.buat_perangkat++;
      rencana.push({ id_site: id_site!, id_perangkat: target?.id_perangkat ?? null, ubah, lama: target });
    }
    if (mode === 'pratinjau') {
      return { data: { ...hitung, per_kolom: Object.entries(perKolom).map(([k, n]) => ({ kolom: k, label: LABEL[k as Kolom], n })), contoh: rencana.slice(0, 8).map((x) => ({ id_site: x.id_site, ubah: x.ubah, buat: !x.id_perangkat })) } };
    }
    // Cadangan baris lama sebelum menulis
    const dir = path.join(process.cwd(), 'storage', 'backup-sinkron-nocaas');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `sinkron-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(file, JSON.stringify({ oleh: u.id_user, at: new Date(), rencana }, null, 1));
    let ditulis = 0;
    for (let i = 0; i < rencana.length; i += 100) {
      const batch = rencana.slice(i, i + 100).map((x) => x.id_perangkat
        ? this.prisma.perangkatSite.update({ where: { id_perangkat: x.id_perangkat }, data: x.ubah })
        : this.prisma.perangkatSite.create({ data: { id_site: x.id_site, jenis_perangkat: 'Router', status_perangkat: 'Aktif', ...x.ubah, catatan: 'Dibuat dari NOCaaS (sinkron massal)' } }));
      await this.prisma.$transaction(batch);
      ditulis += batch.length;
    }
    this.logger.log(`Sinkron massal NOCaaS oleh user ${u.id_user}: ${ditulis} perangkat, cadangan ${file}`);
    return { message: `${hitung.site} site diperbarui (${hitung.isi_kolom} kolom terisi, ${hitung.buat_perangkat} perangkat baru)`, data: { ...hitung, cadangan: path.relative(process.cwd(), file) } };
  }
}
