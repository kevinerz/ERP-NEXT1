import { Controller, Post, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/auth/login
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    return this.authService.login(dto, ip);
  }

  // POST /api/auth/refresh
  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  // POST /api/auth/logout
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: any, @Req() req: any) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    return this.authService.logout(user, ip);
  }

  // GET /api/auth/me
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user.sub);
  }

  // PATCH /api/auth/me — update no_hp & email
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: { no_hp?: string; email?: string }) {
    return this.authService.updateMe(user.sub, dto);
  }

  // POST /api/auth/change-password
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: any,
    @Body() dto: { password_lama: string; password_baru: string; konfirmasi: string },
  ) {
    return this.authService.changePassword(user.sub, dto);
  }
}
