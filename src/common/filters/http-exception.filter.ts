import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Sambungan sudah ditutup klien / header sudah terkirim (mis. unduhan dibatalkan) — tidak ada yang bisa dibalas
    if (response.headersSent) return;

    const dikenal = exception instanceof HttpException ? null : terjemahkanGalat(exception);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (dikenal?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    let message: unknown =
      exception instanceof HttpException
        ? exception.getResponse()
        : (dikenal?.pesan ??
          'Terjadi kesalahan di server. Coba lagi; bila berulang, hubungi admin.');
    if (status === HttpStatus.TOO_MANY_REQUESTS)
      message = 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.';

    // Error tak terduga (bukan HttpException bisnis) — WAJIB ke-log server-side,
    // supaya bug beneran tidak menghilang tanpa jejak di balik pesan generik ini.
    if (!(exception instanceof HttpException) && !dikenal?.wajar) {
      this.logger.error(
        `${request.method} ${request.url} -> 500: ${(exception as any)?.message || exception}`,
        (exception as any)?.stack,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        typeof message === 'object' && 'message' in (message as object)
          ? (message as any).message
          : message,
    });
  }
}

/**
 * Error teknis yang umum (Prisma, unggahan, JSON rusak) → status & kalimat yang bisa dipahami pengguna,
 * supaya tidak muncul sebagai "Internal server error" 500 yang tidak menjelaskan apa-apa.
 * `wajar` = kesalahan input biasa, tidak perlu dicatat sebagai bug.
 */
function terjemahkanGalat(
  e: any,
): { status: number; pesan: string; wajar?: boolean } | null {
  const kode = e?.code;
  const nama = e?.name || e?.constructor?.name || '';
  if (typeof kode === 'string' && /^P\d{4}$/.test(kode)) {
    switch (kode) {
      case 'P2002': {
        const t = e?.meta?.target;
        const kolom = Array.isArray(t) ? t.join(', ') : t ? String(t) : '';
        return {
          status: 409,
          wajar: true,
          pesan: `Data dengan nilai yang sama sudah ada${kolom ? ` (${kolom.replace(/_key$|_unique$/g, '').replace(/_/g, ' ')})` : ''}. Gunakan nilai lain.`,
        };
      }
      case 'P2003':
      case 'P2014':
        return {
          status: 409,
          wajar: true,
          pesan:
            'Data ini masih dipakai atau merujuk ke data lain yang tidak ada, sehingga tidak bisa diproses.',
        };
      case 'P2025':
        return {
          status: 404,
          wajar: true,
          pesan: 'Data tidak ditemukan — mungkin sudah dihapus.',
        };
      case 'P2000':
        return {
          status: 400,
          wajar: true,
          pesan: `Isian terlalu panjang${e?.meta?.column_name ? ` pada kolom ${e.meta.column_name}` : ''}. Persingkat lalu coba lagi.`,
        };
      case 'P2020':
        return {
          status: 400,
          wajar: true,
          pesan: 'Angka yang dimasukkan di luar batas yang diizinkan.',
        };
      case 'P2024':
      case 'P1001':
      case 'P1002':
      case 'P1008':
      case 'P1017':
        return {
          status: 503,
          pesan:
            'Basis data sedang sibuk atau tidak dapat dihubungi. Coba lagi sebentar lagi.',
        };
      case 'P2034':
        return {
          status: 409,
          pesan:
            'Data sedang diubah oleh proses lain. Coba lagi sebentar lagi.',
        };
    }
    return null;
  }
  // Layanan luar (PRTG, NOCaaS, WhatsApp, kurir, dll.) tidak menjawab — bukan galat ERP
  const pesanAsli = String(e?.message || '');
  if (nama === 'TimeoutError' || nama === 'AbortError' || /aborted due to timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(pesanAsli))
    return {
      status: 504,
      pesan: 'Layanan yang dihubungi terlalu lama merespons. Coba lagi sebentar lagi.',
    };
  if (/^fetch failed$|ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|socket hang up/i.test(pesanAsli))
    return {
      status: 502,
      pesan: 'Layanan yang dihubungi sedang tidak dapat dijangkau. Coba lagi sebentar lagi.',
    };
  if (nama === 'PrismaClientValidationError')
    return {
      status: 400,
      pesan: 'Data yang dikirim tidak sesuai format yang diharapkan.',
    };
  if (nama === 'MulterError') {
    return {
      status: kode === 'LIMIT_FILE_SIZE' ? 413 : 400,
      wajar: true,
      pesan:
        kode === 'LIMIT_FILE_SIZE'
          ? 'Berkas terlalu besar untuk diunggah.'
          : kode === 'LIMIT_UNEXPECTED_FILE' || kode === 'LIMIT_FILE_COUNT'
            ? 'Jumlah atau jenis berkas yang diunggah tidak sesuai.'
            : 'Berkas gagal diunggah. Periksa berkas lalu coba lagi.',
    };
  }
  if (e?.type === 'entity.too.large')
    return { status: 413, wajar: true, pesan: 'Data yang dikirim terlalu besar.' };
  if (e?.type === 'entity.parse.failed')
    return { status: 400, wajar: true, pesan: 'Format data yang dikirim tidak valid.' };
  return null;
}
