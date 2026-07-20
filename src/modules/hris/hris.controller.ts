import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { HrisService } from './hris.service';
import { CreateKaryawanDto } from './dto/create-karyawan.dto';
import { UpdateKaryawanDto } from './dto/update-karyawan.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateRolesDto } from './dto/update-roles.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('hris')
export class HrisController {
  constructor(private readonly hrisService: HrisService) {}

  // ─── KARYAWAN ────────────────────────────────────────────────

  // GET /api/hris/karyawan?search=&departemen=&status_aktif=&page=&limit=
  @Get('karyawan')
  findAll(@Query() query: any) {
    return this.hrisService.findAllKaryawan(query);
  }

  // GET /api/hris/karyawan/:id
  @Get('karyawan/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.hrisService.findOneKaryawan(id);
  }

  // POST /api/hris/karyawan
  @Post('karyawan')
  create(@Body() dto: CreateKaryawanDto) {
    return this.hrisService.createKaryawan(dto);
  }

  // PATCH /api/hris/karyawan/:id
  @Patch('karyawan/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateKaryawanDto) {
    return this.hrisService.updateKaryawan(id, dto);
  }

  // PATCH /api/hris/karyawan/:id/toggle-status
  @Patch('karyawan/:id/toggle-status')
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.hrisService.toggleStatusKaryawan(id);
  }

  // DELETE /api/hris/karyawan/:id
  @Delete('karyawan/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.hrisService.deleteKaryawan(id);
  }

  // ─── USER ACCOUNT ─────────────────────────────────────────────
  // Endpoint di bawah ini bisa membuat akun, mengganti role (termasuk ke
  // Admin), dan mereset password siapa saja — wajib dibatasi Admin/Director,
  // tidak cukup hanya gating modul HRIS (modul_akses kosong = akses semua modul).

  // POST /api/hris/karyawan/:id/user
  @Post('karyawan/:id/user')
  @Roles('Admin', 'Director')
  createUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateUserDto,
  ) {
    return this.hrisService.createUserAccount(id, dto);
  }

  // PATCH /api/hris/karyawan/:id/user/roles
  @Patch('karyawan/:id/user/roles')
  @Roles('Admin', 'Director')
  updateRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRolesDto,
  ) {
    return this.hrisService.updateUserRoles(id, dto.role_ids);
  }

  // PATCH /api/hris/karyawan/:id/user/toggle-status
  @Patch('karyawan/:id/user/toggle-status')
  @Roles('Admin', 'Director')
  toggleUserStatus(@Param('id', ParseIntPipe) id: number) {
    return this.hrisService.toggleUserStatus(id);
  }

  // PATCH /api/hris/karyawan/:id/user/reset-password
  @Patch('karyawan/:id/user/reset-password')
  @Roles('Admin', 'Director')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.hrisService.resetPassword(id, dto.new_password);
  }

  // ─── REFERENSI ────────────────────────────────────────────────

  // GET /api/hris/roles
  @Get('roles')
  getRoles() {
    return this.hrisService.getRoles();
  }

  // GET /api/hris/departemen
  @Get('departemen')
  getDepartemen() {
    return this.hrisService.getDepartemenList();
  }

  // ─── UNDANGAN SIGN-IN MANDIRI ───────────────────────────────────

  // POST /api/hris/invitations
  @Post('invitations')
  createInvitation(@CurrentUser() user: any, @Body() dto: CreateInvitationDto) {
    return this.hrisService.createInvitation(user.id_user, dto);
  }

  // GET /api/hris/invitations
  @Get('invitations')
  listInvitations() {
    return this.hrisService.listInvitations();
  }

  // DELETE /api/hris/invitations/:id
  @Delete('invitations/:id')
  revokeInvitation(@Param('id', ParseIntPipe) id: number) {
    return this.hrisService.revokeInvitation(id);
  }
}
