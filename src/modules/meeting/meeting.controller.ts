import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BuatRapatDto, DuplikatDto, KelolaDto, LinkTamuDto, NotulenDto, PesertaDto, ResponDto, TindakDto, UbahRapatDto, UbahTindakDto } from './dto';
import { MeetingService } from './meeting.service';

// Rapat internal — semua staf (segment /api/meeting, lihat ModulAksesGuard)
@Controller('meeting')
export class MeetingController {
  constructor(private meeting: MeetingService) {}

  @Get()
  daftar(@CurrentUser() u: any) { return this.meeting.daftar(u?.id_karyawan, MeetingService.pemantau(u)); }

  @Get('karyawan')
  karyawan(@Query('q') q: string) { return this.meeting.cariKaryawan(q); }

  @Get('tindak/saya')
  tindakSaya(@CurrentUser('id_karyawan') id_karyawan: number) { return this.meeting.tindakSaya(id_karyawan); }

  @Post()
  buat(@CurrentUser('id_karyawan') id_karyawan: number, @Body() dto: BuatRapatDto) { return this.meeting.buat(id_karyawan, dto); }

  @Get(':id')
  detail(@CurrentUser() u: any, @Param('id', ParseIntPipe) id: number) { return this.meeting.detail(id, u?.id_karyawan, MeetingService.pemantau(u)); }

  @Patch(':id')
  ubah(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UbahRapatDto) {
    return this.meeting.ubah(id, id_karyawan, dto);
  }

  @Post(':id/duplikat')
  duplikat(@CurrentUser() u: any, @Param('id', ParseIntPipe) id: number, @Body() dto: DuplikatDto) {
    return this.meeting.duplikat(id, u?.id_karyawan, MeetingService.pemantau(u), dto);
  }

  @Post(':id/respon')
  respon(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: ResponDto) {
    return this.meeting.respon(id, id_karyawan, dto.respon);
  }

  @Put(':id/notulen')
  notulen(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: NotulenDto) {
    return this.meeting.simpanNotulen(id, id_karyawan, dto.notulen);
  }

  @Post(':id/tindak')
  tambahTindak(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: TindakDto) {
    return this.meeting.tambahTindak(id, id_karyawan, dto);
  }

  @Patch(':id/tindak/:tid')
  ubahTindak(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Param('tid', ParseIntPipe) tid: number, @Body() dto: UbahTindakDto) {
    return this.meeting.ubahTindak(id, id_karyawan, tid, dto);
  }

  @Delete(':id/tindak/:tid')
  hapusTindak(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Param('tid', ParseIntPipe) tid: number) {
    return this.meeting.hapusTindak(id, id_karyawan, tid);
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
  token(@CurrentUser() u: any, @Param('id', ParseIntPipe) id: number) { return this.meeting.token(id, u?.id_karyawan, MeetingService.pemantau(u)); }

  @Post(':id/kelola')
  kelola(@CurrentUser('id_karyawan') id_karyawan: number, @Param('id', ParseIntPipe) id: number, @Body() dto: KelolaDto) {
    return this.meeting.kelola(id, id_karyawan, dto);
  }
}
