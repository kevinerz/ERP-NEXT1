import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LogService } from './log.service';

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

const ENTITAS_MAP: Record<string, string> = {
  karyawan:          'Karyawan',
  layanan:           'Layanan',
  vendor:            'Vendor ISP',
  pelanggan:         'Pelanggan',
  site:              'Site',
  'sumber-internet': 'Sumber Internet',
  perangkat:         'Perangkat',
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
  terminasi:         'Terminasi',
  users:             'User',
  'modul-akses':     'Akses Modul',
  'toggle-aktif':    'Status User',
  'reset-password':  'Reset Password',
};

// Field yang bisa dijadikan identifier entitas (dicek di response.data dan req.body)
const IDENTIFIER_FIELDS = [
  'nama_pic', 'nama_site', 'nama_pelanggan', 'nama_perangkat', 'nama_vendor',
  'nama_layanan', 'nama_lengkap', 'nama_karyawan', 'nama_prospek',
  'nomor_kontrak', 'nomor_quotation', 'kode_aset', 'kode_site', 'kode_pelanggan',
  'username', 'subject', 'judul_proyek', 'nomor_tiket',
];

// Field sensitif yang tidak boleh masuk log
const SENSITIVE_FIELDS = ['password', 'password_hash', 'token', 'refresh_token'];

function resolveModul(url: string): string {
  for (const prefix of Object.keys(URL_MODUL)) {
    if (url.startsWith(prefix)) return URL_MODUL[prefix];
  }
  return 'system';
}

function resolveEntitas(url: string): string {
  const parts = url.split('?')[0].split('/').filter((s) => s && !/^\d+$/.test(s));
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

/** Cari identifier dari data (response.data atau req.body) */
function findIdentifier(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const field of IDENTIFIER_FIELDS) {
    if (obj[field] && typeof obj[field] === 'string') return obj[field];
  }
  return null;
}

/** Bersihkan body dari field sensitif */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const clean: any = {};
  for (const [k, v] of Object.entries(body)) {
    if (!SENSITIVE_FIELDS.includes(k.toLowerCase())) clean[k] = v;
  }
  return clean;
}

/** Bangun deskripsi log yang informatif */
function buildDescription(
  method: string,
  entitas: string,
  body: any,
  response: any,
): string {
  const baseMsg = response?.message || `${resolveAksi(method)} ${entitas}`;

  // Cari nama entitas dari response.data dulu, lalu req.body
  const identifier =
    findIdentifier(response?.data) ||
    findIdentifier(body);

  if (identifier) return `${baseMsg} — ${identifier}`;

  // Fallback: sertakan beberapa field body yang informatif (bukan sensitif)
  if (body && method !== 'DELETE') {
    const clean = sanitizeBody(body);
    const extras: string[] = [];
    const usefulFields = ['id_site', 'id_vendor_isp', 'id_aset', 'id_pelanggan', 'status_link', 'peruntukan_link'];
    for (const f of usefulFields) {
      if (clean[f] !== undefined && clean[f] !== 0 && clean[f] !== '') {
        extras.push(`${f}:${clean[f]}`);
      }
    }
    if (extras.length) return `${baseMsg} (${extras.join(', ')})`;
  }

  return baseMsg;
}

function getIp(req: any): string {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
}

@Injectable()
export class LogInterceptor implements NestInterceptor {
  constructor(private logService: LogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    if (
      !['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) ||
      req.url.startsWith('/auth')
    ) {
      return next.handle();
    }

    const body    = req.body;
    const entitas = resolveEntitas(req.url);

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
          entitas,
          deskripsi:  buildDescription(method, entitas, body, response),
          ip_address: getIp(req),
        });
      }),
    );
  }
}
