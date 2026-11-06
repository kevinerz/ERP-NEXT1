import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PEMBUAT_SEED, QC_SEED } from './qc-seed';

export const STATUS_MODUL = ['Baik', 'Perlu revisi', 'Kritis', 'Belum dipakai', 'Belum dievaluasi'];
export const JENIS_CATATAN = ['Bug', 'Revisi', 'Upgrade', 'Data', 'Keamanan', 'Saran'];
export const PRIORITAS = ['Tinggi', 'Sedang', 'Rendah'];
export const STATUS_CATATAN = ['Baru', 'Dikerjakan', 'Selesai', 'Ditolak'];
const PENGELOLA = ['Admin', 'Director', 'Manager_Ops'];

interface Pengguna { id_karyawan?: number; roles?: string[]; nama?: string; nama_lengkap?: string; username?: string; email?: string }

/** QC / evaluasi ERP: daftar modul, status & skor, catatan revisi / bug / upgrade */
@Injectable()
export class QcService implements OnModuleInit {
  private readonly logger = new Logger('QC');
  constructor(private prisma: PrismaService) {}

  /** Isi awal (sekali, saat tabel masih kosong) */
  async onModuleInit() {
    try {
      if (await this.prisma.qcModul.count()) return;
      let urutan = 0;
      for (const m of QC_SEED) {
        await this.prisma.qcModul.create({
          data: {
            kode: m.kode, grup: m.grup, nama: m.nama, path: m.path ?? null, deskripsi: m.deskripsi, status: m.status, skor: m.skor ?? null,
            urutan: (urutan += 10), diubah_oleh: PEMBUAT_SEED,
            catatan: { create: (m.catatan ?? []).map((c) => ({ jenis: c.jenis, prioritas: c.prioritas, judul: c.judul, isi: c.isi ?? null, pembuat: PEMBUAT_SEED })) },
          },
        });
      }
      this.logger.log(`Isi awal QC: ${QC_SEED.length} modul`);
    } catch (e: any) {
      this.logger.warn(`Isi awal QC gagal: ${e?.message}`);
    }
  }

  private async namaPengguna(u: Pengguna) {
    if (u.id_karyawan) {
      const k = await this.prisma.hrisKaryawan.findUnique({ where: { id_karyawan: u.id_karyawan }, select: { nama_lengkap: true } }).catch(() => null);
      if (k?.nama_lengkap) return k.nama_lengkap.trim();
    }
    return u.nama_lengkap || u.nama || u.username || u.email || 'Pengguna';
  }
  private pengelola(u: Pengguna) { return (u.roles ?? []).some((r) => PENGELOLA.includes(r)); }

  async daftar() {
    const modul = await this.prisma.qcModul.findMany({ orderBy: [{ urutan: 'asc' }, { id: 'asc' }], include: { catatan: { orderBy: [{ created_at: 'desc' }] } } });
    return { data: modul, meta: { status_modul: STATUS_MODUL, jenis: JENIS_CATATAN, prioritas: PRIORITAS, status_catatan: STATUS_CATATAN } };
  }

  async ubahModul(id: number, d: { status?: string; skor?: number | null; pic?: string | null; deskripsi?: string | null }, u: Pengguna) {
    if (!this.pengelola(u)) throw new ForbiddenException('Hanya Admin / Director / Manager Ops yang bisa mengubah status modul');
    const m = await this.prisma.qcModul.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Modul tidak ditemukan');
    if (d.status !== undefined && !STATUS_MODUL.includes(d.status)) throw new BadRequestException('Status tidak dikenal');
    if (d.skor !== undefined && d.skor !== null && (d.skor < 1 || d.skor > 5)) throw new BadRequestException('Skor 1–5');
    const data: any = { diubah_oleh: await this.namaPengguna(u) };
    if (d.status !== undefined) data.status = d.status;
    if (d.skor !== undefined) data.skor = d.skor;
    if (d.pic !== undefined) data.pic = d.pic?.trim() || null;
    if (d.deskripsi !== undefined) data.deskripsi = d.deskripsi?.trim() || null;
    return { data: await this.prisma.qcModul.update({ where: { id }, data }), message: 'Modul diperbarui' };
  }

  async tambahModul(d: { grup: string; nama: string; path?: string; deskripsi?: string }, u: Pengguna) {
    if (!this.pengelola(u)) throw new ForbiddenException('Hanya Admin / Director / Manager Ops yang bisa menambah modul');
    const nama = d.nama?.trim();
    if (!nama || !d.grup?.trim()) throw new BadRequestException('Grup & nama wajib');
    const kode = nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) + '-' + Date.now().toString(36).slice(-4);
    const maks = await this.prisma.qcModul.aggregate({ _max: { urutan: true } });
    return { data: await this.prisma.qcModul.create({ data: { kode, grup: d.grup.trim(), nama, path: d.path?.trim() || null, deskripsi: d.deskripsi?.trim() || null, urutan: (maks._max.urutan ?? 0) + 10, diubah_oleh: await this.namaPengguna(u) } }), message: 'Modul ditambahkan' };
  }

  async tambahCatatan(id_modul: number, d: { jenis: string; prioritas?: string; judul: string; isi?: string }, u: Pengguna) {
    const m = await this.prisma.qcModul.findUnique({ where: { id: id_modul }, select: { id: true } });
    if (!m) throw new NotFoundException('Modul tidak ditemukan');
    if (!JENIS_CATATAN.includes(d.jenis)) throw new BadRequestException('Jenis catatan tidak dikenal');
    if (d.prioritas && !PRIORITAS.includes(d.prioritas)) throw new BadRequestException('Prioritas tidak dikenal');
    const judul = d.judul?.trim();
    if (!judul) throw new BadRequestException('Judul wajib diisi');
    return {
      data: await this.prisma.qcCatatan.create({ data: { id_modul, jenis: d.jenis, prioritas: d.prioritas || 'Sedang', judul: judul.slice(0, 200), isi: d.isi?.trim() || null, pembuat: await this.namaPengguna(u), id_karyawan: u.id_karyawan ?? null } }),
      message: 'Catatan ditambahkan',
    };
  }

  async ubahCatatan(id: number, d: { jenis?: string; prioritas?: string; status?: string; judul?: string; isi?: string | null }, u: Pengguna) {
    const c = await this.prisma.qcCatatan.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Catatan tidak ditemukan');
    const milik = !!u.id_karyawan && c.id_karyawan === u.id_karyawan;
    // Isi catatan hanya oleh pembuat / pengelola; status boleh diubah pengelola
    if (!milik && !this.pengelola(u)) throw new ForbiddenException('Hanya pembuat catatan atau Admin / Director / Manager Ops');
    const data: any = {};
    if (d.jenis !== undefined) { if (!JENIS_CATATAN.includes(d.jenis)) throw new BadRequestException('Jenis tidak dikenal'); data.jenis = d.jenis; }
    if (d.prioritas !== undefined) { if (!PRIORITAS.includes(d.prioritas)) throw new BadRequestException('Prioritas tidak dikenal'); data.prioritas = d.prioritas; }
    if (d.status !== undefined) {
      if (!STATUS_CATATAN.includes(d.status)) throw new BadRequestException('Status tidak dikenal');
      data.status = d.status;
      data.selesai_at = d.status === 'Selesai' ? new Date() : null;
    }
    if (d.judul !== undefined) { const j = d.judul.trim(); if (!j) throw new BadRequestException('Judul wajib diisi'); data.judul = j.slice(0, 200); }
    if (d.isi !== undefined) data.isi = d.isi?.trim() || null;
    return { data: await this.prisma.qcCatatan.update({ where: { id }, data }), message: 'Catatan diperbarui' };
  }

  async hapusCatatan(id: number, u: Pengguna) {
    const c = await this.prisma.qcCatatan.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Catatan tidak ditemukan');
    if (!(u.id_karyawan && c.id_karyawan === u.id_karyawan) && !this.pengelola(u)) throw new ForbiddenException('Hanya pembuat catatan atau Admin / Director / Manager Ops');
    await this.prisma.qcCatatan.delete({ where: { id } });
    return { message: 'Catatan dihapus' };
  }
}
