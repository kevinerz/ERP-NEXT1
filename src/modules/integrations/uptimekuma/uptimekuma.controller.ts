import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { UptimeKumaService } from './uptimekuma.service';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('uptime-kuma')
export class UptimeKumaController {
  constructor(private readonly svc: UptimeKumaService) {}

  @Get('status')
  getStatus() { return this.svc.getStatus(); }

  @Get('log')
  getLog(@Query() q: any) { return this.svc.getWebhookLog(q); }

  // ─── KONFIGURASI (Admin/Director — menyentuh token webhook) ─────

  @Roles('Admin', 'Director')
  @Get('config')
  getConfig() { return this.svc.getConfig(); }

  @Roles('Admin', 'Director')
  @Patch('config')
  updateConfig(@Body() dto: { base_url?: string; status_page_slug?: string }) {
    return this.svc.updateConfig(dto);
  }

  @Roles('Admin', 'Director')
  @Post('config/regenerate-token')
  regenerateToken() { return this.svc.regenerateToken(); }

  // ─── MAPPING MONITOR → SITE ──────────────────────────────────────

  @Get('mapping')
  listMapping() { return this.svc.listMapping(); }

  @Get('mapping/unmatched')
  listUnmatched() { return this.svc.listUnmatched(); }

  @Post('mapping')
  createMapping(@Body() dto: { monitor_id: string; monitor_name: string; id_site: number }) {
    return this.svc.createMapping(dto);
  }

  @Delete('mapping/:id')
  removeMapping(@Param('id', ParseIntPipe) id: number) { return this.svc.removeMapping(id); }

  // ─── AUDIT MONITOR ────────────────────────────────────────────────

  @Get('devices')
  getMonitorOverview() { return this.svc.getMonitorOverview(); }
}
