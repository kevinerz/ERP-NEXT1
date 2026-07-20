import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * ModulAksesGuard — menegakkan pembatasan modul (user.modul_akses) di BACKEND.
 * Sebelumnya gating hanya di frontend (sembunyikan menu) — user bisa panggil
 * endpoint modul lain langsung.
 *
 * Aturan:
 * - modul_akses kosong/null = akses semua (superadmin / user lama)
 * - Segment pertama path (setelah /api) dipetakan ke key modul
 * - Path yang tidak digating: auth, notifications, settings (dibutuhkan semua
 *   user untuk login, lonceng notifikasi, dan branding aplikasi)
 */
const SEGMENT_TO_MODUL: Record<string, string> = {
  hris: 'hris',
  master: 'master',
  sales: 'sales',
  projects: 'projects',
  operations: 'operations',
  assets: 'assets',
  contracts: 'contracts',
  finance: 'finance',
  reports: 'reports',
  'public-wo': 'public-wo',
  prtg: 'prtg',
  rcms: 'rcms',
  ruijie: 'ruijie',
  'uptime-kuma': 'uptime-kuma',
  mekari: 'mekari',
  socialchat: 'socialchat',
  digiflazz: 'assets', // Beli pulsa/paket via Digiflazz — bagian dari fitur SIM Topup di modul Aset
};

// admin sudah dijaga @Roles(Admin/Director) di controller-nya.
// email tidak digating modul — koneksi self-service, tiap user cuma akses
// inbox miliknya sendiri (bukan data organisasi yang perlu dibatasi role).
const UNGATED = new Set(['auth', 'notifications', 'settings', 'admin', 'webhook', 'email']);

@Injectable()
export class ModulAksesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return true; // JwtAuthGuard yang menolak — bukan tugas guard ini

    // Ambil segment pertama setelah prefix /api
    const path: string = req.path || req.url || '';
    const segments = path.replace(/^\/api\/?/, '').split('/');
    const segment = segments[0] || '';

    if (UNGATED.has(segment)) return true;

    const modul = SEGMENT_TO_MODUL[segment];
    if (!modul) return true; // segment tak dikenal — biarkan (mis. static)

    const akses: string[] = user.modul_akses || [];
    if (!akses.length) return true; // kosong = semua modul

    if (akses.includes(modul)) return true;
    throw new ForbiddenException(`Anda tidak punya akses ke modul ${modul}`);
  }
}
