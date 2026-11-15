import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import type { AtlasState, BackupPayload, MapRecord, StoredImage } from '../src/types/morion.ts';

const { Pool } = pg;

export class ConflictError extends Error {
  currentState: AtlasState;
  constructor(message: string, currentState: AtlasState) {
    super(message);
    this.name = 'ConflictError';
    this.currentState = currentState;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface StorageAdapter {
  readonly mode: 'postgres' | 'file';
  init(): Promise<void>;
  getAtlas(): Promise<AtlasState>;
  createRecord(record: MapRecord, expectedVersion?: number): Promise<AtlasState>;
  updateRecord(id: string, patch: Partial<MapRecord>, expectedVersion?: number): Promise<AtlasState>;
  deleteRecord(id: string, expectedVersion?: number): Promise<AtlasState>;
  saveImage(image: StoredImage): Promise<void>;
  getImage(id: string): Promise<StoredImage | null>;
  getBackup(): Promise<BackupPayload>;
  restoreBackup(backup: BackupPayload): Promise<{ locations: number; images: number; version: number }>;
}

function applySymmetricLinksAndCascadeDelete(
  records: MapRecord[],
  targetId: string
): MapRecord[] {
  const toDelete = new Set<string>([targetId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of records) {
      if (r.parentId && toDelete.has(r.parentId) && !toDelete.has(r.id)) {
        toDelete.add(r.id);
        changed = true;
      }
    }
  }

  return records
    .filter((r) => !toDelete.has(r.id))
    .map((r) => ({
      ...r,
      links: r.links ? r.links.filter((id) => !toDelete.has(id)) : r.links,
      bases: r.bases ? r.bases.filter((id) => !toDelete.has(id)) : r.bases,
    }));
}

function syncBidirectionalLinks(
  records: MapRecord[],
  sourceId: string,
  prevLinks: string[],
  nextLinks: string[]
): MapRecord[] {
  const added = nextLinks.filter((id) => !prevLinks.includes(id));
  const removed = prevLinks.filter((id) => !nextLinks.includes(id));

  if (added.length === 0 && removed.length === 0) return records;

  return records.map((r) => {
    if (added.includes(r.id)) {
      const links = Array.isArray(r.links) ? r.links : [];
      return links.includes(sourceId) ? r : { ...r, links: [...links, sourceId] };
    }
    if (removed.includes(r.id)) {
      const links = Array.isArray(r.links) ? r.links : [];
      return { ...r, links: links.filter((id) => id !== sourceId) };
    }
    return r;
  });
}

class FileStorageAdapter implements StorageAdapter {
  readonly mode = 'file' as const;
  private dataDir: string;
  private storeFile: string;
  private imagesDir: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.storeFile = path.join(dataDir, 'morion-store.json');
    this.imagesDir = path.join(dataDir, 'images');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.imagesDir, { recursive: true });
    try {
      await fs.access(this.storeFile);
    } catch {
      await this.writeStore({ locations: [], version: 1 });
    }
  }

  private async readStore(): Promise<AtlasState> {
    try {
      const raw = await fs.readFile(this.storeFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AtlasState>;
      return {
        locations: Array.isArray(parsed.locations) ? parsed.locations : [],
        version: typeof parsed.version === 'number' ? parsed.version : 1,
      };
    } catch {
      return { locations: [], version: 1 };
    }
  }

  private async writeStore(state: AtlasState): Promise<void> {
    const tmp = `${this.storeFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, this.storeFile);
  }

  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(fn, fn);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async getAtlas(): Promise<AtlasState> {
    return this.readStore();
  }

  async createRecord(record: MapRecord, expectedVersion?: number): Promise<AtlasState> {
    return this.serialized(async () => {
      const state = await this.readStore();
      if (expectedVersion !== undefined && expectedVersion !== state.version) {
        throw new ConflictError('Карта была изменена другим пользователем. Данные обновлены.', state);
      }
      const now = new Date().toISOString();
      const created: MapRecord = { ...record, updatedAt: now };
      let nextLocations = [...state.locations, created];
      if (created.links && created.links.length > 0) {
        nextLocations = syncBidirectionalLinks(nextLocations, created.id, [], created.links);
      }
      const nextState: AtlasState = { locations: nextLocations, version: state.version + 1 };
      await this.writeStore(nextState);
      return nextState;
    });
  }

  async updateRecord(id: string, patch: Partial<MapRecord>, expectedVersion?: number): Promise<AtlasState> {
    return this.serialized(async () => {
      const state = await this.readStore();
      if (expectedVersion !== undefined && expectedVersion !== state.version) {
        throw new ConflictError('Карта была изменена другим пользователем. Данные обновлены.', state);
      }
      const existing = state.locations.find((r) => r.id === id);
      if (!existing) {
        throw new NotFoundError('Запись не найдена');
      }
      const prevLinks = Array.isArray(existing.links) ? existing.links : [];
      const updated: MapRecord = {
        ...existing,
        ...patch,
        id: existing.id,
        updatedAt: new Date().toISOString(),
      };
      let nextLocations = state.locations.map((r) => (r.id === id ? updated : r));
      if (patch.links !== undefined) {
        const nextLinks = Array.isArray(updated.links) ? updated.links : [];
        nextLocations = syncBidirectionalLinks(nextLocations, id, prevLinks, nextLinks);
      }
      const nextState: AtlasState = { locations: nextLocations, version: state.version + 1 };
      await this.writeStore(nextState);
      return nextState;
    });
  }

  async deleteRecord(id: string, expectedVersion?: number): Promise<AtlasState> {
    return this.serialized(async () => {
      const state = await this.readStore();
      if (expectedVersion !== undefined && expectedVersion !== state.version) {
        throw new ConflictError('Карта была изменена другим пользователем. Данные обновлены.', state);
      }
      if (!state.locations.some((r) => r.id === id)) {
        throw new NotFoundError('Запись не найдена');
      }
      const nextLocations = applySymmetricLinksAndCascadeDelete(state.locations, id);
      const nextState: AtlasState = { locations: nextLocations, version: state.version + 1 };
      await this.writeStore(nextState);
      return nextState;
    });
  }

  async saveImage(image: StoredImage): Promise<void> {
    const safeId = path.basename(image.id);
    await fs.writeFile(path.join(this.imagesDir, safeId), image.data);
    await fs.writeFile(
      path.join(this.imagesDir, `${safeId}.meta.json`),
      JSON.stringify({ mime: image.mime, createdAt: new Date().toISOString() })
    );
  }

  async getImage(id: string): Promise<StoredImage | null> {
    const safeId = path.basename(id);
    try {
      const [data, metaRaw] = await Promise.all([
        fs.readFile(path.join(this.imagesDir, safeId)),
        fs.readFile(path.join(this.imagesDir, `${safeId}.meta.json`), 'utf8'),
      ]);
      const meta = JSON.parse(metaRaw) as { mime?: string };
      return { id: safeId, mime: meta.mime || 'image/png', data };
    } catch {
      return null;
    }
  }

  async getBackup(): Promise<BackupPayload> {
    const state = await this.readStore();
    const files = await fs.readdir(this.imagesDir).catch(() => [] as string[]);
    const images = [];
    for (const file of files) {
      if (file.endsWith('.meta.json')) continue;
      const img = await this.getImage(file);
      if (img) {
        images.push({ id: img.id, mime: img.mime, data: img.data.toString('base64') });
      }
    }
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      locationsCount: state.locations.length,
      imagesCount: images.length,
      locations: state.locations,
      images,
    };
  }

  async restoreBackup(backup: BackupPayload): Promise<{ locations: number; images: number; version: number }> {
    return this.serialized(async () => {
      const state = await this.readStore();
      const existingFiles = await fs.readdir(this.imagesDir).catch(() => [] as string[]);
      for (const file of existingFiles) {
        await fs.unlink(path.join(this.imagesDir, file)).catch(() => undefined);
      }
      for (const img of backup.images) {
        await this.saveImage({
          id: img.id,
          mime: img.mime,
          data: Buffer.from(img.data, 'base64'),
        });
      }
      const nextVersion = state.version + 1;
      await this.writeStore({ locations: backup.locations, version: nextVersion });
      return {
        locations: backup.locations.length,
        images: backup.images.length,
        version: nextVersion,
      };
    });
  }
}

class PostgresStorageAdapter implements StorageAdapter {
  readonly mode = 'postgres' as const;
  private pool: pg.Pool;

  constructor(databaseUrl: string) {
    const envSsl = process.env.DATABASE_SSL?.trim().toLowerCase();
    let ssl: false | { rejectUnauthorized: boolean } | undefined;
    if (envSsl === 'true') {
      ssl = { rejectUnauthorized: false };
    } else if (envSsl === 'false') {
      ssl = false;
    } else if (/[?&](sslmode=(require|verify-ca|verify-full)|ssl=true)\b/i.test(databaseUrl)) {
      ssl = { rejectUnauthorized: false };
    } else if (/[?&]sslmode=disable\b/i.test(databaseUrl)) {
      ssl = false;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 15000,
      max: 5,
      ...(ssl !== undefined ? { ssl } : {}),
    });

    // Prevent unhandled 'error' events when managed Postgres (e.g. ONREZA Autosleep) drops idle connections
    this.pool.on('error', (err) => {
      console.error('Postgres pool idle error:', err.message);
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : '';
      const isTransient =
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNREFUSED' ||
        code === '57P01' ||
        code === '57P02' ||
        code === '57P03' ||
        code === '08003' ||
        code === '08006' ||
        /Connection terminated|terminating connection|timeout/i.test(msg);
      if (!isTransient) throw err;
      await new Promise((r) => setTimeout(r, 700));
      return fn();
    }
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS atlas_meta (
        key TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.pool.query(`
      INSERT INTO atlas_meta (key, version) VALUES ('main', 1)
      ON CONFLICT (key) DO NOTHING;
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        kind TEXT,
        name TEXT,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  private async readAtlasWithClient(client: pg.PoolClient): Promise<AtlasState> {
    const metaRes = await client.query<{ version: number }>(
      `SELECT version FROM atlas_meta WHERE key = 'main' FOR UPDATE`
    );
    const version = metaRes.rows[0]?.version ?? 1;
    const locRes = await client.query<{ data: MapRecord }>(
      `SELECT data FROM locations ORDER BY updated_at DESC`
    );
    return {
      locations: locRes.rows.map((r) => r.data),
      version,
    };
  }

  async getAtlas(): Promise<AtlasState> {
    return this.withRetry(async () => {
      const [metaRes, locRes] = await Promise.all([
        this.pool.query<{ version: number }>(`SELECT version FROM atlas_meta WHERE key = 'main'`),
        this.pool.query<{ data: MapRecord }>(`SELECT data FROM locations ORDER BY updated_at DESC`),
      ]);
      return {
        locations: locRes.rows.map((r) => r.data),
        version: metaRes.rows[0]?.version ?? 1,
      };
    });
  }

  private async runVersionedMutation(
    expectedVersion: number | undefined,
    mutator: (current: MapRecord[]) => MapRecord[]
  ): Promise<AtlasState> {
    return this.withRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO atlas_meta (key, version) VALUES ('main', 1) ON CONFLICT (key) DO NOTHING`
        );
        const state = await this.readAtlasWithClient(client);
      if (expectedVersion !== undefined && expectedVersion !== state.version) {
        await client.query('ROLLBACK');
        throw new ConflictError('Карта была изменена другим пользователем. Данные обновлены.', state);
      }

      const nextLocations = mutator(state.locations);
      const nextIds = new Set(nextLocations.map((r) => r.id));

      for (const old of state.locations) {
        if (!nextIds.has(old.id)) {
          await client.query(`DELETE FROM locations WHERE id = $1`, [old.id]);
        }
      }

      for (const loc of nextLocations) {
        await client.query(
          `INSERT INTO locations (id, kind, name, data, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             kind = EXCLUDED.kind,
             name = EXCLUDED.name,
             data = EXCLUDED.data,
             updated_at = CURRENT_TIMESTAMP`,
          [loc.id, loc.kind, loc.name, JSON.stringify(loc)]
        );
      }

      const nextVersion = state.version + 1;
      await client.query(
        `UPDATE atlas_meta SET version = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'main'`,
        [nextVersion]
      );
      await client.query('COMMIT');
      return { locations: nextLocations, version: nextVersion };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    });
  }

  async createRecord(record: MapRecord, expectedVersion?: number): Promise<AtlasState> {
    return this.runVersionedMutation(expectedVersion, (current) => {
      const created: MapRecord = { ...record, updatedAt: new Date().toISOString() };
      let next = [...current, created];
      if (created.links && created.links.length > 0) {
        next = syncBidirectionalLinks(next, created.id, [], created.links);
      }
      return next;
    });
  }

  async updateRecord(id: string, patch: Partial<MapRecord>, expectedVersion?: number): Promise<AtlasState> {
    return this.runVersionedMutation(expectedVersion, (current) => {
      const existing = current.find((r) => r.id === id);
      if (!existing) throw new NotFoundError('Запись не найдена');
      const prevLinks = Array.isArray(existing.links) ? existing.links : [];
      const updated: MapRecord = {
        ...existing,
        ...patch,
        id: existing.id,
        updatedAt: new Date().toISOString(),
      };
      let next = current.map((r) => (r.id === id ? updated : r));
      if (patch.links !== undefined) {
        const nextLinks = Array.isArray(updated.links) ? updated.links : [];
        next = syncBidirectionalLinks(next, id, prevLinks, nextLinks);
      }
      return next;
    });
  }

  async deleteRecord(id: string, expectedVersion?: number): Promise<AtlasState> {
    return this.runVersionedMutation(expectedVersion, (current) => {
      if (!current.some((r) => r.id === id)) {
        throw new NotFoundError('Запись не найдена');
      }
      return applySymmetricLinksAndCascadeDelete(current, id);
    });
  }

  async saveImage(image: StoredImage): Promise<void> {
    await this.pool.query(
      `INSERT INTO images (id, mime, data) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data`,
      [image.id, image.mime, image.data]
    );
  }

  async getImage(id: string): Promise<StoredImage | null> {
    const res = await this.pool.query<{ id: string; mime: string; data: Buffer }>(
      `SELECT id, mime, data FROM images WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  }

  async getBackup(): Promise<BackupPayload> {
    const [locRes, imgRes] = await Promise.all([
      this.pool.query<{ data: MapRecord }>(`SELECT data FROM locations ORDER BY updated_at DESC`),
      this.pool.query<{ id: string; mime: string; data: Buffer }>(`SELECT id, mime, data FROM images`),
    ]);
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      locationsCount: locRes.rows.length,
      imagesCount: imgRes.rows.length,
      locations: locRes.rows.map((r) => r.data),
      images: imgRes.rows.map((r) => ({
        id: r.id,
        mime: r.mime,
        data: r.data.toString('base64'),
      })),
    };
  }

  async restoreBackup(backup: BackupPayload): Promise<{ locations: number; images: number; version: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const state = await this.readAtlasWithClient(client);
      await client.query('DELETE FROM locations');
      await client.query('DELETE FROM images');
      for (const loc of backup.locations) {
        await client.query(
          `INSERT INTO locations (id, kind, name, data) VALUES ($1, $2, $3, $4)`,
          [loc.id, loc.kind, loc.name, JSON.stringify(loc)]
        );
      }
      for (const img of backup.images) {
        await client.query(`INSERT INTO images (id, mime, data) VALUES ($1, $2, $3)`, [
          img.id,
          img.mime,
          Buffer.from(img.data, 'base64'),
        ]);
      }
      const nextVersion = state.version + 1;
      await client.query(
        `UPDATE atlas_meta SET version = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'main'`,
        [nextVersion]
      );
      await client.query('COMMIT');
      return {
        locations: backup.locations.length,
        images: backup.images.length,
        version: nextVersion,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

export function createStorage(): StorageAdapter {
  const dbUrl = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (dbUrl) {
    return new PostgresStorageAdapter(dbUrl);
  }
  return new FileStorageAdapter(path.resolve(process.cwd(), 'data'));
}
