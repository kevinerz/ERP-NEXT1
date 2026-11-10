import { BadRequestException, Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';

export interface KredensialSmb { host: string; username: string; password: string; domain?: string }
export interface ItemSmb { nama: string; folder: boolean; ukuran: number; diubah: string | null; tersembunyi: boolean }

/**
 * Klien SMB lewat `smbclient` (paket samba). Aman dari injeksi:
 *  - dijalankan dengan execFile (tanpa shell), argumen terpisah;
 *  - password TIDAK di argumen (terlihat di daftar proses) — ditulis ke file autentikasi
 *    sementara izin 600 lalu dihapus;
 *  - nama share / path / berkas divalidasi: tidak boleh ada tanda kutip, titik koma, baris baru,
 *    ".." atau karakter kendali, karena dipakai di skrip perintah smbclient (-c).
 */
@Injectable()
export class SmbClient {
  private readonly logger = new Logger('FileServer');

  /** Validasi satu bagian path (nama folder / berkas) */
  static bagianAman(s: string) {
    if (!s || s.length > 255) return false;
    if (s === '.' || s === '..') return false;
    return !/["';\r\n\t\0\\/:*?<>|]/.test(s) && !/[\x00-\x1f]/.test(s);
  }
  /** Path relatif di dalam share: "a/b/c" → dipecah & divalidasi, hasil "a\b\c" */
  static pathAman(p: string): string {
    const bagian = (p || '').split(/[\\/]+/).filter(Boolean);
    for (const b of bagian) if (!SmbClient.bagianAman(b)) throw new BadRequestException(`Nama tidak diizinkan: "${b}" — hindari karakter " ; : * ? < > | \\ dan ".."`);
    return bagian.join('\\');
  }
  static shareAman(s: string) {
    if (!/^[A-Za-z0-9 _.\-$]{1,80}$/.test(s || '')) throw new BadRequestException('Nama share tidak valid');
    return s;
  }

  private async jalankan(k: KredensialSmb, args: string[], timeoutMs = 60_000): Promise<string> {
    if (!/^[A-Za-z0-9.\-_]{1,253}$/.test(k.host)) throw new BadRequestException('Alamat file server tidak valid');
    const auth = path.join(os.tmpdir(), `smb-${randomBytes(8).toString('hex')}`);
    await fs.writeFile(auth, `username=${k.username}\npassword=${k.password}\n${k.domain ? `domain=${k.domain}\n` : ''}`, { mode: 0o600 });
    try {
      return await new Promise<string>((resolve, reject) => {
        execFile('smbclient', [...args, '-A', auth], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
          const out = `${stdout}\n${stderr}`;
          const status = out.match(/NT_STATUS_[A-Z_]+/)?.[0];
          if (status) return reject(this.terjemah(status));
          if (err) return reject(new BadRequestException(`File server: ${(stderr || err.message).trim().split('\n').pop()}`));
          resolve(stdout);
        });
      });
    } finally {
      await fs.rm(auth, { force: true });
    }
  }

  private terjemah(status: string) {
    const M: Record<string, [string, number]> = {
      NT_STATUS_LOGON_FAILURE: ['Login ke file server ditolak — periksa username / password', 400],
      NT_STATUS_ACCESS_DENIED: ['Akses ditolak oleh file server', 403],
      NT_STATUS_BAD_NETWORK_NAME: ['Share tidak ditemukan di file server', 404],
      NT_STATUS_OBJECT_NAME_NOT_FOUND: ['Berkas / folder tidak ditemukan', 404],
      NT_STATUS_OBJECT_PATH_NOT_FOUND: ['Folder tidak ditemukan', 404],
      NT_STATUS_NO_SUCH_FILE: ['Berkas / folder tidak ditemukan', 404],
      NT_STATUS_OBJECT_NAME_COLLISION: ['Sudah ada berkas / folder dengan nama itu', 400],
      NT_STATUS_DIRECTORY_NOT_EMPTY: ['Folder tidak kosong', 400],
      NT_STATUS_SHARING_VIOLATION: ['Berkas sedang dibuka orang lain', 400],
      NT_STATUS_DISK_FULL: ['Penyimpanan file server penuh', 400],
      NT_STATUS_IO_TIMEOUT: ['File server tidak merespons', 400],
      NT_STATUS_CONNECTION_REFUSED: ['Koneksi ke file server ditolak', 400],
      NT_STATUS_HOST_UNREACHABLE: ['File server tidak dapat dijangkau', 400],
    };
    const [pesan, kode] = M[status] ?? [`File server: ${status}`, 400];
    return kode === 404 ? new NotFoundException(pesan) : kode === 403 ? new ForbiddenException(pesan) : new BadRequestException(pesan);
  }

  /** Daftar share disk (share administratif berakhiran $ disembunyikan) */
  async shares(k: KredensialSmb) {
    const out = await this.jalankan(k, ['-L', `//${k.host}`, '-g'], 20_000);
    return out.split('\n').map((l) => l.split('|')).filter((p) => p[0] === 'Disk' && p[1] && !p[1].endsWith('$'))
      .map((p) => ({ nama: p[1]!, keterangan: p[2] ?? '' }));
  }

  private perintah(k: KredensialSmb, share: string, skrip: string, timeoutMs?: number) {
    return this.jalankan(k, [`//${k.host}/${SmbClient.shareAman(share)}`, '-c', skrip], timeoutMs);
  }

  async ls(k: KredensialSmb, share: string, dir: string): Promise<ItemSmb[]> {
    const d = SmbClient.pathAman(dir);
    const out = await this.perintah(k, share, `${d ? `cd "${d}"; ` : ''}ls`);
    const items: ItemSmb[] = [];
    for (const l of out.split('\n')) {
      const m = l.match(/^ {2}(.+?)\s+([DAHSRNV]*)\s+(\d+)\s+(\w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d \d{4})\s*$/);
      if (!m || m[1] === '.' || m[1] === '..') continue;
      const tgl = new Date(m[4]!.replace(/\s+/g, ' '));
      items.push({ nama: m[1]!, folder: m[2]!.includes('D'), ukuran: Number(m[3]), diubah: isNaN(tgl.getTime()) ? null : tgl.toISOString(), tersembunyi: m[2]!.includes('H') });
    }
    return items.sort((a, b) => Number(b.folder) - Number(a.folder) || a.nama.localeCompare(b.nama, 'id'));
  }

  /** Unduh ke berkas sementara lokal; pemanggil wajib menghapusnya */
  async unduh(k: KredensialSmb, share: string, file: string): Promise<string> {
    const f = SmbClient.pathAman(file);
    if (!f) throw new BadRequestException('Berkas belum dipilih');
    const lokal = path.join(os.tmpdir(), `smb-unduh-${randomBytes(8).toString('hex')}`);
    await this.perintah(k, share, `get "${f}" "${lokal}"`, 15 * 60_000);
    return lokal;
  }

  async unggah(k: KredensialSmb, share: string, dir: string, nama: string, lokal: string) {
    if (!SmbClient.bagianAman(nama)) throw new BadRequestException(`Nama berkas tidak diizinkan: "${nama}"`);
    const d = SmbClient.pathAman(dir);
    await this.perintah(k, share, `put "${lokal}" "${d ? `${d}\\` : ''}${nama}"`, 15 * 60_000);
  }

  async buatFolder(k: KredensialSmb, share: string, dir: string, nama: string) {
    if (!SmbClient.bagianAman(nama)) throw new BadRequestException(`Nama folder tidak diizinkan: "${nama}"`);
    const d = SmbClient.pathAman(dir);
    await this.perintah(k, share, `mkdir "${d ? `${d}\\` : ''}${nama}"`);
  }

  async gantiNama(k: KredensialSmb, share: string, item: string, baru: string) {
    if (!SmbClient.bagianAman(baru)) throw new BadRequestException(`Nama baru tidak diizinkan: "${baru}"`);
    const p = SmbClient.pathAman(item);
    const induk = p.includes('\\') ? p.slice(0, p.lastIndexOf('\\') + 1) : '';
    await this.perintah(k, share, `rename "${p}" "${induk}${baru}"`);
  }

  async hapus(k: KredensialSmb, share: string, item: string, folder: boolean) {
    const p = SmbClient.pathAman(item);
    if (!p) throw new BadRequestException('Tidak bisa menghapus akar share');
    // folder dihapus beserta isinya (deltree) — konfirmasi dilakukan di UI
    await this.perintah(k, share, folder ? `deltree "${p}"` : `del "${p}"`, 5 * 60_000);
  }
}
