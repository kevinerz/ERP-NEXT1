import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { NocaasService } from './nocaas.service';
import { NocaasLaporanService } from './nocaas-laporan.service';
import { NocaasSiteService } from './nocaas-site.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

class PetakanDto {
  @IsOptional() @IsInt() @Min(1) id_site?: number | null;
  @IsOptional() @IsBoolean() abaikan?: boolean;
}

class KonfigurasiDto {
  @IsOptional() @IsBoolean() tiket_aktif?: boolean;
  @IsOptional() @IsBoolean() wa_pic_aktif?: boolean;
  @IsOptional() @IsObject() kategori?: Record<string, any>;
  @IsOptional() @IsInt() @Min(1) @Max(240) durasi_konfirmasi_menit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) cooldown_menit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) maks_tiket_per_putaran?: number;
}

// Akses: modul operations (lihat ModulAksesGuard) — hanya membaca NOCaaS, tidak ada aksi ke router.
// Tiket gangguan otomatis dibuat dari status NOCaaS (lihat NocaasService.prosesTiket).
@Controller('nocaas')
export class NocaasController {
  constructor(private readonly svc: NocaasService, private readonly lap: NocaasLaporanService, private readonly siteSvc: NocaasSiteService) {}

  // ── Data NOCaaS di halaman site & sinkron ke perangkat site ──
  @Get('site/:id/panel') panelSite(@Param('id', ParseIntPipe) id: number) { return this.siteSvc.panel(id); }
  @Get('site/:id/sinkron') pratinjauSinkron(@Param('id', ParseIntPipe) id: number) { return this.siteSvc.pratinjau(id); }
  @Post('site/:id/sinkron') terapkanSinkron(@Param('id', ParseIntPipe) id: number, @Body('timpa') timpa: boolean, @CurrentUser() u: any) {
    return this.siteSvc.terapkan(id, timpa === true, u);
  }
  @Get('sinkron-perangkat') pratinjauMassal(@CurrentUser() u: any) { return this.siteSvc.massal('pratinjau', u); }
  @Post('sinkron-perangkat') @Roles('Admin', 'Director', 'Manager_Ops') terapkanMassal(@CurrentUser() u: any) { return this.siteSvc.massal('terapkan', u); }

  // Laporan gangguan gabungan PRTG + NOCaaS + sumber lain
  @Get('laporan') laporan(@Query() q: { dari?: string; sampai?: string }) { return this.lap.laporan(q); }

  @Get('ringkasan') ringkasan() { return this.svc.ringkasan(); }
  @Post('sinkron') sinkron() { return this.svc.sinkron(); }
  @Post('kontak-wa/cocokkan') cocokkanKontak() { return this.svc.cocokkanKontakWa(); }
  @Get('status-site') statusSite(@Query('ids') ids = '') { return this.svc.statusSite(ids.split(',').map(Number)); }
  @Get('konfigurasi') async konfigurasi() { return { data: await this.svc.konfigurasiLengkap() }; }
  @Put('konfigurasi') @Roles('Admin', 'Director', 'Manager_Ops') ubahKonfigurasi(@Body() dto: KonfigurasiDto) { return this.svc.ubahKonfigurasi(dto); }
  @Get('tiket/:id') tiket(@Param('id', ParseIntPipe) id: number) { return this.svc.pembandingTiket(id); }
  @Get('site/:id') site(@Param('id', ParseIntPipe) id: number) { return this.svc.routerSite(id); }
  @Get('tinjau') tinjau(@Query() q: { cari?: string; page?: number; jenis?: string }) { return this.svc.tinjau(q); }
  @Get('router/:key/ping') ping(@Param('key') key: string) { return this.svc.pingRouter(key).then((data) => ({ data })); }
  @Get('router/:key/kejadian') kejadian(@Param('key') key: string, @Query('jam') jam?: string) { return this.svc.kejadian(key, Number(jam) || 72); }
  @Put('router/:key/site') petakan(@Param('key') key: string, @Body() dto: PetakanDto) { return this.svc.petakan(key, dto.id_site ?? null, !!dto.abaikan); }
}
