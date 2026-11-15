import { ChevronRight, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  FACTION_TYPES,
  LOCATION_TYPES,
  SUBLOCATION_TYPES,
  getTypeMeta,
} from '../config/morion.ts';
import type { MapRecord } from '../types/morion.ts';
import { findRecord, getBreadcrumbs, getFactionsAt, getSublocations } from '../utils/atlas.ts';

type TabId = 'desc' | 'sub' | 'fac' | 'links';

interface LocationModalProps {
  record: MapRecord | null;
  isNew: boolean;
  isEditing: boolean;
  allRecords: MapRecord[];
  saving: boolean;
  onClose: () => void;
  onOpenRecord: (rec: MapRecord) => void;
  onStartCreateSublocation: (parentId: string) => void;
  onStartCreateFactionAt: (locId: string) => void;
  onAttachFaction: (factionId: string, locId: string) => Promise<void>;
  onDetachFaction: (factionId: string, locId: string) => Promise<void>;
  onToggleLink: (sourceId: string, targetId: string, add: boolean) => Promise<void>;
  onUploadImage: (file: File) => Promise<string>;
  onSave: (draft: MapRecord, isNew: boolean) => Promise<void>;
  onRequestDelete: (rec: MapRecord) => void;
}

export function LocationModal({
  record,
  isNew,
  isEditing,
  allRecords,
  saving,
  onClose,
  onOpenRecord,
  onStartCreateSublocation,
  onStartCreateFactionAt,
  onAttachFaction,
  onDetachFaction,
  onToggleLink,
  onUploadImage,
  onSave,
  onRequestDelete,
}: LocationModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('desc');
  const [draft, setDraft] = useState<MapRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFactionToAttach, setSelectedFactionToAttach] = useState('');
  const [selectedLinkToAdd, setSelectedLinkToAdd] = useState('');

  useEffect(() => {
    if (record) {
      setDraft({ ...record });
      setActiveTab('desc');
      setSelectedFactionToAttach('');
      setSelectedLinkToAdd('');
    } else {
      setDraft(null);
    }
  }, [record]);

  const liveRecord = useMemo(() => {
    if (!record) return null;
    if (isNew) return record;
    return findRecord(allRecords, record.id) || record;
  }, [allRecords, isNew, record]);

  if (!record || !draft || !liveRecord) return null;

  const meta = getTypeMeta(liveRecord);
  const breadcrumbs = getBreadcrumbs(allRecords, liveRecord);
  const sublocations = getSublocations(allRecords, liveRecord.id);
  const factionsHere = getFactionsAt(allRecords, liveRecord.id);
  const linkedLocations = (liveRecord.links || [])
    .map((id) => findRecord(allRecords, id))
    .filter((r): r is MapRecord => Boolean(r));

  const availableFactions = allRecords.filter(
    (r) => r.kind === 'faction' && !factionsHere.some((f) => f.id === r.id)
  );
  const availableLinkTargets = allRecords.filter(
    (r) =>
      r.kind === 'location' &&
      r.id !== liveRecord.id &&
      !(liveRecord.links || []).includes(r.id)
  );

  const typeDict =
    draft.kind === 'faction'
      ? FACTION_TYPES
      : draft.kind === 'sublocation'
      ? SUBLOCATION_TYPES
      : LOCATION_TYPES;

  const showTabs = !isNew && liveRecord.kind === 'location';

  const handleImageSelect = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      setDraft((prev) => (prev ? { ...prev, image: url } : prev));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#13161c] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-[#d4a359]">
              <span>{isNew ? '➕ Создание' : `${meta.emoji} ${meta.label}`}</span>
              {liveRecord.kind === 'location' && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span className="font-mono-tabular text-zinc-400">
                    X {liveRecord.x ?? 0}, Y {liveRecord.y ?? 0}
                  </span>
                </>
              )}
            </div>
            <h2 className="mt-0.5 truncate font-display text-xl font-bold text-[#ebe6dc]">
              {isNew ? 'Новая локация' : liveRecord.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs.length > 1 && (
          <nav
            aria-label="Навигация"
            className="flex flex-wrap items-center gap-1.5 border-b border-white/8 bg-[#0b0d10]/60 px-6 py-2 text-xs text-zinc-400"
          >
            {breadcrumbs.map((node, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <span key={node.id} className="flex items-center gap-1.5">
                  {isLast ? (
                    <span className="font-medium text-[#ebe6dc]">{node.name}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenRecord(node)}
                      className="hover:text-[#d4a359] hover:underline"
                    >
                      {node.name}
                    </button>
                  )}
                  {!isLast && <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />}
                </span>
              );
            })}
          </nav>
        )}

        {/* Tabs */}
        {showTabs && (
          <div className="flex items-center gap-1 border-b border-white/8 bg-[#0b0d10]/40 px-6 py-2 overflow-x-auto">
            {(
              [
                { id: 'desc', label: '📜 Описание' },
                { id: 'sub', label: `🏛 Районы${sublocations.length ? ` (${sublocations.length})` : ''}` },
                { id: 'fac', label: `⚔️ Фракции${factionsHere.length ? ` (${factionsHere.length})` : ''}` },
                { id: 'links', label: `🔗 Связи${linkedLocations.length ? ` (${linkedLocations.length})` : ''}` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#d4a359]/15 text-[#d4a359]'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'desc' && (
            isEditing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSave(draft, isNew);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="loc-name" className="block text-xs font-medium text-zinc-400">
                      Название
                    </label>
                    <input
                      id="loc-name"
                      type="text"
                      required
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="Например: Тирон"
                      className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="loc-type" className="block text-xs font-medium text-zinc-400">
                      Тип
                    </label>
                    <select
                      id="loc-type"
                      value={draft.type}
                      onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                      className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                    >
                      {Object.entries(typeDict).map(([key, info]) => {
                        const icon = 'emoji' in info ? info.emoji : info.icon;
                        return (
                          <option key={key} value={key}>
                            {icon} {info.label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="loc-short" className="block text-xs font-medium text-zinc-400">
                    Краткое описание (для попапа)
                  </label>
                  <input
                    id="loc-short"
                    type="text"
                    value={draft.short}
                    onChange={(e) => setDraft({ ...draft, short: e.target.value })}
                    placeholder="Одно предложение о месте"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="loc-desc" className="block text-xs font-medium text-zinc-400">
                    Полное описание
                  </label>
                  <textarea
                    id="loc-desc"
                    rows={5}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="Лор, заметки мастера, ключевые NPC..."
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0b0d10] p-3 text-sm leading-relaxed text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="loc-image" className="block text-xs font-medium text-zinc-400">
                    Иллюстрация (URL или загрузка PNG/JPG/WebP до 5 МБ)
                  </label>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="loc-image"
                      type="text"
                      value={draft.image}
                      onChange={(e) => setDraft({ ...draft, image: e.target.value })}
                      placeholder="https://... или загрузите файл"
                      className="h-10 flex-1 rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                    />
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#191d25] px-4 text-xs font-medium text-zinc-200 hover:bg-[#222834] whitespace-nowrap">
                      <span aria-hidden="true">🖼</span>
                      {uploading ? '⏳ Загрузка...' : 'Загрузить файл'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={uploading}
                        onChange={(e) => handleImageSelect(e.target.files?.[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {draft.image && (
                    <img
                      src={draft.image}
                      alt={draft.name || 'Предпросмотр'}
                      referrerPolicy="no-referrer"
                      className="mt-3 max-h-48 w-full rounded-lg border border-white/10 object-cover"
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
                  <div>
                    {!isNew && (
                      <button
                        type="button"
                        onClick={() => onRequestDelete(liveRecord)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                      >
                        <span aria-hidden="true">🗑</span>
                        Удалить
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={saving || uploading || !draft.name.trim()}
                      className="rounded-lg bg-[#d4a359] px-5 py-2 text-sm font-semibold text-[#111317] transition-colors hover:bg-[#e0b46e] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? '⏳ Сохранение...' : '💾 Сохранить'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {liveRecord.image && (
                  <img
                    src={liveRecord.image}
                    alt={liveRecord.name}
                    referrerPolicy="no-referrer"
                    className="max-h-64 w-full rounded-lg border border-white/10 object-cover"
                  />
                )}

                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
                  {liveRecord.description || liveRecord.short || 'Описание пока не добавлено.'}
                </p>

                {liveRecord.kind === 'faction' && (
                  <div className="grid grid-cols-1 gap-3 border-t border-white/8 pt-4 sm:grid-cols-3">
                    {liveRecord.leader && (
                      <div>
                        <div className="text-xs text-zinc-500">Руководитель</div>
                        <div className="mt-0.5 text-sm font-medium text-[#ebe6dc]">{liveRecord.leader}</div>
                      </div>
                    )}
                    {liveRecord.members && (
                      <div>
                        <div className="text-xs text-zinc-500">Численность</div>
                        <div className="mt-0.5 text-sm font-medium text-[#ebe6dc]">{liveRecord.members}</div>
                      </div>
                    )}
                    {liveRecord.goals && (
                      <div className="sm:col-span-3">
                        <div className="text-xs text-zinc-500">Цели</div>
                        <div className="mt-0.5 text-sm text-zinc-200">{liveRecord.goals}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'sub' && (
            <div className="space-y-3">
              {sublocations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-zinc-400">
                  Внутри этой локации пока нет районов или зданий.
                </div>
              ) : (
                <ul className="divide-y divide-white/8 rounded-lg border border-white/10 bg-[#0b0d10]/60">
                  {sublocations.map((sub) => {
                    const subMeta = getTypeMeta(sub);
                    return (
                      <li
                        key={sub.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03]"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenRecord(sub)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="text-lg">{subMeta.emoji}</span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#ebe6dc]">{sub.name}</div>
                            <div className="truncate text-xs text-zinc-400">
                              {subMeta.label}
                              {sub.short ? ` · ${sub.short}` : ''}
                            </div>
                          </div>
                        </button>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => onRequestDelete(sub)}
                            aria-label={`Удалить ${sub.name}`}
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
                  onClick={() => onStartCreateSublocation(liveRecord.id)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d4a359]/40 bg-[#d4a359]/5 py-2.5 text-xs font-semibold text-[#d4a359] hover:bg-[#d4a359]/15"
                >
                  ➕ Добавить район или здание
                </button>
              )}
            </div>
          )}

          {activeTab === 'fac' && (
            <div className="space-y-3">
              {factionsHere.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-zinc-400">
                  В этой локации пока не базируется ни одна фракция.
                </div>
              ) : (
                <ul className="divide-y divide-white/8 rounded-lg border border-white/10 bg-[#0b0d10]/60">
                  {factionsHere.map((fac) => {
                    const facMeta = getTypeMeta(fac);
                    return (
                      <li
                        key={fac.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03]"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenRecord(fac)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="text-lg">{facMeta.emoji}</span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#ebe6dc]">{fac.name}</div>
                            <div className="truncate text-xs text-zinc-400">
                              {facMeta.label}
                              {fac.short ? ` · ${fac.short}` : ''}
                            </div>
                          </div>
                        </button>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => onDetachFaction(fac.id, liveRecord.id)}
                            title="Отвязать от локации"
                            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300"
                          >
                            Отвязать
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {isEditing && (
                <div className="space-y-2.5 pt-1">
                  {availableFactions.length > 0 && (
                    <div className="flex gap-2">
                      <select
                        value={selectedFactionToAttach}
                        onChange={(e) => setSelectedFactionToAttach(e.target.value)}
                        className="h-9 flex-1 rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-xs text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                      >
                        <option value="">Выберите существующую фракцию...</option>
                        {availableFactions.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedFactionToAttach}
                        onClick={async () => {
                          if (!selectedFactionToAttach) return;
                          await onAttachFaction(selectedFactionToAttach, liveRecord.id);
                          setSelectedFactionToAttach('');
                        }}
                        className="rounded-lg bg-[#191d25] px-3.5 text-xs font-medium text-[#ebe6dc] border border-white/10 hover:bg-[#232935] disabled:opacity-40"
                      >
                        🔗 Привязать
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onStartCreateFactionAt(liveRecord.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d4a359]/40 bg-[#d4a359]/5 py-2.5 text-xs font-semibold text-[#d4a359] hover:bg-[#d4a359]/15"
                  >
                    ➕ Создать новую фракцию здесь
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'links' && (
            <div className="space-y-3">
              {linkedLocations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-zinc-400">
                  Связанных локаций (маршрутов, порталов, союзов) пока нет.
                </div>
              ) : (
                <ul className="divide-y divide-white/8 rounded-lg border border-white/10 bg-[#0b0d10]/60">
                  {linkedLocations.map((target) => {
                    const tMeta = getTypeMeta(target);
                    return (
                      <li
                        key={target.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03]"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenRecord(target)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="text-base shrink-0" aria-hidden="true">🔗</span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#ebe6dc]">{target.name}</div>
                            <div className="truncate text-xs text-zinc-400">{tMeta.label}</div>
                          </div>
                        </button>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => onToggleLink(liveRecord.id, target.id, false)}
                            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300"
                          >
                            Убрать
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {isEditing && availableLinkTargets.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={selectedLinkToAdd}
                    onChange={(e) => setSelectedLinkToAdd(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-xs text-[#ebe6dc] focus:border-[#d4a359] focus:outline-none"
                  >
                    <option value="">Выберите локацию для связи...</option>
                    {availableLinkTargets.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedLinkToAdd}
                    onClick={async () => {
                      if (!selectedLinkToAdd) return;
                      await onToggleLink(liveRecord.id, selectedLinkToAdd, true);
                      setSelectedLinkToAdd('');
                    }}
                    className="rounded-lg bg-[#d4a359] px-4 text-xs font-semibold text-[#111317] hover:bg-[#e0b46e] disabled:opacity-40"
                  >
                    Связать
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
