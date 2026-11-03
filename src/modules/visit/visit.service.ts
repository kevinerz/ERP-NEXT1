import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WaService } from '../whatsapp/wa.service';
import { BuatVisitDto, JadwalDto, KirimWaDto, StatusVisitDto, UbahVisitDto, WaHarianDto } from './dto';

interface Pengguna { id_karyawan: number; roles: string[] }

const WIB = 7 * 3600_000;
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const URUT_PRIORITAS: Record<string, number> = { Darurat: 0, Tinggi: 1, Normal: 2, Rendah: 3 };
const AKTIF = ['Open', 'In_Progress'];

/** "2026-11-04" (tanggal WIB) → Date tengah malam WIB */
export function tglWib(s: string): Date {
  const d = new Date(`${s.slice(0, 10)}T00:00:00+07:00`);
  if (isNaN(d.getTime())) throw new BadRequestException('Tanggal tidak valid');
  return d;
}
/** Date → "2026-11-04" (WIB) */
export function strWib(d: Date): string {
  return new Date(d.getTime() + WIB).toISOString().slice(0, 10);
}
function labelTgl(d: Date) {
  const w = new Date(d.getTime() + WIB);
  return `${HARI[w.getUTCDay()]}, ${w.getUTCDate()} ${BULAN[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
}

/** Nomor WO-YYYYMM-#### (format yang sama dengan modul Work Order) */
export async function buatWo(prisma: PrismaClient | Prisma.TransactionClient, data: Omit<Prisma.WorkOrderUncheckedCreateInput, 'nomor_wo'>) {
  for (let coba = 0; coba < 5; coba++) {
    const now = new Date(Date.now() + WIB);
    const prefix = `WO-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const last = await prisma.workOrder.findFirst({ where: { nomor_wo: { startsWith: prefix } }, orderBy: { nomor_wo: 'desc' }, select: { nomor_wo: true } });
    const seq = (last ? parseInt(last.nomor_wo.split('-')[2], 10) || 0 : 0) + 1;
    try {
      return await prisma.workOrder.create({ data: { ...data, nomor_wo: `${prefix}-${String(seq).padStart(4, '0')}` } });
    } catch (e: any) {
      if (e?.code !== 'P2002' || coba === 4) throw e;
    }
  }
  throw new BadRequestException('Gagal membuat nomor WO');
}

const INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true, kota: true, alamat_lengkap: true,
      pelanggan: { select: { nama_pelanggan: true, nama_pic_utama: true, no_hp_pic_utama: true } },
      pic: { select: { nama_pic: true, no_kontak: true, jabatan: true, is_utama: true } },
    },
  },
  teknisi: { select: { id_karyawan: true, nama_lengkap: true, no_hp: true } },
  ticket: { select: { id_ticket: true, nomor_tiket: true, judul_tiket: true } },
} satisfies Prisma.WorkOrderInclude;
type Wo = Prisma.WorkOrderGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class VisitService {
  private readonly logger = new Logger('JadwalVisit');
  constructor(private prisma: PrismaService, private wa: WaService) {}

  /** PIC store: PIC berjabatan "PIC Store" → PIC utama → PIC pertama → PIC pelanggan */
  private pic(w: Wo): { nama: string | null; hp: string | null } {
    const p = w.site.pic.filter((x) => x.no_kontak);
    const x = p.find((x) => /store/i.test(x.jabatan || '')) || p.find((x) => x.is_utama) || p[0];
    if (x) return { nama: x.nama_pic, hp: x.no_kontak };
    return { nama: w.site.pelanggan.nama_pic_utama, hp: w.site.pelanggan.no_hp_pic_utama };
  }

  private bentuk(w: Wo) {
    const pic = this.pic(w);
    return {
      id_wo: w.id_wo, nomor_wo: w.nomor_wo, jenis_wo: w.jenis_wo, prioritas: w.prioritas, status_wo: w.status_wo,
      tgl: w.tgl_jadwal ? strWib(w.tgl_jadwal) : null, jam: w.jam_jadwal, urutan: w.urutan,
      id_teknisi: w.id_teknisi_internal, teknisi: w.teknisi?.nama_lengkap?.trim() || null,
      deskripsi: w.deskripsi_tugas, catatan_teknisi: w.catatan_teknisi, id_pb: w.id_pb,
      tipe_eksekutor: w.tipe_eksekutor,
      wa_teknisi_at: w.wa_teknisi_at, wa_pic_at: w.wa_pic_at, created_at: w.created_at, completed_at: w.completed_at,
      site: { id_site: w.site.id_site, kode: w.site.kode_site, nama: w.site.nama_site, kota: w.site.kota, alamat: w.site.alamat_lengkap, pelanggan: w.site.pelanggan.nama_pelanggan },
      pic_nama: pic.nama, pic_hp: pic.hp,
      tiket: w.ticket ? { id: w.ticket.id_ticket, nomor: w.ticket.nomor_tiket, judul: w.ticket.judul_tiket } : null,
    };
  }

  /** Teknisi lapangan: karyawan aktif departemen Teknisi/NOC atau ber-role Teknisi */
  private async teknisi(tambahan: number[]) {
    const k = await this.prisma.hrisKaryawan.findMany({
      where: {
        OR: [
          { status_aktif: true, departemen: { in: ['Teknisi', 'NOC'] } },
          { status_aktif: true, user: { is_aktif: true, user_roles: { some: { role: { nama_role: 'Teknisi' } } } } },
          { id_karyawan: { in: tambahan } },
        ],
      },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true, departemen: true, no_hp: true },
      orderBy: [{ departemen: 'desc' }, { nama_lengkap: 'asc' }],
    });
    return k.map((x) => ({ ...x, nama_lengkap: x.nama_lengkap.trim() }));
  }

  /** Papan 7 hari mulai `mulai` (default Senin minggu ini) + antrean */
  async papan(mulai?: string) {
    let awal: Date;
    if (mulai) awal = tglWib(mulai);
    else {
      const w = new Date(Date.now() + WIB);
      const geser = (w.getUTCDay() + 6) % 7; // Senin = 0
      awal = tglWib(new Date(w.getTime() - geser * 86400_000).toISOString());
    }
    const akhir = new Date(awal.getTime() + 7 * 86400_000);
    const hariIni = tglWib(strWib(new Date()));

    const [terjadwal, antrean] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { tgl_jadwal: { gte: awal, lt: akhir }, id_teknisi_internal: { not: null }, status_wo: { not: 'Cancelled' } },
        include: INCLUDE, orderBy: [{ tgl_jadwal: 'asc' }, { jam_jadwal: 'asc' }, { urutan: 'asc' }],
      }),
      // Antrean: belum dijadwalkan / belum ada teknisi, plus jadwal yang sudah lewat tapi belum selesai
      this.prisma.workOrder.findMany({
        where: {
          status_wo: { in: AKTIF }, tipe_eksekutor: 'Internal_NEXT1',
          OR: [{ tgl_jadwal: null }, { id_teknisi_internal: null }, { tgl_jadwal: { lt: hariIni } }],
        },
        include: INCLUDE, take: 300,
      }),
    ]);
    const idDiPapan = new Set(terjadwal.map((w) => w.id_wo));
    const daftarAntrean = antrean
      .filter((w) => !idDiPapan.has(w.id_wo) || !w.id_teknisi_internal)
      .map((w) => ({ ...this.bentuk(w), terlewat: !!w.tgl_jadwal && w.tgl_jadwal < hariIni && !!w.id_teknisi_internal }))
      .sort((a, b) => Number(b.terlewat) - Number(a.terlewat) || (URUT_PRIORITAS[a.prioritas] ?? 9) - (URUT_PRIORITAS[b.prioritas] ?? 9) || +new Date(a.created_at) - +new Date(b.created_at));

    const teknisi = await this.teknisi([...new Set(terjadwal.map((w) => w.id_teknisi_internal!))]);
    const hari = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(awal.getTime() + i * 86400_000);
      return { tgl: strWib(d), label: labelTgl(d) };
    });
    return {
      data: {
        mulai: strWib(awal), hari_ini: strWib(hariIni), hari, teknisi,
        visit: terjadwal.map((w) => this.bentuk(w)), antrean: daftarAntrean,
      },
    };
  }

  async cariSite(q: string) {
    const s = (q || '').trim();
    if (s.length < 2) return { data: [] };
    const data = await this.prisma.sitePelanggan.findMany({
      where: { OR: [{ kode_site: { contains: s } }, { nama_site: { contains: s } }, { pelanggan: { nama_pelanggan: { contains: s } } }] },
      select: { id_site: true, kode_site: true, nama_site: true, kota: true, status_site: true, pelanggan: { select: { nama_pelanggan: true } } },
      take: 20, orderBy: { nama_site: 'asc' },
    });
    return { data };
  }

  private async ambil(id_wo: number) {
    const w = await this.prisma.workOrder.findUnique({ where: { id_wo }, include: INCLUDE });
    if (!w) throw new NotFoundException('Visit tidak ditemukan');
    return w;
  }

  async detail(id_wo: number) {
    return { data: this.bentuk(await this.ambil(id_wo)) };
  }

  async buat(u: Pengguna, dto: BuatVisitDto) {
    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: dto.id_site }, select: { id_site: true } });
    if (!site) throw new BadRequestException('Site tidak ditemukan');
    if (dto.id_ticket) {
      const ada = await this.prisma.workOrder.findFirst({ where: { id_ticket: dto.id_ticket, status_wo: { in: AKTIF } }, select: { nomor_wo: true } });
      if (ada) throw new BadRequestException(`Tiket ini sudah punya visit aktif (${ada.nomor_wo})`);
    }
    const w = await buatWo(this.prisma, {
      jenis_wo: dto.jenis_wo, id_site: dto.id_site, id_ticket: dto.id_ticket ?? null, prioritas: dto.prioritas || 'Normal',
      deskripsi_tugas: dto.deskripsi_tugas.trim(), tipe_eksekutor: 'Internal_NEXT1', dibuat_oleh: u.id_karyawan ?? null,
      tgl_jadwal: dto.tgl ? tglWib(dto.tgl) : null, jam_jadwal: dto.jam || null, id_teknisi_internal: dto.id_teknisi ?? null,
    });
    return { data: (await this.detail(w.id_wo)).data, message: `Visit ${w.nomor_wo} dibuat` };
  }

  async ubah(id_wo: number, dto: UbahVisitDto) {
    await this.ambil(id_wo);
    await this.prisma.workOrder.update({
      where: { id_wo },
      data: { jenis_wo: dto.jenis_wo, prioritas: dto.prioritas, deskripsi_tugas: dto.deskripsi_tugas?.trim() },
    });
    return { data: (await this.detail(id_wo)).data, message: 'Visit diperbarui' };
  }

  /** Atur / ubah jadwal & teknisi. Jadwal berubah → status kirim WA direset supaya dikirim ulang. */
  async jadwal(id_wo: number, dto: JadwalDto) {
    const w = await this.ambil(id_wo);
    if (!AKTIF.includes(w.status_wo)) throw new BadRequestException(`Visit sudah ${w.status_wo}`);
    const tgl = dto.tgl === undefined ? w.tgl_jadwal : dto.tgl ? tglWib(dto.tgl) : null;
    const jam = dto.jam === undefined ? w.jam_jadwal : dto.jam || null;
    const tek = dto.id_teknisi === undefined ? w.id_teknisi_internal : dto.id_teknisi || null;
    if (tek) {
      const k = await this.prisma.hrisKaryawan.findUnique({ where: { id_karyawan: tek }, select: { id_karyawan: true } });
      if (!k) throw new BadRequestException('Teknisi tidak ditemukan');
    }
    const berubah = +(tgl ?? 0) !== +(w.tgl_jadwal ?? 0) || jam !== w.jam_jadwal || tek !== w.id_teknisi_internal;
    await this.prisma.workOrder.update({
      where: { id_wo },
      data: {
        tgl_jadwal: tgl, jam_jadwal: jam, id_teknisi_internal: tek,
        ...(berubah ? { wa_teknisi_at: null, wa_pic_at: null } : {}),
      },
    });
    return { data: (await this.detail(id_wo)).data, message: tgl && tek ? 'Jadwal disimpan' : 'Dikembalikan ke antrean' };
  }

  async status(u: Pengguna, id_wo: number, dto: StatusVisitDto) {
    const w = await this.ambil(id_wo);
    if (dto.status === 'Cancelled' && !dto.catatan?.trim()) throw new BadRequestException('Isi alasan pembatalan');
    if (['In_Progress', 'Completed'].includes(dto.status) && (!w.tgl_jadwal || !w.id_teknisi_internal)) {
      throw new BadRequestException('Jadwalkan & tugaskan teknisi dulu');
    }
    const catatan = dto.catatan?.trim();
    await this.prisma.workOrder.update({
      where: { id_wo },
      data: {
        status_wo: dto.status,
        completed_at: dto.status === 'Completed' ? new Date() : dto.status === 'Cancelled' ? w.completed_at : null,
        ...(catatan ? { catatan_teknisi: w.catatan_teknisi ? `${w.catatan_teknisi}\n${catatan}` : catatan } : {}),
      },
    });
    this.logger.log(`${w.nomor_wo} → ${dto.status} oleh karyawan #${u.id_karyawan}`);
    const label: Record<string, string> = { Open: 'Dibuka kembali', In_Progress: 'Sedang dikerjakan', Completed: 'Selesai', Cancelled: 'Dibatalkan' };
    return { data: (await this.detail(id_wo)).data, message: label[dto.status] };
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────────
  private maps(w: Wo) {
    const q = [w.site.nama_site, w.site.alamat_lengkap, w.site.kota].filter(Boolean).join(', ');
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
  }

  private blokTugas(w: Wo, pic: { nama: string | null; hp: string | null }) {
    const b = [
      `🏪 *${w.site.nama_site}* (${w.site.kode_site})`,
      `🏢 ${w.site.pelanggan.nama_pelanggan}`,
    ];
    if (w.jam_jadwal) b.unshift(`🕘 ${w.jam_jadwal} WIB`);
    if (w.site.alamat_lengkap) b.push(`📍 ${w.site.alamat_lengkap}${w.site.kota ? `, ${w.site.kota}` : ''}`);
    const m = this.maps(w);
    if (m) b.push(`🗺️ ${m}`);
    if (pic.nama || pic.hp) b.push(`👤 PIC: ${[pic.nama, pic.hp].filter(Boolean).join(' — ')}`);
    b.push(`🔧 ${w.jenis_wo}${w.prioritas !== 'Normal' ? ` · Prioritas *${w.prioritas}*` : ''}${w.ticket ? ` · Tiket ${w.ticket.nomor_tiket}` : ''}`);
    b.push(`📝 ${w.deskripsi_tugas}`);
    b.push(`No. ${w.nomor_wo}`);
    return b.join('\n');
  }

  private teksTeknisi(w: Wo) {
    return `*Tugas Visit — ${labelTgl(w.tgl_jadwal!)}*\n\n${this.blokTugas(w, this.pic(w))}\n\nMohon kabari helpdesk saat tiba & setelah selesai. Terima kasih 🙏`;
  }

  private teksPic(w: Wo) {
    const pic = this.pic(w);
    const sapa = pic.nama ? `Bapak/Ibu ${pic.nama}` : 'Bapak/Ibu';
    const jam = w.jam_jadwal ? ` sekitar pukul ${w.jam_jadwal} WIB` : '';
    return `Halo ${sapa},\n\nKami dari NEXT1 menginformasikan bahwa teknisi kami${w.teknisi ? ` *${w.teknisi.nama_lengkap.trim()}*` : ''} dijadwalkan berkunjung ke *${w.site.nama_site}* pada *${labelTgl(w.tgl_jadwal!)}*${jam} untuk keperluan *${w.jenis_wo.toLowerCase()}*.\n\nMohon konfirmasi ketersediaan PIC di lokasi pada waktu tersebut. Terima kasih 🙏`;
  }

  async pratinjauWa(id_wo: number, ke: string) {
    const w = await this.ambil(id_wo);
    if (!w.tgl_jadwal || !w.teknisi) throw new BadRequestException('Visit belum dijadwalkan / belum ada teknisi');
    if (ke === 'pic') {
      const pic = this.pic(w);
      return { data: { nama: pic.nama, nomor: pic.hp, teks: this.teksPic(w) } };
    }
    return { data: { nama: w.teknisi.nama_lengkap.trim(), nomor: w.teknisi.no_hp, teks: this.teksTeknisi(w) } };
  }

  async kirimWa(u: Pengguna, id_wo: number, dto: KirimWaDto) {
    const w = await this.ambil(id_wo);
    if (!w.tgl_jadwal || !w.teknisi) throw new BadRequestException('Visit belum dijadwalkan / belum ada teknisi');
    await this.wa.kirimKeNomor(dto.nomor, dto.teks.trim(), u.id_karyawan);
    await this.prisma.workOrder.update({ where: { id_wo }, data: dto.ke === 'pic' ? { wa_pic_at: new Date() } : { wa_teknisi_at: new Date() } });
    return { data: (await this.detail(id_wo)).data, message: `WhatsApp terkirim ke ${dto.ke === 'pic' ? 'PIC store' : 'teknisi'}` };
  }

  /** Satu pesan per teknisi berisi semua visitnya pada tanggal tsb */
  private async rekapHarian(tgl: string) {
    const d = tglWib(tgl);
    const list = await this.prisma.workOrder.findMany({
      where: { tgl_jadwal: d, id_teknisi_internal: { not: null }, status_wo: { in: AKTIF } },
      include: INCLUDE, orderBy: [{ jam_jadwal: 'asc' }, { urutan: 'asc' }, { id_wo: 'asc' }],
    });
    const per = new Map<number, Wo[]>();
    for (const w of list) per.set(w.id_teknisi_internal!, [...(per.get(w.id_teknisi_internal!) ?? []), w]);
    return [...per.values()].map((ws) => {
      const t = ws[0].teknisi!;
      const isi = ws.map((w, i) => `*${i + 1}.* ${this.blokTugas(w, this.pic(w))}`).join('\n\n');
      return {
        id_teknisi: t.id_karyawan, nama: t.nama_lengkap.trim(), nomor: t.no_hp, jumlah: ws.length,
        belum_terkirim: ws.filter((w) => !w.wa_teknisi_at).length, id_wo: ws.map((w) => w.id_wo),
        teks: `*Jadwal Visit — ${labelTgl(d)}*\n${ws.length} lokasi\n\n${isi}\n\nMohon kabari helpdesk saat tiba & setelah selesai di tiap lokasi. Terima kasih 🙏`,
      };
    });
  }

  async pratinjauHarian(tgl: string) {
    if (!tgl) throw new BadRequestException('Tanggal wajib');
    return { data: await this.rekapHarian(tgl) };
  }

  async kirimHarian(u: Pengguna, dto: WaHarianDto) {
    const rekap = (await this.rekapHarian(dto.tgl)).filter((r) => !dto.id_teknisi || dto.id_teknisi.includes(r.id_teknisi));
    const hasil: { nama: string; ok: boolean; error?: string }[] = [];
    for (const r of rekap) {
      try {
        if (!r.nomor) throw new Error('nomor HP belum diisi di data karyawan');
        await this.wa.kirimKeNomor(r.nomor, r.teks, u.id_karyawan);
        await this.prisma.workOrder.updateMany({ where: { id_wo: { in: r.id_wo } }, data: { wa_teknisi_at: new Date() } });
        hasil.push({ nama: r.nama, ok: true });
      } catch (e: any) {
        hasil.push({ nama: r.nama, ok: false, error: e?.response?.message || e?.message });
      }
    }
    const ok = hasil.filter((h) => h.ok).length;
    return { data: hasil, message: `Jadwal terkirim ke ${ok} dari ${hasil.length} teknisi` };
  }
}
