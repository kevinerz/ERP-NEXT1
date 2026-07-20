import { Controller, Get, Post, Patch, Body, Param, Query, Req, ParseIntPipe } from '@nestjs/common';
import { DigiflazzService } from './digiflazz.service';
import { ConnectDigiflazzDto, BeliDigiflazzDto } from './dto/digiflazz.dto';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('digiflazz')
export class DigiflazzController {
  constructor(private readonly svc: DigiflazzService) {}

  @Roles('Admin', 'Director')
  @Get('config')
  getConfig() { return this.svc.getConfig(); }

  @Roles('Admin', 'Director')
  @Patch('config')
  updateConfig(@Body() dto: ConnectDigiflazzDto) { return this.svc.updateConfig(dto); }

  @Get('saldo')
  getSaldo() { return this.svc.getSaldo(); }

  @Get('price-list')
  getPriceList(@Query('category') category?: string) { return this.svc.getPriceList(category); }

  // Mengeluarkan saldo/kredit riil — dibatasi role yang sama dengan approval pengajuan aset
  @Roles('Admin', 'Director', 'Manager_Ops')
  @Post('beli')
  beli(@Body() dto: BeliDigiflazzDto, @Req() req: any) { return this.svc.beli(dto, req.user?.id_user); }

  @Post('topup/:id/check-status')
  checkStatus(@Param('id', ParseIntPipe) id: number) { return this.svc.checkStatus(id); }
}
