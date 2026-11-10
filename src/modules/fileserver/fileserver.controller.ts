import { Body, Controller, Get, Post, Put, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as os from 'os';
import { promises as fs } from 'fs';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FileServerService } from './fileserver.service';

// Akses: modul "fileserver" (ModulAksesGuard). Unggah ditampung sementara di disk lalu dikirim ke SMB.
@Controller('fileserver')
export class FileServerController {
  constructor(private readonly svc: FileServerService) {}

  @Get('status') status(@CurrentUser() u: any) { return this.svc.status(u); }
  @Put('konfigurasi') atur(@CurrentUser() u: any, @Body() b: any) { return this.svc.atur(u, b ?? {}); }
  @Get('shares') shares() { return this.svc.shares(); }
  @Get('ls') ls(@Query('share') share: string, @Query('path') path = '') { return this.svc.ls(share, path); }

  @Get('unduh')
  async unduh(@Query('share') share: string, @Query('path') path: string, @Res() res: Response) {
    const lokal = await this.svc.unduh(share, path);
    const nama = (path || 'berkas').split(/[\\/]/).pop()!;
    res.download(lokal, nama, () => { fs.rm(lokal, { force: true }).catch(() => undefined); });
  }

  @Post('unggah')
  @UseInterceptors(FilesInterceptor('files', 20, { storage: diskStorage({ destination: os.tmpdir() }), limits: { fileSize: 500 * 1024 * 1024 } }))
  unggah(@CurrentUser() u: any, @Body() b: { share: string; path?: string }, @UploadedFiles() files: any[]) {
    return this.svc.unggah(u, b.share, b.path ?? '', files);
  }

  @Post('folder') folder(@CurrentUser() u: any, @Body() b: { share: string; path?: string; nama: string }) { return this.svc.folder(u, b.share, b.path ?? '', b.nama); }
  @Post('ganti-nama') gantiNama(@CurrentUser() u: any, @Body() b: { share: string; path: string; baru: string }) { return this.svc.gantiNama(u, b.share, b.path, b.baru); }
  // Impor BA: pindai folder (rekursif) & cocokkan ke site → simpan tautan ke dokumen site
  @Post('impor-ba/pratinjau') pratinjauBa(@CurrentUser() u: any, @Body() b: { share: string; path?: string; foto?: boolean }) { return this.svc.pratinjauBa(u, b.share, b.path ?? '', b.foto === true); }
  @Post('impor-ba/terapkan') terapkanBa(@CurrentUser() u: any, @Body() b: { share: string; items: any[] }) { return this.svc.terapkanBa(u, b.share, b.items); }

  @Post('hapus') hapus(@CurrentUser() u: any, @Body() b: { share: string; path: string; folder?: boolean }) { return this.svc.hapus(u, b.share, b.path, b.folder === true); }
}
