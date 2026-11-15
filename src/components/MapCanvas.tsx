import L from 'leaflet';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MORION_CONFIG, WORLD_H, WORLD_W, ZOOM_LEVEL, getTypeMeta } from '../config/morion.ts';
import type { MapRecord } from '../types/morion.ts';
import { getFactionsAt, getSublocations, imageToLeaflet, leafletToImage } from '../utils/atlas.ts';

export interface MapCanvasHandle {
  flyToLocation: (loc: MapRecord) => void;
  resetView: () => void;
  invalidateSize: () => void;
}

interface MapCanvasProps {
  locations: MapRecord[];
  selectedId: string | null;
  isEditing: boolean;
  sidebarOpen: boolean;
  showLinks: boolean;
  onSelectLocation: (loc: MapRecord) => void;
  onOpenLocation: (loc: MapRecord) => void;
  onMoveLocation: (loc: MapRecord, x: number, y: number) => void;
  onCreateAtCoords: (x: number, y: number) => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    locations,
    selectedId,
    isEditing,
    sidebarOpen,
    showLinks,
    onSelectLocation,
    onOpenLocation,
    onMoveLocation,
    onCreateAtCoords,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const linksLayerRef = useRef<L.LayerGroup | null>(null);
  const markerByIdRef = useRef<Map<string, L.Marker>>(new Map());

  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({
    x: Math.round(MORION_CONFIG.IMAGE_WIDTH / 2),
    y: Math.round(MORION_CONFIG.IMAGE_HEIGHT / 2),
  });
  const [zoomDisplay, setZoomDisplay] = useState<number>(MORION_CONFIG.START_ZOOM);

  // Keep latest callbacks in refs so Leaflet event listeners never go stale
  const callbacksRef = useRef({
    isEditing,
    onSelectLocation,
    onOpenLocation,
    onMoveLocation,
    onCreateAtCoords,
  });
  callbacksRef.current = {
    isEditing,
    onSelectLocation,
    onOpenLocation,
    onMoveLocation,
    onCreateAtCoords,
  };

  useImperativeHandle(ref, () => ({
    flyToLocation(loc: MapRecord) {
      const map = mapRef.current;
      if (!map) return;
      const latlng = imageToLeaflet(loc.x ?? 0, loc.y ?? 0);
      const targetZoom = Math.max(map.getZoom(), 4);
      map.flyTo(latlng, targetZoom, { duration: 0.7 });
      const marker = markerByIdRef.current.get(loc.id);
      if (marker) {
        window.setTimeout(() => {
          marker.openPopup();
        }, 720);
      }
    },
    resetView() {
      const map = mapRef.current;
      if (!map) return;
      const px = (MORION_CONFIG.START_X_PERCENT / 100) * MORION_CONFIG.IMAGE_WIDTH;
      const py = (MORION_CONFIG.START_Y_PERCENT / 100) * MORION_CONFIG.IMAGE_HEIGHT;
      map.setView(imageToLeaflet(px, py), MORION_CONFIG.START_ZOOM, { animate: true });
    },
    invalidateSize() {
      mapRef.current?.invalidateSize();
    },
  }));

  // Initialize Leaflet once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const bounds = L.latLngBounds(L.latLng(-WORLD_H, 0), L.latLng(0, WORLD_W));
    const px = (MORION_CONFIG.START_X_PERCENT / 100) * MORION_CONFIG.IMAGE_WIDTH;
    const py = (MORION_CONFIG.START_Y_PERCENT / 100) * MORION_CONFIG.IMAGE_HEIGHT;

    const map = L.map(el, {
      crs: L.CRS.Simple,
      center: imageToLeaflet(px, py),
      zoom: MORION_CONFIG.START_ZOOM,
      minZoom: 1,
      maxZoom: ZOOM_LEVEL,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      zoomControl: false,
      maxBounds: bounds.pad(0.2),
    });

    const tileLayer = L.tileLayer(MORION_CONFIG.TILES_PATH, {
      tileSize: MORION_CONFIG.TILE_SIZE,
      tms: true,
      noWrap: true,
      bounds,
      minNativeZoom: 0,
      maxNativeZoom: MORION_CONFIG.MAX_NATIVE_ZOOM,
      keepBuffer: 2,
      updateWhenIdle: false,
    });
    tileLayer.on('tileerror', () => {
      // Suppress noisy empty-tile console spam outside irregular boundaries
    });
    tileLayer.addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const linksLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);
    linksLayerRef.current = linksLayer;
    markersLayerRef.current = markersLayer;
    mapRef.current = map;

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords(leafletToImage(e.latlng));
    });

    map.on('zoomend', () => {
      setZoomDisplay(Number(map.getZoom().toFixed(2)));
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!callbacksRef.current.isEditing) return;
      const coords = leafletToImage(e.latlng);
      callbacksRef.current.onCreateAtCoords(coords.x, coords.y);
    });

    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      linksLayerRef.current = null;
    };
  }, []);

  // Safely toggle cursor class without touching React's className prop on the Leaflet root
  useEffect(() => {
    containerRef.current?.classList.toggle('morion-editing-cursor', isEditing);
  }, [isEditing]);

  // Re-render markers & connection lines safely via DOM nodes (zero HTML string injection)
  useEffect(() => {
    const markersLayer = markersLayerRef.current;
    const linksLayer = linksLayerRef.current;
    if (!markersLayer || !linksLayer) return;

    markersLayer.clearLayers();
    linksLayer.clearLayers();
    markerByIdRef.current.clear();

    const mapLocs = locations.filter((r) => r.kind === 'location');

    if (showLinks) {
      const drawnPairs = new Set<string>();
      for (const loc of mapLocs) {
        for (const targetId of loc.links || []) {
          const target = mapLocs.find((l) => l.id === targetId);
          if (!target) continue;
          const pairKey = [loc.id, target.id].sort().join('::');
          if (drawnPairs.has(pairKey)) continue;
          drawnPairs.add(pairKey);

          L.polyline(
            [imageToLeaflet(loc.x ?? 0, loc.y ?? 0), imageToLeaflet(target.x ?? 0, target.y ?? 0)],
            {
              color: '#d4a359',
              weight: 2,
              opacity: 0.6,
              dashArray: '6 6',
              interactive: false,
            }
          ).addTo(linksLayer);
        }
      }
    }

    for (const loc of mapLocs) {
      const meta = getTypeMeta(loc);
      const isSelected = loc.id === selectedId;

      const pinEl = document.createElement('div');
      pinEl.className = [
        'morion-pin',
        meta.compact ? 'compact' : '',
        isSelected ? 'selected' : '',
        isEditing ? 'editable' : '',
      ]
        .filter(Boolean)
        .join(' ');

      if (meta.image) {
        const img = document.createElement('img');
        img.src = meta.image;
        img.alt = meta.label;
        img.draggable = false;
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
          img.remove();
          pinEl.textContent = meta.emoji;
        };
        pinEl.appendChild(img);
      } else {
        pinEl.textContent = meta.emoji;
      }

      const icon = L.divIcon({
        className: 'morion-marker-wrap',
        html: pinEl,
        iconSize: meta.compact ? [34, 34] : [42, 42],
        iconAnchor: meta.compact ? [17, 17] : [21, 21],
        popupAnchor: [0, -22],
      });

      const marker = L.marker(imageToLeaflet(loc.x ?? 0, loc.y ?? 0), {
        icon,
        draggable: isEditing,
      });

      // Safe DOM popup (no innerHTML / XSS)
      const popupRoot = document.createElement('div');
      popupRoot.className = 'p-3.5';

      const typeLabel = document.createElement('div');
      typeLabel.className = 'text-[11px] font-medium text-[#d4a359]';
      typeLabel.textContent = meta.label;

      const titleEl = document.createElement('div');
      titleEl.className = 'mt-0.5 font-display text-base font-bold text-[#ebe6dc]';
      titleEl.textContent = `${meta.emoji} ${loc.name}`;

      const subCount = getSublocations(locations, loc.id).length;
      const facCount = getFactionsAt(locations, loc.id).length;
      const statsParts: string[] = [];
      if (subCount > 0) statsParts.push(`🏛 ${subCount}`);
      if (facCount > 0) statsParts.push(`⚔️ ${facCount}`);

      const descEl = document.createElement('p');
      descEl.className = 'mt-1.5 text-xs leading-relaxed text-zinc-300';
      descEl.textContent = loc.short || meta.label;

      popupRoot.append(typeLabel, titleEl, descEl);

      if (statsParts.length > 0) {
        const statsEl = document.createElement('div');
        statsEl.className = 'mt-2 font-mono-tabular text-[11px] text-zinc-400';
        statsEl.textContent = statsParts.join(' · ');
        popupRoot.appendChild(statsEl);
      }

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className =
        'mt-3 w-full rounded-lg bg-[#d4a359] px-3 py-1.5 text-xs font-semibold text-[#111317] transition-colors hover:bg-[#e0b46e]';
      actionBtn.textContent = isEditing ? '✏️ Редактировать' : 'Подробнее →';
      actionBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        marker.closePopup();
        callbacksRef.current.onOpenLocation(loc);
      });
      popupRoot.appendChild(actionBtn);

      marker.bindPopup(popupRoot, { maxWidth: 290, minWidth: 220, closeButton: true });

      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        callbacksRef.current.onSelectLocation(loc);
        if (callbacksRef.current.isEditing) {
          marker.closePopup();
          callbacksRef.current.onOpenLocation(loc);
        }
      });

      if (isEditing) {
        marker.on('dragend', (ev) => {
          const moved = leafletToImage(ev.target.getLatLng());
          callbacksRef.current.onMoveLocation(loc, moved.x, moved.y);
        });
      }

      marker.addTo(markersLayer);
      markerByIdRef.current.set(loc.id, marker);
    }
  }, [locations, selectedId, isEditing, showLinks]);

  return (
    <div className="relative h-full w-full pt-14">
      <div ref={containerRef} className="h-full w-full" />

      {/* Quiet coordinate & zoom HUD */}
      <div
        className={`pointer-events-none fixed bottom-4 z-[800] hidden sm:flex items-center gap-3 rounded-lg border border-white/10 bg-[#13161c]/85 px-3 py-1.5 font-mono-tabular text-xs text-zinc-300 backdrop-blur-md transition-[left] duration-200 ${
          sidebarOpen ? 'left-[296px]' : 'left-4'
        }`}
      >
        <span>Z {zoomDisplay.toFixed(2)}</span>
        <span className="text-zinc-600" aria-hidden="true">·</span>
        <span>
          X {cursorCoords.x} / Y {cursorCoords.y}
        </span>
        {isEditing && (
          <>
            <span className="text-zinc-600" aria-hidden="true">·</span>
            <span className="text-[#d4a359]">Клик по карте создаёт метку</span>
          </>
        )}
      </div>
    </div>
  );
});
