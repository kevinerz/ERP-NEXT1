import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { RuijieService } from './ruijie.service';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('ruijie')
export class RuijieController {
  constructor(private readonly ruijieService: RuijieService) {}

  @Get('status')
  getStatus() { return this.ruijieService.getStatus(); }

  @Get('log')
  getLog(@Query() q: any) { return this.ruijieService.getWebhookLog(q); }

  // Trigger polling manual (tanpa menunggu cron 10 menit)
  @Post('poll')
  poll() { return this.ruijieService.poll(); }

  // ─── KONFIGURASI (Admin/Director — menyentuh kredensial) ────────

  @Roles('Admin', 'Director')
  @Get('config')
  getConfig() { return this.ruijieService.getConfig(); }

  @Roles('Admin', 'Director')
  @Patch('config')
  updateConfig(@Body() dto: { base_url?: string; appid?: string; app_secret?: string }) {
    return this.ruijieService.updateConfig(dto);
  }

  // ─── MAPPING PROJECT → SITE ────────────────────────────────────────

  @Get('mapping')
  listMapping() { return this.ruijieService.listMapping(); }

  @Get('mapping/unmatched')
  listUnmatched() { return this.ruijieService.listUnmatched(); }

  @Post('mapping')
  createMapping(@Body() dto: { ruijie_project_id: string; project_name: string; id_site: number }) {
    return this.ruijieService.createMapping(dto);
  }

  @Delete('mapping/:id')
  removeMapping(@Param('id', ParseIntPipe) id: number) { return this.ruijieService.removeMapping(id); }

  // ─── AUDIT PROJECT/DEVICE ────────────────────────────────────────

  @Get('devices')
  getDeviceOverview() { return this.ruijieService.getDeviceOverview(); }
}
