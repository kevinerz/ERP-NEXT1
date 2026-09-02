import { Controller, Get, Patch, Param, Query, Body, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MobileService } from './mobile.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@UseGuards(AuthGuard('mobile-jwt'))
@Controller('mobile/tickets')
export class MobileTicketsController {
  constructor(private readonly mobileService: MobileService) {}

  @Get()
  async getMyTickets(@Req() req: any, @Query('status') status?: string) {
    return this.mobileService.getMyTickets(req.user.id_karyawan, status);
  }

  @Get(':id')
  async getTicketDetail(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.mobileService.getTicketDetail(req.user.id_karyawan, id);
  }

  @Patch(':id/accept')
  async acceptTicket(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.mobileService.acceptTicket(req.user.id_karyawan, id);
  }

  @Patch(':id/resolve')
  async resolveTicket(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { catatan: string },
  ) {
    return this.mobileService.resolveTicket(req.user.id_karyawan, id, body.catatan);
  }
}
