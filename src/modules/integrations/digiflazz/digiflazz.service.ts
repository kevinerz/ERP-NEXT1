import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';
import { HaybiClient } from './digiflazz.client';
import { ConnectDigiflazzDto, BeliDigiflazzDto } from './dto/digiflazz.dto';

const DUPLIKAT_WINDOW_MS = 2 * 60 * 1000; // cegah klik ganda/retry setelah timeout ke Haybi

@Injectable()
export class DigiflazzService {
  private readonly logger = new Logger(DigiflazzService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: SecretCryptoService,
    private client: HaybiClient,
  ) {}

  async getConfig() {
    const row = await this.prisma.integrationDigiflazzConfig.findUnique({ where: { id: 1 } });
    return { data: { username: row?.username || '', mode: row?.mode || 'production', has_api_key: !!row?.api_key_enc } };
  }

  async updateConfig(dto: ConnectDigiflazzDto) {
    const creds = { username: dto.username, api_key: dto.api_key };
    // Validasi kredensial langsung — cek saldo, gagal kalau username/apikey salah
    await this.client.getSaldo(creds);

    await this.prisma.integrationDigiflazzConfig.upsert({
      where: { id: 1 },
      create: { id: 1, username: dto.username, api_key_enc: this.crypto.encrypt(dto.api_key) },
      update: { username: dto.username, api_key_enc: this.crypto.encrypt(dto.api_key) },
    });
    return { message: 'Konfigurasi Haybi H2H tersimpan & terverifikasi' };
  }

  private async resolveCreds() {
    const row = await this.prisma.integrationDigiflazzConfig.findUnique({ where: { id: 1 } });
    if (!row?.username || !row.api_key_enc) throw new BadRequestException('Haybi H2H belum dikonfigurasi — buka Konfigurasi Haybi');
    try {
      return { username: row.username, api_key: this.crypto.decrypt(row.api_key_enc) };
    } catch {
      throw new BadRequestException('Konfigurasi Haybi H2H rusak (kredensial tidak terbaca) — connect ulang');
    }
  }

  async getSaldo() {
    const creds = await this.resolveCreds();
    const saldo = await this.client.getSaldo(creds);
    return { data: { saldo } };
  }

  async getPriceList(kategori?: string) {
    const creds = await this.resolveCreds();
    const data = await this.client.getProducts(creds, { kategori });
    return { data };
  }

  async beli(dto: BeliDigiflazzDto, userId?: number) {
    const creds = await this.resolveCreds();

    const sumber = await this.prisma.sumberInternetSite.findUnique({ where: { id_sumber: dto.id_sumber } });
    if (!sumber) throw new NotFoundException('Sumber internet (SIM) tidak ditemukan');
    if (!sumber.nomor_pelanggan_isp) throw new BadRequestException('Nomor MSISDN belum diisi di data SIM ini — lengkapi dulu di Master Site');

    // Idempotency guard — cegah top-up ganda kalau user klik ulang setelah request sebelumnya timeout
    const duplikat = await this.prisma.simTopup.findFirst({
      where: {
        id_sumber: dto.id_sumber,
        buyer_sku_code: dto.buyer_sku_code,
        metode: 'Haybi',
        status_transaksi: { in: ['Sukses', 'Pending'] },
        tgl_topup: { gte: new Date(Date.now() - DUPLIKAT_WINDOW_MS) },
      },
      orderBy: { tgl_topup: 'desc' },
    });
    if (duplikat) {
      throw new BadRequestException(
        `Sudah ada transaksi top-up untuk SIM ini ${duplikat.status_transaksi === 'Pending' ? 'yang masih diproses' : 'yang baru saja berhasil'} ` +
        `(ref: ${duplikat.ref_id}). Cek status transaksi sebelum mencoba lagi.`,
      );
    }

    const ref_id = `ERP-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const result = await this.client.buy(creds, {
      kode_produk: dto.buyer_sku_code,
      no_tujuan: sumber.nomor_pelanggan_isp,
      ref_id,
    });

    const status_transaksi = result.status === 'sukses' ? 'Sukses' : result.status === 'error' ? 'Gagal' : 'Pending';

    let data;
    try {
      data = await this.prisma.simTopup.create({
        data: {
          id_sumber: dto.id_sumber,
          id_aset_sim: sumber.id_aset_sim,
          id_site: sumber.id_site,
          jenis_topup: 'Data',
          nominal: result.harga ?? 0,
          harga_modal: result.harga ?? 0,
          tgl_topup: new Date(),
          id_user: userId || null,
          keterangan: dto.keterangan,
          metode: 'Haybi',
          buyer_sku_code: dto.buyer_sku_code,
          customer_no: sumber.nomor_pelanggan_isp,
          ref_id,
          status_transaksi,
          serial_number: result.sn,
          provider_response: JSON.stringify(result),
        },
        include: {
          sumber: { include: { vendor: { select: { nama_vendor: true } } } },
          site: { select: { kode_site: true, nama_site: true } },
        },
      });
    } catch (err) {
      // Transaksi sudah dieksekusi/diproses di Haybi tapi gagal dicatat lokal —
      // jangan biarkan hilang tanpa jejak, ini menyangkut uang riil.
      this.logger.error(
        `GAGAL SIMPAN CATATAN TOPUP setelah request ke Haybi H2H — ref_id=${ref_id} status=${status_transaksi} ` +
        `id_sumber=${dto.id_sumber} response=${JSON.stringify(result)}`,
        (err as Error)?.stack,
      );
      throw new BadRequestException(
        `Transaksi ke Haybi H2H ${status_transaksi === 'Sukses' ? 'BERHASIL' : 'sudah diproses'} (ref: ${ref_id}) ` +
        'tapi GAGAL dicatat di sistem. JANGAN mengulangi pembelian ini — hubungi admin untuk rekonsiliasi manual.',
      );
    }

    return { data, message: result.pesan || `Transaksi ${status_transaksi}` };
  }

  async checkStatus(idTopup: number) {
    const row = await this.prisma.simTopup.findUnique({ where: { id_topup: idTopup } });
    if (!row) throw new NotFoundException('Transaksi tidak ditemukan');
    if (row.metode !== 'Haybi' || !row.ref_id)
      throw new BadRequestException('Bukan transaksi Haybi H2H');

    const creds = await this.resolveCreds();
    const result = await this.client.checkStatus(creds, row.ref_id);
    const status_transaksi = result.status === 'sukses' ? 'Sukses' : result.status === 'error' ? 'Gagal' : 'Pending';

    const data = await this.prisma.simTopup.update({
      where: { id_topup: idTopup },
      data: { status_transaksi, serial_number: result.sn, provider_response: JSON.stringify(result) },
    });
    return { data, message: result.pesan || `Status: ${status_transaksi}` };
  }
}
