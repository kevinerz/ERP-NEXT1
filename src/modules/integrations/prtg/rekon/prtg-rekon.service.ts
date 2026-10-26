import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
export class PrtgRekonService {
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

  async list() {
    this.assertEnabled();
    const [{ data: preview }, rekon] = await Promise.all([
      this.prtgService.getProvisionPreview(),
      this.prisma.prtgRekonsiliasi.findMany(),
    ]);
    const rekonByObjid = new Map(rekon.map((r) => [r.prtg_objid, r]));

    // id_site efektif: pilihan di halaman rekon > hasil match PRTG
    const siteIds = new Set<number>();
    for (const p of preview) {
      const id = rekonByObjid.get(p.objid)?.id_site ?? p.id_site;
      if (id) siteIds.add(id);
    }
    const sites = await this.prisma.sitePelanggan.findMany({
      where: { id_site: { in: [...siteIds] } },
      select: this.siteSelect,
    });
    const siteById = new Map(sites.map((s) => [s.id_site, s]));

    const data = preview.map((p) => {
      const r = rekonByObjid.get(p.objid) ?? null;
      const id_site = r?.id_site ?? p.id_site;
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
    return { data };
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
        data: { applied_at: new Date(), is_done: true, done_at: new Date() },
      }),
    ]);

    this.logger.log(
      `APPLY objid=${objid} PRTG "${namaPrtgSekarang}" → "${nama}"; site#${site.id_site} "${site.nama_site}" → "${nama}" ${JSON.stringify(siteData)}`,
    );
    return { data, message: 'Nama ERP & PRTG sudah diperbarui' };
  }
}
