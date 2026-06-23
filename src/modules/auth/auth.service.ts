import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.coreUser.findUnique({
      where: { username: dto.username },
      include: {
        karyawan: true,
        user_roles: { include: { role: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Username atau password salah');
    if (!user.is_aktif) throw new UnauthorizedException('Akun tidak aktif');

    const passwordMatch = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatch) throw new UnauthorizedException('Username atau password salah');

    await this.prisma.coreUser.update({
      where: { id_user: user.id_user },
      data: { last_login: new Date() },
    });

    const roles = user.user_roles.map((ur) => ur.role.nama_role);
    const modul_akses: string[] = user.modul_akses
      ? JSON.parse(user.modul_akses)
      : [];

    const payload: JwtPayload = {
      sub: user.id_user,
      username: user.username,
      id_karyawan: user.id_karyawan,
      roles,
    };

    return {
      access_token: await this.generateAccessToken(payload),
      refresh_token: await this.generateRefreshToken(payload),
      user: {
        id_user: user.id_user,
        username: user.username,
        nama_lengkap: user.karyawan.nama_lengkap,
        jabatan: user.karyawan.jabatan,
        departemen: user.karyawan.departemen,
        roles,
        modul_akses,
      },
    };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = this.jwt.verify<JwtPayload>(dto.refresh_token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.coreUser.findUnique({
        where: { id_user: payload.sub },
        include: { user_roles: { include: { role: true } } },
      });

      if (!user || !user.is_aktif) throw new UnauthorizedException('Akun tidak aktif');

      const roles = user.user_roles.map((ur) => ur.role.nama_role);
      const newPayload: JwtPayload = {
        sub: user.id_user,
        username: user.username,
        id_karyawan: user.id_karyawan,
        roles,
      };

      return { access_token: await this.generateAccessToken(newPayload) };
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid atau expired');
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  private async generateAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '8h',
    });
  }

  private async generateRefreshToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    });
  }
}
