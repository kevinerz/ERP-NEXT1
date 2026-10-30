// Hitung-hitungan IPv4 sederhana untuk IPAM (tanpa dependensi)

export function ipKeAngka(ip: string): number | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

export function angkaKeIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** "a.b.c.d/nn" → network & panjang. Alamat bukan network (mis. .5/29) ditolak. */
export function bacaPrefix(s: string): { network: number; panjang: number; jumlah: number } | null {
  const [ip, p] = s.trim().split('/');
  const n = ipKeAngka(ip || '');
  const panjang = p === undefined ? 32 : Number(p);
  if (n === null || !Number.isInteger(panjang) || panjang < 8 || panjang > 32) return null;
  const jumlah = 2 ** (32 - panjang);
  if (n % jumlah !== 0) return null;
  return { network: n, panjang, jumlah };
}

export function tulisPrefix(network: number, panjang: number) {
  return `${angkaKeIp(network)}/${panjang}`;
}

/** Info subnet untuk ditampilkan / disalin ke konfigurasi router */
export function infoSubnet(network: number, panjang: number) {
  const jumlah = 2 ** (32 - panjang);
  const mask = panjang === 0 ? 0 : (0xffffffff << (32 - panjang)) >>> 0;
  const akhir = network + jumlah - 1;
  return {
    prefix: tulisPrefix(network, panjang),
    netmask: angkaKeIp(mask),
    network: angkaKeIp(network),
    broadcast: panjang >= 31 ? null : angkaKeIp(akhir),
    host_pertama: angkaKeIp(panjang >= 31 ? network : network + 1),
    host_terakhir: angkaKeIp(panjang >= 31 ? akhir : akhir - 1),
    jumlah_ip: jumlah,
    jumlah_host: panjang === 32 ? 1 : panjang === 31 ? 2 : jumlah - 2,
  };
}
