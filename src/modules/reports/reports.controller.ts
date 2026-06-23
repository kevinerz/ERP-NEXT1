import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('dashboard')
  getDashboard() { return this.svc.getDashboardSummary(); }

  @Get('kpi')
  getKpi() { return this.svc.getDashboardKpi(); }

  @Get('revenue')
  getRevenue() { return this.svc.getRevenueChart(); }

  @Get('tickets')
  getTickets(@Query() q: any) { return this.svc.getTicketReport(q); }

  @Get('projects')
  getProjects() { return this.svc.getProyekReport(); }

  @Get('assets')
  getAssets() { return this.svc.getAsetReport(); }

  @Get('pelanggan')
  getPelanggan() { return this.svc.getPelangganReport(); }
}
