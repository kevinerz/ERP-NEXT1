import { Body, Controller, Param, Post } from '@nestjs/common';
import { UptimeKumaService } from './uptimekuma.service';
import { Public } from '../../../common/decorators/public.decorator';

// Endpoint publik — dipanggil oleh Uptime Kuma sendiri (webhook notification),
// bukan oleh user aplikasi. Otentikasi lewat token di path, bukan JWT.
@Controller('webhook/uptime-kuma')
export class UptimeKumaWebhookController {
  constructor(private readonly svc: UptimeKumaService) {}

  @Public()
  @Post(':token')
  handle(@Param('token') token: string, @Body() body: any) {
    return this.svc.handleWebhook(token, body);
  }
}
