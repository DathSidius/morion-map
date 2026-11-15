import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface PinModalProps {
  open: boolean;
  devDefaultPinActive: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}

export function PinModal({
  open,
  devDefaultPinActive,
  submitting,
  error,
  onSubmit,
  onClose,
}: PinModalProps) {
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#13161c] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true">🔒</span>
            <h2 className="font-display text-base font-bold text-[#ebe6dc]">
              Мастер — Введите PIN
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.trim() && !submitting) onSubmit(pin.trim());
          }}
          className="space-y-4 p-5"
        >
          <div>
            <label htmlFor="master-pin-input" className="block text-xs font-medium text-zinc-400">
              Введите PIN-код для редактирования карты
            </label>
            <input
              ref={inputRef}
              id="master-pin-input"
              type="password"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-4 text-center font-mono-tabular text-lg tracking-[0.35em] text-[#ebe6dc] placeholder:tracking-normal placeholder:text-zinc-600 focus:border-[#d4a359] focus:outline-none"
            />
          </div>

          {devDefaultPinActive && (
            <p className="rounded-lg border border-white/8 bg-[#0b0d10] px-3 py-2 text-xs text-zinc-400">
              Режим разработки: переменная <code className="font-mono-tabular text-zinc-200">EDIT_PIN</code> не задана, используется тестовый PIN <code className="font-mono-tabular text-[#d4a359]">2468</code>.
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
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
              type="submit"
              disabled={submitting || !pin.trim()}
              className="rounded-lg bg-[#d4a359] px-4 py-2 text-sm font-semibold text-[#111317] transition-colors hover:bg-[#e0b46e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Проверка...' : 'Войти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
