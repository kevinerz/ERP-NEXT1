import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Req, ParseIntPipe,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import {
  CreateInvoiceDto, UpdateInvoiceDto, CreatePembayaranDto, GenerateBulkDto,
} from './dto/invoice.dto';

@Controller('finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  @Get('summary') getSummary() { return this.svc.getSummary(); }
  @Get('aging')   getAging()   { return this.svc.getAging(); }

  @Get('invoice') findAll(@Query() q: any) { return this.svc.findAll(q); }
  @Get('invoice/:id') findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post('invoice') create(@Body() dto: CreateInvoiceDto) { return this.svc.create(dto); }
  @Post('invoice/generate-bulk') generateBulk(@Body() dto: GenerateBulkDto) { return this.svc.generateBulk(dto); }

  @Patch('invoice/:id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInvoiceDto) {
    return this.svc.update(id, dto);
  }
  @Post('invoice/:id/kirim') kirim(@Param('id', ParseIntPipe) id: number) { return this.svc.kirim(id); }
  @Post('invoice/:id/batal') batal(@Param('id', ParseIntPipe) id: number) { return this.svc.batal(id); }
  @Delete('invoice/:id') remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }

  @Post('invoice/:id/pembayaran')
  addPembayaran(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePembayaranDto,
    @Req() req: any,
  ) {
    return this.svc.addPembayaran(id, dto, req.user?.id_user);
  }

  @Delete('pembayaran/:id')
  removePembayaran(@Param('id', ParseIntPipe) id: number) { return this.svc.removePembayaran(id); }
}
