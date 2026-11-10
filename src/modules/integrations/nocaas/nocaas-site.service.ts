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
    // Router paling relevan di depan: yang hidup & ber-config dulu, yang mati lama di belakang
    const PERINGKAT: Record<string, number> = { online: 0, partial: 1, internet_ok: 1, offline: 2 };
    routers.sort((a, b) => (PERINGKAT[a.status] ?? 3) - (PERINGKAT[b.status] ?? 3) || (b.live_at?.getTime() ?? 0) - (a.live_at?.getTime() ?? 0));
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

  // ─── Catat perangkat site sebagai aset (modul Aset) ─────────────────────────────
  /**
   * Perangkat site yang punya serial number tapi belum tertaut aset → dibuatkan aset berstatus Terpasang
   * di site itu (atau ditautkan ke aset ber-SN sama yang sudah ada). Perangkat tanpa SN & site Dismantle dilewati.
   */
  async catatAset(mode: 'pratinjau' | 'terapkan', u: UserRingkas, id_site?: number) {
    if (!this.bolehKelola(u)) throw new ForbiddenException('Pencatatan aset hanya untuk Admin / Director / Manager Ops');
    const rows = await this.prisma.perangkatSite.findMany({
      where: { id_aset: null, serial_number: { not: null }, ...(id_site ? { id_site } : {}) },
      include: { site: { select: { nama_site: true, status_site: true } } },
      orderBy: { id_perangkat: 'asc' },
    });
    const calon = rows.filter((p) => (p.serial_number ?? '').trim());
    const dismantle = calon.filter((p) => p.site?.status_site === 'Dismantle').length;
    const aktif = calon.filter((p) => p.site?.status_site !== 'Dismantle');
    const snSemua = [...new Set(aktif.map((p) => p.serial_number!.trim().toUpperCase()))];
    const ada = await this.prisma.gudangAset.findMany({ where: { serial_number: { in: snSemua } }, select: { id_aset: true, kode_aset: true, serial_number: true, status_aset: true, id_site: true } });
    const adaBySn = new Map(ada.map((a) => [a.serial_number!.toUpperCase(), a]));
    const dipakai = new Set<string>();
    const buat: typeof aktif = [], tautkan: { p: (typeof aktif)[number]; a: (typeof ada)[number] }[] = [];
    let snGanda = 0;
    // SN sama dengan aset yang masih tercatat di gudang / di site lain → tidak diubah otomatis (stok gudang
    // bisa salah atau SN salah ketik) — dilaporkan untuk dicek manual
    const konflik: { id_perangkat: number; site: string; kode_aset: string; status_aset: string }[] = [];
    for (const p of aktif) {
      const sn = p.serial_number!.trim().toUpperCase();
      if (dipakai.has(sn)) { snGanda++; continue; }
      dipakai.add(sn);
      const a = adaBySn.get(sn);
      if (!a) buat.push(p);
      else if (a.status_aset === 'Terpasang' && (a.id_site == null || a.id_site === p.id_site)) tautkan.push({ p, a });
      else konflik.push({ id_perangkat: p.id_perangkat, site: p.site?.nama_site ?? String(p.id_site), kode_aset: (a as any).kode_aset, status_aset: a.status_aset });
    }
    const ringkas = { aset_baru: buat.length, ditautkan: tautkan.length, dilewati_dismantle: dismantle, dilewati_sn_ganda: snGanda, konflik, tanpa_sn: id_site ? undefined : await this.prisma.perangkatSite.count({ where: { id_aset: null, OR: [{ serial_number: null }, { serial_number: '' }] } }) };
    if (mode === 'pratinjau') {
      const perKategori: Record<string, number> = {};
      for (const p of buat) { const k = this.kategoriAset(p.jenis_perangkat); perKategori[k] = (perKategori[k] ?? 0) + 1; }
      return { data: { ...ringkas, per_kategori: Object.entries(perKategori).map(([k, n]) => ({ kategori: k, n })) } };
    }

    // Cadangan dulu
    const dir = path.join(process.cwd(), 'storage', 'backup-sinkron-nocaas');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `catat-aset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(file, JSON.stringify({ oleh: u.id_user, at: new Date(), buat: buat.map((p) => p.id_perangkat), tautkan: tautkan.map((x) => ({ id_perangkat: x.p.id_perangkat, id_aset: x.a.id_aset, status_lama: x.a.status_aset, site_lama: x.a.id_site })) }, null, 1));

    // Aset ber-SN sama yang sudah ada → tautkan & samakan lokasinya dengan site
    for (const { p, a } of tautkan) {
      await this.prisma.$transaction([
        this.prisma.perangkatSite.update({ where: { id_perangkat: p.id_perangkat }, data: { id_aset: a.id_aset } }),
        this.prisma.gudangAset.update({ where: { id_aset: a.id_aset }, data: { status_aset: 'Terpasang', id_site: p.id_site, id_gudang: null } }),
        this.prisma.gudangMutasiAset.create({ data: {
          id_aset: a.id_aset, jenis_mutasi: 'Deploy', id_site_asal: a.id_site, id_site_tujuan: p.id_site, id_user: u.id_user,
          keterangan: `Disesuaikan dengan data perangkat site ${p.site?.nama_site ?? p.id_site}`,
        } }),
      ]);
    }

    // Aset baru — kode AST-YYYYMM-XXXX berurutan, per batch 50
    const now = new Date();
    const prefix = `AST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    let dibuat = 0;
    for (let i = 0; i < buat.length; i += 50) {
      const batch = buat.slice(i, i + 50);
      await this.prisma.$transaction(async (tx) => {
        const last = await tx.gudangAset.findFirst({ where: { kode_aset: { startsWith: prefix } }, orderBy: { kode_aset: 'desc' }, select: { kode_aset: true } });
        let seq = last ? (parseInt(last.kode_aset.split('-')[2], 10) || 0) : 0;
        for (const p of batch) {
          seq++;
          const merk = p.merk?.trim() || null, tipe = p.tipe_model?.trim() || null;
          const aset = await tx.gudangAset.create({ data: {
            kode_aset: `${prefix}-${String(seq).padStart(4, '0')}`,
            nama_perangkat: ([merk, tipe].filter(Boolean).join(' ') || p.jenis_perangkat).slice(0, 150),
            merk, tipe_model: tipe, serial_number: p.serial_number!.trim(), is_serialized: true, stok_jumlah: 1,
            kategori: this.kategoriAset(p.jenis_perangkat), kondisi: 'Baik', status_aset: 'Terpasang',
            id_site: p.id_site, tgl_perolehan: p.tgl_pasang ?? undefined,
            catatan: 'Dicatat dari data perangkat site (NOCaaS / lapangan)',
          } });
          await tx.gudangMutasiAset.create({ data: {
            id_aset: aset.id_aset, jenis_mutasi: 'Deploy', id_site_tujuan: p.id_site, id_user: u.id_user,
            keterangan: `Pencatatan awal aset terpasang di ${p.site?.nama_site ?? `site ${p.id_site}`}`,
          } });
          await tx.perangkatSite.update({ where: { id_perangkat: p.id_perangkat }, data: { id_aset: aset.id_aset } });
          dibuat++;
        }
      }, { timeout: 60_000 });
    }
    this.logger.log(`Catat aset oleh user ${u.id_user}: ${dibuat} baru, ${tautkan.length} ditautkan, cadangan ${file}`);
    return {
      message: `${dibuat} aset baru dicatat${tautkan.length ? `, ${tautkan.length} ditautkan ke aset yang sudah ada` : ''}`,
      data: { ...ringkas, aset_baru: dibuat, cadangan: path.relative(process.cwd(), file) },
    };
  }

  private kategoriAset(jenis: string) {
    return /modem/i.test(jenis) ? 'MODEM' : /sim/i.test(jenis) ? 'SIM' : 'Router';
  }
}
