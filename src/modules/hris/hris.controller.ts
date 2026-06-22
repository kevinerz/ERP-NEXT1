import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { HrisService } from './hris.service';
import { CreateKaryawanDto } from './dto/create-karyawan.dto';
import { UpdateKaryawanDto } from './dto/update-karyawan.dto';
import { CreateUserDto } from './dto/create-user.dto';

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

  // ─── USER ACCOUNT ─────────────────────────────────────────────

  // POST /api/hris/karyawan/:id/user
  @Post('karyawan/:id/user')
  createUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateUserDto,
  ) {
    return this.hrisService.createUserAccount(id, dto);
  }

  // PATCH /api/hris/karyawan/:id/user/roles
  @Patch('karyawan/:id/user/roles')
  updateRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body('role_ids') role_ids: number[],
  ) {
    return this.hrisService.updateUserRoles(id, role_ids);
  }

  // PATCH /api/hris/karyawan/:id/user/toggle-status
  @Patch('karyawan/:id/user/toggle-status')
  toggleUserStatus(@Param('id', ParseIntPipe) id: number) {
    return this.hrisService.toggleUserStatus(id);
  }

  // PATCH /api/hris/karyawan/:id/user/reset-password
  @Patch('karyawan/:id/user/reset-password')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body('new_password') new_password: string,
  ) {
    return this.hrisService.resetPassword(id, new_password);
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
}
