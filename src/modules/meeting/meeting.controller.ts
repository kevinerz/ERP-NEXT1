import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BuatRapatDto, KelolaDto, LinkTamuDto, PesertaDto, UbahRapatDto } from './dto';
import { MeetingService } from './meeting.service';

// Rapat internal — semua staf (segment /api/meeting, lihat ModulAksesGuard)
@Controller('meeting')
export class MeetingController {
  constructor(private meeting: MeetingService) {}

  @Get()
  daftar(@CurrentUser('id_karyawan') id_karyawan: number) { return this.meeting.daftar(id_karyawan); }

  @Get('karyawan')
  karyawan(@Query('q') q: string) { return this.meeting.cariKaryawan(q); }

  @Post()
  buat(@CurrentUser('id_karyawan') id_karyawan: number, @Body() dto: BuatRapatDto) { return this.meeting.buat(id_karyawan, dto); }

  @Get(':id')
  detail(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number) { return this.meeting.detail(id, id_karyawan); }

  @Patch(':id')
  ubah(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UbahRapatDto) {
    return this.meeting.ubah(id, id_karyawan, dto);
  }

  @Post(':id/batal')
  batal(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number) { return this.meeting.batal(id, id_karyawan); }

  @Post(':id/peserta')
  tambahPeserta(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: PesertaDto) {
    return this.meeting.tambahPeserta(id, id_karyawan, dto.id_karyawan);
  }

  @Delete(':id/peserta/:idk')
  hapusPeserta(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Param('idk', ParseIntPipe) idk: number) {
    return this.meeting.hapusPeserta(id, id_karyawan, idk);
  }

  @Post(':id/peserta/:idk/moderator')
  jadikanModerator(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Param('idk', ParseIntPipe) idk: number) {
    return this.meeting.jadikanModerator(id, id_karyawan, idk);
  }

  // Link tamu (moderator): aktifkan / buat ulang / matikan
  @Post(':id/tamu')
  linkTamu(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: LinkTamuDto) {
    return this.meeting.aturLinkTamu(id, id_karyawan, dto);
  }

  // Token masuk room LiveKit (berlaku 6 jam)
  @Post(':id/token')
  token(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number) { return this.meeting.token(id, id_karyawan); }

  @Post(':id/kelola')
  kelola(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: KelolaDto) {
    return this.meeting.kelola(id, id_karyawan, dto);
  }
}
