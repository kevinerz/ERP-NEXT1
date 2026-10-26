/**
 * Helper zona waktu WIB (UTC+7).
 *
 * Server produksi berjalan di UTC dan TZ global TIDAK boleh diubah (banyak kolom @db.Date).
 * Untuk batas bulan/hari yang harus mengikuti jam Indonesia, hitung eksplisit di sini.
 * Semua fungsi mengembalikan Date sebagai instant UTC yang setara dengan jam WIB yang dimaksud.
 *
 * Catatan: kolom @db.Date menyimpan tanggal kalender (UTC midnight) — untuk membandingkan
 * kolom tanggal, gunakan `dateMonthRange` (batas kalender), bukan batas WIB.
 */

export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Rentang satu bulan kalender WIB sebagai instant UTC.
 * `start` inklusif, `end` EKSKLUSIF (awal bulan berikutnya) — pakai `gte start` & `lt end`.
 * @param month1to12 bulan 1..12
 */
export function wibMonthRange(year: number, month1to12: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1) - WIB_OFFSET_MS);
  const end = new Date(Date.UTC(year, month1to12, 1) - WIB_OFFSET_MS);
  return { start, end };
}

/** Rentang satu tahun kalender WIB (start inklusif, end eksklusif). */
export function wibYearRange(year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, 0, 1) - WIB_OFFSET_MS);
  const end = new Date(Date.UTC(year + 1, 0, 1) - WIB_OFFSET_MS);
  return { start, end };
}

/** Awal hari (00:00 WIB) dari instant yang diberikan, sebagai instant UTC. */
export function wibStartOfDay(date: Date = new Date()): Date {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_OFFSET_MS);
}

/** Tahun & bulan (1..12) saat ini menurut kalender WIB. */
export function wibYearMonth(date: Date = new Date()): { year: number; month: number } {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return { year: wib.getUTCFullYear(), month: wib.getUTCMonth() + 1 };
}

/** Geser (year, month1to12) sebanyak `delta` bulan. */
export function addMonths(year: number, month1to12: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month1to12 - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/**
 * Rentang bulan kalender untuk kolom @db.Date (tersimpan sebagai UTC midnight).
 * `start` inklusif, `end` eksklusif.
 */
export function dateMonthRange(year: number, month1to12: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month1to12 - 1, 1)),
    end: new Date(Date.UTC(year, month1to12, 1)),
  };
}
