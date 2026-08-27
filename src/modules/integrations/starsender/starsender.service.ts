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

  // ── Helper: ambil nomor WA staff internal (akses operations) ──

  async getStaffPhones(): Promise<string[]> {
    const users = await this.prisma.coreUser.findMany({
      where: { is_aktif: true, no_hp: { not: null } },
      select: { no_hp: true, modul_akses: true },
    });
    return users
      .filter((u) => {
        if (!u.no_hp) return false;
        if (!u.modul_akses) return true; // superadmin
        try {
          const akses: string[] = JSON.parse(u.modul_akses);
          return akses.includes('operations');
        } catch {
          return u.modul_akses.split(',').map((s) => s.trim()).includes('operations');
        }
      })
      .map((u) => u.no_hp!);
  }

  // ── Notifikasi Tiket ─────────────────────────────────────────────

  async notifTiketBaru(params: { nomor_tiket: string; judul: string; nama_site: string; nama_pelanggan: string; no_hp_customer?: string | null }) {
    const { nomor_tiket, judul, nama_site, nama_pelanggan, no_hp_customer } = params;

    // Ke customer
    if (no_hp_customer) {
      const pesan = `Halo ${nama_pelanggan},\n\nTiket Anda telah dibuat:\n📋 *${nomor_tiket}*\n📌 ${judul}\n📍 Site: ${nama_site}\n\nTim kami akan segera menindaklanjuti. Terima kasih.`;
      this.client.send(no_hp_customer, pesan).catch(() => {});
    }

    // Ke staff internal
    const staffPhones = await this.getStaffPhones();
    if (staffPhones.length) {
      const pesan = `🎫 *Tiket Baru*\n${nomor_tiket} — ${judul}\nSite: ${nama_site} (${nama_pelanggan})`;
      this.client.sendMany(staffPhones, pesan).catch(() => {});
    }
  }

  async notifTiketUpdate(params: { nomor_tiket: string; judul: string; status_dari: string; status_ke: string; nama_site: string; nama_pelanggan: string; no_hp_customer?: string | null }) {
    const { nomor_tiket, judul, status_dari, status_ke, nama_site, nama_pelanggan, no_hp_customer } = params;

    const emojiStatus: Record<string, string> = {
      In_Progress: '🔧', Resolved: '✅', Closed: '🔒', Pending_Customer: '⏳', Open: '🔴',
    };
    const emoji = emojiStatus[status_ke] ?? '📋';

    // Ke customer — hanya untuk status yang relevan bagi mereka
    const statusCustomer = ['In_Progress', 'Resolved', 'Closed', 'Pending_Customer'];
    if (no_hp_customer && statusCustomer.includes(status_ke)) {
      const label: Record<string, string> = {
        In_Progress: 'sedang dikerjakan', Resolved: 'telah diselesaikan',
        Closed: 'telah ditutup', Pending_Customer: 'menunggu respons Anda',
      };
      const pesan = `${emoji} Halo ${nama_pelanggan},\n\nTiket *${nomor_tiket}* ${label[status_ke] ?? `diupdate ke ${status_ke}`}.\n📌 ${judul}\n📍 Site: ${nama_site}`;
      this.client.send(no_hp_customer, pesan).catch(() => {});
    }

    // Ke staff internal
    const staffPhones = await this.getStaffPhones();
    if (staffPhones.length) {
      const pesan = `${emoji} *Status Tiket*\n${nomor_tiket}: ${status_dari} → ${status_ke}\n${judul}\nSite: ${nama_site}`;
      this.client.sendMany(staffPhones, pesan).catch(() => {});
    }
  }

  // ── Notifikasi Monitoring Down ───────────────────────────────────

  async notifMonitorDown(params: { sumber: string; nama: string; nama_site?: string; msg?: string }) {
    const { sumber, nama, nama_site, msg } = params;
    const staffPhones = await this.getStaffPhones();
    if (!staffPhones.length) return;

    const lokasi = nama_site ? `\n📍 Site: ${nama_site}` : '';
    const detail = msg ? `\nInfo: ${msg}` : '';
    const pesan = `🔴 *Alert Monitoring DOWN*\n🌐 ${sumber}: ${nama}${lokasi}${detail}`;
    this.client.sendMany(staffPhones, pesan).catch(() => {});
  }

  async notifMonitorUp(params: { sumber: string; nama: string; nama_site?: string }) {
    const { sumber, nama, nama_site } = params;
    const staffPhones = await this.getStaffPhones();
    if (!staffPhones.length) return;

    const lokasi = nama_site ? ` | Site: ${nama_site}` : '';
    const pesan = `✅ *Monitor Kembali UP*\n🌐 ${sumber}: ${nama}${lokasi}`;
    this.client.sendMany(staffPhones, pesan).catch(() => {});
  }
}
