import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('users')
  findAll() { return this.svc.findAllUsers(); }

  @Post('users')
  createUser(@Body() dto: any) { return this.svc.createUser(dto); }

  @Patch('users/:id/modul-akses')
  updateModul(@Param('id', ParseIntPipe) id: number, @Body() body: { modul_akses: string[] }) {
    return this.svc.updateModulAkses(id, body.modul_akses);
  }

  @Patch('users/:id/toggle-aktif')
  toggleAktif(@Param('id', ParseIntPipe) id: number) { return this.svc.toggleAktif(id); }

  @Patch('users/:id/reset-password')
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() body: { password: string }) {
    return this.svc.resetPassword(id, body.password);
  }

  // ─── Activity Log ─────────────────────────────────────────────

  @Get('logs')
  getLogs(@Query() query: any) { return this.svc.getLogs(query); }
}
