import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AlihkanDto, DaftarChatQuery, KirimPesanDto, ReaksiDto, TemplateDto } from './dto';
import { WaGatewayClient } from './wa-gateway.client';
import { WaRealtimeService } from './wa-realtime.service';
import { WaService } from './wa.service';

// Inbox WhatsApp helpdesk — modul akses "whatsapp" (segment /api/wa)
@Controller('wa')
export class WaController {
  constructor(private wa: WaService, private gw: WaGatewayClient, private rt: WaRealtimeService) {}

  // ── Koneksi nomor ──
  @Get('akun')
  akun() { return this.wa.daftarAkun(); }

  @Get('akun/:kode/koneksi')
  koneksi(@Param('kode') kode: string) { return this.wa.koneksi(kode); }

  // Minta QR / sambungkan ulang
  @Post('akun/:kode/mulai')
  mulai(@Param('kode') kode: string) { return this.gw.mulai(kode); }

  // Lepas perangkat dari WhatsApp — butuh scan QR ulang
  @Roles('Admin', 'Director', 'Manager_Ops')
  @Post('akun/:kode/logout')
  logout(@Param('kode') kode: string) { return this.gw.logout(kode); }

  // ── Inbox ──
  @Get('chat')
  daftarChat(@CurrentUser('id_karyawan') id_karyawan: number, @Query() q: DaftarChatQuery) {
    return this.wa.daftarChat(id_karyawan, q);
  }

  @Get('chat/:id')
  detailChat(@Param('id', ParseIntPipe) id: number) { return this.wa.detailChat(id); }

  @Get('chat/:id/pesan')
  pesan(@Param('id', ParseIntPipe) id: number, @Query('sebelum') sebelum?: string) {
    return this.wa.daftarPesan(id, sebelum ? Number(sebelum) : undefined);
  }

  // Batas 16 MB (nginx 20 MB; video WhatsApp maks 16 MB)
  @Post('chat/:id/kirim')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }))
  kirim(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id_karyawan') id_karyawan: number,
    @Body() dto: KirimPesanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.wa.kirim(id, id_karyawan, dto, file);
  }

  @Post('chat/:id/baca')
  baca(@Param('id', ParseIntPipe) id: number) { return this.wa.tandaiDibaca(id); }

  @Post('chat/:id/ambil')
  ambil(@Param('id', ParseIntPipe) id: number, @CurrentUser('id_karyawan') id_karyawan: number) {
    return this.wa.alihkan(id, id_karyawan);
  }

  @Post('chat/:id/alihkan')
  alihkan(@Param('id', ParseIntPipe) id: number, @Body() dto: AlihkanDto) {
    return this.wa.alihkan(id, dto.id_karyawan ?? null);
  }

  @Post('chat/:id/selesai')
  selesai(@Param('id', ParseIntPipe) id: number) { return this.wa.ubahStatus(id, 'Selesai'); }

  @Post('chat/:id/buka')
  buka(@Param('id', ParseIntPipe) id: number) { return this.wa.ubahStatus(id, 'Terbuka'); }

  @Post('pesan/:id/reaksi')
  reaksi(@Param('id', ParseIntPipe) id: number, @Body() dto: ReaksiDto) { return this.wa.reaksi(id, dto.emoji); }

  // Media chat bersifat privat — hanya lewat API ber-login (bukan folder /uploads publik)
  @Get('media/:id')
  async media(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const f = await this.wa.fileMedia(id);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.nama)}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(f.path);
  }

  @Get('staf')
  staf() { return this.wa.daftarStaf(); }

  // ── Template balasan cepat ──
  @Get('template')
  template() { return this.wa.daftarTemplate(); }

  @Post('template')
  buatTemplate(@Body() dto: TemplateDto) { return this.wa.buatTemplate(dto); }

  @Patch('template/:id')
  ubahTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: TemplateDto) { return this.wa.ubahTemplate(id, dto); }

  @Delete('template/:id')
  hapusTemplate(@Param('id', ParseIntPipe) id: number) { return this.wa.hapusTemplate(id); }

  // ── Real-time (SSE) ──
  @Post('stream-tiket')
  tiket(@CurrentUser('id_karyawan') id_karyawan: number) { return { tiket: this.rt.buatTiket(id_karyawan) }; }

  @Public()
  @Get('stream')
  stream(@Query('tiket') tiket: string, @Res() res: Response) {
    if (!tiket || !this.rt.pakaiTiket(tiket)) {
      res.status(401).json({ message: 'Tiket stream tidak valid' });
      return;
    }
    this.rt.sambung(res);
  }
}
