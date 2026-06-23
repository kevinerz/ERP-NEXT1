import { Controller, Get, Post, Patch, Body, Param, Query, Req, ParseIntPipe } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CreateAsetDto, UpdateAsetDto, CreateMutasiDto } from './dto/aset.dto';

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

  @Post('mutasi')
  createMutasi(@Body() dto: CreateMutasiDto, @Req() req: any) {
    return this.svc.createMutasi(dto, req.user?.userId);
  }
}
