import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MekariClient } from './mekari.client';

@Injectable()
export class MekariService {
  constructor(
    private prisma: PrismaService,
    private mekari: MekariClient,
  ) {}

  // Status koneksi — dipakai UI untuk tampilkan badge "Live" vs "Simulasi"
  getStatus() {
    const configured = this.mekari.isConfigured();
    return {
      data: {
        mode: configured ? 'live' : 'simulasi',
        configured,
        base_url: this.mekari.baseUrl,
        pesan: configured
          ? 'Terhubung ke Mekari API'
          : 'Mode simulasi — isi MEKARI_CLIENT_ID & MEKARI_CLIENT_SECRET di server untuk aktifkan sinkron nyata',
      },
    };
  }

  private simUid(prefix: string, id: number) {
    return `SIM-${prefix}-${id}-${Date.now().toString().slice(-6)}`;
  }

  // Jurnal API pakai format tanggal YYYY-MM-DD
  private fmtDate(d: Date | string): string {
    return new Date(d).toISOString().slice(0, 10);
  }

  // ─── SYNC CUSTOMER (Pelanggan → Mekari Contact) ──────────────
  async syncCustomer(id_pelanggan: number) {
    const p = await this.prisma.pelanggan.findUnique({ where: { id_pelanggan } });
    if (!p) throw new NotFoundException('Pelanggan tidak ditemukan');
    if (p.mekari_customer_uid) return { data: p, message: 'Pelanggan sudah tersinkron', already: true };

    let uid: string;
    if (this.mekari.isConfigured()) {
      const res = await this.mekari.request('POST', '/public/jurnal/api/v1/customers', {
        customer: {
          display_name: p.nama_pelanggan,
          email: p.email_billing || undefined,
          phone: p.no_telp || undefined,
          address: p.alamat_kantor || undefined,
          tax_no: p.npwp || undefined,
          custom_id: p.kode_pelanggan,
        },
      });
      uid = String(res?.customer?.id ?? res?.contact?.id ?? res?.id ?? '');
      if (!uid) throw new BadRequestException('Respons Mekari tidak berisi ID customer');
    } else {
      uid = this.simUid('CUST', id_pelanggan);
    }

    const data = await this.prisma.pelanggan.update({
      where: { id_pelanggan },
      data: { mekari_customer_uid: uid },
    });
    return { data, message: this.mekari.isConfigured() ? 'Pelanggan disinkron ke Mekari' : 'Pelanggan disinkron (simulasi)' };
  }

  // ─── SYNC PRODUCT (Layanan → Mekari Product) ─────────────────
  async syncProduct(id_layanan: number) {
    const l = await this.prisma.masterLayanan.findUnique({ where: { id_layanan } });
    if (!l) throw new NotFoundException('Layanan tidak ditemukan');
    if (l.mekari_product_uid) return { data: l, message: 'Layanan sudah tersinkron', already: true };

    let uid: string;
    if (this.mekari.isConfigured()) {
      const res = await this.mekari.request('POST', '/public/jurnal/api/v1/products', {
        product: {
          name: l.nama_layanan,
          product_code: l.kode_layanan,
          description: l.deskripsi || undefined,
          sell_price_per_unit: '0',
          is_sold: true,
          unit_name: 'Unit',
          custom_id: l.kode_layanan,
        },
      });
      uid = String(res?.product?.id ?? res?.id ?? '');
      if (!uid) throw new BadRequestException('Respons Mekari tidak berisi ID product');
    } else {
      uid = this.simUid('PROD', id_layanan);
    }

    const data = await this.prisma.masterLayanan.update({
      where: { id_layanan },
      data: { mekari_product_uid: uid },
    });
    return { data, message: this.mekari.isConfigured() ? 'Layanan disinkron ke Mekari' : 'Layanan disinkron (simulasi)' };
  }

  // ─── SYNC INVOICE (AR → Mekari Sales Invoice) ────────────────
  async syncInvoice(id_invoice: number) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id_invoice },
      include: {
        site: { include: { pelanggan: true, layanan: true } },
      },
    });
    if (!inv) throw new NotFoundException('Invoice tidak ditemukan');
    if (inv.status === 'Draft')
      throw new BadRequestException('Invoice masih Draft — kirim/finalisasi dulu sebelum sinkron ke Mekari');
    if (inv.status === 'Batal')
      throw new BadRequestException('Invoice sudah dibatalkan');
    if (inv.mekari_uid)
      return { data: inv, message: 'Invoice sudah tersinkron ke Mekari', already: true };

    const pelanggan = inv.site?.pelanggan;
    const layanan = inv.site?.layanan;
    if (!pelanggan) throw new BadRequestException('Data pelanggan tidak lengkap');

    try {
      // Pastikan master data sudah tersinkron dulu (mapping ID benar)
      let customerUid = pelanggan.mekari_customer_uid;
      if (!customerUid) customerUid = (await this.syncCustomer(pelanggan.id_pelanggan)).data.mekari_customer_uid;
      let productUid = layanan?.mekari_product_uid ?? null;
      if (layanan && !productUid) productUid = (await this.syncProduct(layanan.id_layanan)).data.mekari_product_uid;

      // Jurnal sales_invoice mereferensi customer & product BY NAME (bukan ID),
      // jadi customerUid/productUid di atas dipakai untuk memastikan master data
      // sudah ada di Jurnal + tracking sync kita.
      void customerUid; void productUid;
      let uid: string;
      let status = 'Tersinkron';
      if (this.mekari.isConfigured()) {
        const res = await this.mekari.request('POST', '/public/jurnal/api/v1/sales_invoices', {
          sales_invoice: {
            transaction_no: inv.nomor_invoice,
            transaction_date: this.fmtDate(inv.tgl_invoice),
            due_date: this.fmtDate(inv.tgl_jatuh_tempo),
            person_name: pelanggan.nama_pelanggan,
            email: pelanggan.email_billing || undefined,
            memo: inv.catatan || `Tagihan ${inv.periode}`,
            transaction_lines_attributes: [
              {
                product_name: layanan?.nama_layanan || `Layanan ${inv.periode}`,
                quantity: 1,
                rate: Number(inv.subtotal),
              },
            ],
          },
        });
        uid = String(res?.sales_invoice?.id ?? res?.id ?? '');
        if (!uid) throw new BadRequestException('Respons Mekari tidak berisi ID invoice');
      } else {
        uid = this.simUid('INV', id_invoice);
        status = 'Simulasi';
      }

      // Catat juga di ledger AR (sesuai desain schema)
      await this.prisma.integrationJurnalAr.create({
        data: {
          id_site: inv.id_site,
          id_kontrak: inv.id_kontrak,
          periode_tagihan: inv.periode,
          jumlah_tagihan: inv.total,
          mekari_jurnal_uid: uid,
          status_sinkronisasi: 'Terkirim',
          tanggal_sinkronisasi: new Date(),
          catatan: `Invoice ${inv.nomor_invoice}`,
        },
      });

      const data = await this.prisma.invoice.update({
        where: { id_invoice },
        data: { mekari_uid: uid, mekari_status: status },
      });
      return { data, message: status === 'Simulasi' ? 'Invoice disinkron (simulasi)' : 'Invoice disinkron ke Mekari Jurnal' };
    } catch (e: any) {
      await this.prisma.invoice.update({
        where: { id_invoice },
        data: { mekari_status: 'Gagal' },
      });
      throw new BadRequestException(`Gagal sinkron ke Mekari: ${e.message}`);
    }
  }

  // Riwayat sinkron AR
  async getJurnalArLog(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.integrationJurnalAr.findMany({
        skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: { site: { select: { nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } } },
      }),
      this.prisma.integrationJurnalAr.count(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }
}
