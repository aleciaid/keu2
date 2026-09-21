import { useEffect, useRef } from 'react';

/**
 * Fixed app bar shown on every tab. Holds the app identity only — Settings has
 * moved to a floating icon above the add button.
 *
 * The bar is `position: fixed` instead of `sticky`, because a sticky element
 * combined with `backdrop-filter` does not stay pinned on Android/iOS WebViews.
 * Its real height is measured and published as --top-nav-h so the page content
 * always reserves exactly the right amount of space (no overlap, no gap).
 */
export default function TopNav({ onNavigate, title = 'FinTrack' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // offsetHeight includes padding and border, so on iOS it already accounts
    // for the safe-area top padding. Publishing it directly keeps the reserved
    // space exactly equal to the bar's rendered height on every device.
    const publishHeight = () => {
      const h = el.offsetHeight;
      if (h > 0) {
        document.documentElement.style.setProperty('--top-nav-h', `${h}px`);
      }
    };

    publishHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', publishHeight);
      return () => window.removeEventListener('resize', publishHeight);
    }

    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={ref} className="top-nav">
      <div className="max-w-lg mx-auto flex items-center px-4 py-3">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 min-w-0"
        >
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-base shrink-0">
            💰
          </span>
          <span className="text-sm font-bold text-white truncate">{title}</span>
        </button>
      </div>
    </header>
  );
}
