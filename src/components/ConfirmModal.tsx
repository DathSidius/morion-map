import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#13161c] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-[#ebe6dc]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
          {description}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/8 px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="whitespace-nowrap rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359] ${
              danger
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-[#d4a359] text-[#111317] hover:bg-[#e0b46e]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
