import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CatatanDto, DokumenDto, LinkDto, OrderOpsDto, OrderSalesDto, PutusanDto, SphDto } from './dto';
import { PasangBaruService, Pengguna } from './pasang-baru.service';

// Akses modul: sales / operations / instalasi / finance (lihat ModulAksesGuard); hak ubah per tahap dicek di service
@Controller('pasang-baru')
export class PasangBaruController {
  constructor(private readonly svc: PasangBaruService) {}

  @Get('referensi') referensi() { return this.svc.referensi(); }
  @Get('pelanggan') cariPelanggan(@Query('q') q: string) { return this.svc.cariPelanggan(q); }
  @Get('ringkas') ringkas() { return this.svc.ringkas(); }

  // SPH
  @Get('sph') daftarSph(@Query() q: { status?: string; cari?: string }) { return this.svc.daftarSph(q); }
  @Get('sph/:id') detailSph(@Param('id', ParseIntPipe) id: number) { return this.svc.detailSph(id); }
  @Post('sph') buatSph(@CurrentUser() u: Pengguna, @Body() dto: SphDto) { return this.svc.buatSph(u, dto); }
  @Put('sph/:id') ubahSph(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: SphDto) {
    return this.svc.ubahSph(u, id, dto);
  }
  @Delete('sph/:id') hapusSph(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.hapusSph(u, id); }
  @Post('sph/:id/ajukan') ajukan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.ajukanSph(u, id); }
  @Post('sph/:id/putuskan') putuskan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: PutusanDto) {
    return this.svc.putuskanSph(u, id, dto);
  }

  // Order PB
  @Get('order') daftarOrder(@Query() q: { tahap?: string; cari?: string; id_sph?: string }) { return this.svc.daftarOrder(q); }
  @Get('order/:id') detailOrder(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.detailOrder(u, id); }
  @Patch('order/:id/sales') ubahSales(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: OrderSalesDto) {
    return this.svc.ubahSales(u, id, dto);
  }
  @Patch('order/:id/ops') ubahOps(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: OrderOpsDto) {
    return this.svc.ubahOps(u, id, dto);
  }
  @Post('order/:id/link') tambahLink(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: LinkDto) {
    return this.svc.tambahLink(u, id, dto);
  }
  @Patch('link/:id') ubahLink(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: LinkDto) {
    return this.svc.ubahLink(u, id, dto);
  }
  @Delete('link/:id') hapusLink(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.hapusLink(u, id); }

  @Post('order/:id/dokumen')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  unggah(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: DokumenDto, @UploadedFile() file: any) {
    return this.svc.unggahDokumen(u, id, dto, file);
  }
  @Delete('dokumen/:id') hapusDokumen(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number) { return this.svc.hapusDokumen(u, id); }

  @Post('order/:id/serahkan') serahkan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.serahkan(u, id, dto);
  }
  @Post('order/:id/kembalikan') kembalikan(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.kembalikan(u, id, dto);
  }
  @Post('order/:id/batal') batal(@CurrentUser() u: Pengguna, @Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto) {
    return this.svc.batal(u, id, dto);
  }
}
