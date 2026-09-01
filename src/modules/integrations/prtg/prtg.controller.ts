import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrtgService } from './prtg.service';
import { Roles } from '../../../common/decorators/roles.decorator';

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

  // Aktif/jeda polling — Admin/Director
  @Roles('Admin', 'Director')
  @Patch('toggle')
  toggle(@Body() dto: { aktif: boolean }) { return this.prtgService.setAktif(!!dto.aktif); }

  // ─── KONFIGURASI (Admin/Director — menyentuh kredensial) ────────

  @Roles('Admin', 'Director')
  @Get('config')
  getConfig() { return this.prtgService.getConfig(); }

  @Roles('Admin', 'Director')
  @Patch('config')
  updateConfig(@Body() dto: { base_url?: string; username?: string; passhash?: string }) {
    return this.prtgService.updateConfig(dto);
  }

  // ─── MAPPING DEVICE → SITE ────────────────────────────────────────

  @Get('mapping')
  listMapping() { return this.prtgService.listMapping(); }

  @Get('mapping/unmatched')
  listUnmatched() { return this.prtgService.listUnmatched(); }

  @Post('mapping')
  createMapping(@Body() dto: { device_name: string; id_site: number }) {
    return this.prtgService.createMapping(dto);
  }

  @Delete('mapping/:id')
  removeMapping(@Param('id', ParseIntPipe) id: number) { return this.prtgService.removeMapping(id); }

  // ─── AUDIT SENSOR ────────────────────────────────────────────────

  @Get('devices')
  getDeviceOverview() { return this.prtgService.getDeviceOverview(); }

  // ─── PING & ETHER PER SITE ────────────────────────────────────────

  @Get('site/:id/sensors')
  getSiteSensors(@Param('id', ParseIntPipe) id: number) {
    return this.prtgService.getSiteSensors(id);
  }

  @Get('sensor/:id/channels')
  getSensorChannels(@Param('id', ParseIntPipe) id: number) {
    return this.prtgService.getSensorChannels(id);
  }

  @Get('sensor/:id/history')
  getSensorHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('hours') hours?: string,
  ) {
    return this.prtgService.getSensorHistory(id, hours ? Number(hours) : 24);
  }

  @Get('sensor/:id/graph.png')
  async getSensorGraph(
    @Param('id', ParseIntPipe) id: number,
    @Query('graphid') graphid?: string,
    @Res() res?: Response,
  ) {
    const { buffer, contentType } = await this.prtgService.getSensorGraph(id, graphid ? Number(graphid) : 0);
    res!.setHeader('Content-Type', contentType);
    res!.setHeader('Cache-Control', 'public, max-age=60');
    res!.send(buffer);
  }
}
