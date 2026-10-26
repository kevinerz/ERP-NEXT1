import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

// Pengaman halaman rekon yang tanpa login: header X-Rekon-Token harus sama dengan env PRTG_REKON_TOKEN.
// Env mati / token belum diisi → 404 (tertutup rapat), token salah → 401.
@Injectable()
export class RekonTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const token = process.env.PRTG_REKON_TOKEN;
    if (process.env.PRTG_REKON_ENABLED !== 'true' || !token) throw new NotFoundException();

    const req = ctx.switchToHttp().getRequest();
    const kirim = String(req.headers['x-rekon-token'] ?? '');
    const a = Buffer.from(kirim);
    const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Token rekon salah');
    return true;
  }
}
