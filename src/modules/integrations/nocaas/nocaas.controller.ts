import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { IsInt, IsOptional, Min } from 'class-validator';
import { NocaasService } from './nocaas.service';

class PetakanDto {
  @IsOptional() @IsInt() @Min(1) id_site?: number | null;
}

// Akses: modul operations (lihat ModulAksesGuard) — hanya membaca NOCaaS, tidak ada aksi ke router
@Controller('nocaas')
export class NocaasController {
  constructor(private readonly svc: NocaasService) {}

  @Get('ringkasan') ringkasan() { return this.svc.ringkasan(); }
  @Post('sinkron') sinkron() { return this.svc.sinkron(); }
  @Get('status-site') statusSite(@Query('ids') ids = '') { return this.svc.statusSite(ids.split(',').map(Number)); }
  @Get('pantau') pantau() { return this.svc.laporanPantau(); }
  @Get('tiket/:id') tiket(@Param('id', ParseIntPipe) id: number) { return this.svc.pembandingTiket(id); }
  @Get('site/:id') site(@Param('id', ParseIntPipe) id: number) { return this.svc.routerSite(id); }
  @Get('belum-terpeta') belum(@Query() q: { cari?: string; page?: number }) { return this.svc.belumTerpeta(q); }
  @Get('router/:key/kejadian') kejadian(@Param('key') key: string, @Query('jam') jam?: string) { return this.svc.kejadian(key, Number(jam) || 72); }
  @Put('router/:key/site') petakan(@Param('key') key: string, @Body() dto: PetakanDto) { return this.svc.petakan(key, dto.id_site ?? null); }
}
