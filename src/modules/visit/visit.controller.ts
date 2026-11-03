import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BuatVisitDto, JadwalDto, KirimWaDto, StatusVisitDto, UbahVisitDto, WaHarianDto } from './dto';
import { VisitService } from './visit.service';

interface Pengguna { id_karyawan: number; roles: string[] }

// Akses: modul operations (lihat ModulAksesGuard)
@Controller('visit')
export class VisitController {
  constructor(private readonly svc: VisitService) {}

  @Get('papan') papan(@Query('mulai') mulai?: string) { return this.svc.papan(mulai); }
  @Get('site') cariSite(@Query('q') q: string) { return this.svc.cariSite(q); }
  @Get('wa-harian') pratinjauHarian(@Query('tgl') tgl: string) { return this.svc.pratinjauHarian(tgl); }
  @Post('wa-harian') kirimHarian(@CurrentUser() u: Pengguna, @Body() dto: WaHarianDto) { return this.svc.kirimHarian(u, dto); }

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
