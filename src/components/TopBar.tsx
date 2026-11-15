interface TopBarProps {
  sidebarOpen: boolean;
  isEditing: boolean;
  showLinks: boolean;
  onToggleSidebar: () => void;
  onOpenFactions: () => void;
  onToggleLinks: () => void;
  onResetView: () => void;
  onToggleEditMode: () => void;
  onDownloadBackup: () => void;
  onOpenRestore: () => void;
}

export function TopBar({
  sidebarOpen,
  isEditing,
  showLinks,
  onToggleSidebar,
  onOpenFactions,
  onToggleLinks,
  onResetView,
  onToggleEditMode,
  onDownloadBackup,
  onOpenRestore,
}: TopBarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-[950] flex h-14 items-center justify-between gap-4 border-b border-white/10 bg-[#0b0d10]/90 px-4 sm:px-6 backdrop-blur-md">
      {/* Zone 1: Brand & Sidebar toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          title="Список локаций (Ctrl+B)"
          className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359] ${
            sidebarOpen
              ? 'border-[#d4a359]/60 bg-[#d4a359]/15 text-[#d4a359]'
              : 'border-white/10 bg-[#13161c] text-zinc-200 hover:border-white/20 hover:text-white'
          }`}
        >
          <span aria-hidden="true">☰</span>
          <span>Локации</span>
        </button>
        <span className="font-display text-base sm:text-lg font-bold tracking-wider text-[#ebe6dc] whitespace-nowrap shrink-0">
          ⚔ Моррион
        </span>
      </div>

      {/* Zone 2: Clean single-line navigation links */}
      <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-zinc-300">
        <button
          type="button"
          onClick={onOpenFactions}
          className="flex items-center gap-1.5 whitespace-nowrap shrink-0 py-1 hover:text-[#d4a359] transition-colors focus-visible:outline-none focus-visible:text-[#d4a359]"
        >
          <span aria-hidden="true">⚔️</span>
          <span>Фракции</span>
        </button>
        <button
          type="button"
          onClick={onToggleLinks}
          className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 py-1 transition-colors focus-visible:outline-none focus-visible:text-[#d4a359] ${
            showLinks ? 'text-[#d4a359] underline underline-offset-4' : 'hover:text-[#ebe6dc]'
          }`}
        >
          <span aria-hidden="true">🔗</span>
          <span>Связи</span>
        </button>
        <button
          type="button"
          onClick={onResetView}
          className="flex items-center gap-1.5 whitespace-nowrap shrink-0 py-1 hover:text-[#d4a359] transition-colors focus-visible:outline-none focus-visible:text-[#d4a359]"
        >
          <span aria-hidden="true">🎯</span>
          <span>Обзор</span>
        </button>
      </nav>

      {/* Zone 3: Primary action + edit backup tools */}
      <div className="flex items-center gap-2 shrink-0">
        {isEditing && (
          <div className="hidden sm:flex items-center gap-1.5 mr-1">
            <button
              type="button"
              onClick={onDownloadBackup}
              title="Скачать JSON-бэкап"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-[#13161c] px-3 text-xs font-medium text-zinc-200 hover:border-white/20 hover:bg-[#191d25] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359]"
            >
              <span aria-hidden="true">💾</span>
              <span>Бэкап</span>
            </button>
            <button
              type="button"
              onClick={onOpenRestore}
              title="Восстановить из бэкапа"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-[#13161c] px-3 text-xs font-medium text-zinc-200 hover:border-white/20 hover:bg-[#191d25] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359]"
            >
              <span aria-hidden="true">📥</span>
              <span>Восстановить</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleEditMode}
          className={`flex h-9 items-center gap-1.5 rounded-lg px-3.5 sm:px-4 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a359] ${
            isEditing
              ? 'border border-[#d4a359]/50 bg-[#d4a359]/15 text-[#d4a359] hover:bg-[#d4a359]/25'
              : 'bg-[#d4a359] text-[#111317] hover:bg-[#e0b46e]'
          }`}
        >
          {isEditing ? (
            <>
              <span aria-hidden="true">✅</span>
              <span>Выйти из редактора</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">✏️</span>
              <span>Редактировать</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
