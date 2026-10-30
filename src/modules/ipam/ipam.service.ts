import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { bacaPrefix, infoSubnet, ipKeAngka, tulisPrefix } from './ip.util';

const AKTIF = ['Dicadangkan', 'Dipakai', 'Karantina'];
export const HARI_KARANTINA = 30;

type Staf = { id_karyawan: number | null };

/** IPAM: blok IP publik NEXT1, rencana zona, alokasi ke site/infrastruktur, karantina & riwayat */
@Injectable()
export class IpamService {
  private readonly logger = new Logger('IPAM');
  constructor(private prisma: PrismaService) {}

  // ── Util ─────────────────────────────────────────────────────────────────────
  private async blok(id_blok: number) {
    const b = await this.prisma.ipBlok.findUnique({ where: { id_blok } });
    if (!b) throw new NotFoundException('Blok IP tidak ditemukan');
    const p = bacaPrefix(b.prefix)!;
    return { ...b, network: p.network, jumlah: p.jumlah };
  }

  /** Prefix → offset di dalam blok; harus network yang benar & berada di dalam blok */
  private rentang(blok: { prefix: string; network: number; jumlah: number }, prefix: string) {
    const p = bacaPrefix(prefix.includes('/') ? prefix : `${prefix}/32`);
    if (!p) throw new BadRequestException(`Prefix "${prefix}" tidak valid — gunakan alamat network, mis. 180.214.165.72/29`);
    const awal = p.network - blok.network;
    const akhir = awal + p.jumlah - 1;
    if (awal < 0 || akhir >= blok.jumlah) throw new BadRequestException(`${prefix} berada di luar blok ${blok.prefix}`);
    return { awal, akhir, prefix: tulisPrefix(p.network, p.panjang), panjang: p.panjang, network: p.network };
  }

  private async namaStaf(id_karyawan: number | null) {
    if (!id_karyawan) return null;
    const k = await this.prisma.hrisKaryawan.findUnique({ where: { id_karyawan }, select: { nama_lengkap: true } });
    return k?.nama_lengkap.trim() ?? null;
  }

  private async catat(id_alokasi: number, aksi: string, detail: string | null, staf: Staf) {
    await this.prisma.ipRiwayat.create({
      data: { id_alokasi, aksi, detail, id_karyawan: staf.id_karyawan, nama_karyawan: await this.namaStaf(staf.id_karyawan) },
    });
  }

  private async bentrok(id_blok: number, awal: number, akhir: number, kecuali?: number) {
    return this.prisma.ipAlokasi.findFirst({
      where: { id_blok, status: { in: AKTIF }, awal: { lte: akhir }, akhir: { gte: awal }, ...(kecuali ? { id_alokasi: { not: kecuali } } : {}) },
      include: { site: { select: { nama_site: true } } },
    });
  }

  private async cekSite(id_site: number | null | undefined) {
    if (!id_site) return;
    const s = await this.prisma.sitePelanggan.findUnique({ where: { id_site }, select: { id_site: true } });
    if (!s) throw new NotFoundException('Site tidak ditemukan');
  }

  // Gateway boleh di dalam subnet (biasa untuk /29, /30) atau di luar (mis. /32 routed)
  private cekGateway(gateway: string | undefined) {
    if (!gateway?.trim()) return null;
    if (ipKeAngka(gateway) === null) throw new BadRequestException('Gateway bukan alamat IPv4 yang valid');
    return gateway.trim();
  }

  /**
   * Sinkron status otomatis (dipanggil saat halaman dibuka):
   * - Dipakai/Dicadangkan milik site yang sudah Dismantle → Karantina
   * - Karantina yang lewat masanya → Dilepas (IP tersedia lagi)
   */
  async sinkron(id_blok?: number) {
    const sekarang = new Date();
    const dismantle = await this.prisma.ipAlokasi.findMany({
      where: { ...(id_blok ? { id_blok } : {}), status: { in: ['Dipakai', 'Dicadangkan'] }, site: { status_site: 'Dismantle' } },
      include: { site: { select: { nama_site: true, tgl_terminasi: true } } },
    });
    for (const a of dismantle) {
      const dari = a.site?.tgl_terminasi && a.site.tgl_terminasi < sekarang ? a.site.tgl_terminasi : sekarang;
      const sampai = new Date(dari.getTime() + HARI_KARANTINA * 86_400_000);
      await this.prisma.ipAlokasi.update({ where: { id_alokasi: a.id_alokasi }, data: { status: 'Karantina', karantina_sampai: sampai } });
      await this.catat(a.id_alokasi, 'Karantina', `Otomatis: site ${a.site?.nama_site} berstatus Dismantle. Tersedia lagi ${sampai.toISOString().slice(0, 10)}`, { id_karyawan: null });
      this.logger.log(`${a.prefix} dikarantina (site Dismantle: ${a.site?.nama_site})`);
    }
    const habis = await this.prisma.ipAlokasi.findMany({
      where: { ...(id_blok ? { id_blok } : {}), status: 'Karantina', karantina_sampai: { lte: sekarang } },
      select: { id_alokasi: true, prefix: true },
    });
    for (const a of habis) {
      await this.prisma.ipAlokasi.update({ where: { id_alokasi: a.id_alokasi }, data: { status: 'Dilepas', dilepas_at: sekarang } });
      await this.catat(a.id_alokasi, 'Dilepas', 'Otomatis: masa karantina selesai, IP tersedia lagi', { id_karyawan: null });
    }
  }

  // ── Blok ─────────────────────────────────────────────────────────────────────
  async daftarBlok() {
    await this.sinkron();
    const blok = await this.prisma.ipBlok.findMany({ orderBy: { prefix: 'asc' } });
    const aktif = await this.prisma.ipAlokasi.findMany({ where: { status: { in: AKTIF } }, select: { id_blok: true, awal: true, akhir: true, status: true } });
    return blok.map((b) => {
      const jumlah = bacaPrefix(b.prefix)?.jumlah ?? 0;
      const hit: Record<string, number> = { Dipakai: 0, Dicadangkan: 0, Karantina: 0 };
      for (const a of aktif) if (a.id_blok === b.id_blok) hit[a.status] += a.akhir - a.awal + 1;
      return { ...b, jumlah_ip: jumlah, ...hit, Tersedia: jumlah - hit.Dipakai - hit.Dicadangkan - hit.Karantina };
    });
  }

  async buatBlok(d: { prefix: string; asn?: string; nama: string; catatan?: string }) {
    const p = bacaPrefix(d.prefix);
    if (!p || p.panjang < 16 || p.panjang > 30) throw new BadRequestException('Prefix blok tidak valid (contoh 180.214.165.0/24, panjang /16–/30)');
    const prefix = tulisPrefix(p.network, p.panjang);
    if (await this.prisma.ipBlok.findUnique({ where: { prefix } })) throw new ConflictException(`Blok ${prefix} sudah ada`);
    return this.prisma.ipBlok.create({ data: { prefix, asn: d.asn?.trim() || null, nama: d.nama.trim(), catatan: d.catatan?.trim() || null } });
  }

  async ubahBlok(id_blok: number, d: { asn?: string; nama: string; catatan?: string }) {
    await this.blok(id_blok);
    return this.prisma.ipBlok.update({ where: { id_blok }, data: { asn: d.asn?.trim() || null, nama: d.nama.trim(), catatan: d.catatan?.trim() || null } });
  }

  /** Detail blok: zona + alokasi aktif (dengan site & pelanggan) */
  async detailBlok(id_blok: number) {
    await this.sinkron(id_blok);
    const b = await this.blok(id_blok);
    const [zona, alokasi] = await Promise.all([
      this.prisma.ipZona.findMany({ where: { id_blok }, orderBy: { awal: 'asc' } }),
      this.prisma.ipAlokasi.findMany({
        where: { id_blok, status: { in: AKTIF } },
        orderBy: { awal: 'asc' },
        include: { site: { select: { id_site: true, kode_site: true, nama_site: true, status_site: true, pelanggan: { select: { id_pelanggan: true, nama_pelanggan: true } } } } },
      }),
    ]);
    const { network, ...blok } = b;
    return {
      blok: { ...blok, network: infoSubnet(network, bacaPrefix(b.prefix)!.panjang).network },
      zona,
      alokasi: alokasi.map((a) => ({ ...a, subnet: infoSubnet(network + a.awal, 32 - Math.log2(a.akhir - a.awal + 1)) })),
    };
  }

  // ── Zona (rencana pembagian) ─────────────────────────────────────────────────
  async buatZona(id_blok: number, d: { prefix: string; nama: string; peruntukan: string; catatan?: string }) {
    const b = await this.blok(id_blok);
    const r = this.rentang(b, d.prefix);
    const tumpang = await this.prisma.ipZona.findFirst({ where: { id_blok, awal: { lte: r.akhir }, akhir: { gte: r.awal } } });
    if (tumpang) throw new ConflictException(`Tumpang tindih dengan zona "${tumpang.nama}" (${tumpang.prefix})`);
    return this.prisma.ipZona.create({ data: { id_blok, awal: r.awal, akhir: r.akhir, prefix: r.prefix, nama: d.nama.trim(), peruntukan: d.peruntukan, catatan: d.catatan?.trim() || null } });
  }

  async ubahZona(id_zona: number, d: { prefix: string; nama: string; peruntukan: string; catatan?: string }) {
    const z = await this.prisma.ipZona.findUnique({ where: { id_zona } });
    if (!z) throw new NotFoundException('Zona tidak ditemukan');
    const r = this.rentang(await this.blok(z.id_blok), d.prefix);
    const tumpang = await this.prisma.ipZona.findFirst({ where: { id_blok: z.id_blok, id_zona: { not: id_zona }, awal: { lte: r.akhir }, akhir: { gte: r.awal } } });
    if (tumpang) throw new ConflictException(`Tumpang tindih dengan zona "${tumpang.nama}" (${tumpang.prefix})`);
    return this.prisma.ipZona.update({ where: { id_zona }, data: { awal: r.awal, akhir: r.akhir, prefix: r.prefix, nama: d.nama.trim(), peruntukan: d.peruntukan, catatan: d.catatan?.trim() || null } });
  }

  async hapusZona(id_zona: number) {
    await this.prisma.ipZona.delete({ where: { id_zona } }).catch(() => { throw new NotFoundException('Zona tidak ditemukan'); });
    return true;
  }

  /** Saran prefix kosong berikutnya untuk panjang tertentu, utamakan zona dengan peruntukan yang sama */
  async saran(id_blok: number, panjang: number, peruntukan?: string) {
    if (!Number.isInteger(panjang) || panjang < 24 || panjang > 32) throw new BadRequestException('Panjang prefix harus /24–/32');
    const b = await this.blok(id_blok);
    const ukuran = 2 ** (32 - panjang);
    const [aktif, zona] = await Promise.all([
      this.prisma.ipAlokasi.findMany({ where: { id_blok, status: { in: AKTIF } }, select: { awal: true, akhir: true } }),
      this.prisma.ipZona.findMany({ where: { id_blok }, orderBy: { awal: 'asc' } }),
    ]);
    const kosong = (awal: number) => !aktif.some((a) => a.awal <= awal + ukuran - 1 && a.akhir >= awal);
    const cari = (dari: number, sampai: number) => {
      for (let o = Math.ceil(dari / ukuran) * ukuran; o + ukuran - 1 <= sampai; o += ukuran) if (kosong(o)) return o;
      return null;
    };
    const kandidat = peruntukan ? zona.filter((z) => z.peruntukan === peruntukan) : [];
    // /32 utamakan zona "IP tunggal" (zona besar terakhir), blok utamakan zona pertama yang muat
    if (panjang === 32) kandidat.reverse();
    for (const z of kandidat) {
      const o = cari(z.awal, z.akhir);
      if (o !== null) return { prefix: tulisPrefix(b.network + o, panjang), zona: z.nama };
    }
    const o = cari(0, b.jumlah - 1);
    return o === null ? null : { prefix: tulisPrefix(b.network + o, panjang), zona: zona.find((z) => z.awal <= o && z.akhir >= o)?.nama ?? null };
  }

  // ── Alokasi ──────────────────────────────────────────────────────────────────
  async buatAlokasi(d: {
    id_blok: number; prefix: string; status: string; peruntukan: string; id_site?: number | null;
    gateway?: string; vlan?: number | null; perangkat?: string; keterangan?: string;
  }, staf: Staf) {
    const b = await this.blok(d.id_blok);
    const r = this.rentang(b, d.prefix);
    const x = await this.bentrok(d.id_blok, r.awal, r.akhir);
    if (x) throw new ConflictException(`Bentrok dengan ${x.prefix} (${x.status}${x.site ? ` · ${x.site.nama_site}` : ''})`);
    await this.cekSite(d.id_site);
    const a = await this.prisma.ipAlokasi.create({
      data: {
        id_blok: d.id_blok, awal: r.awal, akhir: r.akhir, prefix: r.prefix, status: d.status, peruntukan: d.peruntukan,
        id_site: d.id_site || null, gateway: this.cekGateway(d.gateway), vlan: d.vlan ?? null,
        perangkat: d.perangkat?.trim() || null, keterangan: d.keterangan?.trim() || null, id_karyawan: staf.id_karyawan,
      },
      include: { site: { select: { nama_site: true } } },
    });
    await this.catat(a.id_alokasi, d.status === 'Dipakai' ? 'Dialokasikan' : 'Dicadangkan', `${a.prefix} · ${d.peruntukan}${a.site ? ` · ${a.site.nama_site}` : ''}`, staf);
    return a;
  }

  async ubahAlokasi(id_alokasi: number, d: {
    status?: string; peruntukan?: string; id_site?: number | null; gateway?: string; vlan?: number | null; perangkat?: string; keterangan?: string;
  }, staf: Staf) {
    const a = await this.prisma.ipAlokasi.findUnique({ where: { id_alokasi }, include: { site: { select: { nama_site: true } } } });
    if (!a || !AKTIF.includes(a.status)) throw new NotFoundException('Alokasi tidak ditemukan / sudah dilepas');
    if (d.status && a.status === 'Karantina') throw new BadRequestException('IP sedang karantina — tunggu selesai atau lepas langsung dulu');
    if (d.id_site !== undefined) await this.cekSite(d.id_site);
    const data: any = {};
    if (d.status) data.status = d.status;
    if (d.peruntukan) data.peruntukan = d.peruntukan;
    if (d.id_site !== undefined) data.id_site = d.id_site || null;
    if (d.gateway !== undefined) data.gateway = this.cekGateway(d.gateway);
    if (d.vlan !== undefined) data.vlan = d.vlan ?? null;
    if (d.perangkat !== undefined) data.perangkat = d.perangkat.trim() || null;
    if (d.keterangan !== undefined) data.keterangan = d.keterangan.trim() || null;
    const baru = await this.prisma.ipAlokasi.update({ where: { id_alokasi }, data, include: { site: { select: { nama_site: true } } } });

    const ubah: string[] = [];
    if (data.status && data.status !== a.status) ubah.push(`status ${a.status} → ${data.status}`);
    if (data.peruntukan && data.peruntukan !== a.peruntukan) ubah.push(`peruntukan ${a.peruntukan} → ${data.peruntukan}`);
    if ('id_site' in data && data.id_site !== a.id_site) ubah.push(`site ${a.site?.nama_site ?? '-'} → ${baru.site?.nama_site ?? '-'}`);
    if ('gateway' in data && data.gateway !== a.gateway) ubah.push(`gateway ${a.gateway ?? '-'} → ${data.gateway ?? '-'}`);
    if ('vlan' in data && data.vlan !== a.vlan) ubah.push(`VLAN ${a.vlan ?? '-'} → ${data.vlan ?? '-'}`);
    if ('perangkat' in data && data.perangkat !== a.perangkat) ubah.push(`perangkat ${a.perangkat ?? '-'} → ${data.perangkat ?? '-'}`);
    if ('keterangan' in data && data.keterangan !== a.keterangan) ubah.push('keterangan diubah');
    if (ubah.length) await this.catat(id_alokasi, 'Diubah', ubah.join('; '), staf);
    return baru;
  }

  /** Lepas IP: default dikarantina (bekas pelanggan), atau langsung tersedia */
  async lepas(id_alokasi: number, d: { langsung?: boolean; hari?: number; alasan?: string }, staf: Staf) {
    const a = await this.prisma.ipAlokasi.findUnique({ where: { id_alokasi } });
    if (!a || !AKTIF.includes(a.status)) throw new NotFoundException('Alokasi tidak ditemukan / sudah dilepas');
    const alasan = d.alasan?.trim() ? ` — ${d.alasan.trim()}` : '';
    if (d.langsung || a.status === 'Dicadangkan') {
      await this.prisma.ipAlokasi.update({ where: { id_alokasi }, data: { status: 'Dilepas', dilepas_at: new Date() } });
      await this.catat(id_alokasi, 'Dilepas', `Langsung tersedia${a.status === 'Karantina' ? ' (karantina dibatalkan)' : ''}${alasan}`, staf);
    } else {
      const hari = d.hari ?? HARI_KARANTINA;
      const sampai = new Date(Date.now() + hari * 86_400_000);
      await this.prisma.ipAlokasi.update({ where: { id_alokasi }, data: { status: 'Karantina', karantina_sampai: sampai } });
      await this.catat(id_alokasi, 'Karantina', `${hari} hari, tersedia lagi ${sampai.toISOString().slice(0, 10)}${alasan}`, staf);
    }
    return true;
  }

  riwayat(id_alokasi: number) {
    return this.prisma.ipRiwayat.findMany({ where: { id_alokasi }, orderBy: { created_at: 'desc' } });
  }

  /** Riwayat pemakaian satu alamat IP (termasuk alokasi yang sudah dilepas) */
  async riwayatIp(id_blok: number, ip: string) {
    const b = await this.blok(id_blok);
    const n = ipKeAngka(ip);
    if (n === null) throw new BadRequestException('IP tidak valid');
    const o = n - b.network;
    return this.prisma.ipAlokasi.findMany({
      where: { id_blok, awal: { lte: o }, akhir: { gte: o } },
      orderBy: { dialokasikan_at: 'desc' },
      include: { site: { select: { id_site: true, nama_site: true } }, riwayat: { orderBy: { created_at: 'desc' } } },
    });
  }

  cariSite(q: string) {
    const kata = (q || '').trim();
    if (kata.length < 2) return Promise.resolve([]);
    return this.prisma.sitePelanggan.findMany({
      where: { OR: [{ nama_site: { contains: kata } }, { kode_site: { contains: kata } }, { pelanggan: { nama_pelanggan: { contains: kata } } }] },
      select: { id_site: true, kode_site: true, nama_site: true, kota: true, status_site: true, pelanggan: { select: { nama_pelanggan: true } } },
      orderBy: [{ status_site: 'asc' }, { nama_site: 'asc' }],
      take: 20,
    });
  }

  /** Alokasi IP aktif milik satu site (untuk ditampilkan di detail site) */
  ipSite(id_site: number) {
    return this.prisma.ipAlokasi.findMany({ where: { id_site, status: { in: AKTIF } }, orderBy: { prefix: 'asc' }, select: { id_alokasi: true, id_blok: true, prefix: true, status: true, gateway: true, vlan: true } });
  }
}
