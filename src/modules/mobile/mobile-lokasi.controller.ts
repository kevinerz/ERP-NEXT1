import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MobileService } from './mobile.service';

@Controller('mobile/lokasi')
export class MobileLokasiController {
  constructor(private readonly mobileService: MobileService) {}

  @UseGuards(AuthGuard('mobile-jwt'))
  @Post()
  async updateLokasi(
    @Req() req: any,
    @Body() body: { latitude: number; longitude: number; akurasi?: number },
  ) {
    return this.mobileService.updateLokasi(
      req.user.id_karyawan,
      body.latitude,
      body.longitude,
      body.akurasi,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('all')
  async getAllTeknisiLokasi() {
    return this.mobileService.getAllTeknisiLokasi();
  }
}
