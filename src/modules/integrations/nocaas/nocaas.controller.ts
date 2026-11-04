import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { NocaasService } from './nocaas.service';

class PetakanDto {
  @IsOptional() @IsInt() @Min(1) id_site?: number | null;
  @IsOptional() @IsBoolean() abaikan?: boolean;
}

class KonfigurasiDto {
  @IsOptional() @IsBoolean() tiket_aktif?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(240) durasi_konfirmasi_menit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) cooldown_menit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) maks_tiket_per_putaran?: number;
}

// Akses: modul operations (lihat ModulAksesGuard) — hanya membaca NOCaaS, tidak ada aksi ke router.
// Tiket gangguan otomatis dibuat dari status NOCaaS (lihat NocaasService.prosesTiket).
@Controller('nocaas')
export class NocaasController {
  constructor(private readonly svc: NocaasService) {}

  @Get('ringkasan') ringkasan() { return this.svc.ringkasan(); }
  @Post('sinkron') sinkron() { return this.svc.sinkron(); }
  @Get('status-site') statusSite(@Query('ids') ids = '') { return this.svc.statusSite(ids.split(',').map(Number)); }
  @Get('konfigurasi') async konfigurasi() { return { data: await this.svc.konfigurasi() }; }
  @Put('konfigurasi') @Roles('Admin', 'Director', 'Manager_Ops') ubahKonfigurasi(@Body() dto: KonfigurasiDto) { return this.svc.ubahKonfigurasi(dto); }
  @Get('tiket/:id') tiket(@Param('id', ParseIntPipe) id: number) { return this.svc.pembandingTiket(id); }
  @Get('site/:id') site(@Param('id', ParseIntPipe) id: number) { return this.svc.routerSite(id); }
  @Get('tinjau') tinjau(@Query() q: { cari?: string; page?: number; jenis?: string }) { return this.svc.tinjau(q); }
  @Get('router/:key/kejadian') kejadian(@Param('key') key: string, @Query('jam') jam?: string) { return this.svc.kejadian(key, Number(jam) || 72); }
  @Put('router/:key/site') petakan(@Param('key') key: string, @Body() dto: PetakanDto) { return this.svc.petakan(key, dto.id_site ?? null, !!dto.abaikan); }
}
