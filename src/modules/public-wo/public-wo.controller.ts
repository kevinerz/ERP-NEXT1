import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, ParseIntPipe } from '@nestjs/common';
import { PublicWoService } from './public-wo.service';
import { CreateWoDto, UpdateWoDto, CreateBeritaAcaraDto } from './dto/wo.dto';

@Controller('public-wo')
export class PublicWoController {
  constructor(private readonly publicWoService: PublicWoService) {}

  @Get('status-summary')
  getStatusSummary() { return this.publicWoService.getStatusSummary(); }

  @Get('teknisi')
  getTeknisiList() { return this.publicWoService.getTeknisiList(); }

  @Get('sites')
  getSiteDropdown() { return this.publicWoService.getSiteDropdown(); }

  @Get()
  findAll(@Query() query: any) { return this.publicWoService.findAll(query); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.publicWoService.findOne(id); }

  @Post()
  create(@Body() dto: CreateWoDto) { return this.publicWoService.create(dto); }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWoDto,
  ) { return this.publicWoService.update(id, dto); }

  @Post(':id/berita-acara')
  createBeritaAcara(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBeritaAcaraDto,
    @Req() req: any,
  ) { return this.publicWoService.createBeritaAcara(id, dto, req.user?.id_user); }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.publicWoService.remove(id); }
}
