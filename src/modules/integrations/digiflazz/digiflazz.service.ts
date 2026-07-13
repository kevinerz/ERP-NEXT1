import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecretCryptoService } from '../../../common/crypto/secret-crypto.service';
import { DigiflazzClient } from './digiflazz.client';
import { ConnectDigiflazzDto, BeliDigiflazzDto } from './dto/digiflazz.dto';

@Injectable()
export class DigiflazzService {
  constructor(
    private prisma: PrismaService,
    private crypto: SecretCryptoService,
    private client: DigiflazzClient,
  ) {}

  async getConfig() {
    const row = await this.prisma.integrationDigiflazzConfig.findUnique({ where: { id: 1 } });
    return { data: { username: row?.username || '', mode: row?.mode || 'production', has_api_key: !!row?.api_key_enc } };
  }

  async updateConfig(dto: ConnectDigiflazzDto) {
    const creds = { username: dto.username, api_key: dto.api_key, mode: dto.mode };
    // Validasi kredensial langsung — cek saldo, gagal kalau username/apikey salah
    await this.client.getSaldo(creds);

    await this.prisma.integrationDigiflazzConfig.upsert({
      where: { id: 1 },
      create: { id: 1, username: dto.username, api_key_enc: this.crypto.encrypt(dto.api_key), mode: dto.mode },
      update: { username: dto.username, api_key_enc: this.crypto.encrypt(dto.api_key), mode: dto.mode },
    });
    return { message: 'Konfigurasi Digiflazz tersimpan & terverifikasi' };
  }

  private async resolveCreds() {
    const row = await this.prisma.integrationDigiflazzConfig.findUnique({ where: { id: 1 } });
    if (!row?.username || !row.api_key_enc) throw new BadRequestException('Digiflazz belum dikonfigurasi — buka Konfigurasi Digiflazz');
    try {
      return { username: row.username, api_key: this.crypto.decrypt(row.api_key_enc), mode: row.mode as 'production' | 'development' };
    } catch {
      throw new BadRequestException('Konfigurasi Digiflazz rusak (kredensial tidak terbaca) — connect ulang');
    }
  }

  async getSaldo() {
    const creds = await this.resolveCreds();
    const saldo = await this.client.getSaldo(creds);
    return { data: { saldo } };
  }

  async getPriceList(category?: string) {
    const creds = await this.resolveCreds();
    const data = await this.client.getPriceList(creds, { category });
    return { data };
  }

  async beli(dto: BeliDigiflazzDto, userId?: number) {
    const creds = await this.resolveCreds();

    const sumber = await this.prisma.sumberInternetSite.findUnique({ where: { id_sumber: dto.id_sumber } });
    if (!sumber) throw new NotFoundException('Sumber internet (SIM) tidak ditemukan');
    if (!sumber.nomor_pelanggan_isp) throw new BadRequestException('Nomor MSISDN belum diisi di data SIM ini — lengkapi dulu di Master Site');

    const ref_id = `ERP-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const result = await this.client.buy(creds, {
      buyer_sku_code: dto.buyer_sku_code,
      customer_no: sumber.nomor_pelanggan_isp,
      ref_id,
    });

    const status_transaksi = result.status === 'Sukses' ? 'Sukses' : result.status === 'Gagal' ? 'Gagal' : 'Pending';
    const data = await this.prisma.simTopup.create({
      data: {
        id_sumber: dto.id_sumber,
        id_aset_sim: sumber.id_aset_sim,
        id_site: sumber.id_site,
        jenis_topup: 'Data',
        nominal: result.price ?? 0,
        harga_modal: result.price ?? 0,
        tgl_topup: new Date(),
        id_user: userId || null,
        keterangan: dto.keterangan,
        metode: 'Digiflazz',
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

    return { data, message: result.message || `Transaksi ${status_transaksi}` };
  }

  async checkStatus(idTopup: number) {
    const row = await this.prisma.simTopup.findUnique({ where: { id_topup: idTopup } });
    if (!row) throw new NotFoundException('Transaksi tidak ditemukan');
    if (row.metode !== 'Digiflazz' || !row.ref_id || !row.buyer_sku_code || !row.customer_no)
      throw new BadRequestException('Bukan transaksi Digiflazz');

    const creds = await this.resolveCreds();
    const result = await this.client.checkStatus(creds, {
      buyer_sku_code: row.buyer_sku_code,
      customer_no: row.customer_no,
      ref_id: row.ref_id,
    });
    const status_transaksi = result.status === 'Sukses' ? 'Sukses' : result.status === 'Gagal' ? 'Gagal' : 'Pending';

    const data = await this.prisma.simTopup.update({
      where: { id_topup: idTopup },
      data: { status_transaksi, serial_number: result.sn, provider_response: JSON.stringify(result) },
    });
    return { data, message: `Status: ${status_transaksi}` };
  }
}
