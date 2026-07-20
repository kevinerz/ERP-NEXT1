import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const SETTING_KEYS = [
  'company_name',
  'company_brand',
  'company_tagline',
  'company_address',
  'company_city',
  'company_phone',
  'company_email',
  'company_website',
  'company_npwp',
  'company_logo_url',
  'invoice_prefix',
  'invoice_footer',
  'currency_symbol',
  'timezone',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

const DEFAULTS: Record<SettingKey, string> = {
  company_name:    'PT Perdana Global Internet',
  company_brand:   'Next1',
  company_tagline: 'Internet Service Provider',
  company_address: '',
  company_city:    '',
  company_phone:   '',
  company_email:   '',
  company_website: '',
  company_npwp:    '',
  company_logo_url:'',
  invoice_prefix:  'INV',
  invoice_footer:  'Terima kasih atas kepercayaan Anda.',
  currency_symbol: 'Rp',
  timezone:        'Asia/Jakarta',
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.appSetting.findMany();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
    // Merge with defaults so missing keys still appear
    const result: Record<string, string> = { ...DEFAULTS };
    for (const k of Object.keys(stored)) result[k] = stored[k];
    return result;
  }

  async updateMany(dto: Partial<Record<SettingKey, string>>) {
    // Saring ke SETTING_KEYS yang dikenal saja — controller memakai
    // ValidationPipe({whitelist:false}) karena DTO ini cuma type alias (bukan
    // class), jadi tidak ada whitelisting nyata di level HTTP; benteng
    // terakhirnya ada di sini supaya key sembarangan tidak ikut ter-upsert.
    const ops = SETTING_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(dto, key))
      .map((key) => {
        const value = dto[key] ?? '';
        return this.prisma.appSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      });
    await this.prisma.$transaction(ops);
    return { message: 'Pengaturan disimpan' };
  }

  async uploadLogo(buffer: Buffer, mimetype: string): Promise<{ url: string }> {
    // Simpan sebagai data URL langsung di DB — tidak perlu filesystem.
    // SVG ditolak (vektor XSS saat dirender sebagai data-URL).
    const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!ALLOWED.includes(mimetype))
      throw new BadRequestException('Format logo harus PNG, JPG, atau WebP');
    if (buffer.length > 2 * 1024 * 1024)
      throw new BadRequestException('Ukuran logo maksimal 2MB');
    const b64 = buffer.toString('base64');
    const url = `data:${mimetype};base64,${b64}`;
    await this.prisma.appSetting.upsert({
      where: { key: 'company_logo_url' },
      create: { key: 'company_logo_url', value: url },
      update: { value: url },
    });
    return { url };
  }
}
