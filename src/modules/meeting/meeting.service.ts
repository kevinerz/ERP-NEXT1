import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { buatToken, verifikasiWebhook, type VideoGrant } from './livekit.util';

const identitas = (id_karyawan: number) => `k-${id_karyawan}`;
const kodeAcak = () => randomBytes(18).toString('base64url');
const dariIdentitas = (identity: string | undefined) => {
  const m = /^k-(\d+)$/.exec(identity || '');
  return m ? Number(m[1]) : null;
};

/** Rapat internal NEXT1 di LiveKit (meet.nextone.id). Masuk rapat memakai login ERP. */
@Injectable()
export class MeetingService {
  private readonly logger = new Logger('Meeting');
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  // ── Konfigurasi LiveKit ──────────────────────────────────────────────────────
  private get lk() {
    const key = this.config.get<string>('LIVEKIT_API_KEY') || '';
    const secret = this.config.get<string>('LIVEKIT_API_SECRET') || '';
    if (!key || !secret) throw new ServiceUnavailableException('Server rapat belum dikonfigurasi (LIVEKIT_API_KEY / LIVEKIT_API_SECRET)');
    return {
      key, secret,
      url: this.config.get<string>('LIVEKIT_URL') || 'wss://meet.nextone.id',
      api: (this.config.get<string>('LIVEKIT_API_URL') || 'http://192.168.200.189:7880').replace(/\/$/, ''),
    };
  }

  /** Panggil RoomService LiveKit (Twirp) */
  private async roomService(method: string, body: Record<string, unknown>, grant: VideoGrant) {
    const lk = this.lk;
    const token = buatToken(lk.key, lk.secret, { video: grant, ttlDetik: 120 });
    let res: Response;
    try {
      res = await fetch(`${lk.api}/twirp/livekit.RoomService/${method}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e: any) {
      this.logger.warn(`${method} gagal: ${e?.message}`);
      throw new BadGatewayException('Server rapat tidak bisa dihubungi');
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Room belum/sudah tidak ada → anggap selesai
      if (res.status === 404 || json?.code === 'not_found') return null;
      throw new BadGatewayException(json?.msg || `Server rapat error ${res.status}`);
    }
    return json;
  }

  // ── Util ─────────────────────────────────────────────────────────────────────
  private async namaKaryawan(ids: number[]) {
    if (!ids.length) return new Map<number, { nama: string; jabatan: string }>();
    const k = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: ids } }, select: { id_karyawan: true, nama_lengkap: true, jabatan: true } });
    return new Map(k.map((x) => [x.id_karyawan, { nama: x.nama_lengkap.trim(), jabatan: x.jabatan }]));
  }

  /** Superadmin (modul_akses kosong) & role Admin / Director boleh melihat & memantau semua rapat */
  static pemantau(u?: { modul_akses?: unknown; roles?: string[] } | null) {
    if (!u) return false;
    const akses = u.modul_akses;
    return akses == null || (Array.isArray(akses) && !akses.length) || (u.roles ?? []).some((r) => r === 'Admin' || r === 'Director');
  }

  /** semua=true → pemantau boleh lihat / masuk walau tidak diundang (tanpa hak moderator) */
  private async rapatAnggota(id_rapat: number, id_karyawan: number, semua = false) {
    const r = await this.prisma.rapat.findUnique({ where: { id_rapat }, include: { peserta: true } });
    if (!r) throw new NotFoundException('Rapat tidak ditemukan');
    const saya = r.peserta.find((p) => p.id_karyawan === id_karyawan);
    if (!saya) {
      if (semua) return { r, moderator: false, diundang: false };
      throw new ForbiddenException('Anda tidak diundang ke rapat ini');
    }
    return { r, moderator: saya.peran === 'moderator', diundang: true };
  }

  private async moderatorSaja(id_rapat: number, id_karyawan: number) {
    const x = await this.rapatAnggota(id_rapat, id_karyawan);
    if (!x.moderator) throw new ForbiddenException('Hanya moderator rapat yang bisa melakukan ini');
    return x.r;
  }

  /** Notifikasi lonceng ERP ke karyawan (lewat akun login-nya) */
  private async beriTahu(ids: number[], data: { tipe: string; judul: string; deskripsi?: string; url: string }) {
    if (!ids.length) return;
    try {
      const users = await this.prisma.coreUser.findMany({ where: { id_karyawan: { in: ids }, is_aktif: true }, select: { id_user: true } });
      if (users.length) await this.prisma.notification.createMany({ data: users.map((u) => ({ id_user: u.id_user, ...data })) });
    } catch (e: any) {
      this.logger.warn(`notifikasi rapat gagal: ${e?.message}`);
    }
  }

  private fmtJadwal(d: Date | null) {
    return d ? d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'sekarang';
  }

  // ── Karyawan (untuk memilih peserta) ─────────────────────────────────────────
  cariKaryawan(q: string) {
    const kata = (q || '').trim();
    return this.prisma.hrisKaryawan.findMany({
      where: { status_aktif: true, ...(kata ? { OR: [{ nama_lengkap: { contains: kata } }, { jabatan: { contains: kata } }, { departemen: { contains: kata } }] } : {}) },
      select: { id_karyawan: true, nama_lengkap: true, jabatan: true, departemen: true },
      orderBy: { nama_lengkap: 'asc' },
      take: kata ? 30 : 300,
    });
  }

  // ── Daftar & detail ──────────────────────────────────────────────────────────
  async daftar(id_karyawan: number, semua = false) {
    const rapat = await this.prisma.rapat.findMany({
      where: semua ? {} : { peserta: { some: { id_karyawan } } },
      include: {
        peserta: true,
        kehadiran: { select: { id_karyawan: true, identity: true } },
        tindak: { select: { selesai: true } },
      },
      orderBy: [{ created_at: 'desc' }],
      take: 500,
    });
    const nama = await this.namaKaryawan([...new Set(rapat.flatMap((r) => [r.id_pembuat, ...r.peserta.map((p) => p.id_karyawan)]))]);
    const bentuk = (r: (typeof rapat)[number]) => {
      const saya = r.peserta.find((p) => p.id_karyawan === id_karyawan);
      const hadirKaryawan = new Set(r.kehadiran.filter((h) => h.id_karyawan != null).map((h) => h.id_karyawan));
      const tamu = new Set(r.kehadiran.filter((h) => h.id_karyawan == null).map((h) => h.identity)).size;
      return {
        id_rapat: r.id_rapat, judul: r.judul, deskripsi: r.deskripsi, jadwal_at: r.jadwal_at, durasi_menit: r.durasi_menit,
        kategori: r.kategori, lokasi: r.lokasi, status: r.status,
        mulai_at: r.mulai_at, selesai_at: r.selesai_at, created_at: r.created_at,
        pembuat: nama.get(r.id_pembuat)?.nama ?? '-', id_pembuat: r.id_pembuat,
        moderator: saya?.peran === 'moderator',
        diundang: !!saya,
        respon_saya: saya?.respon ?? null,
        peserta: r.peserta.map((p) => ({ id_karyawan: p.id_karyawan, nama: nama.get(p.id_karyawan)?.nama ?? `#${p.id_karyawan}`, peran: p.peran, respon: p.respon, hadir: hadirKaryawan.has(p.id_karyawan) })),
        jumlah_hadir: hadirKaryawan.size,
        jumlah_tamu: tamu,
        ada_notulen: !!r.notulen?.trim(),
        tindak_total: r.tindak.length,
        tindak_terbuka: r.tindak.filter((t) => !t.selesai).length,
      };
    };
    const aktif = rapat.filter((r) => r.status === 'Terjadwal' || r.status === 'Berlangsung')
      .sort((a, b) => (a.status === 'Berlangsung' ? -1 : 0) - (b.status === 'Berlangsung' ? -1 : 0) || +(a.jadwal_at ?? a.created_at) - +(b.jadwal_at ?? b.created_at));
    const riwayat = rapat.filter((r) => r.status === 'Selesai' || r.status === 'Dibatalkan');

    // Statistik ringkas (zona WIB)
    const wib = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const now = new Date();
    const hariIni = wib(now);
    const awalBulan = hariIni.slice(0, 7);
    const awalMinggu = new Date(now.getTime() - 7 * 86400_000);
    const selesaiBulan = riwayat.filter((r) => r.status === 'Selesai' && r.mulai_at && r.selesai_at && wib(r.mulai_at).slice(0, 7) === awalBulan);
    const menitBulan = selesaiBulan.reduce((a, r) => a + Math.max(0, (+r.selesai_at! - +r.mulai_at!) / 60_000), 0);
    const persen = selesaiBulan.filter((r) => r.peserta.length > 1).map((r) => {
      const h = new Set(r.kehadiran.filter((x) => x.id_karyawan != null).map((x) => x.id_karyawan));
      return r.peserta.filter((p) => h.has(p.id_karyawan)).length / r.peserta.length;
    });
    const statistik = {
      berlangsung: aktif.filter((r) => r.status === 'Berlangsung').length,
      hari_ini: rapat.filter((r) => r.status !== 'Dibatalkan' && r.jadwal_at && wib(r.jadwal_at) === hariIni).length,
      akan_datang: aktif.filter((r) => r.status === 'Terjadwal').length,
      minggu_ini: rapat.filter((r) => r.status === 'Selesai' && r.mulai_at && r.mulai_at >= awalMinggu).length,
      bulan_ini: selesaiBulan.length,
      jam_bulan_ini: Math.round(menitBulan / 6) / 10,
      rata_hadir: persen.length ? Math.round((persen.reduce((a, b) => a + b, 0) / persen.length) * 100) : null,
      menunggu_respon: aktif.filter((r) => r.status === 'Terjadwal' && r.peserta.some((p) => p.id_karyawan === id_karyawan && !p.respon && p.peran !== 'moderator')).length,
    };
    return { aktif: aktif.map(bentuk), riwayat: riwayat.map(bentuk), statistik, tindak_saya: await this.tindakSaya(id_karyawan) };
  }

  /** Tindak lanjut yang belum selesai dengan PIC = saya (lintas rapat) */
  async tindakSaya(id_karyawan: number) {
    const t = await this.prisma.rapatTindak.findMany({
      where: { id_pic: id_karyawan, selesai: false },
      include: { rapat: { select: { id_rapat: true, judul: true } } },
      orderBy: [{ tenggat: 'asc' }, { created_at: 'asc' }],
      take: 50,
    });
    return t.map((x) => ({ id_tindak: x.id_tindak, judul: x.judul, tenggat: x.tenggat, id_rapat: x.rapat.id_rapat, rapat: x.rapat.judul }));
  }

  async detail(id_rapat: number, id_karyawan: number, semua = false) {
    const { r, moderator, diundang } = await this.rapatAnggota(id_rapat, id_karyawan, semua);
    const hadir = await this.prisma.rapatKehadiran.findMany({ where: { id_rapat }, orderBy: { masuk_at: 'asc' } });
    const tindak = await this.prisma.rapatTindak.findMany({ where: { id_rapat }, orderBy: [{ selesai: 'asc' }, { created_at: 'asc' }] });
    const nama = await this.namaKaryawan([...new Set([r.id_pembuat, ...r.peserta.map((p) => p.id_karyawan), ...tindak.flatMap((t) => [t.id_pic ?? 0, t.dibuat_oleh]), r.notulen_oleh ?? 0].filter(Boolean))]);
    // Ringkas kehadiran per orang (karyawan per id, tamu per identity): pertama masuk, terakhir keluar, total menit
    type Ringkas = { nama: string | null; masuk: Date; keluar: Date | null; detik: number; online: boolean };
    const per = new Map<number, Ringkas>();
    const tamu = new Map<string, Ringkas>();
    for (const h of hadir) {
      const akhir = h.keluar_at ?? new Date();
      const peta = (h.id_karyawan != null ? per : tamu) as Map<number | string, Ringkas>;
      const kunci = h.id_karyawan ?? h.identity ?? `hadir-${h.id_hadir}`;
      const x = peta.get(kunci) ?? { nama: h.nama_tamu, masuk: h.masuk_at, keluar: null, detik: 0, online: false };
      x.detik += Math.max(0, (+akhir - +h.masuk_at) / 1000);
      x.keluar = h.keluar_at ?? x.keluar;
      x.online = x.online || !h.keluar_at;
      peta.set(kunci, x);
    }
    const linkAktif = this.linkBerlaku(r);
    return {
      id_rapat: r.id_rapat, judul: r.judul, deskripsi: r.deskripsi, jadwal_at: r.jadwal_at, status: r.status,
      durasi_menit: r.durasi_menit, kategori: r.kategori, lokasi: r.lokasi,
      mulai_at: r.mulai_at, selesai_at: r.selesai_at, created_at: r.created_at, moderator, diundang,
      respon_saya: r.peserta.find((p) => p.id_karyawan === id_karyawan)?.respon ?? null,
      notulen: r.notulen, notulen_at: r.notulen_at, notulen_oleh: r.notulen_oleh ? nama.get(r.notulen_oleh)?.nama ?? null : null,
      tindak: tindak.map((t) => ({
        id_tindak: t.id_tindak, judul: t.judul, id_pic: t.id_pic, pic: t.id_pic ? nama.get(t.id_pic)?.nama ?? `#${t.id_pic}` : null,
        tenggat: t.tenggat, selesai: t.selesai, selesai_at: t.selesai_at, dibuat_oleh: nama.get(t.dibuat_oleh)?.nama ?? '-',
      })),
      sesi: hadir.map((h) => ({ id_karyawan: h.id_karyawan, identity: h.identity, nama: h.nama_tamu, masuk_at: h.masuk_at, keluar_at: h.keluar_at })),
      pembuat: { id_karyawan: r.id_pembuat, nama: nama.get(r.id_pembuat)?.nama ?? '-' },
      peserta: r.peserta.map((p) => {
        const k = per.get(p.id_karyawan);
        return {
          id_karyawan: p.id_karyawan, nama: nama.get(p.id_karyawan)?.nama ?? `#${p.id_karyawan}`, jabatan: nama.get(p.id_karyawan)?.jabatan ?? '',
          peran: p.peran, respon: p.respon, hadir: !!k, online: k?.online ?? false, masuk_at: k?.masuk ?? null, keluar_at: k?.online ? null : k?.keluar ?? null,
          menit: k ? Math.round(k.detik / 60) : 0,
        };
      }),
      tamu: [...tamu.values()].map((t) => ({
        nama: t.nama || 'Tamu', online: t.online, masuk_at: t.masuk, keluar_at: t.online ? null : t.keluar, menit: Math.round(t.detik / 60),
      })),
      // Link tamu hanya diperlihatkan ke moderator
      link_tamu: moderator && r.tamu_kode ? { kode: r.tamu_kode, aktif: linkAktif, dimatikan: !r.tamu_aktif, sampai: r.tamu_sampai } : null,
    };
  }

  // ── Link tamu (orang di luar HRIS, tanpa login) ──────────────────────────────
  private linkBerlaku(r: { tamu_aktif: boolean; tamu_kode: string | null; tamu_sampai: Date | null; status: string }) {
    return !!r.tamu_kode && r.tamu_aktif && (!r.tamu_sampai || r.tamu_sampai > new Date()) && r.status !== 'Selesai' && r.status !== 'Dibatalkan';
  }

  async aturLinkTamu(id_rapat: number, id_karyawan: number, d: { aktif: boolean; baru?: boolean; jam?: number }) {
    const r = await this.moderatorSaja(id_rapat, id_karyawan);
    if (d.aktif && (r.status === 'Selesai' || r.status === 'Dibatalkan')) throw new BadRequestException('Rapat sudah selesai / dibatalkan');
    if (!d.aktif) {
      await this.prisma.rapat.update({ where: { id_rapat }, data: { tamu_aktif: false } });
    } else {
      // Berlaku sampai: N jam dari sekarang, atau default 24 jam setelah jadwal (minimal 24 jam dari sekarang)
      const dasar = Math.max(Date.now(), +(r.jadwal_at ?? 0));
      const sampai = new Date(d.jam ? Date.now() + d.jam * 3600_000 : dasar + 24 * 3600_000);
      await this.prisma.rapat.update({
        where: { id_rapat },
        data: { tamu_aktif: true, tamu_kode: !r.tamu_kode || d.baru ? kodeAcak() : r.tamu_kode, tamu_sampai: sampai },
      });
      this.logger.log(`Link tamu rapat #${id_rapat} ${d.baru ? 'dibuat ulang' : 'diaktifkan'} oleh karyawan#${id_karyawan} s/d ${sampai.toISOString()}`);
    }
    return this.detail(id_rapat, id_karyawan);
  }

  private async rapatTamu(kode: string) {
    const r = kode && kode.length >= 16 ? await this.prisma.rapat.findUnique({ where: { tamu_kode: kode } }) : null;
    if (!r || !this.linkBerlaku(r)) throw new NotFoundException('Link rapat tidak berlaku atau sudah kedaluwarsa');
    return r;
  }

  async infoTamu(kode: string) {
    const r = await this.rapatTamu(kode);
    const pembuat = (await this.namaKaryawan([r.id_pembuat])).get(r.id_pembuat)?.nama ?? 'NEXT1';
    return { judul: r.judul, jadwal_at: r.jadwal_at, status: r.status, pembuat };
  }

  async tokenTamu(kode: string, d: { nama: string; instansi?: string }) {
    const r = await this.rapatTamu(kode);
    const nama = d.nama.trim().replace(/\s+/g, ' ');
    if (nama.length < 2) throw new BadRequestException('Nama wajib diisi');
    const instansi = d.instansi?.trim().replace(/\s+/g, ' ');
    const tampil = `${nama}${instansi ? ` (${instansi})` : ''} · Tamu`;
    const lk = this.lk;
    const identity = `tamu-${randomBytes(5).toString('hex')}`;
    const token = buatToken(lk.key, lk.secret, {
      identity, name: tampil.slice(0, 200), metadata: JSON.stringify({ tamu: true }),
      video: { room: r.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    });
    this.logger.log(`Tamu "${tampil}" masuk rapat #${r.id_rapat}`);
    return { url: lk.url, token, identity, nama: tampil, moderator: false, judul: r.judul };
  }

  // ── Buat / ubah / batal ──────────────────────────────────────────────────────
  async buat(id_karyawan: number, d: { judul: string; deskripsi?: string; jadwal_at?: string; peserta: number[]; durasi_menit?: number; kategori?: string; lokasi?: string; moderator?: number[] }) {
    const ids = [...new Set(d.peserta.filter((x) => x !== id_karyawan))];
    const valid = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: ids }, status_aktif: true }, select: { id_karyawan: true } });
    const jadwal = d.jadwal_at ? new Date(d.jadwal_at) : null;
    const r = await this.prisma.rapat.create({
      data: {
        room: `rapat-${randomBytes(6).toString('hex')}`,
        judul: d.judul.trim(), deskripsi: d.deskripsi?.trim() || null, jadwal_at: jadwal, id_pembuat: id_karyawan,
        durasi_menit: d.durasi_menit ?? null, kategori: d.kategori?.trim() || null, lokasi: d.lokasi?.trim() || null,
        peserta: {
          create: [
            { id_karyawan, peran: 'moderator', respon: 'hadir', respon_at: new Date() },
            ...valid.map((v) => ({ id_karyawan: v.id_karyawan, peran: d.moderator?.includes(v.id_karyawan) ? 'moderator' : 'peserta' })),
          ],
        },
      },
    });
    const pembuat = (await this.namaKaryawan([id_karyawan])).get(id_karyawan)?.nama ?? 'Rekan';
    await this.beriTahu(valid.map((v) => v.id_karyawan), {
      tipe: 'rapat_undangan', judul: `Undangan rapat: ${r.judul}`,
      deskripsi: `${pembuat} mengundang Anda · ${this.fmtJadwal(jadwal)}`, url: `/meeting/${r.id_rapat}`,
    });
    this.logger.log(`Rapat #${r.id_rapat} "${r.judul}" dibuat oleh karyawan#${id_karyawan} (${valid.length} undangan)`);
    return this.detail(r.id_rapat, id_karyawan);
  }

  async ubah(id_rapat: number, id_karyawan: number, d: { judul?: string; deskripsi?: string; jadwal_at?: string | null; durasi_menit?: number | null; kategori?: string | null; lokasi?: string | null }) {
    const r = await this.moderatorSaja(id_rapat, id_karyawan);
    if (r.status === 'Selesai' || r.status === 'Dibatalkan') throw new BadRequestException('Rapat sudah selesai / dibatalkan');
    const jadwalBaru = d.jadwal_at !== undefined ? (d.jadwal_at ? new Date(d.jadwal_at) : null) : undefined;
    const jadwalBerubah = jadwalBaru !== undefined && +(jadwalBaru ?? 0) !== +(r.jadwal_at ?? 0);
    await this.prisma.rapat.update({
      where: { id_rapat },
      data: {
        ...(d.judul !== undefined ? { judul: d.judul.trim() } : {}),
        ...(d.deskripsi !== undefined ? { deskripsi: d.deskripsi.trim() || null } : {}),
        ...(d.durasi_menit !== undefined ? { durasi_menit: d.durasi_menit || null } : {}),
        ...(d.kategori !== undefined ? { kategori: d.kategori?.trim() || null } : {}),
        ...(d.lokasi !== undefined ? { lokasi: d.lokasi?.trim() || null } : {}),
        ...(jadwalBerubah ? { jadwal_at: jadwalBaru, diingatkan_at: null } : {}),
      },
    });
    if (jadwalBerubah) {
      // Jadwal berubah → beri tahu peserta & minta konfirmasi ulang
      await this.prisma.rapatPeserta.updateMany({ where: { id_rapat, id_karyawan: { not: id_karyawan }, respon: { not: null } }, data: { respon: null, respon_at: null } });
      await this.beriTahu(r.peserta.map((p) => p.id_karyawan).filter((x) => x !== id_karyawan), {
        tipe: 'rapat_undangan', judul: `Jadwal rapat berubah: ${d.judul?.trim() || r.judul}`,
        deskripsi: `Sekarang ${this.fmtJadwal(jadwalBaru ?? null)} — mohon konfirmasi kehadiran`, url: `/meeting/${id_rapat}`,
      });
    }
    return this.detail(id_rapat, id_karyawan);
  }

  /** Salin rapat (judul, agenda, peserta, moderator) ke jadwal baru — untuk rapat rutin */
  async duplikat(id_rapat: number, id_karyawan: number, semua: boolean, d: { jadwal_at?: string; judul?: string }) {
    const { r } = await this.rapatAnggota(id_rapat, id_karyawan, semua);
    const peserta = r.peserta.map((p) => p.id_karyawan).filter((x) => x !== id_karyawan);
    return this.buat(id_karyawan, {
      judul: d.judul?.trim() || r.judul, deskripsi: r.deskripsi ?? undefined, jadwal_at: d.jadwal_at, peserta,
      durasi_menit: r.durasi_menit ?? undefined, kategori: r.kategori ?? undefined, lokasi: r.lokasi ?? undefined,
      moderator: r.peserta.filter((p) => p.peran === 'moderator').map((p) => p.id_karyawan),
    });
  }

  // ── Konfirmasi kehadiran (RSVP) ──────────────────────────────────────────────
  async respon(id_rapat: number, id_karyawan: number, respon: string) {
    const { r, diundang } = await this.rapatAnggota(id_rapat, id_karyawan);
    if (!diundang) throw new ForbiddenException('Anda tidak diundang ke rapat ini');
    if (r.status !== 'Terjadwal') throw new BadRequestException('Konfirmasi hanya untuk rapat yang belum dimulai');
    await this.prisma.rapatPeserta.updateMany({ where: { id_rapat, id_karyawan }, data: { respon, respon_at: new Date() } });
    if (respon === 'tidak' && r.id_pembuat !== id_karyawan) {
      const n = (await this.namaKaryawan([id_karyawan])).get(id_karyawan)?.nama ?? 'Peserta';
      await this.beriTahu([r.id_pembuat], { tipe: 'rapat_respon', judul: `${n} tidak bisa hadir`, deskripsi: r.judul, url: `/meeting/${id_rapat}` });
    }
    return this.detail(id_rapat, id_karyawan);
  }

  // ── Notulen ──────────────────────────────────────────────────────────────────
  async simpanNotulen(id_rapat: number, id_karyawan: number, notulen: string) {
    const { diundang } = await this.rapatAnggota(id_rapat, id_karyawan);
    if (!diundang) throw new ForbiddenException('Hanya peserta rapat yang bisa menulis notulen');
    const now = new Date();
    await this.prisma.rapat.update({ where: { id_rapat }, data: { notulen: notulen.trim() ? notulen : null, notulen_oleh: id_karyawan, notulen_at: now } });
    return { notulen_at: now, notulen_oleh: (await this.namaKaryawan([id_karyawan])).get(id_karyawan)?.nama ?? null };
  }

  // ── Tindak lanjut ────────────────────────────────────────────────────────────
  private async anggotaSaja(id_rapat: number, id_karyawan: number) {
    const x = await this.rapatAnggota(id_rapat, id_karyawan);
    if (!x.diundang) throw new ForbiddenException('Hanya peserta rapat yang bisa mengubah tindak lanjut');
    return x.r;
  }

  async tambahTindak(id_rapat: number, id_karyawan: number, d: { judul: string; id_pic?: number | null; tenggat?: string | null }) {
    const r = await this.anggotaSaja(id_rapat, id_karyawan);
    const t = await this.prisma.rapatTindak.create({
      data: { id_rapat, judul: d.judul.trim(), id_pic: d.id_pic || null, tenggat: d.tenggat ? new Date(d.tenggat) : null, dibuat_oleh: id_karyawan },
    });
    if (t.id_pic && t.id_pic !== id_karyawan) {
      await this.beriTahu([t.id_pic], {
        tipe: 'rapat_tindak', judul: `Tugas dari rapat: ${t.judul}`,
        deskripsi: `${r.judul}${t.tenggat ? ` · tenggat ${t.tenggat.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : ''}`, url: `/meeting/${id_rapat}?tab=tindak`,
      });
    }
    return this.detail(id_rapat, id_karyawan);
  }

  async ubahTindak(id_rapat: number, id_karyawan: number, id_tindak: number, d: { judul?: string; id_pic?: number | null; tenggat?: string | null; selesai?: boolean }) {
    const r = await this.anggotaSaja(id_rapat, id_karyawan);
    const lama = await this.prisma.rapatTindak.findFirst({ where: { id_tindak, id_rapat } });
    if (!lama) throw new NotFoundException('Tindak lanjut tidak ditemukan');
    await this.prisma.rapatTindak.update({
      where: { id_tindak },
      data: {
        ...(d.judul !== undefined ? { judul: d.judul.trim() } : {}),
        ...(d.id_pic !== undefined ? { id_pic: d.id_pic || null } : {}),
        ...(d.tenggat !== undefined ? { tenggat: d.tenggat ? new Date(d.tenggat) : null } : {}),
        ...(d.selesai !== undefined ? { selesai: d.selesai, selesai_at: d.selesai ? new Date() : null } : {}),
      },
    });
    if (d.id_pic && d.id_pic !== lama.id_pic && d.id_pic !== id_karyawan) {
      await this.beriTahu([d.id_pic], { tipe: 'rapat_tindak', judul: `Tugas dari rapat: ${d.judul?.trim() || lama.judul}`, deskripsi: r.judul, url: `/meeting/${id_rapat}?tab=tindak` });
    }
    return this.detail(id_rapat, id_karyawan);
  }

  async hapusTindak(id_rapat: number, id_karyawan: number, id_tindak: number) {
    await this.anggotaSaja(id_rapat, id_karyawan);
    await this.prisma.rapatTindak.deleteMany({ where: { id_tindak, id_rapat } });
    return this.detail(id_rapat, id_karyawan);
  }

  // ── Pengingat: 10 menit sebelum rapat terjadwal mulai ────────────────────────
  @Cron('* * * * *')
  async kirimPengingat() {
    try {
      const now = new Date();
      const rapat = await this.prisma.rapat.findMany({
        where: { status: 'Terjadwal', diingatkan_at: null, jadwal_at: { gt: new Date(now.getTime() - 5 * 60_000), lte: new Date(now.getTime() + 10 * 60_000) } },
        include: { peserta: true },
        take: 50,
      });
      for (const r of rapat) {
        const ok = await this.prisma.rapat.updateMany({ where: { id_rapat: r.id_rapat, diingatkan_at: null }, data: { diingatkan_at: now } });
        if (!ok.count) continue;
        const menit = Math.max(0, Math.round((+r.jadwal_at! - +now) / 60_000));
        await this.beriTahu(r.peserta.filter((p) => p.respon !== 'tidak').map((p) => p.id_karyawan), {
          tipe: 'rapat_pengingat', judul: `⏰ Rapat ${menit ? `${menit} menit lagi` : 'dimulai sekarang'}: ${r.judul}`,
          deskripsi: `${this.fmtJadwal(r.jadwal_at)}${r.lokasi ? ` · ${r.lokasi}` : ''}`, url: `/meeting/${r.id_rapat}`,
        });
      }
    } catch (e: any) {
      this.logger.warn(`pengingat rapat gagal: ${e?.message}`);
    }
  }

  async tambahPeserta(id_rapat: number, id_karyawan: number, ids: number[]) {
    const r = await this.moderatorSaja(id_rapat, id_karyawan);
    const sudah = new Set(r.peserta.map((p) => p.id_karyawan));
    const baru = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: ids.filter((x) => !sudah.has(x)) }, status_aktif: true }, select: { id_karyawan: true } });
    if (baru.length) {
      await this.prisma.rapatPeserta.createMany({ data: baru.map((b) => ({ id_rapat, id_karyawan: b.id_karyawan })), skipDuplicates: true });
      const pembuat = (await this.namaKaryawan([id_karyawan])).get(id_karyawan)?.nama ?? 'Rekan';
      await this.beriTahu(baru.map((b) => b.id_karyawan), {
        tipe: 'rapat_undangan', judul: `Undangan rapat: ${r.judul}`,
        deskripsi: `${pembuat} mengundang Anda · ${r.status === 'Berlangsung' ? 'sedang berlangsung' : this.fmtJadwal(r.jadwal_at)}`, url: `/meeting/${id_rapat}`,
      });
    }
    return this.detail(id_rapat, id_karyawan);
  }

  async hapusPeserta(id_rapat: number, id_karyawan: number, target: number) {
    const r = await this.moderatorSaja(id_rapat, id_karyawan);
    if (target === r.id_pembuat) throw new BadRequestException('Pembuat rapat tidak bisa dihapus');
    await this.prisma.rapatPeserta.deleteMany({ where: { id_rapat, id_karyawan: target } });
    if (r.status === 'Berlangsung') await this.roomService('RemoveParticipant', { room: r.room, identity: identitas(target) }, { roomAdmin: true, room: r.room }).catch(() => null);
    return this.detail(id_rapat, id_karyawan);
  }

  async jadikanModerator(id_rapat: number, id_karyawan: number, target: number) {
    await this.moderatorSaja(id_rapat, id_karyawan);
    await this.prisma.rapatPeserta.updateMany({ where: { id_rapat, id_karyawan: target }, data: { peran: 'moderator' } });
    return this.detail(id_rapat, id_karyawan);
  }

  async batal(id_rapat: number, id_karyawan: number) {
    const r = await this.moderatorSaja(id_rapat, id_karyawan);
    if (r.status !== 'Terjadwal') throw new BadRequestException('Hanya rapat yang belum dimulai yang bisa dibatalkan');
    await this.prisma.rapat.update({ where: { id_rapat }, data: { status: 'Dibatalkan' } });
    await this.beriTahu(r.peserta.map((p) => p.id_karyawan).filter((x) => x !== id_karyawan), {
      tipe: 'rapat_batal', judul: `Rapat dibatalkan: ${r.judul}`, deskripsi: `Jadwal ${this.fmtJadwal(r.jadwal_at)} dibatalkan`, url: `/meeting/${id_rapat}`,
    });
    return true;
  }

  /** Buka kembali rapat yang salah tertutup (Selesai / Dibatalkan) → Terjadwal lagi, siap dipakai. */
  async bukaKembali(id_rapat: number, id_karyawan: number) {
    const r = await this.moderatorSaja(id_rapat, id_karyawan);
    if (r.status !== 'Selesai' && r.status !== 'Dibatalkan') throw new BadRequestException('Rapat ini belum ditutup');
    await this.prisma.rapat.update({
      where: { id_rapat },
      data: { status: 'Terjadwal', mulai_at: null, selesai_at: null, diingatkan_at: null },
    });
    // Catatan hadir yang menggantung (belum keluar) ditutup agar tidak terhitung hadir terus
    await this.prisma.rapatKehadiran.updateMany({ where: { id_rapat, keluar_at: null }, data: { keluar_at: new Date() } });
    return true;
  }

  // ── Masuk rapat ──────────────────────────────────────────────────────────────
  async token(id_rapat: number, id_karyawan: number, semua = false) {
    const { r, moderator } = await this.rapatAnggota(id_rapat, id_karyawan, semua);
    if (r.status === 'Dibatalkan') throw new BadRequestException('Rapat ini dibatalkan');
    const lk = this.lk;
    const nama = (await this.namaKaryawan([id_karyawan])).get(id_karyawan)?.nama ?? `Karyawan ${id_karyawan}`;
    const token = buatToken(lk.key, lk.secret, {
      identity: identitas(id_karyawan), name: nama,
      metadata: JSON.stringify({ id_karyawan, moderator }),
      video: { room: r.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: moderator },
    });
    return { url: lk.url, token, identity: identitas(id_karyawan), nama, moderator, judul: r.judul };
  }

  /** Aksi moderator: keluarkan / bisukan peserta, akhiri rapat untuk semua */
  async kelola(id_rapat: number, id_karyawan: number, d: { aksi: string; identity?: string; track_sid?: string }) {
    const r = await this.moderatorSaja(id_rapat, id_karyawan);
    const grant = { roomAdmin: true, room: r.room };
    if (d.aksi === 'akhiri') {
      await this.roomService('DeleteRoom', { room: r.room }, { roomCreate: true });
      await this.selesaikan(r.id_rapat);
      return true;
    }
    if (!d.identity) throw new BadRequestException('Peserta wajib dipilih');
    if (d.identity === identitas(id_karyawan)) throw new BadRequestException('Tidak bisa ke diri sendiri');
    if (d.aksi === 'keluarkan') await this.roomService('RemoveParticipant', { room: r.room, identity: d.identity }, grant);
    else {
      if (!d.track_sid) throw new BadRequestException('Track audio wajib');
      await this.roomService('MutePublishedTrack', { room: r.room, identity: d.identity, track_sid: d.track_sid, muted: true }, grant);
    }
    return true;
  }

  private async selesaikan(id_rapat: number) {
    const now = new Date();
    await this.prisma.rapat.updateMany({ where: { id_rapat, status: { not: 'Dibatalkan' } }, data: { status: 'Selesai', selesai_at: now } });
    await this.prisma.rapatKehadiran.updateMany({ where: { id_rapat, keluar_at: null }, data: { keluar_at: now } });
  }

  // ── Webhook LiveKit ──────────────────────────────────────────────────────────
  async webhook(body: Buffer, auth: string | undefined) {
    const lk = this.lk;
    if (!verifikasiWebhook(lk.key, lk.secret, body, auth)) throw new ForbiddenException('Webhook tidak sah');
    let e: any;
    try { e = JSON.parse(body.toString('utf8')); } catch { throw new BadRequestException('Body webhook rusak'); }
    const roomName: string | undefined = e.room?.name;
    if (!roomName) return true;
    const r = await this.prisma.rapat.findUnique({ where: { room: roomName } });
    if (!r) return true;
    const waktu = e.createdAt ? new Date(Number(e.createdAt) * 1000) : new Date();
    const identity: string | undefined = e.participant?.identity;
    const idk = dariIdentitas(identity);

    switch (e.event) {
      case 'room_started':
      case 'participant_joined':
        if (r.status !== 'Berlangsung') await this.prisma.rapat.update({ where: { id_rapat: r.id_rapat }, data: { status: 'Berlangsung', mulai_at: r.mulai_at ?? waktu, selesai_at: null } });
        if (e.event === 'participant_joined' && identity) {
          await this.prisma.rapatKehadiran.create({
            data: { id_rapat: r.id_rapat, id_karyawan: idk, identity, nama_tamu: idk ? null : String(e.participant?.name || 'Tamu').slice(0, 200), masuk_at: waktu },
          });
        }
        break;
      case 'participant_left':
        if (identity) {
          const buka = await this.prisma.rapatKehadiran.findFirst({
            where: { id_rapat: r.id_rapat, keluar_at: null, ...(idk ? { id_karyawan: idk } : { identity }) },
            orderBy: { masuk_at: 'desc' },
          });
          if (buka) await this.prisma.rapatKehadiran.update({ where: { id_hadir: buka.id_hadir }, data: { keluar_at: waktu } });
        }
        break;
      case 'room_finished':
        await this.selesaikan(r.id_rapat);
        break;
    }
    return true;
  }
}
