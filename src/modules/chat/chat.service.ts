import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { FcmService } from '../mobile/fcm.service';
import { WebPushService } from './web-push.service';

/** Berkas chat disimpan di luar folder /uploads (yang publik) — hanya bisa diambil lewat endpoint ber-auth. */
export const CHAT_DIR = process.env.CHAT_DIR || join(process.cwd(), 'storage', 'chat');
const ONLINE_MS = 45_000; // dianggap online bila terakhir aktif < 45 dtk
const MENGETIK_MS = 5_000;
const GAMBAR = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const BOLEH_EXT = new Set([...GAMBAR, 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'zip', 'rar', '7z', 'mp3', 'm4a', 'ogg', 'wav', 'mp4', 'log', 'rsc', 'conf']);
const MIME_GAMBAR: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

export const EMOJI_BOLEH = ['👍', '❤️', '😂', '🎉', '🙏', '👀', '✅', '🔥'];
export const KATEGORI_KUDOS = ['Kerja keras', 'Bantu rekan', 'Cepat tanggap', 'Inovatif', 'Pelayanan terbaik'];
const KANAL_BAWAAN = [
  { slug: 'santai', nama: 'santai', deskripsi: 'Ngobrol santai, meme, cerita lucu' },
  { slug: 'info-kantor', nama: 'info-kantor', deskripsi: 'Pengumuman & info kantor' },
  { slug: 'makan-siang', nama: 'makan-siang', deskripsi: 'Mau makan apa hari ini?' },
];

type Berkas = { buffer: Buffer; originalname: string; mimetype: string; size: number };
type Karyawan = { nama: string; jabatan: string; departemen: string };

/** Chat internal karyawan — pribadi, grup, umum (semua), divisi (per departemen). */
@Injectable()
export class ChatService {
  private readonly logger = new Logger('Chat');
  private ruangUmum: number | null = null;
  private readonly sudahDisiapkan = new Set<number>();

  constructor(private prisma: PrismaService, private fcm: FcmService, private webPush: WebPushService) {}

  // ── Util ─────────────────────────────────────────────────────────────────────
  wajibKaryawanPublik(id: number | undefined | null) { return this.wajibKaryawan(id); }

  private wajibKaryawan(id: number | undefined | null): number {
    if (!id) throw new ForbiddenException('Akun Anda belum terhubung ke data karyawan');
    return id;
  }

  private async daftarNama(ids: number[]) {
    const unik = [...new Set(ids.filter((x) => !!x))];
    const m = new Map<number, Karyawan>();
    if (!unik.length) return m;
    const rows = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: unik } }, select: { id_karyawan: true, nama_lengkap: true, jabatan: true, departemen: true } });
    for (const r of rows) m.set(r.id_karyawan, { nama: r.nama_lengkap.trim(), jabatan: r.jabatan, departemen: r.departemen });
    return m;
  }

  private async anggotaAtau403(id_ruang: number, id_karyawan: number) {
    const a = await this.prisma.chatAnggota.findUnique({ where: { id_ruang_id_karyawan: { id_ruang, id_karyawan } }, include: { ruang: true } });
    if (!a) throw new ForbiddenException('Anda bukan anggota ruang ini');
    return a;
  }

  private async sentuh(id_karyawan: number) {
    const sekarang = new Date();
    await this.prisma.chatStatus.upsert({ where: { id_karyawan }, create: { id_karyawan, terakhir_aktif: sekarang }, update: { terakhir_aktif: sekarang } }).catch(() => null);
  }

  private async idOnline(): Promise<number[]> {
    const rows = await this.prisma.chatStatus.findMany({ where: { terakhir_aktif: { gt: new Date(Date.now() - ONLINE_MS) } }, select: { id_karyawan: true } });
    return rows.map((r) => r.id_karyawan);
  }

  private tulisMention(ids: number[]) { return ids.length ? `,${ids.join(',')},` : null; }
  private bacaMention(s: string | null): number[] { return s ? s.split(',').filter(Boolean).map(Number) : []; }

  private async pesanSistem(id_ruang: number, isi: string) {
    const p = await this.prisma.chatPesan.create({ data: { id_ruang, id_pengirim: null, isi } });
    await this.prisma.chatRuang.update({ where: { id_ruang }, data: { pesan_terakhir_at: p.created_at } });
  }

  /** Ruang "Semua Karyawan" & ruang divisi dibuat otomatis, anggota masuk otomatis saat pertama membuka chat */
  private async siapkanBawaan(id_karyawan: number) {
    if (this.sudahDisiapkan.has(id_karyawan)) return;
    const k = await this.prisma.hrisKaryawan.findUnique({ where: { id_karyawan }, select: { departemen: true } });
    const gabung = async (kunci: string, nama: string) => {
      let r = await this.prisma.chatRuang.findUnique({ where: { kunci } });
      if (!r) r = await this.prisma.chatRuang.create({ data: { tipe: kunci === 'umum' ? 'umum' : 'divisi', nama, kunci } }).catch(() => this.prisma.chatRuang.findUnique({ where: { kunci } }) as any);
      if (!r) return;
      await this.prisma.chatAnggota.create({ data: { id_ruang: r.id_ruang, id_karyawan } }).catch(() => null); // sudah anggota
    };
    await gabung('umum', 'Semua Karyawan');
    const dep = k?.departemen?.trim();
    if (dep) await gabung(`div:${dep.toLowerCase()}`, `Divisi ${dep}`);
    this.sudahDisiapkan.add(id_karyawan);
  }

  /** Belum dibaca per ruang untuk satu karyawan (satu query) */
  private async belumBaca(id_karyawan: number) {
    const rows = await this.prisma.$queryRaw<{ id_ruang: number; n: bigint; m: bigint }[]>`
      SELECT p.id_ruang AS id_ruang, COUNT(*) AS n, SUM(CASE WHEN p.mention LIKE ${`%,${id_karyawan},%`} THEN 1 ELSE 0 END) AS m
      FROM chat_pesan p
      JOIN chat_anggota a ON a.id_ruang = p.id_ruang AND a.id_karyawan = ${id_karyawan}
      WHERE p.id_pesan > a.terakhir_baca_id AND p.dihapus_at IS NULL AND (p.id_pengirim IS NULL OR p.id_pengirim <> ${id_karyawan})
      GROUP BY p.id_ruang`;
    return new Map(rows.map((r) => [r.id_ruang, { belum: Number(r.n), mention: Number(r.m) }]));
  }

  // ── Daftar ruang & ringkasan (polling ringan) ────────────────────────────────
  async daftarRuang(id_karyawan: number) {
    this.wajibKaryawan(id_karyawan);
    await this.siapkanBawaan(id_karyawan);
    await this.sentuh(id_karyawan);
    const saya = await this.prisma.chatAnggota.findMany({ where: { id_karyawan }, include: { ruang: { include: { anggota: { select: { id_karyawan: true } } } } } });
    const belum = await this.belumBaca(id_karyawan);
    const online = new Set(await this.idOnline());
    const terakhir = await Promise.all(saya.map((a) => this.prisma.chatPesan.findFirst({ where: { id_ruang: a.id_ruang }, orderBy: { id_pesan: 'desc' } })));
    const lawan = saya.flatMap((a) => (a.ruang.tipe === 'pribadi' ? a.ruang.anggota.map((x) => x.id_karyawan) : []));
    const nama = await this.daftarNama([...lawan, ...terakhir.map((t) => t?.id_pengirim ?? 0)]);
    const hasil = saya.map((a, i) => {
      const r = a.ruang;
      const t = terakhir[i];
      const idLawan = r.tipe === 'pribadi' ? r.anggota.map((x) => x.id_karyawan).find((x) => x !== id_karyawan) ?? id_karyawan : null;
      const b = belum.get(r.id_ruang);
      return {
        id_ruang: r.id_ruang, tipe: r.tipe,
        nama: idLawan ? (nama.get(idLawan)?.nama ?? 'Karyawan') : (r.nama ?? 'Grup'),
        subjudul: idLawan ? (nama.get(idLawan)?.jabatan ?? '') : `${r.anggota.length} anggota`,
        id_lawan: idLawan, online: idLawan ? online.has(idLawan) : false,
        bisu: a.bisu, belum: b?.belum ?? 0, mention: b?.mention ?? 0,
        terakhir: t ? { id_pesan: t.id_pesan, isi: t.dihapus_at ? 'Pesan dihapus' : t.isi || (t.lampiran_nama ? `📎 ${t.lampiran_nama}` : ''), pengirim: t.id_pengirim ? (nama.get(t.id_pengirim)?.nama.split(' ')[0] ?? '') : '', saya: t.id_pengirim === id_karyawan, waktu: t.created_at } : null,
        urut: (t?.created_at ?? r.created_at).getTime(),
      };
    });
    hasil.sort((x, y) => (x.tipe === 'umum' ? -1 : 0) - (y.tipe === 'umum' ? -1 : 0) || y.urut - x.urut);
    return hasil;
  }

  async ringkasan(id_karyawan: number) {
    this.wajibKaryawan(id_karyawan);
    await this.sentuh(id_karyawan);
    const saya = await this.prisma.chatAnggota.findMany({ where: { id_karyawan }, select: { id_ruang: true, bisu: true } });
    const ids = saya.map((a) => a.id_ruang);
    const [belum, maks, online, mengetik] = await Promise.all([
      this.belumBaca(id_karyawan),
      ids.length ? this.prisma.chatPesan.groupBy({ by: ['id_ruang'], where: { id_ruang: { in: ids } }, _max: { id_pesan: true } }) : Promise.resolve([] as any[]),
      this.idOnline(),
      this.prisma.chatStatus.findMany({ where: { mengetik_ruang: { in: ids.length ? ids : [0] }, mengetik_at: { gt: new Date(Date.now() - MENGETIK_MS) }, id_karyawan: { not: id_karyawan } } }),
    ]);
    const nama = await this.daftarNama(mengetik.map((m) => m.id_karyawan));
    const mp = new Map<number, number>(maks.map((m: any) => [m.id_ruang, m._max.id_pesan ?? 0]));
    const ruang = saya.map((a) => ({ id_ruang: a.id_ruang, terakhir_id: mp.get(a.id_ruang) ?? 0, belum: belum.get(a.id_ruang)?.belum ?? 0, mention: belum.get(a.id_ruang)?.mention ?? 0, bisu: a.bisu }));
    return {
      ruang, online,
      // bisu tidak ikut menambah lencana, kecuali ada yang menyebut nama Anda
      total_belum: ruang.reduce((n, r) => n + (r.bisu ? (r.mention ? r.mention : 0) : r.belum), 0),
      mengetik: mengetik.map((m) => ({ id_ruang: m.mengetik_ruang, id_karyawan: m.id_karyawan, nama: nama.get(m.id_karyawan)?.nama.split(' ')[0] ?? '' })),
    };
  }

  // ── Pesan ────────────────────────────────────────────────────────────────────
  private async bentukPesan(rows: any[], id_karyawan: number) {
    const idBalas = rows.map((r) => r.id_balas).filter(Boolean) as number[];
    const balas = idBalas.length ? await this.prisma.chatPesan.findMany({ where: { id_pesan: { in: idBalas } } }) : [];
    const nama = await this.daftarNama([...rows.map((r) => r.id_pengirim), ...balas.map((b) => b.id_pengirim ?? 0)]);
    const bm = new Map(balas.map((b) => [b.id_pesan, b]));
    const reaksiRows = rows.length ? await this.prisma.chatReaksi.findMany({ where: { id_pesan: { in: rows.map((r) => r.id_pesan) } }, orderBy: { id_reaksi: 'asc' } }) : [];
    const namaReaksi = await this.daftarNama(reaksiRows.map((x) => x.id_karyawan));
    const kartu = await this.petaKartu(rows.map((r) => (r.dihapus_at ? '' : r.isi)));
    return rows.map((r) => {
      const b = r.id_balas ? bm.get(r.id_balas) : null;
      const gambar = !!r.lampiran_nama && GAMBAR.has(extname(r.lampiran_nama).slice(1).toLowerCase());
      return {
        id_pesan: r.id_pesan, id_ruang: r.id_ruang, id_pengirim: r.id_pengirim, pengirim: r.id_pengirim ? (nama.get(r.id_pengirim)?.nama ?? 'Karyawan') : null,
        saya: r.id_pengirim === id_karyawan, sistem: r.id_pengirim === null,
        isi: r.dihapus_at ? '' : r.isi, dihapus: !!r.dihapus_at, diedit: !!r.diedit_at, waktu: r.created_at,
        mention: this.bacaMention(r.mention),
        kartu: r.dihapus_at ? [] : this.kartuDalam(r.isi, kartu),
        reaksi: r.dihapus_at ? [] : this.ringkasReaksi(reaksiRows.filter((x) => x.id_pesan === r.id_pesan), id_karyawan, namaReaksi),
        lampiran: !r.dihapus_at && r.lampiran_file ? { nama: r.lampiran_nama, tipe: r.lampiran_tipe, ukuran: r.lampiran_ukuran, gambar } : null,
        balas: b ? { id_pesan: b.id_pesan, pengirim: b.id_pengirim ? (nama.get(b.id_pengirim)?.nama.split(' ')[0] ?? '') : '', isi: b.dihapus_at ? 'Pesan dihapus' : (b.isi || (b.lampiran_nama ? `📎 ${b.lampiran_nama}` : '')).slice(0, 140) } : null,
      };
    });
  }

  async pesan(id_ruang: number, id_karyawan: number, q: { sebelum?: number; setelah?: number; limit?: number }) {
    const a = await this.anggotaAtau403(id_ruang, id_karyawan);
    await this.sentuh(id_karyawan);
    const limit = Math.min(Math.max(q.limit ?? 40, 1), 100);
    let rows: any[];
    let masihAda = false;
    if (q.setelah) {
      rows = await this.prisma.chatPesan.findMany({ where: { id_ruang, id_pesan: { gt: q.setelah } }, orderBy: { id_pesan: 'asc' }, take: 200 });
    } else {
      rows = await this.prisma.chatPesan.findMany({ where: { id_ruang, ...(q.sebelum ? { id_pesan: { lt: q.sebelum } } : {}) }, orderBy: { id_pesan: 'desc' }, take: limit + 1 });
      masihAda = rows.length > limit;
      rows = rows.slice(0, limit).reverse();
    }
    // Penanda "dibaca" hanya untuk ruang kecil (pribadi & grup ≤ 30)
    const lain = a.ruang.tipe === 'pribadi' || a.ruang.tipe === 'grup'
      ? (await this.prisma.chatAnggota.findMany({ where: { id_ruang, id_karyawan: { not: id_karyawan } }, select: { id_karyawan: true, terakhir_baca_id: true } })).slice(0, 30)
      : [];
    return { pesan: await this.bentukPesan(rows, id_karyawan), masih_ada: masihAda, dibaca: lain, saya_baca: a.terakhir_baca_id };
  }

  async kirim(id_ruang: number, id_karyawan: number, d: { isi?: string; id_balas?: number; mention?: number[] }, berkas?: Berkas) {
    const a = await this.anggotaAtau403(id_ruang, id_karyawan);
    const isi = (d.isi ?? '').replace(/\r\n/g, '\n').trim();
    if (!isi && !berkas) throw new BadRequestException('Pesan kosong');
    if (isi.length > 4000) throw new BadRequestException('Pesan terlalu panjang (maks 4000 karakter)');
    if (d.id_balas) {
      const b = await this.prisma.chatPesan.findUnique({ where: { id_pesan: d.id_balas }, select: { id_ruang: true } });
      if (!b || b.id_ruang !== id_ruang) throw new BadRequestException('Pesan yang dibalas tidak ditemukan');
    }
    let lampiran: { lampiran_file: string; lampiran_nama: string; lampiran_tipe: string; lampiran_ukuran: number } | null = null;
    if (berkas) lampiran = await this.simpanBerkas(berkas);
    const anggota = await this.prisma.chatAnggota.findMany({ where: { id_ruang }, select: { id_karyawan: true } });
    const idAnggota = new Set(anggota.map((x) => x.id_karyawan));
    const mention = [...new Set((d.mention ?? []).filter((x) => idAnggota.has(x) && x !== id_karyawan))];
    const p = await this.prisma.chatPesan.create({ data: { id_ruang, id_pengirim: id_karyawan, isi, id_balas: d.id_balas ?? null, mention: this.tulisMention(mention), ...(lampiran ?? {}) } });
    await this.prisma.chatRuang.update({ where: { id_ruang }, data: { pesan_terakhir_at: p.created_at } });
    await this.prisma.chatAnggota.updateMany({ where: { id_ruang, id_karyawan, terakhir_baca_id: { lt: p.id_pesan } }, data: { terakhir_baca_id: p.id_pesan } });
    await this.prisma.chatStatus.updateMany({ where: { id_karyawan }, data: { mengetik_ruang: null, mengetik_at: null } }).catch(() => null);
    if (mention.length) void this.beriTahuMention(mention, id_karyawan, a.ruang, isi, id_ruang);
    void this.pushPesan(a.ruang, id_karyawan, isi || (lampiran ? `📎 ${lampiran.lampiran_nama}` : ''), mention);
    return (await this.bentukPesan([p], id_karyawan))[0];
  }

  private async beriTahuMention(ids: number[], dari: number, ruang: { tipe: string; nama: string | null }, isi: string, id_ruang: number) {
    try {
      const nama = (await this.daftarNama([dari])).get(dari)?.nama ?? 'Seseorang';
      const users = await this.prisma.coreUser.findMany({ where: { id_karyawan: { in: ids }, is_aktif: true }, select: { id_user: true } });
      if (!users.length) return;
      await this.prisma.notification.createMany({
        data: users.map((u) => ({ id_user: u.id_user, tipe: 'chat_mention', judul: `${nama} menyebut Anda${ruang.tipe === 'pribadi' ? '' : ` di ${ruang.nama ?? 'grup'}`}`, deskripsi: isi.slice(0, 200), url: `/chat/${id_ruang}` })),
      });
    } catch (e: any) { this.logger.warn(`notifikasi mention gagal: ${e?.message}`); }
  }

  private async simpanBerkas(f: Berkas) {
    const ext = extname(f.originalname || '').slice(1).toLowerCase();
    if (!BOLEH_EXT.has(ext)) throw new BadRequestException('Jenis berkas tidak diizinkan');
    if (f.size > 10 * 1024 * 1024) throw new BadRequestException('Ukuran berkas maksimal 10 MB');
    await fs.mkdir(CHAT_DIR, { recursive: true });
    const nama = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(CHAT_DIR, nama), f.buffer);
    const aman = (f.originalname || `berkas.${ext}`).replace(/[\r\n"\\/]/g, '_').slice(0, 200);
    return { lampiran_file: nama, lampiran_nama: aman, lampiran_tipe: MIME_GAMBAR[ext] ?? 'application/octet-stream', lampiran_ukuran: f.size };
  }

  async berkas(id_pesan: number, id_karyawan: number) {
    const p = await this.prisma.chatPesan.findUnique({ where: { id_pesan } });
    if (!p || !p.lampiran_file || p.dihapus_at) throw new NotFoundException('Berkas tidak ditemukan');
    await this.anggotaAtau403(p.id_ruang, id_karyawan);
    const ext = extname(p.lampiran_file).slice(1).toLowerCase();
    return { path: join(CHAT_DIR, p.lampiran_file), nama: p.lampiran_nama ?? p.lampiran_file, tipe: MIME_GAMBAR[ext] ?? 'application/octet-stream', gambar: GAMBAR.has(ext) };
  }

  async ubahPesan(id_pesan: number, id_karyawan: number, isi: string) {
    const p = await this.prisma.chatPesan.findUnique({ where: { id_pesan } });
    if (!p || p.dihapus_at) throw new NotFoundException('Pesan tidak ditemukan');
    if (p.id_pengirim !== id_karyawan) throw new ForbiddenException('Hanya pengirim yang bisa mengubah pesan');
    const baru = isi.trim();
    if (!baru && !p.lampiran_file) throw new BadRequestException('Pesan kosong');
    const u = await this.prisma.chatPesan.update({ where: { id_pesan }, data: { isi: baru, diedit_at: new Date() } });
    return (await this.bentukPesan([u], id_karyawan))[0];
  }

  async hapusPesan(id_pesan: number, id_karyawan: number) {
    const p = await this.prisma.chatPesan.findUnique({ where: { id_pesan } });
    if (!p || p.dihapus_at) throw new NotFoundException('Pesan tidak ditemukan');
    const a = await this.anggotaAtau403(p.id_ruang, id_karyawan);
    if (p.id_pengirim !== id_karyawan && a.peran !== 'admin') throw new ForbiddenException('Hanya pengirim atau admin grup yang bisa menghapus');
    await this.prisma.chatPesan.update({ where: { id_pesan }, data: { dihapus_at: new Date(), isi: '', mention: null } });
    if (p.lampiran_file) await fs.unlink(join(CHAT_DIR, p.lampiran_file)).catch(() => null);
    return true;
  }

  async baca(id_ruang: number, id_karyawan: number, id_pesan: number) {
    await this.anggotaAtau403(id_ruang, id_karyawan);
    await this.prisma.chatAnggota.updateMany({ where: { id_ruang, id_karyawan, terakhir_baca_id: { lt: id_pesan } }, data: { terakhir_baca_id: id_pesan } });
    return true;
  }

  async mengetik(id_ruang: number, id_karyawan: number) {
    await this.anggotaAtau403(id_ruang, id_karyawan);
    const sekarang = new Date();
    await this.prisma.chatStatus.upsert({ where: { id_karyawan }, create: { id_karyawan, terakhir_aktif: sekarang, mengetik_ruang: id_ruang, mengetik_at: sekarang }, update: { terakhir_aktif: sekarang, mengetik_ruang: id_ruang, mengetik_at: sekarang } });
    return true;
  }

  async setBisu(id_ruang: number, id_karyawan: number, bisu: boolean) {
    await this.anggotaAtau403(id_ruang, id_karyawan);
    await this.prisma.chatAnggota.update({ where: { id_ruang_id_karyawan: { id_ruang, id_karyawan } }, data: { bisu } });
    return true;
  }

  // ── Membuat ruang ────────────────────────────────────────────────────────────
  async buatPribadi(id_karyawan: number, lawan: number) {
    this.wajibKaryawan(id_karyawan);
    if (lawan === id_karyawan) throw new BadRequestException('Tidak bisa chat dengan diri sendiri');
    const k = await this.prisma.hrisKaryawan.findUnique({ where: { id_karyawan: lawan }, select: { status_aktif: true } });
    if (!k || !k.status_aktif) throw new NotFoundException('Karyawan tidak ditemukan / tidak aktif');
    const kunci = `${Math.min(id_karyawan, lawan)}-${Math.max(id_karyawan, lawan)}`;
    let r = await this.prisma.chatRuang.findUnique({ where: { kunci } });
    if (!r) {
      try {
        r = await this.prisma.chatRuang.create({ data: { tipe: 'pribadi', kunci, id_pembuat: id_karyawan, anggota: { create: [{ id_karyawan }, { id_karyawan: lawan }] } } });
      } catch { r = await this.prisma.chatRuang.findUnique({ where: { kunci } }); }
    }
    return { id_ruang: r!.id_ruang };
  }

  async buatGrup(id_karyawan: number, d: { nama: string; anggota: number[] }) {
    this.wajibKaryawan(id_karyawan);
    const aktif = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: d.anggota }, status_aktif: true }, select: { id_karyawan: true } });
    const ids = [...new Set(aktif.map((x) => x.id_karyawan).filter((x) => x !== id_karyawan))];
    if (!ids.length) throw new BadRequestException('Pilih minimal satu anggota lain');
    const r = await this.prisma.chatRuang.create({
      data: { tipe: 'grup', nama: d.nama.trim(), id_pembuat: id_karyawan, anggota: { create: [{ id_karyawan, peran: 'admin' }, ...ids.map((id) => ({ id_karyawan: id }))] } },
    });
    const nama = (await this.daftarNama([id_karyawan])).get(id_karyawan)?.nama ?? 'Seseorang';
    await this.pesanSistem(r.id_ruang, `${nama} membuat grup "${r.nama}"`);
    return { id_ruang: r.id_ruang };
  }

  async detailRuang(id_ruang: number, id_karyawan: number) {
    const a = await this.anggotaAtau403(id_ruang, id_karyawan);
    const anggota = await this.prisma.chatAnggota.findMany({ where: { id_ruang }, select: { id_karyawan: true, peran: true } });
    const nama = await this.daftarNama(anggota.map((x) => x.id_karyawan));
    const online = new Set(await this.idOnline());
    return {
      id_ruang, tipe: a.ruang.tipe, nama: a.ruang.nama, bisu: a.bisu, url: this.urlDiskusi(a.ruang.kunci), admin: a.peran === 'admin' && (a.ruang.tipe === 'grup'),
      anggota: anggota.map((x) => ({ id_karyawan: x.id_karyawan, nama: nama.get(x.id_karyawan)?.nama ?? 'Karyawan', jabatan: nama.get(x.id_karyawan)?.jabatan ?? '', peran: x.peran, online: online.has(x.id_karyawan) }))
        .sort((p, q) => (p.peran === 'admin' ? -1 : 0) - (q.peran === 'admin' ? -1 : 0) || p.nama.localeCompare(q.nama)),
    };
  }

  private async adminGrup(id_ruang: number, id_karyawan: number) {
    const a = await this.anggotaAtau403(id_ruang, id_karyawan);
    if (a.ruang.tipe !== 'grup') throw new BadRequestException('Hanya berlaku untuk grup buatan');
    if (a.peran !== 'admin') throw new ForbiddenException('Hanya admin grup yang bisa melakukan ini');
    return a;
  }

  async ubahNama(id_ruang: number, id_karyawan: number, nama: string) {
    await this.adminGrup(id_ruang, id_karyawan);
    await this.prisma.chatRuang.update({ where: { id_ruang }, data: { nama: nama.trim() } });
    await this.pesanSistem(id_ruang, `Nama grup diubah menjadi "${nama.trim()}"`);
    return true;
  }

  async tambahAnggota(id_ruang: number, id_karyawan: number, ids: number[]) {
    await this.adminGrup(id_ruang, id_karyawan);
    const aktif = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: ids }, status_aktif: true }, select: { id_karyawan: true } });
    const ada = new Set((await this.prisma.chatAnggota.findMany({ where: { id_ruang }, select: { id_karyawan: true } })).map((x) => x.id_karyawan));
    const baru = aktif.map((x) => x.id_karyawan).filter((x) => !ada.has(x));
    if (!baru.length) throw new BadRequestException('Semua sudah menjadi anggota');
    await this.prisma.chatAnggota.createMany({ data: baru.map((id) => ({ id_ruang, id_karyawan: id })), skipDuplicates: true });
    const nama = await this.daftarNama([id_karyawan, ...baru]);
    await this.pesanSistem(id_ruang, `${nama.get(id_karyawan)?.nama ?? 'Admin'} menambahkan ${baru.map((x) => nama.get(x)?.nama.split(' ')[0] ?? 'anggota').join(', ')}`);
    return true;
  }

  /** Keluarkan anggota (admin) atau keluar sendiri */
  async keluarkan(id_ruang: number, id_karyawan: number, target: number) {
    const a = await this.anggotaAtau403(id_ruang, id_karyawan);
    if (a.ruang.tipe !== 'grup') throw new BadRequestException('Hanya berlaku untuk grup buatan');
    if (target !== id_karyawan && a.peran !== 'admin') throw new ForbiddenException('Hanya admin grup yang bisa mengeluarkan anggota');
    const t = await this.prisma.chatAnggota.findUnique({ where: { id_ruang_id_karyawan: { id_ruang, id_karyawan: target } } });
    if (!t) throw new NotFoundException('Bukan anggota grup ini');
    await this.prisma.chatAnggota.delete({ where: { id_anggota: t.id_anggota } });
    const sisa = await this.prisma.chatAnggota.findMany({ where: { id_ruang }, orderBy: { id_anggota: 'asc' } });
    if (!sisa.length) { await this.prisma.chatRuang.delete({ where: { id_ruang } }); return true; }
    if (t.peran === 'admin' && !sisa.some((x) => x.peran === 'admin')) await this.prisma.chatAnggota.update({ where: { id_anggota: sisa[0]!.id_anggota }, data: { peran: 'admin' } });
    const nama = await this.daftarNama([id_karyawan, target]);
    await this.pesanSistem(id_ruang, target === id_karyawan ? `${nama.get(target)?.nama ?? 'Anggota'} keluar dari grup` : `${nama.get(id_karyawan)?.nama ?? 'Admin'} mengeluarkan ${nama.get(target)?.nama ?? 'anggota'}`);
    return true;
  }

  // ── Push ke aplikasi mobile (FCM) ────────────────────────────────────────────
  /**
   * Pribadi/grup/diskusi: semua anggota; ruang besar (umum/divisi/kanal): hanya yang disebut.
   * Dilewati bila penerima sedang online di ERP (sudah lihat lencana), atau ruang dibisukan (kecuali disebut).
   */
  private async pushPesan(ruang: { id_ruang: number; tipe: string; nama: string | null }, dari: number, isi: string, mention: number[]) {
    try {
      const besar = ['umum', 'divisi', 'kanal'].includes(ruang.tipe);
      const anggota = await this.prisma.chatAnggota.findMany({ where: { id_ruang: ruang.id_ruang, id_karyawan: { not: dari } }, select: { id_karyawan: true, bisu: true } });
      const sebut = new Set(mention);
      const sasaran = anggota.filter((a) => (besar ? sebut.has(a.id_karyawan) : !a.bisu || sebut.has(a.id_karyawan))).map((a) => a.id_karyawan);
      if (!sasaran.length) return;
      const nama = (await this.daftarNama([dari])).get(dari)?.nama ?? 'Seseorang';
      const judul = ruang.tipe === 'pribadi' ? nama : `${nama} · ${ruang.nama ?? 'Grup'}`;
      // Browser: selalu dikirim (service worker menahan bila jendela ERP sedang tampil di depan)
      void this.webPush.kirim(sasaran, { judul, isi: isi.slice(0, 140), url: `/chat/${ruang.id_ruang}`, tag: `chat-${ruang.id_ruang}` });
      const online = new Set(await this.idOnline());
      const users = await this.prisma.coreUser.findMany({ where: { id_karyawan: { in: sasaran.filter((x) => !online.has(x)) }, is_aktif: true, fcm_token: { not: null } }, select: { id_karyawan: true, fcm_token: true } });
      if (!users.length) return;
      await Promise.all(users.map((u) => this.fcm.sendToToken(u.fcm_token!, judul, isi.slice(0, 140), { type: 'chat', id_ruang: String(ruang.id_ruang) })));
    } catch (e: any) { this.logger.warn(`push chat gagal: ${e?.message}`); }
  }

  // ── Kudos ────────────────────────────────────────────────────────────────────
  async beriKudos(id_karyawan: number, d: { id_untuk: number; kategori: string; pesan: string }) {
    this.wajibKaryawan(id_karyawan);
    if (d.id_untuk === id_karyawan) throw new BadRequestException('Kudos tidak bisa untuk diri sendiri');
    if (!KATEGORI_KUDOS.includes(d.kategori)) throw new BadRequestException('Kategori kudos tidak valid');
    const pesan = d.pesan.trim();
    if (pesan.length < 3) throw new BadRequestException('Tulis alasan kudos (min. 3 karakter)');
    const untuk = await this.prisma.hrisKaryawan.findUnique({ where: { id_karyawan: d.id_untuk }, select: { status_aktif: true } });
    if (!untuk || !untuk.status_aktif) throw new NotFoundException('Karyawan tidak ditemukan / tidak aktif');
    const awalHari = new Date(Date.now() + 7 * 3600_000); awalHari.setUTCHours(0, 0, 0, 0);
    const hariIni = await this.prisma.chatKudos.count({ where: { id_dari: id_karyawan, created_at: { gte: new Date(awalHari.getTime() - 7 * 3600_000) } } });
    if (hariIni >= 5) throw new BadRequestException('Batas 5 kudos per hari sudah tercapai — besok lagi ya');
    await this.prisma.chatKudos.create({ data: { id_dari: id_karyawan, id_untuk: d.id_untuk, kategori: d.kategori, pesan } });
    // Umumkan di ruang "Semua Karyawan" (pemberi otomatis sudah anggota), penerima di-mention
    await this.siapkanBawaan(id_karyawan);
    const umum = await this.prisma.chatRuang.findUnique({ where: { kunci: 'umum' } });
    if (umum) {
      const nama = (await this.daftarNama([d.id_untuk])).get(d.id_untuk)?.nama ?? 'rekan';
      const p = await this.prisma.chatPesan.create({ data: { id_ruang: umum.id_ruang, id_pengirim: id_karyawan, isi: `🌟 Kudos untuk @${nama} · ${d.kategori}\n"${pesan}"`, mention: this.tulisMention([d.id_untuk]) } });
      await this.prisma.chatRuang.update({ where: { id_ruang: umum.id_ruang }, data: { pesan_terakhir_at: p.created_at } });
      await this.prisma.chatAnggota.updateMany({ where: { id_ruang: umum.id_ruang, id_karyawan, terakhir_baca_id: { lt: p.id_pesan } }, data: { terakhir_baca_id: p.id_pesan } });
      void this.beriTahuMention([d.id_untuk], id_karyawan, { tipe: 'umum', nama: 'Semua Karyawan' }, `🌟 Kudos · ${d.kategori}: ${pesan}`, umum.id_ruang);
      void this.pushPesan({ id_ruang: umum.id_ruang, tipe: 'umum', nama: 'Semua Karyawan' }, id_karyawan, `🌟 Kudos untuk Anda · ${d.kategori}: ${pesan}`, [d.id_untuk]);
    }
    return { sisa: 4 - hariIni, id_ruang: umum?.id_ruang ?? null };
  }

  async papanKudos(id_karyawan: number) {
    this.wajibKaryawan(id_karyawan);
    const awalBulan = new Date(Date.now() + 7 * 3600_000); awalBulan.setUTCDate(1); awalBulan.setUTCHours(0, 0, 0, 0);
    const sejak = new Date(awalBulan.getTime() - 7 * 3600_000);
    const [top, terbaru, sayaDapat] = await Promise.all([
      this.prisma.chatKudos.groupBy({ by: ['id_untuk'], where: { created_at: { gte: sejak } }, _count: { _all: true }, orderBy: { _count: { id_untuk: 'desc' } }, take: 5 }),
      this.prisma.chatKudos.findMany({ orderBy: { id_kudos: 'desc' }, take: 10 }),
      this.prisma.chatKudos.count({ where: { id_untuk: id_karyawan, created_at: { gte: sejak } } }),
    ]);
    const nama = await this.daftarNama([...top.map((t) => t.id_untuk), ...terbaru.flatMap((k) => [k.id_dari, k.id_untuk])]);
    return {
      kategori: KATEGORI_KUDOS, saya_bulan_ini: sayaDapat,
      papan: top.map((t, i) => ({ peringkat: i + 1, id_karyawan: t.id_untuk, nama: nama.get(t.id_untuk)?.nama ?? 'Karyawan', jumlah: t._count._all })),
      terbaru: terbaru.map((k) => ({ id_kudos: k.id_kudos, dari: nama.get(k.id_dari)?.nama ?? 'Karyawan', untuk: nama.get(k.id_untuk)?.nama ?? 'Karyawan', kategori: k.kategori, pesan: k.pesan, waktu: k.created_at })),
    };
  }

  // ── Reaksi emoji ─────────────────────────────────────────────────────────────
  private ringkasReaksi(rows: { emoji: string; id_karyawan: number }[], saya: number, nama: Map<number, Karyawan>) {
    const per = new Map<string, number[]>();
    for (const x of rows) per.set(x.emoji, [...(per.get(x.emoji) ?? []), x.id_karyawan]);
    return [...per.entries()].map(([emoji, ids]) => ({ emoji, jumlah: ids.length, saya: ids.includes(saya), oleh: ids.slice(0, 8).map((i) => nama.get(i)?.nama.split(' ')[0] ?? '') }));
  }

  /** Beri / cabut reaksi (toggle). Hanya anggota ruang. */
  async reaksi(id_pesan: number, id_karyawan: number, emoji: string) {
    if (!EMOJI_BOLEH.includes(emoji)) throw new BadRequestException('Emoji tidak tersedia');
    const p = await this.prisma.chatPesan.findUnique({ where: { id_pesan }, select: { id_ruang: true, dihapus_at: true } });
    if (!p || p.dihapus_at) throw new NotFoundException('Pesan tidak ditemukan');
    await this.anggotaAtau403(p.id_ruang, id_karyawan);
    const ada = await this.prisma.chatReaksi.findUnique({ where: { id_pesan_id_karyawan_emoji: { id_pesan, id_karyawan, emoji } } });
    if (ada) await this.prisma.chatReaksi.delete({ where: { id_reaksi: ada.id_reaksi } });
    else await this.prisma.chatReaksi.create({ data: { id_pesan, id_karyawan, emoji } }).catch(() => null);
    const rows = await this.prisma.chatReaksi.findMany({ where: { id_pesan }, orderBy: { id_reaksi: 'asc' } });
    return this.ringkasReaksi(rows, id_karyawan, await this.daftarNama(rows.map((x) => x.id_karyawan)));
  }

  // ── Kanal santai (opt-in) ────────────────────────────────────────────────────
  private async pastikanKanalBawaan() {
    for (const k of KANAL_BAWAAN) {
      const kunci = `kanal:${k.slug}`;
      if (!(await this.prisma.chatRuang.findUnique({ where: { kunci }, select: { id_ruang: true } }))) {
        await this.prisma.chatRuang.create({ data: { tipe: 'kanal', nama: k.nama, kunci } }).catch(() => null);
      }
    }
  }

  async daftarKanal(id_karyawan: number) {
    this.wajibKaryawan(id_karyawan);
    await this.pastikanKanalBawaan();
    const kanal = await this.prisma.chatRuang.findMany({ where: { tipe: 'kanal' }, include: { anggota: { select: { id_karyawan: true } } }, orderBy: { nama: 'asc' } });
    return kanal.map((k) => ({
      id_ruang: k.id_ruang, nama: k.nama, jumlah: k.anggota.length, gabung: k.anggota.some((a) => a.id_karyawan === id_karyawan),
      deskripsi: KANAL_BAWAAN.find((b) => `kanal:${b.slug}` === k.kunci)?.deskripsi ?? '',
    }));
  }

  async buatKanal(id_karyawan: number, nama: string) {
    this.wajibKaryawan(id_karyawan);
    const slug = nama.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (slug.length < 2) throw new BadRequestException('Nama kanal tidak valid (gunakan huruf/angka)');
    const kunci = `kanal:${slug}`;
    let r = await this.prisma.chatRuang.findUnique({ where: { kunci } });
    if (!r) r = await this.prisma.chatRuang.create({ data: { tipe: 'kanal', nama: slug, kunci, id_pembuat: id_karyawan } }).catch(() => this.prisma.chatRuang.findUnique({ where: { kunci } }) as any);
    await this.prisma.chatAnggota.createMany({ data: [{ id_ruang: r!.id_ruang, id_karyawan }], skipDuplicates: true });
    return { id_ruang: r!.id_ruang };
  }

  async gabungKanal(id_ruang: number, id_karyawan: number) {
    this.wajibKaryawan(id_karyawan);
    const r = await this.prisma.chatRuang.findUnique({ where: { id_ruang }, select: { tipe: true } });
    if (!r || r.tipe !== 'kanal') throw new NotFoundException('Kanal tidak ditemukan');
    await this.prisma.chatAnggota.createMany({ data: [{ id_ruang, id_karyawan }], skipDuplicates: true });
    return { id_ruang };
  }

  async keluarKanal(id_ruang: number, id_karyawan: number) {
    const a = await this.anggotaAtau403(id_ruang, id_karyawan);
    if (a.ruang.tipe !== 'kanal') throw new BadRequestException('Hanya berlaku untuk kanal');
    await this.prisma.chatAnggota.delete({ where: { id_anggota: a.id_anggota } });
    return true;
  }

  // ── Ulang tahun otomatis (07:00 WIB = 00:00 UTC) ─────────────────────────────
  @Cron('0 0 * * *')
  async ucapkanUlangTahun() {
    try {
      const wib = new Date(Date.now() + 7 * 3600_000);
      const bln = wib.getUTCMonth() + 1; const tgl = wib.getUTCDate();
      const rows = await this.prisma.$queryRaw<{ id_karyawan: number; nama_lengkap: string }[]>`
        SELECT id_karyawan, nama_lengkap FROM hris_karyawan WHERE status_aktif = 1 AND tgl_lahir IS NOT NULL AND MONTH(tgl_lahir) = ${bln} AND DAY(tgl_lahir) = ${tgl}`;
      if (!rows.length) return;
      const umum = await this.prisma.chatRuang.findUnique({ where: { kunci: 'umum' } });
      if (!umum) return;
      const awal = new Date(Date.now() - 20 * 3600_000);
      for (const k of rows) {
        const isi = `🎂 Selamat ulang tahun, ${k.nama_lengkap.trim()}! Semoga sehat, bahagia, dan makin sukses 🎉`;
        const sudah = await this.prisma.chatPesan.findFirst({ where: { id_ruang: umum.id_ruang, id_pengirim: null, isi, created_at: { gt: awal } }, select: { id_pesan: true } });
        if (!sudah) await this.pesanSistem(umum.id_ruang, isi);
      }
    } catch (e: any) { this.logger.warn(`ucapan ulang tahun gagal: ${e?.message}`); }
  }

  // ── Kartu rujukan (#TKT-202611-0204 / #WO-202611-0001) ──────────────────────
  private static readonly RX_RUJUKAN = /#((?:TKT|WO)-\d{6}-\d{4})\b/gi;

  private kodeDalam(isi: string): string[] {
    return [...new Set([...(isi ?? '').matchAll(ChatService.RX_RUJUKAN)].map((m) => m[1]!.toUpperCase()))].slice(0, 3);
  }

  private async petaKartu(isis: string[]) {
    const kode = [...new Set(isis.flatMap((i) => this.kodeDalam(i)))];
    const peta = new Map<string, any>();
    if (!kode.length) return peta;
    const tkt = kode.filter((k) => k.startsWith('TKT-'));
    const wo = kode.filter((k) => k.startsWith('WO-'));
    const [t, w] = await Promise.all([
      tkt.length ? this.prisma.operationTicket.findMany({ where: { nomor_tiket: { in: tkt } }, select: { id_ticket: true, nomor_tiket: true, judul_tiket: true, status_tiket: true, prioritas: true, site: { select: { nama_site: true } } } }) : Promise.resolve([] as any[]),
      wo.length ? this.prisma.workOrder.findMany({ where: { nomor_wo: { in: wo } }, select: { id_wo: true, nomor_wo: true, jenis_wo: true, status_wo: true, tgl_jadwal: true, site: { select: { nama_site: true } } } }) : Promise.resolve([] as any[]),
    ]);
    for (const x of t) peta.set(x.nomor_tiket.toUpperCase(), { jenis: 'tiket', kode: x.nomor_tiket, judul: x.judul_tiket, status: x.status_tiket, prioritas: x.prioritas, site: x.site?.nama_site ?? '', url: `/operations/${x.id_ticket}` });
    for (const x of w) peta.set(x.nomor_wo.toUpperCase(), { jenis: 'wo', kode: x.nomor_wo, judul: x.jenis_wo.replace(/_/g, ' '), status: x.status_wo, prioritas: null, site: x.site?.nama_site ?? '', url: '/jadwal-visit' });
    return peta;
  }

  private kartuDalam(isi: string, peta: Map<string, any>) {
    return this.kodeDalam(isi).map((k) => peta.get(k)).filter(Boolean);
  }

  private urlDiskusi(kunci: string | null) {
    const m = /^(tkt|site):(\d+)$/.exec(kunci ?? '');
    return m ? (m[1] === 'tkt' ? `/operations/${m[2]}` : `/master/site/${m[2]}`) : null;
  }

  // ── Ruang diskusi per tiket / site ───────────────────────────────────────────
  /** Ambil (atau buat) ruang diskusi untuk satu tiket/site; pembuka otomatis menjadi anggota. Terbuka untuk semua staf. */
  async bukaDiskusi(id_karyawan: number, jenis: 'tiket' | 'site', id: number) {
    this.wajibKaryawan(id_karyawan);
    let kunci: string; let nama: string; const ikut: number[] = [id_karyawan];
    if (jenis === 'tiket') {
      const t = await this.prisma.operationTicket.findUnique({ where: { id_ticket: id }, select: { nomor_tiket: true, judul_tiket: true, id_teknisi_pic: true } });
      if (!t) throw new NotFoundException('Tiket tidak ditemukan');
      kunci = `tkt:${id}`; nama = `${t.nomor_tiket} · ${t.judul_tiket}`.slice(0, 100);
      if (t.id_teknisi_pic) ikut.push(t.id_teknisi_pic);
    } else {
      const s = await this.prisma.sitePelanggan.findUnique({ where: { id_site: id }, select: { nama_site: true, kode_site: true } });
      if (!s) throw new NotFoundException('Site tidak ditemukan');
      kunci = `site:${id}`; nama = `Site ${s.nama_site}`.slice(0, 100);
    }
    let r = await this.prisma.chatRuang.findUnique({ where: { kunci } });
    const baru = !r;
    if (!r) r = await this.prisma.chatRuang.create({ data: { tipe: 'diskusi', nama, kunci, id_pembuat: id_karyawan } }).catch(() => this.prisma.chatRuang.findUnique({ where: { kunci } }) as any);
    if (!r) throw new BadRequestException('Gagal membuka diskusi');
    const aktif = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: [...new Set(ikut)] }, status_aktif: true }, select: { id_karyawan: true } });
    await this.prisma.chatAnggota.createMany({ data: aktif.map((x) => ({ id_ruang: r!.id_ruang, id_karyawan: x.id_karyawan })), skipDuplicates: true });
    if (baru) {
      const n = (await this.daftarNama([id_karyawan])).get(id_karyawan)?.nama ?? 'Seseorang';
      await this.pesanSistem(r.id_ruang, `${n} membuka diskusi ${jenis === 'tiket' ? 'tiket' : 'site'} ini`);
    }
    return { id_ruang: r.id_ruang };
  }

  // ── Pencarian ────────────────────────────────────────────────────────────────
  async cariKaryawan(q: string, id_karyawan: number) {
    const kata = (q || '').trim();
    const rows = await this.prisma.hrisKaryawan.findMany({
      where: { status_aktif: true, id_karyawan: { not: id_karyawan }, ...(kata ? { OR: [{ nama_lengkap: { contains: kata } }, { jabatan: { contains: kata } }, { departemen: { contains: kata } }] } : {}) },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true, departemen: true }, orderBy: { nama_lengkap: 'asc' }, take: kata ? 30 : 300,
    });
    const online = new Set(await this.idOnline());
    return rows.map((r) => ({ id_karyawan: r.id_karyawan, nama: r.nama_lengkap.trim(), jabatan: r.jabatan, departemen: r.departemen, online: online.has(r.id_karyawan) }));
  }

  async cariPesan(q: string, id_karyawan: number) {
    const kata = (q || '').trim();
    if (kata.length < 2) return [];
    const saya = await this.prisma.chatAnggota.findMany({ where: { id_karyawan }, include: { ruang: { include: { anggota: { select: { id_karyawan: true } } } } } });
    const rows = await this.prisma.chatPesan.findMany({ where: { id_ruang: { in: saya.map((s) => s.id_ruang) }, dihapus_at: null, isi: { contains: kata } }, orderBy: { id_pesan: 'desc' }, take: 30 });
    const peta = new Map(saya.map((s) => [s.id_ruang, s.ruang]));
    const nama = await this.daftarNama([...rows.map((r) => r.id_pengirim ?? 0), ...saya.flatMap((s) => (s.ruang.tipe === 'pribadi' ? s.ruang.anggota.map((x) => x.id_karyawan) : []))]);
    return rows.map((r) => {
      const ru = peta.get(r.id_ruang)!;
      const lawan = ru.tipe === 'pribadi' ? ru.anggota.map((x) => x.id_karyawan).find((x) => x !== id_karyawan) : null;
      return { id_pesan: r.id_pesan, id_ruang: r.id_ruang, ruang: lawan ? (nama.get(lawan)?.nama ?? 'Karyawan') : (ru.nama ?? 'Grup'), pengirim: r.id_pengirim ? (nama.get(r.id_pengirim)?.nama ?? '') : '', isi: r.isi.slice(0, 200), waktu: r.created_at };
    });
  }
}
