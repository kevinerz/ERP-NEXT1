import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { UPLOAD_ROOT } from '../../common/upload/upload-root';
import { CatatanDto, DokumenDto, LinkDto, OrderOpsDto, OrderSalesDto, PutusanDto, SphDto } from './dto';

export interface Pengguna { id_karyawan: number; roles: string[] }

// Urutan tahap order PB. Draft = SPH belum disetujui Director.
export const TAHAP = ['Draft', 'Sales', 'OPS', 'Instalasi', 'NOC', 'Finance', 'Aktif'] as const;
// Role yang memegang tiap tahap (Admin & Director selalu boleh)
const PEMEGANG: Record<string, string[]> = {
  Draft: ['Sales'],
  Sales: ['Sales'],
  OPS: ['Manager_Ops'],
  Instalasi: ['Manager_Ops', 'Teknisi'],
  NOC: ['Helpdesk', 'Manager_Ops'],
  Finance: ['Finance'],
};
const SEMUA_TAHAP = ['Admin', 'Director'];
const EXT_DOKUMEN: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

@Injectable()
export class PasangBaruService {
  private readonly logger = new Logger('PasangBaru');
  constructor(private prisma: PrismaService) {}

  // ── Hak akses ────────────────────────────────────────────────────────────────
  private boleh(u: Pengguna, tahap: string) {
    return u.roles.some((r) => SEMUA_TAHAP.includes(r) || (PEMEGANG[tahap] ?? []).includes(r));
  }
  private wajib(u: Pengguna, tahap: string) {
    if (!this.boleh(u, tahap)) throw new ForbiddenException(`Tahap ${tahap} hanya bisa diubah oleh ${(PEMEGANG[tahap] ?? []).join('/') || 'Admin'}`);
  }
  private director(u: Pengguna) {
    return u.roles.some((r) => SEMUA_TAHAP.includes(r));
  }

  // ── Referensi ────────────────────────────────────────────────────────────────
  async referensi() {
    const [layanan, vendor] = await Promise.all([
      this.prisma.masterLayanan.findMany({ where: { is_aktif: true }, select: { id_layanan: true, nama_layanan: true }, orderBy: { nama_layanan: 'asc' } }),
      this.prisma.masterVendorIsp.findMany({ where: { is_aktif: true }, select: { id_vendor: true, nama_vendor: true, tipe_vendor: true }, orderBy: { nama_vendor: 'asc' } }),
    ]);
    return { layanan, vendor };
  }

  cariPelanggan(q: string) {
    const kata = (q || '').trim();
    return this.prisma.pelanggan.findMany({
      where: kata ? { OR: [{ nama_pelanggan: { contains: kata } }, { kode_pelanggan: { contains: kata } }] } : {},
      select: { id_pelanggan: true, kode_pelanggan: true, nama_pelanggan: true, nama_pic_utama: true, no_hp_pic_utama: true, email_billing: true },
      orderBy: { nama_pelanggan: 'asc' },
      take: 20,
    });
  }

  // ── Ringkasan & daftar ───────────────────────────────────────────────────────
  async ringkas() {
    const [tahap, sph] = await Promise.all([
      this.prisma.pbOrder.groupBy({ by: ['tahap'], _count: { _all: true } }),
      this.prisma.pbSph.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      tahap: Object.fromEntries(tahap.map((t) => [t.tahap, t._count._all])),
      sph: Object.fromEntries(sph.map((s) => [s.status, s._count._all])),
    };
  }

  async daftarOrder(q: { tahap?: string; cari?: string; id_sph?: string }) {
    const kata = (q.cari || '').trim();
    const where: Prisma.PbOrderWhereInput = {
      ...(q.tahap ? { tahap: q.tahap } : { tahap: { notIn: ['Draft', 'Batal'] } }),
      ...(q.id_sph ? { id_sph: Number(q.id_sph) } : {}),
      ...(kata ? {
        OR: [
          { nama_site: { contains: kata } }, { nomor_pb: { contains: kata } }, { kota: { contains: kata } },
          { sph: { nomor_sph: { contains: kata } } }, { sph: { pelanggan: { nama_pelanggan: { contains: kata } } } },
        ],
      } : {}),
    };
    const rows = await this.prisma.pbOrder.findMany({
      where,
      include: {
        sph: { select: { nomor_sph: true, pelanggan: { select: { nama_pelanggan: true } } } },
        layanan: { select: { nama_layanan: true } },
        site: { select: { kode_site: true } },
      },
      orderBy: [{ tahap_at: 'asc' }],
      take: 500,
    });
    return rows;
  }

  async daftarSph(q: { status?: string; cari?: string }) {
    const kata = (q.cari || '').trim();
    const rows = await this.prisma.pbSph.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(kata ? { OR: [{ nomor_sph: { contains: kata } }, { pelanggan: { nama_pelanggan: { contains: kata } } }] } : {}),
      },
      include: {
        pelanggan: { select: { nama_pelanggan: true } },
        order: { select: { biaya_bulanan: true, tahap: true } },
      },
      orderBy: { updated_at: 'desc' },
      take: 300,
    });
    const nama = await this.namaKaryawan(rows.map((r) => r.id_sales));
    return rows.map(({ order, ...r }) => ({
      ...r,
      sales: r.id_sales ? nama.get(r.id_sales) ?? null : null,
      jumlah_site: order.length,
      total_bulanan: order.reduce((a, o) => a + Number(o.biaya_bulanan), 0),
    }));
  }

  // ── SPH ──────────────────────────────────────────────────────────────────────
  async detailSph(id_sph: number) {
    const s = await this.prisma.pbSph.findUnique({
      where: { id_sph },
      include: {
        pelanggan: { select: { id_pelanggan: true, kode_pelanggan: true, nama_pelanggan: true, alamat_kantor: true } },
        order: { include: { layanan: { select: { nama_layanan: true } } }, orderBy: [{ urutan: 'asc' }, { id_pb: 'asc' }] },
      },
    });
    if (!s) throw new NotFoundException('SPH tidak ditemukan');
    const riwayat = await this.prisma.pbRiwayat.findMany({ where: { id_sph, id_pb: null }, orderBy: { created_at: 'desc' } });
    const nama = await this.namaKaryawan([s.id_sales, s.id_approver, ...riwayat.map((r) => r.id_karyawan)]);
    return {
      ...s,
      sales: s.id_sales ? nama.get(s.id_sales) ?? null : null,
      approver: s.id_approver ? nama.get(s.id_approver) ?? null : null,
      riwayat: riwayat.map((r) => ({ ...r, oleh: r.id_karyawan ? nama.get(r.id_karyawan) ?? null : null })),
    };
  }

  async buatSph(u: Pengguna, dto: SphDto) {
    this.wajib(u, 'Draft');
    const id_pelanggan = await this.pelangganDariDto(dto);
    for (let coba = 0; ; coba++) {
      const nomor_sph = await this.nomorSph();
      try {
        const s = await this.prisma.pbSph.create({
          data: {
            nomor_sph, id_pelanggan, nama_pic: dto.nama_pic.trim(), telp_pic: dto.telp_pic?.trim() || null,
            email_pic: dto.email_pic?.trim() || null, durasi_bulan: dto.durasi_bulan, catatan: dto.catatan?.trim() || null,
            id_sales: u.id_karyawan,
            order: { create: dto.site.map((x, i) => this.dataBaris(x, i)) },
          },
        });
        await this.catat({ id_sph: s.id_sph, id_karyawan: u.id_karyawan, aksi: 'buat', catatan: `${dto.site.length} site` });
        return { data: s, message: `SPH ${nomor_sph} dibuat` };
      } catch (e) {
        if (coba < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  async ubahSph(u: Pengguna, id_sph: number, dto: SphDto) {
    this.wajib(u, 'Draft');
    const s = await this.prisma.pbSph.findUnique({ where: { id_sph } });
    if (!s) throw new NotFoundException('SPH tidak ditemukan');
    if (!['Draft', 'Ditolak'].includes(s.status)) throw new BadRequestException(`SPH sudah ${s.status} — tidak bisa diubah`);
    const id_pelanggan = await this.pelangganDariDto(dto);
    await this.prisma.$transaction([
      this.prisma.pbOrder.deleteMany({ where: { id_sph } }),
      this.prisma.pbSph.update({
        where: { id_sph },
        data: {
          id_pelanggan, nama_pic: dto.nama_pic.trim(), telp_pic: dto.telp_pic?.trim() || null, email_pic: dto.email_pic?.trim() || null,
          durasi_bulan: dto.durasi_bulan, catatan: dto.catatan?.trim() || null, status: 'Draft',
          order: { create: dto.site.map((x, i) => this.dataBaris(x, i)) },
        },
      }),
    ]);
    await this.catat({ id_sph, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: `${dto.site.length} site` });
    return { data: await this.detailSph(id_sph), message: 'SPH disimpan' };
  }

  async hapusSph(u: Pengguna, id_sph: number) {
    this.wajib(u, 'Draft');
    const s = await this.prisma.pbSph.findUnique({ where: { id_sph } });
    if (!s) throw new NotFoundException('SPH tidak ditemukan');
    if (!['Draft', 'Ditolak'].includes(s.status)) throw new BadRequestException('SPH yang sudah diajukan/disetujui tidak bisa dihapus');
    await this.prisma.pbSph.delete({ where: { id_sph } });
    await this.prisma.pbRiwayat.deleteMany({ where: { id_sph } });
    return { message: `SPH ${s.nomor_sph} dihapus` };
  }

  async ajukanSph(u: Pengguna, id_sph: number) {
    this.wajib(u, 'Draft');
    const s = await this.prisma.pbSph.findUnique({ where: { id_sph }, include: { pelanggan: true, _count: { select: { order: true } } } });
    if (!s) throw new NotFoundException('SPH tidak ditemukan');
    if (!['Draft', 'Ditolak'].includes(s.status)) throw new BadRequestException(`SPH sudah ${s.status}`);
    if (!s._count.order) throw new BadRequestException('SPH belum berisi site');
    await this.prisma.pbSph.update({ where: { id_sph }, data: { status: 'Menunggu Director', catatan_approval: null } });
    await this.catat({ id_sph, id_karyawan: u.id_karyawan, aksi: 'ajukan' });
    await this.beriTahuRole(['Director'], {
      tipe: 'pb_sph_approval', judul: 'SPH menunggu persetujuan',
      deskripsi: `${s.nomor_sph} · ${s.pelanggan.nama_pelanggan} · ${s._count.order} site`, url: `/pasang-baru/sph/${id_sph}`,
    });
    return { message: 'SPH diajukan ke Director' };
  }

  /** Director menyetujui/menolak. Disetujui → tiap baris jadi order PB + site (Prospek) + PIC store. */
  async putuskanSph(u: Pengguna, id_sph: number, dto: PutusanDto) {
    if (!this.director(u)) throw new ForbiddenException('Hanya Director yang bisa menyetujui SPH');
    const s = await this.prisma.pbSph.findUnique({ where: { id_sph }, include: { pelanggan: true, order: { orderBy: [{ urutan: 'asc' }, { id_pb: 'asc' }] } } });
    if (!s) throw new NotFoundException('SPH tidak ditemukan');
    if (s.status !== 'Menunggu Director') throw new BadRequestException(`SPH berstatus ${s.status}, bukan menunggu persetujuan`);

    if (!dto.setuju) {
      if (!dto.catatan?.trim()) throw new BadRequestException('Isi alasan penolakan');
      await this.prisma.pbSph.update({
        where: { id_sph },
        data: { status: 'Ditolak', id_approver: u.id_karyawan, tgl_approval: new Date(), catatan_approval: dto.catatan.trim() },
      });
      await this.catat({ id_sph, id_karyawan: u.id_karyawan, aksi: 'tolak', catatan: dto.catatan.trim() });
      if (s.id_sales) await this.beriTahu([s.id_sales], { tipe: 'pb_sph_ditolak', judul: 'SPH ditolak Director', deskripsi: `${s.nomor_sph}: ${dto.catatan.trim()}`, url: `/pasang-baru/sph/${id_sph}` });
      return { message: 'SPH ditolak' };
    }

    const sekarang = new Date();
    const prefix = await this.prefixSite(s.id_pelanggan, s.pelanggan.nama_pelanggan);
    let urutKode = await this.nomorSiteTerakhir(prefix);
    let urutPb = await this.nomorPbTerakhir();
    const yy = String(sekarang.getFullYear()).slice(2);
    await this.prisma.$transaction(async (tx) => {
      for (const o of s.order) {
        const kode_site = `${prefix}-${String(++urutKode).padStart(4, '0')}`;
        const alamat_lengkap = o.lantai_unit ? `${o.alamat} — ${o.lantai_unit}` : o.alamat;
        const site = await tx.sitePelanggan.create({
          data: {
            id_pelanggan: s.id_pelanggan, id_layanan: o.id_layanan, kode_site, nama_site: o.nama_site, alamat_lengkap,
            kota: o.kota, status_site: 'Prospek', catatan: `[Pasang Baru] ${s.nomor_sph}`,
          },
        });
        if (o.pic_store_nama) {
          await tx.picSite.create({ data: { id_site: site.id_site, nama_pic: o.pic_store_nama, no_kontak: o.pic_store_hp, jabatan: 'PIC Store', is_utama: true } });
        }
        await tx.pbOrder.update({
          where: { id_pb: o.id_pb },
          data: { id_site: site.id_site, nomor_pb: `PB-${yy}-${String(++urutPb).padStart(4, '0')}`, tahap: 'Sales', tahap_at: sekarang },
        });
      }
      await tx.pbSph.update({
        where: { id_sph },
        data: { status: 'Disetujui', id_approver: u.id_karyawan, tgl_approval: sekarang, catatan_approval: dto.catatan?.trim() || null },
      });
    });
    await this.catat({ id_sph, id_karyawan: u.id_karyawan, aksi: 'setujui', catatan: dto.catatan?.trim() || null });
    await this.prisma.pbRiwayat.createMany({
      data: s.order.map((o) => ({ id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi: 'setujui', dari_tahap: 'Draft', ke_tahap: 'Sales', catatan: 'SPH disetujui Director' })),
    });
    if (s.id_sales) {
      await this.beriTahu([s.id_sales], {
        tipe: 'pb_sph_disetujui', judul: 'SPH disetujui Director',
        deskripsi: `${s.nomor_sph} · ${s.order.length} site — lengkapi FAB tiap site`, url: `/pasang-baru/sph/${id_sph}`,
      });
    }
    return { message: `SPH disetujui — ${s.order.length} order pasang baru dibuat` };
  }

  // ── Order PB ─────────────────────────────────────────────────────────────────
  async detailOrder(u: Pengguna, id_pb: number) {
    const o = await this.prisma.pbOrder.findUnique({
      where: { id_pb },
      include: {
        sph: { include: { pelanggan: { select: { id_pelanggan: true, kode_pelanggan: true, nama_pelanggan: true } } } },
        layanan: { select: { id_layanan: true, nama_layanan: true } },
        site: {
          select: {
            id_site: true, kode_site: true, nama_site: true, status_site: true,
            sumber_internet: { include: { vendor: { select: { nama_vendor: true } } }, orderBy: { id_sumber: 'asc' } },
            dokumen: { orderBy: { created_at: 'desc' } },
          },
        },
      },
    });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    const riwayat = await this.prisma.pbRiwayat.findMany({ where: { id_pb }, orderBy: { created_at: 'desc' } });
    const nama = await this.namaKaryawan([o.sph.id_sales, ...riwayat.map((r) => r.id_karyawan)]);
    const tahapBoleh = Object.keys(PEMEGANG).filter((t) => this.boleh(u, t));
    return {
      ...o,
      sales: o.sph.id_sales ? nama.get(o.sph.id_sales) ?? null : null,
      riwayat: riwayat.map((r) => ({ ...r, oleh: r.id_karyawan ? nama.get(r.id_karyawan) ?? null : null })),
      hak: { tahap: tahapBoleh, director: this.director(u) },
      syarat: await this.syarat(o),
    };
  }

  async ubahSales(u: Pengguna, id_pb: number, dto: OrderSalesDto) {
    const o = await this.orderDiTahap(u, id_pb, 'Sales');
    const data: Prisma.PbOrderUpdateInput = {
      ...(dto.nama_site !== undefined ? { nama_site: dto.nama_site.trim() } : {}),
      ...(dto.alamat !== undefined ? { alamat: dto.alamat.trim() } : {}),
      ...(dto.lantai_unit !== undefined ? { lantai_unit: dto.lantai_unit.trim() || null } : {}),
      ...(dto.kota !== undefined ? { kota: dto.kota.trim() || null } : {}),
      ...(dto.tgl_rfs !== undefined ? { tgl_rfs: dto.tgl_rfs ? new Date(dto.tgl_rfs) : null } : {}),
      ...(dto.pic_store_nama !== undefined ? { pic_store_nama: dto.pic_store_nama.trim() || null } : {}),
      ...(dto.pic_store_hp !== undefined ? { pic_store_hp: dto.pic_store_hp.trim() || null } : {}),
    };
    const baru = await this.prisma.pbOrder.update({ where: { id_pb }, data });
    // Data site ikut diperbarui supaya tidak berbeda dengan order
    if (o.id_site) {
      await this.prisma.sitePelanggan.update({
        where: { id_site: o.id_site },
        data: { nama_site: baru.nama_site, alamat_lengkap: baru.lantai_unit ? `${baru.alamat} — ${baru.lantai_unit}` : baru.alamat, kota: baru.kota },
      });
      if (dto.pic_store_nama !== undefined || dto.pic_store_hp !== undefined) await this.sinkronPicStore(o.id_site, baru.pic_store_nama, baru.pic_store_hp);
    }
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: 'Data sales' });
    return { message: 'Data sales disimpan' };
  }

  async ubahOps(u: Pengguna, id_pb: number, dto: OrderOpsDto) {
    const o = await this.orderDiTahap(u, id_pb, 'OPS');
    await this.prisma.pbOrder.update({
      where: { id_pb },
      data: {
        ...(dto.ikg_nominal !== undefined ? { ikg_nominal: dto.ikg_nominal } : {}),
        ...(dto.ikg_pengelola !== undefined ? { ikg_pengelola: dto.ikg_pengelola.trim() || null } : {}),
        ...(dto.ikg_catatan !== undefined ? { ikg_catatan: dto.ikg_catatan.trim() || null } : {}),
      },
    });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: 'IKG' });
    return { message: 'Data IKG disimpan' };
  }

  // Link vendor ISP disimpan di sumber_internet_site (status Rencana sampai site aktif)
  async tambahLink(u: Pengguna, id_pb: number, dto: LinkDto) {
    const o = await this.orderDiTahap(u, id_pb, 'OPS');
    if (!o.id_site) throw new BadRequestException('Order belum punya site');
    const l = await this.prisma.sumberInternetSite.create({ data: { id_site: o.id_site, status_link: 'Rencana', ...this.dataLink(dto) } as any });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: 'Tambah link vendor' });
    return { data: l, message: 'Link vendor ditambahkan' };
  }

  async ubahLink(u: Pengguna, id_sumber: number, dto: LinkDto) {
    const { o } = await this.linkOrder(u, id_sumber);
    const l = await this.prisma.sumberInternetSite.update({ where: { id_sumber }, data: this.dataLink(dto) as any });
    await this.catat({ id_sph: o.id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: 'Ubah link vendor' });
    return { data: l, message: 'Link vendor disimpan' };
  }

  async hapusLink(u: Pengguna, id_sumber: number) {
    const { o, l } = await this.linkOrder(u, id_sumber);
    if (l.status_link !== 'Rencana') throw new BadRequestException('Link yang sudah aktif tidak bisa dihapus dari sini');
    await this.prisma.sumberInternetSite.delete({ where: { id_sumber } });
    await this.catat({ id_sph: o.id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: 'Hapus link vendor' });
    return { message: 'Link vendor dihapus' };
  }

  async unggahDokumen(u: Pengguna, id_pb: number, dto: DokumenDto, file: any) {
    if (!file) throw new BadRequestException('File wajib diunggah');
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    if (!o.id_site) throw new BadRequestException('Order belum disetujui Director');
    // Dokumen diunggah oleh pemegang tahap yang sedang berjalan (FAB oleh Sales, BA oleh Instalasi, dst)
    this.wajib(u, o.tahap === 'Aktif' || o.tahap === 'Batal' ? 'Finance' : o.tahap);
    // Ekstensi dari mimetype (whitelist), bukan dari nama file klien; nama file acak supaya URL tidak bisa ditebak
    const ext = EXT_DOKUMEN[file.mimetype];
    if (!ext) throw new BadRequestException('Format file harus PDF, JPG, atau PNG');
    const rel = join('pasang-baru', String(id_pb), `${randomBytes(16).toString('hex')}.${ext}`);
    await fsp.mkdir(join(UPLOAD_ROOT, 'pasang-baru', String(id_pb)), { recursive: true });
    await fsp.writeFile(join(UPLOAD_ROOT, rel), file.buffer);
    const url = `/uploads/${rel}`;
    const d = await this.prisma.siteDokumen.create({
      data: {
        id_site: o.id_site, id_pb, jenis: dto.jenis, nama_file: file.originalname.slice(0, 255), url_file: url, tipe_file: ext,
        keterangan: dto.keterangan?.trim() || null, ukuran_byte: file.size,
      },
    });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'dokumen', catatan: `${dto.jenis}: ${file.originalname}` });
    return { data: d, message: `Dokumen ${dto.jenis} diunggah` };
  }

  async hapusDokumen(u: Pengguna, id_dokumen: number) {
    const d = await this.prisma.siteDokumen.findUnique({ where: { id_dokumen } });
    if (!d?.id_pb) throw new NotFoundException('Dokumen tidak ditemukan');
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb: d.id_pb } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    this.wajib(u, o.tahap);
    await this.prisma.siteDokumen.delete({ where: { id_dokumen } });
    if (d.url_file.startsWith('/uploads/pasang-baru/')) {
      await fsp.rm(join(UPLOAD_ROOT, d.url_file.slice('/uploads/'.length)), { force: true }).catch(() => undefined);
    }
    await this.catat({ id_sph: o.id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi: 'dokumen', catatan: `Hapus ${d.jenis}: ${d.nama_file}` });
    return { message: 'Dokumen dihapus' };
  }

  /** Serahkan ke tahap berikutnya — hanya bila syarat tahap ini lengkap */
  async serahkan(u: Pengguna, id_pb: number, dto: CatatanDto) {
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb }, include: { sph: { include: { pelanggan: true } } } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    if (o.tahap === 'Finance') throw new BadRequestException('Aktivasi oleh Finance menyusul di tahap berikutnya');
    const i = TAHAP.indexOf(o.tahap as any);
    if (i < 1 || i >= TAHAP.indexOf('Finance')) throw new BadRequestException(`Order berstatus ${o.tahap}`);
    this.wajib(u, o.tahap);
    const kurang = (await this.syarat(o)).filter((s) => !s.ok);
    if (kurang.length) throw new BadRequestException(`Belum lengkap: ${kurang.map((s) => s.label).join(', ')}`);
    const ke = TAHAP[i + 1];
    await this.pindah(o, ke, u, 'serahkan', dto.catatan);
    await this.beriTahuRole(PEMEGANG[ke] ?? [], {
      tipe: 'pb_masuk', judul: `Pasang baru masuk ${ke}`,
      deskripsi: `${o.nomor_pb} · ${o.nama_site} · ${o.sph.pelanggan.nama_pelanggan}`, url: `/pasang-baru/order/${id_pb}`,
    });
    return { message: `Diserahkan ke ${ke}` };
  }

  async kembalikan(u: Pengguna, id_pb: number, dto: CatatanDto) {
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    const i = TAHAP.indexOf(o.tahap as any);
    if (i < 2 || o.tahap === 'Aktif') throw new BadRequestException('Order ini tidak bisa dikembalikan');
    this.wajib(u, o.tahap);
    if (!dto.catatan?.trim()) throw new BadRequestException('Isi alasan pengembalian');
    const ke = TAHAP[i - 1];
    await this.pindah(o, ke, u, 'kembalikan', dto.catatan.trim());
    await this.beriTahuRole(PEMEGANG[ke] ?? [], {
      tipe: 'pb_kembali', judul: `Pasang baru dikembalikan ke ${ke}`,
      deskripsi: `${o.nomor_pb} · ${o.nama_site}: ${dto.catatan.trim()}`, url: `/pasang-baru/order/${id_pb}`,
    });
    return { message: `Dikembalikan ke ${ke}` };
  }

  async batal(u: Pengguna, id_pb: number, dto: CatatanDto) {
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    if (!this.boleh(u, 'Sales')) throw new ForbiddenException('Pembatalan oleh Sales atau Director');
    if (['Draft', 'Aktif', 'Batal'].includes(o.tahap)) throw new BadRequestException(`Order berstatus ${o.tahap}`);
    if (!dto.catatan?.trim()) throw new BadRequestException('Isi alasan pembatalan');
    await this.pindah(o, 'Batal', u, 'batal', dto.catatan.trim());
    if (o.id_site) {
      const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: o.id_site } });
      if (site && site.status_site === 'Prospek') {
        const baris = `[Pasang Baru batal] ${dto.catatan.trim()}`;
        await this.prisma.sitePelanggan.update({ where: { id_site: o.id_site }, data: { status_site: 'Batal', catatan: site.catatan ? `${site.catatan}\n${baris}` : baris } });
      }
    }
    return { message: 'Order dibatalkan' };
  }

  // ── Pembantu ─────────────────────────────────────────────────────────────────
  /** Syarat untuk menyerahkan order dari tahapnya sekarang */
  private async syarat(o: { id_pb: number; id_site: number | null; tahap: string; pic_store_nama: string | null; pic_store_hp: string | null }) {
    const dok = o.id_site ? await this.prisma.siteDokumen.findMany({ where: { id_pb: o.id_pb }, select: { jenis: true } }) : [];
    const ada = (j: string) => dok.some((d) => d.jenis === j);
    if (o.tahap === 'Sales') {
      return [
        { label: 'FAB (Formulir Aktivasi Berlangganan)', ok: ada('FAB') },
        { label: 'Kontak PIC store', ok: !!(o.pic_store_nama && o.pic_store_hp) },
      ];
    }
    if (o.tahap === 'OPS') {
      const link = o.id_site ? await this.prisma.sumberInternetSite.findMany({ where: { id_site: o.id_site } }) : [];
      const lengkap = link.filter((l) => l.nomor_pelanggan_isp && l.tgl_mulai && Number(l.biaya_mrc_vendor) > 0 && l.sn_modem);
      return [
        { label: 'Link vendor ISP', ok: link.length > 0 },
        { label: 'ID pelanggan, tgl aktivasi, biaya & SN modem vendor', ok: link.length > 0 && lengkap.length === link.length },
      ];
    }
    if (o.tahap === 'Instalasi') return [{ label: 'Berita Acara (BA) aktivasi', ok: ada('BA') }];
    if (o.tahap === 'NOC') return [{ label: 'Topologi', ok: ada('TOPOLOGI') }];
    return [];
  }

  private async pindah(o: { id_pb: number; id_sph: number; tahap: string }, ke: string, u: Pengguna, aksi: string, catatan?: string | null) {
    await this.prisma.pbOrder.update({ where: { id_pb: o.id_pb }, data: { tahap: ke, tahap_at: new Date() } });
    await this.catat({ id_sph: o.id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi, dari_tahap: o.tahap, ke_tahap: ke, catatan: catatan?.trim() || null });
  }

  private async orderDiTahap(u: Pengguna, id_pb: number, tahap: string) {
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    if (o.tahap !== tahap) throw new BadRequestException(`Order sedang di tahap ${o.tahap} — data ${tahap} tidak bisa diubah`);
    this.wajib(u, tahap);
    return o;
  }

  private async linkOrder(u: Pengguna, id_sumber: number) {
    const l = await this.prisma.sumberInternetSite.findUnique({ where: { id_sumber } });
    if (!l) throw new NotFoundException('Link tidak ditemukan');
    const o = await this.prisma.pbOrder.findFirst({ where: { id_site: l.id_site, tahap: { notIn: ['Batal'] } } });
    if (!o) throw new NotFoundException('Link ini bukan bagian dari order pasang baru');
    await this.orderDiTahap(u, o.id_pb, 'OPS');
    return { o, l };
  }

  private dataLink(d: LinkDto) {
    const tgl = (v?: string | null) => (v === undefined ? undefined : v ? new Date(v) : null);
    const mulai = tgl(d.tgl_mulai);
    const durasi = d.durasi_bulan === undefined ? undefined : d.durasi_bulan || null;
    let tgl_berakhir: Date | null | undefined;
    if (mulai && durasi) {
      tgl_berakhir = new Date(mulai);
      tgl_berakhir.setMonth(tgl_berakhir.getMonth() + durasi);
    }
    return {
      id_vendor_isp: d.id_vendor_isp,
      ...(d.peruntukan_link ? { peruntukan_link: d.peruntukan_link } : {}),
      ...(d.nomor_pelanggan_isp !== undefined ? { nomor_pelanggan_isp: d.nomor_pelanggan_isp.trim() || null } : {}),
      ...(d.bandwidth_mbps !== undefined ? { bandwidth_mbps: d.bandwidth_mbps.trim() || null } : {}),
      ...(d.biaya_mrc_vendor !== undefined ? { biaya_mrc_vendor: d.biaya_mrc_vendor } : {}),
      ...(mulai !== undefined ? { tgl_mulai: mulai } : {}),
      ...(durasi !== undefined ? { durasi_bulan: durasi } : {}),
      ...(tgl_berakhir !== undefined ? { tgl_berakhir } : {}),
      ...(d.sn_modem !== undefined ? { sn_modem: d.sn_modem.trim() || null } : {}),
      ...(d.deposit_nominal !== undefined ? { deposit_nominal: d.deposit_nominal } : {}),
      ...(d.deposit_tgl !== undefined ? { deposit_tgl: tgl(d.deposit_tgl) } : {}),
      ...(d.deposit_status !== undefined ? { deposit_status: d.deposit_status || null } : {}),
      ...(d.catatan !== undefined ? { catatan: d.catatan.trim() || null } : {}),
    };
  }

  private dataBaris(x: SphDto['site'][number], urutan: number) {
    return {
      nama_site: x.nama_site.trim(), alamat: x.alamat.trim(), lantai_unit: x.lantai_unit?.trim() || null, kota: x.kota?.trim() || null,
      id_layanan: x.id_layanan, biaya_bulanan: x.biaya_bulanan, biaya_instalasi: x.biaya_instalasi,
      tgl_rfs: x.tgl_rfs ? new Date(x.tgl_rfs) : null, pic_store_nama: x.pic_store_nama?.trim() || null,
      pic_store_hp: x.pic_store_hp?.trim() || null, urutan,
    };
  }

  private async sinkronPicStore(id_site: number, nama: string | null, hp: string | null) {
    const pic = await this.prisma.picSite.findFirst({ where: { id_site, jabatan: 'PIC Store' } });
    if (pic) {
      if (nama) await this.prisma.picSite.update({ where: { id_pic: pic.id_pic }, data: { nama_pic: nama, no_kontak: hp } });
    } else if (nama) {
      await this.prisma.picSite.create({ data: { id_site, nama_pic: nama, no_kontak: hp, jabatan: 'PIC Store', is_utama: true } });
    }
  }

  private async pelangganDariDto(dto: SphDto): Promise<number> {
    if (dto.id_pelanggan) {
      const p = await this.prisma.pelanggan.findUnique({ where: { id_pelanggan: dto.id_pelanggan } });
      if (!p) throw new BadRequestException('Pelanggan tidak ditemukan');
      return p.id_pelanggan;
    }
    const nama = dto.pelanggan_baru?.trim();
    if (!nama) throw new BadRequestException('Pilih pelanggan atau isi nama pelanggan baru');
    const sama = await this.prisma.pelanggan.findFirst({ where: { nama_pelanggan: nama } });
    if (sama) throw new BadRequestException(`Pelanggan "${nama}" sudah ada (${sama.kode_pelanggan}) — pilih dari daftar`);
    for (let coba = 0; ; coba++) {
      const akhir = await this.prisma.pelanggan.findMany({ where: { kode_pelanggan: { startsWith: 'PLG-' } }, select: { kode_pelanggan: true } });
      const n = Math.max(0, ...akhir.map((p) => parseInt(p.kode_pelanggan.slice(4), 10) || 0)) + 1;
      try {
        const p = await this.prisma.pelanggan.create({
          data: {
            kode_pelanggan: `PLG-${String(n).padStart(3, '0')}`, nama_pelanggan: nama, nama_pic_utama: dto.nama_pic.trim(),
            no_hp_pic_utama: dto.telp_pic?.trim() || null, email_billing: dto.email_pic?.trim() || null,
          },
        });
        return p.id_pelanggan;
      } catch (e) {
        if (coba < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  private async nomorSph() {
    const d = new Date();
    const prefix = `SPH/N1/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/`;
    const akhir = await this.prisma.pbSph.findFirst({ where: { nomor_sph: { startsWith: prefix } }, orderBy: { nomor_sph: 'desc' }, select: { nomor_sph: true } });
    const n = akhir ? parseInt(akhir.nomor_sph.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(3, '0')}`;
  }

  private async nomorPbTerakhir() {
    const yy = String(new Date().getFullYear()).slice(2);
    const akhir = await this.prisma.pbOrder.findFirst({ where: { nomor_pb: { startsWith: `PB-${yy}-` } }, orderBy: { nomor_pb: 'desc' }, select: { nomor_pb: true } });
    return akhir?.nomor_pb ? parseInt(akhir.nomor_pb.slice(6), 10) || 0 : 0;
  }

  /** Prefix kode site: ikut pola site pelanggan yang sudah ada (mis. KNM-0078), atau singkatan nama */
  private async prefixSite(id_pelanggan: number, nama: string) {
    const sites = await this.prisma.sitePelanggan.findMany({ where: { id_pelanggan }, select: { kode_site: true } });
    const hitung = new Map<string, number>();
    for (const s of sites) {
      const m = s.kode_site.match(/^([A-Z0-9]+)-\d+$/);
      if (m) hitung.set(m[1], (hitung.get(m[1]) ?? 0) + 1);
    }
    const terbanyak = [...hitung.entries()].sort((a, b) => b[1] - a[1])[0];
    if (terbanyak) return terbanyak[0];
    const kata = nama.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((k) => k && !['PT', 'CV', 'TBK', 'PERSERO'].includes(k));
    let prefix = (kata.length > 1 ? kata.map((k) => k[0]).join('') : kata[0] ?? 'PB').slice(0, 4);
    // Prefix sudah dipakai pelanggan lain → pakai prefix unik berbasis id
    const dipakai = await this.prisma.sitePelanggan.findFirst({ where: { kode_site: { startsWith: `${prefix}-` }, id_pelanggan: { not: id_pelanggan } } });
    if (dipakai) prefix = `PB${id_pelanggan}`;
    return prefix;
  }

  private async nomorSiteTerakhir(prefix: string) {
    const sites = await this.prisma.sitePelanggan.findMany({ where: { kode_site: { startsWith: `${prefix}-` } }, select: { kode_site: true } });
    return Math.max(0, ...sites.map((s) => parseInt(s.kode_site.slice(prefix.length + 1), 10) || 0));
  }

  private catat(r: { id_sph?: number | null; id_pb?: number | null; id_karyawan?: number | null; aksi: string; dari_tahap?: string | null; ke_tahap?: string | null; catatan?: string | null }) {
    return this.prisma.pbRiwayat.create({ data: r });
  }

  private async namaKaryawan(ids: (number | null | undefined)[]) {
    const unik = [...new Set(ids.filter((x): x is number => !!x))];
    if (!unik.length) return new Map<number, string>();
    const k = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: unik } }, select: { id_karyawan: true, nama_lengkap: true } });
    return new Map(k.map((x) => [x.id_karyawan, x.nama_lengkap.trim()]));
  }

  private async beriTahu(ids: number[], data: { tipe: string; judul: string; deskripsi?: string; url: string }) {
    try {
      const users = await this.prisma.coreUser.findMany({ where: { id_karyawan: { in: ids }, is_aktif: true }, select: { id_user: true } });
      if (users.length) await this.prisma.notification.createMany({ data: users.map((x) => ({ id_user: x.id_user, ...data })) });
    } catch (e: any) {
      this.logger.warn(`notifikasi gagal: ${e?.message}`);
    }
  }

  /** Notifikasi ke semua user aktif dengan role tertentu */
  private async beriTahuRole(roles: string[], data: { tipe: string; judul: string; deskripsi?: string; url: string }) {
    if (!roles.length) return;
    try {
      const users = await this.prisma.coreUser.findMany({
        where: { is_aktif: true, user_roles: { some: { role: { nama_role: { in: roles } } } } },
        select: { id_user: true },
      });
      if (users.length) await this.prisma.notification.createMany({ data: users.map((x) => ({ id_user: x.id_user, ...data })) });
    } catch (e: any) {
      this.logger.warn(`notifikasi gagal: ${e?.message}`);
    }
  }
}
