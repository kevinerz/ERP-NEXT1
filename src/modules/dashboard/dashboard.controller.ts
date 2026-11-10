import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService, UserDashboard } from './dashboard.service';
import { CariService } from './cari.service';

// Tidak digating modul: isi dashboard sudah dipilah per modul_akses di service
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService, private readonly cariSvc: CariService) {}

  @Get('saya')
  saya(@CurrentUser() user: UserDashboard) { return this.svc.saya(user); }

  // Pencarian global — tiap kelompok hanya dicari bila user punya akses modulnya
  @Get('cari')
  cari(@CurrentUser() user: UserDashboard, @Query('q') q = '') { return this.cariSvc.cari(user, q); }
}
