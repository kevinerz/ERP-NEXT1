import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const CRED_KEYS = {
  user: 'mikrotik_ssh_user',
  pass: 'mikrotik_ssh_password',
  apiPort: 'mikrotik_api_port',
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
      apiPort: Number(map[CRED_KEYS.apiPort] || 8728),
    };
  }

  async saveConfig(user: string, password: string, apiPort: number) {
    const upsert = (key: string, value: string) =>
      this.prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    await upsert(CRED_KEYS.user, user || 'admin');
    if (password) await upsert(CRED_KEYS.pass, password);
    await upsert(CRED_KEYS.apiPort, String(apiPort || 8728));
    return { message: 'Konfigurasi disimpan' };
  }

  async pingDevices(ips: string[]) {
    const settings = await this.prisma.appSetting.findMany({
      where: { key: { in: Object.values(CRED_KEYS) } },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value ?? '']));
    const port = Number(map[CRED_KEYS.apiPort] || 8728);
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

  async runCommand(ips: string[], command: string) {
    const settings = await this.prisma.appSetting.findMany({
      where: { key: { in: Object.values(CRED_KEYS) } },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value ?? '']));
    const user = map[CRED_KEYS.user] || 'admin';
    const pass = map[CRED_KEYS.pass] || '';
    const apiPort = Number(map[CRED_KEYS.apiPort] || 8728);

    return Promise.all(ips.map(ip => this.apiExec(ip, apiPort, user, pass, command)));
  }

  // Convert CLI-style command to RouterOS API path
  // "/ip address print" → "/ip/address/print"
  private cliToApiPath(cmd: string): string {
    return '/' + cmd.trim().replace(/^\//, '').split(/\s+/).join('/');
  }

  private formatApiResponse(data: any[]): string {
    if (!data || data.length === 0) return '';

    const allKeys = [...new Set(data.flatMap((d: any) => Object.keys(d)))];

    // Single-item (e.g. /system/resource/print, /system/identity/print): key-value pairs
    if (data.length === 1) {
      return allKeys
        .filter(k => k !== '.id')
        .map(k => `${k}: ${data[0][k] ?? ''}`)
        .join('\n');
    }

    // Multi-row: table with flag column + data columns
    const FLAG_MAP: Record<string, string> = {
      disabled: 'X', dynamic: 'D', invalid: 'I',
      running: 'R', active: 'A', blocked: 'B', radius: 'Z', slave: 'S',
    };
    const flagKeys = Object.keys(FLAG_MAP).filter(f =>
      allKeys.includes(f) && data.some((d: any) => d[f] === 'true' || d[f] === 'false'),
    );
    const skipKeys = new Set(['.id', ...flagKeys]);
    const dataKeys = allKeys.filter(k => !skipKeys.has(k));

    const widths = dataKeys.map(k =>
      Math.max(k.length, ...data.map((d: any) => String(d[k] ?? '').length)),
    );

    const flagChars = flagKeys.map(f => FLAG_MAP[f]);
    const flagDesc = flagKeys.map(f => `${FLAG_MAP[f]} - ${f}`).join(', ');
    const colHeader = dataKeys.map((k, i) => k.toUpperCase().padEnd(widths[i])).join('  ');
    const fullHeader = flagChars.length
      ? `${flagChars.join('').padEnd(flagChars.length + 2)}${colHeader}`
      : colHeader;

    const rows = data.map((item: any) => {
      const flags = flagChars.length
        ? flagKeys.map(f => item[f] === 'true' ? FLAG_MAP[f] : ' ').join('').padEnd(flagChars.length + 2)
        : '';
      const cols = dataKeys.map((k, i) => String(item[k] ?? '').padEnd(widths[i])).join('  ');
      return flags + cols;
    });

    const lines: string[] = [];
    if (flagDesc) lines.push(`Flags: ${flagDesc}`);
    lines.push(fullHeader);
    lines.push(...rows);
    return lines.join('\n');
  }

  private async apiExec(
    ip: string,
    apiPort: number,
    user: string,
    password: string,
    command: string,
  ): Promise<{ ip: string; success: boolean; output: string; duration: number; error?: string }> {
    const start = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RouterOSAPI } = require('node-routeros');

    const conn = new RouterOSAPI({
      host: ip,
      port: apiPort,
      user,
      password,
      timeout: 10,
    });

    try {
      await conn.connect();
      const apiPath = this.cliToApiPath(command);
      const data = await conn.write(apiPath);
      await conn.close();
      const output = this.formatApiResponse(data);
      return { ip, success: true, output, duration: Date.now() - start };
    } catch (err: any) {
      try { await conn.close(); } catch {}
      return { ip, success: false, output: '', error: err.message || String(err), duration: Date.now() - start };
    }
  }
}
