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

// Nama kurir (dari daftar api.co.id / input) → kode BinderByte untuk lacak resi manual
const KODE_BINDERBYTE: [RegExp, string][] = [
  [/jnt\s*cargo|j&t\s*cargo/i, 'jnt_cargo'], [/\bjne\b/i, 'jne'], [/\bpos\b/i, 'pos'], [/sicepat/i, 'sicepat'], [/\bjnt\b|j&t/i, 'jnt'],
  [/anteraja|anter aja/i, 'anteraja'], [/wahana/i, 'wahana'], [/lion/i, 'lion'], [/ninja/i, 'ninja'], [/tiki/i, 'tiki'], [/\bpcp\b/i, 'pcp'],
  [/\brex\b/i, 'rex'], [/first/i, 'first'], [/id\s*express/i, 'ide'], [/\bspx\b|shopee/i, 'spx'], [/kgx/i, 'kgx'], [/\bsap\b/i, 'sap'],
  [/lazada|\blex\b/i, 'lex'], [/indah/i, 'indah_cargo'], [/dakota/i, 'dakota'], [/\bgtl\b/i, 'gtl'],
];
export function kodeBinderbyte(nama: string | null | undefined) {
  return KODE_BINDERBYTE.find(([re]) => re.test(nama ?? ''))?.[1] ?? null;
}
// Status ringkas BinderByte → status internal (sama dengan api.co.id)
function statusBinderbyte(s: string) {
  const t = s.toUpperCase();
  if (/DELIVERED|DITERIMA|TERKIRIM|SUCCESS/.test(t)) return 'delivered';
  if (/RETUR|RETURN|DIKEMBALIKAN/.test(t)) return 'returned';
  if (/HILANG|LOST|GAGAL|FAILED|PROBLEM/.test(t)) return 'problem';
  return 'shipping';
}

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
        ...(dto.tujuan_kirim === 'Teknisi' || dto.tujuan_kirim === 'Store' ? { tujuan_kirim: dto.tujuan_kirim } : {}),
      },
    });
    await this.prisma.pbRiwayat.create({
      data: { id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'kurir', catatan: `Order kurir ke ${dto.tujuan_kirim === 'Teknisi' ? 'teknisi' : 'store'} · ${kurir?.name ?? r.courier_code} · resi ${r.resi ?? '-'} · Rp ${Number(r.charged_amount ?? 0).toLocaleString('id-ID')}` },
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
    if (!k) throw new NotFoundException('Pengiriman tidak ditemukan');
    if (!k.kurir_order_id) return this.lacakBinderbyte(k);
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

  /** Resi yang dikirim sendiri (bukan order api.co.id) → lacak lewat BinderByte (kuota terbatas, lihat cron) */
  private async lacakBinderbyte(k: { id_pengiriman: number; nomor_resi: string | null; nama_ekspedisi: string | null; tgl_terima: Date | null; kurir_status: string | null }) {
    const key = process.env.BINDERBYTE_API_KEY;
    if (!key) throw new BadRequestException('BINDERBYTE_API_KEY belum diisi di .env server');
    if (!k.nomor_resi) throw new BadRequestException('Isi nomor resi dulu');
    const courier = kodeBinderbyte(k.nama_ekspedisi);
    if (!courier) throw new BadRequestException(`Kurir "${k.nama_ekspedisi ?? '-'}" belum didukung pelacakan otomatis`);
    const url = `https://api.binderbyte.com/v1/track?${new URLSearchParams({ api_key: key, courier, awb: k.nomor_resi.trim() })}`;
    let j: any;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      j = await r.json().catch(() => null);
    } catch (e: any) {
      throw new BadRequestException(`BinderByte tidak bisa dihubungi: ${e?.message}`);
    }
    await this.prisma.pengirimanPerangkat.update({ where: { id_pengiriman: k.id_pengiriman }, data: { kurir_cek_at: new Date() } });
    if (Number(j?.status) !== 200 || !j?.data) throw new BadRequestException(`BinderByte: ${j?.message || 'resi tidak ditemukan'}`);
    const ring = j.data.summary ?? {};
    const status = statusBinderbyte(String(ring.status ?? ''));
    // tanggal BinderByte dalam WIB, mis. "2020-10-02 13:33:00"
    const tgl = (d: string) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(d) ? new Date(`${d.replace(' ', 'T')}+07:00`).toISOString() : d);
    const riwayat = (Array.isArray(j.data.history) ? j.data.history : []).map((h: any) => ({
      status: '', message: [h.desc, h.location].filter(Boolean).join(' — '), occurred_at: tgl(String(h.date ?? '')),
    })).reverse(); // urut lama → baru, sama dengan api.co.id
    const diterima = status === 'delivered';
    await this.prisma.pengirimanPerangkat.update({
      where: { id_pengiriman: k.id_pengiriman },
      data: {
        kurir_status: status, kurir_kode: courier, kurir_layanan: ring.service || null, kurir_riwayat: JSON.stringify(riwayat),
        status_pengiriman: STATUS_KIRIM[status] ?? 'Dikirim',
        ...(j.data.detail?.receiver ? { nama_penerima_di_lokasi: String(j.data.detail.receiver).slice(0, 150) } : {}),
        ...(diterima && !k.tgl_terima ? { tgl_terima: new Date() } : {}),
      },
    });
    return { data: j.data, message: `Status: ${ring.status || status}` };
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

  /** Lacak otomatis tiap 2 jam: order api.co.id (gratis) + resi manual lewat BinderByte (dibatasi) */
  @Cron('25 */2 * * *')
  async lacakBerkala() {
    if (!process.env.KURIR_API_KEY) return;
    const aktif = await this.prisma.pengirimanPerangkat.findMany({
      where: { kurir_order_id: { not: null }, OR: [{ kurir_status: null }, { kurir_status: { notIn: AKHIR } }] },
      select: { id_pengiriman: true }, take: 100,
    });
    // Resi manual (BinderByte, kuota terbatas): hanya yang sedang dikirim, dicek ≥ 8 jam lalu, dikirim ≤ 14 hari terakhir
    if (process.env.BINDERBYTE_API_KEY) {
      const manual = await this.prisma.pengirimanPerangkat.findMany({
        where: {
          kurir_order_id: null, nomor_resi: { not: null }, status_pengiriman: 'Dikirim',
          OR: [{ kurir_status: null }, { kurir_status: { notIn: AKHIR } }],
          AND: [
            { OR: [{ kurir_cek_at: null }, { kurir_cek_at: { lt: new Date(Date.now() - 8 * 3600_000) } }] },
            { OR: [{ tgl_kirim: null }, { tgl_kirim: { gte: new Date(Date.now() - 14 * 86400_000) } }] },
          ],
        },
        select: { id_pengiriman: true, nama_ekspedisi: true }, take: 30,
      });
      aktif.push(...manual.filter((m) => kodeBinderbyte(m.nama_ekspedisi)).map((m) => ({ id_pengiriman: m.id_pengiriman })));
    }
    for (const k of aktif) {
      try { await this.lacakPengiriman(k.id_pengiriman); } catch (e: any) { this.logger.warn(`lacak #${k.id_pengiriman}: ${e?.message}`); }
    }
  }
}
