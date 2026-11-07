import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Integrasi kurir api.co.id (https://use.api.co.id, header x-api-co-id).
 * Endpoint /courier/v1/* gratis; cek ongkir /courier/v2/rates Rp 5 per panggilan; ongkir dipotong saat order dibuat.
 * Lacak resi hanya untuk order yang dibuat lewat api.co.id.
 */
const BASE = 'https://use.api.co.id';
const PEMEGANG = ['Admin', 'Director', 'Helpdesk', 'Manager_Ops'];
// status api.co.id → status pengiriman ERP
const STATUS_KIRIM: Record<string, string> = {
  processing: 'Packing', waiting: 'Packing', shipping: 'Dikirim', delivered: 'Diterima', completed: 'Diterima',
  problem: 'Dikirim', returned: 'Dikembalikan', cancelled: 'Packing', failed: 'Packing',
};
const AKHIR = ['delivered', 'completed', 'returned', 'cancelled', 'failed'];

export interface Pengguna { id_karyawan: number; roles: string[] }

@Injectable()
export class KurirApiService {
  private readonly logger = new Logger('KurirApi');
  private cache = new Map<string, { at: number; data: unknown }>();
  constructor(private prisma: PrismaService) {}

  private wajib(u: Pengguna) {
    if (!u.roles.some((r) => PEMEGANG.includes(r))) throw new ForbiddenException('Kurir diatur oleh Network (Helpdesk)');
  }

  private async panggil<T = any>(metode: 'GET' | 'POST', path: string, opt: { query?: Record<string, unknown>; body?: unknown } = {}): Promise<T> {
    const key = process.env.KURIR_API_KEY;
    if (!key) throw new BadRequestException('KURIR_API_KEY belum diisi di .env server');
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opt.query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const url = `${BASE}${path}${qs.size ? `?${qs}` : ''}`;
    let r: Response;
    try {
      r = await fetch(url, {
        method: metode,
        headers: { 'x-api-co-id': key, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opt.body ? JSON.stringify(opt.body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (e: any) {
      throw new BadRequestException(`api.co.id tidak bisa dihubungi: ${e?.message}`);
    }
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.is_success) {
      const pesan = j?.message || `HTTP ${r.status}`;
      const ket: Record<number, string> = { 402: 'Saldo api.co.id tidak cukup — top up dulu', 404: 'Data tidak ditemukan', 429: 'Kuota bulanan API habis' };
      throw new BadRequestException(`api.co.id: ${ket[r.status] ? `${ket[r.status]} (${pesan})` : pesan}`);
    }
    return j.data as T;
  }

  private async tersimpan<T>(kunci: string, ms: number, fn: () => Promise<T>): Promise<T> {
    const c = this.cache.get(kunci);
    if (c && Date.now() - c.at < ms) return c.data as T;
    const data = await fn();
    this.cache.set(kunci, { at: Date.now(), data });
    return data;
  }

  // ── Referensi (gratis) ───────────────────────────────────────────────────────
  saldo() { return this.panggil('GET', '/courier/v1/balance'); }
  provinsi() { return this.tersimpan('prov', 7 * 86400_000, () => this.panggil('GET', '/courier/v1/locations/provinces')); }
  kota(province: string) {
    if (!province) throw new BadRequestException('Pilih provinsi');
    return this.tersimpan(`kota:${province}`, 7 * 86400_000, () => this.panggil('GET', '/courier/v1/locations/cities', { query: { province } }));
  }
  kecamatan(city: string) {
    if (!city) throw new BadRequestException('Pilih kota');
    return this.tersimpan(`kec:${city}`, 7 * 86400_000, () => this.panggil('GET', '/courier/v1/locations/districts', { query: { city } }));
  }
  async alamat() { return (await this.panggil<any[]>('GET', '/courier/v1/addresses')) ?? []; }
  async buatAlamat(u: Pengguna, dto: Record<string, unknown>) {
    this.wajib(u);
    const data = await this.panggil('POST', '/courier/v1/addresses', { body: dto });
    return { data, message: 'Alamat pengirim disimpan di api.co.id' };
  }

  // ── Ongkir & order ───────────────────────────────────────────────────────────
  private async pengirimanOrder(id_pb: number) {
    const o = await this.prisma.pbOrder.findUnique({ where: { id_pb } });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    if (o.tahap !== 'Network') throw new BadRequestException(`Order di tahap ${o.tahap}`);
    if (!o.id_wo || o.network_metode !== 'Kirim_Vendor') throw new BadRequestException('Simpan pemasangan "Kirim + vendor teknisi" dulu');
    const k = await this.prisma.pengirimanPerangkat.findFirst({ where: { id_wo: o.id_wo }, orderBy: { id_pengiriman: 'desc' } });
    if (!k) throw new BadRequestException('Data pengiriman belum ada');
    return { o, k };
  }

  /** Cek ongkir semua kurir (Rp 5 per panggilan) */
  async ongkir(u: Pengguna, id_pb: number, q: Record<string, unknown>) {
    this.wajib(u);
    await this.pengirimanOrder(id_pb);
    if (!q.destination_district_code || !(q.sender_address_id || q.origin_district_code)) throw new BadRequestException('Isi alamat pengirim dan kecamatan tujuan');
    if (!(Number(q.weight) > 0)) throw new BadRequestException('Isi berat paket (gram)');
    return this.panggil('GET', '/courier/v2/rates', {
      query: {
        sender_address_id: q.sender_address_id, origin_district_code: q.origin_district_code, destination_district_code: q.destination_district_code,
        weight: Math.round(Number(q.weight)), item_value: q.item_value ? Math.round(Number(q.item_value)) : undefined, insurance: q.insurance ? 'true' : undefined,
        sender_type: q.sender_type || undefined, length: q.length || undefined, width: q.width || undefined, height: q.height || undefined,
      },
    });
  }

  /** Buat order kurir — ongkir dipotong dari saldo api.co.id */
  async pesan(u: Pengguna, id_pb: number, dto: Record<string, any>) {
    this.wajib(u);
    const { o, k } = await this.pengirimanOrder(id_pb);
    if (k.kurir_order_id && !['cancelled', 'failed'].includes(k.kurir_status ?? '')) throw new BadRequestException('Pengiriman ini sudah punya order kurir');
    for (const f of ['quote_id', 'courier_code', 'service_code', 'recipient_name', 'recipient_phone', 'recipient_address', 'product_name']) {
      if (!dto[f]) throw new BadRequestException(`Field ${f} wajib`);
    }
    const body = {
      quote_id: String(dto.quote_id), courier_code: String(dto.courier_code), service_code: String(dto.service_code),
      recipient_name: String(dto.recipient_name).slice(0, 30), recipient_phone: String(dto.recipient_phone).slice(0, 20),
      recipient_address: String(dto.recipient_address).slice(0, 500), product_name: String(dto.product_name).slice(0, 100),
      product_price: Math.max(1, Math.round(Number(dto.product_price) || 1)), quantity: Math.max(1, Math.round(Number(dto.quantity) || 1)),
      insurance: !!dto.insurance, note: dto.note ? String(dto.note).slice(0, 500) : undefined,
      ...(dto.picked_up_time ? { picked_up_time: new Date(dto.picked_up_time).toISOString() } : {}),
    };
    const r: any = await this.panggil('POST', '/courier/v1/orders', { body });
    const kurir = (await this.panggil<any[]>('GET', '/courier/v1/couriers').catch(() => [])).find((x) => x.code === r.courier_code);
    await this.prisma.pengirimanPerangkat.update({
      where: { id_pengiriman: k.id_pengiriman },
      data: {
        kurir_order_id: String(r.id), kurir_kode: r.courier_code ?? body.courier_code, kurir_layanan: r.courier_service ?? body.service_code,
        kurir_status: r.status ?? 'processing', kurir_biaya: r.charged_amount ?? null, nomor_resi: r.resi || k.nomor_resi,
        nama_ekspedisi: kurir?.name ?? r.courier_code, status_pengiriman: STATUS_KIRIM[r.status] ?? 'Packing', tgl_kirim: new Date(),
        nama_penerima_di_lokasi: body.recipient_name, kurir_riwayat: null, kurir_cek_at: new Date(),
      },
    });
    await this.prisma.pbRiwayat.create({
      data: { id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'kurir', catatan: `Order kurir ${kurir?.name ?? r.courier_code} · resi ${r.resi ?? '-'} · Rp ${Number(r.charged_amount ?? 0).toLocaleString('id-ID')}` },
    });
    return { data: r, message: `Kurir dipesan — resi ${r.resi ?? '(menunggu)'}` };
  }

  /** Lacak resi (gratis) → status pengiriman diperbarui */
  async lacak(id_pb: number) {
    const { k } = await this.pengirimanOrder(id_pb);
    return this.lacakPengiriman(k.id_pengiriman);
  }

  private async lacakPengiriman(id_pengiriman: number) {
    const k = await this.prisma.pengirimanPerangkat.findUnique({ where: { id_pengiriman } });
    if (!k?.kurir_order_id) throw new BadRequestException('Resi ini tidak dipesan lewat api.co.id — tidak bisa dilacak otomatis');
    let d: any;
    if (k.nomor_resi) d = await this.panggil('GET', `/courier/v1/orders/track/${encodeURIComponent(k.nomor_resi)}`);
    else d = await this.panggil('GET', `/courier/v1/orders/${encodeURIComponent(k.kurir_order_id)}`);
    const status = String(d?.status ?? k.kurir_status ?? '');
    const diterima = STATUS_KIRIM[status] === 'Diterima';
    await this.prisma.pengirimanPerangkat.update({
      where: { id_pengiriman },
      data: {
        kurir_status: status || k.kurir_status, kurir_cek_at: new Date(),
        ...(d?.resi && !k.nomor_resi ? { nomor_resi: d.resi } : {}),
        ...(Array.isArray(d?.history) ? { kurir_riwayat: JSON.stringify(d.history) } : {}),
        ...(STATUS_KIRIM[status] ? { status_pengiriman: STATUS_KIRIM[status] } : {}),
        ...(diterima && !k.tgl_terima ? { tgl_terima: new Date() } : {}),
      },
    });
    return { data: d, message: `Status: ${status || '-'}` };
  }

  async batal(u: Pengguna, id_pb: number) {
    this.wajib(u);
    const { o, k } = await this.pengirimanOrder(id_pb);
    if (!k.kurir_order_id) throw new BadRequestException('Belum ada order kurir');
    await this.panggil('POST', `/courier/v1/orders/${encodeURIComponent(k.kurir_order_id)}/cancel`);
    await this.prisma.pengirimanPerangkat.update({ where: { id_pengiriman: k.id_pengiriman }, data: { kurir_status: 'cancelled', status_pengiriman: 'Packing' } });
    await this.prisma.pbRiwayat.create({ data: { id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'kurir', catatan: `Order kurir dibatalkan (resi ${k.nomor_resi ?? '-'})` } });
    return { message: 'Order kurir dibatalkan — ongkir dikembalikan ke saldo bila memenuhi syarat' };
  }

  /** Lacak otomatis tiap 2 jam untuk pengiriman api.co.id yang belum selesai (endpoint lacak gratis) */
  @Cron('25 */2 * * *')
  async lacakBerkala() {
    if (!process.env.KURIR_API_KEY) return;
    const aktif = await this.prisma.pengirimanPerangkat.findMany({
      where: { kurir_order_id: { not: null }, OR: [{ kurir_status: null }, { kurir_status: { notIn: AKHIR } }] },
      select: { id_pengiriman: true }, take: 100,
    });
    for (const k of aktif) {
      try { await this.lacakPengiriman(k.id_pengiriman); } catch (e: any) { this.logger.warn(`lacak #${k.id_pengiriman}: ${e?.message}`); }
    }
  }
}
