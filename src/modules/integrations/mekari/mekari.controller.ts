import { Controller, Get, Post, Param, Query, ParseIntPipe } from '@nestjs/common';
import { MekariService } from './mekari.service';

@Controller('mekari')
export class MekariController {
  constructor(private readonly mekariService: MekariService) {}

  @Get('status')
  getStatus() { return this.mekariService.getStatus(); }

  @Get('jurnal-ar')
  getJurnalArLog(@Query() q: any) { return this.mekariService.getJurnalArLog(q); }

  @Post('sync/customer/:id')
  syncCustomer(@Param('id', ParseIntPipe) id: number) { return this.mekariService.syncCustomer(id); }

  @Post('sync/product/:id')
  syncProduct(@Param('id', ParseIntPipe) id: number) { return this.mekariService.syncProduct(id); }

  @Post('sync/invoice/:id')
  syncInvoice(@Param('id', ParseIntPipe) id: number) { return this.mekariService.syncInvoice(id); }
}
