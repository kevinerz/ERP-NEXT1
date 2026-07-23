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

    // Prisma Rust panic ("PANIC: timer has gone away") = query engine mati
    // PERMANEN; tanpa restart, SEMUA request berikutnya 500 terus. Balas 503
    // lalu keluar agar Hostinger me-restart proses dengan engine segar.
    const isPrismaPanic =
      (exception as any)?.name === 'PrismaClientRustPanicError' ||
      (exception instanceof Error && /PANIC:|timer has gone away/i.test(exception.message));
    if (isPrismaPanic) {
      this.logger.error('Prisma Rust panic terdeteksi — proses akan restart untuk pulihkan engine DB');
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        timestamp: new Date().toISOString(),
        path: request.url,
        message: 'Server sedang memulihkan koneksi database — coba lagi beberapa detik',
      });
      // Beri jeda singkat agar response sempat terkirim sebelum proses keluar.
      setTimeout(() => process.exit(1), 200);
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Error tak terduga (bukan HttpException bisnis) — WAJIB ke-log server-side,
    // supaya bug beneran tidak menghilang tanpa jejak di balik pesan generik ini.
    if (!(exception instanceof HttpException)) {
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
