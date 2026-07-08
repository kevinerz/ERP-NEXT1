import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKaryawanDto } from './dto/create-karyawan.dto';
import { UpdateKaryawanDto } from './dto/update-karyawan.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class HrisService {
  constructor(private prisma: PrismaService) {}

  // ─── KARYAWAN ───────────────────────────────────────────────

  async findAllKaryawan(query: {
    search?: string;
    departemen?: string;
    status_aktif?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { nama_lengkap: { contains: query.search } },
        { nip: { contains: query.search } },
        { jabatan: { contains: query.search } },
      ];
    }
    if (query.departemen) where.departemen = query.departemen;
    if (query.status_aktif !== undefined) {
      where.status_aktif = query.status_aktif === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.hrisKaryawan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nama_lengkap: 'asc' },
        include: {
          user: {
            select: {
              id_user: true,
              username: true,
              is_aktif: true,
              last_login: true,
              user_roles: { include: { role: true } },
            },
          },
        },
      }),
      this.prisma.hrisKaryawan.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  async findOneKaryawan(id: number) {
    const karyawan = await this.prisma.hrisKaryawan.findUnique({
      where: { id_karyawan: id },
      include: {
        user: {
          select: {
            id_user: true,
            username: true,
            is_aktif: true,
            last_login: true,
            user_roles: { include: { role: true } },
          },
        },
      },
    });
    if (!karyawan) throw new NotFoundException('Karyawan tidak ditemukan');
    return karyawan;
  }

  async createKaryawan(dto: CreateKaryawanDto) {
    const existing = await this.prisma.hrisKaryawan.findUnique({
      where: { nip: dto.nip },
    });
    if (existing) throw new ConflictException(`NIP ${dto.nip} sudah digunakan`);

    // Check username uniqueness jika provided
    if (dto.username) {
      const userExists = await this.prisma.coreUser.findUnique({
        where: { username: dto.username },
      });
      if (userExists) throw new ConflictException(`Username '${dto.username}' sudah digunakan`);
    }

    // Create karyawan + optionally create user dalam 1 transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const karyawan = await tx.hrisKaryawan.create({
        data: {
          nip: dto.nip,
          nama_lengkap: dto.nama_lengkap,
          jabatan: dto.jabatan,
          departemen: dto.departemen,
          no_hp: dto.no_hp,
          email: dto.email,
          tgl_bergabung: dto.tgl_bergabung ? new Date(dto.tgl_bergabung) : undefined,
          status_aktif: dto.status_aktif !== false, // default true
        },
      });

      // Auto-create user account jika username provided
      if (dto.username) {
        const passwordHash = await bcrypt.hash(
          dto.password || `Karyawan@${dto.nip}`,
          12,
        );
        await tx.coreUser.create({
          data: {
            id_karyawan: karyawan.id_karyawan,
            username: dto.username,
            password_hash: passwordHash,
            is_aktif: true,
          },
        });
      }

      return karyawan;
    });

    return {
      data: result,
      message: `Karyawan '${result.nama_lengkap}' berhasil dibuat${dto.username ? ' dengan akun user' : ''}`,
    };
  }

  async updateKaryawan(id: number, dto: UpdateKaryawanDto) {
    await this.findOneKaryawan(id);

    if (dto.nip) {
      const conflict = await this.prisma.hrisKaryawan.findFirst({
        where: { nip: dto.nip, NOT: { id_karyawan: id } },
      });
      if (conflict) throw new ConflictException(`NIP ${dto.nip} sudah digunakan`);
    }

    return this.prisma.hrisKaryawan.update({
      where: { id_karyawan: id },
      data: {
        ...dto,
        tgl_bergabung: dto.tgl_bergabung ? new Date(dto.tgl_bergabung) : undefined,
      },
    });
  }

  async toggleStatusKaryawan(id: number) {
    const karyawan = await this.findOneKaryawan(id);
    return this.prisma.hrisKaryawan.update({
      where: { id_karyawan: id },
      data: { status_aktif: !karyawan.status_aktif },
    });
  }

  // ─── USER ACCOUNT ────────────────────────────────────────────

  async createUserAccount(id_karyawan: number, dto: CreateUserDto) {
    const karyawan = await this.findOneKaryawan(id_karyawan);

    if (karyawan.user) {
      throw new ConflictException('Karyawan ini sudah memiliki akun user');
    }

    const existing = await this.prisma.coreUser.findUnique({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException(`Username '${dto.username}' sudah digunakan`);

    // Validasi role_ids
    const roles = await this.prisma.coreRole.findMany({
      where: { id_role: { in: dto.role_ids } },
    });
    if (roles.length !== dto.role_ids.length) {
      throw new BadRequestException('Satu atau lebih role tidak ditemukan');
    }

    const password_hash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.coreUser.create({
      data: {
        id_karyawan,
        username: dto.username,
        password_hash,
        is_aktif: true,
        user_roles: {
          create: dto.role_ids.map((id_role) => ({ id_role })),
        },
      },
      include: {
        user_roles: { include: { role: true } },
      },
    });

    return {
      id_user: user.id_user,
      username: user.username,
      is_aktif: user.is_aktif,
      roles: user.user_roles.map((ur) => ur.role.nama_role),
    };
  }

  async updateUserRoles(id_karyawan: number, role_ids: number[]) {
    const karyawan = await this.findOneKaryawan(id_karyawan);
    if (!karyawan.user) throw new NotFoundException('Karyawan belum memiliki akun user');

    const id_user = karyawan.user.id_user;

    // Replace semua roles dalam satu transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.coreUserRole.deleteMany({ where: { id_user } });
      await tx.coreUserRole.createMany({
        data: role_ids.map((id_role) => ({ id_user, id_role })),
      });
    });

    return this.prisma.coreUser.findUnique({
      where: { id_user },
      include: { user_roles: { include: { role: true } } },
    });
  }

  async toggleUserStatus(id_karyawan: number) {
    const karyawan = await this.findOneKaryawan(id_karyawan);
    if (!karyawan.user) throw new NotFoundException('Karyawan belum memiliki akun user');

    const user = karyawan.user;
    return this.prisma.coreUser.update({
      where: { id_user: user.id_user },
      data: { is_aktif: !user.is_aktif },
    });
  }

  async resetPassword(id_karyawan: number, new_password: string) {
    const karyawan = await this.findOneKaryawan(id_karyawan);
    if (!karyawan.user) throw new NotFoundException('Karyawan belum memiliki akun user');

    const password_hash = await bcrypt.hash(new_password, 12);
    return this.prisma.coreUser.update({
      where: { id_user: karyawan.user.id_user },
      data: { password_hash },
      select: { id_user: true, username: true },
    });
  }

  // ─── ROLES (untuk dropdown) ──────────────────────────────────

  async getRoles() {
    return this.prisma.coreRole.findMany({ orderBy: { nama_role: 'asc' } });
  }

  // ─── DEPARTEMEN LIST (untuk dropdown) ────────────────────────

  getDepartemenList() {
    return [
      'Management',
      'Sales',
      'Operasional',
      'Finance',
      'HRD',
      'IT_Internal',
    ];
  }

  // ─── DELETION WITH VALIDATION ───────────────────────────────

  /**
   * Delete employee dengan validation bahwa karyawan tidak digunakan di operations
   * Prevent data integrity issues dengan cascade deletions
   */
  async deleteKaryawan(id_karyawan: number) {
    const karyawan = await this.findOneKaryawan(id_karyawan);

    // Check jika employee dipakai di berbagai operasi
    const [kontrakCount, ticketCount, woCount, userExists] = await Promise.all([
      this.prisma.kontrakLayanan.count({
        where: { id_teknisi_pic: id_karyawan },
      }),
      this.prisma.operationTicket.count({
        where: { id_teknisi_pic: id_karyawan },
      }),
      this.prisma.operationWorkOrder.count({
        where: { id_teknisi: id_karyawan },
      }),
      this.prisma.coreUser.findUnique({
        where: { id_karyawan },
      }),
    ]);

    const inUse: string[] = [];
    if (kontrakCount > 0) inUse.push(`${kontrakCount} kontrak`);
    if (ticketCount > 0) inUse.push(`${ticketCount} tiket`);
    if (woCount > 0) inUse.push(`${woCount} work order`);

    if (inUse.length > 0) {
      throw new BadRequestException(
        `Karyawan '${karyawan.nama_lengkap}' tidak bisa dihapus karena masih digunakan di: ${inUse.join(', ')}. ` +
        `Reassign dulu sebelum menghapus.`,
      );
    }

    // Delete dalam transaction: hapus user dulu (jika ada), lalu karyawan
    await this.prisma.$transaction(async (tx) => {
      if (userExists) {
        // Delete user roles dulu
        await tx.coreUserRole.deleteMany({ where: { id_user: userExists.id_user } });
        // Delete user
        await tx.coreUser.delete({ where: { id_user: userExists.id_user } });
      }
      // Delete karyawan
      await tx.hrisKaryawan.delete({ where: { id_karyawan } });
    });

    return { message: `Karyawan '${karyawan.nama_lengkap}' berhasil dihapus` };
  }
}
