import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BacaDto, BisuDto, DiskusiDto, KanalDto, ReaksiDto, GrupDto, KirimDto, PribadiDto, TambahAnggotaDto, UbahGrupDto, UbahPesanDto } from './dto';
import { ChatService } from './chat.service';

// Chat internal karyawan — semua staf (segment /api/chat, lihat ModulAksesGuard).
// Polling ringan tiap beberapa detik dari seluruh kantor (satu IP publik) → tidak ikut batas 100 req/menit.
@SkipThrottle()
@Controller('chat')
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get('ringkasan')
  ringkasan(@CurrentUser('id_karyawan') me: number) { return this.chat.ringkasan(me); }

  @Get('ruang')
  daftar(@CurrentUser('id_karyawan') me: number) { return this.chat.daftarRuang(me); }

  @Get('karyawan')
  karyawan(@CurrentUser('id_karyawan') me: number, @Query('q') q: string) { return this.chat.cariKaryawan(q, me); }

  @Get('cari')
  cari(@CurrentUser('id_karyawan') me: number, @Query('q') q: string) { return this.chat.cariPesan(q, me); }

  @Post('ruang/pribadi')
  pribadi(@CurrentUser('id_karyawan') me: number, @Body() d: PribadiDto) { return this.chat.buatPribadi(me, d.id_karyawan); }

  @Post('ruang/grup')
  grup(@CurrentUser('id_karyawan') me: number, @Body() d: GrupDto) { return this.chat.buatGrup(me, d); }

  @Post('diskusi')
  diskusi(@CurrentUser('id_karyawan') me: number, @Body() d: DiskusiDto) { return this.chat.bukaDiskusi(me, d.jenis, d.id); }

  @Get('kanal')
  kanal(@CurrentUser('id_karyawan') me: number) { return this.chat.daftarKanal(me); }

  @Post('kanal')
  buatKanal(@CurrentUser('id_karyawan') me: number, @Body() d: KanalDto) { return this.chat.buatKanal(me, d.nama); }

  @Post('kanal/:id/gabung')
  gabungKanal(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number) { return this.chat.gabungKanal(id, me); }

  @Post('kanal/:id/keluar')
  keluarKanal(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number) { return this.chat.keluarKanal(id, me); }

  @Post('pesan/:id/reaksi')
  reaksi(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Body() d: ReaksiDto) { return this.chat.reaksi(id, me, d.emoji); }

  @Get('ruang/:id')
  detail(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number) { return this.chat.detailRuang(id, me); }

  @Patch('ruang/:id')
  ubahNama(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Body() d: UbahGrupDto) { return this.chat.ubahNama(id, me, d.nama); }

  @Post('ruang/:id/anggota')
  tambah(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Body() d: TambahAnggotaDto) { return this.chat.tambahAnggota(id, me, d.anggota); }

  @Delete('ruang/:id/anggota/:idk')
  keluarkan(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Param('idk', ParseIntPipe) idk: number) { return this.chat.keluarkan(id, me, idk); }

  @Post('ruang/:id/bisu')
  bisu(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Body() d: BisuDto) { return this.chat.setBisu(id, me, d.bisu); }

  @Post('ruang/:id/baca')
  baca(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Body() d: BacaDto) { return this.chat.baca(id, me, d.id_pesan); }

  @Post('ruang/:id/mengetik')
  mengetik(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number) { return this.chat.mengetik(id, me); }

  @Get('ruang/:id/pesan')
  pesan(
    @CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number,
    @Query('sebelum') sebelum?: string, @Query('setelah') setelah?: string, @Query('limit') limit?: string,
  ) {
    return this.chat.pesan(id, me, { sebelum: sebelum ? Number(sebelum) : undefined, setelah: setelah ? Number(setelah) : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Post('ruang/:id/pesan')
  kirim(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Body() d: KirimDto) { return this.chat.kirim(id, me, d); }

  @Post('ruang/:id/berkas')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  kirimBerkas(
    @CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Body('isi') isi?: string, @Body('id_balas') id_balas?: string,
  ) {
    return this.chat.kirim(id, me, { isi, id_balas: id_balas ? Number(id_balas) : undefined }, file);
  }

  @Patch('pesan/:id')
  ubahPesan(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Body() d: UbahPesanDto) { return this.chat.ubahPesan(id, me, d.isi); }

  @Delete('pesan/:id')
  hapusPesan(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number) { return this.chat.hapusPesan(id, me); }

  // Berkas privat: hanya anggota ruang. Gambar tampil langsung; jenis lain selalu diunduh (bukan dijalankan browser).
  @Get('berkas/:id')
  async berkas(@CurrentUser('id_karyawan') me: number, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const b = await this.chat.berkas(id, me);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', b.tipe);
    res.setHeader('Content-Disposition', `${b.gambar ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(b.nama)}`);
    res.sendFile(b.path, (err) => { if (err && !res.headersSent) res.status(404).json({ success: false, statusCode: 404, message: 'Berkas tidak ditemukan' }); });
  }
}
