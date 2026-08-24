import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface CustomerJwtPayload {
  sub: number;       // id_user (CustomerUser)
  email: string;
  id_pelanggan: number;
  type: 'customer';
}

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
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

  async validate(payload: CustomerJwtPayload) {
    if (payload.type !== 'customer') throw new UnauthorizedException();

    const user = await this.prisma.customerUser.findUnique({
      where: { id_user: payload.sub },
      include: { pelanggan: { select: { id_pelanggan: true, nama_pelanggan: true, kode_pelanggan: true } } },
    });

    if (!user || !user.is_aktif) throw new UnauthorizedException('Akun portal tidak aktif');

    return {
      id_user:     user.id_user,
      email:       user.email,
      nama:        user.nama,
      id_pelanggan: user.id_pelanggan,
      pelanggan:   user.pelanggan,
    };
  }
}
