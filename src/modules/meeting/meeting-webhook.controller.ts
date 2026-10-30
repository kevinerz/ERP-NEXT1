import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MeetingService } from './meeting.service';

// Webhook dari server LiveKit — diverifikasi dengan tanda tangan JWT (bukan login ERP).
// Body dibaca mentah (express.raw di main.ts) karena tanda tangan memuat sha256 body.
@Controller('meeting/webhook')
export class MeetingWebhookController {
  constructor(private meeting: MeetingService) {}

  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(200)
  terima(@Req() req: Request, @Headers('authorization') auth?: string) {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
    return this.meeting.webhook(body, auth);
  }
}
