import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StarsenderClient } from './starsender.client';

// ── Default template placeholders ──────────────────────────────────
// Tiket: {nomor_tiket} {judul} {nama_site} {nama_pelanggan} {status_ke} {status_dari} {root_cause} {tindakan} {teknisi}
// Monitor: {sumber} {nama} {nama_site} {detail}

const DEFAULT_TEMPLATES = {
  tiket_baru_pelanggan: `🎫 *Tiket Baru — {nomor_tiket}*\n\n📌 *{judul}*\n📍 Site: {nama_site}\n\nTim dukungan kami telah menerima laporan Anda dan akan segera menindaklanjuti.\nTerima kasih atas kepercayaan Anda kepada kami.`,
  tiket_baru_pelanggan_hp: `Halo *{nama_pelanggan}*,\n\nTiket dukungan Anda telah berhasil dibuat.\n\n🎫 *{nomor_tiket}*\n📌 {judul}\n📍 Site: {nama_site}\n\nTim kami akan menghubungi Anda dalam waktu dekat. Terima kasih.`,
  tiket_baru_internal: `🎫 *Tiket Baru*\nNo: {nomor_tiket}\nJudul: {judul}\nSite: {nama_site}\nPelanggan: {nama_pelanggan}`,
  tiket_update_pelanggan: `{emoji} *Update Tiket — {nomor_tiket}*\n\nTiket Anda *{label_status}*.\n📌 {judul}\n📍 Site: {nama_site}\n{root_cause_line}{tindakan_line}\nHubungi kami jika ada pertanyaan lebih lanjut.`,
  tiket_update_internal: `{emoji} *Update Tiket*\nNo: {nomor_tiket}\nStatus: {status_dari} → {status_ke}\nJudul: {judul}\nSite: {nama_site}{root_cause_line}{tindakan_line}{teknisi_line}`,
  monitor_down: `🔴 *ALERT: Jaringan DOWN*\nSumber: {sumber}\nPerangkat: {nama}{site_line}{detail_line}\n\nSegera periksa kondisi jaringan!`,
  monitor_up: `✅ *Jaringan Kembali UP*\nSumber: {sumber}\nPerangkat: {nama}{site_line}`,
};

@Injectable()
export class StarsenderService {
  private readonly logger = new Logger('StarSender');

  constructor(private prisma: PrismaService, private client: StarsenderClient) {}

  // ── Template helpers ─────────────────────────────────────────────

  private async loadTemplates(): Promise<typeof DEFAULT_TEMPLATES> {
    try {
      const cfg = await this.prisma.integrationStarsenderConfig.findUnique({ where: { id: 1 }, select: { templates: true } });
      if (cfg?.templates) {
        const saved = JSON.parse(cfg.templates);
        return { ...DEFAULT_TEMPLATES, ...saved };
      }
    } catch {}
    return { ...DEFAULT_TEMPLATES };
  }

  async getTemplates() {
    const tpl = await this.loadTemplates();
    return { data: tpl, placeholders: {
      tiket: ['{nomor_tiket}', '{judul}', '{nama_site}', '{nama_pelanggan}', '{status_ke}', '{status_dari}', '{label_status}', '{emoji}', '{root_cause}', '{tindakan}', '{teknisi}', '{root_cause_line}', '{tindakan_line}', '{teknisi_line}'],
      monitor: ['{sumber}', '{nama}', '{nama_site}', '{detail}', '{site_line}', '{detail_line}'],
    }};
  }

  async updateTemplates(templates: Partial<typeof DEFAULT_TEMPLATES>) {
    const existing = await this.loadTemplates();
    const merged = { ...existing, ...templates };
    await this.prisma.integrationStarsenderConfig.upsert({
      where: { id: 1 },
      create: { id: 1, templates: JSON.stringify(merged) },
      update: { templates: JSON.stringify(merged) },
    });
    return { message: 'Template berhasil disimpan', data: merged };
  }

  async resetTemplates() {
    await this.prisma.integrationStarsenderConfig.upsert({
      where: { id: 1 },
      create: { id: 1, templates: null },
      update: { templates: null },
    });
    return { message: 'Template direset ke default', data: DEFAULT_TEMPLATES };
  }

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
    const ok = await this.client.send(phone, '✅ *Test Notifikasi WA*\nERP NEXT1 — Pesan test berhasil diterima.');
    if (!ok) throw new Error('Gagal kirim WA — cek API key dan nomor tujuan');
    return { message: `Pesan test berhasil dikirim ke ${phone}` };
  }

  async testSendGroup(group_id: string) {
    const ok = await this.client.send(group_id, '✅ *Test Notifikasi WA*\nERP NEXT1 — Pesan test berhasil diterima oleh grup ini.');
    if (!ok) throw new Error('Gagal kirim WA ke grup — cek Group ID');
    return { message: 'Pesan test berhasil dikirim ke grup' };
  }

  // ── Internal Groups ──────────────────────────────────────────────

  async getInternalGroups() {
    return this.prisma.starsenderInternalGroup.findMany({ where: { tipe: 'internal' }, orderBy: { id: 'asc' } });
  }

  async addInternalGroup(dto: { group_id: string; nama_group: string }) {
    return this.prisma.starsenderInternalGroup.create({ data: { ...dto, tipe: 'internal' } });
  }

  async updateInternalGroup(id: number, dto: { group_id?: string; nama_group?: string; is_active?: boolean }) {
    return this.prisma.starsenderInternalGroup.update({ where: { id }, data: dto });
  }

  async deleteInternalGroup(id: number) {
    return this.prisma.starsenderInternalGroup.delete({ where: { id } });
  }

  // ── Pelanggan / External Groups ──────────────────────────────────

  async getPelangganGroups() {
    return this.prisma.starsenderInternalGroup.findMany({ where: { tipe: 'pelanggan' }, orderBy: { id: 'asc' } });
  }

  async addPelangganGroup(dto: { group_id: string; nama_group: string }) {
    return this.prisma.starsenderInternalGroup.create({ data: { ...dto, tipe: 'pelanggan' } });
  }

  async updatePelangganGroup(id: number, dto: { group_id?: string; nama_group?: string; is_active?: boolean }) {
    return this.prisma.starsenderInternalGroup.update({ where: { id }, data: dto });
  }

  async deletePelangganGroup(id: number) {
    return this.prisma.starsenderInternalGroup.delete({ where: { id } });
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private async getInternalGroupIds(): Promise<string[]> {
    const groups = await this.prisma.starsenderInternalGroup.findMany({ where: { tipe: 'internal', is_active: true } });
    return groups.map((g) => g.group_id);
  }

  private async getPelangganGroupIds(): Promise<string[]> {
    const groups = await this.prisma.starsenderInternalGroup.findMany({ where: { tipe: 'pelanggan', is_active: true } });
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
      const phones = await this.getStaffPhones();
      if (phones.length) this.client.sendMany(phones, pesan).catch(() => {});
    }
  }

  private async sendToPelangganGroups(pesan: string) {
    const groupIds = await this.getPelangganGroupIds();
    if (groupIds.length) {
      this.client.sendMany(groupIds, pesan).catch(() => {});
      return true;
    }
    return false;
  }

  private fill(tpl: string, vars: Record<string, string>): string {
    let result = tpl;
    for (const [key, val] of Object.entries(vars)) {
      result = result.split(`{${key}}`).join(val);
    }
    return result;
  }

  // ── Notifikasi Tiket ─────────────────────────────────────────────

  async notifTiketBaru(params: {
    nomor_tiket: string; judul: string; nama_site: string;
    nama_pelanggan: string; id_pelanggan?: number; no_hp_customer?: string | null;
  }) {
    const { nomor_tiket, judul, nama_site, nama_pelanggan, id_pelanggan, no_hp_customer } = params;
    const tpl = await this.loadTemplates();

    // Ke pelanggan — coba external groups dulu, lalu individual group per pelanggan, lalu no HP
    const sentToExternalGroups = await this.sendToPelangganGroups(
      this.fill(tpl.tiket_baru_pelanggan, { nomor_tiket, judul, nama_site, nama_pelanggan })
    );

    if (!sentToExternalGroups) {
      if (id_pelanggan) {
        const pel = await this.prisma.pelanggan.findUnique({ where: { id_pelanggan }, select: { wa_group_id: true } });
        if (pel?.wa_group_id) {
          this.client.send(pel.wa_group_id, this.fill(tpl.tiket_baru_pelanggan, { nomor_tiket, judul, nama_site, nama_pelanggan })).catch(() => {});
        } else if (no_hp_customer) {
          this.client.send(no_hp_customer, this.fill(tpl.tiket_baru_pelanggan_hp, { nomor_tiket, judul, nama_site, nama_pelanggan })).catch(() => {});
        }
      } else if (no_hp_customer) {
        this.client.send(no_hp_customer, this.fill(tpl.tiket_baru_pelanggan_hp, { nomor_tiket, judul, nama_site, nama_pelanggan })).catch(() => {});
      }
    }

    // Ke internal
    await this.sendToInternal(this.fill(tpl.tiket_baru_internal, { nomor_tiket, judul, nama_site, nama_pelanggan }));
  }

  async notifTiketUpdate(params: {
    nomor_tiket: string; judul: string; status_dari: string; status_ke: string;
    nama_site: string; nama_pelanggan: string; id_pelanggan?: number; no_hp_customer?: string | null;
    root_cause?: string | null; tindakan?: string | null; teknisi?: string | null;
  }) {
    const { nomor_tiket, judul, status_dari, status_ke, nama_site, nama_pelanggan, id_pelanggan, no_hp_customer, root_cause, tindakan, teknisi } = params;
    const tpl = await this.loadTemplates();

    const emojiStatus: Record<string, string> = {
      In_Progress: '🔧', Resolved: '✅', Closed: '🔒', Pending_Customer: '⏳', Open: '🔴',
    };
    const labelStatus: Record<string, string> = {
      In_Progress: 'sedang dikerjakan', Resolved: 'telah diselesaikan',
      Closed: 'telah ditutup', Pending_Customer: 'menunggu respons Anda',
    };
    const emoji = emojiStatus[status_ke] ?? '📋';
    const label_status = labelStatus[status_ke] ?? `diupdate ke ${status_ke}`;

    const root_cause_line = root_cause ? `\n🔍 Root Cause: ${root_cause}` : '';
    const tindakan_line = tindakan ? `\n🔧 Tindakan: ${tindakan}` : '';
    const teknisi_line = teknisi ? `\n👤 Teknisi: ${teknisi}` : '';

    const vars = { nomor_tiket, judul, nama_site, nama_pelanggan, status_ke, status_dari, label_status, emoji, root_cause_line, tindakan_line, teknisi_line, root_cause: root_cause ?? '', tindakan: tindakan ?? '', teknisi: teknisi ?? '' };

    const statusCustomer = ['In_Progress', 'Resolved', 'Closed', 'Pending_Customer'];
    if (statusCustomer.includes(status_ke)) {
      const pesanCustomer = this.fill(tpl.tiket_update_pelanggan, vars);

      const sentToExternalGroups = await this.sendToPelangganGroups(pesanCustomer);
      if (!sentToExternalGroups) {
        if (id_pelanggan) {
          const pel = await this.prisma.pelanggan.findUnique({ where: { id_pelanggan }, select: { wa_group_id: true } });
          if (pel?.wa_group_id) {
            this.client.send(pel.wa_group_id, pesanCustomer).catch(() => {});
          } else if (no_hp_customer) {
            this.client.send(no_hp_customer, pesanCustomer).catch(() => {});
          }
        } else if (no_hp_customer) {
          this.client.send(no_hp_customer, pesanCustomer).catch(() => {});
        }
      }
    }

    // Ke internal
    await this.sendToInternal(this.fill(tpl.tiket_update_internal, vars));
  }

  // ── Notifikasi Monitoring ────────────────────────────────────────

  async notifMonitorDown(params: { sumber: string; nama: string; nama_site?: string; msg?: string }) {
    const { sumber, nama, nama_site, msg } = params;
    const tpl = await this.loadTemplates();
    const site_line = nama_site ? `\n📍 Site: ${nama_site}` : '';
    const detail_line = msg ? `\nInfo: ${msg}` : '';
    const pesan = this.fill(tpl.monitor_down, { sumber, nama, site_line, detail_line, nama_site: nama_site ?? '', detail: msg ?? '' });
    await this.sendToInternal(pesan);
  }

  async notifMonitorUp(params: { sumber: string; nama: string; nama_site?: string }) {
    const { sumber, nama, nama_site } = params;
    const tpl = await this.loadTemplates();
    const site_line = nama_site ? `\n📍 Site: ${nama_site}` : '';
    const pesan = this.fill(tpl.monitor_up, { sumber, nama, site_line, nama_site: nama_site ?? '' });
    await this.sendToInternal(pesan);
  }
}
