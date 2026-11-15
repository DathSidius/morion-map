import { X } from 'lucide-react';
import { useState } from 'react';
import type { BackupPayload } from '../types/morion.ts';

interface RestoreModalProps {
  open: boolean;
  restoring: boolean;
  onRestore: (backup: BackupPayload) => Promise<void>;
  onClose: () => void;
}

export function RestoreModal({ open, restoring, onRestore, onClose }: RestoreModalProps) {
  const [parsed, setParsed] = useState<BackupPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  if (!open) return null;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || '')) as Partial<BackupPayload>;
        if (!raw || !Array.isArray(raw.locations)) {
          throw new Error('В файле отсутствует массив locations');
        }
        setParsed({
          version: typeof raw.version === 'number' ? raw.version : 1,
          exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
          locationsCount: raw.locations.length,
          imagesCount: Array.isArray(raw.images) ? raw.images.length : 0,
          locations: raw.locations,
          images: Array.isArray(raw.images) ? raw.images : [],
        });
        setParseError(null);
      } catch (err) {
        setParsed(null);
        setParseError(err instanceof Error ? err.message : 'Некорректный JSON-файл');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#13161c] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true">📥</span>
            <h2 className="font-display text-base font-bold text-[#ebe6dc]">
              Восстановление из бэкапа
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200">
            Все текущие локации и загруженные изображения будут заменены данными из файла бэкапа.
          </p>

          <div>
            <label htmlFor="restore-json-file" className="block text-xs font-medium text-zinc-400">
              Файл бэкапа (.json)
            </label>
            <input
              id="restore-json-file"
              type="file"
              accept="application/json,.json"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="mt-2 block w-full text-xs text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[#191d25] file:px-3 file:py-2 file:text-xs file:font-medium file:text-[#ebe6dc] hover:file:bg-[#222834]"
            />
          </div>

          {parseError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {parseError}
            </p>
          )}

          {parsed && (
            <div className="rounded-lg border border-white/8 bg-[#0b0d10] p-3.5 text-xs text-zinc-300 space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-400">Записей в атласе</span>
                <span className="font-mono-tabular font-semibold text-[#ebe6dc]">{parsed.locations.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Изображений</span>
                <span className="font-mono-tabular font-semibold text-[#ebe6dc]">{parsed.images.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Дата экспорта</span>
                <span className="font-mono-tabular text-zinc-300">
                  {parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('ru') : '—'}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!parsed || restoring}
              onClick={() => parsed && onRestore(parsed)}
              className="rounded-lg bg-[#d4a359] px-4 py-2 text-sm font-semibold text-[#111317] transition-colors hover:bg-[#e0b46e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {restoring ? '⏳ Восстановление...' : '📥 Восстановить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
