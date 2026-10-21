import { join } from 'path';
import { BadRequestException } from '@nestjs/common';

/** Satu-satunya folder upload lokal — ditulis oleh service, disajikan di /uploads oleh main.ts. */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Ekstensi dari whitelist mimetype gambar — jangan pernah dari input klien mentah (bisa .html → XSS). */
export function imageExtOrThrow(mimetype: string): string {
  const ext = IMAGE_EXT[mimetype];
  if (!ext) throw new BadRequestException('Format foto harus JPG, PNG, atau WEBP');
  return ext;
}
