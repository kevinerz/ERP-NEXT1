import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { promises as fsp, existsSync, statSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { WaGatewayClient, type GwKirim, type GwPesan } from './wa-gateway.client';
import { WaRealtimeService } from './wa-realtime.service';

/** File dari FileInterceptor (memory storage) — tanpa bergantung @types/multer */
export type FileUnggah = { buffer: Buffer; mimetype: string; originalname: string; size: number };

type Kecocokan = { id_pelanggan: number | null; id_site: number | null; id_pic: number | null; nama: string };

const PER_HALAMAN = 30;
// Batas chat baru per akun (anti-blokir): memulai chat ke nomor baru paling berisiko
const MAKS_CHAT_BARU_PER_JAM = 20;

/** "0812-3456 789" / "+62 812…" → "62812…"; null bila tidak mirip nomor HP */
export function normalNomor(s: string | null | undefined): string | null {
  let n = (s || '').replace(/\D/g, '');
  if (!n) return null;
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  return n.length >= 9 ? n : null;
}
const nomorDariJid = (jid: string | null | undefined) => (jid?.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : null);

function ringkas(p: { tipe: string; teks?: string | null; media_nama?: string | null }): string {
  const label: Record<string, string> = {
    image: '📷 Foto', video: '🎥 Video', audio: '🎤 Audio', document: '📄 Dokumen', sticker: '🏷️ Stiker',
    location: '📍 Lokasi', contact: '👤 Kontak', poll: '📊 Polling', call: '📞 Panggilan ditolak',
  };
  const t = (p.teks || '').replace(/\s+/g, ' ').trim();
  const l = label[p.tipe];
  const s = l ? (t ? `${l}: ${t}` : p.tipe === 'document' && p.media_nama ? `${l}: ${p.media_nama}` : l) : t;
  return s.slice(0, 290);
}

@Injectable()
export class WaService {
  private readonly logger = new Logger('WhatsApp');
  private cacheAkun = new Map<string, number>();
  private indeksNomor: { at: number; map: Map<string, Kecocokan> } | null = null;
  private namaStaf: { at: number; map: Map<number, string> } | null = null;
  // Antrean foto profil: maks 3 permintaan bersamaan ke WhatsApp
  private chatBaruTerakhir = new Map<number, number[]>(); // id_akun → waktu pembuatan chat baru (1 jam terakhir)
  private fotoJalan = 0;
  private fotoAntre: (() => void)[] = [];

  constructor(
    private prisma: PrismaService,
    private gw: WaGatewayClient,
    private rt: WaRealtimeService,
    private config: ConfigService,
  ) {}

  get dirMedia() { return this.config.get<string>('WA_MEDIA_DIR') || join(process.cwd(), 'storage', 'wa-media'); }

  // ── Referensi ────────────────────────────────────────────────────────────────
  async idAkun(kode: string): Promise<number> {
    const c = this.cacheAkun.get(kode);
    if (c) return c;
    const a = await this.prisma.waAkun.upsert({ where: { kode }, create: { kode, nama: kode }, update: {} });
    this.cacheAkun.set(kode, a.id_akun);
    return a.id_akun;
  }

  /** Indeks nomor HP → PIC site / pelanggan (di-cache 10 menit) */
  private async indeks(): Promise<Map<string, Kecocokan>> {
    if (this.indeksNomor && Date.now() - this.indeksNomor.at < 10 * 60_000) return this.indeksNomor.map;
    const map = new Map<string, Kecocokan>();
    const pelanggan = await this.prisma.pelanggan.findMany({
      select: {
        id_pelanggan: true, nama_pelanggan: true, no_telp: true, no_hp_pic_utama: true, nama_pic_utama: true,
        no_ponsel_pemilik: true, nama_pemilik: true, no_ponsel_pic_teknis: true, nama_pic_teknis: true,
        no_ponsel_pic_keuangan: true, nama_pic_keuangan: true,
      },
    });
    for (const p of pelanggan) {
      const pasang = (no: string | null, nama: string | null) => {
        const n = normalNomor(no);
        if (n && !map.has(n)) map.set(n, { id_pelanggan: p.id_pelanggan, id_site: null, id_pic: null, nama: nama ? `${nama} · ${p.nama_pelanggan}` : p.nama_pelanggan });
      };
      pasang(p.no_hp_pic_utama, p.nama_pic_utama);
      pasang(p.no_ponsel_pic_teknis, p.nama_pic_teknis);
      pasang(p.no_ponsel_pic_keuangan, p.nama_pic_keuangan);
      pasang(p.no_ponsel_pemilik, p.nama_pemilik);
      pasang(p.no_telp, null);
    }
    // PIC site lebih spesifik → menimpa kecocokan level pelanggan
    const pic = await this.prisma.picSite.findMany({
      where: { no_kontak: { not: null } },
      select: { id_pic: true, nama_pic: true, no_kontak: true, site: { select: { id_site: true, nama_site: true, id_pelanggan: true } } },
    });
    for (const x of pic) {
      const n = normalNomor(x.no_kontak);
      if (n) map.set(n, { id_pelanggan: x.site.id_pelanggan, id_site: x.site.id_site, id_pic: x.id_pic, nama: `${x.nama_pic} · ${x.site.nama_site}` });
    }
    this.indeksNomor = { at: Date.now(), map };
    return map;
  }

  private async staf(): Promise<Map<number, string>> {
    if (this.namaStaf && Date.now() - this.namaStaf.at < 5 * 60_000) return this.namaStaf.map;
    const k = await this.prisma.hrisKaryawan.findMany({ select: { id_karyawan: true, nama_lengkap: true } });
    this.namaStaf = { at: Date.now(), map: new Map(k.map((x) => [x.id_karyawan, x.nama_lengkap])) };
    return this.namaStaf.map;
  }

  // ── Kontak & chat ────────────────────────────────────────────────────────────
  private async simpanKontak(id_akun: number, jid: string, lid: string | null, data: { nama_wa?: string | null; nama_simpan?: string | null }) {
    if (!jid || jid.endsWith('@g.us')) return null;
    const nomor = nomorDariJid(jid);
    const cocok = nomor ? (await this.indeks()).get(nomor) ?? null : null;
    const isi = {
      lid: lid ?? undefined,
      nomor,
      ...(data.nama_wa ? { nama_wa: data.nama_wa.slice(0, 150) } : {}),
      ...(data.nama_simpan ? { nama_simpan: data.nama_simpan.slice(0, 150) } : {}),
      ...(cocok ? { id_pelanggan: cocok.id_pelanggan, id_site: cocok.id_site, id_pic: cocok.id_pic, nama_erp: cocok.nama.slice(0, 200) } : {}),
    };
    return this.prisma.waKontak.upsert({
      where: { id_akun_jid: { id_akun, jid } },
      create: { id_akun, jid, ...isi, lid: lid ?? null },
      update: isi,
    });
  }

  /** Cari / buat chat. LID yang belakangan diketahui nomornya digabung ke chat bernomor. */
  private async ambilChat(id_akun: number, jid: string, lid: string | null, is_grup: boolean) {
    let chat = await this.prisma.waChat.findUnique({ where: { id_akun_jid: { id_akun, jid } } });
    if (!chat && lid) {
      chat = await this.prisma.waChat.findFirst({ where: { id_akun, OR: [{ jid: lid }, { lid }] } });
      if (chat && chat.jid !== jid) chat = await this.prisma.waChat.update({ where: { id_chat: chat.id_chat }, data: { jid, lid } });
    }
    if (!chat) {
      chat = await this.prisma.waChat.create({ data: { id_akun, jid, lid, is_grup } });
    } else if (lid && !chat.lid) {
      chat = await this.prisma.waChat.update({ where: { id_chat: chat.id_chat }, data: { lid } });
    }
    return chat;
  }

  /** Gabungkan chat ber-JID LID ke chat bernomor HP setelah pemetaan LID↔nomor diketahui */
  private async gabungLid(id_akun: number, lid: string, pn: string) {
    const [cLid, cPn] = await Promise.all([
      this.prisma.waChat.findUnique({ where: { id_akun_jid: { id_akun, jid: lid } } }),
      this.prisma.waChat.findUnique({ where: { id_akun_jid: { id_akun, jid: pn } } }),
    ]);
    if (cLid && !cPn) {
      await this.prisma.waChat.update({ where: { id_chat: cLid.id_chat }, data: { jid: pn, lid } });
    } else if (cLid && cPn) {
      // Pindahkan pesan yang belum ada di chat bernomor, lalu hapus chat LID
      const ada = new Set((await this.prisma.waPesan.findMany({ where: { id_chat: cPn.id_chat }, select: { wa_id: true } })).map((x) => x.wa_id));
      const pindah = (await this.prisma.waPesan.findMany({ where: { id_chat: cLid.id_chat }, select: { id_pesan: true, wa_id: true } })).filter((x) => !ada.has(x.wa_id));
      await this.prisma.$transaction([
        this.prisma.waPesan.updateMany({ where: { id_pesan: { in: pindah.map((x) => x.id_pesan) } }, data: { id_chat: cPn.id_chat } }),
        this.prisma.waChat.delete({ where: { id_chat: cLid.id_chat } }),
        this.prisma.waChat.update({
          where: { id_chat: cPn.id_chat },
          data: { lid, belum_dibaca: cPn.belum_dibaca + cLid.belum_dibaca, id_karyawan_pic: cPn.id_karyawan_pic ?? cLid.id_karyawan_pic },
        }),
      ]);
    } else if (cPn && !cPn.lid) {
      await this.prisma.waChat.update({ where: { id_chat: cPn.id_chat }, data: { lid } });
    }
    const k = await this.prisma.waKontak.findUnique({ where: { id_akun_jid: { id_akun, jid: lid } } });
    if (k) {
      const kPn = await this.prisma.waKontak.findUnique({ where: { id_akun_jid: { id_akun, jid: pn } } });
      if (kPn) await this.prisma.waKontak.delete({ where: { id_kontak: k.id_kontak } });
      else await this.prisma.waKontak.update({ where: { id_kontak: k.id_kontak }, data: { jid: pn, lid, nomor: nomorDariJid(pn) } });
    }
    await this.simpanKontak(id_akun, pn, lid, {});
  }

  // ── Webhook dari gateway ─────────────────────────────────────────────────────
  async webhook(body: { akun?: string; event?: string; data?: any }) {
    const kode = String(body?.akun || '');
    if (!kode || !body?.event) throw new BadRequestException('Payload webhook tidak valid');
    const id_akun = await this.idAkun(kode);
    const d = body.data;
    switch (body.event) {
      case 'koneksi': return this.onKoneksi(id_akun, kode, d);
      case 'pesan': return this.simpanPesan(id_akun, kode, d as GwPesan, true);
      case 'riwayat': return this.onRiwayat(id_akun, kode, d);
      case 'chat': return this.onChatRiwayat(id_akun, d);
      case 'kontak': return this.onKontak(id_akun, d);
      case 'grup':
        for (const g of d ?? []) {
          if (!g?.jid || !g?.nama) continue;
          await this.prisma.waChat.upsert({
            where: { id_akun_jid: { id_akun, jid: g.jid } },
            create: { id_akun, jid: g.jid, is_grup: true, nama: String(g.nama).slice(0, 200) },
            update: { nama: String(g.nama).slice(0, 200) },
          });
        }
        return;
      case 'lid':
        for (const m of d ?? []) if (m?.lid && m?.pn) await this.gabungLid(id_akun, m.lid, m.pn.replace(/:\d+@/, '@'));
        return;
      case 'status': return this.onStatus(d);
      case 'panggilan': return this.onPanggilan(id_akun, d);
      default:
        this.logger.warn(`Event webhook tidak dikenal: ${body.event}`);
    }
  }

  private async onKoneksi(id_akun: number, kode: string, d: any) {
    const status = String(d?.status || 'mati');
    await this.prisma.waAkun.update({
      where: { id_akun },
      data: {
        status,
        ...(status === 'terhubung' ? { terhubung_at: new Date(), nomor_jid: d?.saya?.jid ?? null, nama_wa: d?.saya?.nama ?? null } : {}),
        ...(d?.putus_terakhir ? { putus_terakhir: JSON.stringify(d.putus_terakhir) } : {}),
      },
    });
    this.rt.siarkan({ tipe: 'koneksi', akun: kode, status, ada_qr: !!d?.ada_qr });
  }

  private async onKontak(id_akun: number, list: any[]) {
    for (const c of list ?? []) {
      if (!c?.jid) continue;
      await this.simpanKontak(id_akun, c.jid, c.lid ?? null, { nama_wa: c.nama_wa ?? null, nama_simpan: c.nama_simpan ?? null });
    }
  }

  private async onChatRiwayat(id_akun: number, list: any[]) {
    for (const c of list ?? []) {
      if (!c?.jid) continue;
      const chat = await this.ambilChat(id_akun, c.jid, c.lid ?? null, c.jid.endsWith('@g.us'));
      await this.prisma.waChat.update({
        where: { id_chat: chat.id_chat },
        data: {
          ...(c.nama && !chat.nama ? { nama: String(c.nama).slice(0, 200) } : {}),
          ...(typeof c.belum_dibaca === 'number' && c.belum_dibaca > 0 ? { belum_dibaca: c.belum_dibaca } : {}),
        },
      });
    }
  }

  private async onRiwayat(id_akun: number, kode: string, d: any) {
    const pesan: GwPesan[] = d?.pesan ?? [];
    // Riwayat datang dari terbaru ke terlama — urutkan supaya "pesan terakhir" chat benar
    pesan.sort((a, b) => a.waktu - b.waktu);
    for (const p of pesan) await this.simpanPesan(id_akun, kode, p, false);
    this.rt.siarkan({ tipe: 'riwayat', akun: kode, jumlah: pesan.length, progress: d?.progress ?? null, terakhir: !!d?.terakhir });
  }

  private async onStatus(list: any[]) {
    for (const s of list ?? []) {
      if (!s?.id || typeof s.status !== 'number') continue;
      const rows = await this.prisma.waPesan.findMany({ where: { wa_id: s.id }, select: { id_pesan: true, id_chat: true, status: true } });
      for (const r of rows) {
        if ((r.status ?? 0) >= s.status) continue; // status hanya naik
        await this.prisma.waPesan.update({ where: { id_pesan: r.id_pesan }, data: { status: s.status } });
        this.rt.siarkan({ tipe: 'status', id_chat: r.id_chat, id_pesan: r.id_pesan, status: s.status });
      }
    }
  }

  private async onPanggilan(id_akun: number, d: any) {
    if (!d?.dari_jid || d.grup) return;
    const chat = await this.ambilChat(id_akun, d.dari_jid, d.dari_lid ?? null, false);
    const waktu = new Date((d.waktu ?? Date.now() / 1000) * 1000);
    const teks = d.video ? 'Panggilan video ditolak otomatis' : 'Panggilan suara ditolak otomatis';
    const pesan = await this.prisma.waPesan.create({
      data: { id_chat: chat.id_chat, wa_id: `call-${waktu.getTime()}`, tipe: 'call', teks, waktu },
    });
    await this.perbaruiChat(chat.id_chat, { tipe: 'call', teks, waktu, masuk: true, dari_saya: false, riwayat: false });
    await this.siarkanPesan(chat.id_chat, pesan.id_pesan);
  }

  /** Simpan satu pesan (masuk / keluar / riwayat). Idempoten per (chat, wa_id). */
  async simpanPesan(id_akun: number, kode: string, p: GwPesan, siarkan: boolean, ekstra?: { id_karyawan?: number; media_path?: string }) {
    if (!p?.id || !p.chat_jid) return null;
    const chat = await this.ambilChat(id_akun, p.chat_jid, p.chat_lid, p.is_grup);
    const waktu = new Date((p.waktu || Date.now() / 1000) * 1000);

    // Kontak pengirim (pushName) — untuk nama chat pribadi & nama anggota grup
    if (!p.dari_saya && p.pengirim_jid && p.nama_pengirim) {
      await this.simpanKontak(id_akun, p.pengirim_jid, p.pengirim_lid, { nama_wa: p.nama_pengirim });
    } else if (!p.is_grup && !p.dari_saya) {
      await this.simpanKontak(id_akun, p.chat_jid, p.chat_lid, {});
    }

    // Reaksi / hapus / edit mengubah pesan target, bukan pesan baru
    if (p.tipe === 'reaction' && p.reaksi?.target_id) {
      const target = await this.prisma.waPesan.findUnique({ where: { id_chat_wa_id: { id_chat: chat.id_chat, wa_id: p.reaksi.target_id } } });
      if (target) {
        const siapa = p.dari_saya ? 'saya' : p.pengirim_jid || 'lawan';
        const reaksi = { ...((target.reaksi as Record<string, string>) || {}) };
        if (p.reaksi.emoji) reaksi[siapa] = p.reaksi.emoji; else delete reaksi[siapa];
        await this.prisma.waPesan.update({ where: { id_pesan: target.id_pesan }, data: { reaksi } });
        if (siarkan) await this.siarkanPesan(chat.id_chat, target.id_pesan);
      }
      return null;
    }
    if ((p.tipe === 'revoke' || p.tipe === 'edit') && p.target_id) {
      const target = await this.prisma.waPesan.findUnique({ where: { id_chat_wa_id: { id_chat: chat.id_chat, wa_id: p.target_id } } });
      if (target) {
        await this.prisma.waPesan.update({
          where: { id_pesan: target.id_pesan },
          data: p.tipe === 'revoke' ? { dihapus: true } : { teks: p.teks, diedit: true },
        });
        if (siarkan) await this.siarkanPesan(chat.id_chat, target.id_pesan);
      }
      return null;
    }

    const m = p.media;
    const isi: Prisma.WaPesanUncheckedCreateInput = {
      id_chat: chat.id_chat,
      wa_id: p.id,
      dari_saya: p.dari_saya,
      pengirim_jid: p.pengirim_jid,
      nama_pengirim: p.nama_pengirim?.slice(0, 150) ?? null,
      tipe: p.tipe.slice(0, 20),
      teks: p.teks,
      media_jenis: m?.jenis ?? null,
      media_mime: m?.mimetype?.slice(0, 100) ?? null,
      media_nama: m?.nama_file?.slice(0, 255) ?? null,
      media_ukuran: m?.ukuran ?? null,
      media_durasi: m?.durasi ?? null,
      ptt: !!m?.ptt,
      kutip_id: p.kutipan?.id ?? null,
      kutip_teks: p.kutipan?.teks ?? null,
      kutip_pengirim: p.kutipan?.pengirim_jid ?? null,
      lokasi: p.lokasi ?? undefined,
      kontak: p.kontak ?? undefined,
      status: p.status,
      riwayat: !!p.riwayat,
      waktu,
      ...(ekstra?.id_karyawan ? { id_karyawan: ekstra.id_karyawan } : {}),
      ...(ekstra?.media_path ? { media_path: ekstra.media_path } : {}),
    };
    const lama = await this.prisma.waPesan.findUnique({ where: { id_chat_wa_id: { id_chat: chat.id_chat, wa_id: p.id } } });
    let simpan;
    if (lama) {
      // Jangan timpa data yang sudah ada (staf pengirim, file media, status lebih tinggi) dengan nilai kosong
      simpan = await this.prisma.waPesan.update({
        where: { id_pesan: lama.id_pesan },
        data: {
          ...(ekstra?.id_karyawan ? { id_karyawan: ekstra.id_karyawan } : {}),
          ...(ekstra?.media_path ? { media_path: ekstra.media_path } : {}),
          ...(p.status != null && (lama.status ?? 0) < p.status ? { status: p.status } : {}),
          ...(p.teks && !lama.teks ? { teks: p.teks } : {}),
        },
      });
    } else {
      simpan = await this.prisma.waPesan.create({ data: isi });
      await this.perbaruiChat(chat.id_chat, { tipe: p.tipe, teks: p.teks, media_nama: m?.nama_file, waktu, masuk: !p.dari_saya, dari_saya: p.dari_saya, riwayat: !!p.riwayat });
    }

    // Media diunduh di belakang supaya webhook cepat dibalas
    if (m?.file && !simpan.media_path) void this.ambilMedia(kode, chat.id_chat, simpan.id_pesan, m.file);
    if (siarkan) await this.siarkanPesan(chat.id_chat, simpan.id_pesan);
    return simpan;
  }

  private async perbaruiChat(id_chat: number, x: { tipe: string; teks?: string | null; media_nama?: string | null; waktu: Date; masuk: boolean; dari_saya: boolean; riwayat: boolean }) {
    const chat = await this.prisma.waChat.findUnique({ where: { id_chat } });
    if (!chat) return;
    const lebihBaru = !chat.waktu_terakhir || x.waktu >= chat.waktu_terakhir;
    await this.prisma.waChat.update({
      where: { id_chat },
      data: {
        ...(lebihBaru ? { pesan_terakhir: ringkas(x), waktu_terakhir: x.waktu } : {}),
        // Pesan baru dari pelanggan: tambah belum dibaca & buka lagi chat yang sudah selesai
        ...(x.masuk && !x.riwayat ? { belum_dibaca: { increment: 1 }, ...(chat.status === 'Selesai' ? { status: 'Terbuka' } : {}) } : {}),
        // Dibalas dari HP / ERP → sudah dibaca
        ...(x.dari_saya && !x.riwayat ? { belum_dibaca: 0 } : {}),
      },
    });
  }

  private async ambilMedia(kode: string, id_chat: number, id_pesan: number, file: string): Promise<boolean> {
    try {
      const buf = await this.gw.media(kode, file);
      const rel = join(kode, file);
      await fsp.mkdir(join(this.dirMedia, kode), { recursive: true });
      await fsp.writeFile(join(this.dirMedia, rel), buf);
      await this.prisma.waPesan.update({ where: { id_pesan }, data: { media_path: rel } });
      await this.siarkanPesan(id_chat, id_pesan);
      return true;
    } catch (e: any) {
      this.logger.warn(`Gagal mengambil media ${file}: ${e?.message}`);
      return false;
    }
  }

  /** Minta gateway mengunduh ulang media yang gagal/terlewat, lalu salin ke ERP */
  async unduhUlangMedia(id_pesan: number) {
    const p = await this.prisma.waPesan.findUnique({ where: { id_pesan }, include: { chat: { include: { akun: true } } } });
    if (!p) throw new NotFoundException('Pesan tidak ditemukan');
    if (!p.media_jenis) throw new BadRequestException('Pesan ini tidak berisi media');
    if (!p.media_path) {
      const { file } = await this.gw.unduhUlang(p.chat.akun.kode, p.wa_id);
      if (!(await this.ambilMedia(p.chat.akun.kode, p.id_chat, id_pesan, file))) {
        throw new BadRequestException('Media terunduh di gateway tetapi gagal disalin ke ERP');
      }
    }
    const baru = await this.prisma.waPesan.findUnique({ where: { id_pesan } });
    return this.formatPesan(baru);
  }

  private async siarkanPesan(id_chat: number, id_pesan: number) {
    const [pesan, chat] = await Promise.all([
      this.prisma.waPesan.findUnique({ where: { id_pesan } }),
      this.prisma.waChat.findUnique({ where: { id_chat } }),
    ]);
    if (!pesan || !chat) return;
    const [c] = await this.formatChat([chat]);
    this.rt.siarkan({ tipe: 'pesan', id_chat, pesan: await this.formatPesan(pesan), chat: c });
  }

  // ── Format untuk API ─────────────────────────────────────────────────────────
  private async formatChat(chats: any[]) {
    if (!chats.length) return [];
    const staf = await this.staf();
    const kontak = await this.prisma.waKontak.findMany({
      where: { OR: chats.filter((c) => !c.is_grup).map((c) => ({ id_akun: c.id_akun, jid: c.jid })) },
    });
    const kByJid = new Map(kontak.map((k) => [`${k.id_akun}|${k.jid}`, k]));
    return chats.map((c) => {
      const k = c.is_grup ? null : kByJid.get(`${c.id_akun}|${c.jid}`);
      const nomor = nomorDariJid(c.jid);
      return {
        id_chat: c.id_chat,
        jid: c.jid,
        nomor,
        is_grup: c.is_grup,
        nama: c.is_grup ? c.nama || 'Grup' : k?.nama_kustom || k?.nama_simpan || k?.nama_erp || k?.nama_wa || c.nama || (nomor ? `+${nomor}` : c.jid.split('@')[0]),
        nama_wa: k?.nama_wa ?? null,
        erp: k?.nama_erp ? { nama: k.nama_erp, id_pelanggan: k.id_pelanggan, id_site: k.id_site, id_pic: k.id_pic } : null,
        belum_dibaca: c.belum_dibaca,
        pesan_terakhir: c.pesan_terakhir,
        waktu_terakhir: c.waktu_terakhir,
        status: c.status,
        label: c.label,
        pic: c.id_karyawan_pic ? { id_karyawan: c.id_karyawan_pic, nama: staf.get(c.id_karyawan_pic) ?? '-' } : null,
      };
    });
  }

  private async formatPesan(p: any) {
    const staf = await this.staf();
    return {
      id_pesan: p.id_pesan,
      wa_id: p.wa_id,
      dari_saya: p.dari_saya,
      pengirim_jid: p.pengirim_jid,
      nama_pengirim: p.nama_pengirim,
      tipe: p.tipe,
      teks: p.dihapus ? null : p.teks,
      media: p.media_jenis && !p.dihapus
        ? { jenis: p.media_jenis, mime: p.media_mime, nama: p.media_nama, ukuran: p.media_ukuran, durasi: p.media_durasi, ptt: p.ptt, ada: !!p.media_path }
        : null,
      kutip: p.kutip_id ? { wa_id: p.kutip_id, teks: p.kutip_teks, pengirim_jid: p.kutip_pengirim } : null,
      lokasi: p.lokasi,
      kontak: p.kontak,
      reaksi: p.reaksi,
      status: p.status,
      diedit: p.diedit,
      dihapus: p.dihapus,
      riwayat: p.riwayat,
      waktu: p.waktu,
      staf: p.id_karyawan ? staf.get(p.id_karyawan) ?? null : null,
    };
  }

  // ── API inbox ────────────────────────────────────────────────────────────────
  async daftarAkun() {
    return this.prisma.waAkun.findMany({ orderBy: { id_akun: 'asc' } });
  }

  async koneksi(kode: string) {
    const [db, live] = await Promise.all([
      this.prisma.waAkun.findUnique({ where: { kode } }),
      this.gw.status(kode).catch((e) => ({ status: 'gateway-mati', error: e?.message })),
    ]);
    return { akun: db, live };
  }

  async daftarChat(id_karyawan: number, q: { akun?: string; filter?: string; q?: string; halaman?: number }) {
    const id_akun = await this.idAkun(q.akun || 'helpdesk');
    const filter = q.filter || 'semua';
    const where: Prisma.WaChatWhereInput = { id_akun, waktu_terakhir: { not: null } };
    if (filter === 'saya') Object.assign(where, { id_karyawan_pic: id_karyawan, status: 'Terbuka' });
    else if (filter === 'belum') Object.assign(where, { id_karyawan_pic: null, status: 'Terbuka', is_grup: false });
    else if (filter === 'grup') Object.assign(where, { is_grup: true });
    else if (filter === 'selesai') Object.assign(where, { status: 'Selesai' });
    else Object.assign(where, { status: 'Terbuka' });

    const kata = q.q?.trim();
    if (kata) {
      const kontak = await this.prisma.waKontak.findMany({
        where: { id_akun, OR: [{ nama_wa: { contains: kata } }, { nama_simpan: { contains: kata } }, { nama_kustom: { contains: kata } }, { nama_erp: { contains: kata } }, { nomor: { contains: kata.replace(/\D/g, '') || kata } }] },
        select: { jid: true },
        take: 200,
      });
      where.OR = [{ nama: { contains: kata } }, { jid: { contains: kata.replace(/\D/g, '') || kata } }, { jid: { in: kontak.map((k) => k.jid) } }];
    }
    const halaman = q.halaman || 1;
    const [rows, total, belum] = await Promise.all([
      this.prisma.waChat.findMany({ where, orderBy: { waktu_terakhir: 'desc' }, skip: (halaman - 1) * PER_HALAMAN, take: PER_HALAMAN }),
      this.prisma.waChat.count({ where }),
      this.hitungFilter(id_akun, id_karyawan),
    ]);
    return { data: await this.formatChat(rows), meta: { total, halaman, per_halaman: PER_HALAMAN, hitung: belum } };
  }

  private async hitungFilter(id_akun: number, id_karyawan: number) {
    const [saya, belum, grup] = await Promise.all([
      this.prisma.waChat.count({ where: { id_akun, id_karyawan_pic: id_karyawan, status: 'Terbuka', belum_dibaca: { gt: 0 } } }),
      this.prisma.waChat.count({ where: { id_akun, id_karyawan_pic: null, status: 'Terbuka', is_grup: false, waktu_terakhir: { not: null } } }),
      this.prisma.waChat.count({ where: { id_akun, is_grup: true, belum_dibaca: { gt: 0 } } }),
    ]);
    return { saya, belum, grup };
  }

  async detailChat(id_chat: number) {
    const chat = await this.prisma.waChat.findUnique({ where: { id_chat } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');
    const [c] = await this.formatChat([chat]);
    return c;
  }

  async daftarPesan(id_chat: number, sebelum?: number, limit = 50) {
    const rows = await this.prisma.waPesan.findMany({
      where: { id_chat, ...(sebelum ? { id_pesan: { lt: sebelum } } : {}) },
      orderBy: [{ waktu: 'desc' }, { id_pesan: 'desc' }],
      take: Math.min(limit, 100),
    });
    const data = [];
    for (const r of rows.reverse()) data.push(await this.formatPesan(r));
    return { data, meta: { ada_lagi: rows.length === Math.min(limit, 100) } };
  }

  async kirim(id_chat: number, id_karyawan: number, dto: { teks?: string; kutip_id?: number; ptt?: string; ttd?: string }, file?: FileUnggah) {
    const chat = await this.prisma.waChat.findUnique({ where: { id_chat }, include: { akun: true } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');
    if (!file && !dto.teks?.trim()) throw new BadRequestException('Pesan kosong');

    let jenis: string | null = null;
    if (file) {
      const mime = file.mimetype || 'application/octet-stream';
      jenis = mime.startsWith('image/') && mime !== 'image/svg+xml' ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document';
    }
    // Tanda tangan *Nama Helpdesk* (nama karyawan yang login) di awal teks / keterangan media.
    // Audio & stiker tidak punya keterangan → tanpa tanda tangan.
    let teks = dto.teks?.trim() || '';
    if (dto.ttd !== 'false' && jenis !== 'audio') {
      const nama = (await this.staf()).get(id_karyawan);
      if (nama) teks = teks ? `*${nama}*\n${teks}` : `*${nama}*`;
    }
    const req: GwKirim = { ke: chat.jid, teks: teks || undefined };
    if (file && jenis) {
      req.media = { base64: file.buffer.toString('base64'), mimetype: file.mimetype || 'application/octet-stream', jenis, nama_file: file.originalname, ptt: dto.ptt === 'true' };
    }
    if (dto.kutip_id) {
      const k = await this.prisma.waPesan.findUnique({ where: { id_pesan: dto.kutip_id } });
      if (k && k.id_chat === id_chat) req.kutip = { id: k.wa_id, dari_saya: k.dari_saya, pengirim_jid: k.pengirim_jid, teks: k.teks };
    }

    const hasil = await this.gw.kirim(chat.akun.kode, req);
    if (!hasil) throw new BadRequestException('Pesan tidak terkirim');

    // Salinan file yang dikirim disimpan di ERP (gateway tidak mengunduh ulang media milik sendiri)
    let media_path: string | undefined;
    if (file) {
      const ext = (file.originalname.match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'bin').toLowerCase();
      media_path = join(chat.akun.kode, `${hasil.id.replace(/[^\w.-]/g, '_')}.${ext}`);
      await fsp.mkdir(join(this.dirMedia, chat.akun.kode), { recursive: true });
      await fsp.writeFile(join(this.dirMedia, media_path), file.buffer);
    }
    const p = await this.simpanPesan(chat.id_akun, chat.akun.kode, hasil, true, { id_karyawan, media_path });
    // Chat yang belum ditangani otomatis menjadi milik staf yang membalas
    if (!chat.id_karyawan_pic && !chat.is_grup) {
      await this.prisma.waChat.update({ where: { id_chat }, data: { id_karyawan_pic: id_karyawan } });
      await this.siarkanChat(id_chat);
    }
    return p ? this.formatPesan(p) : null;
  }

  async tandaiDibaca(id_chat: number) {
    const chat = await this.prisma.waChat.findUnique({ where: { id_chat }, include: { akun: true } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');
    if (!chat.belum_dibaca) return { ok: true };
    const masuk = await this.prisma.waPesan.findMany({
      where: { id_chat, dari_saya: false, tipe: { not: 'call' } },
      orderBy: { waktu: 'desc' },
      take: Math.min(chat.belum_dibaca, 50),
      select: { wa_id: true, pengirim_jid: true },
    });
    await this.prisma.waChat.update({ where: { id_chat }, data: { belum_dibaca: 0 } });
    // Centang biru ke pelanggan — kalau gateway gagal, cukup dicatat
    if (masuk.length) {
      await this.gw.baca(chat.akun.kode, chat.jid, masuk.map((m) => ({ id: m.wa_id, pengirim_jid: m.pengirim_jid })))
        .catch((e) => this.logger.warn(`Tandai dibaca gagal: ${e?.message}`));
    }
    await this.siarkanChat(id_chat);
    return { ok: true };
  }

  async alihkan(id_chat: number, id_karyawan: number | null) {
    await this.prisma.waChat.update({ where: { id_chat }, data: { id_karyawan_pic: id_karyawan || null } });
    return this.siarkanChat(id_chat);
  }

  async ubahStatus(id_chat: number, status: 'Terbuka' | 'Selesai') {
    await this.prisma.waChat.update({ where: { id_chat }, data: { status } });
    return this.siarkanChat(id_chat);
  }

  async reaksi(id_pesan: number, emoji: string) {
    const p = await this.prisma.waPesan.findUnique({ where: { id_pesan }, include: { chat: { include: { akun: true } } } });
    if (!p) throw new NotFoundException('Pesan tidak ditemukan');
    await this.gw.reaksi(p.chat.akun.kode, p.chat.jid, { id: p.wa_id, dari_saya: p.dari_saya, pengirim_jid: p.pengirim_jid }, emoji);
    const reaksi = { ...((p.reaksi as Record<string, string>) || {}) };
    if (emoji) reaksi.saya = emoji; else delete reaksi.saya;
    await this.prisma.waPesan.update({ where: { id_pesan }, data: { reaksi } });
    await this.siarkanPesan(p.id_chat, id_pesan);
    return { ok: true };
  }

  private async siarkanChat(id_chat: number) {
    const c = await this.detailChat(id_chat);
    this.rt.siarkan({ tipe: 'chat', chat: c });
    return c;
  }

  async fileMedia(id_pesan: number) {
    const p = await this.prisma.waPesan.findUnique({ where: { id_pesan } });
    if (!p?.media_path) throw new NotFoundException('Media belum tersedia');
    const full = join(this.dirMedia, p.media_path);
    if (!full.startsWith(this.dirMedia)) throw new NotFoundException('Media tidak valid');
    return { path: full, mime: p.media_mime || 'application/octet-stream', nama: p.media_nama || p.media_path.split('/').pop()! };
  }

  /** Staf yang bisa menangani chat: user aktif dengan akses modul whatsapp (atau semua modul) */
  async daftarStaf() {
    const users = await this.prisma.coreUser.findMany({
      where: { is_aktif: true },
      select: { id_karyawan: true, modul_akses: true, karyawan: { select: { nama_lengkap: true } } },
    });
    return users
      .filter((u) => {
        let m: string[] = [];
        try { m = u.modul_akses ? JSON.parse(u.modul_akses) : []; } catch { m = []; }
        return m.includes('whatsapp');
      })
      .map((u) => ({ id_karyawan: u.id_karyawan, nama: u.karyawan.nama_lengkap }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }

  // ── Profil ───────────────────────────────────────────────────────────────────
  private async gilirFoto<T>(fn: () => Promise<T>): Promise<T> {
    if (this.fotoJalan >= 3) await new Promise<void>((r) => this.fotoAntre.push(r));
    this.fotoJalan++;
    try { return await fn(); } finally {
      this.fotoJalan--;
      this.fotoAntre.shift()?.();
    }
  }

  /**
   * Foto profil WhatsApp chat (disimpan 24 jam di folder privat supaya tidak terus bertanya ke WhatsApp).
   * Mengembalikan path file, atau null bila tidak ada foto / disembunyikan privasi.
   */
  async fotoProfil(id_chat: number, besar: boolean): Promise<string | null> {
    const chat = await this.prisma.waChat.findUnique({ where: { id_chat }, include: { akun: true } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');
    const dir = join(this.dirMedia, 'foto', chat.akun.kode);
    const dasar = join(dir, `${id_chat}${besar ? '-besar' : ''}`);
    const segar = (f: string) => existsSync(f) && Date.now() - statSync(f).mtimeMs < 24 * 3600_000;
    if (segar(`${dasar}.jpg`)) return `${dasar}.jpg`;
    if (segar(`${dasar}.none`)) return null;

    return this.gilirFoto(async () => {
      let url: string | null;
      try {
        url = await this.gw.foto(chat.akun.kode, chat.jid, besar ? 'image' : 'preview');
      } catch {
        // Gateway/WA bermasalah: pakai foto lama bila ada, jangan tandai "tidak ada foto"
        return existsSync(`${dasar}.jpg`) ? `${dasar}.jpg` : null;
      }
      await fsp.mkdir(dir, { recursive: true });
      if (!url) {
        await fsp.writeFile(`${dasar}.none`, '');
        await fsp.rm(`${dasar}.jpg`, { force: true });
        return null;
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return existsSync(`${dasar}.jpg`) ? `${dasar}.jpg` : null;
      await fsp.writeFile(`${dasar}.jpg`, Buffer.from(await res.arrayBuffer()));
      await fsp.rm(`${dasar}.none`, { force: true });
      return `${dasar}.jpg`;
    });
  }

  /** Info profil: kontak pribadi (tautan ERP) atau grup (deskripsi + anggota) */
  async profil(id_chat: number) {
    const chat = await this.prisma.waChat.findUnique({ where: { id_chat }, include: { akun: true } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');
    const [c] = await this.formatChat([chat]);
    const jumlah_pesan = await this.prisma.waPesan.count({ where: { id_chat } });

    if (!chat.is_grup) {
      const k = await this.prisma.waKontak.findUnique({ where: { id_akun_jid: { id_akun: chat.id_akun, jid: chat.jid } } });
      const [site, pelanggan] = await Promise.all([
        k?.id_site ? this.prisma.sitePelanggan.findUnique({ where: { id_site: k.id_site }, select: { id_site: true, kode_site: true, nama_site: true, kota: true, status_site: true } }) : null,
        k?.id_pelanggan ? this.prisma.pelanggan.findUnique({ where: { id_pelanggan: k.id_pelanggan }, select: { id_pelanggan: true, kode_pelanggan: true, nama_pelanggan: true } }) : null,
      ]);
      return {
        ...c, jumlah_pesan, dibuat: chat.created_at,
        kontak: k ? { nama_wa: k.nama_wa, nama_simpan: k.nama_simpan, nama_kustom: k.nama_kustom, nama_erp: k.nama_erp, lid: k.lid } : null,
        site, pelanggan, grup: null,
      };
    }

    // Grup: anggota dari WhatsApp, nama dicocokkan ke kontak yang sudah dikenal
    let grup: any = null;
    try {
      const g = await this.gw.grup(chat.akun.kode, chat.jid);
      const kontak = await this.prisma.waKontak.findMany({
        where: { id_akun: chat.id_akun, jid: { in: g.peserta.map((p: any) => p.jid) } },
        select: { jid: true, nama_wa: true, nama_simpan: true, nama_kustom: true, nama_erp: true },
      });
      const kByJid = new Map(kontak.map((x) => [x.jid, x]));
      grup = {
        deskripsi: g.deskripsi,
        peserta: g.peserta.map((p: any) => {
          const x = kByJid.get(p.jid);
          const nomor = nomorDariJid(p.jid);
          return { jid: p.jid, nomor, admin: p.admin, nama: x?.nama_kustom || x?.nama_simpan || x?.nama_erp || x?.nama_wa || (nomor ? `+${nomor}` : p.jid.split('@')[0]), erp: x?.nama_erp ?? null };
        }).sort((a: any, b: any) => (b.admin ? 1 : 0) - (a.admin ? 1 : 0) || a.nama.localeCompare(b.nama)),
      };
    } catch (e: any) {
      grup = { error: e?.message || 'Gagal mengambil data grup', deskripsi: null, peserta: [] };
    }
    return { ...c, jumlah_pesan, dibuat: chat.created_at, kontak: null, site: null, pelanggan: null, grup };
  }

  // ── Chat baru & nama kontak ──────────────────────────────────────────────────
  /** Cari tujuan chat baru: kontak WhatsApp, PIC site, dan PIC/pemilik pelanggan di ERP */
  async cariKontak(kode: string, q: string) {
    const kata = (q || '').trim();
    if (kata.length < 2) return [];
    const id_akun = await this.idAkun(kode);
    const angka = kata.replace(/\D/g, '');
    const cariNomor = angka.length >= 4 ? (normalNomor(angka) ?? angka).replace(/^62/, '') : null;
    type Hasil = { nomor: string; nama: string; keterangan: string | null; sumber: 'whatsapp' | 'pic' | 'pelanggan'; id_chat?: number | null };
    const hasil = new Map<string, Hasil>();
    const tambah = (h: Hasil) => { if (!hasil.has(h.nomor)) hasil.set(h.nomor, h); };

    const [kontak, pic, pelanggan] = await Promise.all([
      this.prisma.waKontak.findMany({
        where: {
          id_akun, jid: { endsWith: '@s.whatsapp.net' },
          OR: [
            { nama_kustom: { contains: kata } }, { nama_simpan: { contains: kata } }, { nama_wa: { contains: kata } }, { nama_erp: { contains: kata } },
            ...(cariNomor ? [{ nomor: { contains: cariNomor } }] : []),
          ],
        },
        take: 15,
      }),
      this.prisma.picSite.findMany({
        where: {
          no_kontak: { not: null },
          OR: [
            { nama_pic: { contains: kata } }, { site: { nama_site: { contains: kata } } }, { site: { kode_site: { contains: kata } } },
            ...(cariNomor ? [{ no_kontak: { contains: cariNomor } }] : []),
          ],
        },
        select: { nama_pic: true, jabatan: true, no_kontak: true, site: { select: { nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } } },
        take: 15,
      }),
      this.prisma.pelanggan.findMany({
        where: {
          OR: [
            { nama_pelanggan: { contains: kata } }, { nama_pic_utama: { contains: kata } }, { nama_pic_teknis: { contains: kata } },
            { nama_pic_keuangan: { contains: kata } }, { nama_pemilik: { contains: kata } },
          ],
        },
        select: {
          nama_pelanggan: true, nama_pic_utama: true, no_hp_pic_utama: true, nama_pic_teknis: true, no_ponsel_pic_teknis: true,
          nama_pic_keuangan: true, no_ponsel_pic_keuangan: true, nama_pemilik: true, no_ponsel_pemilik: true,
        },
        take: 8,
      }),
    ]);
    for (const k of kontak) {
      if (!k.nomor) continue;
      tambah({ nomor: k.nomor, nama: k.nama_kustom || k.nama_simpan || k.nama_erp || k.nama_wa || `+${k.nomor}`, keterangan: k.nama_wa ? `~${k.nama_wa}` : null, sumber: 'whatsapp' });
    }
    for (const p of pic) {
      const n = normalNomor(p.no_kontak);
      if (n) tambah({ nomor: n, nama: p.nama_pic, keterangan: [p.jabatan, p.site.nama_site, p.site.pelanggan?.nama_pelanggan].filter(Boolean).join(' · '), sumber: 'pic' });
    }
    for (const p of pelanggan) {
      for (const [nama, no, peran] of [
        [p.nama_pic_utama, p.no_hp_pic_utama, 'PIC utama'], [p.nama_pic_teknis, p.no_ponsel_pic_teknis, 'PIC teknis'],
        [p.nama_pic_keuangan, p.no_ponsel_pic_keuangan, 'PIC keuangan'], [p.nama_pemilik, p.no_ponsel_pemilik, 'Pemilik'],
      ] as const) {
        const n = normalNomor(no);
        if (n) tambah({ nomor: n, nama: nama || p.nama_pelanggan, keterangan: `${peran} · ${p.nama_pelanggan}`, sumber: 'pelanggan' });
      }
    }
    // Tandai yang sudah punya chat
    const list = [...hasil.values()].slice(0, 30);
    const chats = await this.prisma.waChat.findMany({ where: { id_akun, jid: { in: list.map((h) => `${h.nomor}@s.whatsapp.net`) } }, select: { id_chat: true, jid: true } });
    const byJid = new Map(chats.map((c) => [c.jid, c.id_chat]));
    return list.map((h) => ({ ...h, id_chat: byJid.get(`${h.nomor}@s.whatsapp.net`) ?? null }));
  }

  /** Mulai chat baru ke nomor HP (dicek terdaftar di WhatsApp; maks 20 chat baru per jam per akun) */
  async chatBaru(kode: string, id_karyawan: number, nomorMasuk: string, nama?: string) {
    const nomor = normalNomor(nomorMasuk);
    if (!nomor || nomor.length > 15) throw new BadRequestException('Nomor HP tidak valid');
    const id_akun = await this.idAkun(kode);

    const ada = await this.prisma.waChat.findUnique({ where: { id_akun_jid: { id_akun, jid: `${nomor}@s.whatsapp.net` } } });
    if (ada) {
      if (nama?.trim()) await this.simpanNamaKustom(id_akun, ada.jid, nama);
      if (!ada.id_karyawan_pic || ada.status === 'Selesai') {
        await this.prisma.waChat.update({ where: { id_chat: ada.id_chat }, data: { id_karyawan_pic: ada.id_karyawan_pic ?? id_karyawan, status: 'Terbuka', waktu_terakhir: ada.waktu_terakhir ?? new Date() } });
      }
      return this.siarkanChat(ada.id_chat);
    }

    const baru = (this.chatBaruTerakhir.get(id_akun) ?? []).filter((t) => Date.now() - t < 3600_000);
    if (baru.length >= MAKS_CHAT_BARU_PER_JAM) {
      const tunggu = Math.ceil((3600_000 - (Date.now() - baru[0]!)) / 60_000);
      throw new HttpException(`Batas ${MAKS_CHAT_BARU_PER_JAM} chat baru per jam tercapai (pengaman blokir). Coba lagi ±${tunggu} menit.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const cek = await this.gw.cekNomor(kode, nomor);
    if (cek.dibatasi) {
      const sampai = cek.dibatasi.sampai ? new Date(cek.dibatasi.sampai).toLocaleString('id-ID') : 'waktu yang belum diketahui';
      throw new BadRequestException(`WhatsApp sedang membatasi akun ini memulai chat baru (sampai ${sampai}). Balas chat yang masuk saja dulu.`);
    }
    if (!cek.terdaftar || !cek.jid) throw new BadRequestException(`Nomor +${nomor} tidak terdaftar di WhatsApp`);

    // Bisa saja chat sudah ada dengan JID hasil cek (mis. format nomor berbeda)
    const jid = cek.jid;
    let chat = await this.prisma.waChat.findUnique({ where: { id_akun_jid: { id_akun, jid } } });
    if (!chat) {
      chat = await this.prisma.waChat.create({ data: { id_akun, jid, is_grup: false, id_karyawan_pic: id_karyawan, status: 'Terbuka', waktu_terakhir: new Date() } });
      baru.push(Date.now());
      this.chatBaruTerakhir.set(id_akun, baru);
      this.logger.log(`Chat baru ke ${jid} oleh karyawan#${id_karyawan}`);
    }
    await this.simpanKontak(id_akun, jid, null, {});
    if (nama?.trim()) await this.simpanNamaKustom(id_akun, jid, nama);
    return this.siarkanChat(chat.id_chat);
  }

  private async simpanNamaKustom(id_akun: number, jid: string, nama: string | null) {
    const n = nama?.trim().slice(0, 150) || null;
    await this.prisma.waKontak.upsert({
      where: { id_akun_jid: { id_akun, jid } },
      create: { id_akun, jid, nomor: nomorDariJid(jid), nama_kustom: n },
      update: { nama_kustom: n },
    });
  }

  /** Ubah nama kontak versi ERP (kosong = kembali ke nama dari HP / WhatsApp) */
  async ubahNamaKontak(id_chat: number, nama: string | null) {
    const chat = await this.prisma.waChat.findUnique({ where: { id_chat } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');
    if (chat.is_grup) throw new BadRequestException('Nama grup diatur dari WhatsApp');
    await this.simpanNamaKustom(chat.id_akun, chat.jid, nama);
    return this.siarkanChat(id_chat);
  }

  // ── Simpan kontak chat sebagai PIC site ──────────────────────────────────────
  cariSite(q: string) {
    const kata = (q || '').trim();
    if (kata.length < 2) return Promise.resolve([]);
    return this.prisma.sitePelanggan.findMany({
      where: { OR: [{ nama_site: { contains: kata } }, { kode_site: { contains: kata } }, { pelanggan: { nama_pelanggan: { contains: kata } } }] },
      select: { id_site: true, kode_site: true, nama_site: true, kota: true, status_site: true, pelanggan: { select: { nama_pelanggan: true } } },
      orderBy: [{ status_site: 'asc' }, { nama_site: 'asc' }],
      take: 20,
    });
  }

  /** Simpan nomor chat sebagai PIC site (nomor format 08xx seperti data PIC lain); dicatat ke log CRM */
  async simpanPic(id_chat: number, d: { id_site: number; nama_pic: string; jabatan?: string }) {
    const chat = await this.prisma.waChat.findUnique({ where: { id_chat } });
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');
    const nomor = nomorDariJid(chat.jid);
    if (chat.is_grup || !nomor) throw new BadRequestException('Hanya chat pribadi dengan nomor HP yang bisa disimpan sebagai PIC');
    const site = await this.prisma.sitePelanggan.findUnique({ where: { id_site: d.id_site }, select: { id_site: true, nama_site: true } });
    if (!site) throw new NotFoundException('Site tidak ditemukan');
    const nama_pic = d.nama_pic.trim();
    if (!nama_pic) throw new BadRequestException('Nama PIC wajib diisi');
    const no_kontak = '0' + nomor.slice(2);

    // Nomor yang sama di site yang sama → perbarui, bukan dobel
    const semua = await this.prisma.picSite.findMany({ where: { id_site: d.id_site, no_kontak: { not: null } }, select: { id_pic: true, no_kontak: true } });
    const ada = semua.find((p) => normalNomor(p.no_kontak) === nomor);
    const payload = {
      nama_pic, jabatan: d.jabatan?.trim() || null, no_kontak, media_komunikasi: 'WhatsApp', tgl_update_data: new Date(),
    };
    const pic = ada
      ? await this.prisma.picSite.update({ where: { id_pic: ada.id_pic }, data: payload })
      : await this.prisma.picSite.create({ data: { id_site: d.id_site, ...payload } });
    await this.prisma.crmPicLog.create({
      data: { id_pic: pic.id_pic, sumber: 'WhatsApp', data_snapshot: JSON.stringify({ id_site: d.id_site, ...payload }), catatan: `Dari inbox WhatsApp (${ada ? 'diperbarui' : 'ditambahkan'})` },
    });

    // Kontak langsung tertaut ke site ini
    this.indeksNomor = null;
    await this.simpanKontak(chat.id_akun, chat.jid, chat.lid, {});
    await this.siarkanChat(id_chat);
    this.logger.log(`PIC ${ada ? 'diperbarui' : 'ditambahkan'} dari WhatsApp: ${nama_pic} (${no_kontak}) → site#${site.id_site} ${site.nama_site}`);
    return { ...(await this.profil(id_chat)), pesan: `${nama_pic} ${ada ? 'diperbarui' : 'disimpan'} sebagai PIC ${site.nama_site}` };
  }

  // ── Template balasan cepat ───────────────────────────────────────────────────
  daftarTemplate() { return this.prisma.waTemplate.findMany({ orderBy: [{ urutan: 'asc' }, { judul: 'asc' }] }); }
  buatTemplate(d: { judul: string; isi: string; urutan?: number }) { return this.prisma.waTemplate.create({ data: { judul: d.judul, isi: d.isi, urutan: d.urutan ?? 0 } }); }
  ubahTemplate(id: number, d: { judul: string; isi: string; urutan?: number }) { return this.prisma.waTemplate.update({ where: { id_template: id }, data: { judul: d.judul, isi: d.isi, urutan: d.urutan ?? 0 } }); }
  hapusTemplate(id: number) { return this.prisma.waTemplate.delete({ where: { id_template: id } }); }
}
