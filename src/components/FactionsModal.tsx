import { ArrowLeft, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FACTION_TYPES, getTypeMeta } from '../config/morion.ts';
import type { MapRecord } from '../types/morion.ts';
import { getFactionBases } from '../utils/atlas.ts';

interface FactionsModalProps {
  open: boolean;
  initialFaction: MapRecord | null;
  initialIsNew: boolean;
  isEditing: boolean;
  allRecords: MapRecord[];
  saving: boolean;
  onClose: () => void;
  onUploadImage: (file: File) => Promise<string>;
  onSaveFaction: (draft: MapRecord, isNew: boolean) => Promise<void>;
  onRequestDeleteFaction: (faction: MapRecord) => void;
}

export function FactionsModal({
  open,
  initialFaction,
  initialIsNew,
  isEditing,
  allRecords,
  saving,
  onClose,
  onUploadImage,
  onSaveFaction,
  onRequestDeleteFaction,
}: FactionsModalProps) {
  const [selectedFaction, setSelectedFaction] = useState<MapRecord | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedFaction(initialFaction ? { ...initialFaction } : null);
      setIsNew(initialIsNew);
    } else {
      setSelectedFaction(null);
      setIsNew(false);
    }
  }, [open, initialFaction, initialIsNew]);

  if (!open) return null;

  const factions = allRecords
    .filter((r) => r.kind === 'faction')
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const mapLocations = allRecords
    .filter((r) => r.kind === 'location')
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const handleImageSelect = async (file: File | undefined) => {
    if (!file || !selectedFaction) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      setSelectedFaction((prev) => (prev ? { ...prev, image: url } : prev));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#13161c] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-6 py-4">
          <div className="flex items-center gap-3">
            {selectedFaction && (
              <button
                type="button"
                onClick={() => {
                  setSelectedFaction(null);
                  setIsNew(false);
                }}
                aria-label="Назад к списку фракций"
                className="rounded-lg border border-white/10 p-1.5 text-zinc-300 hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <div className="text-xs font-medium text-[#d4a359]">
                {selectedFaction ? (isNew ? '➕ Новая фракция' : '⚔️ Карточка фракции') : '⚔️ Справочник'}
              </div>
              <h2 className="font-display text-lg font-bold text-[#ebe6dc]">
                {selectedFaction ? selectedFaction.name || 'Новая фракция' : 'Фракции'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!selectedFaction ? (
            <div className="space-y-4">
              {factions.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 py-12 text-center">
                  <span className="mb-2.5 text-2xl" aria-hidden="true">⚔️</span>
                  <p className="text-sm font-medium text-zinc-300">Фракций пока нет</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Создайте орден, гильдию, культ или торговый дом в режиме редактирования.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/8 rounded-lg border border-white/10 bg-[#0b0d10]/60">
                  {factions.map((fac) => {
                    const meta = getTypeMeta(fac);
                    const bases = getFactionBases(allRecords, fac);
                    return (
                      <li
                        key={fac.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFaction({ ...fac });
                            setIsNew(false);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="text-lg">{meta.emoji}</span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#ebe6dc]">{fac.name}</div>
                            <div className="truncate text-xs text-zinc-400">
                              {meta.label}
                              {bases.length > 0
                                ? ` · ${bases.map((b) => b.name).join(', ')}`
                                : ' · Нет привязки'}
                            </div>
                          </div>
                        </button>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => onRequestDeleteFaction(fac)}
                            aria-label={`Удалить ${fac.name}`}
                            className="rounded p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFaction({
                      id: '',
                      kind: 'faction',
                      name: '',
                      type: 'guild',
                      short: '',
                      description: '',
                      image: '',
                      leader: '',
                      members: '',
                      goals: '',
                      bases: [],
                    });
                    setIsNew(true);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#d4a359] py-2.5 text-xs font-semibold text-[#111317] hover:bg-[#e0b46e]"
                >
                  ➕ Создать фракцию
                </button>
              )}
            </div>
          ) : isEditing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onSaveFaction(selectedFaction, isNew);
                setSelectedFaction(null);
                setIsNew(false);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="fac-name" className="block text-xs font-medium text-zinc-400">
                    Название
                  </label>
                  <input
                    id="fac-name"
                    type="text"
                    required
                    value={selectedFaction.name}
                    onChange={(e) =>
                      setSelectedFaction({ ...selectedFaction, name: e.target.value })
                    }
                    placeholder="Например: Орден Пепла"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="fac-type" className="block text-xs font-medium text-zinc-400">
                    Тип
                  </label>
                  <select
                    id="fac-type"
                    value={selectedFaction.type}
                    onChange={(e) =>
                      setSelectedFaction({ ...selectedFaction, type: e.target.value })
                    }
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                  >
                    {Object.entries(FACTION_TYPES).map(([k, info]) => (
                      <option key={k} value={k}>
                        {info.icon} {info.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="fac-leader" className="block text-xs font-medium text-zinc-400">
                    Руководитель
                  </label>
                  <input
                    id="fac-leader"
                    type="text"
                    value={selectedFaction.leader || ''}
                    onChange={(e) =>
                      setSelectedFaction({ ...selectedFaction, leader: e.target.value })
                    }
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="fac-members" className="block text-xs font-medium text-zinc-400">
                    Численность
                  </label>
                  <input
                    id="fac-members"
                    type="text"
                    value={selectedFaction.members || ''}
                    onChange={(e) =>
                      setSelectedFaction({ ...selectedFaction, members: e.target.value })
                    }
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="fac-goals" className="block text-xs font-medium text-zinc-400">
                  Цели
                </label>
                <input
                  id="fac-goals"
                  type="text"
                  value={selectedFaction.goals || ''}
                  onChange={(e) =>
                    setSelectedFaction({ ...selectedFaction, goals: e.target.value })
                  }
                  className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="fac-desc" className="block text-xs font-medium text-zinc-400">
                  Описание
                </label>
                <textarea
                  id="fac-desc"
                  rows={4}
                  value={selectedFaction.description}
                  onChange={(e) =>
                    setSelectedFaction({ ...selectedFaction, description: e.target.value })
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0b0d10] p-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-zinc-400">Базируется в локациях</span>
                {mapLocations.length === 0 ? (
                  <p className="mt-1.5 text-xs text-zinc-500">Сначала добавьте локации на карту.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mapLocations.map((loc) => {
                      const active = (selectedFaction.bases || []).includes(loc.id);
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => {
                            const prev = selectedFaction.bases || [];
                            const next = active
                              ? prev.filter((id) => id !== loc.id)
                              : [...prev, loc.id];
                            setSelectedFaction({ ...selectedFaction, bases: next });
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                            active
                              ? 'border-[#d4a359] bg-[#d4a359]/15 text-[#d4a359]'
                              : 'border-white/10 bg-[#0b0d10] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {loc.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="fac-img" className="block text-xs font-medium text-zinc-400">
                  Герб / изображение
                </label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="fac-img"
                    type="text"
                    value={selectedFaction.image}
                    onChange={(e) =>
                      setSelectedFaction({ ...selectedFaction, image: e.target.value })
                    }
                    className="h-10 flex-1 rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                  />
                  <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#191d25] px-4 text-xs font-medium text-zinc-200 hover:bg-[#222834]">
                    <span aria-hidden="true">🖼</span>
                    {uploading ? '⏳ Загрузка...' : 'Загрузить'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={uploading}
                      onChange={(e) => handleImageSelect(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-4">
                <div>
                  {!isNew && (
                    <button
                      type="button"
                      onClick={() => onRequestDeleteFaction(selectedFaction)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                    >
                      <span aria-hidden="true">🗑</span>
                      Удалить
                    </button>
                  )}
                </div>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFaction(null);
                      setIsNew(false);
                    }}
                    className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
                  >
                    Назад
                  </button>
                  <button
                    type="submit"
                    disabled={saving || uploading || !selectedFaction.name.trim()}
                    className="rounded-lg bg-[#d4a359] px-5 py-2 text-sm font-semibold text-[#111317] hover:bg-[#e0b46e] disabled:opacity-50"
                  >
                    {saving ? '⏳ Сохранение...' : '💾 Сохранить'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {selectedFaction.image && (
                <img
                  src={selectedFaction.image}
                  alt={selectedFaction.name}
                  referrerPolicy="no-referrer"
                  className="max-h-56 w-full rounded-lg border border-white/10 object-cover"
                />
              )}
              <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
                {selectedFaction.description || selectedFaction.short || 'Описание отсутствует.'}
              </p>
              <div className="grid grid-cols-1 gap-3 border-t border-white/8 pt-4 sm:grid-cols-3">
                {selectedFaction.leader && (
                  <div>
                    <div className="text-xs text-zinc-500">Руководитель</div>
                    <div className="mt-0.5 text-sm text-[#ebe6dc]">{selectedFaction.leader}</div>
                  </div>
                )}
                {selectedFaction.members && (
                  <div>
                    <div className="text-xs text-zinc-500">Численность</div>
                    <div className="mt-0.5 text-sm text-[#ebe6dc]">{selectedFaction.members}</div>
                  </div>
                )}
                {selectedFaction.goals && (
                  <div className="sm:col-span-3">
                    <div className="text-xs text-zinc-500">Цели</div>
                    <div className="mt-0.5 text-sm text-zinc-200">{selectedFaction.goals}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
