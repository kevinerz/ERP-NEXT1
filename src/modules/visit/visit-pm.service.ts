import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AturanPmDto } from './dto';
import { buatWo, strWib, tglWib } from './visit.service';

const HARI = 86400_000;
// Kunjungan yang dianggap "sudah dicek di lokasi" untuk menghitung jatuh tempo maintenance berikutnya
const JENIS_DIHITUNG = ['Maintenance', 'Instalasi'];

/**
 * Maintenance rutin: tiap pagi, untuk setiap aturan aktif, site Aktif yang cocok dan sudah jatuh tempo
 * (terakhir maintenance/instalasi selesai + interval; belum pernah → mulai tgl_mulai aturan) dibuatkan visit Maintenance di antrean.
 * Dibatasi maks_per_hari per aturan & tidak menambah bila antrean aturan itu sudah menumpuk.
 */
@Injectable()
export class VisitPmService {
  private readonly logger = new Logger('MaintenanceRutin');
  constructor(private prisma: PrismaService) {}

  async daftar() {
    const aturan = await this.prisma.visitPmAturan.findMany({ orderBy: [{ is_aktif: 'desc' }, { nama: 'asc' }] });
    const pel = await this.prisma.pelanggan.findMany({
      where: { id_pelanggan: { in: aturan.map((a) => a.id_pelanggan).filter((x): x is number => !!x) } },
      select: { id_pelanggan: true, nama_pelanggan: true },
    });
    const nama = new Map(pel.map((p) => [p.id_pelanggan, p.nama_pelanggan]));
    const data = await Promise.all(aturan.map(async (a) => ({ ...a, pelanggan: a.id_pelanggan ? nama.get(a.id_pelanggan) ?? null : null, ...(await this.hitung(a)) })));
    return { data };
  }

  async pelanggan() {
    const rows = await this.prisma.sitePelanggan.groupBy({ by: ['id_pelanggan'], where: { status_site: 'Aktif' }, _count: { _all: true } });
    const pel = await this.prisma.pelanggan.findMany({ where: { id_pelanggan: { in: rows.map((r) => r.id_pelanggan) } }, select: { id_pelanggan: true, nama_pelanggan: true } });
    const n = new Map(rows.map((r) => [r.id_pelanggan, r._count._all]));
    return { data: pel.map((p) => ({ ...p, site_aktif: n.get(p.id_pelanggan) ?? 0 })).sort((a, b) => b.site_aktif - a.site_aktif) };
  }

  async simpan(id: number | null, dto: AturanPmDto) {
    const data = {
      nama: dto.nama.trim(), id_pelanggan: dto.id_pelanggan || null, kota: dto.kota?.trim() || null, interval_hari: dto.interval_hari,
      maks_per_hari: dto.maks_per_hari, tgl_mulai: tglWib(dto.tgl_mulai || strWib(new Date())), prioritas: dto.prioritas || 'Rendah', deskripsi: dto.deskripsi.trim(), is_aktif: dto.is_aktif ?? true,
    };
    if (id) {
      const a = await this.prisma.visitPmAturan.findUnique({ where: { id_aturan: id } });
      if (!a) throw new NotFoundException('Aturan tidak ditemukan');
      await this.prisma.visitPmAturan.update({ where: { id_aturan: id }, data });
      return { message: 'Aturan disimpan' };
    }
    await this.prisma.visitPmAturan.create({ data });
    return { message: 'Aturan dibuat' };
  }

  async hapus(id: number) {
    const a = await this.prisma.visitPmAturan.findUnique({ where: { id_aturan: id } });
    if (!a) throw new NotFoundException('Aturan tidak ditemukan');
    await this.prisma.visitPmAturan.delete({ where: { id_aturan: id } });
    return { message: 'Aturan dihapus (visit yang sudah dibuat tetap ada)' };
  }

  /** Site cocok + tanggal jatuh temponya, diurutkan paling lama terlewat */
  private async jatuhTempo(a: { id_aturan: number; id_pelanggan: number | null; kota: string | null; interval_hari: number; tgl_mulai: Date | null; created_at: Date }) {
    const site = await this.prisma.sitePelanggan.findMany({
      where: { status_site: 'Aktif', ...(a.id_pelanggan ? { id_pelanggan: a.id_pelanggan } : {}), ...(a.kota ? { kota: { contains: a.kota } } : {}) },
      select: { id_site: true, kode_site: true },
    });
    if (!site.length) return { site: [], terbuka: new Set<number>() };
    const ids = site.map((s) => s.id_site);
    const [terakhir, terbuka] = await Promise.all([
      this.prisma.workOrder.groupBy({
        by: ['id_site'], where: { id_site: { in: ids }, status_wo: 'Completed', jenis_wo: { in: JENIS_DIHITUNG } }, _max: { completed_at: true },
      }),
      this.prisma.workOrder.findMany({ where: { id_site: { in: ids }, jenis_wo: 'Maintenance', status_wo: { in: ['Open', 'In_Progress'] } }, select: { id_site: true } }),
    ]);
    const akhir = new Map(terakhir.map((t) => [t.id_site, t._max.completed_at]));
    const mulai = a.tgl_mulai ?? a.created_at;
    const list = site.map((s) => {
      const t = akhir.get(s.id_site);
      return { id_site: s.id_site, kode: s.kode_site, tempo: t ? new Date(t.getTime() + a.interval_hari * HARI) : mulai, pernah: !!t };
    }).sort((x, y) => +x.tempo - +y.tempo || x.kode.localeCompare(y.kode)); // kode berurutan → store berdekatan cenderung bersama
    return { site: list, terbuka: new Set(terbuka.map((t) => t.id_site)) };
  }

  private async hitung(a: Parameters<VisitPmService['jatuhTempo']>[0]) {
    const { site, terbuka } = await this.jatuhTempo(a);
    const now = Date.now();
    const bebas = site.filter((s) => !terbuka.has(s.id_site));
    const antrean = await this.prisma.workOrder.count({ where: { id_aturan: a.id_aturan, status_wo: { in: ['Open', 'In_Progress'] } } });
    return {
      jumlah_site: site.length,
      jatuh_tempo: bebas.filter((s) => +s.tempo <= now).length,
      tempo_30hari: bebas.filter((s) => +s.tempo > now && +s.tempo <= now + 30 * HARI).length,
      antrean_aktif: antrean,
      dibuat_total: await this.prisma.workOrder.count({ where: { id_aturan: a.id_aturan } }),
    };
  }

  /** Buat visit maintenance untuk satu aturan. Mengembalikan jumlah visit yang dibuat. */
  private async jalankanAturan(a: Parameters<VisitPmService['jatuhTempo']>[0] & { nama: string; maks_per_hari: number; prioritas: string; deskripsi: string }) {
    const awalHari = new Date(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00+07:00');
    const [hariIni, antrean] = await Promise.all([
      this.prisma.workOrder.count({ where: { id_aturan: a.id_aturan, created_at: { gte: awalHari } } }),
      this.prisma.workOrder.count({ where: { id_aturan: a.id_aturan, status_wo: 'Open', tgl_jadwal: null } }),
    ]);
    // Antrean aturan ini belum dijadwalkan masih menumpuk → jangan tambah
    let sisa = Math.min(a.maks_per_hari - hariIni, a.maks_per_hari * 5 - antrean);
    if (sisa <= 0) return 0;
    const { site, terbuka } = await this.jatuhTempo(a);
    const now = Date.now();
    let dibuat = 0;
    for (const s of site) {
      if (sisa <= 0 || +s.tempo > now) break;
      if (terbuka.has(s.id_site)) continue;
      await buatWo(this.prisma, {
        jenis_wo: 'Maintenance', id_site: s.id_site, id_aturan: a.id_aturan, prioritas: a.prioritas, tipe_eksekutor: 'Internal_NEXT1',
        deskripsi_tugas: `${a.deskripsi}\n(Maintenance rutin "${a.nama}" · tiap ${a.interval_hari} hari${s.pernah ? '' : ' · belum pernah maintenance'})`,
      });
      sisa--; dibuat++;
    }
    await this.prisma.visitPmAturan.update({ where: { id_aturan: a.id_aturan }, data: { terakhir_jalan: new Date() } });
    return dibuat;
  }

  async jalankan(id?: number) {
    const aturan = await this.prisma.visitPmAturan.findMany({ where: id ? { id_aturan: id } : { is_aktif: true } });
    if (id && !aturan.length) throw new NotFoundException('Aturan tidak ditemukan');
    if (id && !aturan[0].is_aktif) throw new BadRequestException('Aturan nonaktif');
    let total = 0;
    for (const a of aturan) {
      try { total += await this.jalankanAturan(a); } catch (e: any) { this.logger.warn(`aturan ${a.nama}: ${e?.message}`); }
    }
    return { data: { dibuat: total }, message: total ? `${total} visit maintenance masuk antrean` : 'Tidak ada site yang jatuh tempo (atau kuota hari ini sudah terpenuhi)' };
  }

  // Tiap pagi 06:00 WIB
  @Cron('0 6 * * *', { timeZone: 'Asia/Jakarta' })
  async harian() {
    const r = await this.jalankan();
    if (r.data.dibuat) this.logger.log(r.message);
  }
}
