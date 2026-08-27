import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StarsenderClient } from './starsender.client';

@Injectable()
export class StarsenderService {
  private readonly logger = new Logger('StarSender');

  constructor(private prisma: PrismaService, private client: StarsenderClient) {}

  // ── Config ──────────────────────────────────────────────────────

  async getConfig() {
    const cfg = await this.prisma.integrationStarsenderConfig.findUnique({ where: { id: 1 } });
    return {
      data: {
        configured: !!cfg?.api_key,
        is_active: cfg?.is_active ?? false,
        api_key_masked: cfg?.api_key ? '***' + cfg.api_key.slice(-6) : null,
      },
    };
  }

  async updateConfig(dto: { api_key?: string; is_active?: boolean }) {
    await this.prisma.integrationStarsenderConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...dto },
      update: dto,
    });
    return { message: 'Konfigurasi StarSender disimpan' };
  }

  async testSend(phone: string) {
    const ok = await this.client.send(phone, '✅ Test notifikasi WhatsApp dari ERP NEXT1 berhasil!');
    if (!ok) throw new Error('Gagal kirim WA — cek API key dan nomor tujuan');
    return { message: `Pesan test berhasil dikirim ke ${phone}` };
  }

  // ── Internal Groups ──────────────────────────────────────────────

  async getInternalGroups() {
    return this.prisma.starsenderInternalGroup.findMany({ orderBy: { id: 'asc' } });
  }

  async addInternalGroup(dto: { group_id: string; nama_group: string }) {
    return this.prisma.starsenderInternalGroup.create({ data: dto });
  }

  async updateInternalGroup(id: number, dto: { group_id?: string; nama_group?: string; is_active?: boolean }) {
    return this.prisma.starsenderInternalGroup.update({ where: { id }, data: dto });
  }

  async deleteInternalGroup(id: number) {
    return this.prisma.starsenderInternalGroup.delete({ where: { id } });
  }

  // ── Pelanggan WA Group ───────────────────────────────────────────

  async getPelangganGroups() {
    return this.prisma.pelanggan.findMany({
      select: { id_pelanggan: true, nama_pelanggan: true, wa_group_id: true, nama_grup: true },
      orderBy: { nama_pelanggan: 'asc' },
    });
  }

  async updatePelangganGroup(id_pelanggan: number, dto: { wa_group_id?: string | null; nama_grup?: string | null }) {
    return this.prisma.pelanggan.update({ where: { id_pelanggan }, data: dto });
  }

  // ── Helper: ambil target internal (grup aktif + individual staff fallback) ──

  private async getInternalGroupIds(): Promise<string[]> {
    const groups = await this.prisma.starsenderInternalGroup.findMany({ where: { is_active: true } });
    return groups.map((g) => g.group_id);
  }

  async getStaffPhones(): Promise<string[]> {
    const users = await this.prisma.coreUser.findMany({
      where: { is_aktif: true },
      select: { modul_akses: true, karyawan: { select: { no_hp: true } } },
    });
    return users
      .filter((u) => {
        if (!u.karyawan?.no_hp) return false;
        if (!u.modul_akses) return true;
        try {
          const akses: string[] = JSON.parse(u.modul_akses);
          return akses.includes('operations');
        } catch {
          return u.modul_akses.split(',').map((s) => s.trim()).includes('operations');
        }
      })
      .map((u) => u.karyawan!.no_hp!);
  }

  private async sendToInternal(pesan: string) {
    const groupIds = await this.getInternalGroupIds();
    if (groupIds.length) {
      this.client.sendMany(groupIds, pesan).catch(() => {});
    } else {
      // fallback ke individual phone jika tidak ada grup internal
      const phones = await this.getStaffPhones();
      if (phones.length) this.client.sendMany(phones, pesan).catch(() => {});
    }
  }

  // ── Notifikasi Tiket ─────────────────────────────────────────────

  async notifTiketBaru(params: {
    nomor_tiket: string; judul: string; nama_site: string;
    nama_pelanggan: string; id_pelanggan?: number; no_hp_customer?: string | null;
  }) {
    const { nomor_tiket, judul, nama_site, nama_pelanggan, id_pelanggan, no_hp_customer } = params;

    // Ke customer — grup pelanggan (prioritas) atau no_hp_pic_utama
    if (id_pelanggan) {
      const pel = await this.prisma.pelanggan.findUnique({
        where: { id_pelanggan },
        select: { wa_group_id: true },
      });
      if (pel?.wa_group_id) {
        const pesan = `🎫 *Tiket Baru*\n*${nomor_tiket}*\n📌 ${judul}\n📍 Site: ${nama_site}\n\nTim kami akan segera menindaklanjuti. Terima kasih.`;
        this.client.send(pel.wa_group_id, pesan).catch(() => {});
      } else if (no_hp_customer) {
        const pesan = `Halo ${nama_pelanggan},\n\nTiket Anda telah dibuat:\n📋 *${nomor_tiket}*\n📌 ${judul}\n📍 Site: ${nama_site}\n\nTim kami akan segera menindaklanjuti. Terima kasih.`;
        this.client.send(no_hp_customer, pesan).catch(() => {});
      }
    } else if (no_hp_customer) {
      const pesan = `Halo ${nama_pelanggan},\n\nTiket Anda telah dibuat:\n📋 *${nomor_tiket}*\n📌 ${judul}\n📍 Site: ${nama_site}\n\nTim kami akan segera menindaklanjuti. Terima kasih.`;
      this.client.send(no_hp_customer, pesan).catch(() => {});
    }

    // Ke internal
    const pesan = `🎫 *Tiket Baru*\n${nomor_tiket} — ${judul}\nSite: ${nama_site} (${nama_pelanggan})`;
    await this.sendToInternal(pesan);
  }

  async notifTiketUpdate(params: {
    nomor_tiket: string; judul: string; status_dari: string; status_ke: string;
    nama_site: string; nama_pelanggan: string; id_pelanggan?: number; no_hp_customer?: string | null;
  }) {
    const { nomor_tiket, judul, status_dari, status_ke, nama_site, nama_pelanggan, id_pelanggan, no_hp_customer } = params;

    const emojiStatus: Record<string, string> = {
      In_Progress: '🔧', Resolved: '✅', Closed: '🔒', Pending_Customer: '⏳', Open: '🔴',
    };
    const emoji = emojiStatus[status_ke] ?? '📋';

    const statusCustomer = ['In_Progress', 'Resolved', 'Closed', 'Pending_Customer'];
    if (statusCustomer.includes(status_ke)) {
      const label: Record<string, string> = {
        In_Progress: 'sedang dikerjakan', Resolved: 'telah diselesaikan',
        Closed: 'telah ditutup', Pending_Customer: 'menunggu respons Anda',
      };
      const pesanCustomer = `${emoji} *Update Tiket*\n*${nomor_tiket}* ${label[status_ke] ?? `diupdate ke ${status_ke}`}\n📌 ${judul}\n📍 Site: ${nama_site}`;

      if (id_pelanggan) {
        const pel = await this.prisma.pelanggan.findUnique({
          where: { id_pelanggan },
          select: { wa_group_id: true },
        });
        if (pel?.wa_group_id) {
          this.client.send(pel.wa_group_id, pesanCustomer).catch(() => {});
        } else if (no_hp_customer) {
          this.client.send(no_hp_customer, pesanCustomer).catch(() => {});
        }
      } else if (no_hp_customer) {
        this.client.send(no_hp_customer, pesanCustomer).catch(() => {});
      }
    }

    // Ke internal
    const pesan = `${emoji} *Status Tiket*\n${nomor_tiket}: ${status_dari} → ${status_ke}\n${judul}\nSite: ${nama_site}`;
    await this.sendToInternal(pesan);
  }

  // ── Notifikasi Monitoring ────────────────────────────────────────

  async notifMonitorDown(params: { sumber: string; nama: string; nama_site?: string; msg?: string }) {
    const { sumber, nama, nama_site, msg } = params;
    const lokasi = nama_site ? `\n📍 Site: ${nama_site}` : '';
    const detail = msg ? `\nInfo: ${msg}` : '';
    const pesan = `🔴 *Alert Monitoring DOWN*\n🌐 ${sumber}: ${nama}${lokasi}${detail}`;
    await this.sendToInternal(pesan);
  }

  async notifMonitorUp(params: { sumber: string; nama: string; nama_site?: string }) {
    const { sumber, nama, nama_site } = params;
    const lokasi = nama_site ? ` | Site: ${nama_site}` : '';
    const pesan = `✅ *Monitor Kembali UP*\n🌐 ${sumber}: ${nama}${lokasi}`;
    await this.sendToInternal(pesan);
  }
}
