import {
  ALLOWED_IMAGE_MIMES,
  MAX_IMAGE_BYTES,
  type AtlasState,
  type BackupPayload,
  type MapRecord,
} from '../types/morion.ts';

export const TOKEN_STORAGE_KEY = 'morion_master_token';

export class ApiError extends Error {
  status: number;
  atlas?: AtlasState;

  constructor(message: string, status: number, atlas?: AtlasState) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.atlas = atlas;
  }
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Сервер не ответил вовремя (таймаут)', 408);
    }
    throw new ApiError('Нет связи с сервером', 0);
  } finally {
    window.clearTimeout(timer);
  }
}

async function parseJsonResponse<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const atlas =
      Array.isArray(data.locations) && typeof data.version === 'number'
        ? { locations: data.locations as MapRecord[], version: data.version }
        : undefined;
    const message = typeof data.error === 'string' ? data.error : `Ошибка сервера (${resp.status})`;
    throw new ApiError(message, resp.status, atlas);
  }
  return data as T;
}

function authHeaders(token: string | null): HeadersInit {
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

export async function fetchHealth(): Promise<{ storage: 'postgres' | 'file'; devDefaultPinActive: boolean }> {
  const resp = await fetchWithTimeout('/api/health');
  return parseJsonResponse(resp);
}

export async function verifyMasterPin(pin: string): Promise<string> {
  const resp = await fetchWithTimeout('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  const data = await parseJsonResponse<{ ok: boolean; token: string }>(resp);
  if (!data.token) {
    throw new ApiError('Сервер не выдал токен сессии', 500);
  }
  return data.token;
}

export async function fetchAtlas(): Promise<AtlasState> {
  const resp = await fetchWithTimeout('/api/locations');
  return parseJsonResponse<AtlasState>(resp);
}

export async function createRecordApi(
  token: string,
  record: Omit<MapRecord, 'id'> & { id?: string },
  expectedVersion: number
): Promise<AtlasState & { record: MapRecord }> {
  const resp = await fetchWithTimeout('/api/locations', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ record, expectedVersion }),
  });
  return parseJsonResponse(resp);
}

export async function updateRecordApi(
  token: string,
  id: string,
  patch: Partial<MapRecord>,
  expectedVersion: number
): Promise<AtlasState> {
  const resp = await fetchWithTimeout(`/api/locations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ patch, expectedVersion }),
  });
  return parseJsonResponse(resp);
}

export async function deleteRecordApi(
  token: string,
  id: string,
  expectedVersion: number
): Promise<AtlasState> {
  const resp = await fetchWithTimeout(`/api/locations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
    body: JSON.stringify({ expectedVersion }),
  });
  return parseJsonResponse(resp);
}

export async function uploadImageApi(token: string, file: File): Promise<string> {
  const mime = file.type.toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.includes(mime as (typeof ALLOWED_IMAGE_MIMES)[number])) {
    throw new ApiError('Разрешены только PNG, JPEG, WebP и GIF', 415);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError('Размер файла превышает 5 МБ', 413);
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const part = result.split(',')[1];
      if (!part) reject(new Error('Не удалось прочитать файл'));
      else resolve(part);
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });

  const resp = await fetchWithTimeout(
    '/api/upload',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ data: base64, mime }),
    },
    30000
  );
  const data = await parseJsonResponse<{ ok: boolean; url: string }>(resp);
  return data.url;
}

export async function downloadBackupApi(token: string): Promise<void> {
  const resp = await fetchWithTimeout(
    '/api/backup',
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
    30000
  );
  if (!resp.ok) {
    await parseJsonResponse(resp);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `morion-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function restoreBackupApi(
  token: string,
  backup: BackupPayload
): Promise<{ locations: number; images: number; version: number }> {
  const resp = await fetchWithTimeout(
    '/api/restore',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ backup }),
    },
    30000
  );
  return parseJsonResponse(resp);
}
