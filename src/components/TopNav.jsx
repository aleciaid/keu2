import { Settings } from 'lucide-react';

/**
 * Sticky app bar shown on every tab. Holds the app identity and a shortcut to
 * Settings, which no longer has its own bottom-nav tab (Assets took that slot).
 */
export default function TopNav({ active, onNavigate, title = 'FinTrack' }) {
  return (
    <header className="top-nav">
      <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 min-w-0"
        >
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-base shrink-0">
            💰
          </span>
          <span className="text-sm font-bold text-white truncate">{title}</span>
        </button>

        <button
          onClick={() => onNavigate('settings')}
          aria-label="Pengaturan"
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
            active === 'settings'
              ? 'bg-primary-500/15 text-primary-400'
              : 'text-surface-400 hover:text-primary-400 hover:bg-primary-500/10'
          }`}
        >
          <Settings size={16} />
          Pengaturan
        </button>
      </div>
    </header>
  );
}
