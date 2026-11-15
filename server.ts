import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ConflictError, NotFoundError, createStorage } from './server/storage.ts';
import {
  ALLOWED_IMAGE_MIMES,
  MAX_IMAGE_BYTES,
  type BackupPayload,
  type MapRecord,
  type RecordKind,
} from './src/types/morion.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const CONFIGURED_PIN = process.env.EDIT_PIN?.trim() || '';
const DEV_FALLBACK_PIN = '2468';
const ACTIVE_PIN = CONFIGURED_PIN || (IS_PROD ? '' : DEV_FALLBACK_PIN);
const USING_DEV_DEFAULT_PIN = !IS_PROD && !CONFIGURED_PIN;

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

const TILES_BASE_URL = (
  process.env.TILES_BASE_URL?.trim() ||
  'https://raw.githubusercontent.com/DathSidius/morion-map/relaxdev/onreza-output/tiles'
).replace(/\/+$/, '');

const LOCAL_TILES_DIR = path.resolve(process.cwd(), 'public/tiles');

// Rate limiter for PIN attempts (5 failures / 5 minutes per IP)
const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function isRateLimited(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearFailures(ip: string): void {
  failedAttempts.delete(ip);
}

function signSessionToken(ttlMs = 12 * 60 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ exp, role: 'master' })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
      role?: string;
    };
    return parsed.role === 'master' && typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function timingSafePinMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireMasterAuth(req: Request, res: Response, next: NextFunction): void {
  if (!ACTIVE_PIN) {
    res.status(503).json({ error: 'EDIT_PIN не настроен на сервере' });
    return;
  }
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !verifySessionToken(token)) {
    res.status(401).json({ error: 'Требуется авторизация мастера' });
    return;
  }
  next();
}

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/;
const ALLOWED_KINDS: RecordKind[] = ['location', 'sublocation', 'faction'];

function isAllowedImageUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('/api/image/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function sanitizeRecordInput(raw: unknown, requireId: boolean): MapRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (requireId && !SAFE_ID_RE.test(id)) return null;

  const kind = obj.kind as RecordKind;
  if (!ALLOWED_KINDS.includes(kind)) return null;

  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 120) : '';
  if (!name) return null;

  const type = typeof obj.type === 'string' ? obj.type.trim().slice(0, 40) : 'city';
  const short = typeof obj.short === 'string' ? obj.short.trim().slice(0, 240) : '';
  const description = typeof obj.description === 'string' ? obj.description.trim().slice(0, 20000) : '';
  const image = typeof obj.image === 'string' ? obj.image.trim().slice(0, 1024) : '';
  if (!isAllowedImageUrl(image)) return null;

  const record: MapRecord = {
    id: id || `rec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    kind,
    name,
    type,
    short,
    description,
    image,
  };

  if (kind === 'location') {
    const x = typeof obj.x === 'number' && Number.isFinite(obj.x) ? Math.round(obj.x) : 0;
    const y = typeof obj.y === 'number' && Number.isFinite(obj.y) ? Math.round(obj.y) : 0;
    record.x = x;
    record.y = y;
    record.parentId = null;
    record.links = Array.isArray(obj.links)
      ? obj.links.filter((v): v is string => typeof v === 'string' && SAFE_ID_RE.test(v))
      : [];
  } else if (kind === 'sublocation') {
    const parentId = typeof obj.parentId === 'string' && SAFE_ID_RE.test(obj.parentId) ? obj.parentId : null;
    if (!parentId) return null;
    record.parentId = parentId;
    record.links = [];
  } else if (kind === 'faction') {
    record.leader = typeof obj.leader === 'string' ? obj.leader.trim().slice(0, 160) : '';
    record.members = typeof obj.members === 'string' ? obj.members.trim().slice(0, 240) : '';
    record.goals = typeof obj.goals === 'string' ? obj.goals.trim().slice(0, 500) : '';
    record.bases = Array.isArray(obj.bases)
      ? obj.bases.filter((v): v is string => typeof v === 'string' && SAFE_ID_RE.test(v))
      : [];
  }

  return record;
}

async function startServer() {
  const storage = createStorage();
  await storage.init();

  const app = express();
  app.disable('x-powered-by');

  const jsonSmall = express.json({ limit: '1mb' });
  const jsonMedia = express.json({ limit: '10mb' });
  const jsonRestore = express.json({ limit: '35mb' });

  // Health & config info
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      storage: storage.mode,
      devDefaultPinActive: USING_DEV_DEFAULT_PIN,
    });
  });

  // Auth verification
  app.post('/api/auth/verify', jsonSmall, (req, res) => {
    if (!ACTIVE_PIN) {
      res.status(503).json({ error: 'EDIT_PIN не настроен в переменных окружения' });
      return;
    }
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      res.status(429).json({ error: 'Слишком много неверных попыток. Подождите 5 минут.' });
      return;
    }

    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!pin || !timingSafePinMatch(pin, ACTIVE_PIN)) {
      recordFailure(ip);
      res.status(401).json({ error: 'Неверный PIN-код' });
      return;
    }

    clearFailures(ip);
    const token = signSessionToken();
    res.json({ ok: true, token });
  });

  // Atlas read
  app.get('/api/locations', async (_req, res) => {
    try {
      const state = await storage.getAtlas();
      res.json(state);
    } catch (err) {
      console.error('GET /api/locations:', err);
      res.status(500).json({ error: 'Не удалось загрузить данные карты' });
    }
  });

  // Granular CRUD with optimistic locking
  app.post('/api/locations', requireMasterAuth, jsonSmall, async (req, res) => {
    const expectedVersion =
      typeof req.body?.expectedVersion === 'number' ? req.body.expectedVersion : undefined;
    const record = sanitizeRecordInput(req.body?.record, false);
    if (!record) {
      res.status(400).json({ error: 'Некорректные данные записи' });
      return;
    }

    try {
      const next = await storage.createRecord(record, expectedVersion);
      res.status(201).json({ ok: true, record, ...next });
    } catch (err) {
      if (err instanceof ConflictError) {
        res.status(409).json({ error: err.message, ...err.currentState });
        return;
      }
      console.error('POST /api/locations:', err);
      res.status(500).json({ error: 'Ошибка сохранения записи' });
    }
  });

  app.patch('/api/locations/:id', requireMasterAuth, jsonSmall, async (req, res) => {
    const id = req.params.id;
    if (!SAFE_ID_RE.test(id)) {
      res.status(400).json({ error: 'Некорректный ID' });
      return;
    }
    const expectedVersion =
      typeof req.body?.expectedVersion === 'number' ? req.body.expectedVersion : undefined;

    const current = await storage.getAtlas();
    const existing = current.locations.find((r) => r.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Запись не найдена' });
      return;
    }

    const merged = sanitizeRecordInput({ ...existing, ...(req.body?.patch || {}), id: existing.id }, true);
    if (!merged) {
      res.status(400).json({ error: 'Некорректные поля обновления' });
      return;
    }

    try {
      const next = await storage.updateRecord(id, merged, expectedVersion);
      res.json({ ok: true, ...next });
    } catch (err) {
      if (err instanceof ConflictError) {
        res.status(409).json({ error: err.message, ...err.currentState });
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      console.error('PATCH /api/locations/:id:', err);
      res.status(500).json({ error: 'Ошибка обновления записи' });
    }
  });

  app.delete('/api/locations/:id', requireMasterAuth, jsonSmall, async (req, res) => {
    const id = req.params.id;
    if (!SAFE_ID_RE.test(id)) {
      res.status(400).json({ error: 'Некорректный ID' });
      return;
    }
    const expectedVersion =
      typeof req.body?.expectedVersion === 'number' ? req.body.expectedVersion : undefined;

    try {
      const next = await storage.deleteRecord(id, expectedVersion);
      res.json({ ok: true, ...next });
    } catch (err) {
      if (err instanceof ConflictError) {
        res.status(409).json({ error: err.message, ...err.currentState });
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      console.error('DELETE /api/locations/:id:', err);
      res.status(500).json({ error: 'Ошибка удаления записи' });
    }
  });

  // Strict MIME-validated image upload
  app.post('/api/upload', requireMasterAuth, jsonMedia, async (req, res) => {
    const data = typeof req.body?.data === 'string' ? req.body.data : '';
    const mime = typeof req.body?.mime === 'string' ? req.body.mime.toLowerCase().trim() : '';

    if (!ALLOWED_IMAGE_MIMES.includes(mime as (typeof ALLOWED_IMAGE_MIMES)[number])) {
      res.status(415).json({ error: 'Разрешены только PNG, JPEG, WebP и GIF' });
      return;
    }
    if (!data) {
      res.status(400).json({ error: 'Пустой файл' });
      return;
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Размер файла не должен превышать 5 МБ' });
      return;
    }

    const id = `img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    try {
      await storage.saveImage({ id, mime, data: buffer });
      res.json({ ok: true, id, url: `/api/image/${id}` });
    } catch (err) {
      console.error('POST /api/upload:', err);
      res.status(500).json({ error: 'Не удалось сохранить изображение' });
    }
  });

  app.get('/api/image/:id', async (req, res) => {
    const id = req.params.id;
    if (!SAFE_ID_RE.test(id)) {
      res.status(400).send('Invalid ID');
      return;
    }
    try {
      const img = await storage.getImage(id);
      if (!img) {
        res.status(404).send('Not found');
        return;
      }
      const safeMime = ALLOWED_IMAGE_MIMES.includes(img.mime as (typeof ALLOWED_IMAGE_MIMES)[number])
        ? img.mime
        : 'application/octet-stream';
      res.set('Content-Type', safeMime);
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'");
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(img.data);
    } catch (err) {
      console.error('GET /api/image/:id:', err);
      res.status(500).send('Error');
    }
  });

  // Backup & Restore (Bearer auth only, no PIN in query string)
  app.get('/api/backup', requireMasterAuth, async (_req, res) => {
    try {
      const backup = await storage.getBackup();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="morion-backup-${stamp}.json"`);
      res.send(JSON.stringify(backup, null, 2));
    } catch (err) {
      console.error('GET /api/backup:', err);
      res.status(500).json({ error: 'Не удалось сформировать бэкап' });
    }
  });

  app.post('/api/restore', requireMasterAuth, jsonRestore, async (req, res) => {
    const rawBackup = req.body?.backup as Partial<BackupPayload> | undefined;
    if (!rawBackup || !Array.isArray(rawBackup.locations)) {
      res.status(400).json({ error: 'Некорректный бэкап: отсутствует массив locations' });
      return;
    }

    const sanitizedLocations: MapRecord[] = [];
    for (const item of rawBackup.locations) {
      const rec = sanitizeRecordInput(item, true);
      if (!rec) {
        res.status(400).json({ error: 'Бэкап содержит повреждённую или небезопасную запись локации' });
        return;
      }
      sanitizedLocations.push(rec);
    }

    const sanitizedImages: BackupPayload['images'] = [];
    if (Array.isArray(rawBackup.images)) {
      for (const img of rawBackup.images) {
        if (
          !img ||
          typeof img.id !== 'string' ||
          !SAFE_ID_RE.test(img.id) ||
          typeof img.mime !== 'string' ||
          !ALLOWED_IMAGE_MIMES.includes(img.mime.toLowerCase() as (typeof ALLOWED_IMAGE_MIMES)[number]) ||
          typeof img.data !== 'string'
        ) {
          res.status(400).json({ error: 'Бэкап содержит недопустимое изображение' });
          return;
        }
        sanitizedImages.push({ id: img.id, mime: img.mime.toLowerCase(), data: img.data });
      }
    }

    try {
      const result = await storage.restoreBackup({
        version: 2,
        exportedAt: new Date().toISOString(),
        locationsCount: sanitizedLocations.length,
        imagesCount: sanitizedImages.length,
        locations: sanitizedLocations,
        images: sanitizedImages,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('POST /api/restore:', err);
      res.status(500).json({ error: 'Ошибка восстановления бэкапа' });
    }
  });

  // Tile server: local public/tiles first, otherwise transparent proxy from TILES_BASE_URL
  app.get('/tiles/:z/:x/:y.png', async (req, res) => {
    const { z, x, y } = req.params;
    if (!/^\d{1,2}$/.test(z) || !/^\d{1,4}$/.test(x) || !/^\d{1,4}$/.test(y)) {
      res.status(400).end();
      return;
    }

    const localFile = path.join(LOCAL_TILES_DIR, z, x, `${y}.png`);
    try {
      const buf = await fs.readFile(localFile);
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=604800');
      res.send(buf);
      return;
    } catch {
      // Fallback to remote TILES_BASE_URL
    }

    try {
      const upstream = await fetch(`${TILES_BASE_URL}/${z}/${x}/${y}.png`);
      if (!upstream.ok) {
        res.status(404).end();
        return;
      }
      const arrayBuf = await upstream.arrayBuffer();
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=604800');
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.status(404).end();
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Morion Atlas running on http://0.0.0.0:${PORT} (storage: ${storage.mode})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Morion Atlas:', err);
  process.exit(1);
});
