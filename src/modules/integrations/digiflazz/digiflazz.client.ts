import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

export interface DigiflazzCreds {
  username: string;
  api_key: string;
  mode: 'production' | 'development';
}

export interface DigiflazzProduct {
  buyer_sku_code: string;
  product_name: string;
  category: string;
  brand: string;
  type: string;
  price: number;
  seller_name: string;
  buyer_product_status: boolean;
  seller_product_status: boolean;
  unlimited_stock: boolean;
  stock: number;
  desc: string;
}

export interface DigiflazzTrxResult {
  ref_id: string;
  customer_no: string;
  buyer_sku_code: string;
  message: string;
  status: string; // Pending | Sukses | Gagal
  rc?: string;
  sn?: string;
  price?: number;
  buyer_last_saldo?: number;
}

const BASE_URL = 'https://api.digiflazz.com/v1';

/** DigiflazzClient — akses REST API Digiflazz (PPOB pulsa/paket data). Semua
 * request ditandatangani MD5(username + apikey + <konteks>) sesuai spek mereka. */
@Injectable()
export class DigiflazzClient {
  private sign(creds: DigiflazzCreds, context: string): string {
    return createHash('md5').update(`${creds.username}${creds.api_key}${context}`).digest('hex');
  }

  private async post(path: string, body: Record<string, any>): Promise<any> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    // Digiflazz sering balas detail error (rc/message) di body walau HTTP status-nya sendiri 4xx/5xx —
    // coba parse body dulu sebelum nyerah ke pesan generik.
    let json: any;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) {
      const detail = json?.data?.message || json?.message || json?.data?.rc;
      throw new BadRequestException(detail ? `Digiflazz: ${detail}` : `Digiflazz API error ${res.status}`);
    }
    return json?.data;
  }

  async getSaldo(creds: DigiflazzCreds): Promise<number> {
    const data = await this.post('/cek-saldo', {
      cmd: 'deposit',
      username: creds.username,
      sign: this.sign(creds, 'depo'),
    });
    if (data?.rc && data.rc !== '00') throw new BadRequestException(`Gagal cek saldo Digiflazz: ${data.message || data.rc}`);
    return data?.saldo ?? 0;
  }

  async getPriceList(creds: DigiflazzCreds, opts?: { category?: string }): Promise<DigiflazzProduct[]> {
    const data = await this.post('/price-list', {
      cmd: 'prepaid',
      username: creds.username,
      sign: this.sign(creds, 'pricelist'),
    });
    if (!Array.isArray(data)) throw new BadRequestException('Gagal ambil daftar produk Digiflazz');
    let list = data as DigiflazzProduct[];
    if (opts?.category) list = list.filter((p) => p.category?.toLowerCase() === opts.category!.toLowerCase());
    return list.filter((p) => p.buyer_product_status && p.seller_product_status);
  }

  async buy(creds: DigiflazzCreds, params: { buyer_sku_code: string; customer_no: string; ref_id: string }): Promise<DigiflazzTrxResult> {
    const data = await this.post('/transaction', {
      username: creds.username,
      buyer_sku_code: params.buyer_sku_code,
      customer_no: params.customer_no,
      ref_id: params.ref_id,
      sign: this.sign(creds, params.ref_id),
      testing: creds.mode === 'development',
    });
    if (!data) throw new BadRequestException('Respons Digiflazz kosong/tidak valid');
    return data as DigiflazzTrxResult;
  }

  /** Cek ulang status transaksi yang masih Pending — pakai ref_id yg sama */
  async checkStatus(creds: DigiflazzCreds, params: { buyer_sku_code: string; customer_no: string; ref_id: string }): Promise<DigiflazzTrxResult> {
    const data = await this.post('/transaction', {
      commands: 'status-pembelian',
      username: creds.username,
      buyer_sku_code: params.buyer_sku_code,
      customer_no: params.customer_no,
      ref_id: params.ref_id,
      sign: this.sign(creds, params.ref_id),
    });
    return data as DigiflazzTrxResult;
  }
}
