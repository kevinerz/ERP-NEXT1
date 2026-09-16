import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Roles('Admin', 'Director', 'NOC', 'Manager', 'Teknisi')
@Controller('tools')
export class ToolsController {
  constructor(private readonly svc: ToolsService) {}

  @Get('ping')
  ping(@Query('host') host: string, @Query('count') count = '5') {
    if (!host) throw new BadRequestException('host wajib diisi');
    const c = Math.min(Math.max(parseInt(count) || 5, 1), 20);
    return this.svc.runPing(host, c);
  }

  @Get('traceroute')
  traceroute(@Query('host') host: string, @Query('maxhops') maxhops = '30') {
    if (!host) throw new BadRequestException('host wajib diisi');
    const h = Math.min(Math.max(parseInt(maxhops) || 30, 5), 64);
    return this.svc.runTraceroute(host, h);
  }

  @Get('mtr')
  mtr(@Query('host') host: string) {
    if (!host) throw new BadRequestException('host wajib diisi');
    return this.svc.runMtr(host);
  }

  @Get('dns')
  dns(@Query('host') host: string, @Query('type') type = 'A') {
    if (!host) throw new BadRequestException('host wajib diisi');
    return this.svc.runDns(host, type);
  }

  @Get('port')
  portCheck(@Query('host') host: string, @Query('port') port: string) {
    if (!host || !port) throw new BadRequestException('host dan port wajib diisi');
    const p = parseInt(port);
    if (isNaN(p) || p < 1 || p > 65535) throw new BadRequestException('port tidak valid');
    return this.svc.checkPort(host, p);
  }
}
