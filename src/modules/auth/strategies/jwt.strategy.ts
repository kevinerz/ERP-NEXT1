import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: number;      // id_user
  username: string;
  id_karyawan: number;
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.coreUser.findUnique({
      where: { id_user: payload.sub },
      include: {
        karyawan: true,
        user_roles: { include: { role: true } },
      },
    });

    if (!user || !user.is_aktif) {
      throw new UnauthorizedException('Akun tidak aktif atau tidak ditemukan');
    }

    return {
      id_user: user.id_user,
      username: user.username,
      id_karyawan: user.id_karyawan,
      nama_lengkap: user.karyawan.nama_lengkap,
      departemen: user.karyawan.departemen,
      roles: user.user_roles.map((ur) => ur.role.nama_role),
    };
  }
}
