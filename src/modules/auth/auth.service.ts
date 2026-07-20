import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LogService } from '../../common/log/log.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { TokenBlacklistService } from './token-blacklist.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private logService: LogService,
    private tokenBlacklist: TokenBlacklistService,
  ) {}

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { username: dto.username },
      include: {
        karyawan: true,
        user_roles: { include: { role: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Username atau password salah');
    if (!user.is_aktif) throw new UnauthorizedException('Akun tidak aktif');
    if (!user.karyawan) throw new UnauthorizedException('Akun tidak memiliki data karyawan');

    const passwordMatch = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatch) {
      // Log gagal login
      await this.logService.log({
        username: dto.username,
        aksi: 'LOGIN',
        modul: 'auth',
        entitas: 'User',
        deskripsi: `Login GAGAL — username: ${dto.username}`,
        ip_address: ip,
      });
      throw new UnauthorizedException('Username atau password salah');
    }

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

    // Log login berhasil
    await this.logService.log({
      id_user: user.id_user,
      username: user.username,
      nama: user.karyawan.nama_lengkap,
      aksi: 'LOGIN',
      modul: 'auth',
      entitas: 'User',
      deskripsi: `Login berhasil`,
      ip_address: ip,
    });

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

  async logout(user: { id_user: number; username: string; nama_lengkap?: string }, token?: string, ip?: string, refreshToken?: string) {
    // Blacklist access token sampai kedaluwarsa agar tidak bisa dipakai lagi setelah logout
    if (token) {
      try {
        const payload: any = this.jwt.verify(token, { secret: this.config.getOrThrow<string>('JWT_SECRET') });
        const sisaDetik = payload.exp ? Math.floor(payload.exp - Date.now() / 1000) : 0;
        if (sisaDetik > 0) this.tokenBlacklist.add(token, sisaDetik);
      } catch {
        // token tak valid/expired — tak perlu di-blacklist
      }
    }
    // Refresh token juga wajib dicabut — kalau tidak, refresh token yang
    // bocor/dicuri tetap bisa dipakai bikin access token baru sampai 7 hari
    // meski user sudah "logout".
    if (refreshToken) {
      try {
        const payload: any = this.jwt.verify(refreshToken, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') });
        const sisaDetik = payload.exp ? Math.floor(payload.exp - Date.now() / 1000) : 0;
        if (sisaDetik > 0) this.tokenBlacklist.add(refreshToken, sisaDetik);
      } catch {
        // refresh token tak valid/expired — tak perlu di-blacklist
      }
    }

    await this.logService.log({
      id_user: user.id_user,
      username: user.username,
      nama: user.nama_lengkap || '',
      aksi: 'LOGOUT',
      modul: 'auth',
      entitas: 'User',
      deskripsi: `Logout`,
      ip_address: ip,
    });
    return { message: 'Logout berhasil' };
  }

  async refresh(dto: RefreshTokenDto) {
    if (this.tokenBlacklist.isBlacklisted(dto.refresh_token)) {
      throw new UnauthorizedException('Refresh token sudah tidak berlaku, silakan masuk kembali');
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(dto.refresh_token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
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
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const name = (err as any)?.name;
      if (name === 'JsonWebTokenError' || name === 'TokenExpiredError' || name === 'NotBeforeError') {
        throw new UnauthorizedException('Refresh token tidak valid atau expired');
      }
      throw err;
    }
  }

  // ─── PROFILE ─────────────────────────────────────────────────

  async getMe(userId: number) {
    const user = await this.prisma.coreUser.findUnique({
      where: { id_user: userId },
      include: {
        karyawan: true,
        user_roles: { include: { role: true } },
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (!user.karyawan) throw new NotFoundException('Data karyawan tidak ditemukan');

    const roles = user.user_roles.map((ur) => ur.role.nama_role);
    let modul_akses: string[] = [];
    if (user.modul_akses) {
      try { modul_akses = JSON.parse(user.modul_akses); }
      catch { modul_akses = user.modul_akses.split(',').map(s => s.trim()).filter(Boolean); }
    }

    return {
      data: {
        id_user: user.id_user,
        username: user.username,
        nama_lengkap: user.karyawan.nama_lengkap,
        nip: user.karyawan.nip,
        jabatan: user.karyawan.jabatan,
        departemen: user.karyawan.departemen,
        no_hp: user.karyawan.no_hp,
        email: user.karyawan.email,
        tgl_bergabung: user.karyawan.tgl_bergabung,
        foto_url: user.karyawan.foto_url,
        last_login: user.last_login,
        roles,
        modul_akses,
      },
    };
  }

  async updateMe(userId: number, dto: { no_hp?: string; email?: string }) {
    const user = await this.prisma.coreUser.findUnique({
      where: { id_user: userId },
      select: { id_karyawan: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const karyawan = await this.prisma.hrisKaryawan.update({
      where: { id_karyawan: user.id_karyawan },
      data: {
        ...(dto.no_hp !== undefined && { no_hp: dto.no_hp }),
        ...(dto.email !== undefined && { email: dto.email }),
      },
    });

    return { data: { no_hp: karyawan.no_hp, email: karyawan.email }, message: 'Profil diperbarui' };
  }

  async uploadFoto(userId: number, buffer: Buffer, mimetype: string) {
    const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!ALLOWED.includes(mimetype))
      throw new BadRequestException('Format foto harus PNG, JPG, atau WebP');
    if (buffer.length > 2 * 1024 * 1024)
      throw new BadRequestException('Ukuran foto maksimal 2MB');

    const user = await this.prisma.coreUser.findUnique({
      where: { id_user: userId },
      select: { id_karyawan: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const url = `data:${mimetype};base64,${buffer.toString('base64')}`;
    await this.prisma.hrisKaryawan.update({
      where: { id_karyawan: user.id_karyawan },
      data: { foto_url: url },
    });

    return { data: { foto_url: url }, message: 'Foto profil diperbarui' };
  }

  async removeFoto(userId: number) {
    const user = await this.prisma.coreUser.findUnique({
      where: { id_user: userId },
      select: { id_karyawan: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    await this.prisma.hrisKaryawan.update({
      where: { id_karyawan: user.id_karyawan },
      data: { foto_url: null },
    });

    return { message: 'Foto profil dihapus' };
  }

  async changePassword(userId: number, dto: { password_lama: string; password_baru: string; konfirmasi: string }) {
    if (dto.password_baru !== dto.konfirmasi) {
      throw new BadRequestException('Konfirmasi password tidak cocok');
    }
    if (dto.password_baru.length < 8) {
      throw new BadRequestException('Password minimal 8 karakter');
    }

    const user = await this.prisma.coreUser.findUnique({ where: { id_user: userId } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const match = await bcrypt.compare(dto.password_lama, user.password_hash);
    if (!match) throw new BadRequestException('Password lama tidak tepat');

    const hash = await bcrypt.hash(dto.password_baru, 12);
    await this.prisma.coreUser.update({
      where: { id_user: userId },
      data: { password_hash: hash },
    });

    return { message: 'Password berhasil diubah' };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  private async generateAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') || '8h') as any,
    });
  }

  private async generateRefreshToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d') as any,
    });
  }
}
