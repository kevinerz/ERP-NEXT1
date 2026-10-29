import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrtgService } from '../prtg.service';
import { PrtgClient } from '../prtg.client';
import { SimpanRekonDto } from './rekon.dto';

/**
 * Rekonsiliasi sementara nama device PRTG ↔ site ERP.
 * Diakses dari halaman publik /rekon-prtg — dinyalakan lewat env PRTG_REKON_ENABLED=true.
 * Apply = rename device di PRTG + update site ERP + mapping manual ikut nama baru.
 */
@Injectable()
export class PrtgRekonService implements OnApplicationBootstrap {
  private readonly logger = new Logger('PrtgRekon');

  constructor(private prisma: PrismaService, private prtgService: PrtgService, private prtg: PrtgClient) {}

  private assertEnabled() {
    if (process.env.PRTG_REKON_ENABLED !== 'true') throw new NotFoundException();
  }

  private siteSelect = {
    id_site: true, kode_site: true, nama_site: true, kota: true, provinsi: true,
    alamat_lengkap: true, koordinat_gps: true, status_site: true,
    pelanggan: { select: { nama_pelanggan: true } },
  } as const;

  // Cache hasil getProvisionPreview (ambil PRTG + match ERP, bisa ±30 detik) di memori proses.
  // PM2 jalan 1 instance, jadi cukup in-memory; data rekon (DB) tetap selalu dibaca segar.
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000;
  private previewCache: { at: number; data: any[] } | null = null;
  private previewInflight: Promise<any[]> | null = null;

  // Pemanasan cache saat start (latar belakang, tidak menghambat startup) — hanya bila halaman rekon menyala
  onApplicationBootstrap() {
    if (process.env.PRTG_REKON_ENABLED !== 'true') return;
    setTimeout(() => {
      this.ambilPreview(true)
        .then(() => this.logger.log('Cache preview rekon terisi (pemanasan saat start)'))
        .catch((e) => this.logger.warn(`Pemanasan cache rekon gagal: ${e?.message ?? e}`));
    }, 5000);
  }

  // Stale-while-revalidate: cache basi tetap dipakai langsung, sambil diperbarui di latar belakang
  private segarkan(): Promise<any[]> {
    this.previewInflight ??= this.prtgService
      .getProvisionPreview()
      .then((r) => {
        this.previewCache = { at: Date.now(), data: r.data };
        return r.data;
      })
      .finally(() => { this.previewInflight = null; });
    return this.previewInflight;
  }

  private async ambilPreview(paksa: boolean): Promise<{ data: any[]; at: number; dariCache: boolean }> {
    const c = this.previewCache;
    if (!paksa && c) {
      if (Date.now() - c.at >= PrtgRekonService.CACHE_TTL_MS) {
        this.segarkan().catch((e) => this.logger.warn(`Penyegaran cache rekon gagal: ${e?.message ?? e}`));
      }
      return { data: c.data, at: c.at, dariCache: true };
    }
    const data = await this.segarkan();
    return { data, at: this.previewCache!.at, dariCache: false };
  }

  // id_site di baris rekon: angka = dipilih manual, 0 = sengaja dilepas dari site, null = belum diputuskan (pakai tebakan otomatis)
  private idSiteEfektif(r: { id_site: number | null } | null | undefined, otomatis: number | null): number | null {
    if (r && r.id_site !== null && r.id_site !== undefined) return r.id_site || null;
    return otomatis ?? null;
  }

  // Tebakan otomatis (nama/IP mirip) TIDAK dipasang ke site — hanya mapping manual yang dianggap terhubung.
  // Pencocokan dilakukan manual 1/1 lewat halaman rekon.
  private siteManual(p: { match_source: string | null; id_site: number | null }): number | null {
    return p.match_source === 'manual' ? p.id_site : null;
  }

  async list(refresh = false) {
    this.assertEnabled();
    const [{ data: preview, at, dariCache }, rekon] = await Promise.all([
      this.ambilPreview(refresh),
      this.prisma.prtgRekonsiliasi.findMany(),
    ]);
    const rekonByObjid = new Map(rekon.map((r) => [r.prtg_objid, r]));

    // id_site efektif: pilihan di halaman rekon > hasil match PRTG
    const siteIds = new Set<number>();
    for (const p of preview) {
      const id = this.idSiteEfektif(rekonByObjid.get(p.objid), this.siteManual(p));
      if (id) siteIds.add(id);
    }
    const sites = await this.prisma.sitePelanggan.findMany({
      where: { id_site: { in: [...siteIds] } },
      select: this.siteSelect,
    });
    const siteById = new Map(sites.map((s) => [s.id_site, s]));

    const data = preview.map((p) => {
      const r = rekonByObjid.get(p.objid) ?? null;
      const id_site = this.idSiteEfektif(r, this.siteManual(p));
      return {
        objid: p.objid,
        device_name: p.device_name,
        ip_address: p.ip_address,
        prtg_status: p.prtg_status,
        comments: p.comments,
        parsed_sn: p.parsed_sn,
        parsed_ip: p.parsed_ip,
        match_source: p.match_source,
        match_score: p.match_source === 'manual' ? 100 : p.match_score,
        site: id_site ? siteById.get(id_site) ?? null : null,
        rekon: r,
      };
    });
    return { data, meta: { cached_at: new Date(at).toISOString(), dari_cache: dariCache } };
  }

  async cariSite(q: string) {
    this.assertEnabled();
    const kata = (q || '').trim();
    const data = await this.prisma.sitePelanggan.findMany({
      where: kata ? { OR: [{ nama_site: { contains: kata } }, { kode_site: { contains: kata } }] } : {},
      select: this.siteSelect,
      orderBy: { nama_site: 'asc' },
      take: 30,
    });
    return { data };
  }

  // Semua site ERP (aktif & nonaktif) untuk tampilan per-site; filter dilakukan di klien
  async semuaSite() {
    this.assertEnabled();
    const data = await this.prisma.sitePelanggan.findMany({
      select: {
        id_site: true, kode_site: true, nama_site: true, kota: true, provinsi: true, status_site: true,
        pelanggan: { select: { nama_pelanggan: true } },
      },
      orderBy: { nama_site: 'asc' },
    });
    return { data };
  }

  private async deviceAwal(objid: number): Promise<string> {
    const d = (await this.prtg.getDevices()).find((x) => x.objid === objid);
    if (!d) throw new NotFoundException(`Device PRTG ${objid} tidak ditemukan`);
    return d.device;
  }

  async simpan(objid: number, { device_name, ...dto }: SimpanRekonDto) {
    this.assertEnabled();
    const ada = await this.prisma.prtgRekonsiliasi.findUnique({ where: { prtg_objid: objid } });
    const device_name_awal = ada?.device_name_awal ?? device_name ?? (await this.deviceAwal(objid));
    const data = await this.prisma.prtgRekonsiliasi.upsert({
      where: { prtg_objid: objid },
      create: { prtg_objid: objid, device_name_awal, ...dto },
      update: { ...dto },
    });
    return { data, message: 'Draft tersimpan' };
  }

  async toggleDone(objid: number, done: boolean, device_name?: string) {
    this.assertEnabled();
    const ada = await this.prisma.prtgRekonsiliasi.findUnique({ where: { prtg_objid: objid } });
    const device_name_awal = ada?.device_name_awal ?? device_name ?? (await this.deviceAwal(objid));
    const data = await this.prisma.prtgRekonsiliasi.upsert({
      where: { prtg_objid: objid },
      create: { prtg_objid: objid, device_name_awal, is_done: done, done_at: done ? new Date() : null },
      update: { is_done: done, done_at: done ? new Date() : null },
    });
    return { data, message: done ? 'Ditandai selesai' : 'Tanda selesai dibatalkan' };
  }

  async apply(objid: number, dto: SimpanRekonDto) {
    this.assertEnabled();
    const { data: row } = await this.simpan(objid, dto);
    const nama = row.nama_baru?.trim();
    if (!nama) throw new BadRequestException('Nama baru wajib diisi');
    if (!row.id_site) throw new BadRequestException('Pilih site ERP dulu');

    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: row.id_site } });
    if (!site) throw new NotFoundException('Site ERP tidak ditemukan');

    // 1) PRTG dulu — kalau gagal, ERP tidak diubah sama sekali
    const namaPrtgSekarang = await this.deviceAwal(objid);
    if (namaPrtgSekarang !== nama) await this.prtg.renameObject(objid, nama);

    // 2) ERP: site + mapping manual ikut nama baru (poll & cariSite berbasis device_name)
    // Snapshot data site sebelum ditimpa (hanya apply pertama, supaya bisa dikembalikan)
    const siteAwal = row.site_awal ?? {
      id_site: site.id_site,
      nama_site: site.nama_site,
      kota: site.kota,
      provinsi: site.provinsi,
      alamat_lengkap: site.alamat_lengkap,
      koordinat_gps: site.koordinat_gps,
    };
    const siteData: Record<string, string> = { nama_site: nama };
    for (const k of ['kota', 'provinsi', 'alamat_lengkap', 'koordinat_gps'] as const) {
      const v = row[k]?.trim();
      if (v) siteData[k] = v;
    }
    const [, , , data] = await this.prisma.$transaction([
      this.prisma.sitePelanggan.update({ where: { id_site: site.id_site }, data: siteData }),
      this.prisma.integrationPrtgMapping.deleteMany({
        where: { device_name: { in: [namaPrtgSekarang, row.device_name_awal] }, NOT: { device_name: nama } },
      }),
      this.prisma.integrationPrtgMapping.upsert({
        where: { device_name: nama },
        create: { device_name: nama, id_site: site.id_site },
        update: { id_site: site.id_site },
      }),
      this.prisma.prtgRekonsiliasi.update({
        where: { prtg_objid: objid },
        data: { site_awal: siteAwal, applied_at: new Date(), is_done: true, done_at: new Date() },
      }),
    ]);

    // Jaga cache tetap benar tanpa ambil ulang dari PRTG
    const cached = this.previewCache?.data.find((d) => d.objid === objid);
    if (cached) Object.assign(cached, { device_name: nama, id_site: site.id_site, match_source: 'manual', match_score: 100 });

    this.logger.log(
      `APPLY objid=${objid} PRTG "${namaPrtgSekarang}" → "${nama}"; site#${site.id_site} "${site.nama_site}" → "${nama}" ${JSON.stringify(siteData)} awal=${JSON.stringify(siteAwal)}`,
    );
    return { data, message: 'Nama ERP & PRTG sudah diperbarui' };
  }

  /**
   * Mode per-site, nama "lurus": device PRTG bernama persis `nama site` atau `nama site - keterangan`
   * (keterangan bebas: Router, Modem, Switch, Mikrotik, ...). Satu site boleh punya banyak device.
   * namaSiteBaru berbeda dari nama_site → nama site ERP ikut diubah, dan device lain milik site ini
   * yang sudah lurus ikut di-rename di PRTG supaya tetap sama. Kondisi site sebelumnya disimpan di site_awal.
   */
  async terapkanNama(objid: number, id_site: number, namaTarget: string, namaSiteBaru?: string) {
    this.assertEnabled();
    const nama = (namaTarget || '').trim();
    if (!nama) throw new BadRequestException('Nama di PRTG wajib diisi');
    if (nama.length > 150) throw new BadRequestException('Nama maksimal 150 karakter');

    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site } });
    if (!site) throw new NotFoundException('Site ERP tidak ditemukan');

    const lama = site.nama_site;
    const base = (namaSiteBaru ?? '').trim() || lama;
    if (base.length > 150) throw new BadRequestException('Nama site maksimal 150 karakter');
    const ubahNamaSite = base !== lama;

    // Nama PRTG wajib lurus terhadap nama site
    const ket = nama === base ? '' : nama.startsWith(base + ' - ') ? nama.slice(base.length + 3).trim() : null;
    if (ket === null) throw new BadRequestException(`Nama PRTG harus "${base}" atau "${base} - keterangan"`);
    if (nama !== base && !ket) throw new BadRequestException('Keterangan setelah " - " wajib diisi');

    const namaSekarang = await this.deviceAwal(objid);
    const ada = await this.prisma.prtgRekonsiliasi.findUnique({ where: { prtg_objid: objid } });
    const awal = ada?.device_name_awal ?? namaSekarang;
    const cache = this.previewCache?.data ?? [];

    // Device lain milik site ini yang ikut di-rename bila nama site berubah
    const ikut: { objid: number; dari: string; ke: string; awal: string }[] = [];
    const dilewati: string[] = [];
    if (ubahNamaSite) {
      const mappings = await this.prisma.integrationPrtgMapping.findMany({ where: { id_site } });
      for (const m of mappings) {
        if (m.device_name === namaSekarang || m.device_name === awal) continue;
        const dev = cache.find((d) => d.device_name === m.device_name);
        if (!dev || dev.objid === objid) { if (!dev) dilewati.push(m.device_name); continue; }
        if (m.device_name.startsWith(lama + ' - ')) {
          ikut.push({ objid: dev.objid, dari: m.device_name, ke: base + m.device_name.slice(lama.length), awal: m.device_name });
        } else {
          dilewati.push(m.device_name); // belum lurus / sama persis dengan nama site lama → atur manual
        }
      }
    }

    // Semua nama baru harus unik di PRTG (mapping ERP berbasis nama device)
    const sedangDiubah = new Set([objid, ...ikut.map((x) => x.objid)]);
    for (const n of [nama, ...ikut.map((x) => x.ke)]) {
      const kembar = cache.find((d) => !sedangDiubah.has(d.objid) && d.device_name === n);
      if (kembar) throw new BadRequestException(`Nama "${n}" sudah dipakai device PRTG lain (#${kembar.objid})`);
    }
    if (ikut.some((x) => x.ke === nama)) throw new BadRequestException(`Nama "${nama}" bentrok dengan device lain di site ini`);

    // 1) PRTG dulu — device utama gagal → tidak ada yang diubah sama sekali
    if (namaSekarang !== nama) await this.prtg.renameObject(objid, nama);
    const sukses: typeof ikut = [];
    const gagal: string[] = [];
    for (const x of ikut) {
      try {
        await this.prtg.renameObject(x.objid, x.ke);
        sukses.push(x);
      } catch (e: any) {
        gagal.push(`${x.dari} (${e?.message ?? e})`);
      }
    }

    // 2) ERP dalam satu transaksi: mapping + catatan rekon (+ nama site)
    const siteAwal = ubahNamaSite && !ada?.site_awal
      ? { id_site: site.id_site, nama_site: lama, kota: site.kota, provinsi: site.provinsi, alamat_lengkap: site.alamat_lengkap, koordinat_gps: site.koordinat_gps }
      : undefined;
    const waktu = new Date();
    const rekonData = { id_site, nama_baru: nama, applied_at: waktu, is_done: true, done_at: waktu, ...(siteAwal ? { site_awal: siteAwal } : {}) };
    const ops: any[] = [
      this.prisma.integrationPrtgMapping.deleteMany({
        where: { device_name: { in: [namaSekarang, awal] }, NOT: { device_name: nama } },
      }),
      this.prisma.integrationPrtgMapping.upsert({
        where: { device_name: nama },
        create: { device_name: nama, id_site },
        update: { id_site },
      }),
      this.prisma.prtgRekonsiliasi.upsert({
        where: { prtg_objid: objid },
        create: { prtg_objid: objid, device_name_awal: awal, ...rekonData },
        update: rekonData,
      }),
    ];
    for (const x of sukses) {
      ops.push(
        this.prisma.integrationPrtgMapping.deleteMany({ where: { device_name: x.dari } }),
        this.prisma.integrationPrtgMapping.upsert({
          where: { device_name: x.ke },
          create: { device_name: x.ke, id_site },
          update: { id_site },
        }),
        this.prisma.prtgRekonsiliasi.upsert({
          where: { prtg_objid: x.objid },
          create: { prtg_objid: x.objid, device_name_awal: x.awal, id_site, nama_baru: x.ke, applied_at: waktu, is_done: true, done_at: waktu },
          update: { id_site, nama_baru: x.ke, applied_at: waktu, is_done: true, done_at: waktu },
        }),
      );
    }
    if (ubahNamaSite) ops.push(this.prisma.sitePelanggan.update({ where: { id_site }, data: { nama_site: base } }));
    const hasil = await this.prisma.$transaction(ops);
    const data = hasil[2];

    for (const [oid, n] of [[objid, nama], ...sukses.map((x) => [x.objid, x.ke])] as [number, string][]) {
      const c = cache.find((d) => d.objid === oid);
      if (c) Object.assign(c, { device_name: n, id_site, match_source: 'manual', match_score: 100 });
    }

    const ketERP = ubahNamaSite ? `nama_site ERP '${lama}' -> '${base}', ikut rename ${sukses.length}, gagal ${gagal.length}` : 'nama site ERP tetap';
    this.logger.log(`TERAPKAN objid=${objid} PRTG '${namaSekarang}' -> '${nama}'; site#${id_site}; ${ketERP}`);

    let message = ubahNamaSite ? 'Nama PRTG dan nama site ERP sudah diperbarui' : 'Nama device PRTG sudah diperbarui';
    if (sukses.length) message += `; ${sukses.length} device lain ikut di-rename`;
    if (gagal.length) message += `; ${gagal.length} device gagal di-rename, cek manual`;
    if (dilewati.length) message += `; ${dilewati.length} device belum lurus, atur manual`;
    return {
      data,
      message,
      meta: {
        nama_site: base,
        ikut_rename: sukses.map((x) => ({ objid: x.objid, dari: x.dari, ke: x.ke })),
        gagal,
        dilewati,
      },
    };
  }
}
