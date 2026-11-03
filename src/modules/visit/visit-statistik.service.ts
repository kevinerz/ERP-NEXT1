import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { strWib, tglWib } from './visit.service';

const HARI = 86400_000;
const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};
const koordinat = (s: string | null | undefined) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s || '');
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? { lat, lng } : null;
};

/** KPI teknisi & peta kunjungan — dihitung dari visit_log (kejadian check-in / selesai / gagal) */
@Injectable()
export class VisitStatistikService {
  constructor(private prisma: PrismaService) {}

  private periode(q: { dari?: string; sampai?: string }) {
    const hariIni = strWib(new Date());
    const sampai = q.sampai || hariIni;
    const dari = q.dari || strWib(new Date(tglWib(sampai).getTime() - 29 * HARI));
    const awal = tglWib(dari), akhir = new Date(tglWib(sampai).getTime() + HARI);
    if (akhir <= awal) throw new BadRequestException('Rentang tanggal tidak valid');
    if (akhir.getTime() - awal.getTime() > 366 * HARI) throw new BadRequestException('Rentang maksimal 1 tahun');
    return { dari, sampai, awal, akhir };
  }

  async ringkasan(q: { dari?: string; sampai?: string }) {
    const p = this.periode(q);
    const log = await this.prisma.visitLog.findMany({ where: { created_at: { gte: p.awal, lt: p.akhir } }, orderBy: { created_at: 'asc' } });
    const idSelesai = [...new Set(log.filter((l) => l.aksi === 'selesai').map((l) => l.id_wo))];
    const wo = await this.prisma.workOrder.findMany({
      where: { id_wo: { in: idSelesai } },
      select: {
        id_wo: true, id_site: true, jenis_wo: true, id_teknisi_internal: true, tgl_jadwal: true, checkin_at: true, completed_at: true,
        ticket: { select: { tgl_open: true } }, site: { select: { nama_site: true, kode_site: true } },
      },
    });
    // Kunjungan ulang: site yang sama mendapat visit non-maintenance lagi ≤ 30 hari setelah selesai
    const susulan = wo.length
      ? await this.prisma.workOrder.findMany({
          where: { id_site: { in: [...new Set(wo.map((w) => w.id_site))] }, jenis_wo: { not: 'Maintenance' }, created_at: { gte: p.awal } },
          select: { id_wo: true, id_site: true, created_at: true },
        })
      : [];
    const ulang = new Set(wo.filter((w) => w.completed_at && susulan.some((s) =>
      s.id_site === w.id_site && s.id_wo !== w.id_wo && +s.created_at > +w.completed_at! && +s.created_at - +w.completed_at! <= 30 * HARI,
    )).map((w) => w.id_wo));

    const ukur = (ws: typeof wo) => {
      const tepat = ws.filter((w) => w.tgl_jadwal && w.completed_at && strWib(w.completed_at) === strWib(w.tgl_jadwal)).length;
      const durasi = ws.filter((w) => w.checkin_at && w.completed_at).map((w) => (+w.completed_at! - +w.checkin_at!) / 60_000).filter((m) => m >= 0 && m <= 12 * 60);
      const tiba = ws.filter((w) => w.ticket?.tgl_open && w.checkin_at).map((w) => (+w.checkin_at! - +w.ticket!.tgl_open) / 60_000).filter((m) => m >= 0);
      return {
        selesai: ws.length,
        pct_tepat: ws.length ? Math.round((tepat / ws.length) * 100) : null,
        durasi_median: median(durasi), tiba_median: median(tiba), tiba_n: tiba.length,
        ulang: ws.filter((w) => ulang.has(w.id_wo)).length,
      };
    };

    // Per teknisi (id dari log — teknisi yang memegang saat kejadian)
    const tek = new Map<number, { gagal: number; checkin: number }>();
    for (const l of log) {
      if (!l.id_karyawan) continue;
      const t = tek.get(l.id_karyawan) ?? { gagal: 0, checkin: 0 };
      if (l.aksi === 'gagal') t.gagal++;
      if (l.aksi === 'checkin') t.checkin++;
      tek.set(l.id_karyawan, t);
    }
    for (const w of wo) if (w.id_teknisi_internal && !tek.has(w.id_teknisi_internal)) tek.set(w.id_teknisi_internal, { gagal: 0, checkin: 0 });
    const nama = new Map((await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: [...tek.keys()] } }, select: { id_karyawan: true, nama_lengkap: true } }))
      .map((k) => [k.id_karyawan, k.nama_lengkap.trim()]));
    const teknisi = [...tek.entries()].map(([id, t]) => {
      const m = ukur(wo.filter((w) => w.id_teknisi_internal === id));
      return { id_karyawan: id, nama: nama.get(id) ?? `#${id}`, ...m, gagal: t.gagal, checkin: t.checkin };
    }).sort((a, b) => b.selesai - a.selesai || b.gagal - a.gagal);

    // Harian
    const hari: string[] = [];
    for (let d = p.awal.getTime(); d < p.akhir.getTime(); d += HARI) hari.push(strWib(new Date(d)));
    const perHari = (aksi: string) => hari.map((h) => log.filter((l) => l.aksi === aksi && strWib(l.created_at) === h).length);

    const jenis: Record<string, number> = {};
    for (const w of wo) jenis[w.jenis_wo] = (jenis[w.jenis_wo] ?? 0) + 1;
    const perSite = new Map<number, { nama: string; kode: string; n: number }>();
    for (const w of wo) {
      const x = perSite.get(w.id_site) ?? { nama: w.site.nama_site, kode: w.site.kode_site, n: 0 };
      x.n++; perSite.set(w.id_site, x);
    }

    const hariIni = tglWib(strWib(new Date()));
    const [antrean, terlewat, terjadwal] = await Promise.all([
      this.prisma.workOrder.count({ where: { status_wo: 'Open', tgl_jadwal: null, tipe_eksekutor: 'Internal_NEXT1' } }),
      this.prisma.workOrder.count({ where: { status_wo: { in: ['Open', 'In_Progress'] }, tgl_jadwal: { lt: hariIni } } }),
      this.prisma.workOrder.count({ where: { status_wo: { in: ['Open', 'In_Progress'] }, tgl_jadwal: { gte: hariIni } } }),
    ]);

    return {
      data: {
        dari: p.dari, sampai: p.sampai,
        kpi: {
          ...ukur(wo), gagal: log.filter((l) => l.aksi === 'gagal').length, batal: log.filter((l) => l.aksi === 'batal').length,
          checkin: log.filter((l) => l.aksi === 'checkin').length, antrean, terlewat, terjadwal,
        },
        harian: { label: hari, selesai: perHari('selesai'), gagal: perHari('gagal') },
        teknisi, jenis: Object.entries(jenis).map(([nama, n]) => ({ nama, n })).sort((a, b) => b.n - a.n),
        top_site: [...perSite.values()].sort((a, b) => b.n - a.n).slice(0, 10),
        alasan_gagal: Object.entries(log.filter((l) => l.aksi === 'gagal').reduce<Record<string, number>>((r, l) => { const k = l.catatan || 'Lainnya'; r[k] = (r[k] ?? 0) + 1; return r; }, {}))
          .map(([alasan, n]) => ({ alasan, n })).sort((a, b) => b.n - a.n),
      },
    };
  }

  /** Titik check-in dalam periode + semua store yang sudah punya koordinat */
  async peta(q: { dari?: string; sampai?: string }) {
    const p = this.periode(q);
    const log = await this.prisma.visitLog.findMany({ where: { aksi: 'checkin', created_at: { gte: p.awal, lt: p.akhir } }, orderBy: { created_at: 'desc' }, take: 3000 });
    const wo = await this.prisma.workOrder.findMany({
      where: { id_wo: { in: [...new Set(log.map((l) => l.id_wo))] } },
      select: { id_wo: true, nomor_wo: true, jenis_wo: true, status_wo: true, site: { select: { nama_site: true, kode_site: true } }, teknisi: { select: { nama_lengkap: true } } },
    });
    const byId = new Map(wo.map((w) => [w.id_wo, w]));
    const kunjungan = log.flatMap((l) => {
      const k = koordinat(l.catatan), w = byId.get(l.id_wo);
      return k && w ? [{ ...k, id_wo: w.id_wo, nomor_wo: w.nomor_wo, jenis: w.jenis_wo, status: w.status_wo, site: w.site.nama_site, kode: w.site.kode_site, teknisi: w.teknisi?.nama_lengkap.trim() ?? null, waktu: l.created_at }] : [];
    });
    const site = await this.prisma.sitePelanggan.findMany({
      where: { status_site: 'Aktif', koordinat_gps: { not: null } },
      select: { id_site: true, nama_site: true, kode_site: true, koordinat_gps: true, pelanggan: { select: { nama_pelanggan: true } } },
      take: 5000,
    });
    const store = site.flatMap((s) => { const k = koordinat(s.koordinat_gps); return k ? [{ ...k, id_site: s.id_site, nama: s.nama_site, kode: s.kode_site, pelanggan: s.pelanggan.nama_pelanggan }] : []; });
    const totalAktif = await this.prisma.sitePelanggan.count({ where: { status_site: 'Aktif' } });
    return { data: { dari: p.dari, sampai: p.sampai, kunjungan, store, store_tanpa_titik: totalAktif - store.length } };
  }
}
