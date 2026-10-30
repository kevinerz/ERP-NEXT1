import { createHash, createHmac, timingSafeEqual } from 'crypto';

// Token & webhook LiveKit tanpa SDK: JWT HS256 dengan API key/secret LiveKit.
// Lihat https://docs.livekit.io/home/get-started/authentication/

export interface VideoGrant {
  room?: string;
  roomJoin?: boolean;
  roomAdmin?: boolean;
  roomCreate?: boolean;
  roomList?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function buatToken(apiKey: string, secret: string, isi: { identity?: string; name?: string; metadata?: string; video: VideoGrant; ttlDetik?: number }) {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: apiKey,
    nbf: now - 10,
    exp: now + (isi.ttlDetik ?? 6 * 3600),
    video: isi.video,
  };
  if (isi.identity) { payload.sub = isi.identity; payload.jti = isi.identity; }
  if (isi.name) payload.name = isi.name;
  if (isi.metadata) payload.metadata = isi.metadata;
  const kepala = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const badan = b64url(JSON.stringify(payload));
  const tanda = b64url(createHmac('sha256', secret).update(`${kepala}.${badan}`).digest());
  return `${kepala}.${badan}.${tanda}`;
}

/** Verifikasi webhook LiveKit: header Authorization = JWT yang memuat sha256 (base64) dari body mentah */
export function verifikasiWebhook(apiKey: string, secret: string, body: Buffer, auth: string | undefined): boolean {
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const [kepala, badan, tanda] = token.split('.');
  if (!kepala || !badan || !tanda) return false;
  const harus = b64url(createHmac('sha256', secret).update(`${kepala}.${badan}`).digest());
  const a = Buffer.from(tanda), b = Buffer.from(harus);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  let p: any;
  try { p = JSON.parse(Buffer.from(badan.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  if (p.iss !== apiKey || (p.exp && p.exp < now - 60) || (p.nbf && p.nbf > now + 60)) return false;
  const hash = createHash('sha256').update(body).digest('base64');
  return p.sha256 === hash;
}
