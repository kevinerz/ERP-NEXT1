import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, ParseIntPipe } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CreateAsetDto, UpdateAsetDto, CreateMutasiDto, CreateSimTopupDto } from './dto/aset.dto';

@Controller('assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Get('summary')
  getSummary() { return this.svc.getSummary(); }

  @Get('kategori')
  getKategori() { return this.svc.getKategoriList(); }

  @Get()
  findAll(@Query() q: any) { return this.svc.findAll(q); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  create(@Body() dto: CreateAsetDto, @Req() req: any) {
    return this.svc.create(dto, req.user?.userId);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAsetDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }

  @Post('mutasi')
  createMutasi(@Body() dto: CreateMutasiDto, @Req() req: any) {
    return this.svc.createMutasi(dto, req.user?.userId);
  }

  // ─── SIM TOPUP ────────────────────────────────────────────────

  @Get('sim-cards')
  getSimCards(@Query() q: any) { return this.svc.getSimCards(q); }

  @Get('sim-topup')
  findAllTopup(@Query() q: any) { return this.svc.findAllTopup(q); }

  @Post('sim-topup')
  createTopup(@Body() dto: CreateSimTopupDto, @Req() req: any) {
    return this.svc.createTopup(dto, req.user?.id_user);
  }
}
