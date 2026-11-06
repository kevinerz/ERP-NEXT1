import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JENIS_CATATAN, PRIORITAS, QcService, STATUS_CATATAN, STATUS_MODUL } from './qc.service';

class UbahModulDto {
  @IsOptional() @IsIn(STATUS_MODUL) status?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) skor?: number | null;
  @IsOptional() @IsString() @MaxLength(100) pic?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) deskripsi?: string | null;
}
class TambahModulDto {
  @IsString() @MaxLength(40) grup: string;
  @IsString() @MaxLength(100) nama: string;
  @IsOptional() @IsString() @MaxLength(120) path?: string;
  @IsOptional() @IsString() @MaxLength(5000) deskripsi?: string;
}
class CatatanDto {
  @IsIn(JENIS_CATATAN) jenis: string;
  @IsOptional() @IsIn(PRIORITAS) prioritas?: string;
  @IsString() @MaxLength(200) judul: string;
  @IsOptional() @IsString() @MaxLength(10000) isi?: string;
}
class UbahCatatanDto {
  @IsOptional() @IsIn(JENIS_CATATAN) jenis?: string;
  @IsOptional() @IsIn(PRIORITAS) prioritas?: string;
  @IsOptional() @IsIn(STATUS_CATATAN) status?: string;
  @IsOptional() @IsString() @MaxLength(200) judul?: string;
  @IsOptional() @IsString() @MaxLength(10000) isi?: string | null;
}

// QC / evaluasi ERP — terbuka untuk semua pengguna login (lihat UNGATED di ModulAksesGuard);
// status & skor modul hanya Admin / Director / Manager Ops (dicek di service)
@Controller('qc')
export class QcController {
  constructor(private readonly svc: QcService) {}

  @Get('modul') daftar() { return this.svc.daftar(); }
  @Post('modul') tambahModul(@Body() dto: TambahModulDto, @CurrentUser() u: any) { return this.svc.tambahModul(dto, u); }
  @Put('modul/:id') ubahModul(@Param('id', ParseIntPipe) id: number, @Body() dto: UbahModulDto, @CurrentUser() u: any) { return this.svc.ubahModul(id, dto, u); }
  @Post('modul/:id/catatan') tambahCatatan(@Param('id', ParseIntPipe) id: number, @Body() dto: CatatanDto, @CurrentUser() u: any) { return this.svc.tambahCatatan(id, dto, u); }
  @Put('catatan/:id') ubahCatatan(@Param('id', ParseIntPipe) id: number, @Body() dto: UbahCatatanDto, @CurrentUser() u: any) { return this.svc.ubahCatatan(id, dto, u); }
  @Delete('catatan/:id') hapusCatatan(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) { return this.svc.hapusCatatan(id, u); }
}
