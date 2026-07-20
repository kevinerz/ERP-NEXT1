import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateAdminUserDto, ResetPasswordDto } from './dto/admin.dto';

@UseGuards(RolesGuard)
@Roles('Admin', 'Director')
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('users')
  findAll() { return this.svc.findAllUsers(); }

  @Post('users')
  createUser(@Body() dto: CreateAdminUserDto) { return this.svc.createUser(dto); }

  @Patch('users/:id/modul-akses')
  updateModul(@Param('id', ParseIntPipe) id: number, @Body() body: { modul_akses: string[] }) {
    return this.svc.updateModulAkses(id, body.modul_akses);
  }

  @Patch('users/:id/toggle-aktif')
  toggleAktif(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.toggleAktif(id, user.id_user);
  }

  @Patch('users/:id/reset-password')
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    return this.svc.resetPassword(id, dto.password);
  }

  // ─── Activity Log ─────────────────────────────────────────────

  @Get('logs')
  getLogs(@Query() query: any) { return this.svc.getLogs(query); }
}
