import { BadGatewayException, HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Payload pesan dari gateway (lihat wa-gateway/src/normalisasi.ts) */
export interface GwPesan {
  id: string;
  chat_jid: string;
  chat_lid: string | null;
  is_grup: boolean;
  dari_saya: boolean;
  pengirim_jid: string | null;
  pengirim_lid: string | null;
  nama_pengirim: string | null;
  waktu: number;
  tipe: string;
  teks: string | null;
  media: {
    jenis: string; mimetype: string | null; nama_file: string | null; ukuran: number | null;
    durasi: number | null; ptt: boolean; file: string | null;
  } | null;
  kutipan: { id: string; pengirim_jid: string | null; teks: string | null } | null;
  lokasi: { lat: number; lng: number; nama: string | null; alamat: string | null } | null;
  kontak: { nama: string | null; vcard: string | null }[] | null;
  reaksi: { target_id: string; emoji: string } | null;
  target_id: string | null;
  status: number | null;
  riwayat: boolean;
}

export interface GwKirim {
  ke: string;
  teks?: string;
  media?: { base64: string; mimetype: string; jenis: string; nama_file?: string; ptt?: boolean };
  kutip?: { id: string; dari_saya: boolean; pengirim_jid?: string | null; teks?: string | null };
}

/** Klien REST ke wa-gateway (VM whatsapp-Gateway). Kunci bersama di env WA_GATEWAY_KEY. */
@Injectable()
export class WaGatewayClient {
  private readonly logger = new Logger('WaGateway');
  constructor(private config: ConfigService) {}

  get url() { return (this.config.get<string>('WA_GATEWAY_URL') || 'http://192.168.200.186:3100').replace(/\/$/, ''); }
  get key() { return this.config.get<string>('WA_GATEWAY_KEY') || ''; }

  private async panggil<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.url}${path}`, {
        method,
        headers: { 'X-Api-Key': this.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e: any) {
      this.logger.warn(`${method} ${path} gagal: ${e?.message}`);
      throw new BadGatewayException('Gateway WhatsApp tidak bisa dihubungi');
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpException(json?.message || `Gateway WhatsApp error ${res.status}`, res.status === 401 ? 502 : res.status);
    return json.data as T;
  }

  status(akun: string) { return this.panggil<any>('GET', `/akun/${akun}/status`); }
  mulai(akun: string) { return this.panggil<any>('POST', `/akun/${akun}/mulai`, {}); }
  logout(akun: string) { return this.panggil<any>('POST', `/akun/${akun}/logout`, {}); }
  kirim(akun: string, dto: GwKirim) { return this.panggil<GwPesan | null>('POST', `/akun/${akun}/kirim`, dto, 120_000); }
  baca(akun: string, jid: string, pesan: { id: string; pengirim_jid?: string | null }[]) {
    return this.panggil<boolean>('POST', `/akun/${akun}/baca`, { jid, pesan });
  }
  reaksi(akun: string, jid: string, target: { id: string; dari_saya: boolean; pengirim_jid?: string | null }, emoji: string) {
    return this.panggil<boolean>('POST', `/akun/${akun}/reaksi`, { jid, target, emoji });
  }
  unduhUlang(akun: string, id: string) { return this.panggil<{ file: string }>('POST', `/akun/${akun}/media/ulang`, { id }, 180_000); }
  foto(akun: string, jid: string, tipe: 'preview' | 'image') {
    return this.panggil<string | null>('GET', `/akun/${akun}/foto/${encodeURIComponent(jid)}?tipe=${tipe}`, undefined, 20_000);
  }
  grup(akun: string, jid: string) { return this.panggil<any>('GET', `/akun/${akun}/grup/${encodeURIComponent(jid)}`); }

  /** Unduh file media yang sudah disimpan gateway */
  async media(akun: string, file: string): Promise<Buffer> {
    const res = await fetch(`${this.url}/akun/${akun}/media/${encodeURIComponent(file)}`, {
      headers: { 'X-Api-Key': this.key },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`media ${file}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
