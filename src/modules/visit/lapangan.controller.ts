import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CheckinDto, FotoLapanganDto, GagalLapanganDto, SelesaiLapanganDto } from './dto';
import { VisitService } from './visit.service';

// Halaman teknisi di lokasi — tanpa login, akses lewat token acak di link WA (/v/:token)
@Public()
@Throttle({ default: { ttl: 60000, limit: 60 } })
@Controller('lapangan')
export class LapanganController {
  constructor(private readonly svc: VisitService) {}

  @Get(':token') info(@Param('token') token: string) { return this.svc.lapanganInfo(token); }
  @Post(':token/checkin') checkin(@Param('token') token: string, @Body() dto: CheckinDto) { return this.svc.checkin(token, dto); }

  @Post(':token/foto')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  foto(@Param('token') token: string, @Body() dto: FotoLapanganDto, @UploadedFile() file: any) {
    return this.svc.fotoLapangan(token, dto.jenis, file);
  }
  @Delete(':token/foto/:id') hapusFoto(@Param('token') token: string, @Param('id', ParseIntPipe) id: number) {
    return this.svc.hapusFotoLapangan(token, id);
  }

  @Post(':token/selesai') selesai(@Param('token') token: string, @Body() dto: SelesaiLapanganDto) { return this.svc.selesaiLapangan(token, dto); }
  @Post(':token/gagal') gagal(@Param('token') token: string, @Body() dto: GagalLapanganDto) { return this.svc.gagalLapangan(token, dto); }
}
