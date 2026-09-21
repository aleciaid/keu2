import { LayoutDashboard, ArrowLeftRight, ClipboardList, PiggyBank, Wallet, Gem } from 'lucide-react';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transaksi', icon: ArrowLeftRight },
  { id: 'budget', label: 'Budget', icon: ClipboardList },
  { id: 'savings', label: 'Tabungan', icon: PiggyBank },
  { id: 'assets', label: 'Aset', icon: Gem },
  { id: 'wallets', label: 'Wallet', icon: Wallet },
];

export default function BottomNav({ active, onNavigate }) {
  return (
    <nav className="bottom-nav">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-1 min-w-0 flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-primary-400'
                  : 'text-surface-500 hover:text-surface-300'
              }`}
            >
              <div className={`p-1 rounded-lg transition-all duration-200 ${isActive ? 'bg-primary-500/15' : ''}`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              </div>
              <span className={`text-[10px] font-medium truncate max-w-full ${isActive ? 'text-primary-400' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
