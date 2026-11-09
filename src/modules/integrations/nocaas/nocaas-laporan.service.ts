import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { LABEL_KATEGORI } from './nocaas.service';
import { NocaasClient } from './nocaas.client';

const HARI = 86400_000;
const tglWib = (s: string) => new Date(`${s}T00:00:00+07:00`);
const strWib = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

/**
 * Laporan gangguan gabungan: semua tiket (PRTG, NOCaaS per kategori, WA, manual) dalam periode,
 * riwayat kondisi NOCaaS (termasuk yang tidak jadi tiket), dan statistik ISP / site paling sering putus dari NOCaaS.
 */
@Injectable()
export class NocaasLaporanService {
  private readonly logger = new Logger('LaporanGangguan');
  constructor(private prisma: PrismaService, private config: ConfigService, private klien: NocaasClient) {}

  private async nocaas<T>(path: string): Promise<T | null> {
    try {
      return await this.klien.ambil<T>(path);
    } catch (e: any) {
      this.logger.warn(`NOCaaS ${path}: ${e?.message}`);
      return null;
    }
  }

  /** Kategori tiket: jenis_gangguan (NOCaaS mengisi), atau ditebak dari judul PRTG */
  private kategori(t: { sumber_tiket: string; jenis_gangguan: string | null; judul_tiket: string }) {
    if (t.jenis_gangguan) return t.jenis_gangguan;
    if (t.sumber_tiket === 'PRTG') return /ping/i.test(t.judul_tiket) ? 'PRTG: Ping down' : /ether|port|sfp/i.test(t.judul_tiket) ? 'PRTG: Port down' : 'PRTG: Sensor lain';
    return `${t.sumber_tiket}: lainnya`;
  }

  async laporan(q: { dari?: string; sampai?: string }) {
    const sampai = q.sampai || strWib(new Date());
    const dari = q.dari || strWib(new Date(tglWib(sampai).getTime() - 29 * HARI));
    const awal = tglWib(dari), akhir = new Date(tglWib(sampai).getTime() + HARI);
    if (akhir <= awal) throw new BadRequestException('Rentang tanggal tidak valid');
    if (akhir.getTime() - awal.getTime() > 366 * HARI) throw new BadRequestException('Rentang maksimal 1 tahun');
    const now = new Date();

    const tiket = await this.prisma.operationTicket.findMany({
      where: { tgl_open: { gte: awal, lt: akhir } },
      select: {
        id_ticket: true, nomor_tiket: true, judul_tiket: true, sumber_tiket: true, jenis_gangguan: true, prioritas: true, status_tiket: true,
        tgl_open: true, tgl_resolved: true, tgl_sensor_down: true, sla_due: true, sla_breached: true,
        site: { select: { id_site: true, kode_site: true, nama_site: true, kota: true, pelanggan: { select: { id_pelanggan: true, nama_pelanggan: true } } } },
      },
      orderBy: { tgl_open: 'desc' },
    });
    const baris = tiket.map((t) => {
      const mulai = t.tgl_sensor_down ?? t.tgl_open;
      const selesai = t.tgl_resolved ?? (['Resolved', 'Closed'].includes(t.status_tiket) ? null : now);
      const durasi = selesai ? Math.max(0, Math.round((selesai.getTime() - mulai.getTime()) / 60_000)) : null;
      const lewatSla = t.sla_breached || (!!t.sla_due && (t.tgl_resolved ?? now) > t.sla_due);
      return { ...t, kategori: this.kategori(t), durasi_menit: durasi, lewat_sla: lewatSla, aktif: !['Resolved', 'Closed'].includes(t.status_tiket) };
    });

    const hitung = <K extends string>(f: (b: (typeof baris)[number]) => K) => {
      const m = new Map<K, number>();
      for (const b of baris) m.set(f(b), (m.get(f(b)) ?? 0) + 1);
      return [...m.entries()].map(([nama, n]) => ({ nama, n })).sort((a, b) => b.n - a.n);
    };
    const selesai = baris.filter((b) => !b.aktif && b.tgl_resolved);
    const mttr = median(selesai.map((b) => Math.round((b.tgl_resolved!.getTime() - (b.tgl_sensor_down ?? b.tgl_open).getTime()) / 60_000)).filter((m) => m >= 0));

    // Harian per sumber
    const hari: string[] = [];
    for (let d = awal.getTime(); d < akhir.getTime(); d += HARI) hari.push(strWib(new Date(d)));
    const perHari = (f: (b: (typeof baris)[number]) => boolean) => hari.map((h) => baris.filter((b) => f(b) && strWib(b.tgl_open) === h).length);

    // Per site & per pelanggan
    const site = new Map<number, { id_site: number; kode: string; nama: string; kota: string | null; pelanggan: string; n: number; downtime: number; kategori: Map<string, number> }>();
    const pel = new Map<number, { nama: string; n: number; downtime: number; site: Set<number> }>();
    for (const b of baris) {
      const s = site.get(b.site.id_site) ?? { id_site: b.site.id_site, kode: b.site.kode_site, nama: b.site.nama_site, kota: b.site.kota, pelanggan: b.site.pelanggan.nama_pelanggan, n: 0, downtime: 0, kategori: new Map() };
      s.n++; s.downtime += b.durasi_menit ?? 0; s.kategori.set(b.kategori, (s.kategori.get(b.kategori) ?? 0) + 1);
      site.set(b.site.id_site, s);
      const p = pel.get(b.site.pelanggan.id_pelanggan) ?? { nama: b.site.pelanggan.nama_pelanggan, n: 0, downtime: 0, site: new Set<number>() };
      p.n++; p.downtime += b.durasi_menit ?? 0; p.site.add(b.site.id_site);
      pel.set(b.site.pelanggan.id_pelanggan, p);
    }

    // Riwayat kondisi NOCaaS (termasuk yang tidak menjadi tiket / masih berjalan)
    const kondisi = await this.prisma.nocaasGangguan.findMany({ where: { mulai_at: { lt: akhir }, OR: [{ selesai_at: null }, { selesai_at: { gte: awal } }] }, select: { kategori: true, id_ticket: true, selesai_at: true } });
    const perKondisi = Object.entries(LABEL_KATEGORI).map(([k, v]) => {
      const x = kondisi.filter((g) => g.kategori === k);
      return { kategori: k, label: v.label, n: x.length, jadi_tiket: x.filter((g) => g.id_ticket).length, berjalan: x.filter((g) => !g.selesai_at).length };
    });

    // Statistik NOCaaS langsung (maks 30 hari ke belakang dari sekarang)
    const hariNoc = Math.min(30, Math.max(1, Math.ceil((akhir.getTime() - awal.getTime()) / HARI)));
    const [isp, ranking] = await Promise.all([
      this.nocaas<{ items: any[]; monitored_sites?: number }>(`/api/heartbeat/isp-stats?days=${hariNoc}&min_sites=3`),
      this.nocaas<{ sites: any[]; reasons: any[] }>(`/api/heartbeat/ranking?days=${Math.min(hariNoc, 30)}`),
    ]);

    return {
      data: {
        dari, sampai,
        kpi: {
          total: baris.length, aktif: baris.filter((b) => b.aktif).length, selesai: selesai.length,
          mttr_menit: mttr, downtime_menit: baris.reduce((n, b) => n + (b.durasi_menit ?? 0), 0),
          lewat_sla: baris.filter((b) => b.lewat_sla).length, site: site.size,
        },
        per_sumber: hitung((b) => b.sumber_tiket),
        per_kategori: hitung((b) => b.kategori),
        harian: {
          label: hari,
          nocaas: perHari((b) => b.sumber_tiket === 'NOCaaS'),
          prtg: perHari((b) => b.sumber_tiket === 'PRTG'),
          lain: perHari((b) => b.sumber_tiket !== 'NOCaaS' && b.sumber_tiket !== 'PRTG'),
        },
        top_site: [...site.values()].sort((a, b) => b.n - a.n || b.downtime - a.downtime).slice(0, 20)
          .map((s) => ({ ...s, kategori: [...s.kategori.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}×`).join(', ') })),
        per_pelanggan: [...pel.values()].sort((a, b) => b.n - a.n).slice(0, 20).map((p) => ({ nama: p.nama, n: p.n, downtime: p.downtime, site: p.site.size })),
        kondisi_nocaas: perKondisi,
        isp: (isp?.items ?? []).filter((x) => x.ranked !== false).slice(0, 15),
        isp_hari: hariNoc,
        sering_putus: (ranking?.sites ?? []).slice(0, 15),
        alasan_putus: (ranking?.reasons ?? []).slice(0, 10),
        tiket: baris.slice(0, 5000).map((b) => ({
          id_ticket: b.id_ticket, nomor_tiket: b.nomor_tiket, judul_tiket: b.judul_tiket, sumber: b.sumber_tiket, kategori: b.kategori, prioritas: b.prioritas,
          status: b.status_tiket, tgl_open: b.tgl_open, tgl_resolved: b.tgl_resolved, durasi_menit: b.durasi_menit, lewat_sla: b.lewat_sla,
          site: b.site.nama_site, kode_site: b.site.kode_site, kota: b.site.kota, pelanggan: b.site.pelanggan.nama_pelanggan,
        })),
      },
    };
  }
}
