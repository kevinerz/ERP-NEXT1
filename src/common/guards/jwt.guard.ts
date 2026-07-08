import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenBlacklistService } from '../../modules/auth/token-blacklist.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    // Opsional: diisi saat guard didaftarkan di main.ts (app.get)
    private tokenBlacklist?: TokenBlacklistService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Cek apakah route di-mark @Public() — skip JWT jika iya
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Tolak token yang sudah logout (ada di blacklist)
    if (this.tokenBlacklist) {
      const req = context.switchToHttp().getRequest();
      const token = req.headers?.authorization?.replace('Bearer ', '') || '';
      if (token && this.tokenBlacklist.isBlacklisted(token)) {
        throw new UnauthorizedException('Sesi sudah logout, silakan masuk kembali');
      }
    }
    return super.canActivate(context);
  }
}
