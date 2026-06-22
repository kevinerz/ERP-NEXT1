import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type DocType = 'WO' | 'TKT' | 'QUO' | 'BA' | 'BAST' | 'PRJ' | 'KTR';

@Injectable()
export class DocumentNumberService {
  constructor(private prisma: PrismaService) {}

  // Format: PREFIX/N1/YYYY/MM/NNN  (untuk WO, TKT, QUO, BA)
  // Format: PREFIX/N1/YYYY/NNN     (untuk BAST, PRJ, KTR)
  async generate(type: DocType): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    const withMonth = ['WO', 'TKT', 'QUO', 'BA'];
    const prefix = `${type}/N1/${yyyy}${withMonth.includes(type) ? '/' + mm : ''}`;

    // Cari nomor terakhir di tabel yang sesuai
    const lastNumber = await this.getLastNumber(type, yyyy, mm);
    const nextNum = String(lastNumber + 1).padStart(3, '0');

    return `${prefix}/${nextNum}`;
  }

  private async getLastNumber(type: DocType, yyyy: string, mm: string): Promise<number> {
    const withMonth = ['WO', 'TKT', 'QUO', 'BA'];
    const pattern = withMonth.includes(type)
      ? `${type}/N1/${yyyy}/${mm}/%`
      : `${type}/N1/${yyyy}/%`;

    // Map DocType ke field & tabel Prisma
    const map: Record<DocType, { model: string; field: string }> = {
      WO:   { model: 'workOrders',          field: 'nomor_wo' },
      TKT:  { model: 'operationTickets',    field: 'nomor_tiket' },
      QUO:  { model: 'salesQuotations',     field: 'nomor_quotation' },
      BA:   { model: 'woBeritaAcara',       field: 'nomor_ba' },
      BAST: { model: 'projectDokumenLegal', field: 'nomor_bast' },
      PRJ:  { model: 'projectDelivery',     field: 'nomor_project' },
      KTR:  { model: 'kontrakLayanan',      field: 'nomor_kontrak' },
    };

    const { model, field } = map[type];
    const result = await (this.prisma as any)[model].findFirst({
      where: { [field]: { startsWith: pattern.replace('%', '') } },
      orderBy: { [field]: 'desc' },
      select: { [field]: true },
    });

    if (!result) return 0;
    const parts = result[field].split('/');
    return parseInt(parts[parts.length - 1], 10);
  }
}
