export type RecordKind = 'location' | 'sublocation' | 'faction';

export interface MapRecord {
  id: string;
  kind: RecordKind;
  name: string;
  type: string;
  parentId?: string | null;
  x?: number;
  y?: number;
  short: string;
  description: string;
  image: string;
  links?: string[];
  leader?: string;
  members?: string;
  goals?: string;
  bases?: string[];
  updatedAt?: string;
}

export interface AtlasState {
  locations: MapRecord[];
  version: number;
}

export interface StoredImage {
  id: string;
  mime: string;
  data: Buffer;
}

export interface BackupImageEntry {
  id: string;
  mime: string;
  data: string;
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  locationsCount: number;
  imagesCount: number;
  locations: MapRecord[];
  images: BackupImageEntry[];
}

export const ALLOWED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
