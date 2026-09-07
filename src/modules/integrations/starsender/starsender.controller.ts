import { Controller, Get, Patch, Post, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { StarsenderService } from './starsender.service';
import { JwtAuthGuard } from '../../../common/guards/jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('starsender')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Manager_Ops', 'Director')
export class StarsenderController {
  constructor(private svc: StarsenderService) {}

  @Get('config')
  getConfig() { return this.svc.getConfig(); }

  @Patch('config')
  updateConfig(@Body() body: { api_key?: string; is_active?: boolean }) {
    return this.svc.updateConfig(body);
  }

  @Post('test')
  test(@Body() body: { phone: string }) {
    return this.svc.testSend(body.phone);
  }

  @Post('test-group')
  testGroup(@Body() body: { group_id: string }) {
    return this.svc.testSendGroup(body.group_id);
  }

  // ── Internal Groups ──────────────────────────────────────────────

  @Get('internal-groups')
  getInternalGroups() { return this.svc.getInternalGroups(); }

  @Post('internal-groups')
  addInternalGroup(@Body() body: { group_id: string; nama_group: string }) {
    return this.svc.addInternalGroup(body);
  }

  @Patch('internal-groups/:id')
  updateInternalGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { group_id?: string; nama_group?: string; is_active?: boolean },
  ) {
    return this.svc.updateInternalGroup(id, body);
  }

  @Delete('internal-groups/:id')
  deleteInternalGroup(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteInternalGroup(id);
  }
}
