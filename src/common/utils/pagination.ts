/**
 * Normalisasi parameter paginasi dari query string:
 * page >= 1, 1 <= limit <= maxLimit (default 100). Nilai tidak valid → default.
 */
export function clampPagination(
  pageRaw: unknown,
  limitRaw: unknown,
  defaultLimit = 20,
  maxLimit = 100,
): { page: number; limit: number; skip: number } {
  const p = Math.floor(Number(pageRaw));
  const l = Math.floor(Number(limitRaw));
  const page = Number.isFinite(p) && p >= 1 ? p : 1;
  const limit = Number.isFinite(l) && l >= 1 ? Math.min(l, maxLimit) : Math.min(defaultLimit, maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}
