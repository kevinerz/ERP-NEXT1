import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenBlacklistService {
  private blacklist = new Map<string, number>(); // token -> expiry timestamp

  add(token: string, expirySeconds: number): void {
    const expiryTime = Date.now() + expirySeconds * 1000;
    this.blacklist.set(token, expiryTime);

    // Cleanup di background setiap menit
    setTimeout(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  isBlacklisted(token: string): boolean {
    const expiryTime = this.blacklist.get(token);
    if (!expiryTime) return false;

    const now = Date.now();
    if (now > expiryTime) {
      // Token sudah expired, hapus
      this.blacklist.delete(token);
      return false;
    }

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [token, expiryTime] of this.blacklist.entries()) {
      if (now > expiryTime) {
        this.blacklist.delete(token);
      }
    }
  }

  getSize(): number {
    return this.blacklist.size;
  }
}
