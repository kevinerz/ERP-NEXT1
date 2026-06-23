import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { CreateKontrakDto, UpdateKontrakDto, TerminasiDto } from './dto/kontrak.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  @Get('summary')
  getSummary() { return this.svc.getSummary(); }

  @Get()
  findAll(@Query() q: any) { return this.svc.findAll(q); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  create(@Body() dto: CreateKontrakDto) { return this.svc.create(dto); }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateKontrakDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/terminasi')
  terminasi(@Param('id', ParseIntPipe) id: number, @Body() dto: TerminasiDto) {
    return this.svc.terminasi(id, dto);
  }
}
