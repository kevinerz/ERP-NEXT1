import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface MobileJwtPayload {
  sub: number;        // id_user
  id_karyawan: number;
  username: string;
  type: 'mobile';
}

@Injectable()
export class MobileJwtStrategy extends PassportStrategy(Strategy, 'mobile-jwt') {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: MobileJwtPayload) {
    if (payload.type !== 'mobile') throw new UnauthorizedException('Token bukan untuk mobile');

    const user = await this.prisma.coreUser.findUnique({
      where: { id_user: payload.sub },
      include: { karyawan: true },
    });

    if (!user || !user.is_aktif) {
      throw new UnauthorizedException('Akun tidak aktif atau tidak ditemukan');
    }

    return {
      id_user:      user.id_user,
      id_karyawan:  user.id_karyawan,
      username:     user.username,
      nama_lengkap: user.karyawan.nama_lengkap,
      jabatan:      user.karyawan.jabatan,
    };
  }
}
