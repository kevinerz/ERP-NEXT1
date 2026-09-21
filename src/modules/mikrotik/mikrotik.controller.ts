import { Controller, Get, Put, Post, Body, UseGuards } from '@nestjs/common';
import { MikrotikService } from './mikrotik.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('mikrotik')
export class MikrotikController {
  constructor(private readonly svc: MikrotikService) {}

  @Get('devices')
  getDevices() {
    return this.svc.getDevices();
  }

  @Get('config')
  getConfig() {
    return this.svc.getConfig();
  }

  @Put('config')
  saveConfig(@Body() body: { user: string; password?: string; port?: number }) {
    return this.svc.saveConfig(body.user, body.password ?? '', body.port ?? 22);
  }

  @Post('run')
  run(@Body() body: { ips: string[]; command: string }) {
    if (!body.ips?.length) return [];
    if (!body.command?.trim()) return [];
    return this.svc.runCommand(body.ips, body.command.trim());
  }
}
