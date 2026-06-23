import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

const ALL_MODULS = ['hris', 'master', 'sales', 'projects', 'operations', 'assets', 'contracts', 'reports'];

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async findAllUsers() {
    const users = await this.prisma.coreUser.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        karyawan: { select: { nama_lengkap: true, jabatan: true, departemen: true } },
        user_roles: { include: { role: { select: { nama_role: true } } } },
      },
    });
    return {
      data: users.map((u) => ({
        id_user: u.id_user,
        username: u.username,
        is_aktif: u.is_aktif,
        last_login: u.last_login,
        created_at: u.created_at,
        nama_lengkap: u.karyawan.nama_lengkap,
        jabatan: u.karyawan.jabatan,
        departemen: u.karyawan.departemen,
        roles: u.user_roles.map((ur) => ur.role.nama_role),
        modul_akses: u.modul_akses ? JSON.parse(u.modul_akses) : [],
      })),
      meta: { all_moduls: ALL_MODULS },
    };
  }

  async updateModulAkses(id: number, moduls: string[]) {
    const user = await this.prisma.coreUser.findUnique({ where: { id_user: id } });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    const valid = moduls.filter((m) => ALL_MODULS.includes(m));
    await this.prisma.coreUser.update({
      where: { id_user: id },
      data: { modul_akses: JSON.stringify(valid) },
    });
    return { data: { id_user: id, modul_akses: valid }, message: 'Hak akses modul diperbarui' };
  }

  async toggleAktif(id: number) {
    const user = await this.prisma.coreUser.findUnique({ where: { id_user: id } });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    const updated = await this.prisma.coreUser.update({
      where: { id_user: id },
      data: { is_aktif: !user.is_aktif },
    });
    return { data: { id_user: id, is_aktif: updated.is_aktif }, message: `User ${updated.is_aktif ? 'diaktifkan' : 'dinonaktifkan'}` };
  }

  async resetPassword(id: number, password: string) {
    const user = await this.prisma.coreUser.findUnique({ where: { id_user: id } });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    const password_hash = await bcrypt.hash(password, 12);
    await this.prisma.coreUser.update({ where: { id_user: id }, data: { password_hash } });
    return { data: null, message: 'Password berhasil direset' };
  }

  async createUser(dto: { id_karyawan: number; username: string; password: string; modul_akses?: string[] }) {
    const password_hash = await bcrypt.hash(dto.password, 12);
    const moduls = (dto.modul_akses || []).filter((m) => ALL_MODULS.includes(m));
    const user = await this.prisma.coreUser.create({
      data: {
        id_karyawan: dto.id_karyawan,
        username: dto.username,
        password_hash,
        modul_akses: moduls.length ? JSON.stringify(moduls) : null,
      },
      include: { karyawan: { select: { nama_lengkap: true, jabatan: true, departemen: true } } },
    });
    return { data: { ...user, modul_akses: moduls }, message: `User ${user.username} dibuat` };
  }

  // ─── Activity Log ─────────────────────────────────────────────

  async getLogs(query: {
    id_user?: string;
    aksi?: string;
    modul?: string;
    tgl_dari?: string;
    tgl_sampai?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page  = Number(query.page)  || 1;
    const limit = Number(query.limit) || 50;
    const skip  = (page - 1) * limit;

    const where: any = {};

    if (query.id_user) where.id_user = Number(query.id_user);
    if (query.aksi)    where.aksi    = query.aksi;
    if (query.modul)   where.modul   = query.modul;

    if (query.tgl_dari || query.tgl_sampai) {
      where.created_at = {};
      if (query.tgl_dari)   where.created_at.gte = new Date(query.tgl_dari);
      if (query.tgl_sampai) {
        const end = new Date(query.tgl_sampai);
        end.setHours(23, 59, 59, 999);
        where.created_at.lte = end;
      }
    }

    if (query.search) {
      where.OR = [
        { username:   { contains: query.search } },
        { nama:       { contains: query.search } },
        { deskripsi:  { contains: query.search } },
        { entitas:    { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }
}
