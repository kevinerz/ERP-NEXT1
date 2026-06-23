import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LogService } from './log.service';

// Map URL prefix → modul name
const URL_MODUL: Record<string, string> = {
  '/hris':        'hris',
  '/master':      'master',
  '/sales':       'sales',
  '/projects':    'projects',
  '/operations':  'operations',
  '/assets':      'assets',
  '/contracts':   'contracts',
  '/reports':     'reports',
  '/admin':       'admin',
};

// Petakan URL segment ke nama entitas yang lebih ramah
const ENTITAS_MAP: Record<string, string> = {
  karyawan:          'Karyawan',
  layanan:           'Layanan',
  vendor:            'Vendor ISP',
  pelanggan:         'Pelanggan',
  site:              'Site',
  'sumber-internet': 'Sumber Internet',
  perangkat:         'Perangkat Site',
  pic:               'PIC',
  lead:              'Lead',
  opportunity:       'Opportunity',
  quotation:         'Quotation',
  survey:            'Survey',
  projects:          'Proyek',
  'work-order':      'Work Order',
  operations:        'Tiket',
  assets:            'Aset',
  mutasi:            'Mutasi Aset',
  contracts:         'Kontrak',
  terminasi:         'Terminasi Kontrak',
  users:             'User',
  'modul-akses':     'Akses Modul',
  'toggle-aktif':    'Status User',
  'reset-password':  'Reset Password',
};

function resolveModul(url: string): string {
  for (const prefix of Object.keys(URL_MODUL)) {
    if (url.startsWith(prefix)) return URL_MODUL[prefix];
  }
  return 'system';
}

function resolveEntitas(url: string): string {
  // Ambil segment path yang bermakna (bukan ID angka)
  const parts = url.split('?')[0].split('/').filter((s) => s && !/^\d+$/.test(s));
  // Cari dari belakang: cek 2 segment terakhir
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i].toLowerCase();
    if (ENTITAS_MAP[seg]) return ENTITAS_MAP[seg];
  }
  return parts[parts.length - 1] || '';
}

function resolveAksi(method: string): 'CREATE' | 'UPDATE' | 'DELETE' {
  if (method === 'POST')   return 'CREATE';
  if (method === 'DELETE') return 'DELETE';
  return 'UPDATE';
}

function getIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    ''
  );
}

@Injectable()
export class LogInterceptor implements NestInterceptor {
  constructor(private logService: LogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    // Hanya log mutating requests; skip auth (login/logout punya log sendiri)
    if (
      !['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) ||
      req.url.startsWith('/auth')
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (response) => {
        const user = req.user;
        if (!user) return;

        await this.logService.log({
          id_user:    user.id_user,
          username:   user.username,
          nama:       user.nama_lengkap || '',
          aksi:       resolveAksi(method),
          modul:      resolveModul(req.url),
          entitas:    resolveEntitas(req.url),
          deskripsi:  response?.message || `${resolveAksi(method)} ${resolveEntitas(req.url)}`,
          ip_address: getIp(req),
        });
      }),
    );
  }
}
