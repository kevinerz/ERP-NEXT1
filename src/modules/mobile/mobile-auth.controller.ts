import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MobileService } from './mobile.service';

@Controller('mobile/auth')
export class MobileAuthController {
  constructor(private readonly mobileService: MobileService) {}

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    return this.mobileService.login(body.username, body.password);
  }

  @UseGuards(AuthGuard('mobile-jwt'))
  @Post('fcm-token')
  async updateFcmToken(@Req() req: any, @Body() body: { fcm_token: string }) {
    return this.mobileService.updateFcmToken(req.user.id_user, body.fcm_token);
  }

  @UseGuards(AuthGuard('mobile-jwt'))
  @Get('me')
  async me(@Req() req: any) {
    return req.user;
  }
}
