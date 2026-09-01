import {
  Controller, Post, Get, Patch, Delete, Body, Param, Query,
  UseGuards, Req, ParseIntPipe, HttpCode, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { PortalService } from './portal.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { Public } from '../../common/decorators/public.decorator';

// Guard untuk customer (portal JWT)
const CustomerGuard = () => UseGuards(AuthGuard('customer-jwt'));

// Guard untuk internal admin (gunakan JwtAuthGuard + RolesGuard biasa)
const AdminGuard = () => UseGuards(JwtAuthGuard, RolesGuard);

@Controller('portal')
export class PortalController {
  constructor(private service: PortalService) {}

  // ── Public: login portal ─────────────────────────────────
  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: { email: string; password: string }) {
    const data = await this.service.login(body.email, body.password);
    return { success: true, data, message: 'Login berhasil' };
  }

  // ── Portal endpoints (customer JWT) ─────────────────────
  @Get('me')
  @UseGuards(AuthGuard('customer-jwt'))
  getMe(@Req() req: any) {
    return { success: true, data: req.user };
  }

  @Get('sites')
  @UseGuards(AuthGuard('customer-jwt'))
  async getSites(@Req() req: any) {
    const data = await this.service.getSites(req.user.id_pelanggan);
    return { success: true, data };
  }

  @Get('tickets')
  @UseGuards(AuthGuard('customer-jwt'))
  async getTickets(@Req() req: any, @Query() query: any) {
    const data = await this.service.getTickets(req.user.id_pelanggan, query);
    return { success: true, ...data };
  }

  @Get('tickets/:id')
  @UseGuards(AuthGuard('customer-jwt'))
  async getTicketDetail(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.service.getTicketDetail(req.user.id_pelanggan, id);
    return { success: true, data };
  }

  // ── Sensor Ping & Traffic (customer) ─────────────────────

  @Get('sites/:siteId/sensors')
  @UseGuards(AuthGuard('customer-jwt'))
  async getSiteSensors(@Req() req: any, @Param('siteId', ParseIntPipe) siteId: number) {
    const data = await this.service.getSiteSensorsForPortal(req.user.id_pelanggan, siteId);
    return { success: true, ...data };
  }

  @Get('sites/:siteId/sensor/:objid/history')
  @UseGuards(AuthGuard('customer-jwt'))
  async getSensorHistory(
    @Req() req: any,
    @Param('siteId', ParseIntPipe) siteId: number,
    @Param('objid', ParseIntPipe) objid: number,
    @Query('hours') hours?: string,
  ) {
    const data = await this.service.getSensorHistoryForPortal(req.user.id_pelanggan, siteId, objid, hours ? Number(hours) : 24);
    return { success: true, ...data };
  }

  @Get('sites/:siteId/sensor/:objid/graph.png')
  @UseGuards(AuthGuard('customer-jwt'))
  async getSensorGraph(
    @Req() req: any,
    @Param('siteId', ParseIntPipe) siteId: number,
    @Param('objid', ParseIntPipe) objid: number,
    @Query('graphid') graphid?: string,
    @Query('hours') hours?: string,
    @Res() res?: Response,
  ) {
    const { buffer, contentType } = await this.service.getSensorGraphForPortal(
      req.user.id_pelanggan, siteId, objid,
      graphid ? Number(graphid) : 0,
    );
    res!.setHeader('Content-Type', contentType);
    res!.setHeader('Cache-Control', 'public, max-age=60');
    res!.send(buffer);
  }

  // ── Admin endpoints (internal staff) ────────────────────
  @Get('admin/users')
  @AdminGuard()
  @Roles('Admin', 'Manager_Ops', 'Director')
  async listUsers(@Query('id_pelanggan') id_pelanggan?: string) {
    const data = await this.service.listUsers(id_pelanggan ? Number(id_pelanggan) : undefined);
    return { success: true, data };
  }

  @Post('admin/users')
  @AdminGuard()
  @Roles('Admin', 'Manager_Ops', 'Director')
  async createUser(@Body() body: { id_pelanggan: number; email: string; password: string; nama?: string }) {
    const data = await this.service.createUser(body);
    return { success: true, data, message: 'Akun portal dibuat' };
  }

  @Patch('admin/users/:id/toggle')
  @AdminGuard()
  @Roles('Admin', 'Manager_Ops', 'Director')
  async toggleUser(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.toggleUser(id);
    return { success: true, data };
  }

  @Patch('admin/users/:id/reset-password')
  @AdminGuard()
  @Roles('Admin', 'Manager_Ops', 'Director')
  async resetPassword(@Param('id', ParseIntPipe) id: number, @Body() body: { password: string }) {
    const data = await this.service.resetUserPassword(id, body.password);
    return { success: true, data };
  }
}
