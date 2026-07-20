import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ModulAksesGuard } from './common/guards/modul-akses.guard';
import { TokenBlacklistService } from './modules/auth/token-blacklist.service';

// Node mematikan seluruh proses kalau ada promise rejection yang tak tertangani
// di mana pun (default sejak Node 15) — satu query gagal di satu tempat yang
// lupa di-try/catch bisa menjatuhkan seluruh aplikasi. Log saja, jangan biarkan
// itu terjadi lagi.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Naikkan limit JSON body ke 10mb (untuk base64 logo dll)
  app.use(json({ limit: '10mb' }));

  // Prefix semua API route dengan /api
  app.setGlobalPrefix('api');

  // Validasi DTO otomatis
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global error handler & response format
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global JWT guard + RolesGuard — semua route butuh token kecuali yang @Public()
  const reflector = app.get(Reflector);
  const tokenBlacklist = app.get(TokenBlacklistService);
  app.useGlobalGuards(new JwtAuthGuard(reflector, tokenBlacklist), new RolesGuard(reflector), new ModulAksesGuard(reflector));

  // Serve Vue 3 SPA dari folder public/
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'public'));

  // CORS — selalu aktif dengan allowlist dari env (fallback ke localhost dev)
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:5173'];
  app.enableCors({ origin: corsOrigins, credentials: true });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`ERP NEXT1 running on port ${port}`);
}

bootstrap();
