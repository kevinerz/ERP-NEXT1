import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VendorJwtStrategy extends PassportStrategy(Strategy, 'vendor-jwt') {
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

  async validate(payload: any) {
    if (payload.type !== 'vendor_teknisi') {
      throw new UnauthorizedException('Token bukan untuk vendor');
    }

    const vendor = await this.prisma.masterKontakTeknisi.findUnique({
      where: { id_kontak: payload.sub },
    });

    if (!vendor) throw new UnauthorizedException('Akun vendor tidak ditemukan');

    return {
      id_kontak: vendor.id_kontak,
      username: vendor.username,
      nama: vendor.nama,
    };
  }
}
