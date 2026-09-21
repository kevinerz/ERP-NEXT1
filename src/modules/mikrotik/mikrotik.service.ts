import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const CRED_KEYS = {
  user: 'mikrotik_ssh_user',
  pass: 'mikrotik_ssh_password',
  port: 'mikrotik_ssh_port',
};

@Injectable()
export class MikrotikService {
  constructor(private prisma: PrismaService) {}

  async getDevices() {
    const rows = await this.prisma.perangkatSite.findMany({
      where: {
        status_perangkat: 'Aktif',
        AND: [{ ip_address: { not: null } }, { ip_address: { not: '' } }],
        OR: [
          { jenis_perangkat: { contains: 'Mikrotik' } },
          { jenis_perangkat: { contains: 'mikrotik' } },
          { jenis_perangkat: { contains: 'Router' } },
          { jenis_perangkat: { contains: 'router' } },
          { merk: { contains: 'Mikrotik' } },
          { merk: { contains: 'mikrotik' } },
        ],
      },
      include: {
        site: {
          select: {
            nama_site: true,
            kota: true,
            pelanggan: { select: { nama_pelanggan: true } },
          },
        },
      },
      orderBy: [{ site: { pelanggan: { nama_pelanggan: 'asc' } } }, { id_perangkat: 'asc' }],
    });
    return rows.map(r => ({
      id_perangkat: r.id_perangkat,
      ip_address: r.ip_address,
      jenis_perangkat: r.jenis_perangkat,
      merk: r.merk,
      tipe_model: r.tipe_model,
      status_perangkat: r.status_perangkat,
      site: r.site,
    }));
  }

  async getConfig() {
    const settings = await this.prisma.appSetting.findMany({
      where: { key: { in: Object.values(CRED_KEYS) } },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value ?? '']));
    return {
      user: map[CRED_KEYS.user] || 'admin',
      hasPassword: !!(map[CRED_KEYS.pass]),
      port: Number(map[CRED_KEYS.port] || 22),
    };
  }

  async saveConfig(user: string, password: string, port: number) {
    const upsert = (key: string, value: string) =>
      this.prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    await upsert(CRED_KEYS.user, user || 'admin');
    if (password) await upsert(CRED_KEYS.pass, password);
    await upsert(CRED_KEYS.port, String(port || 22));
    return { message: 'Konfigurasi disimpan' };
  }

  async runCommand(ips: string[], command: string, port?: number, user?: string) {
    const settings = await this.prisma.appSetting.findMany({
      where: { key: { in: Object.values(CRED_KEYS) } },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value ?? '']));
    const sshUser = user || map[CRED_KEYS.user] || 'admin';
    const sshPass = map[CRED_KEYS.pass] || '';
    const sshPort = port || Number(map[CRED_KEYS.port] || 22);

    const results = await Promise.all(
      ips.map(ip => this.sshExec(ip, sshPort, sshUser, sshPass, command)),
    );
    return results;
  }

  private sshExec(ip: string, port: number, username: string, password: string, command: string) {
    return new Promise<{ ip: string; success: boolean; output: string; duration: number; error?: string }>(resolve => {
      const start = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('ssh2');
      const conn = new Client();

      const done = (result: { success: boolean; output: string; error?: string }) => {
        resolve({ ip, ...result, duration: Date.now() - start });
      };

      const timeout = setTimeout(() => {
        try { conn.destroy(); } catch {}
        done({ success: false, output: '', error: 'Timeout (15 detik)' });
      }, 15000);

      conn.on('error', (err: Error) => {
        clearTimeout(timeout);
        done({ success: false, output: '', error: err.message });
      });

      conn.on('ready', () => {
        conn.exec(command, (err: Error | undefined, stream: any) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            return done({ success: false, output: '', error: err.message });
          }
          let out = '';
          stream.on('data', (d: Buffer) => { out += d.toString(); });
          stream.stderr.on('data', (d: Buffer) => { out += d.toString(); });
          stream.on('close', () => {
            clearTimeout(timeout);
            conn.end();
            done({ success: true, output: out });
          });
        });
      });

      conn.connect({ host: ip, port, username, password, readyTimeout: 10000, algorithms: { serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-dss', 'ssh-ed25519'] } });
    });
  }
}
