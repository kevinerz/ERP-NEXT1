import { Prisma } from '@prisma/client';
import { wibYearMonth } from './wib';

/** Prefix TKT-YYYYMM menurut bulan WIB — server berjalan di UTC. */
export function ticketPrefix(now: Date): string {
  const { year, month } = wibYearMonth(now);
  return `TKT-${year}${String(month).padStart(2, '0')}`;
}

/**
 * Buat record dengan nomor tiket berikutnya; ulangi kalau nomor bentrok (P2002)
 * karena tiket manual, PRTG, dan Uptime Kuma bisa dibuat di detik yang sama.
 */
export async function withNextTicketNumber<T>(
  prisma: { operationTicket: { findFirst: (args: any) => Promise<{ nomor_tiket: string } | null> } },
  now: Date,
  create: (nomor_tiket: string) => Promise<T>,
): Promise<T> {
  const prefix = ticketPrefix(now);
  for (let attempt = 0; ; attempt++) {
    const last = await prisma.operationTicket.findFirst({
      where: { nomor_tiket: { startsWith: prefix } },
      orderBy: { nomor_tiket: 'desc' },
      select: { nomor_tiket: true },
    });
    const seq = (last ? parseInt(last.nomor_tiket.split('-')[2], 10) || 0 : 0) + 1;
    try {
      return await create(`${prefix}-${String(seq).padStart(4, '0')}`);
    } catch (e) {
      const dupNomor = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (!dupNomor || attempt >= 4) throw e;
    }
  }
}
