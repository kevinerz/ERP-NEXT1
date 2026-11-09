import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService, UserDashboard } from './dashboard.service';

// Tidak digating modul: isi dashboard sudah dipilah per modul_akses di service
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('saya')
  saya(@CurrentUser() user: UserDashboard) { return this.svc.saya(user); }
}
