import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LOCATION_TYPES, getTypeMeta } from '../config/morion.ts';
import type { MapRecord } from '../types/morion.ts';

interface SidebarProps {
  open: boolean;
  loading: boolean;
  locations: MapRecord[];
  selectedId: string | null;
  isEditing: boolean;
  onClose: () => void;
  onSelectLocation: (loc: MapRecord) => void;
  onOpenFactions: () => void;
  onResetView: () => void;
  onQuickCreateTip: () => void;
}

export function Sidebar({
  open,
  loading,
  locations,
  selectedId,
  isEditing,
  onClose,
  onSelectLocation,
  onOpenFactions,
  onResetView,
  onQuickCreateTip,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const mapLocations = useMemo(
    () => locations.filter((r) => r.kind === 'location'),
    [locations]
  );

  const factionsCount = useMemo(
    () => locations.filter((r) => r.kind === 'faction').length,
    [locations]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mapLocations
      .filter((loc) => {
        if (typeFilter !== 'all' && loc.type !== typeFilter) return false;
        if (!q) return true;
        return (
          loc.name.toLowerCase().includes(q) ||
          (loc.short || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [mapLocations, query, typeFilter]);

  const usedTypes = useMemo(() => {
    const set = new Set(mapLocations.map((l) => l.type));
    return Object.entries(LOCATION_TYPES).filter(([key]) => set.has(key));
  }, [mapLocations]);

  return (
    <aside
      aria-label="Атлас локаций"
      className={`fixed bottom-0 left-0 top-14 z-[900] flex w-[280px] flex-col border-r border-white/10 bg-[#13161c]/95 backdrop-blur-md transition-transform duration-200 ease-out ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#ebe6dc]">📍 Локации</h2>
          <p className="font-mono-tabular text-xs text-zinc-400">
            {mapLocations.length} точек · {factionsCount} фракций
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Скрыть панель"
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search & Filter */}
      <div className="space-y-2 border-b border-white/8 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию..."
            className="h-9 w-full rounded-lg border border-white/10 bg-[#0b0d10] pl-9 pr-8 text-sm text-[#ebe6dc] placeholder:text-zinc-500 focus:border-[#d4a359] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {usedTypes.length > 1 && (
          <select
            aria-label="Фильтр по типу"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-2.5 text-xs text-zinc-300 focus:border-[#d4a359] focus:outline-none"
          >
            <option value="all">Все типы ({mapLocations.length})</option>
            {usedTypes.map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.emoji} {meta.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-12 animate-pulse rounded-lg border border-white/5 bg-white/[0.03]"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <span className="mb-2.5 text-2xl" aria-hidden="true">
              {query || typeFilter !== 'all' ? '🔍' : '🗺️'}
            </span>
            <p className="text-sm font-medium text-zinc-300">
              {query || typeFilter !== 'all' ? 'Ничего не найдено' : 'Локаций пока нет'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              {query || typeFilter !== 'all'
                ? 'Попробуйте изменить запрос или сбросить фильтр.'
                : isEditing
                ? 'Кликните в любом месте карты, чтобы поставить первый маркер.'
                : 'Нажмите «Редактировать» вверху, чтобы добавить города и крепости.'}
            </p>
            {!query && typeFilter === 'all' && (
              <button
                type="button"
                onClick={onQuickCreateTip}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#d4a359]/40 bg-[#d4a359]/10 px-3 py-1.5 text-xs font-medium text-[#d4a359] hover:bg-[#d4a359]/20"
              >
                {isEditing ? '➕ Поставить на карту' : '✏️ Редактировать'}
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((loc) => {
              const meta = getTypeMeta(loc);
              const isSelected = loc.id === selectedId;
              return (
                <li key={loc.id}>
                  <button
                    type="button"
                    onClick={() => onSelectLocation(loc)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359] ${
                      isSelected
                        ? 'bg-[#d4a359]/15 text-[#ebe6dc] ring-1 ring-[#d4a359]/40'
                        : 'text-zinc-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#261d12] bg-[#f6f2e9] p-1">
                      {meta.image ? (
                        <img
                          src={meta.image}
                          alt={meta.label}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-sm">{meta.emoji}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[#ebe6dc]">
                        {loc.name}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="truncate">{meta.label}</span>
                        <span className="font-mono-tabular shrink-0 text-[11px] text-zinc-500">
                          {loc.x ?? 0}, {loc.y ?? 0}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Mobile quick actions footer */}
      <div className="flex items-center gap-2 border-t border-white/8 p-3 md:hidden">
        <button
          type="button"
          onClick={onOpenFactions}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#0b0d10] py-2 text-xs font-medium text-zinc-200"
        >
          ⚔️ Фракции
        </button>
        <button
          type="button"
          onClick={onResetView}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#0b0d10] py-2 text-xs font-medium text-zinc-200"
        >
          🎯 Обзор мира
        </button>
      </div>
    </aside>
  );
}
