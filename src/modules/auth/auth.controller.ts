import { Controller, Post, Get, Patch, Delete, Body, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';

@SkipThrottle()  // default: skip global throttle untuk controller ini
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/auth/login — max 5 percobaan/menit per IP
  @SkipThrottle({ default: false })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
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
  logout(@CurrentUser() user: any, @Req() req: any, @Body('refresh_token') refresh_token?: string) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    return this.authService.logout(user, token, ip, refresh_token);
  }

  // GET /api/auth/me
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user.id_user);
  }

  // PATCH /api/auth/me — update no_hp & email
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateMeDto) {
    return this.authService.updateMe(user.id_user, dto);
  }

  // POST /api/auth/change-password
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: any,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id_user, dto);
  }

  // POST /api/auth/me/foto — upload foto profil sendiri
  @UseGuards(JwtAuthGuard)
  @Post('me/foto')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadFoto(@CurrentUser() user: any, @UploadedFile() file: { buffer: Buffer; mimetype: string }) {
    return this.authService.uploadFoto(user.id_user, file.buffer, file.mimetype);
  }

  // DELETE /api/auth/me/foto — hapus foto profil sendiri
  @UseGuards(JwtAuthGuard)
  @Delete('me/foto')
  removeFoto(@CurrentUser() user: any) {
    return this.authService.removeFoto(user.id_user);
  }
}
