import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalNomor } from './wa.service';

// Statistik kinerja helpdesk WhatsApp + tiket gangguan. Semua pengelompokan waktu memakai WIB (UTC+7).
const WIB = 7 * 3600_000;
const HARI_MS = 86_400_000;

type Baris = {
  id_pesan: number; id_chat: number; waktu: Date; dari_saya: number | boolean; id_karyawan: number | null;
  pengirim_jid: string | null; tipe: string; awal: string | null; pjg: number | bigint | null; is_grup: number | boolean;
};
// Satu "giliran" pelanggan: deretan pesan masuk berturut-turut sampai dibalas staf
type Giliran = { id_chat: number; mulai: number; balas: number | null; oleh: string | null; penutup: boolean };

// Pesan penutup ("oke", "terima kasih", stiker…) tidak menuntut balasan
const PENUTUP = /^\s*(ok[eyai]*|oc|siap|sip|baik|noted|done|mantap|thanks?|thx|tq|ty|terima\s*kasih|trims|makasih|sama[\s-]*sama|sama2|sama²|👍|🙏)/i;
const UCAPAN = /(terima\s*kasih|terimakasih|makasih|trims|thank|senang hati|\bs\w{0,2}ma+[\s"”'²2.-]*(s\w{0,2}ma+|["”'²2]))/i;
function penutup(r: Baris) {
  if (r.tipe === 'sticker') return true;
  if (r.tipe !== 'text' || !r.awal) return false;
  const pjg = Number(r.pjg ?? r.awal.length);
  if (r.awal.includes('?')) return false;
  // Pendek & diawali kata penutup, atau ucapan terima kasih/sama-sama yang tidak terlalu panjang
  return (pjg <= 30 && PENUTUP.test(r.awal)) || (pjg <= 70 && UCAPAN.test(r.awal));
}

export type StatistikQuery = { dari?: string; sampai?: string; jenis?: string; jam_kerja?: string };

/** Jam kerja helpdesk: Senin–Sabtu 08.00–17.00 WIB */
function jamKerja(ms: number) {
  const d = new Date(ms + WIB);
  const h = d.getUTCHours();
  return d.getUTCDay() !== 0 && h >= 8 && h < 17;
}
const tglWib = (ms: number) => new Date(ms + WIB).toISOString().slice(0, 10);
function median(a: number[]) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function persentil(a: number[], p: number) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
}
const rata = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const detik = (ms: number | null) => (ms == null ? null : Math.round(ms / 1000));

@Injectable()
export class WaStatistikService {
  constructor(private prisma: PrismaService) {}

  async ringkasan(q: StatistikQuery) {
    const sekarang = Date.now();
    const hariIni = tglWib(sekarang);
    const sampaiTgl = q.sampai && /^\d{4}-\d{2}-\d{2}$/.test(q.sampai) ? q.sampai : hariIni;
    const dariTgl = q.dari && /^\d{4}-\d{2}-\d{2}$/.test(q.dari) ? q.dari : tglWib(sekarang - 6 * HARI_MS);
    const dari = Date.parse(`${dariTgl}T00:00:00Z`) - WIB;
    const sampai = Date.parse(`${sampaiTgl}T00:00:00Z`) - WIB + HARI_MS; // eksklusif
    if (!(sampai > dari)) throw new BadRequestException('Rentang tanggal tidak valid');
    if (sampai - dari > 92 * HARI_MS) throw new BadRequestException('Rentang maksimal 92 hari');
    const jenis = q.jenis === 'pribadi' || q.jenis === 'grup' ? q.jenis : 'semua';
    const hanyaJamKerja = q.jam_kerja === '1' || q.jam_kerja === 'true';

    const [staf, nomorKaryawan, akun] = await Promise.all([this.staf(), this.nomorKaryawan(), this.prisma.waAkun.findFirst({ orderBy: { id_akun: 'asc' } })]);
    const filterGrup = jenis === 'pribadi' ? 'AND c.is_grup = 0' : jenis === 'grup' ? 'AND c.is_grup = 1' : '';

    // Pesan periode + 2 hari sesudahnya supaya balasan untuk pesan di akhir periode tetap terhitung
    const batasAkhir = Math.min(sampai + 2 * HARI_MS, sekarang + 60_000);
    const lidKeNomor = await this.lidKeNomor();
    const internal = await this.chatInternal(nomorKaryawan, lidKeNomor);
    const rows = (await this.muatPesan(new Date(dari - HARI_MS), new Date(batasAkhir), filterGrup)).filter((r) => !internal.has(r.id_chat));

    const stafDari = (r: Baris): string | null => {
      if (r.dari_saya) {
        if (r.id_karyawan) return staf.get(r.id_karyawan) ?? `Karyawan #${r.id_karyawan}`;
        const ttd = r.awal?.match(/^\*([^*\n]{2,40})\*/)?.[1]?.trim();
        return (ttd && this.cocokkanTtd(ttd, staf)) || 'HP Helpdesk (tanpa nama)';
      }
      // Di grup, karyawan NEXT1 yang membalas dari HP pribadinya dihitung sebagai balasan staf
      if (!r.is_grup) return null; // null = pesan pelanggan
      const nomor = this.nomorPengirim(r.pengirim_jid, lidKeNomor);
      const k = nomor ? nomorKaryawan.get(nomor) : undefined;
      return k ? `${k} (HP pribadi)` : null;
    };

    // ── Telusuri per chat ──
    const masukHarian = new Map<string, { masuk: number; keluar: number }>();
    const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    const perChat = new Map<number, { masuk: number; keluar: number; respon: number[] }>();
    const perStaf = new Map<string, { pesan: number; chat: Set<number>; respon: number[] }>();
    const tipe = new Map<string, { masuk: number; keluar: number }>();
    const giliran: Giliran[] = [];
    let masuk = 0, keluar = 0;
    const chatAktif = new Set<number>();
    const chatGrup = new Set<number>();

    let chatSkrg = -1;
    let buka: Giliran | null = null;
    const tutupChat = () => { if (buka) giliran.push(buka); buka = null; };
    for (const r of rows) {
      if (r.id_chat !== chatSkrg) { tutupChat(); chatSkrg = r.id_chat; }
      const t = new Date(r.waktu).getTime();
      const dariStaf = stafDari(r);
      const dalam = t >= dari && t < sampai;
      if (dalam) {
        chatAktif.add(r.id_chat);
        if (r.is_grup) chatGrup.add(r.id_chat);
        const tg = tglWib(t);
        const h = masukHarian.get(tg) ?? { masuk: 0, keluar: 0 };
        const c = perChat.get(r.id_chat) ?? { masuk: 0, keluar: 0, respon: [] };
        const tp = tipe.get(r.tipe) ?? { masuk: 0, keluar: 0 };
        if (dariStaf) {
          keluar++; h.keluar++; c.keluar++; tp.keluar++;
          const s = perStaf.get(dariStaf) ?? { pesan: 0, chat: new Set<number>(), respon: [] };
          s.pesan++; s.chat.add(r.id_chat);
          perStaf.set(dariStaf, s);
        } else {
          masuk++; h.masuk++; c.masuk++; tp.masuk++;
          const d = new Date(t + WIB);
          heat[d.getUTCDay()]![d.getUTCHours()]!++;
        }
        masukHarian.set(tg, h); perChat.set(r.id_chat, c); tipe.set(r.tipe, tp);
      }
      if (dariStaf) {
        if (buka) { buka.balas = t; buka.oleh = dariStaf; giliran.push(buka); buka = null; }
      } else if (!buka) {
        buka = { id_chat: r.id_chat, mulai: t, balas: null, oleh: null, penutup: penutup(r) };
      } else if (!penutup(r)) {
        buka.penutup = false;
      }
    }
    tutupChat();

    // ── Waktu respon pertama ──
    const dihitung = giliran.filter((g) => g.mulai >= dari && g.mulai < sampai && (!hanyaJamKerja || jamKerja(g.mulai)) && !(g.balas == null && g.penutup));
    const dibalas = dihitung.filter((g) => g.balas != null);
    const respon = dibalas.map((g) => g.balas! - g.mulai);
    const responHarian = new Map<string, number[]>();
    const responJam = Array.from({ length: 24 }, () => [] as number[]);
    for (const g of dibalas) {
      const ms = g.balas! - g.mulai;
      const tg = tglWib(g.mulai);
      const rh = responHarian.get(tg) ?? [];
      rh.push(ms);
      responHarian.set(tg, rh);
      responJam[new Date(g.mulai + WIB).getUTCHours()]!.push(ms);
      perChat.get(g.id_chat)?.respon.push(ms);
      const s = perStaf.get(g.oleh!);
      if (s) s.respon.push(ms);
    }
    const ember = [
      { label: '≤ 1 menit', maks: 60_000 }, { label: '1–5 menit', maks: 300_000 }, { label: '5–15 menit', maks: 900_000 },
      { label: '15–60 menit', maks: 3_600_000 }, { label: '1–4 jam', maks: 14_400_000 }, { label: '> 4 jam', maks: Infinity },
    ];
    const distribusi = ember.map((e, i) => ({
      label: e.label,
      jumlah: respon.filter((ms) => ms <= e.maks && (i === 0 || ms > ember[i - 1]!.maks)).length,
    }));

    // ── Seri harian (semua tanggal periode, termasuk yang kosong) ──
    const harian = [];
    for (let t = dari; t < sampai; t += HARI_MS) {
      const tg = tglWib(t);
      const h = masukHarian.get(tg) ?? { masuk: 0, keluar: 0 };
      const r = responHarian.get(tg) ?? [];
      harian.push({ tanggal: tg, masuk: h.masuk, keluar: h.keluar, respon_median: detik(median(r)), respon_n: r.length });
    }

    // ── Nama chat untuk tabel ──
    const idChat = [...perChat.keys()];
    const infoChat = idChat.length
      ? await this.prisma.waChat.findMany({ where: { id_chat: { in: idChat } }, select: { id_chat: true, nama: true, jid: true, is_grup: true } })
      : [];
    const namaChat = new Map(infoChat.map((c) => [c.id_chat, c]));
    const topChat = [...perChat.entries()]
      .sort((a, b) => b[1].masuk + b[1].keluar - (a[1].masuk + a[1].keluar))
      .slice(0, 15)
      .map(([id, c]) => ({
        id_chat: id, nama: namaChat.get(id)?.nama || namaChat.get(id)?.jid.split('@')[0] || `#${id}`, is_grup: !!namaChat.get(id)?.is_grup,
        masuk: c.masuk, keluar: c.keluar, respon_median: detik(median(c.respon)),
      }));

    // ── PIC chat saat ini (snapshot) ──
    const pic = akun
      ? await this.prisma.waChat.groupBy({ by: ['id_karyawan_pic', 'status'], where: { id_akun: akun.id_akun, id_karyawan_pic: { not: null } }, _count: true })
      : [];
    const picPerStaf = new Map<string, { terbuka: number; selesai: number }>();
    for (const p of pic) {
      const nama = staf.get(p.id_karyawan_pic!) ?? `Karyawan #${p.id_karyawan_pic}`;
      const x = picPerStaf.get(nama) ?? { terbuka: 0, selesai: 0 };
      if (p.status === 'Selesai') x.selesai += p._count; else x.terbuka += p._count;
      picPerStaf.set(nama, x);
    }
    const namaStaf = new Set([...perStaf.keys(), ...picPerStaf.keys()]);
    const perStafList = [...namaStaf].map((nama) => {
      const s = perStaf.get(nama);
      const p = picPerStaf.get(nama);
      return {
        nama, pesan: s?.pesan ?? 0, chat: s?.chat.size ?? 0, respon_n: s?.respon.length ?? 0,
        respon_median: detik(median(s?.respon ?? [])), respon_rata: detik(rata(s?.respon ?? [])),
        pic_terbuka: p?.terbuka ?? 0, pic_selesai: p?.selesai ?? 0,
      };
    }).sort((a, b) => b.pesan - a.pesan || b.pic_terbuka - a.pic_terbuka);

    const [antrean, chatBaru, tiket] = await Promise.all([
      this.antrean(filterGrup, staf, nomorKaryawan, lidKeNomor, internal),
      this.chatBaru(new Date(dari), new Date(sampai), filterGrup),
      this.tiket(new Date(dari), new Date(sampai), dari, sampai),
    ]);

    return {
      periode: { dari: dariTgl, sampai: sampaiTgl, jenis, jam_kerja: hanyaJamKerja },
      kpi: {
        masuk, keluar, chat_aktif: chatAktif.size, chat_grup: chatGrup.size, chat_pribadi: chatAktif.size - chatGrup.size, chat_baru: chatBaru,
        giliran: dihitung.length, dibalas: dibalas.length, tidak_dibalas: dihitung.length - dibalas.length,
        respon_median: detik(median(respon)), respon_p90: detik(persentil(respon, 90)), respon_rata: detik(rata(respon)),
        pct_5menit: respon.length ? respon.filter((ms) => ms <= 300_000).length / respon.length : null,
        pct_15menit: respon.length ? respon.filter((ms) => ms <= 900_000).length / respon.length : null,
        antrean: antrean.length,
      },
      harian,
      heatmap: heat,
      respon_jam: responJam.map((a) => ({ n: a.length, median: detik(median(a)) })),
      distribusi,
      staf: perStafList,
      top_chat: topChat,
      tipe: [...tipe.entries()].map(([t, v]) => ({ tipe: t, ...v })).sort((a, b) => b.masuk + b.keluar - (a.masuk + a.keluar)),
      antrean,
      tiket,
    };
  }

  // ── Bantuan ──────────────────────────────────────────────────────────────────
  private async muatPesan(dari: Date, sampai: Date, filterGrup: string): Promise<Baris[]> {
    return this.prisma.$queryRawUnsafe<Baris[]>(
      `SELECT p.id_pesan, p.id_chat, p.waktu, p.dari_saya, p.id_karyawan, p.pengirim_jid, p.tipe, LEFT(p.teks, 50) AS awal, CHAR_LENGTH(p.teks) AS pjg, c.is_grup
       FROM wa_pesan p JOIN wa_chat c ON c.id_chat = p.id_chat
       WHERE p.waktu >= ? AND p.waktu < ? AND p.dihapus = 0 AND p.tipe <> 'unsupported' ${filterGrup}
       ORDER BY p.id_chat, p.waktu, p.id_pesan`,
      dari, sampai,
    );
  }

  private namaStaf: { at: number; map: Map<number, string> } | null = null;
  private async staf() {
    if (this.namaStaf && Date.now() - this.namaStaf.at < 5 * 60_000) return this.namaStaf.map;
    const k = await this.prisma.hrisKaryawan.findMany({ select: { id_karyawan: true, nama_lengkap: true } });
    this.namaStaf = { at: Date.now(), map: new Map(k.map((x) => [x.id_karyawan, x.nama_lengkap.trim()])) };
    return this.namaStaf.map;
  }

  /** Tanda tangan "*Nama*" di awal pesan → nama lengkap karyawan bila nama depannya unik */
  private cocokkanTtd(ttd: string, staf: Map<number, string>) {
    const kunci = ttd.toLowerCase();
    const cocok = [...staf.values()].filter((n) => n.toLowerCase() === kunci || n.toLowerCase().split(/\s+/)[0] === kunci);
    // Teks tebal lain di awal pesan ("*DONE :*", tanggal, judul) bukan tanda tangan
    return cocok.length === 1 ? cocok[0]! : null;
  }

  private async nomorKaryawan() {
    const k = await this.prisma.hrisKaryawan.findMany({ where: { status_aktif: true, no_hp: { not: null } }, select: { nama_lengkap: true, no_hp: true } });
    const m = new Map<string, string>();
    for (const x of k) { const n = normalNomor(x.no_hp); if (n) m.set(n, x.nama_lengkap.trim()); }
    return m;
  }

  private async lidKeNomor() {
    const r = await this.prisma.waChat.findMany({ where: { lid: { not: null }, is_grup: false }, select: { lid: true, jid: true } });
    return new Map(r.map((x) => [x.lid!.split('@')[0]!.split(':')[0]!, x.jid.split('@')[0]!]));
  }

  private nomorPengirim(jid: string | null, lid: Map<string, string>) {
    if (!jid) return null;
    const [user, domain] = jid.split('@');
    const u = user!.split(':')[0]!;
    return domain === 'lid' ? lid.get(u) ?? null : normalNomor(u);
  }

  /** Chat terbuka yang pesan terakhirnya dari pelanggan (belum dibalas), 7 hari terakhir */
  private async antrean(filterGrup: string, staf: Map<number, string>, nomorKaryawan: Map<string, string>, lid: Map<string, string>, internal: Set<number>) {
    const rows = await this.prisma.$queryRawUnsafe<Baris[]>(
      `SELECT p.id_pesan, p.id_chat, p.waktu, p.dari_saya, p.id_karyawan, p.pengirim_jid, p.tipe, LEFT(p.teks, 80) AS awal, CHAR_LENGTH(p.teks) AS pjg, c.is_grup
       FROM wa_pesan p JOIN wa_chat c ON c.id_chat = p.id_chat
       WHERE c.status = 'Terbuka' AND c.waktu_terakhir >= ? AND p.waktu >= ? AND p.dihapus = 0 AND p.tipe <> 'unsupported' ${filterGrup}
       ORDER BY p.id_chat, p.waktu, p.id_pesan`,
      new Date(Date.now() - 7 * HARI_MS), new Date(Date.now() - 8 * HARI_MS),
    );
    const tunggu = new Map<number, { mulai: number; jumlah: number; terakhir: string | null; penutup: boolean }>();
    for (const r of rows) {
      if (internal.has(r.id_chat)) continue;
      const nomor = r.is_grup ? this.nomorPengirim(r.pengirim_jid, lid) : null;
      const staff = !!r.dari_saya || (!!nomor && nomorKaryawan.has(nomor));
      if (staff) { tunggu.delete(r.id_chat); continue; }
      const t = tunggu.get(r.id_chat);
      if (t) { t.jumlah++; t.terakhir = r.awal; t.penutup &&= penutup(r); }
      else tunggu.set(r.id_chat, { mulai: new Date(r.waktu).getTime(), jumlah: 1, terakhir: r.awal, penutup: penutup(r) });
    }
    for (const [id, t] of tunggu) if (t.penutup) tunggu.delete(id);
    if (!tunggu.size) return [];
    const chat = await this.prisma.waChat.findMany({
      where: { id_chat: { in: [...tunggu.keys()] } },
      select: { id_chat: true, nama: true, jid: true, is_grup: true, id_karyawan_pic: true },
    });
    return chat
      .map((c) => {
        const t = tunggu.get(c.id_chat)!;
        return {
          id_chat: c.id_chat, nama: c.nama || c.jid.split('@')[0], is_grup: c.is_grup,
          pic: c.id_karyawan_pic ? staf.get(c.id_karyawan_pic) ?? null : null,
          sejak: new Date(t.mulai), tunggu_detik: Math.round((Date.now() - t.mulai) / 1000), jumlah: t.jumlah, terakhir: t.terakhir,
        };
      })
      .sort((a, b) => b.tunggu_detik - a.tunggu_detik);
  }

  /** Chat pribadi dengan nomor karyawan NEXT1 = koordinasi internal, bukan layanan pelanggan */
  private async chatInternal(nomorKaryawan: Map<string, string>, lid: Map<string, string>) {
    const c = await this.prisma.waChat.findMany({ where: { is_grup: false }, select: { id_chat: true, jid: true } });
    const set = new Set<number>();
    for (const x of c) {
      const n = this.nomorPengirim(x.jid, lid);
      if (n && nomorKaryawan.has(n)) set.add(x.id_chat);
    }
    return set;
  }

  /** Chat yang pesan pertamanya (sepanjang riwayat) jatuh di periode ini */
  private async chatBaru(dari: Date, sampai: Date, filterGrup: string) {
    const r = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM (
         SELECT p.id_chat, MIN(p.waktu) AS awal FROM wa_pesan p JOIN wa_chat c ON c.id_chat = p.id_chat WHERE 1=1 ${filterGrup} GROUP BY p.id_chat
       ) x WHERE x.awal >= ? AND x.awal < ?`,
      dari, sampai,
    );
    return Number(r[0]?.n ?? 0);
  }

  private async tiket(dariD: Date, sampaiD: Date, dari: number, sampai: number) {
    const [dibuka, selesai, terbuka, situs, jenis] = await Promise.all([
      this.prisma.operationTicket.findMany({ where: { tgl_open: { gte: dariD, lt: sampaiD } }, select: { tgl_open: true, sla_breached: true, prioritas: true, sumber_tiket: true } }),
      this.prisma.operationTicket.findMany({ where: { tgl_resolved: { gte: dariD, lt: sampaiD } }, select: { tgl_open: true, tgl_resolved: true } }),
      this.prisma.operationTicket.count({ where: { status_tiket: { notIn: ['Resolved', 'Closed'] } } }),
      this.prisma.operationTicket.groupBy({ by: ['id_site'], where: { tgl_open: { gte: dariD, lt: sampaiD } }, _count: true, orderBy: { _count: { id_site: 'desc' } }, take: 10 }),
      this.prisma.operationTicket.groupBy({ by: ['jenis_gangguan'], where: { tgl_open: { gte: dariD, lt: sampaiD } }, _count: true }),
    ]);
    const site = situs.length
      ? await this.prisma.sitePelanggan.findMany({ where: { id_site: { in: situs.map((s) => s.id_site) } }, select: { id_site: true, kode_site: true, nama_site: true } })
      : [];
    const namaSite = new Map(site.map((s) => [s.id_site, s]));
    const durasi = selesai.map((t) => t.tgl_resolved!.getTime() - t.tgl_open.getTime()).filter((ms) => ms >= 0);
    const harian = [];
    for (let t = dari; t < sampai; t += HARI_MS) {
      const tg = tglWib(t);
      harian.push({
        tanggal: tg,
        dibuka: dibuka.filter((x) => tglWib(x.tgl_open.getTime()) === tg).length,
        selesai: selesai.filter((x) => tglWib(x.tgl_resolved!.getTime()) === tg).length,
      });
    }
    const hitung = <T,>(a: T[], f: (x: T) => string) => {
      const m = new Map<string, number>();
      for (const x of a) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
      return [...m.entries()].map(([label, jumlah]) => ({ label, jumlah })).sort((a, b) => b.jumlah - a.jumlah);
    };
    return {
      dibuka: dibuka.length, selesai: selesai.length, terbuka_sekarang: terbuka,
      sla_lewat: dibuka.filter((t) => t.sla_breached).length,
      mttr_median: detik(median(durasi)), mttr_rata: detik(rata(durasi)),
      harian,
      prioritas: hitung(dibuka, (t) => t.prioritas),
      sumber: hitung(dibuka, (t) => t.sumber_tiket),
      jenis: jenis.map((j) => ({ label: j.jenis_gangguan || 'Belum diisi', jumlah: j._count })).sort((a, b) => b.jumlah - a.jumlah),
      top_site: situs.map((s) => ({
        id_site: s.id_site, kode: namaSite.get(s.id_site)?.kode_site ?? '', nama: namaSite.get(s.id_site)?.nama_site ?? `#${s.id_site}`, jumlah: s._count,
      })),
    };
  }
}
