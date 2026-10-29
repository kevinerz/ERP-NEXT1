import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../../common/decorators/public.decorator';
import { PrtgRekonService } from './prtg-rekon.service';
import { RekonTokenGuard } from './rekon-token.guard';
import { DismantleDto, SimpanRekonDto, TerapkanNamaDto, ToggleDoneDto } from './rekon.dto';

// Halaman SEMENTARA tanpa login — rekonsiliasi nama PRTG ↔ site ERP.
// Mati total kecuali env PRTG_REKON_ENABLED=true dan PRTG_REKON_TOKEN terisi (selain itu 404);
// setiap request wajib membawa header X-Rekon-Token.
@UseGuards(RekonTokenGuard)
@Controller('prtg-rekon')
export class PrtgRekonController {
  constructor(private readonly rekon: PrtgRekonService) {}

  // GET /api/prtg-rekon[?refresh=1] — refresh=1 melewati cache (ambil ulang dari PRTG)
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Get()
  list(@Query('refresh') refresh?: string) {
    return this.rekon.list(refresh === '1');
  }

  // GET /api/prtg-rekon/semua-site — seluruh site ERP (tampilan per-site)
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Get('semua-site')
  semuaSite() {
    return this.rekon.semuaSite();
  }

  // GET /api/prtg-rekon/sites?q=
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @Get('sites')
  sites(@Query('q') q: string) {
    return this.rekon.cariSite(q);
  }

  // PATCH /api/prtg-rekon/:objid — simpan draft
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @Patch(':objid')
  simpan(@Param('objid', ParseIntPipe) objid: number, @Body() dto: SimpanRekonDto) {
    return this.rekon.simpan(objid, dto);
  }

  // PATCH /api/prtg-rekon/:objid/done
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @Patch(':objid/done')
  done(@Param('objid', ParseIntPipe) objid: number, @Body() dto: ToggleDoneDto) {
    return this.rekon.toggleDone(objid, dto.done, dto.device_name);
  }

  // POST /api/prtg-rekon/:objid/apply — rename PRTG + update ERP
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post(':objid/apply')
  apply(@Param('objid', ParseIntPipe) objid: number, @Body() dto: SimpanRekonDto) {
    return this.rekon.apply(objid, dto);
  }

  // POST /api/prtg-rekon/:objid/terapkan — rename device PRTG (nama lurus) + pasangkan ke site; nama_site beda → site ERP & device lain ikut berubah
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post(':objid/terapkan')
  terapkan(@Param('objid', ParseIntPipe) objid: number, @Body() dto: TerapkanNamaDto) {
    return this.rekon.terapkanNama(objid, dto.id_site, dto.nama, dto.nama_site);
  }

  // POST /api/prtg-rekon/site/:id_site/dismantle — status site Dismantle + device PRTG di-pause & diberi awalan nama
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post('site/:id_site/dismantle')
  dismantle(@Param('id_site', ParseIntPipe) id_site: number, @Body() dto: DismantleDto) {
    return this.rekon.dismantle(id_site, dto.tanggal, dto.catatan);
  }

  // POST /api/prtg-rekon/site/:id_site/batal-dismantle — kembalikan site Aktif + device PRTG dilanjutkan & awalan dibuang
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post('site/:id_site/batal-dismantle')
  batalDismantle(@Param('id_site', ParseIntPipe) id_site: number) {
    return this.rekon.batalDismantle(id_site);
  }
}
