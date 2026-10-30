import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AlokasiDto, BlokDto, LepasDto, UbahAlokasiDto, ZonaDto } from './dto';
import { IpamService } from './ipam.service';

// IP publik NEXT1 — modul akses "operations" (segment /api/ipam)
@Controller('ipam')
export class IpamController {
  constructor(private ipam: IpamService) {}

  // ── Blok ──
  @Get('blok')
  daftarBlok() { return this.ipam.daftarBlok(); }

  @Roles('Admin', 'Director', 'Manager_Ops')
  @Post('blok')
  buatBlok(@Body() dto: BlokDto) { return this.ipam.buatBlok(dto); }

  @Roles('Admin', 'Director', 'Manager_Ops')
  @Patch('blok/:id')
  ubahBlok(@Param('id', ParseIntPipe) id: number, @Body() dto: BlokDto) { return this.ipam.ubahBlok(id, dto); }

  @Get('blok/:id')
  detailBlok(@Param('id', ParseIntPipe) id: number) { return this.ipam.detailBlok(id); }

  // Prefix kosong berikutnya, mis. ?panjang=29&peruntukan=Pelanggan
  @Get('blok/:id/saran')
  saran(@Param('id', ParseIntPipe) id: number, @Query('panjang') panjang: string, @Query('peruntukan') peruntukan?: string) {
    return this.ipam.saran(id, Number(panjang), peruntukan);
  }

  // Riwayat pemakaian satu IP, mis. ?ip=180.214.165.130
  @Get('blok/:id/riwayat-ip')
  riwayatIp(@Param('id', ParseIntPipe) id: number, @Query('ip') ip: string) { return this.ipam.riwayatIp(id, ip); }

  // ── Zona (rencana pembagian) ──
  @Post('blok/:id/zona')
  buatZona(@Param('id', ParseIntPipe) id: number, @Body() dto: ZonaDto) { return this.ipam.buatZona(id, dto); }

  @Patch('zona/:id')
  ubahZona(@Param('id', ParseIntPipe) id: number, @Body() dto: ZonaDto) { return this.ipam.ubahZona(id, dto); }

  @Delete('zona/:id')
  hapusZona(@Param('id', ParseIntPipe) id: number) { return this.ipam.hapusZona(id); }

  // ── Alokasi ──
  @Post('alokasi')
  buatAlokasi(@CurrentUser('id_karyawan') id_karyawan: number, @Body() dto: AlokasiDto) {
    return this.ipam.buatAlokasi(dto, { id_karyawan: id_karyawan ?? null });
  }

  @Patch('alokasi/:id')
  ubahAlokasi(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UbahAlokasiDto) {
    return this.ipam.ubahAlokasi(id, dto, { id_karyawan: id_karyawan ?? null });
  }

  @Post('alokasi/:id/lepas')
  lepas(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: LepasDto) {
    return this.ipam.lepas(id, dto, { id_karyawan: id_karyawan ?? null });
  }

  @Get('alokasi/:id/riwayat')
  riwayat(@Param('id', ParseIntPipe) id: number) { return this.ipam.riwayat(id); }

  @Get('site/cari')
  cariSite(@Query('q') q: string) { return this.ipam.cariSite(q); }

  @Get('site/:id')
  ipSite(@Param('id', ParseIntPipe) id: number) { return this.ipam.ipSite(id); }
}
