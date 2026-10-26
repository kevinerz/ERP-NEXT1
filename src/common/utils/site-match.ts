type SiteRef = { id_site: number; nama_site: string };

let siteCache: { rows: SiteRef[]; exp: number } | null = null;

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

async function semuaSite(prisma: any): Promise<SiteRef[]> {
  if (!siteCache || siteCache.exp < Date.now()) {
    const rows = await prisma.sitePelanggan.findMany({ select: { id_site: true, nama_site: true } });
    siteCache = { rows, exp: Date.now() + 60_000 };
  }
  return siteCache.rows;
}

/**
 * Tebak site dari nama device/monitor bila belum ada mapping manual.
 * Hanya mengembalikan site kalau cocoknya TIDAK ambigu — tiket di site yang
 * salah (dan WA ke pelanggan yang salah) lebih buruk daripada "site tidak dikenali".
 */
export async function cariSiteDariNama(prisma: any, namaDevice: string): Promise<SiteRef | null> {
  const nama = namaDevice.trim().toLowerCase();
  if (nama.length < 4) return null;
  const sites = (await semuaSite(prisma)).filter((s) => (s.nama_site || '').trim().length >= 4);

  const persis = sites.filter((s) => s.nama_site.trim().toLowerCase() === nama);
  if (persis.length === 1) return persis[0];
  if (persis.length > 1) return null;

  // Nama device pendek ("Solo Paragon") cocok ke site brand lain di mal yang sama
  const mengandung = sites.filter((s) => {
    const sn = s.nama_site.toLowerCase();
    return sn.includes(nama) && nama.length / sn.length >= 0.45;
  });
  if (mengandung.length === 1) return mengandung[0];
  if (mengandung.length > 1) return null;

  // Kebalikan: nama site terkandung di nama device. Nama site generik (nama mal
  // "Pejaten Village") ikut cocok ke brand lain di mal itu — jadi brand (kata
  // pertama device) harus ada di nama site, atau site mencakup hampir seluruh nama.
  const inti = nama.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const brand = tokens(inti)[0];
  const terkandung = sites
    .filter((s) => {
      const sn = s.nama_site.trim().toLowerCase();
      if (!inti.includes(sn)) return false;
      const cakupan = sn.length / inti.length;
      return (tokens(sn).includes(brand) && cakupan >= 0.5) || cakupan >= 0.9;
    })
    .sort((a, b) => b.nama_site.trim().length - a.nama_site.trim().length);
  if (!terkandung.length) return null;
  if (terkandung.length > 1 && terkandung[0].nama_site.trim().length === terkandung[1].nama_site.trim().length) return null;
  return terkandung[0];
}
