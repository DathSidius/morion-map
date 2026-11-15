import L from 'leaflet';
import { MORION_CONFIG, ZOOM_LEVEL } from '../config/morion.ts';
import type { MapRecord } from '../types/morion.ts';

export function imageToLeaflet(x: number, y: number): L.LatLng {
  const scale = Math.pow(2, ZOOM_LEVEL);
  return L.latLng(-y / scale, x / scale);
}

export function leafletToImage(latlng: L.LatLng): { x: number; y: number } {
  const scale = Math.pow(2, ZOOM_LEVEL);
  return {
    x: Math.round(
      Math.min(MORION_CONFIG.IMAGE_WIDTH, Math.max(0, latlng.lng * scale))
    ),
    y: Math.round(
      Math.min(MORION_CONFIG.IMAGE_HEIGHT, Math.max(0, -latlng.lat * scale))
    ),
  };
}

export function findRecord(records: MapRecord[], id: string | null | undefined): MapRecord | undefined {
  if (!id) return undefined;
  return records.find((r) => r.id === id);
}

export function getSublocations(records: MapRecord[], parentId: string): MapRecord[] {
  return records.filter((r) => r.kind === 'sublocation' && r.parentId === parentId);
}

export function getFactionsAt(records: MapRecord[], locId: string): MapRecord[] {
  return records.filter((r) => r.kind === 'faction' && Array.isArray(r.bases) && r.bases.includes(locId));
}

export function getFactionBases(records: MapRecord[], faction: MapRecord): MapRecord[] {
  return (faction.bases || [])
    .map((id) => findRecord(records, id))
    .filter((r): r is MapRecord => Boolean(r));
}

export function getBreadcrumbs(records: MapRecord[], record: MapRecord): MapRecord[] {
  const path: MapRecord[] = [];
  let current: MapRecord | undefined = record;
  let guard = 0;
  while (current && guard < 10) {
    path.unshift(current);
    if (!current.parentId || current.kind === 'faction') break;
    current = findRecord(records, current.parentId);
    guard += 1;
  }
  return path;
}
