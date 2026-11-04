// Saran pemetaan router NOCaaS → site ERP.
// Nama router NOCaaS = <AWALAN BRAND>-<LOKASI> (mis. "ACE-PERMAI-BALIKPAPAN"), nama site ERP bebas
// ("Ace Bpn Permai"). Awalan brand dipelajari dari pasangan yang sudah pasti (IP tunnel / manual / host PRTG)
// → pelanggan; lalu lokasi dicocokkan hanya dengan site pelanggan itu. Kata yang umum di semua site satu
// pelanggan ("Kopi", "Kenangan", "Ace", "Hardware") diabaikan supaya yang dibandingkan hanya lokasinya.

export interface SiteCalon { id_site: number; id_pelanggan: number; nama_site: string; kode_site: string; kota: string | null }
export interface Saran { id_site: number; nama_site: string; kode_site: string; kota: string | null; skor: number } // skor 0–1

const UMUM = new Set(['THE', 'DAN', 'DI', 'JL', 'JLN', 'JALAN', 'UNIT', 'STORE', 'TOKO', 'OUTLET', 'CABANG', 'NEW']);
// Yakin hanya bila: ≥ 75% kata lokasi router ada di site, ≥ 60% kata nama site ada di router,
// tidak ada kota yang bertentangan, dan unggul jelas dari kandidat kedua.
const CAKUP_ROUTER = 0.75;
const CAKUP_SITE = 0.6;
const SELISIH_YAKIN = 0.2;

export const awalan = (siteKey: string) => siteKey.replace(/^[-_\s]+/, '').split(/[-_\s]+/)[0].toUpperCase();
const kata = (s: string) => s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && !UMUM.has(t));

export class PencocokSaran {
  private brand = new Map<string, number>();
  private perPelanggan = new Map<number, { s: SiteCalon; lokasi: Set<string>; nama: Set<string> }[]>();
  private semua: { s: SiteCalon; lokasi: Set<string>; nama: Set<string> }[] = [];
  private kotaSemua = new Set<string>();
  // Kata khas tiap awalan brand, dipelajari dari nama site pasangan pasti (OPM → OPTIK/MELAWAI, ADIRA → ADIRA)
  private ciri = new Map<string, Set<string>>();

  /**
   * @param pasti pasangan router↔site yang sudah pasti, untuk belajar awalan brand & kata khasnya
   * @param calon site aktif yang belum punya router (kandidat)
   */
  constructor(pasti: { site_key: string; id_site: number; id_pelanggan: number }[], calon: SiteCalon[], semuaSite: SiteCalon[]) {
    const hitung = new Map<string, Map<number, number>>();
    for (const p of pasti) {
      const a = awalan(p.site_key);
      const m = hitung.get(a) ?? new Map<number, number>();
      m.set(p.id_pelanggan, (m.get(p.id_pelanggan) ?? 0) + 1);
      hitung.set(a, m);
    }
    for (const [a, m] of hitung) {
      const urut = [...m.entries()].sort((x, y) => y[1] - x[1]);
      const total = urut.reduce((n, [, v]) => n + v, 0);
      if (urut[0][1] >= 3 && urut[0][1] / total >= 0.8) this.brand.set(a, urut[0][0]);
    }
    const namaSite = new Map(semuaSite.map((s) => [s.id_site, s.nama_site]));
    const perAwalan = new Map<string, string[]>();
    for (const p of pasti) { const n = namaSite.get(p.id_site); if (n) perAwalan.set(awalan(p.site_key), [...(perAwalan.get(awalan(p.site_key)) ?? []), n]); }
    for (const [a, ns] of perAwalan) {
      if (ns.length < 3) continue;
      const f = new Map<string, number>();
      for (const n of ns) for (const k of new Set(kata(n))) f.set(k, (f.get(k) ?? 0) + 1);
      const c = [...f.entries()].filter(([, v]) => v / ns.length >= 0.6).map(([k]) => k);
      if (c.length) this.ciri.set(a, new Set(c));
    }

    // Kata yang muncul di ≥ 30% site satu pelanggan = nama brand → abaikan untuk pelanggan itu
    const umumPel = new Map<number, Set<string>>();
    const grup = new Map<number, SiteCalon[]>();
    for (const s of semuaSite) grup.set(s.id_pelanggan, [...(grup.get(s.id_pelanggan) ?? []), s]);
    for (const [p, ss] of grup) {
      if (ss.length < 5) continue;
      const f = new Map<string, number>();
      for (const s of ss) for (const k of new Set(kata(s.nama_site))) f.set(k, (f.get(k) ?? 0) + 1);
      umumPel.set(p, new Set([...f.entries()].filter(([, n]) => n / ss.length >= 0.3).map(([k]) => k)));
    }
    for (const s of semuaSite) for (const k of kata(s.kota ?? '')) this.kotaSemua.add(k);
    for (const s of calon) {
      const buang = umumPel.get(s.id_pelanggan) ?? new Set<string>();
      const nama = new Set(kata(s.nama_site).filter((k) => !buang.has(k)));
      const lokasi = new Set([...nama, ...kata(s.kota ?? '').filter((k) => !buang.has(k))]);
      const e = { s, lokasi, nama };
      this.perPelanggan.set(s.id_pelanggan, [...(this.perPelanggan.get(s.id_pelanggan) ?? []), e]);
      this.semua.push(e);
    }
  }

  pelangganDari(siteKey: string) { return this.brand.get(awalan(siteKey)) ?? null; }

  /** 3 kandidat teratas; yakin = brand dikenal, skor tinggi, dan jelas lebih baik dari kandidat kedua */
  cari(siteKey: string): { saran: Saran[]; yakin: boolean } {
    const pel = this.pelangganDari(siteKey);
    const sisa = siteKey.replace(/^[-_\s]+/, '').split(/[-_\s]+/).slice(pel ? 1 : 0).join(' ');
    const rt = new Set(kata(sisa));
    if (!rt.size) return { saran: [], yakin: false };
    const pool = pel ? this.perPelanggan.get(pel) ?? [] : this.semua;
    const kotaRouter = [...rt].filter((k) => this.kotaSemua.has(k));
    // Nama site harus memuat kata khas brand router (atau awalannya) — CHIGO ≠ "Kopi Kenangan …", ADIRA ≠ "Chatime …"
    const br = awalan(siteKey);
    const ciri = this.ciri.get(br);
    const brandCocok = (namaSite: string) => kata(namaSite).some((k) => ciri?.has(k) || k.startsWith(br) || (k.length >= 3 && br.startsWith(k)));
    const hasil: (Saran & { a: number; b: number; bentrok: boolean })[] = [];
    for (const { s, lokasi, nama } of pool) {
      let sama = 0;
      for (const k of rt) if (lokasi.has(k)) sama++;
      if (!sama) continue;
      const a = sama / rt.size, b = sama / Math.max(nama.size, 1);
      // Router menyebut kota yang tidak ada di nama/kota site, padahal site punya kota lain → bentrok
      const kotaSite = kata(s.kota ?? '');
      const bentrok = kotaRouter.some((k) => !lokasi.has(k)) && kotaSite.length > 0 && !kotaSite.some((k) => rt.has(k));
      hasil.push({ id_site: s.id_site, nama_site: s.nama_site, kode_site: s.kode_site, kota: s.kota, skor: Math.round(Math.sqrt(a * Math.min(b, 1)) * 100) / 100, a, b, bentrok });
    }
    hasil.sort((x, y) => y.skor - x.skor);
    const top = hasil.slice(0, 3);
    const [p1, p2] = top;
    const yakin = !!pel && !!p1 && p1.a >= CAKUP_ROUTER && p1.b >= CAKUP_SITE && !p1.bentrok && brandCocok(p1.nama_site)
      && (!p2 || p1.skor - p2.skor >= SELISIH_YAKIN);
    return { saran: top.map(({ a: _a, b: _b, bentrok: _c, ...x }) => x), yakin };
  }
}

// ── Cek kewajaran pasangan "pasti" (IP tunnel di ERP / host PRTG) ───────────────
// IP tunnel bisa dipakai ulang untuk toko lain sementara data ERP tidak ikut diperbarui
// (mis. "Chatime Teraskota" memegang IP router KK, ACE, Fore, Informa …). Pasangan dianggap wajar bila
// ada satu kata yang sama / mirip (toleran salah ketik: GRILMAN ≈ GRILLMAN, KRONOJO ≈ KRONJO).
const UMUM_CEK = new Set([...UMUM, 'MALL', 'PLAZA', 'RUKO', 'RAYA', 'SQUARE', 'SQ', 'CITY', 'KOTA', 'PASAR', 'CENTER', 'CENTRE']);
const kataCek = (s: string) => new Set(s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !UMUM_CEK.has(t)));
const rapat = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
function beda1(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false; return true; }
  const [p, q] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < q.length; i++) if (q.slice(0, i) + q.slice(i + 1) === p) return true;
  return false;
}
export function namaNyambung(namaPerangkat: string, namaSite: string) {
  const r = kataCek(namaPerangkat), s = kataCek(namaSite), rr = rapat(namaPerangkat), rs = rapat(namaSite);
  for (const a of r) for (const b of s) {
    if (a === b) return true;
    if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
    if (Math.min(a.length, b.length) >= 5 && beda1(a, b)) return true;
  }
  return [...r].some((a) => a.length >= 5 && rs.includes(a)) || [...s].some((b) => b.length >= 5 && rr.includes(b));
}
