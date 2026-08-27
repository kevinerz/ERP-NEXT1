import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
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
}
