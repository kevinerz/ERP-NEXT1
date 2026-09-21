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
  traceroute(
    @Query('host') host: string,
    @Query('maxhops') maxhops = '20',
    @Query('protocol') protocol = 'udp',
    @Query('nodns') noDns = 'false',
    @Query('port') port = '80',
  ) {
    if (!host) throw new BadRequestException('host wajib diisi');
    const h = Math.min(Math.max(parseInt(maxhops) || 20, 5), 30);
    const safeProto = ['udp', 'tcp', 'icmp'].includes(protocol) ? protocol : 'udp';
    const p = Math.min(Math.max(parseInt(port) || 80, 1), 65535);
    return this.svc.runTraceroute(host, h, safeProto, noDns === 'true', p);
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
