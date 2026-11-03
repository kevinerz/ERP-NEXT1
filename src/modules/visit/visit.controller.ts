import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AturanPmDto, BuatVisitDto, JadwalDto, KirimWaDto, StatusVisitDto, UbahVisitDto, WaHarianDto } from './dto';
import { VisitPmService } from './visit-pm.service';
import { VisitStatistikService } from './visit-statistik.service';
import { VisitService } from './visit.service';

interface Pengguna { id_karyawan: number; roles: string[] }

// Akses: modul operations (lihat ModulAksesGuard)
@Controller('visit')
export class VisitController {
  constructor(private readonly svc: VisitService, private readonly pm: VisitPmService, private readonly stat: VisitStatistikService) {}

  @Get('papan') papan(@Query('mulai') mulai?: string) { return this.svc.papan(mulai); }
  @Get('site') cariSite(@Query('q') q: string) { return this.svc.cariSite(q); }
  @Get('wa-harian') pratinjauHarian(@Query('tgl') tgl: string) { return this.svc.pratinjauHarian(tgl); }
  @Post('wa-harian') kirimHarian(@CurrentUser() u: Pengguna, @Body() dto: WaHarianDto) { return this.svc.kirimHarian(u, dto); }

  // KPI & peta
  @Get('statistik') statistik(@Query() q: { dari?: string; sampai?: string }) { return this.stat.ringkasan(q); }
  @Get('peta') peta(@Query() q: { dari?: string; sampai?: string }) { return this.stat.peta(q); }

  // Maintenance rutin
  @Get('pm/aturan') daftarPm() { return this.pm.daftar(); }
  @Get('pm/pelanggan') pelangganPm() { return this.pm.pelanggan(); }
  @Post('pm/aturan') buatPm(@Body() dto: AturanPmDto) { return this.pm.simpan(null, dto); }
  @Put('pm/aturan/:id') ubahPm(@Param('id', ParseIntPipe) id: number, @Body() dto: AturanPmDto) { return this.pm.simpan(id, dto); }
  @Delete('pm/aturan/:id') hapusPm(@Param('id', ParseIntPipe) id: number) { return this.pm.hapus(id); }
  @Post('pm/jalankan') jalankanSemua() { return this.pm.jalankan(); }
  @Post('pm/aturan/:id/jalankan') jalankanPm(@Param('id', ParseIntPipe) id: number) { return this.pm.jalankan(id); }

  @Post() buat(@CurrentUser() u: Pengguna, @Body() dto: BuatVisitDto) { return this.svc.buat(u, dto); }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) { return this.svc.detail(id); }
  @Patch(':id') ubah(@Param('id', ParseIntPipe) id: number, @Body() dto: UbahVisitDto) { return this.svc.ubah(id, dto); }
  @Patch(':id/jadwal') jadwal(@Param('id', ParseIntPipe) id: number, @Body() dto: JadwalDto) { return this.svc.jadwal(id, dto); }
  @Post(':id/status') status(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: StatusVisitDto) {
    return this.svc.status(u, id, dto);
  }
  @Get(':id/wa') pratinjauWa(@Param('id', ParseIntPipe) id: number, @Query('ke') ke: string) { return this.svc.pratinjauWa(id, ke); }
  @Post(':id/wa') kirimWa(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: KirimWaDto) {
    return this.svc.kirimWa(u, id, dto);
  }
}
