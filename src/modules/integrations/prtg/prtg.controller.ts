import { Controller, Get, Post, Query } from '@nestjs/common';
import { PrtgService } from './prtg.service';

@Controller('prtg')
export class PrtgController {
  constructor(private readonly prtgService: PrtgService) {}

  @Get('status')
  getStatus() { return this.prtgService.getStatus(); }

  @Get('log')
  getLog(@Query() q: any) { return this.prtgService.getWebhookLog(q); }

  // Trigger polling manual (tanpa menunggu cron 5 menit)
  @Post('poll')
  poll() { return this.prtgService.poll(); }
}
