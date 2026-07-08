import { Injectable } from '@nestjs/common';

/**
 * Menyimpan token yang sudah logout agar tidak bisa dipakai lagi
 * sampai masa berlakunya habis. In-memory (cukup untuk 1 instance);
 * kalau nanti multi-instance, ganti ke Redis.
 */
@Injectable()
export class TokenBlacklistService {
  private blacklist = new Map<string, number>(); // token -> expiry epoch ms

  add(token: string, expirySeconds: number): void {
    this.blacklist.set(token, Date.now() + expirySeconds * 1000);
  }

  isBlacklisted(token: string): boolean {
    const exp = this.blacklist.get(token);
    if (!exp) return false;
    if (Date.now() > exp) {
      this.blacklist.delete(token);
      return false;
    }
    return true;
  }

  // Bersihkan entri kedaluwarsa — dipanggil scheduler / on-demand
  cleanup(): void {
    const now = Date.now();
    for (const [token, exp] of this.blacklist.entries()) {
      if (now > exp) this.blacklist.delete(token);
    }
  }

  get size(): number {
    return this.blacklist.size;
  }
}
