import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../decorators/public.decorator';

/**
 * Health check — publik (tanpa login), untuk memastikan proses hidup & DB
 * terjangkau tanpa perlu bisa login dulu.
 *   GET /api/health     → liveness (proses listen? tanpa DB)
 *   GET /api/health/db  → jalankan SELECT 1 (uji koneksi DB, timeout 5 dtk)
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  liveness() {
    return { data: { status: 'ok', uptime_s: Math.round(process.uptime()) } };
  }

  @Public()
  @Get('db')
  async db() {
    const start = Date.now();
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`, 5000);
      return { data: { database: 'connected', ms: Date.now() - start } };
    } catch (e: any) {
      const ms = Date.now() - start;
      this.logger.error(`Health DB gagal (${ms}ms): ${e?.message}`);
      // Jangan bocorkan connection string/password — cukup pesan singkat.
      throw new ServiceUnavailableException(`database failed after ${ms}ms: ${e?.message}`);
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer!)) as Promise<T>;
  }
}
