import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Bangun DATABASE_URL dengan parameter ketahanan koneksi kalau belum ada.
 * Di shared hosting, tanpa batas koneksi + timeout, query bisa menggantung
 * (menghabiskan koneksi MySQL / nunggu pool) → proxy balas 408. Dipaksa dari
 * kode supaya tidak bergantung pada editing .env manual.
 */
function buildDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const defaults: Record<string, string> = {
    connection_limit: '5',
    connect_timeout: '10',
    pool_timeout: '10',
  };
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(defaults)) {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return url; // password dengan karakter aneh dll — pakai apa adanya
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');
  // Sengaja pendek: Node harus MEMBALAS (walau error) sebelum ambang 408 proxy.
  // Query normal jauh di bawah ini; kalau tembus 8 dtk berarti DB memang bermasalah.
  private static readonly QUERY_TIMEOUT_MS = 8000;

  constructor() {
    const datasourceUrl = buildDatasourceUrl();
    super(datasourceUrl ? { datasourceUrl } : {});
  }

  private isRustPanic(e: any): boolean {
    return (
      e?.name === 'PrismaClientRustPanicError' ||
      (typeof e?.message === 'string' && /PANIC:|timer has gone away/i.test(e.message))
    );
  }

  private raceTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Query DB timeout — database lambat/tak terjangkau')),
        PrismaService.QUERY_TIMEOUT_MS,
      );
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer!)) as Promise<T>;
  }

  onModuleInit() {
    // Middleware: batasi waktu tiap query + coba pulihkan engine saat panic.
    this.$use(async (params, next) => {
      try {
        return await this.raceTimeout(next(params));
      } catch (e: any) {
        if (this.isRustPanic(e)) {
          // Engine Rust mati (Hostinger membekukan proses). Coba reconnect SEKALI
          // lalu ulang query — tanpa process.exit supaya tidak restart-loop.
          this.logger.error('Prisma panic — mencoba reconnect engine sekali');
          await this.$disconnect().catch(() => {});
          await this.$connect().catch(() => {});
          return await this.raceTimeout(next(params));
        }
        throw e;
      }
    });

    // JANGAN await — Hostinger membunuh proses kalau listen() telat >3 detik.
    // Prisma connect otomatis saat query pertama; hangatkan di background.
    this.$connect().catch((e) => {
      this.logger.warn(`Koneksi awal DB gagal (akan retry otomatis saat query): ${e?.message}`);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect().catch(() => {});
  }
}
