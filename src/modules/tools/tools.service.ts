import { Injectable, BadRequestException } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';

const execAsync = promisify(exec);

// Whitelist karakter aman untuk host: huruf, angka, titik, strip, underscore
function validateHost(host: string): string {
  const clean = host.trim();
  if (!/^[a-zA-Z0-9._\-]{1,253}$/.test(clean)) {
    throw new BadRequestException('Format host tidak valid');
  }
  return clean;
}

@Injectable()
export class ToolsService {
  async runPing(rawHost: string, count: number): Promise<{ host: string; output: string; stats: any }> {
    const host = validateHost(rawHost);
    try {
      const { stdout, stderr } = await execAsync(
        `ping -c ${count} -W 3 ${host}`,
        { timeout: 60000 },
      );
      const out = stdout + (stderr || '');
      const stats = parsePingStats(out);
      return { host, output: out, stats };
    } catch (e: any) {
      return { host, output: e.stdout || e.message || 'Host tidak dapat dijangkau', stats: null };
    }
  }

  async runTraceroute(
    rawHost: string,
    maxhops: number,
    protocol: string,
    noDns: boolean,
    port: number,
  ): Promise<{ host: string; output: string }> {
    const host = validateHost(rawHost);
    const hops = Math.min(maxhops, 20);
    const dns = noDns ? '-n' : '';

    let cmd: string;
    if (protocol === 'tcp') {
      const hasTcptr = await hasCommand('tcptraceroute');
      if (hasTcptr) {
        cmd = `tcptraceroute -m ${hops} -w 1 ${dns} ${host} ${port}`;
      } else {
        cmd = `traceroute -T -p ${port} -m ${hops} -w 1 ${dns} ${host}`;
      }
    } else if (protocol === 'icmp') {
      cmd = `traceroute -I -m ${hops} -w 1 ${dns} ${host}`;
    } else {
      // UDP default
      cmd = `traceroute -m ${hops} -w 1 ${dns} ${host}`;
    }

    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 150000 });
      return { host, output: stdout + (stderr || ''), protocol };
    } catch (e: any) {
      // fallback: if raw socket error, try tracepath
      if ((e.message || '').includes('Operation not permitted')) {
        try {
          const timeoutSec = hops * 4;
          const { stdout } = await execAsync(`timeout ${timeoutSec} tracepath -m ${hops} ${host}`, { timeout: 150000 });
          return { host, output: stdout, protocol: 'tracepath' };
        } catch (e2: any) {
          return { host, output: e2.stdout || e2.message || 'Traceroute gagal', protocol };
        }
      }
      return { host, output: e.stdout || e.message || 'Traceroute gagal', protocol };
    }
  }

  async runMtr(rawHost: string): Promise<{ host: string; output: string }> {
    const host = validateHost(rawHost);
    const hasMtr = await hasCommand('mtr');
    if (!hasMtr) {
      return this.runTraceroute(rawHost, 20, 'udp', false, 80);
    }
    try {
      const { stdout, stderr } = await execAsync(
        `mtr --report --report-cycles 5 --no-dns ${host}`,
        { timeout: 90000 },
      );
      return { host, output: stdout + (stderr || '') };
    } catch (e: any) {
      return { host, output: e.stdout || e.message || 'MTR gagal' };
    }
  }

  async runDns(rawHost: string, type: string): Promise<{ host: string; output: string }> {
    const host = validateHost(rawHost);
    const safeType = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'PTR', 'SOA'].includes(type.toUpperCase())
      ? type.toUpperCase() : 'A';
    try {
      const cmd = await hasCommand('dig')
        ? `dig ${host} ${safeType} +short +time=5`
        : `nslookup -type=${safeType} ${host}`;
      const { stdout, stderr } = await execAsync(cmd, { timeout: 15000 });
      return { host, output: stdout || stderr || '(tidak ada hasil)' };
    } catch (e: any) {
      return { host, output: e.stdout || e.message || 'DNS query gagal' };
    }
  }

  async checkPort(rawHost: string, port: number): Promise<{ host: string; port: number; open: boolean; latency_ms: number | null; output: string }> {
    const host = validateHost(rawHost);
    const start = Date.now();
    return new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(5000);
      sock.on('connect', () => {
        const ms = Date.now() - start;
        sock.destroy();
        resolve({ host, port, open: true, latency_ms: ms, output: `Port ${port} TERBUKA (${ms}ms)` });
      });
      sock.on('error', (err) => {
        resolve({ host, port, open: false, latency_ms: null, output: `Port ${port} TERTUTUP — ${err.message}` });
      });
      sock.on('timeout', () => {
        sock.destroy();
        resolve({ host, port, open: false, latency_ms: null, output: `Port ${port} TIMEOUT (>5 detik)` });
      });
      sock.connect(port, host);
    });
  }
}

async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

function parsePingStats(output: string) {
  const transmitted = output.match(/(\d+) packets? transmitted/)?.[1];
  const received    = output.match(/(\d+) received/)?.[1];
  const loss        = output.match(/([\d.]+)% packet loss/)?.[1];
  const rttLine     = output.match(/rtt min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
  if (!transmitted) return null;
  return {
    transmitted: Number(transmitted),
    received:    Number(received || 0),
    loss_pct:    parseFloat(loss || '100'),
    rtt_min:     rttLine ? parseFloat(rttLine[1]) : null,
    rtt_avg:     rttLine ? parseFloat(rttLine[2]) : null,
    rtt_max:     rttLine ? parseFloat(rttLine[3]) : null,
  };
}
