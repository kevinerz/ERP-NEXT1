import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  // Global JWT guard — semua route butuh token kecuali yang @Public()
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  // Serve Vue 3 SPA dari folder public/
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'public'));

  // CORS (untuk development — di production dihandle Nginx/Hostinger)
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: 'http://localhost:5173' });
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`ERP NEXT1 running on port ${port}`);
}

bootstrap();
