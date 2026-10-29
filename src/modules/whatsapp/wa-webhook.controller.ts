import { Body, Controller, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WaService } from './wa.service';

// Event dari wa-gateway (pesan, riwayat, status, koneksi, ...). Dijaga kunci bersama X-Api-Key.
// Tanpa throttle: sinkron riwayat pertama mengirim ratusan batch berturut-turut.
@SkipThrottle()
@Controller('wa/webhook')
export class WaWebhookController {
  constructor(private wa: WaService, private config: ConfigService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async terima(@Req() req: Request, @Body() body: any) {
    const kunci = this.config.get<string>('WA_GATEWAY_KEY') || '';
    const a = Buffer.from(String(req.headers['x-api-key'] ?? ''));
    const b = Buffer.from(kunci);
    if (!kunci || a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    await this.wa.webhook(body);
    return { ok: true };
  }
}
