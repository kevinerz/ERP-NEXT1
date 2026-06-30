import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';

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
  constructor(
    private prisma: PrismaService,
    private upload: UploadService,
  ) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.appSetting.findMany();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
    // Merge with defaults so missing keys still appear
    const result: Record<string, string> = { ...DEFAULTS };
    for (const k of Object.keys(stored)) result[k] = stored[k];
    return result;
  }

  async updateMany(dto: Partial<Record<SettingKey, string>>) {
    const ops = Object.entries(dto).map(([key, value]) =>
      this.prisma.appSetting.upsert({
        where: { key },
        create: { key, value: value ?? '' },
        update: { value: value ?? '' },
      }),
    );
    await this.prisma.$transaction(ops);
    return { message: 'Pengaturan disimpan' };
  }

  async uploadLogo(buffer: Buffer, originalname: string): Promise<{ url: string }> {
    const ext = originalname.split('.').pop() ?? 'png';
    const url = await this.upload.uploadFile(buffer, 'company', `logo.${ext}`);
    await this.prisma.appSetting.upsert({
      where: { key: 'company_logo_url' },
      create: { key: 'company_logo_url', value: url },
      update: { value: url },
    });
    return { url };
  }
}
