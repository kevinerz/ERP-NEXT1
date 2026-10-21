import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MobileService } from './mobile.service';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';

@Controller('mobile/auth')
export class MobileAuthController {
  constructor(private readonly mobileService: MobileService) {}

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    return this.mobileService.login(body.username, body.password);
  }

  @Public()
  @UseGuards(AuthGuard('mobile-jwt'))
  @Post('fcm-token')
  async updateFcmToken(@Req() req: any, @Body() body: { fcm_token: string }) {
    return this.mobileService.updateFcmToken(req.user.id_user, body.fcm_token);
  }

  @Public()
  @UseGuards(AuthGuard('mobile-jwt'))
  @Get('me')
  async me(@Req() req: any) {
    return req.user;
  }
}
