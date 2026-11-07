import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { UPLOAD_ROOT } from '../../common/upload/upload-root';
import { buatWo } from '../visit/visit.service';
import { AssetsService } from '../assets/assets.service';
import { WaService } from '../whatsapp/wa.service';
import { BaDto, CatatanDto, DokumenDto, FotoLinkDto, LinkDto, NetworkDto, PerangkatDto, RequestPerangkatDto, OrderOpsDto, OrderSalesDto, PutusanDto, SphDto, SurveyDto, SurveyOpsDto, SurveyTeknisDto } from './dto';

export interface Pengguna { id_karyawan: number; roles: string[] }

// Urutan tahap order PB. Draft = SPH belum disetujui Director.
// SPH disetujui → OPS (pasang vendor ISP: modem, speedtest) → Network (Mikrotik, kirim/visit, BA aktivasi) → Selesai.
// Aktivasi site (Aktif, kontrak, invoice) ditata menyusul — site tetap Prospek.
export const TAHAP = ['Draft', 'OPS', 'Network', 'Selesai'] as const;
// Role yang memegang tiap tahap (Admin & Director selalu boleh)
const PEMEGANG: Record<string, string[]> = {
  Draft: ['Sales'],
  OPS: ['OPS', 'Manager_Ops'],
  Network: ['Helpdesk', 'Manager_Ops'],
  Selesai: ['Helpdesk', 'Manager_Ops'],
};
const SEMUA_TAHAP = ['Admin', 'Director'];
const EXT_DOKUMEN: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

@Injectable()
export class PasangBaruService {
  private readonly logger = new Logger('PasangBaru');
  constructor(private prisma: PrismaService, private assets: AssetsService, private wa: WaService) {}

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
  /** Ringkasan jumlah per status; saya=1 → hanya milik sales yang login */
  async ringkas(u?: Pengguna, q: { saya?: string } = {}) {
    const saya = q.saya === '1' && u ? u.id_karyawan : null;
    const [tahap, sph, survey] = await Promise.all([
      this.prisma.pbOrder.groupBy({ by: ['tahap'], where: saya ? { sph: { id_sales: saya } } : {}, _count: { _all: true } }),
      this.prisma.pbSph.groupBy({ by: ['status'], where: saya ? { id_sales: saya } : {}, _count: { _all: true } }),
      this.prisma.pbSurvey.groupBy({ by: ['status'], where: saya ? { id_sales: saya } : {}, _count: { _all: true } }),
    ]);
    return {
      tahap: Object.fromEntries(tahap.map((t) => [t.tahap, t._count._all])),
      sph: Object.fromEntries(sph.map((s) => [s.status, s._count._all])),
      survey: Object.fromEntries(survey.map((s) => [s.status, s._count._all])),
    };
  }

  async daftarOrder(q: { tahap?: string; cari?: string; id_sph?: string; saya?: string }, u?: Pengguna) {
    const kata = (q.cari || '').trim();
    const tahap = (q.tahap || '').split(',').map((x) => x.trim()).filter(Boolean);
    const where: Prisma.PbOrderWhereInput = {
      ...(tahap.length ? { tahap: { in: tahap } } : { tahap: { notIn: ['Draft', 'Batal'] } }),
      ...(q.saya === '1' && u ? { sph: { id_sales: u.id_karyawan } } : {}),
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
        sph: { select: { nomor_sph: true, id_sales: true, pelanggan: { select: { nama_pelanggan: true } } } },
        layanan: { select: { nama_layanan: true } },
        site: {
          select: {
            kode_site: true,
            sumber_internet: { select: { biaya_mrc_vendor: true, peruntukan_link: true, vendor: { select: { nama_vendor: true } } } },
            _count: { select: { dokumen: true } },
          },
        },
      },
      orderBy: [{ tahap_at: 'asc' }],
      take: 500,
    });
    const nama = await this.namaKaryawan(rows.map((r) => r.sph.id_sales));
    const idPb = rows.map((r) => r.id_pb);
    const [perangkat, wo] = await Promise.all([
      idPb.length ? this.prisma.pbPerangkat.findMany({ where: { id_pb: { in: idPb } }, select: { id_pb: true, id_aset: true, nama_item: true } }) : [],
      this.prisma.workOrder.findMany({
        where: { id_wo: { in: rows.map((r) => r.id_wo).filter((x): x is number => !!x) } },
        select: { id_wo: true, nomor_wo: true, status_wo: true, tgl_jadwal: true, tipe_eksekutor: true, teknisi: { select: { nama_lengkap: true } }, vendor: { select: { nama_vendor: true } }, kontak_teknisi: { select: { nama: true } }, pengiriman: { select: { nama_ekspedisi: true, nomor_resi: true, status_pengiriman: true }, take: 1 } },
      }),
    ]);
    return rows.map((r) => ({
      ...r,
      perangkat: perangkat.filter((p) => p.id_pb === r.id_pb),
      wo: wo.find((w) => w.id_wo === r.id_wo) ?? null,
      sales: r.sph.id_sales ? nama.get(r.sph.id_sales) ?? null : null,
      modal_vendor: (r.site?.sumber_internet ?? []).reduce((a, l) => a + Number(l.biaya_mrc_vendor), 0),
      vendor: (r.site?.sumber_internet ?? []).map((l) => `${l.vendor.nama_vendor} (${l.peruntukan_link})`),
    }));
  }

  async daftarSph(q: { status?: string; cari?: string; saya?: string }, u?: Pengguna) {
    const kata = (q.cari || '').trim();
    const status = (q.status || '').split(',').map((x) => x.trim()).filter(Boolean);
    const rows = await this.prisma.pbSph.findMany({
      where: {
        ...(status.length ? { status: { in: status } } : {}),
        ...(q.saya === '1' && u ? { id_sales: u.id_karyawan } : {}),
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

  // ── Survey ───────────────────────────────────────────────────────────────────
  // Draft (Sales) → OPS (vendor ISP, IKG, deposit, cover) → [Teknis → OPS] → Siap SPH / Hold → Lanjut SPH
  private opsSurvey(u: Pengguna) { return this.boleh(u, 'OPS'); }
  private teknisSurvey(u: Pengguna) { return u.roles.some((r) => [...SEMUA_TAHAP, 'Teknisi', 'Manager_Ops'].includes(r)); }

  async daftarSurvey(q: { status?: string; cari?: string; saya?: string }, u?: Pengguna) {
    const kata = (q.cari || '').trim();
    const status = (q.status || '').split(',').map((x) => x.trim()).filter(Boolean);
    const rows = await this.prisma.pbSurvey.findMany({
      where: {
        ...(q.status === 'aktif' ? { status: { notIn: ['Batal', 'Lanjut SPH'] } } : status.length ? { status: { in: status } } : {}),
        ...(q.saya === '1' && u ? { id_sales: u.id_karyawan } : {}),
        ...(kata ? {
          OR: [
            { nomor_survey: { contains: kata } }, { nama_perusahaan: { contains: kata } }, { nama_pic: { contains: kata } },
            { site: { some: { OR: [{ nama_site: { contains: kata } }, { kota: { contains: kata } }] } } },
          ],
        } : {}),
      },
      include: {
        site: {
          select: {
            cover: true, kota: true, ikg_nominal: true, layanan: { select: { nama_layanan: true } },
            vendor: { select: { biaya_mrc_vendor: true, deposit_nominal: true } },
          },
        },
      },
      orderBy: { updated_at: 'desc' },
      take: 300,
    });
    const ids = rows.map((r) => r.id_survey);
    const [nama, sph, riwayat] = await Promise.all([
      this.namaKaryawan(rows.flatMap((r) => [r.id_sales, r.id_ops])),
      this.prisma.pbSph.findMany({ where: { id_survey: { in: ids } }, select: { id_survey: true, id_sph: true, nomor_sph: true } }),
      // catatan terakhir per survey (mis. alasan dikembalikan OPS / permintaan cek teknis)
      ids.length ? this.prisma.pbRiwayat.findMany({ where: { id_survey: { in: ids } }, orderBy: { created_at: 'desc' }, select: { id_survey: true, aksi: true, catatan: true } }) : [],
    ]);
    const unik = (a: (string | null | undefined)[]) => [...new Set(a.filter((x): x is string => !!x))];
    return rows.map(({ site, ...r }) => ({
      ...r,
      jumlah_site: site.length,
      cover: site.filter((x) => x.cover === 'Cover').length,
      tidak_cover: site.filter((x) => x.cover === 'Tidak cover').length,
      kota: unik(site.map((x) => x.kota)),
      layanan: unik(site.map((x) => x.layanan.nama_layanan)),
      modal_vendor: site.filter((x) => x.cover !== 'Tidak cover').flatMap((x) => x.vendor).reduce((a, v) => a + Number(v.biaya_mrc_vendor), 0),
      ikg: site.filter((x) => x.cover !== 'Tidak cover').reduce((a, x) => a + Number(x.ikg_nominal), 0),
      terakhir: (() => { const x = riwayat.find((h) => h.id_survey === r.id_survey); return x ? { aksi: x.aksi, catatan: x.catatan } : null; })(),
      ops: r.id_ops ? nama.get(r.id_ops) ?? null : null,
      sales: r.id_sales ? nama.get(r.id_sales) ?? null : null,
      sph: sph.filter((x) => x.id_survey === r.id_survey).map(({ id_sph, nomor_sph }) => ({ id_sph, nomor_sph })),
    }));
  }

  async detailSurvey(id_survey: number, u?: Pengguna) {
    const s = await this.prisma.pbSurvey.findUnique({
      where: { id_survey },
      include: {
        site: {
          include: {
            layanan: { select: { nama_layanan: true } },
            vendor: { include: { vendor: { select: { nama_vendor: true } } }, orderBy: { id_survey_vendor: 'asc' } },
          },
          orderBy: [{ urutan: 'asc' }, { id_survey_site: 'asc' }],
        },
      },
    });
    if (!s) throw new NotFoundException('Survey tidak ditemukan');
    const [riwayat, sph, pelanggan] = await Promise.all([
      this.prisma.pbRiwayat.findMany({ where: { id_survey }, orderBy: { created_at: 'desc' } }),
      this.prisma.pbSph.findMany({ where: { id_survey }, select: { id_sph: true, nomor_sph: true, status: true }, orderBy: { id_sph: 'asc' } }),
      s.id_pelanggan ? this.prisma.pelanggan.findUnique({ where: { id_pelanggan: s.id_pelanggan }, select: { id_pelanggan: true, kode_pelanggan: true, nama_pelanggan: true } }) : null,
    ]);
    const nama = await this.namaKaryawan([s.id_sales, s.id_ops, s.id_teknis, ...riwayat.map((r) => r.id_karyawan)]);
    const n = (id: number | null) => (id ? nama.get(id) ?? null : null);
    return {
      ...s,
      pelanggan,
      sph,
      sales: n(s.id_sales), ops: n(s.id_ops), teknis: n(s.id_teknis),
      riwayat: riwayat.map((r) => ({ ...r, oleh: n(r.id_karyawan) })),
      ...(u ? { hak: { sales: this.boleh(u, 'Draft'), ops: this.opsSurvey(u), teknis: this.teknisSurvey(u) } } : {}),
    };
  }

  private async cekPelangganSurvey(dto: SurveyDto) {
    if (!dto.id_pelanggan) return null;
    const p = await this.prisma.pelanggan.findUnique({ where: { id_pelanggan: dto.id_pelanggan }, select: { id_pelanggan: true } });
    if (!p) throw new BadRequestException('Pelanggan tidak ditemukan');
    return p.id_pelanggan;
  }

  private dataSurvey(dto: SurveyDto, id_pelanggan: number | null) {
    return {
      id_pelanggan, nama_perusahaan: dto.nama_perusahaan.trim(), nama_pic: dto.nama_pic.trim(),
      telp_pic: dto.telp_pic?.trim() || null, email_pic: dto.email_pic?.trim() || null, catatan: dto.catatan?.trim() || null,
    };
  }

  private barisSurvey(x: SurveyDto['site'][number], urutan: number) {
    return {
      nama_site: x.nama_site.trim(), alamat: x.alamat.trim(), lantai_unit: x.lantai_unit?.trim() || null,
      kota: x.kota?.trim() || null, id_layanan: x.id_layanan, urutan,
    };
  }

  private async surveyStatus(id_survey: number, boleh: string[]) {
    const s = await this.prisma.pbSurvey.findUnique({ where: { id_survey }, include: { site: { include: { vendor: true } } } });
    if (!s) throw new NotFoundException('Survey tidak ditemukan');
    if (!boleh.includes(s.status)) throw new BadRequestException(`Survey berstatus ${s.status} — aksi ini untuk status ${boleh.join('/')}`);
    return s;
  }

  private async gantiStatusSurvey(u: Pengguna, id_survey: number, ke: string, aksi: string, catatan?: string | null, data: Prisma.PbSurveyUpdateInput = {}) {
    await this.prisma.pbSurvey.update({ where: { id_survey }, data: { ...data, status: ke, status_at: new Date() } });
    await this.catat({ id_survey, id_karyawan: u.id_karyawan, aksi, ke_tahap: ke, catatan: catatan?.trim() || null });
  }

  async buatSurvey(u: Pengguna, dto: SurveyDto) {
    this.wajib(u, 'Draft');
    const id_pelanggan = await this.cekPelangganSurvey(dto);
    for (let coba = 0; ; coba++) {
      const nomor_survey = await this.nomorSurvey();
      try {
        const s = await this.prisma.pbSurvey.create({
          data: {
            nomor_survey, ...this.dataSurvey(dto, id_pelanggan), id_sales: u.id_karyawan,
            site: { create: dto.site.map((x, i) => this.barisSurvey(x, i)) },
          },
        });
        await this.catat({ id_survey: s.id_survey, id_karyawan: u.id_karyawan, aksi: 'buat', catatan: `${dto.site.length} site` });
        return { data: s, message: `Survey ${nomor_survey} dibuat` };
      } catch (e) {
        if (coba < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  /** Sales mengubah data survey (hanya Draft). Baris site lama diperbarui di tempat supaya hasil OPS tidak hilang. */
  async ubahSurvey(u: Pengguna, id_survey: number, dto: SurveyDto) {
    this.wajib(u, 'Draft');
    const s = await this.surveyStatus(id_survey, ['Draft']);
    const id_pelanggan = await this.cekPelangganSurvey(dto);
    const lama = new Set(s.site.map((x) => x.id_survey_site));
    const dipakai = dto.site.filter((x) => x.id_survey_site && lama.has(x.id_survey_site)).map((x) => x.id_survey_site!);
    await this.prisma.$transaction([
      this.prisma.pbSurveySite.deleteMany({ where: { id_survey, id_survey_site: { notIn: dipakai } } }),
      ...dto.site.map((x, i) => (x.id_survey_site && lama.has(x.id_survey_site)
        ? this.prisma.pbSurveySite.update({ where: { id_survey_site: x.id_survey_site }, data: this.barisSurvey(x, i) })
        : this.prisma.pbSurveySite.create({ data: { id_survey, ...this.barisSurvey(x, i) } }))),
      this.prisma.pbSurvey.update({ where: { id_survey }, data: this.dataSurvey(dto, id_pelanggan) }),
    ]);
    await this.catat({ id_survey, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: `${dto.site.length} site` });
    return { data: await this.detailSurvey(id_survey), message: 'Survey disimpan' };
  }

  /** Sales → OPS (dari Draft, atau ajukan ulang dari Hold) */
  async ajukanSurvey(u: Pengguna, id_survey: number, dto: CatatanDto) {
    this.wajib(u, 'Draft');
    const s = await this.surveyStatus(id_survey, ['Draft', 'Hold']);
    if (!s.site.length) throw new BadRequestException('Survey belum berisi site');
    await this.gantiStatusSurvey(u, id_survey, 'OPS', 'ajukan', dto.catatan);
    await this.beriTahuRole(['OPS', 'Manager_Ops'], {
      tipe: 'pb_survey_ops', judul: s.status === 'Hold' ? 'Survey diajukan ulang' : 'Survey baru untuk OPS',
      deskripsi: `${s.nomor_survey} · ${s.nama_perusahaan} · ${s.site.length} site`, url: `/pasang-baru/survey/${id_survey}`,
    });
    return { message: 'Survey diajukan ke OPS' };
  }

  /** OPS mengisi vendor ISP, IKG, deposit, dan cover/tidak cover per site */
  async simpanOpsSurvey(u: Pengguna, id_survey: number, dto: SurveyOpsDto) {
    if (!this.opsSurvey(u)) throw new ForbiddenException('Hasil survey diisi oleh tim OPS');
    const s = await this.surveyStatus(id_survey, ['OPS']);
    const milik = new Set(s.site.map((x) => x.id_survey_site));
    for (const x of dto.site) if (!milik.has(x.id_survey_site)) throw new BadRequestException('Site tidak termasuk survey ini');
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const x of dto.site) {
      ops.push(this.prisma.pbSurveySite.update({
        where: { id_survey_site: x.id_survey_site },
        data: {
          cover: x.cover || null, ikg_nominal: x.ikg_nominal ?? 0, ikg_pengelola: x.ikg_pengelola?.trim() || null,
          ikg_catatan: x.ikg_catatan?.trim() || null, catatan_ops: x.catatan_ops?.trim() || null,
        },
      }));
      ops.push(this.prisma.pbSurveyVendor.deleteMany({ where: { id_survey_site: x.id_survey_site } }));
      if (x.vendor.length) {
        ops.push(this.prisma.pbSurveyVendor.createMany({
          data: x.vendor.map((v) => ({
            id_survey_site: x.id_survey_site, id_vendor_isp: v.id_vendor_isp, peruntukan_link: v.peruntukan_link || 'Main',
            bandwidth_mbps: v.bandwidth_mbps?.trim() || null, biaya_mrc_vendor: v.biaya_mrc_vendor ?? 0, biaya_otc_vendor: v.biaya_otc_vendor ?? 0,
            deposit_nominal: v.deposit_nominal ?? 0, deposit_jenis: (v.deposit_nominal ?? 0) > 0 ? v.deposit_jenis || null : null,
            catatan: v.catatan?.trim() || null,
          })),
        }));
      }
    }
    ops.push(this.prisma.pbSurvey.update({ where: { id_survey }, data: { catatan_ops: dto.catatan_ops?.trim() || null, id_ops: u.id_karyawan } }));
    await this.prisma.$transaction(ops);
    return { data: await this.detailSurvey(id_survey, u), message: 'Hasil survey OPS disimpan' };
  }

  /** OPS → Teknis (opsional): cek teknis, mis. M2M 5G cek sinyal */
  async kirimTeknisSurvey(u: Pengguna, id_survey: number, dto: CatatanDto) {
    if (!this.opsSurvey(u)) throw new ForbiddenException('Hanya OPS yang bisa mengirim ke teknis');
    if (!dto.catatan?.trim()) throw new BadRequestException('Tulis apa yang perlu dicek teknis');
    const s = await this.surveyStatus(id_survey, ['OPS']);
    await this.gantiStatusSurvey(u, id_survey, 'Teknis', 'kirim_teknis', dto.catatan, { id_ops: u.id_karyawan });
    await this.beriTahuRole(['Teknisi'], {
      tipe: 'pb_survey_teknis', judul: 'Permintaan cek teknis survey',
      deskripsi: `${s.nomor_survey} · ${s.nama_perusahaan}: ${dto.catatan.trim()}`, url: `/pasang-baru/survey/${id_survey}`,
    });
    return { message: 'Survey dikirim ke teknis' };
  }

  async simpanTeknisSurvey(u: Pengguna, id_survey: number, dto: SurveyTeknisDto) {
    if (!this.teknisSurvey(u)) throw new ForbiddenException('Hasil cek teknis diisi oleh Teknisi');
    const s = await this.surveyStatus(id_survey, ['Teknis']);
    const milik = new Set(s.site.map((x) => x.id_survey_site));
    for (const x of dto.site) if (!milik.has(x.id_survey_site)) throw new BadRequestException('Site tidak termasuk survey ini');
    await this.prisma.$transaction([
      ...dto.site.map((x) => this.prisma.pbSurveySite.update({ where: { id_survey_site: x.id_survey_site }, data: { hasil_teknis: x.hasil_teknis?.trim() || null } })),
      this.prisma.pbSurvey.update({ where: { id_survey }, data: { catatan_teknis: dto.catatan_teknis?.trim() || null, id_teknis: u.id_karyawan } }),
    ]);
    return { data: await this.detailSurvey(id_survey, u), message: 'Hasil cek teknis disimpan' };
  }

  /** Teknis selesai → kembali ke OPS */
  async selesaiTeknisSurvey(u: Pengguna, id_survey: number, dto: CatatanDto) {
    if (!this.teknisSurvey(u)) throw new ForbiddenException('Hanya Teknisi yang bisa menyelesaikan cek teknis');
    const s = await this.surveyStatus(id_survey, ['Teknis']);
    if (!s.catatan_teknis && !s.site.some((x) => x.hasil_teknis)) throw new BadRequestException('Isi hasil cek teknis dulu');
    await this.gantiStatusSurvey(u, id_survey, 'OPS', 'teknis_selesai', dto.catatan, { id_teknis: u.id_karyawan });
    const ke = s.id_ops ? [s.id_ops] : [];
    if (ke.length) await this.beriTahu(ke, { tipe: 'pb_survey_ops', judul: 'Cek teknis selesai', deskripsi: `${s.nomor_survey} · ${s.nama_perusahaan}`, url: `/pasang-baru/survey/${id_survey}` });
    else await this.beriTahuRole(['OPS', 'Manager_Ops'], { tipe: 'pb_survey_ops', judul: 'Cek teknis selesai', deskripsi: `${s.nomor_survey} · ${s.nama_perusahaan}`, url: `/pasang-baru/survey/${id_survey}` });
    return { message: 'Cek teknis selesai, kembali ke OPS' };
  }

  /** OPS selesai → kembali ke Sales: Siap SPH (ada site cover) atau Hold (semua tidak cover) */
  async selesaiOpsSurvey(u: Pengguna, id_survey: number, dto: CatatanDto) {
    if (!this.opsSurvey(u)) throw new ForbiddenException('Hanya OPS yang bisa menyelesaikan survey');
    const s = await this.surveyStatus(id_survey, ['OPS']);
    const belum = s.site.filter((x) => !x.cover);
    if (belum.length) throw new BadRequestException(`Tentukan cover / tidak cover untuk: ${belum.map((x) => x.nama_site).join(', ')}`);
    const tanpaVendor = s.site.filter((x) => x.cover === 'Cover' && !x.vendor.length);
    if (tanpaVendor.length) throw new BadRequestException(`Site cover wajib punya minimal 1 vendor ISP: ${tanpaVendor.map((x) => x.nama_site).join(', ')}`);
    const cover = s.site.filter((x) => x.cover === 'Cover').length;
    const ke = cover ? 'Siap SPH' : 'Hold';
    await this.gantiStatusSurvey(u, id_survey, ke, 'ops_selesai', dto.catatan || `${cover} cover · ${s.site.length - cover} tidak cover`, { id_ops: u.id_karyawan });
    if (s.id_sales) {
      await this.beriTahu([s.id_sales], {
        tipe: 'pb_survey_selesai', judul: cover ? 'Survey selesai — siap dibuat SPH' : 'Survey hold — semua site tidak cover',
        deskripsi: `${s.nomor_survey} · ${s.nama_perusahaan} · ${cover}/${s.site.length} site cover`, url: `/pasang-baru/survey/${id_survey}`,
      });
    }
    return { message: cover ? `Survey selesai — ${cover} site cover, siap dibuat SPH` : 'Semua site tidak cover — survey di-hold' };
  }

  /** OPS mengembalikan ke Sales untuk perbaikan data */
  async kembalikanSurvey(u: Pengguna, id_survey: number, dto: CatatanDto) {
    if (!this.opsSurvey(u)) throw new ForbiddenException('Hanya OPS yang bisa mengembalikan survey');
    if (!dto.catatan?.trim()) throw new BadRequestException('Tulis alasan / data yang perlu diperbaiki');
    const s = await this.surveyStatus(id_survey, ['OPS']);
    await this.gantiStatusSurvey(u, id_survey, 'Draft', 'kembalikan', dto.catatan);
    if (s.id_sales) await this.beriTahu([s.id_sales], { tipe: 'pb_survey_kembali', judul: 'Survey dikembalikan OPS', deskripsi: `${s.nomor_survey}: ${dto.catatan.trim()}`, url: `/pasang-baru/survey/${id_survey}` });
    return { message: 'Survey dikembalikan ke Sales' };
  }

  async batalSurvey(u: Pengguna, id_survey: number, dto: CatatanDto) {
    this.wajib(u, 'Draft');
    await this.surveyStatus(id_survey, ['Draft', 'Siap SPH', 'Hold']);
    await this.gantiStatusSurvey(u, id_survey, 'Batal', 'batal', dto.catatan);
    return { message: 'Survey dibatalkan' };
  }

  async aktifkanSurvey(u: Pengguna, id_survey: number) {
    this.wajib(u, 'Draft');
    await this.surveyStatus(id_survey, ['Batal']);
    await this.gantiStatusSurvey(u, id_survey, 'Draft', 'aktifkan');
    return { message: 'Survey dibuka kembali (Draft)' };
  }

  async hapusSurvey(u: Pengguna, id_survey: number) {
    this.wajib(u, 'Draft');
    const s = await this.surveyStatus(id_survey, ['Draft', 'Batal']);
    if (await this.prisma.pbSph.count({ where: { id_survey } })) throw new BadRequestException('Survey sudah dipakai SPH — tidak bisa dihapus');
    await this.prisma.$transaction([
      this.prisma.pbSurvey.delete({ where: { id_survey } }),
      this.prisma.pbRiwayat.deleteMany({ where: { id_survey } }),
    ]);
    return { message: `Survey ${s.nomor_survey} dihapus` };
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
    const idSs = s.order.map((o) => o.id_survey_site).filter((x): x is number => !!x);
    const [vendor, survey] = await Promise.all([
      idSs.length ? this.prisma.pbSurveyVendor.findMany({ where: { id_survey_site: { in: idSs } }, include: { vendor: { select: { nama_vendor: true } } }, orderBy: { id_survey_vendor: 'asc' } }) : [],
      s.id_survey ? this.prisma.pbSurvey.findUnique({ where: { id_survey: s.id_survey }, select: { id_survey: true, nomor_survey: true } }) : null,
    ]);
    return {
      ...s,
      survey,
      order: s.order.map((o) => ({ ...o, vendor_survey: vendor.filter((v) => v.id_survey_site === o.id_survey_site) })),
      sales: s.id_sales ? nama.get(s.id_sales) ?? null : null,
      approver: s.id_approver ? nama.get(s.id_approver) ?? null : null,
      riwayat: riwayat.map((r) => ({ ...r, oleh: r.id_karyawan ? nama.get(r.id_karyawan) ?? null : null })),
    };
  }

  async buatSph(u: Pengguna, dto: SphDto) {
    this.wajib(u, 'Draft');
    const survey = dto.id_survey ? await this.prisma.pbSurvey.findUnique({ where: { id_survey: dto.id_survey } }) : null;
    if (dto.id_survey && !survey) throw new BadRequestException('Survey tidak ditemukan');
    if (survey && !['Siap SPH', 'Lanjut SPH'].includes(survey.status)) throw new BadRequestException(`Survey berstatus ${survey.status} — SPH dibuat setelah OPS selesai (Siap SPH)`);
    const ops = await this.opsSurveySite(dto, survey?.id_survey ?? null);
    const id_pelanggan = await this.pelangganDariDto(dto);
    for (let coba = 0; ; coba++) {
      const nomor_sph = await this.nomorSph();
      try {
        const s = await this.prisma.pbSph.create({
          data: {
            nomor_sph, id_pelanggan, nama_pic: dto.nama_pic.trim(), telp_pic: dto.telp_pic?.trim() || null,
            email_pic: dto.email_pic?.trim() || null, durasi_bulan: dto.durasi_bulan, catatan: dto.catatan?.trim() || null,
            id_sales: u.id_karyawan, id_survey: survey?.id_survey ?? null,
            order: { create: dto.site.map((x, i) => this.dataBaris(x, i, ops)) },
          },
        });
        await this.catat({ id_sph: s.id_sph, id_karyawan: u.id_karyawan, aksi: 'buat', catatan: `${dto.site.length} site${survey ? ` · dari ${survey.nomor_survey}` : ''}` });
        if (survey) {
          await this.prisma.pbSurvey.update({ where: { id_survey: survey.id_survey }, data: { status: 'Lanjut SPH', status_at: new Date(), ...(survey.id_pelanggan ? {} : { id_pelanggan }) } });
          await this.catat({ id_survey: survey.id_survey, id_karyawan: u.id_karyawan, aksi: 'sph', catatan: nomor_sph });
        }
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
    const ops = await this.opsSurveySite(dto, s.id_survey);
    const id_pelanggan = await this.pelangganDariDto(dto);
    await this.prisma.$transaction([
      this.prisma.pbOrder.deleteMany({ where: { id_sph } }),
      this.prisma.pbSph.update({
        where: { id_sph },
        data: {
          id_pelanggan, nama_pic: dto.nama_pic.trim(), telp_pic: dto.telp_pic?.trim() || null, email_pic: dto.email_pic?.trim() || null,
          durasi_bulan: dto.durasi_bulan, catatan: dto.catatan?.trim() || null, status: 'Draft',
          order: { create: dto.site.map((x, i) => this.dataBaris(x, i, ops)) },
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
    await this.bukaLagiSurvey(s.id_survey, u, s.nomor_sph);
    return { message: `SPH ${s.nomor_sph} dihapus` };
  }

  /**
   * Hapus permanen (khusus Admin), status apa pun: SPH + order + site hasil SPH (beserta PIC, link, dokumen & file)
   * + riwayat + notifikasi. Pelanggan ikut dihapus bila dibuat bersama SPH ini dan tidak punya data lain.
   * Ditolak bila site sudah dipakai modul lain (tiket, kontrak, invoice, WO, aset, IP, …).
   */
  async hapusPermanenSph(u: Pengguna, id_sph: number) {
    if (!u.roles.includes('Admin')) throw new ForbiddenException('Hapus permanen hanya untuk Administrator');
    const s = await this.prisma.pbSph.findUnique({ where: { id_sph }, include: { order: { select: { id_pb: true, id_site: true } } } });
    if (!s) throw new NotFoundException('SPH tidak ditemukan');

    const idSite = s.order.map((o) => o.id_site).filter((x): x is number => !!x);
    // Perangkat yang dialokasikan tahap Network → kembalikan ke gudang dulu, jejak perangkat di site hasil SPH ini dihapus
    const pbPerangkat = await this.prisma.pbPerangkat.findMany({ where: { id_pb: { in: s.order.map((o) => o.id_pb) } } });
    const asetPb = pbPerangkat.map((p) => p.id_aset).filter((x): x is number => !!x);
    if (asetPb.length) {
      const userId = await this.idUser(u.id_karyawan);
      await this.prisma.$transaction(async (tx) => {
        for (const id_aset of asetPb) {
          const a = await tx.gudangAset.findUnique({ where: { id_aset } });
          if (a && (!a.is_serialized || (a.status_aset === 'Terpasang' && a.id_site && idSite.includes(a.id_site)))) {
            await this.assets.applyMutasiTx(tx, { id_aset, jenis_mutasi: 'Return', jumlah: 1, id_site_asal: a.id_site ?? undefined, keterangan: `Hapus permanen ${s.nomor_sph}` }, userId);
          }
        }
      });
      const siteSph = (await this.prisma.sitePelanggan.findMany({ where: { id_site: { in: idSite } }, select: { id_site: true, catatan: true } }))
        .filter((x) => x.catatan?.includes(s.nomor_sph)).map((x) => x.id_site);
      await this.prisma.perangkatSite.deleteMany({ where: { id_site: { in: siteSph }, id_aset: { in: asetPb }, status_perangkat: { not: 'Aktif' } } });
    }
    const site = await this.prisma.sitePelanggan.findMany({
      where: { id_site: { in: idSite } },
      select: {
        id_site: true, kode_site: true, catatan: true,
        _count: { select: {
          aset: true, perangkat: true, projects: true, tickets: true, kontrak: true, topup: true, jurnal_ar: true,
          invoices: true, ip_alokasi: true, prtg_mapping: true, uptimekuma_mapping: true, instalasi_orders: true,
        } },
      },
    });
    const dipakai = site.flatMap((x) => {
      const isi = Object.entries(x._count).filter(([, n]) => n > 0).map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`);
      return isi.length ? [`${x.kode_site}: ${isi.join(', ')}`] : [];
    });
    // Visit instalasi hasil order PB ini ikut terhapus; visit lain (mis. dari tiket) dianggap data terpakai
    const idPb = s.order.map((o) => o.id_pb);
    const woLain = await this.prisma.workOrder.groupBy({
      by: ['id_site'], where: { id_site: { in: idSite }, NOT: { id_pb: { in: idPb } } }, _count: { _all: true },
    });
    for (const g of woLain) {
      const x = site.find((v) => v.id_site === g.id_site);
      if (x) dipakai.push(`${x.kode_site}: work orders ${g._count._all}`);
    }
    if (dipakai.length) throw new BadRequestException(`Site sudah dipakai data lain, hapus/pindahkan dulu — ${dipakai.join('; ')}`);
    // Hanya site yang memang dibuat oleh SPH ini yang ikut dihapus; site lain cukup dilepas dari order
    const siteHapus = site.filter((x) => x.catatan?.includes(s.nomor_sph)).map((x) => x.id_site);
    const dokumen = await this.prisma.siteDokumen.findMany({
      where: { OR: [{ id_pb: { in: idPb } }, { id_site: { in: siteHapus } }] }, select: { url_file: true },
    });
    const baTtd = (await this.prisma.pbOrder.findMany({ where: { id_pb: { in: idPb } }, select: { ba_ttd: true } })).map((x) => x.ba_ttd);
    const fotoLink = await this.prisma.sumberInternetSite.findMany({ where: { id_site: { in: siteHapus } }, select: { foto_modem: true, foto_speedtest: true } });

    await this.prisma.$transaction([
      this.prisma.notification.deleteMany({
        where: { url: { in: [`/pasang-baru/sph/${id_sph}`, ...idPb.map((x) => `/pasang-baru/order/${x}`)] } },
      }),
      this.prisma.pbRiwayat.deleteMany({ where: { OR: [{ id_sph }, { id_pb: { in: idPb } }] } }),
      this.prisma.siteDokumen.deleteMany({ where: { OR: [{ id_pb: { in: idPb } }, { id_site: { in: siteHapus } }] } }),
      this.prisma.workOrder.deleteMany({ where: { id_pb: { in: idPb } } }),
      this.prisma.pbPerangkat.deleteMany({ where: { id_pb: { in: idPb } } }),
      this.prisma.pbOrder.deleteMany({ where: { id_sph } }),
      this.prisma.pbSph.delete({ where: { id_sph } }),
      this.prisma.picSite.deleteMany({ where: { id_site: { in: siteHapus } } }),
      this.prisma.sumberInternetSite.deleteMany({ where: { id_site: { in: siteHapus } } }),
      this.prisma.sitePelanggan.deleteMany({ where: { id_site: { in: siteHapus } } }),
    ]);
    for (const d of dokumen) {
      if (d.url_file.startsWith('/uploads/pasang-baru/')) {
        await fsp.rm(join(UPLOAD_ROOT, d.url_file.slice('/uploads/'.length)), { force: true }).catch(() => undefined);
      }
    }
    await this.hapusFileUnggah(...fotoLink.flatMap((f) => [f.foto_modem, f.foto_speedtest]), ...baTtd);
    for (const id_pb of idPb) await fsp.rmdir(join(UPLOAD_ROOT, 'pasang-baru', String(id_pb))).catch(() => undefined);
    await this.bukaLagiSurvey(s.id_survey, u, s.nomor_sph);

    // Pelanggan baru yang dibuat bersama SPH (selisih waktu < 1 menit) dan kini tanpa site/SPH lain → ikut dihapus
    let pelangganDihapus = false;
    const p = await this.prisma.pelanggan.findUnique({ where: { id_pelanggan: s.id_pelanggan }, select: { created_at: true, nama_pelanggan: true } });
    if (p?.created_at && Math.abs(p.created_at.getTime() - s.created_at.getTime()) < 60_000) {
      const [nSite, nSph] = await Promise.all([
        this.prisma.sitePelanggan.count({ where: { id_pelanggan: s.id_pelanggan } }),
        this.prisma.pbSph.count({ where: { id_pelanggan: s.id_pelanggan } }),
      ]);
      if (!nSite && !nSph) {
        try {
          await this.prisma.pelanggan.delete({ where: { id_pelanggan: s.id_pelanggan } });
          pelangganDihapus = true;
        } catch { /* masih dipakai tabel lain → biarkan */ }
      }
    }
    this.logger.warn(`SPH ${s.nomor_sph} dihapus permanen oleh karyawan #${u.id_karyawan} (${idPb.length} order, ${siteHapus.length} site, ${dokumen.length} dokumen${pelangganDihapus ? `, pelanggan ${p!.nama_pelanggan}` : ''})`);
    const rincian = [`${idPb.length} order`, `${siteHapus.length} site`, `${dokumen.length} dokumen`];
    if (pelangganDihapus) rincian.push(`pelanggan ${p!.nama_pelanggan}`);
    return { message: `${s.nomor_sph} dihapus permanen (${rincian.join(', ')})` };
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
        // Vendor ISP hasil survey OPS → link "Rencana" di site
        if (o.id_survey_site) {
          const vendor = await tx.pbSurveyVendor.findMany({ where: { id_survey_site: o.id_survey_site }, orderBy: { id_survey_vendor: 'asc' } });
          if (vendor.length) {
            await tx.sumberInternetSite.createMany({
              data: vendor.map((v) => ({
                id_site: site.id_site, id_vendor_isp: v.id_vendor_isp, peruntukan_link: v.peruntukan_link, bandwidth_mbps: v.bandwidth_mbps,
                biaya_mrc_vendor: v.biaya_mrc_vendor, deposit_nominal: v.deposit_nominal, deposit_jenis: v.deposit_jenis,
                deposit_status: Number(v.deposit_nominal) > 0 ? 'Ditahan' : null, status_link: 'Rencana',
                catatan: [Number(v.biaya_otc_vendor) > 0 ? `Biaya pasang vendor Rp ${Number(v.biaya_otc_vendor).toLocaleString('id-ID')}` : '', v.catatan ?? '', `Pasang Baru ${s.nomor_sph}`].filter(Boolean).join(' · '),
              })),
            });
          }
        }
        if (o.pic_store_nama) {
          await tx.picSite.create({ data: { id_site: site.id_site, nama_pic: o.pic_store_nama, no_kontak: o.pic_store_hp, jabatan: 'PIC Store', is_utama: true } });
        }
        await tx.pbOrder.update({
          where: { id_pb: o.id_pb },
          data: { id_site: site.id_site, nomor_pb: `PB-${yy}-${String(++urutPb).padStart(4, '0')}`, tahap: 'OPS', tahap_at: sekarang },
        });
      }
      await tx.pbSph.update({
        where: { id_sph },
        data: { status: 'Disetujui', id_approver: u.id_karyawan, tgl_approval: sekarang, catatan_approval: dto.catatan?.trim() || null },
      });
    });
    await this.catat({ id_sph, id_karyawan: u.id_karyawan, aksi: 'setujui', catatan: dto.catatan?.trim() || null });
    await this.prisma.pbRiwayat.createMany({
      data: s.order.map((o) => ({ id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi: 'setujui', dari_tahap: 'Draft', ke_tahap: 'OPS', catatan: 'SPH disetujui Director' })),
    });
    if (s.id_sales) {
      await this.beriTahu([s.id_sales], {
        tipe: 'pb_sph_disetujui', judul: 'SPH disetujui Director',
        deskripsi: `${s.nomor_sph} · ${s.order.length} site — order masuk OPS untuk pemasangan vendor ISP`, url: `/pasang-baru/sph/${id_sph}`,
      });
    }
    await this.beriTahuRole(PEMEGANG.OPS, {
      tipe: 'pb_masuk', judul: 'Pasang baru masuk OPS',
      deskripsi: `${s.nomor_sph} · ${s.pelanggan.nama_pelanggan} · ${s.order.length} site — pasang vendor ISP`, url: `/pasang-baru/sph/${id_sph}`,
    });
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
    await this.sinkronBa(o);
    const riwayat = await this.prisma.pbRiwayat.findMany({ where: { id_pb }, orderBy: { created_at: 'desc' } });
    const nama = await this.namaKaryawan([o.sph.id_sales, ...riwayat.map((r) => r.id_karyawan)]);
    const tahapBoleh = Object.keys(PEMEGANG).filter((t) => this.boleh(u, t));
    return {
      ...o,
      network: await this.infoNetwork(o),
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
    await this.hapusFileUnggah(l.foto_modem, l.foto_speedtest);
    await this.catat({ id_sph: o.id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: 'Hapus link vendor' });
    return { message: 'Link vendor dihapus' };
  }

  /** Foto modem / screenshot speedtest per link vendor (tahap OPS) */
  async unggahFotoLink(u: Pengguna, id_sumber: number, dto: FotoLinkDto, file: any) {
    if (!file) throw new BadRequestException('File wajib diunggah');
    const { o, l } = await this.linkOrder(u, id_sumber);
    const ext = EXT_DOKUMEN[file.mimetype];
    if (!ext || ext === 'pdf') throw new BadRequestException('Foto harus JPG atau PNG');
    const rel = join('pasang-baru', String(o.id_pb), `${randomBytes(16).toString('hex')}.${ext}`);
    await fsp.mkdir(join(UPLOAD_ROOT, 'pasang-baru', String(o.id_pb)), { recursive: true });
    await fsp.writeFile(join(UPLOAD_ROOT, rel), file.buffer);
    const url = `/uploads/${rel}`;
    const kolom = dto.jenis === 'modem' ? 'foto_modem' : 'foto_speedtest';
    await this.prisma.sumberInternetSite.update({ where: { id_sumber }, data: { [kolom]: url } });
    await this.hapusFileUnggah(l[kolom]);
    await this.catat({ id_sph: o.id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi: 'dokumen', catatan: dto.jenis === 'modem' ? 'Foto modem' : 'Screenshot speedtest' });
    return { data: { url }, message: dto.jenis === 'modem' ? 'Foto modem diunggah' : 'Screenshot speedtest diunggah' };
  }

  private async hapusFileUnggah(...url: (string | null | undefined)[]) {
    for (const x of url) {
      if (x?.startsWith('/uploads/pasang-baru/')) await fsp.rm(join(UPLOAD_ROOT, x.slice('/uploads/'.length)), { force: true }).catch(() => undefined);
    }
  }

  async unggahDokumen(u: Pengguna, id_pb: number, dto: DokumenDto, file: any) {
    if (!file) throw new BadRequestException('File wajib diunggah');
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    if (!o.id_site) throw new BadRequestException('Order belum disetujui Director');
    // Dokumen diunggah oleh pemegang tahap yang sedang berjalan (FAB oleh Sales, BA oleh Instalasi, dst)
    this.wajib(u, o.tahap === 'Batal' ? 'OPS' : o.tahap);
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
    const i = TAHAP.indexOf(o.tahap as any);
    if (i < 1 || i >= TAHAP.length - 1) throw new BadRequestException(o.tahap === 'Selesai' ? 'Order sudah selesai — tahap aktivasi menyusul' : `Order berstatus ${o.tahap}`);
    this.wajib(u, o.tahap);
    const kurang = (await this.syarat(o)).filter((s) => !s.ok);
    if (kurang.length) throw new BadRequestException(`Belum lengkap: ${kurang.map((s) => s.label).join(', ')}`);
    const ke = TAHAP[i + 1];
    await this.pindah(o, ke, u, 'serahkan', dto.catatan);
    const ket = `${o.nomor_pb} · ${o.nama_site} · ${o.sph.pelanggan.nama_pelanggan}`;
    if (ke === 'Network') {
      await this.beriTahuRole(PEMEGANG.Network, { tipe: 'pb_masuk', judul: 'Pasang baru masuk Network — siapkan perangkat', deskripsi: ket, url: `/pasang-baru/order/${id_pb}` });
      if (o.sph.id_sales) await this.beriTahu([o.sph.id_sales], { tipe: 'pb_terpasang', judul: 'Vendor ISP terpasang', deskripsi: ket, url: `/pasang-baru/order/${id_pb}` });
    } else if (ke === 'Selesai') {
      if (o.sph.id_sales) await this.beriTahu([o.sph.id_sales], { tipe: 'pb_selesai', judul: 'Pasang baru selesai — BA aktivasi ditandatangani', deskripsi: ket, url: `/pasang-baru/order/${id_pb}` });
    }
    return { message: ke === 'Network' ? 'Vendor ISP terpasang — order diserahkan ke Network' : ke === 'Selesai' ? 'Order selesai' : `Diserahkan ke ${ke}` };
  }

  /** Order masuk tahap Instalasi → otomatis masuk antrean Jadwal Visit (sekali per order) */
  private async antreVisit(o: { id_pb: number; id_site: number | null; nomor_pb: string | null; nama_site: string; tgl_rfs: Date | null }, u: Pengguna) {
    if (!o.id_site) return;
    try {
      const ada = await this.prisma.workOrder.findFirst({ where: { id_pb: o.id_pb, status_wo: { not: 'Cancelled' } }, select: { id_wo: true } });
      if (ada) return;
      const rfs = o.tgl_rfs ? ` · target RFS ${o.tgl_rfs.toISOString().slice(0, 10)}` : '';
      await buatWo(this.prisma, {
        jenis_wo: 'Instalasi', id_site: o.id_site, id_pb: o.id_pb, tipe_eksekutor: 'Internal_NEXT1', dibuat_oleh: u.id_karyawan ?? null,
        deskripsi_tugas: `Instalasi pasang baru ${o.nomor_pb ?? ''} — ${o.nama_site}${rfs}`.trim(), tgl_jadwal: null,
      });
    } catch (e: any) {
      this.logger.warn(`antrean visit ${o.nomor_pb} gagal: ${e?.message}`);
    }
  }

  async kembalikan(u: Pengguna, id_pb: number, dto: CatatanDto) {
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    const i = TAHAP.indexOf(o.tahap as any);
    if (i < 2) throw new BadRequestException('Order ini tidak bisa dikembalikan');
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
    if (!this.boleh(u, 'Draft')) throw new ForbiddenException('Pembatalan oleh Sales atau Director');
    if (['Draft', 'Selesai', 'Batal'].includes(o.tahap)) throw new BadRequestException(`Order berstatus ${o.tahap}`);
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

  // ── Tahap Network: perangkat, pemasangan, BA ─────────────────────────────────
  private async infoNetwork(o: { id_pb: number; id_wo: number | null }) {
    const [perangkat, wo] = await Promise.all([
      this.prisma.pbPerangkat.findMany({ where: { id_pb: o.id_pb }, orderBy: { id_pb_perangkat: 'asc' } }),
      o.id_wo ? this.prisma.workOrder.findUnique({
        where: { id_wo: o.id_wo },
        include: {
          teknisi: { select: { nama_lengkap: true, no_hp: true } }, vendor: { select: { nama_vendor: true, no_telp: true } },
          kontak_teknisi: { select: { id_kontak: true, nama: true, no_hp: true, asal_vendor: true } },
          pengiriman: { orderBy: { id_pengiriman: 'desc' }, take: 1 }, foto: { select: { id_foto: true, jenis_foto: true, file_path: true } },
        },
      }) : null,
    ]);
    const [aset, pengajuan] = await Promise.all([
      this.prisma.gudangAset.findMany({
        where: { id_aset: { in: perangkat.map((p) => p.id_aset).filter((x): x is number => !!x) } },
        select: { id_aset: true, kode_aset: true, nama_perangkat: true, merk: true, tipe_model: true, serial_number: true, status_aset: true, gudang: { select: { nama_gudang: true } } },
      }),
      this.prisma.pengajuanAset.findMany({
        where: { id_pengajuan: { in: perangkat.map((p) => p.id_pengajuan).filter((x): x is number => !!x) } },
        select: { id_pengajuan: true, nama_item: true, jumlah: true, status_pengajuan: true, id_aset_hasil: true, catatan_approval: true },
      }),
    ]);
    return {
      perangkat: perangkat.map((p) => ({ ...p, aset: aset.find((a) => a.id_aset === p.id_aset) ?? null, pengajuan: pengajuan.find((x) => x.id_pengajuan === p.id_pengajuan) ?? null })),
      wo: wo ? { ...wo, link_lapangan: wo.token_lapangan ? `${process.env.APP_BASE_URL || 'https://1erp.nextone.id'}/v/${wo.token_lapangan}` : null } : null,
    };
  }

  /** Visit/WO pemasangan selesai dengan tanda tangan PIC → jadi BA aktivasi order (sekali) */
  private async sinkronBa(o: { id_pb: number; id_wo: number | null; ba_ttd: string | null; tahap: string; ba_nomor: string | null }) {
    if (!o.id_wo || o.ba_ttd || o.tahap !== 'Network') return;
    const wo = await this.prisma.workOrder.findUnique({ where: { id_wo: o.id_wo }, select: { status_wo: true, ttd_path: true, ttd_nama: true, completed_at: true, teknisi: { select: { nama_lengkap: true } }, vendor: { select: { nama_vendor: true } }, kontak_teknisi: { select: { nama: true, asal_vendor: true } } } });
    if (wo?.status_wo !== 'Completed' || !wo.ttd_path) return;
    const data = {
      ba_nomor: o.ba_nomor ?? (await this.nomorBa()), ba_nama: wo.ttd_nama, ba_ttd: wo.ttd_path, ba_tgl: wo.completed_at ?? new Date(), ba_sumber: 'Lapangan',
      ba_nama_next1: wo.teknisi?.nama_lengkap.trim() ?? wo.kontak_teknisi?.nama ?? wo.vendor?.nama_vendor ?? null,
    };
    Object.assign(o, data);
    await this.prisma.pbOrder.update({ where: { id_pb: o.id_pb }, data });
    await this.catat({ id_pb: o.id_pb, aksi: 'ba', catatan: `BA ${data.ba_nomor} ditandatangani ${wo.ttd_nama ?? ''} (visit)` });
  }

  /** Daftar kurir dari api.co.id (cache 1 hari); bila API tidak bisa diakses pakai daftar bawaan */
  private kurirCache: { at: number; data: { code: string; name: string }[] } | null = null;
  async daftarKurir() {
    if (this.kurirCache && Date.now() - this.kurirCache.at < 86400_000) return this.kurirCache.data;
    const lain = [{ code: 'tiki', name: 'TIKI' }, { code: 'pos', name: 'POS Indonesia' }, { code: 'lalamove', name: 'Lalamove' }, { code: 'gosend', name: 'GoSend' }, { code: 'grab', name: 'GrabExpress' }, { code: 'lainnya', name: 'Lainnya' }];
    const key = process.env.KURIR_API_KEY;
    if (key) {
      try {
        const r = await fetch('https://use.api.co.id/courier/v1/couriers', { headers: { 'x-api-co-id': key }, signal: AbortSignal.timeout(8000) });
        const j: any = await r.json();
        if (j?.is_success && Array.isArray(j.data)) {
          const data = [...j.data.map((x: any) => ({ code: String(x.code), name: String(x.name) })), ...lain];
          this.kurirCache = { at: Date.now(), data };
          return data;
        }
        this.logger.warn(`daftar kurir api.co.id: ${j?.message ?? r.status}`);
      } catch (e: any) {
        this.logger.warn(`daftar kurir api.co.id gagal: ${e?.message}`);
      }
    }
    return [{ code: 'jne', name: 'JNE Express' }, { code: 'jnt', name: 'JNT Express' }, { code: 'sicepat', name: 'Sicepat Express' }, { code: 'anteraja', name: 'Anteraja' }, ...lain];
  }

  private async nomorBa() {
    const d = new Date();
    const prefix = `BA/N1/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/`;
    const akhir = await this.prisma.pbOrder.findFirst({ where: { ba_nomor: { startsWith: prefix } }, orderBy: { ba_nomor: 'desc' }, select: { ba_nomor: true } });
    const n = akhir?.ba_nomor ? parseInt(akhir.ba_nomor.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(3, '0')}`;
  }

  private async idUser(id_karyawan: number) {
    const x = await this.prisma.coreUser.findFirst({ where: { id_karyawan }, select: { id_user: true } });
    return x?.id_user;
  }

  /** Stok perangkat di gudang (Mikrotik / Router dulu) untuk dipilih Network */
  async stokPerangkat(q: { cari?: string }) {
    const kata = (q.cari || '').trim();
    const rows = await this.prisma.gudangAset.findMany({
      where: {
        status_aset: 'Di_Gudang',
        OR: [{ is_serialized: true }, { stok_jumlah: { gt: 0 } }],
        ...(kata ? { OR: [{ nama_perangkat: { contains: kata } }, { merk: { contains: kata } }, { tipe_model: { contains: kata } }, { serial_number: { contains: kata } }, { kode_aset: { contains: kata } }] }
          : { kategori: { in: ['Mikrotik', 'Router'] } }),
      },
      select: { id_aset: true, kode_aset: true, nama_perangkat: true, merk: true, tipe_model: true, serial_number: true, kategori: true, is_serialized: true, stok_jumlah: true, kondisi: true, gudang: { select: { nama_gudang: true } } },
      orderBy: [{ kategori: 'asc' }, { nama_perangkat: 'asc' }],
      take: 200,
    });
    return rows;
  }

  private async orderNetwork(u: Pengguna, id_pb: number) {
    const o = await this.orderDiTahap(u, id_pb, 'Network');
    if (!o.id_site) throw new BadRequestException('Order belum punya site');
    return o as typeof o & { id_site: number };
  }

  async ambilPerangkat(u: Pengguna, id_pb: number, dto: PerangkatDto) {
    const o = await this.orderNetwork(u, id_pb);
    const userId = await this.idUser(u.id_karyawan);
    const aset = await this.prisma.gudangAset.findUnique({ where: { id_aset: dto.id_aset } });
    if (!aset) throw new NotFoundException('Aset tidak ditemukan');
    await this.prisma.$transaction(async (tx) => {
      await this.assets.applyMutasiTx(tx, {
        id_aset: dto.id_aset, jenis_mutasi: 'Deploy', jumlah: 1, id_site_tujuan: o.id_site, id_gudang_asal: aset.id_gudang ?? undefined,
        keterangan: `Pasang baru ${o.nomor_pb} — ${o.nama_site}`,
      }, userId);
      await tx.pbPerangkat.create({ data: { id_pb, id_aset: dto.id_aset, nama_item: [aset.nama_perangkat, aset.tipe_model].filter(Boolean).join(' '), id_karyawan: u.id_karyawan } });
    });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'perangkat', catatan: `${aset.kode_aset} ${aset.nama_perangkat}${aset.serial_number ? ` SN ${aset.serial_number}` : ''}` });
    return { message: `${aset.nama_perangkat} dialokasikan ke ${o.nama_site}` };
  }

  /** Stok kosong → ajukan pembelian (modul Pengajuan Aset, approval Director/Manager Ops) */
  async requestPerangkat(u: Pengguna, id_pb: number, dto: RequestPerangkatDto) {
    const o = await this.orderNetwork(u, id_pb);
    const userId = await this.idUser(u.id_karyawan);
    if (!userId) throw new BadRequestException('Akun pengguna tidak ditemukan');
    const r = await this.assets.createPengajuan({
      nama_item: dto.nama_item.trim(), kategori: 'Mikrotik', jumlah: dto.jumlah ?? 1, estimasi_harga: dto.estimasi_harga ?? 0,
      link_marketplace: dto.link_marketplace?.trim() || undefined,
      alasan: [`Stok kosong untuk pasang baru ${o.nomor_pb} — ${o.nama_site}`, dto.alasan?.trim()].filter(Boolean).join('. '),
    } as any, userId);
    await this.prisma.pbPerangkat.create({ data: { id_pb, id_pengajuan: r.data.id_pengajuan, nama_item: dto.nama_item.trim(), id_karyawan: u.id_karyawan } });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'perangkat', catatan: `Request ${dto.nama_item.trim()} (stok kosong)` });
    return { message: 'Request perangkat diajukan — menunggu approval' };
  }

  /** Lepas perangkat dari order: aset dikembalikan ke gudang (Return) / request dihapus dari daftar */
  async lepasPerangkat(u: Pengguna, id: number) {
    const p = await this.prisma.pbPerangkat.findUnique({ where: { id_pb_perangkat: id } });
    if (!p) throw new NotFoundException('Perangkat tidak ditemukan');
    const o = await this.orderNetwork(u, p.id_pb);
    const userId = await this.idUser(u.id_karyawan);
    await this.prisma.$transaction(async (tx) => {
      if (p.id_aset) {
        const aset = await tx.gudangAset.findUnique({ where: { id_aset: p.id_aset } });
        if (aset && (!aset.is_serialized || (aset.status_aset === 'Terpasang' && aset.id_site === o.id_site))) {
          await this.assets.applyMutasiTx(tx, { id_aset: p.id_aset, jenis_mutasi: 'Return', jumlah: 1, id_site_asal: o.id_site, keterangan: `Batal dipakai pasang baru ${o.nomor_pb}` }, userId);
        }
      }
      await tx.pbPerangkat.delete({ where: { id_pb_perangkat: id } });
    });
    await this.catat({ id_sph: o.id_sph, id_pb: o.id_pb, id_karyawan: u.id_karyawan, aksi: 'perangkat', catatan: `Lepas ${p.nama_item}` });
    return { message: p.id_aset ? 'Perangkat dikembalikan ke gudang' : 'Request dihapus dari daftar' };
  }

  /** Request yang sudah selesai dibeli (aset hasil) → alokasikan ke order */
  async pakaiHasilRequest(u: Pengguna, id: number) {
    const p = await this.prisma.pbPerangkat.findUnique({ where: { id_pb_perangkat: id } });
    if (!p?.id_pengajuan || p.id_aset) throw new BadRequestException('Bukan request yang menunggu');
    const g = await this.prisma.pengajuanAset.findUnique({ where: { id_pengajuan: p.id_pengajuan } });
    if (!g?.id_aset_hasil) throw new BadRequestException('Barang request belum masuk gudang');
    const r = await this.ambilPerangkat(u, p.id_pb, { id_aset: g.id_aset_hasil });
    await this.prisma.pbPerangkat.delete({ where: { id_pb_perangkat: id } });
    return r;
  }

  /** Atur pemasangan: kirim via ekspedisi + vendor teknisi, atau visit teknisi internal (antrean Jadwal Visit) */
  async simpanNetwork(u: Pengguna, id_pb: number, dto: NetworkDto) {
    const o = await this.orderNetwork(u, id_pb);
    const perangkat = await this.prisma.pbPerangkat.findMany({ where: { id_pb } });
    const daftar = perangkat.map((p) => p.nama_item).join(', ') || 'Mikrotik';
    const vendor = dto.metode === 'Kirim_Vendor';
    let id_kontak_teknisi = dto.id_kontak_teknisi ?? null;
    if (vendor && dto.kontak_baru) {
      const hp = dto.kontak_baru.no_hp.replace(/[^\d+]/g, '');
      const ada = await this.prisma.masterKontakTeknisi.findFirst({ where: { no_hp: { in: [hp, hp.replace(/^\+?62/, '0'), hp.replace(/^0/, '62')] } } });
      id_kontak_teknisi = ada?.id_kontak ?? (await this.prisma.masterKontakTeknisi.create({
        data: { nama: dto.kontak_baru.nama.trim(), no_hp: hp, asal_vendor: dto.kontak_baru.asal_vendor?.trim() || null, catatan: `Ditambahkan dari pasang baru ${o.nomor_pb}` },
      })).id_kontak;
    }
    if (vendor && !id_kontak_teknisi) throw new BadRequestException('Pilih teknisi vendor dari kontak teknisi, atau tambah teknisi baru');
    if (vendor && !(await this.prisma.masterKontakTeknisi.findUnique({ where: { id_kontak: id_kontak_teknisi! } }))) throw new BadRequestException('Kontak teknisi tidak ditemukan');
    const deskripsi = `Pasang baru ${o.nomor_pb} — ${o.nama_site}: pasang & konfigurasi ${daftar}, tanda tangan BA aktivasi oleh PIC.${dto.catatan?.trim() ? ` ${dto.catatan.trim()}` : ''}`;
    let wo = o.id_wo ? await this.prisma.workOrder.findUnique({ where: { id_wo: o.id_wo } }) : null;
    if (wo && ['Completed', 'Cancelled'].includes(wo.status_wo) && wo.status_wo === 'Completed') throw new BadRequestException('Pemasangan sudah selesai');
    if (wo?.status_wo === 'Cancelled') wo = null;
    const dataWo = {
      tipe_eksekutor: vendor ? 'Vendor_Ketiga' : 'Internal_NEXT1',
      id_vendor_ketiga: vendor ? dto.id_vendor_ketiga ?? null : null,
      id_kontak_teknisi: vendor ? id_kontak_teknisi : null,
      fee_vendor: vendor ? dto.fee_vendor ?? 0 : 0,
      ...(vendor ? { tgl_jadwal: dto.tgl_jadwal ? new Date(dto.tgl_jadwal) : null, id_teknisi_internal: null } : {}),
      deskripsi_tugas: deskripsi,
    };
    if (wo) {
      // Ganti metode internal → vendor: lepas dari jadwal teknisi internal
      wo = await this.prisma.workOrder.update({ where: { id_wo: wo.id_wo }, data: dataWo });
    } else {
      wo = await buatWo(this.prisma, { jenis_wo: 'Instalasi', id_site: o.id_site, id_pb, dibuat_oleh: u.id_karyawan, ...dataWo });
    }
    if (vendor && !wo.token_lapangan) {
      wo = await this.prisma.workOrder.update({ where: { id_wo: wo.id_wo }, data: { token_lapangan: randomBytes(18).toString('base64url') } });
    }
    // Pengiriman ekspedisi (satu per WO)
    if (vendor) {
      const kirim = await this.prisma.pengirimanPerangkat.findFirst({ where: { id_wo: wo.id_wo } });
      const dataKirim = {
        jenis_pengiriman: 'Ekspedisi', nama_ekspedisi: dto.nama_ekspedisi?.trim() || null, nomor_resi: dto.nomor_resi?.trim() || null,
        tgl_kirim: dto.tgl_kirim ? new Date(dto.tgl_kirim) : null, status_pengiriman: dto.status_pengiriman || 'Packing',
        ...(dto.status_pengiriman === 'Diterima' ? { tgl_terima: new Date() } : {}),
      };
      // Resi / kurir manual diganti → hasil lacak lama tidak berlaku
      const ganti = kirim && !kirim.kurir_order_id && (kirim.nomor_resi !== dataKirim.nomor_resi || kirim.nama_ekspedisi !== dataKirim.nama_ekspedisi);
      if (kirim) await this.prisma.pengirimanPerangkat.update({
        where: { id_pengiriman: kirim.id_pengiriman },
        data: { ...dataKirim, ...(ganti ? { kurir_status: null, kurir_riwayat: null, kurir_cek_at: null, kurir_kode: null, kurir_layanan: null } : {}) },
      });
      else {
        await this.prisma.pengirimanPerangkat.create({
          data: { id_wo: wo.id_wo, ...dataKirim, items: { create: perangkat.map((p) => ({ id_aset: p.id_aset, nama_item: p.nama_item })) } },
        });
      }
    }
    await this.prisma.pbOrder.update({ where: { id_pb }, data: { network_metode: dto.metode, id_wo: wo.id_wo } });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: vendor ? `Kirim + vendor teknisi · ${wo.nomor_wo}` : `Visit teknisi internal · ${wo.nomor_wo}` });
    let pesanWa = '';
    if (vendor && dto.kirim_wa) {
      try { pesanWa = ` · ${(await this.kirimWaTeknisi(u, id_pb)).message}`; } catch (e: any) { pesanWa = ` · WA gagal: ${e?.response?.message || e?.message}`; }
    }
    return { message: (vendor ? 'Pengiriman & teknisi vendor disimpan' : `Masuk antrean Jadwal Visit (${wo.nomor_wo})`) + pesanWa };
  }

  async daftarKontakTeknisi() {
    return this.prisma.masterKontakTeknisi.findMany({
      where: { is_aktif: true }, select: { id_kontak: true, nama: true, no_hp: true, asal_vendor: true, keahlian: true }, orderBy: { nama: 'asc' },
    });
  }

  /** Kirim tugas pemasangan + link lapangan ke WA teknisi vendor (akun WA helpdesk ERP) */
  async kirimWaTeknisi(u: Pengguna, id_pb: number) {
    const o = await this.orderNetwork(u, id_pb);
    if (!o.id_wo) throw new BadRequestException('Atur pemasangan dulu');
    const wo = await this.prisma.workOrder.findUnique({
      where: { id_wo: o.id_wo },
      include: { kontak_teknisi: true, pengiriman: { orderBy: { id_pengiriman: 'desc' }, take: 1 } },
    });
    if (!wo?.kontak_teknisi) throw new BadRequestException('Pemasangan ini tidak memakai teknisi vendor');
    const [sph, perangkat] = await Promise.all([
      this.prisma.pbSph.findUnique({ where: { id_sph: o.id_sph }, include: { pelanggan: { select: { nama_pelanggan: true } } } }),
      this.prisma.pbPerangkat.findMany({ where: { id_pb } }),
    ]);
    const k = wo.pengiriman[0];
    const fmt = (d: Date | null) => (d ? d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : null);
    const pic = [o.pic_store_nama || sph?.nama_pic, o.pic_store_hp || sph?.telp_pic].filter(Boolean).join(' — ');
    const baris = [
      `Halo ${wo.kontak_teknisi.nama}, ada tugas pemasangan dari *NEXT1*:`,
      '',
      `📍 *${o.nama_site}* — ${sph?.pelanggan.nama_pelanggan ?? ''}`,
      `${o.alamat}${o.lantai_unit ? ` — ${o.lantai_unit}` : ''}${o.kota ? `, ${o.kota}` : ''}`,
      pic ? `👤 PIC: ${pic}` : '',
      `🖧 Perangkat: ${perangkat.map((p) => p.nama_item).join(', ') || '-'}`,
      k?.nama_ekspedisi || k?.nomor_resi ? `🚚 Dikirim via ${k?.nama_ekspedisi ?? '-'}${k?.nomor_resi ? ` · resi ${k.nomor_resi}` : ''}` : '',
      wo.tgl_jadwal ? `📅 Jadwal: ${fmt(wo.tgl_jadwal)}` : '',
      '',
      `Saat di lokasi, lapor check-in, foto, dan minta tanda tangan BA ke PIC lewat link ini:`,
      `${process.env.APP_BASE_URL || 'https://1erp.nextone.id'}/v/${wo.token_lapangan}`,
      '',
      `No. ${wo.nomor_wo} · ${o.nomor_pb}`,
    ].filter((x, i, a) => x !== '' || (i > 0 && a[i - 1] !== ''));
    await this.wa.kirimKeNomor(wo.kontak_teknisi.no_hp, baris.join('\n'), u.id_karyawan);
    await this.prisma.workOrder.update({ where: { id_wo: wo.id_wo }, data: { wa_teknisi_at: new Date() } });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'wa', catatan: `WA tugas ke ${wo.kontak_teknisi.nama} (${wo.kontak_teknisi.no_hp})` });
    return { message: `WA terkirim ke ${wo.kontak_teknisi.nama}` };
  }

  /** Vendor teknisi selesai (dilaporkan Network bila vendor tidak memakai link lapangan) */
  async selesaiPemasangan(u: Pengguna, id_pb: number, dto: CatatanDto) {
    const o = await this.orderNetwork(u, id_pb);
    if (!o.id_wo) throw new BadRequestException('Atur pemasangan dulu');
    const wo = await this.prisma.workOrder.findUnique({ where: { id_wo: o.id_wo } });
    if (!wo || wo.status_wo === 'Completed') throw new BadRequestException('Pemasangan sudah selesai');
    if (wo.tipe_eksekutor !== 'Vendor_Ketiga') throw new BadRequestException('Visit internal diselesaikan teknisi lewat link lapangan / Jadwal Visit');
    await this.prisma.workOrder.update({
      where: { id_wo: wo.id_wo },
      data: { status_wo: 'Completed', completed_at: new Date(), catatan_teknisi: [wo.catatan_teknisi, `[Selesai, dicatat Network] ${dto.catatan?.trim() || ''}`.trim()].filter(Boolean).join('\n') },
    });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'ubah', catatan: 'Pemasangan vendor selesai' });
    return { message: 'Pemasangan ditandai selesai' };
  }

  /** Tanda tangan BA langsung di ERP (bila tidak lewat link lapangan) */
  async tandaTanganBa(u: Pengguna, id_pb: number, dto: BaDto) {
    const o = await this.orderNetwork(u, id_pb);
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dto.ttd);
    if (!m) throw new BadRequestException('Tanda tangan tidak valid');
    const rel = join('pasang-baru', String(id_pb), `ba-${randomBytes(8).toString('hex')}.png`);
    await fsp.mkdir(join(UPLOAD_ROOT, 'pasang-baru', String(id_pb)), { recursive: true });
    await fsp.writeFile(join(UPLOAD_ROOT, rel), Buffer.from(m[1], 'base64'));
    if (o.ba_ttd && o.ba_sumber === 'ERP') await this.hapusFileUnggah(o.ba_ttd);
    const nama = await this.namaKaryawan([u.id_karyawan]);
    const ba_nomor = o.ba_nomor ?? (await this.nomorBa());
    await this.prisma.pbOrder.update({
      where: { id_pb },
      data: {
        ba_nomor, ba_nama: dto.nama.trim(), ba_jabatan: dto.jabatan?.trim() || null, ba_ttd: `/uploads/${rel}`, ba_tgl: new Date(), ba_sumber: 'ERP',
        ba_nama_next1: dto.nama_next1?.trim() || nama.get(u.id_karyawan) || null,
      },
    });
    await this.catat({ id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'ba', catatan: `BA ${ba_nomor} ditandatangani ${dto.nama.trim()}` });
    return { message: `BA ${ba_nomor} ditandatangani` };
  }

  // ── Pembantu ─────────────────────────────────────────────────────────────────
  /** Syarat untuk menyerahkan order dari tahapnya sekarang */
  private async syarat(o: { id_pb: number; id_site: number | null; tahap: string }) {
    if (o.tahap === 'Network') {
      const [perangkat, wo] = await Promise.all([
        this.prisma.pbPerangkat.findMany({ where: { id_pb: o.id_pb } }),
        (o as any).id_wo ? this.prisma.workOrder.findUnique({ where: { id_wo: (o as any).id_wo }, select: { status_wo: true } }) : null,
      ]);
      return [
        { label: 'Perangkat dari stok gudang', ok: perangkat.some((p) => p.id_aset) && !perangkat.some((p) => !p.id_aset) },
        { label: 'Pemasangan (kirim + vendor / visit internal) selesai', ok: wo?.status_wo === 'Completed' },
        { label: 'BA aktivasi ditandatangani', ok: !!(o as any).ba_ttd },
      ];
    }
    if (o.tahap === 'OPS') {
      const link = o.id_site ? await this.prisma.sumberInternetSite.findMany({ where: { id_site: o.id_site } }) : [];
      const cek = (f: (l: (typeof link)[number]) => unknown) => link.length > 0 && link.every((l) => !!f(l));
      return [
        { label: 'Link vendor ISP', ok: link.length > 0 },
        { label: 'ID pelanggan vendor', ok: cek((l) => l.nomor_pelanggan_isp) },
        { label: 'Tanggal modem terpasang', ok: cek((l) => l.tgl_mulai) },
        { label: 'SN modem', ok: cek((l) => l.sn_modem) },
        { label: 'Foto modem', ok: cek((l) => l.foto_modem) },
        { label: 'Hasil speedtest (download, upload & screenshot)', ok: cek((l) => Number(l.speedtest_down) > 0 && Number(l.speedtest_up) > 0 && l.foto_speedtest) },
      ];
    }
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
      ...(d.deposit_jenis !== undefined ? { deposit_jenis: d.deposit_jenis || null } : {}),
      ...(d.speedtest_down !== undefined ? { speedtest_down: d.speedtest_down || null } : {}),
      ...(d.speedtest_up !== undefined ? { speedtest_up: d.speedtest_up || null } : {}),
      ...(d.speedtest_ping !== undefined ? { speedtest_ping: d.speedtest_ping ?? null } : {}),
      ...(d.deposit_status !== undefined ? { deposit_status: d.deposit_status || null } : {}),
      ...(d.catatan !== undefined ? { catatan: d.catatan.trim() || null } : {}),
    };
  }

  /** Baris site SPH yang berasal dari survey: cek milik survey & cover, ambil IKG hasil OPS */
  private async opsSurveySite(dto: SphDto, id_survey: number | null) {
    const ids = dto.site.map((x) => x.id_survey_site).filter((x): x is number => !!x);
    if (!ids.length) return new Map<number, { ikg_nominal: Prisma.Decimal; ikg_pengelola: string | null; ikg_catatan: string | null }>();
    if (!id_survey) throw new BadRequestException('Baris survey hanya untuk SPH yang dibuat dari survey');
    const rows = await this.prisma.pbSurveySite.findMany({ where: { id_survey_site: { in: ids } } });
    for (const id of ids) {
      const x = rows.find((r) => r.id_survey_site === id);
      if (!x || x.id_survey !== id_survey) throw new BadRequestException('Site survey tidak termasuk survey SPH ini');
      if (x.cover !== 'Cover') throw new BadRequestException(`Site "${x.nama_site}" tidak cover (hold) — tidak bisa masuk SPH`);
    }
    return new Map(rows.map((x) => [x.id_survey_site, { ikg_nominal: x.ikg_nominal, ikg_pengelola: x.ikg_pengelola, ikg_catatan: x.ikg_catatan }]));
  }

  private dataBaris(x: SphDto['site'][number], urutan: number, ops?: Map<number, { ikg_nominal: Prisma.Decimal; ikg_pengelola: string | null; ikg_catatan: string | null }>) {
    const o = x.id_survey_site ? ops?.get(x.id_survey_site) : undefined;
    return {
      id_survey_site: o ? x.id_survey_site! : null,
      ...(o ? { ikg_nominal: o.ikg_nominal, ikg_pengelola: o.ikg_pengelola, ikg_catatan: o.ikg_catatan } : {}),
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

  /** SPH dari survey dihapus → survey kembali "Siap SPH" bila tidak ada SPH lain */
  private async bukaLagiSurvey(id_survey: number | null, u: Pengguna, nomor_sph: string) {
    if (!id_survey) return;
    if (await this.prisma.pbSph.count({ where: { id_survey } })) return;
    await this.prisma.pbSurvey.updateMany({ where: { id_survey, status: 'Lanjut SPH' }, data: { status: 'Siap SPH', status_at: new Date() } });
    await this.catat({ id_survey, id_karyawan: u.id_karyawan, aksi: 'sph_hapus', catatan: nomor_sph });
  }

  private async nomorSurvey() {
    const d = new Date();
    const prefix = `SRV/N1/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/`;
    const akhir = await this.prisma.pbSurvey.findFirst({ where: { nomor_survey: { startsWith: prefix } }, orderBy: { nomor_survey: 'desc' }, select: { nomor_survey: true } });
    const n = akhir ? parseInt(akhir.nomor_survey.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(3, '0')}`;
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

  private catat(r: { id_survey?: number | null; id_sph?: number | null; id_pb?: number | null; id_karyawan?: number | null; aksi: string; dari_tahap?: string | null; ke_tahap?: string | null; catatan?: string | null }) {
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
