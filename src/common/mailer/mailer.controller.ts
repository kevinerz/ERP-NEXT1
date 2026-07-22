import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';

/**
 * Dashboard pantau email keluar — hanya Admin/Director.
 * GET /api/mailer/logs        — daftar riwayat kirim (paginasi + filter)
 * GET /api/mailer/logs/stats  — ringkasan angka untuk kartu statistik
 */
@UseGuards(RolesGuard)
@Roles('Admin', 'Director')
@Controller('mailer')
export class MailerController {
  constructor(private readonly mailer: MailerService) {}

  @Get('logs')
  getLogs(@Query() query: any) {
    return this.mailer.listLogs(query);
  }

  @Get('logs/stats')
  getStats() {
    return this.mailer.stats();
  }
}
