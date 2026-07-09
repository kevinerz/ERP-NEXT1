import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface NotifData {
  tipe: string;
  judul: string;
  deskripsi?: string;
  url?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Ambil id_user semua user aktif yang bisa akses modul tertentu (termasuk superadmin) */
  private async getUsersForModul(modul: string): Promise<number[]> {
    const users = await this.prisma.coreUser.findMany({
      where: { is_aktif: true },
      select: { id_user: true, modul_akses: true },
    });
    return users
      .filter((u) => {
        if (!u.modul_akses) return true; // superadmin
        // modul_akses disimpan sebagai JSON array string (lihat admin.service.ts) —
        // bukan comma-separated. Fallback ke format lama untuk data legacy.
        let akses: string[];
        try { akses = JSON.parse(u.modul_akses); }
        catch { akses = u.modul_akses.split(',').map((s) => s.trim()); }
        return akses.includes(modul);
      })
      .map((u) => u.id_user);
  }

  /** Buat notifikasi untuk semua user dengan akses modul tertentu */
  async notifyForModul(modul: string, data: NotifData): Promise<void> {
    try {
      const userIds = await this.getUsersForModul(modul);
      if (!userIds.length) return;
      await this.prisma.notification.createMany({
        data: userIds.map((id) => ({ id_user: id, ...data })),
      });
    } catch (e) {
      // Jangan sampai notifikasi gagal merusak proses utama
    }
  }

  /** Buat notifikasi untuk semua user aktif yang punya salah satu role tertentu */
  async notifyForRoles(roles: string[], data: NotifData): Promise<void> {
    try {
      const users = await this.prisma.coreUser.findMany({
        where: { is_aktif: true, user_roles: { some: { role: { nama_role: { in: roles } } } } },
        select: { id_user: true },
      });
      if (!users.length) return;
      await this.prisma.notification.createMany({
        data: users.map((u) => ({ id_user: u.id_user, ...data })),
      });
    } catch (e) {
      // Jangan sampai notifikasi gagal merusak proses utama
    }
  }

  /** GET /notifications — list notifikasi user dengan paginasi */
  async findForUser(userId: number, page = 1) {
    const limit = 25;
    const skip = (page - 1) * limit;
    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { id_user: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { id_user: userId } }),
      this.prisma.notification.count({ where: { id_user: userId, is_read: false } }),
    ]);
    return {
      data,
      meta: { total, unread, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  /** GET /notifications/unread-count — hitung notifikasi belum dibaca */
  async countUnread(userId: number) {
    const count = await this.prisma.notification.count({
      where: { id_user: userId, is_read: false },
    });
    return { data: { count } };
  }

  /** PATCH /notifications/:id/read — tandai satu notifikasi dibaca */
  async markRead(id: number, userId: number) {
    await this.prisma.notification.updateMany({
      where: { id_notif: id, id_user: userId },
      data: { is_read: true },
    });
    return { data: null, message: 'Ditandai dibaca' };
  }

  /** PATCH /notifications/read-all — tandai semua notifikasi dibaca */
  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { id_user: userId, is_read: false },
      data: { is_read: true },
    });
    return { data: null, message: 'Semua notifikasi ditandai dibaca' };
  }
}
