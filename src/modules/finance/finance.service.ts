import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateInvoiceDto, UpdateInvoiceDto, CreatePembayaranDto, GenerateBulkDto,
} from './dto/invoice.dto';

const INVOICE_INCLUDE = {
  site: {
    select: {
      id_site: true, kode_site: true, nama_site: true,
      pelanggan: { select: { nama_pelanggan: true, email_billing: true, no_telp: true } },
    },
  },
  kontrak: { select: { id_kontrak: true, nomor_kontrak: true, harga_mrc: true } },
};

// Status yang dianggap "piutang berjalan" (belum lunas / belum batal)
const OUTSTANDING = ['Draft', 'Terkirim', 'Sebagian', 'Jatuh_Tempo'];

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private round(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Hitung status berdasarkan jumlah dibayar vs total & jatuh tempo
  private computeStatus(total: number, dibayar: number, tgl_jatuh_tempo: Date, current: string): string {
    if (current === 'Batal') return 'Batal';
    if (dibayar >= total && total > 0) return 'Lunas';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdue = new Date(tgl_jatuh_tempo) < today;
    if (dibayar > 0) return overdue ? 'Jatuh_Tempo' : 'Sebagian';
    // belum ada bayaran
    if (current === 'Draft') return 'Draft';
    return overdue ? 'Jatuh_Tempo' : 'Terkirim';
  }

  async findAll(query: {
    search?: string; status?: string; periode?: string;
    id_pelanggan?: string; page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.periode) where.periode = query.periode;
    if (query.search) {
      where.OR = [
        { nomor_invoice: { contains: query.search } },
        { site: { nama_site: { contains: query.search } } },
        { site: { pelanggan: { nama_pelanggan: { contains: query.search } } } },
      ];
    }
    if (query.id_pelanggan) where.site = { id_pelanggan: Number(query.id_pelanggan) };

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: INVOICE_INCLUDE,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const data = await this.prisma.invoice.findUnique({
      where: { id_invoice: id },
      include: {
        ...INVOICE_INCLUDE,
        pembayaran: {
          orderBy: { tgl_bayar: 'desc' },
          include: { user: { include: { karyawan: { select: { nama_lengkap: true } } } } },
        },
      },
    });
    if (!data) throw new NotFoundException('Invoice tidak ditemukan');
    return { data };
  }

  private async _genNomor(): Promise<string> {
    const now = new Date();
    const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const last = await this.prisma.invoice.findFirst({
      where: { nomor_invoice: { startsWith: prefix } },
      orderBy: { nomor_invoice: 'desc' },
    });
    const seq = (last ? (parseInt(last.nomor_invoice.split('-')[2], 10) || 0) : 0) + 1;
    return `${prefix}-${String(seq).padStart(4, '0')}`;
  }

  private calcTotals(subtotal: number, ppn_persen: number) {
    const ppn_nominal = this.round((subtotal * ppn_persen) / 100);
    const total = this.round(subtotal + ppn_nominal);
    return { ppn_nominal, total };
  }

  async create(dto: CreateInvoiceDto) {
    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: dto.id_site } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');

    const ppn_persen = dto.ppn_persen ?? 11;
    const { ppn_nominal, total } = this.calcTotals(dto.subtotal, ppn_persen);

    for (let attempt = 0; attempt < 5; attempt++) {
      const nomor_invoice = await this._genNomor();
      try {
        const data = await this.prisma.invoice.create({
          data: {
            nomor_invoice,
            id_site: dto.id_site,
            id_kontrak: dto.id_kontrak,
            periode: dto.periode,
            tgl_invoice: new Date(dto.tgl_invoice),
            tgl_jatuh_tempo: new Date(dto.tgl_jatuh_tempo),
            subtotal: dto.subtotal,
            ppn_persen,
            ppn_nominal,
            total,
            catatan: dto.catatan,
            status: 'Draft',
          },
          include: INVOICE_INCLUDE,
        });
        return { data, message: `Invoice ${nomor_invoice} dibuat` };
      } catch (e: any) {
        if (e.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  async update(id: number, dto: UpdateInvoiceDto) {
    const inv = await this.prisma.invoice.findUnique({ where: { id_invoice: id } });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan');
    if (inv.status === 'Lunas') throw new BadRequestException('Invoice sudah Lunas, tidak bisa diubah');

    const subtotal = dto.subtotal ?? Number(inv.subtotal);
    const ppn_persen = dto.ppn_persen ?? Number(inv.ppn_persen);
    const { ppn_nominal, total } = this.calcTotals(subtotal, ppn_persen);

    const dibayar = Number(inv.jumlah_dibayar);
    if (total < dibayar)
      throw new BadRequestException(`Total baru (${total}) tidak boleh lebih kecil dari yang sudah dibayar (${dibayar})`);

    // Status manual hanya boleh nilai valid; sisanya dihitung ulang dari pembayaran & jatuh tempo
    const VALID_STATUS = ['Draft', 'Terkirim', 'Sebagian', 'Lunas', 'Jatuh_Tempo', 'Batal'];
    if (dto.status && !VALID_STATUS.includes(dto.status))
      throw new BadRequestException('Status invoice tidak valid');
    const jatuhTempoBaru = dto.tgl_jatuh_tempo ? new Date(dto.tgl_jatuh_tempo) : inv.tgl_jatuh_tempo;
    const statusBaru = this.computeStatus(total, dibayar, jatuhTempoBaru, dto.status ?? inv.status);

    const data = await this.prisma.invoice.update({
      where: { id_invoice: id },
      data: {
        tgl_invoice: dto.tgl_invoice ? new Date(dto.tgl_invoice) : undefined,
        tgl_jatuh_tempo: dto.tgl_jatuh_tempo ? new Date(dto.tgl_jatuh_tempo) : undefined,
        subtotal, ppn_persen, ppn_nominal, total,
        status: statusBaru,
        catatan: dto.catatan,
      },
      include: INVOICE_INCLUDE,
    });
    return { data, message: 'Invoice diperbarui' };
  }

  // Kirim invoice (Draft -> Terkirim)
  async kirim(id: number) {
    const inv = await this.prisma.invoice.findUnique({ where: { id_invoice: id } });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan');
    if (inv.status !== 'Draft') throw new BadRequestException('Hanya invoice Draft yang bisa dikirim');
    const data = await this.prisma.invoice.update({
      where: { id_invoice: id },
      data: { status: 'Terkirim' },
      include: INVOICE_INCLUDE,
    });
    return { data, message: 'Invoice ditandai Terkirim' };
  }

  async remove(id: number) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id_invoice: id },
      include: { _count: { select: { pembayaran: true } } },
    });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan');
    if ((inv as any)._count.pembayaran > 0)
      throw new BadRequestException('Invoice sudah punya pembayaran, tidak bisa dihapus. Batalkan invoice sebagai gantinya.');
    if (inv.status !== 'Draft')
      throw new BadRequestException('Hanya invoice Draft yang bisa dihapus');
    await this.prisma.invoice.delete({ where: { id_invoice: id } });
    return { message: `Invoice ${inv.nomor_invoice} dihapus` };
  }

  async batal(id: number) {
    const inv = await this.prisma.invoice.findUnique({ where: { id_invoice: id } });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan');
    if (inv.status === 'Lunas') throw new BadRequestException('Invoice Lunas tidak bisa dibatalkan');
    const data = await this.prisma.invoice.update({
      where: { id_invoice: id },
      data: { status: 'Batal' },
      include: INVOICE_INCLUDE,
    });
    return { data, message: 'Invoice dibatalkan' };
  }

  // ─── PEMBAYARAN ──────────────────────────────────────────────

  async addPembayaran(id_invoice: number, dto: CreatePembayaranDto, userId?: number) {
    const inv = await this.prisma.invoice.findUnique({ where: { id_invoice } });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan');
    if (inv.status === 'Draft') throw new BadRequestException('Invoice masih Draft — kirim dulu sebelum menerima pembayaran');
    if (inv.status === 'Batal') throw new BadRequestException('Invoice sudah dibatalkan');
    if (inv.status === 'Lunas') throw new BadRequestException('Invoice sudah Lunas');
    if (dto.jumlah <= 0) throw new BadRequestException('Jumlah pembayaran harus lebih dari 0');

    const total = Number(inv.total);
    const sudah = Number(inv.jumlah_dibayar);
    const sisa = this.round(total - sudah);
    if (dto.jumlah > sisa + 0.01)
      throw new BadRequestException(`Jumlah melebihi sisa tagihan (sisa: ${sisa})`);

    const result = await this.prisma.$transaction(async (tx) => {
      const bayar = await tx.invoicePembayaran.create({
        data: {
          id_invoice,
          tgl_bayar: new Date(dto.tgl_bayar),
          jumlah: dto.jumlah,
          metode: dto.metode,
          referensi: dto.referensi,
          catatan: dto.catatan,
          id_user: userId || null,
        },
      });
      const dibayarBaru = this.round(sudah + dto.jumlah);
      const statusBaru = this.computeStatus(total, dibayarBaru, inv.tgl_jatuh_tempo, inv.status);
      const invoice = await tx.invoice.update({
        where: { id_invoice },
        data: { jumlah_dibayar: dibayarBaru, status: statusBaru },
        include: INVOICE_INCLUDE,
      });
      return { bayar, invoice };
    });

    return { data: result.invoice, message: 'Pembayaran dicatat' };
  }

  async removePembayaran(id_pembayaran: number) {
    const bayar = await this.prisma.invoicePembayaran.findUnique({ where: { id_pembayaran } });
    if (!bayar) throw new NotFoundException('Pembayaran tidak ditemukan');

    await this.prisma.$transaction(async (tx) => {
      await tx.invoicePembayaran.delete({ where: { id_pembayaran } });
      const inv = await tx.invoice.findUnique({ where: { id_invoice: bayar.id_invoice } });
      if (inv) {
        const dibayarBaru = this.round(Number(inv.jumlah_dibayar) - Number(bayar.jumlah));
        const statusBaru = this.computeStatus(
          Number(inv.total), dibayarBaru, inv.tgl_jatuh_tempo,
          inv.status === 'Lunas' || inv.status === 'Sebagian' ? 'Terkirim' : inv.status,
        );
        await tx.invoice.update({
          where: { id_invoice: bayar.id_invoice },
          data: { jumlah_dibayar: Math.max(0, dibayarBaru), status: statusBaru },
        });
      }
    });
    return { message: 'Pembayaran dihapus' };
  }

  // ─── GENERATE MASSAL (billing bulanan) ───────────────────────

  async generateBulk(dto: GenerateBulkDto) {
    // Semua kontrak aktif yang belum punya invoice untuk periode ini
    const kontrakAktif = await this.prisma.kontrakLayanan.findMany({
      where: { status_kontrak: 'Aktif' },
      include: { invoices: { where: { periode: dto.periode }, select: { id_invoice: true } } },
    });

    const ppn_persen = dto.ppn_persen ?? 11;
    let dibuat = 0;
    let dilewati = 0;
    const gagal: string[] = [];

    for (const k of kontrakAktif) {
      if (k.invoices.length > 0) { dilewati++; continue; }
      const subtotal = Number(k.harga_mrc);
      if (subtotal <= 0) { dilewati++; continue; }
      const { ppn_nominal, total } = this.calcTotals(subtotal, ppn_persen);

      // Retry 5x saat nomor tabrakan (P2002) — konsisten dgn generator lain.
      // Kegagalan lain dilaporkan eksplisit, bukan diam-diam "dilewati".
      let sukses = false;
      for (let attempt = 0; attempt < 5 && !sukses; attempt++) {
        const nomor_invoice = await this._genNomor();
        try {
          await this.prisma.invoice.create({
            data: {
              nomor_invoice,
              id_site: k.id_site,
              id_kontrak: k.id_kontrak,
              periode: dto.periode,
              tgl_invoice: new Date(dto.tgl_invoice),
              tgl_jatuh_tempo: new Date(dto.tgl_jatuh_tempo),
              subtotal, ppn_persen, ppn_nominal, total,
              status: 'Draft',
              catatan: `Tagihan MRC ${dto.periode} — ${k.nomor_kontrak}`,
            },
          });
          sukses = true;
          dibuat++;
        } catch (e: any) {
          if (e.code !== 'P2002' || attempt === 4) {
            gagal.push(k.nomor_kontrak);
            break;
          }
        }
      }
    }
    const msg = `${dibuat} invoice dibuat, ${dilewati} dilewati${gagal.length ? `, GAGAL: ${gagal.join(', ')}` : ''}`;
    return { data: { dibuat, dilewati, gagal, total_kontrak: kontrakAktif.length }, message: msg };
  }

  // ─── SUMMARY & AGING ─────────────────────────────────────────

  async getSummary() {
    const statuses = ['Draft', 'Terkirim', 'Sebagian', 'Lunas', 'Jatuh_Tempo', 'Batal'];
    const rows = await this.prisma.invoice.groupBy({
      by: ['status'],
      _count: { id_invoice: true },
      _sum: { total: true, jumlah_dibayar: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.status, r]));

    const totalTagihan = rows.reduce((s, r) => s + (r.status !== 'Batal' ? Number(r._sum.total ?? 0) : 0), 0);
    const totalDibayar = rows.reduce((s, r) => s + (r.status !== 'Batal' ? Number(r._sum.jumlah_dibayar ?? 0) : 0), 0);
    const outstandingRows = rows.filter((r) => OUTSTANDING.includes(r.status));
    const piutang = outstandingRows.reduce(
      (s, r) => s + (Number(r._sum.total ?? 0) - Number(r._sum.jumlah_dibayar ?? 0)), 0,
    );

    return {
      data: {
        by_status: statuses.map((s) => ({
          status: s,
          count: map[s]?._count?.id_invoice ?? 0,
          total: Number(map[s]?._sum?.total ?? 0),
        })),
        total_tagihan: this.round(totalTagihan),
        total_dibayar: this.round(totalDibayar),
        piutang: this.round(piutang),
        jatuh_tempo_count: map['Jatuh_Tempo']?._count?.id_invoice ?? 0,
      },
    };
  }

  // Aging report — bucket umur piutang dari tgl_jatuh_tempo
  async getAging() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { in: OUTSTANDING } },
      include: {
        site: { select: { nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } },
      },
      orderBy: { tgl_jatuh_tempo: 'asc' },
    });

    const buckets = { belum_jatuh_tempo: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const rows = invoices.map((inv) => {
      const sisa = this.round(Number(inv.total) - Number(inv.jumlah_dibayar));
      const jt = new Date(inv.tgl_jatuh_tempo); jt.setHours(0, 0, 0, 0);
      const umur = Math.floor((today.getTime() - jt.getTime()) / 86400000);
      let bucket: keyof typeof buckets;
      if (umur < 0) bucket = 'belum_jatuh_tempo';
      else if (umur <= 30) bucket = 'd1_30';
      else if (umur <= 60) bucket = 'd31_60';
      else if (umur <= 90) bucket = 'd61_90';
      else bucket = 'd90_plus';
      buckets[bucket] += sisa;
      return {
        id_invoice: inv.id_invoice,
        nomor_invoice: inv.nomor_invoice,
        pelanggan: inv.site?.pelanggan?.nama_pelanggan ?? '-',
        site: inv.site?.nama_site ?? '-',
        tgl_jatuh_tempo: inv.tgl_jatuh_tempo,
        sisa,
        umur_hari: umur,
        status: inv.status,
      };
    });

    const totals = Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, this.round(v)]),
    );
    return { data: { buckets: totals, invoices: rows, total_piutang: this.round(Object.values(buckets).reduce((a, b) => a + b, 0)) } };
  }
}
