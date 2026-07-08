import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenBlacklistService } from '../../modules/auth/token-blacklist.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private tokenBlacklist: TokenBlacklistService,
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

    // Check token blacklist
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace('Bearer ', '') || '';
    if (token && this.tokenBlacklist.isBlacklisted(token)) {
      throw new UnauthorizedException('Token sudah logout');
    }

    return super.canActivate(context);
  }
}
