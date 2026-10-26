import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { PresalesService } from './presales.service';
import { CreatePresalesSurveyDto, UpdatePresalesSurveyDto } from './dto/presales.dto';

@Controller('presales')
export class PresalesController {
  constructor(private readonly presalesService: PresalesService) {}

  @Get() findAll(@Query() q: any) { return this.presalesService.findAll(q); }
  @Get('karyawan') getKaryawan() { return this.presalesService.getKaryawanList(); }
  @Get('layanan') getLayanan() { return this.presalesService.getLayananList(); }
  @Get('opportunity') getOpportunity() { return this.presalesService.getOpportunityList(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.presalesService.findOne(id); }
  @Post() create(@Body() dto: CreatePresalesSurveyDto) { return this.presalesService.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePresalesSurveyDto) {
    return this.presalesService.update(id, dto);
  }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.presalesService.remove(id); }
}
