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
}
