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
        AND: [{ ip_address: { not: null } }, { ip_address: { not: '' } }],
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

  async pingDevices(ips: string[]) {
    const settings = await this.prisma.appSetting.findMany({
      where: { key: { in: Object.values(CRED_KEYS) } },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value ?? '']));
    const port = Number(map[CRED_KEYS.port] || 22);
    return Promise.all(ips.map(ip => this.tcpPing(ip, port)));
  }

  private tcpPing(ip: string, port: number): Promise<{ ip: string; reachable: boolean; latency: number }> {
    return new Promise(resolve => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const net = require('net');
      const start = Date.now();
      const socket = new net.Socket();
      let done = false;
      const finish = (reachable: boolean) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve({ ip, reachable, latency: Date.now() - start });
      };
      socket.setTimeout(3000);
      socket.on('connect', () => finish(true));
      socket.on('timeout', () => finish(false));
      socket.on('error', () => finish(false));
      socket.connect(port, ip);
    });
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
        // exec+PTY cols=220: RouterOS melebar output kolom, tidak ada banner login.
        // Stream exec+PTY tidak close sendiri → idle timer 1500ms setelah data terakhir.
        // shell channel terbukti tidak menerima input setelah banner dikirim (RouterOS behavior).
        conn.exec(command, { pty: { cols: 220, rows: 9999, term: 'dumb' } }, (err: Error | undefined, stream: any) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            return done({ success: false, output: '', error: err.message });
          }

          let raw = '';
          let finished = false;
          let idleTimer: ReturnType<typeof setTimeout>;

          const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            clearTimeout(idleTimer);
            try { conn.destroy(); } catch {}

            // Strip komprehensif: CSI sequences, lalu sisa ESC+char (termasuk \x1bZ), lalu control chars
            const output = raw
              .replace(/\x1b\[[^@-~]*[@-~]/g, '')
              .replace(/\x1b./g, '')
              .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
              .replace(/\r/g, '')
              .trim();

            done({ success: true, output });
          };

          const resetIdle = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(finish, 1500);
          };

          stream.on('data', (d: Buffer) => { raw += d.toString(); resetIdle(); });
          stream.on('close', finish);
        });
      });

      conn.connect({ host: ip, port, username, password, readyTimeout: 10000, algorithms: { serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-dss', 'ssh-ed25519'] } });
    });
  }
}
