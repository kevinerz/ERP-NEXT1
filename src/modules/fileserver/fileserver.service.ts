import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { KredensialSmb, SmbClient } from './smb.client';

const KUNCI = 'fileserver';
const PENGELOLA = ['Admin', 'Director'];
type User = { id_user: number; nama_lengkap?: string; roles?: string[] };
interface Konfig { host: string; domain?: string; username: string; password_enc?: string; share_izin?: string[] }

/**
 * Modul File Server: menjelajah share SMB kantor (\\192.168.200.2) dari ERP.
 * Kredensial disimpan terenkripsi di app_settings (key "fileserver"), hanya Admin/Director yang bisa mengatur.
 * Hapus berkas/folder khusus Admin/Director/Manager Ops; unggah & buat folder untuk semua pemegang modul.
 */
@Injectable()
export class FileServerService {
  private readonly logger = new Logger('FileServer');
  constructor(private prisma: PrismaService, private crypto: SecretCryptoService, private smb: SmbClient) {}

  private async konfig(): Promise<Konfig | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KUNCI } });
    if (!row?.value) return null;
    try { return JSON.parse(row.value) as Konfig; } catch { return null; }
  }
  private async kredensial(): Promise<KredensialSmb> {
    const k = await this.konfig();
    if (!k?.host || !k.username || !k.password_enc) throw new BadRequestException('File server belum diatur — Admin perlu mengisi koneksi di halaman File Server');
    let password: string;
    try { password = this.crypto.decrypt(k.password_enc); } catch { throw new BadRequestException('Password file server tidak terbaca — atur ulang koneksi'); }
    return { host: k.host, username: k.username, password, domain: k.domain };
  }
  private cekShare(k: Konfig | null, share: string) {
    if (k?.share_izin?.length && !k.share_izin.includes(share)) throw new ForbiddenException('Share ini tidak dibuka untuk ERP');
  }
  private kelola(u: User) { return (u.roles ?? []).some((r) => PENGELOLA.includes(r)); }

  async status(u: User) {
    const k = await this.konfig();
    return { data: {
      terisi: !!(k?.host && k.username && k.password_enc),
      bisa_atur: this.kelola(u),
      bisa_hapus: this.kelola(u) || (u.roles ?? []).includes('Manager_Ops'),
      ...(this.kelola(u) && k ? { host: k.host, domain: k.domain ?? '', username: k.username, share_izin: k.share_izin ?? [] } : { host: k?.host ?? null }),
    } };
  }

  async atur(u: User, b: { host?: string; domain?: string; username?: string; password?: string; share_izin?: string[] }) {
    if (!this.kelola(u)) throw new ForbiddenException('Hanya Admin / Director yang bisa mengatur koneksi file server');
    const lama = await this.konfig();
    const host = (b.host ?? lama?.host ?? '').trim(), username = (b.username ?? lama?.username ?? '').trim(), domain = (b.domain ?? lama?.domain ?? '').trim();
    for (const [n, v] of [['Host', host], ['Username', username], ['Domain', domain], ['Password', b.password ?? '']] as const) {
      if (/[\r\n\0]/.test(v)) throw new BadRequestException(`${n} tidak boleh mengandung baris baru`);
    }
    if (!host || !username) throw new BadRequestException('Host dan username wajib diisi');
    const password_enc = b.password ? this.crypto.encrypt(b.password) : lama?.password_enc;
    if (!password_enc) throw new BadRequestException('Password wajib diisi');
    const baru: Konfig = { host, domain: domain || undefined, username, password_enc, share_izin: (b.share_izin ?? lama?.share_izin ?? []).filter(Boolean) };
    // Uji dulu sebelum disimpan — supaya password salah ketahuan langsung
    const shares = await this.smb.shares({ host, username, domain: baru.domain, password: b.password || this.crypto.decrypt(password_enc) });
    await this.prisma.appSetting.upsert({ where: { key: KUNCI }, create: { key: KUNCI, value: JSON.stringify(baru) }, update: { value: JSON.stringify(baru) } });
    this.logger.log(`Koneksi file server diatur oleh user ${u.id_user} (${username}@${host})`);
    return { message: `Terhubung ke \\\\${host} — ${shares.length} share terlihat`, data: { shares } };
  }

  async shares() {
    const k = await this.konfig();
    const s = await this.smb.shares(await this.kredensial());
    return { data: k?.share_izin?.length ? s.filter((x) => k.share_izin!.includes(x.nama)) : s };
  }

  async ls(share: string, dir: string) {
    this.cekShare(await this.konfig(), share);
    return { data: await this.smb.ls(await this.kredensial(), share, dir) };
  }

  async unduh(share: string, file: string) {
    this.cekShare(await this.konfig(), share);
    return this.smb.unduh(await this.kredensial(), share, file);
  }

  async unggah(u: User, share: string, dir: string, files: { originalname: string; path: string }[]) {
    this.cekShare(await this.konfig(), share);
    if (!files?.length) throw new BadRequestException('Pilih berkas yang akan diunggah');
    const k = await this.kredensial();
    const ok: string[] = [], gagal: { nama: string; alasan: string }[] = [];
    try {
      for (const f of files) {
        const nama = Buffer.from(f.originalname, 'latin1').toString('utf8'); // multer membaca nama sebagai latin1
        try { await this.smb.unggah(k, share, dir, nama, f.path); ok.push(nama); }
        catch (e: any) { gagal.push({ nama, alasan: e?.message ?? 'gagal' }); }
      }
    } finally { await Promise.all(files.map((f) => fs.rm(f.path, { force: true }))); }
    this.logger.log(`Unggah oleh user ${u.id_user} ke ${share}/${dir}: ${ok.length} ok, ${gagal.length} gagal`);
    return { message: gagal.length ? `${ok.length} berkas terunggah, ${gagal.length} gagal` : `${ok.length} berkas terunggah`, data: { ok, gagal } };
  }

  async folder(u: User, share: string, dir: string, nama: string) {
    this.cekShare(await this.konfig(), share);
    await this.smb.buatFolder(await this.kredensial(), share, dir, (nama || '').trim());
    this.logger.log(`Folder dibuat oleh user ${u.id_user}: ${share}/${dir}/${nama}`);
    return { message: `Folder "${nama}" dibuat` };
  }

  async gantiNama(u: User, share: string, item: string, baru: string) {
    this.cekShare(await this.konfig(), share);
    await this.smb.gantiNama(await this.kredensial(), share, item, (baru || '').trim());
    this.logger.log(`Ganti nama oleh user ${u.id_user}: ${share}/${item} → ${baru}`);
    return { message: 'Nama diganti' };
  }

  async hapus(u: User, share: string, item: string, folder: boolean) {
    if (!this.kelola(u) && !(u.roles ?? []).includes('Manager_Ops')) throw new ForbiddenException('Menghapus berkas hanya untuk Admin / Director / Manager Ops');
    this.cekShare(await this.konfig(), share);
    await this.smb.hapus(await this.kredensial(), share, item, folder);
    this.logger.warn(`HAPUS oleh user ${u.id_user}: ${share}/${item}${folder ? ' (folder + isi)' : ''}`);
    return { message: folder ? 'Folder beserta isinya dihapus' : 'Berkas dihapus' };
  }

  // ─── Impor BA dari file server ke dokumen site ────────────────────────────────
  // Berkas TIDAK disalin — dicatat sebagai tautan "smb://<share>/<path>" di site_dokumen (jenis BA)
  // dan diambil langsung dari file server saat dibuka.

  private static KATA_UMUM = new Set(('ba berita acara aktivasi psb pemasangan pasang baru bast serah terima instalasi installasi scan ttd final rev revisi ' +
    'fo upgrade downgrade dismantle relokasi migrasi site store outlet toko dan pt tbk the copy signed of doc docx pdf jpg jpeg png nextone next1 ' +
    'perdana global internet layanan link new baru2 januari februari maret april mei juni juli agustus september oktober november desember ' +
    'jan feb mar apr jun jul agu agt ags sep okt nov des dokumentasi form dismantel maintenance perangkat aktif ' +
    'img wa whatsapp image at screenshot foto photo dedicated broadband laporan divisi teknis periode mike titipan next').split(' '));
  private static SINONIM: Record<string, string[]> = {
    kk: ['kopi', 'kenangan'], ahi: ['ace'], acehardware: ['ace'], kawanlama: ['kawan', 'lama'],
    ss: ['sports', 'station'], sportstation: ['sports', 'station'], sport: ['sports'], fore: ['fore'], cp: ['centrepark'], centralpark: ['central', 'park'],
  };

  static token(teks: string): string[] {
    const t = teks.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
    const hasil: string[] = [];
    for (const w of t) {
      if (/^\d+$/.test(w) || w.length < 2 || FileServerService.KATA_UMUM.has(w)) continue;
      hasil.push(...(FileServerService.SINONIM[w] ?? [w]));
    }
    return [...new Set(hasil)];
  }

  async pratinjauBa(u: User, share: string, dir: string, denganFoto = false) {
    if (!this.kelola(u)) throw new ForbiddenException('Impor BA hanya untuk Admin / Director');
    this.cekShare(await this.konfig(), share);
    const t0 = Date.now();
    const semua = await this.smb.lsRekursif(await this.kredensial(), share, dir);
    // Default hanya dokumen (PDF/Word); foto dokumentasi ikut bila diminta
    const EXT = denganFoto ? /\.(pdf|docx?|jpe?g|png)$/i : /\.(pdf|docx?)$/i;
    const berkas = semua.filter((f) => EXT.test(f.nama) && !f.tersembunyi && f.ukuran > 1024);

    const [sites, sudah] = await Promise.all([
      this.prisma.sitePelanggan.findMany({ select: { id_site: true, nama_site: true, kode_site: true, kota: true, status_site: true, pelanggan: { select: { nama_pelanggan: true } } } }),
      this.prisma.siteDokumen.findMany({ where: { url_file: { startsWith: `smb://${share}/` } }, select: { url_file: true, id_site: true } }),
    ]);
    const sudahSet = new Set(sudah.map((d) => d.url_file));
    // Indeks kata → site
    const tokSite = new Map<number, string[]>(), indeks = new Map<string, number[]>();
    for (const st of sites) {
      const tk = FileServerService.token(st.nama_site);
      tokSite.set(st.id_site, tk);
      for (const w of tk) indeks.set(w, [...(indeks.get(w) ?? []), st.id_site]);
    }
    const infoSite = new Map(sites.map((x) => [x.id_site, x]));

    const hasil = berkas.map((f) => {
      // Nama berkas umum (IMG-…, WhatsApp Image …) → pakai nama folder terdekat yang bermakna
      let tf = FileServerService.token(f.nama);
      if (tf.length < 2) {
        const folders = f.path.split('/').slice(0, -1).reverse();
        for (const fd of folders) { const t = FileServerService.token(fd); if (t.length >= 2) { tf = [...new Set([...tf, ...t])]; break; } }
      }
      const kandidat = new Map<number, number>();
      for (const w of tf) for (const id of indeks.get(w) ?? []) kandidat.set(id, (kandidat.get(id) ?? 0) + 1);
      const skor = [...kandidat].map(([id, cocok]) => {
        const ts = tokSite.get(id)!.length || 1;
        const p = cocok / ts, r = cocok / (tf.length || 1);
        return { id, cocok, f1: p + r ? (2 * p * r) / (p + r) : 0, p };
      }).filter((x) => x.cocok >= 2 || (x.cocok === 1 && x.p === 1 && tf.length === 1))
        .sort((a, b) => b.f1 - a.f1 || b.p - a.p).slice(0, 3);
      const terbaik = skor[0], kedua = skor[1];
      const yakin = !!terbaik && terbaik.f1 >= 0.7 && terbaik.p >= 0.75 && (!kedua || terbaik.f1 - kedua.f1 >= 0.12);
      const url = `smb://${share}/${f.path}`;
      return {
        path: f.path, nama: f.nama, ukuran: f.ukuran, diubah: f.diubah,
        sudah: sudahSet.has(url),
        status: !terbaik ? 'tidak_cocok' : yakin ? 'yakin' : 'ragu',
        kandidat: skor.map((x) => ({ id_site: x.id, nama_site: infoSite.get(x.id)!.nama_site, kode_site: infoSite.get(x.id)!.kode_site, pelanggan: infoSite.get(x.id)!.pelanggan?.nama_pelanggan, status_site: infoSite.get(x.id)!.status_site, skor: Math.round(x.f1 * 100) })),
      };
    });
    const hitung = (st: string) => hasil.filter((h) => h.status === st && !h.sudah).length;
    this.logger.log(`Pratinjau impor BA ${share}/${dir}: ${berkas.length} berkas dalam ${Date.now() - t0} ms`);
    return { data: { total: berkas.length, yakin: hitung('yakin'), ragu: hitung('ragu'), tidak_cocok: hitung('tidak_cocok'), sudah: hasil.filter((h) => h.sudah).length, berkas: hasil } };
  }

  /** Simpan tautan BA ke dokumen site. item: { path, id_site, nama, ukuran } */
  async terapkanBa(u: User, share: string, items: { path: string; id_site: number; nama: string; ukuran?: number }[]) {
    if (!this.kelola(u)) throw new ForbiddenException('Impor BA hanya untuk Admin / Director');
    this.cekShare(await this.konfig(), share);
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('Tidak ada berkas yang dipilih');
    if (items.length > 5000) throw new BadRequestException('Maksimal 5.000 berkas per impor');
    const ids = [...new Set(items.map((x) => Number(x.id_site)))];
    const ada = new Set((await this.prisma.sitePelanggan.findMany({ where: { id_site: { in: ids } }, select: { id_site: true } })).map((x) => x.id_site));
    const urlAda = new Set((await this.prisma.siteDokumen.findMany({ where: { url_file: { in: items.map((x) => `smb://${share}/${x.path}`) } }, select: { url_file: true } })).map((x) => x.url_file));
    const data = items.filter((x) => ada.has(Number(x.id_site)) && !urlAda.has(`smb://${share}/${x.path}`)).map((x) => {
      SmbClient.pathAman(x.path); // validasi
      const nama = String(x.nama || x.path.split('/').pop()).slice(0, 255);
      return {
        id_site: Number(x.id_site), nama_file: nama, url_file: `smb://${share}/${x.path}`,
        tipe_file: (nama.split('.').pop() || 'bin').toLowerCase().slice(0, 10), jenis: /\.(jpe?g|png)$/i.test(nama) ? 'LAIN' : 'BA',
        keterangan: `File server: ${share}/${x.path.split('/').slice(0, -1).join('/')}`.slice(0, 500),
        ukuran_byte: x.ukuran ? Math.min(Number(x.ukuran), 2_147_483_647) : null,
      };
    });
    for (let i = 0; i < data.length; i += 500) await this.prisma.siteDokumen.createMany({ data: data.slice(i, i + 500) });
    this.logger.log(`Impor BA oleh user ${u.id_user}: ${data.length} tautan dokumen dibuat`);
    return { message: `${data.length} BA ditautkan ke ${new Set(data.map((d) => d.id_site)).size} site`, data: { dibuat: data.length, dilewati: items.length - data.length } };
  }

  /** Ambil berkas dokumen site yang tersimpan di file server (url smb://share/path) */
  async unduhDokumenSite(url: string) {
    const m = url.match(/^smb:\/\/([^/]+)\/(.+)$/);
    if (!m) throw new BadRequestException('Bukan dokumen file server');
    return { lokal: await this.smb.unduh(await this.kredensial(), m[1]!, m[2]!), nama: m[2]!.split('/').pop()! };
  }
}
