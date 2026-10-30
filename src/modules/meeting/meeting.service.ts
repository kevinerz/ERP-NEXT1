import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  private async rapatAnggota(id_rapat: number, id_karyawan: number) {
    const r = await this.prisma.rapat.findUnique({ where: { id_rapat }, include: { peserta: true } });
    if (!r) throw new NotFoundException('Rapat tidak ditemukan');
    const saya = r.peserta.find((p) => p.id_karyawan === id_karyawan);
    if (!saya) throw new ForbiddenException('Anda tidak diundang ke rapat ini');
    return { r, moderator: saya.peran === 'moderator' };
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
  async daftar(id_karyawan: number) {
    const rapat = await this.prisma.rapat.findMany({
      where: { peserta: { some: { id_karyawan } } },
      include: { peserta: true, _count: { select: { kehadiran: true } } },
      orderBy: [{ created_at: 'desc' }],
      take: 100,
    });
    const nama = await this.namaKaryawan([...new Set(rapat.flatMap((r) => [r.id_pembuat, ...r.peserta.map((p) => p.id_karyawan)]))]);
    const bentuk = (r: (typeof rapat)[number]) => ({
      id_rapat: r.id_rapat, judul: r.judul, deskripsi: r.deskripsi, jadwal_at: r.jadwal_at, status: r.status,
      mulai_at: r.mulai_at, selesai_at: r.selesai_at, created_at: r.created_at,
      pembuat: nama.get(r.id_pembuat)?.nama ?? '-',
      moderator: r.peserta.some((p) => p.id_karyawan === id_karyawan && p.peran === 'moderator'),
      peserta: r.peserta.map((p) => ({ id_karyawan: p.id_karyawan, nama: nama.get(p.id_karyawan)?.nama ?? `#${p.id_karyawan}`, peran: p.peran })),
      jumlah_hadir: r._count.kehadiran,
    });
    const aktif = rapat.filter((r) => r.status === 'Terjadwal' || r.status === 'Berlangsung')
      .sort((a, b) => (a.status === 'Berlangsung' ? -1 : 0) - (b.status === 'Berlangsung' ? -1 : 0) || +(a.jadwal_at ?? a.created_at) - +(b.jadwal_at ?? b.created_at));
    const riwayat = rapat.filter((r) => r.status === 'Selesai' || r.status === 'Dibatalkan');
    return { aktif: aktif.map(bentuk), riwayat: riwayat.map(bentuk) };
  }

  async detail(id_rapat: number, id_karyawan: number) {
    const { r, moderator } = await this.rapatAnggota(id_rapat, id_karyawan);
    const hadir = await this.prisma.rapatKehadiran.findMany({ where: { id_rapat }, orderBy: { masuk_at: 'asc' } });
    const nama = await this.namaKaryawan([...new Set([r.id_pembuat, ...r.peserta.map((p) => p.id_karyawan)])]);
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
      mulai_at: r.mulai_at, selesai_at: r.selesai_at, created_at: r.created_at, moderator,
      pembuat: { id_karyawan: r.id_pembuat, nama: nama.get(r.id_pembuat)?.nama ?? '-' },
      peserta: r.peserta.map((p) => {
        const k = per.get(p.id_karyawan);
        return {
          id_karyawan: p.id_karyawan, nama: nama.get(p.id_karyawan)?.nama ?? `#${p.id_karyawan}`, jabatan: nama.get(p.id_karyawan)?.jabatan ?? '',
          peran: p.peran, hadir: !!k, online: k?.online ?? false, masuk_at: k?.masuk ?? null, keluar_at: k?.online ? null : k?.keluar ?? null,
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
  async buat(id_karyawan: number, d: { judul: string; deskripsi?: string; jadwal_at?: string; peserta: number[] }) {
    const ids = [...new Set(d.peserta.filter((x) => x !== id_karyawan))];
    const valid = await this.prisma.hrisKaryawan.findMany({ where: { id_karyawan: { in: ids }, status_aktif: true }, select: { id_karyawan: true } });
    const jadwal = d.jadwal_at ? new Date(d.jadwal_at) : null;
    const r = await this.prisma.rapat.create({
      data: {
        room: `rapat-${randomBytes(6).toString('hex')}`,
        judul: d.judul.trim(), deskripsi: d.deskripsi?.trim() || null, jadwal_at: jadwal, id_pembuat: id_karyawan,
        peserta: { create: [{ id_karyawan, peran: 'moderator' }, ...valid.map((v) => ({ id_karyawan: v.id_karyawan }))] },
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

  async ubah(id_rapat: number, id_karyawan: number, d: { judul?: string; deskripsi?: string; jadwal_at?: string | null }) {
    const r = await this.moderatorSaja(id_rapat, id_karyawan);
    if (r.status === 'Selesai' || r.status === 'Dibatalkan') throw new BadRequestException('Rapat sudah selesai / dibatalkan');
    await this.prisma.rapat.update({
      where: { id_rapat },
      data: {
        ...(d.judul !== undefined ? { judul: d.judul.trim() } : {}),
        ...(d.deskripsi !== undefined ? { deskripsi: d.deskripsi.trim() || null } : {}),
        ...(d.jadwal_at !== undefined ? { jadwal_at: d.jadwal_at ? new Date(d.jadwal_at) : null } : {}),
      },
    });
    return this.detail(id_rapat, id_karyawan);
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

  // ── Masuk rapat ──────────────────────────────────────────────────────────────
  async token(id_rapat: number, id_karyawan: number) {
    const { r, moderator } = await this.rapatAnggota(id_rapat, id_karyawan);
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
