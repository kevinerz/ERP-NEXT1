import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKaryawanDto } from './dto/create-karyawan.dto';
import { UpdateKaryawanDto } from './dto/update-karyawan.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';

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

    // foto_url (base64) tidak diikutkan di daftar — cukup ada_foto boolean, bikin payload list membengkak kalau ikut semua
    const dataRingkas = data.map(({ foto_url, ...k }) => ({ ...k, ada_foto: !!foto_url }));

    return {
      data: dataRingkas,
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

    if (dto.no_ktp) {
      const ktpConflict = await this.prisma.hrisKaryawan.findUnique({
        where: { no_ktp: dto.no_ktp },
      });
      if (ktpConflict) throw new ConflictException(`No. KTP ${dto.no_ktp} sudah digunakan`);
    }

    return this.prisma.hrisKaryawan.create({
      data: {
        ...dto,
        tgl_bergabung: dto.tgl_bergabung ? new Date(dto.tgl_bergabung) : undefined,
        tgl_lahir: dto.tgl_lahir ? new Date(dto.tgl_lahir) : undefined,
      },
    });
  }

  async updateKaryawan(id: number, dto: UpdateKaryawanDto) {
    await this.findOneKaryawan(id);

    if (dto.nip) {
      const conflict = await this.prisma.hrisKaryawan.findFirst({
        where: { nip: dto.nip, NOT: { id_karyawan: id } },
      });
      if (conflict) throw new ConflictException(`NIP ${dto.nip} sudah digunakan`);
    }

    if (dto.no_ktp) {
      const ktpConflict = await this.prisma.hrisKaryawan.findFirst({
        where: { no_ktp: dto.no_ktp, NOT: { id_karyawan: id } },
      });
      if (ktpConflict) throw new ConflictException(`No. KTP ${dto.no_ktp} sudah digunakan`);
    }

    return this.prisma.hrisKaryawan.update({
      where: { id_karyawan: id },
      data: {
        ...dto,
        tgl_bergabung: dto.tgl_bergabung ? new Date(dto.tgl_bergabung) : undefined,
        tgl_lahir: dto.tgl_lahir ? new Date(dto.tgl_lahir) : undefined,
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
      'Pre Sales',
      'CRM',
      'Helpdesk',
      'NOC',
      'Teknisi',
      'Finance',
      'AR',
      'AP',
    ];
  }

  // ─── UNDANGAN SIGN-IN MANDIRI (karyawan baru isi data sendiri) ──

  async createInvitation(createdBy: number, dto: CreateInvitationDto) {
    const token = randomBytes(24).toString('hex');
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari

    return this.prisma.hrisInvitation.create({
      data: {
        token,
        departemen: dto.departemen,
        jabatan: dto.jabatan,
        expires_at,
        created_by: createdBy,
      },
    });
  }

  async listInvitations() {
    return this.prisma.hrisInvitation.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        admin: { select: { username: true } },
        karyawan: { select: { nama_lengkap: true } },
      },
    });
  }

  async revokeInvitation(id: number) {
    const inv = await this.prisma.hrisInvitation.findUnique({ where: { id_invitation: id } });
    if (!inv) throw new NotFoundException('Undangan tidak ditemukan');
    if (inv.status !== 'Pending') throw new BadRequestException('Hanya undangan berstatus Pending yang bisa dibatalkan');

    return this.prisma.hrisInvitation.update({
      where: { id_invitation: id },
      data: { status: 'Revoked' },
    });
  }

  // ─── HAPUS KARYAWAN (dengan guard pemakaian) ─────────────────

  async deleteKaryawan(id: number) {
    const row = await this.prisma.hrisKaryawan.findUnique({
      where: { id_karyawan: id },
      include: {
        user: { select: { id_user: true } },
        _count: {
          select: {
            tickets_teknisi: true, wo_teknisi: true, projects_pm: true,
            leads_pic: true, opportunities: true, quotations: true,
            activities: true, surveys: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Karyawan tidak ditemukan');
    const c = (row as any)._count;

    const inUse: string[] = [];
    if (c.tickets_teknisi > 0) inUse.push(`${c.tickets_teknisi} tiket`);
    if (c.wo_teknisi > 0) inUse.push(`${c.wo_teknisi} work order`);
    if (c.projects_pm > 0) inUse.push(`${c.projects_pm} project`);
    if (c.leads_pic > 0) inUse.push(`${c.leads_pic} lead`);
    if (c.opportunities > 0) inUse.push(`${c.opportunities} opportunity`);
    if (c.quotations > 0) inUse.push(`${c.quotations} quotation`);
    if (c.activities > 0) inUse.push(`${c.activities} aktivitas sales`);
    if (c.surveys > 0) inUse.push(`${c.surveys} survey presales`);
    if (inUse.length)
      throw new BadRequestException(
        `Karyawan '${row.nama_lengkap}' tidak bisa dihapus karena masih dipakai di: ${inUse.join(', ')}. ` +
        'Nonaktifkan saja (toggle status) agar riwayat tetap utuh.',
      );

    // Aman dihapus: buang akun user (+roles) dulu bila ada, lalu karyawan
    await this.prisma.$transaction(async (tx) => {
      const u = (row as any).user;
      if (u) {
        await tx.coreUserRole.deleteMany({ where: { id_user: u.id_user } });
        await tx.coreUser.delete({ where: { id_user: u.id_user } });
      }
      await tx.hrisKaryawan.delete({ where: { id_karyawan: id } });
    });
    return { message: `Karyawan '${row.nama_lengkap}' dihapus` };
  }
}
