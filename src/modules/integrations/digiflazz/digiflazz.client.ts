import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

export interface HaybiCreds {
  username: string;
  api_key: string;
}

export interface HaybiProduct {
  kode: string;
  nama: string;
  kategori: string;
  operator: string;
  harga: number;
  harga_jual?: number;
  status?: string;
  deskripsi?: string;
}

export interface HaybiTrxResult {
  ref_id?: string;
  no_tujuan?: string;
  produk?: string;
  pesan: string;
  status: string; // sukses | pending | error
  rc: string;
  sn?: string;
  harga?: number;
  saldo_akhir?: number;
}

const BASE_URL = 'https://haybi.id/api/h2h';

/** HaybiClient — akses REST API Haybi H2H (PPOB pulsa/paket data).
 * Sign: md5(username + api_key + ref_id), wajib di semua endpoint. */
@Injectable()
export class HaybiClient {
  private sign(creds: HaybiCreds, ref_id: string): string {
    return createHash('md5').update(`${creds.username}${creds.api_key}${ref_id}`).digest('hex');
  }

  private makeRef(): string {
    return `haybi-${Date.now()}`;
  }

  private async post(path: string, body: Record<string, any>): Promise<any> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    let json: any;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok || json?.status === 'error') {
      const detail = json?.pesan || json?.message;
      throw new BadRequestException(detail ? `Haybi: ${detail}` : `Haybi API error ${res.status}`);
    }
    return json;
  }

  async getSaldo(creds: HaybiCreds): Promise<number> {
    const ref_id = this.makeRef();
    const data = await this.post('/cek-saldo', {
      username: creds.username,
      ref_id,
      sign: this.sign(creds, ref_id),
    });
    if (data?.status === 'error') throw new BadRequestException(`Gagal cek saldo Haybi: ${data.pesan || data.rc}`);
    return data?.saldo ?? data?.deposit ?? 0;
  }

  async getProducts(creds: HaybiCreds, opts?: { kategori?: string; operator?: string }): Promise<HaybiProduct[]> {
    const ref_id = this.makeRef();
    const body: Record<string, any> = {
      username: creds.username,
      ref_id,
      sign: this.sign(creds, ref_id),
    };
    if (opts?.kategori) body.kategori = opts.kategori;
    if (opts?.operator) body.operator = opts.operator;

    const data = await this.post('/produk', body);
    const list = data?.produk ?? data?.data ?? data;
    if (!Array.isArray(list)) {
      throw new BadRequestException('Gagal ambil daftar produk Haybi — response tidak valid');
    }
    return list as HaybiProduct[];
  }

  async buy(creds: HaybiCreds, params: { kode_produk: string; no_tujuan: string; ref_id: string }): Promise<HaybiTrxResult> {
    const data = await this.post('/transaksi', {
      username: creds.username,
      ref_id: params.ref_id,
      sign: this.sign(creds, params.ref_id),
      produk: params.kode_produk,
      no_tujuan: params.no_tujuan,
    });
    if (!data) throw new BadRequestException('Respons Haybi kosong/tidak valid');
    return data as HaybiTrxResult;
  }

  async checkStatus(creds: HaybiCreds, ref_id: string): Promise<HaybiTrxResult> {
    const data = await this.post('/cek-status', {
      username: creds.username,
      ref_id,
      sign: this.sign(creds, ref_id),
    });
    return data as HaybiTrxResult;
  }
}
