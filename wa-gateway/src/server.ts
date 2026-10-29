// REST API gateway — hanya untuk ERP (header X-Api-Key), port dibatasi firewall Proxmox
import path from 'node:path';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { log } from './logger.js';
import { keJid, type Sesi } from './sesi.js';
import { panjangAntrean } from './webhook.js';

export function buatServer(sesi: Map<string, Sesi>) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '80mb' })); // media dikirim sebagai base64

  app.get('/health', (_req, res) => { res.json({ ok: true }); });

  app.use((req, res, next) => {
    const a = Buffer.from(String(req.headers['x-api-key'] ?? ''));
    const b = Buffer.from(config.apiKey);
    if (a.length !== b.length || !timingSafeEqual(a, b)) { res.status(401).json({ message: 'API key salah' }); return; }
    next();
  });

  const ambil = (req: Request): Sesi => {
    const s = sesi.get(String(req.params.akun));
    if (!s) throw Object.assign(new Error(`Akun ${req.params.akun} tidak ada`), { status: 404 });
    return s;
  };

  app.get('/akun', (_req, res) => { res.json({ data: [...sesi.values()].map((s) => s.info()) }); });
  app.get('/akun/:akun/status', (req, res) => { res.json({ data: { ...ambil(req).info(), antrean_webhook: panjangAntrean() } }); });
  app.post('/akun/:akun/mulai', async (req, res) => { const s = ambil(req); await s.mulai(); res.json({ data: s.info() }); });
  app.post('/akun/:akun/logout', async (req, res) => { const s = ambil(req); await s.logout(); res.json({ data: s.info() }); });

  app.post('/akun/:akun/kirim', async (req, res) => {
    const p = await ambil(req).kirim(req.body ?? {});
    res.json({ data: p });
  });
  app.post('/akun/:akun/baca', async (req, res) => {
    const { jid, pesan } = req.body ?? {};
    if (!jid || !Array.isArray(pesan)) throw Object.assign(new Error('jid & pesan wajib'), { status: 400 });
    await ambil(req).baca(keJid(jid), pesan);
    res.json({ data: true });
  });
  app.post('/akun/:akun/reaksi', async (req, res) => {
    const { jid, target, emoji } = req.body ?? {};
    if (!jid || !target?.id) throw Object.assign(new Error('jid & target wajib'), { status: 400 });
    await ambil(req).reaksi(keJid(jid), target, String(emoji ?? ''));
    res.json({ data: true });
  });
  app.get('/akun/:akun/grup/:jid', async (req, res) => { res.json({ data: await ambil(req).grup(String(req.params.jid)) }); });
  app.get('/akun/:akun/foto/:jid', async (req, res) => { res.json({ data: await ambil(req).foto(String(req.params.jid)) }); });

  // File media yang sudah diunduh gateway — ERP mengambil lalu menyimpannya sendiri
  app.get('/akun/:akun/media/:file', (req, res) => {
    const s = ambil(req);
    const file = String(req.params.file);
    if (!/^[\w.-]+$/.test(file)) { res.status(400).json({ message: 'Nama file tidak valid' }); return; }
    const full = path.join(s.dirMedia, file);
    if (!fs.existsSync(full)) { res.status(404).json({ message: 'Media tidak ada' }); return; }
    res.sendFile(full);
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = Number(err?.status) || 500;
    if (status >= 500) log.error({ err: err?.message }, 'Error API');
    res.status(status).json({ message: err?.message ?? 'Error' });
  });
  return app;
}
