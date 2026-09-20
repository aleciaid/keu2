import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatIDR, formatDate, formatCompactIDR } from '../utils/currency';
import { calculateFinancialRatios } from '../utils/financialRatios';
import { calculateWalletBalances, calculateNetBalance, calculateTotalBalance, getSavingsWalletBalance, getAvailableBalanceForSpending } from '../utils/calculations';
import {
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Wallet,
  DollarSign,
  ChevronRight,
  Info,
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Banknote,
} from 'lucide-react';

const getGreeting = () => {
  const jakartaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const hour = jakartaTime.getHours();
  if (hour >= 3 && hour < 11) return { text: 'Selamat Pagi', emoji: '☀️' };
  if (hour >= 11 && hour < 15) return { text: 'Selamat Siang', emoji: '🌤️' };
  if (hour >= 15 && hour < 18) return { text: 'Selamat Sore', emoji: '🌅' };
  return { text: 'Selamat Malam', emoji: '🌙' };
};

export default function Dashboard({ onNavigate, userProfile: userProfileProp }) {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const budgetPlans = useLiveQuery(() => db.budgetPlans.toArray()) || [];
  const walletOrderSetting = useLiveQuery(() => db.settings.get('walletOrder'));
  const userProfileSetting = useLiveQuery(() => db.settings.get('userProfile'));
  const userProfile = userProfileSetting?.value || userProfileProp;

  // Financial Health State
  const [financialHealth, setFinancialHealth] = useState(null);

  useEffect(() => {
    const fetchFinancialHealth = async () => {
      try {
        const health = await calculateFinancialRatios();
        setFinancialHealth(health);
      } catch (error) {
        console.error('Failed to calculate financial ratios:', error);
        setFinancialHealth(null);
      }
    };
    fetchFinancialHealth();
  }, [transactions.length]);

  // Calculate totals
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Compute wallet balances
  const walletBalances = calculateWalletBalances(wallets, transactions);
  
  // Calculate different types of balances
  const totalBalance = calculateTotalBalance(walletBalances);
  const netBalance = calculateNetBalance(wallets, walletBalances); // Excluding savings
  const savingsBalance = getSavingsWalletBalance(wallets, walletBalances);

  // Monthly summary
  const monthlyTx = transactions.filter((t) => t.date >= monthStart && t.date <= monthEnd);
  const monthlyIncome = monthlyTx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const monthlyExpense = monthlyTx.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const monthlyNetBalance = monthlyIncome - monthlyExpense;

  // Last 5 transactions
  const recentTx = transactions.slice(0, 5);

  // Budget plans summary
  const activePlans = budgetPlans.filter((p) => p.status === 'planned');
  const totalAllocated = activePlans.reduce((a, p) => a + p.amount, 0);

  // Active debts
  const activeDebts = transactions.filter((t) => t.type === 'debt' && t.debtStatus === 'active');
  const totalDebt = activeDebts.reduce((a, t) => a + t.amount, 0);

  // Category map
  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c; });

  // Wallet map
  const walletMap = {};
  wallets.forEach((w) => { walletMap[w.id] = w; });

  // Sorted wallets by saved order
  const sortedWallets = useMemo(() => {
    const order = walletOrderSetting?.value || [];
    if (!order.length) return wallets;
    const orderMap = {};
    order.forEach((id, i) => { orderMap[id] = i; });
    return [...wallets].sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999));
  }, [wallets, walletOrderSetting]);

  const summaryCards = [
    {
      label: 'Total Balance',
      value: totalBalance,
      icon: Wallet,
      gradient: 'from-indigo-600 to-purple-600',
      iconBg: 'bg-indigo-500/20',
      textColor: totalBalance < 0 ? 'text-red-400' : 'text-white',
    },
    {
      label: 'Income Bulan Ini',
      value: monthlyIncome,
      icon: TrendingUp,
      gradient: 'from-emerald-600 to-teal-600',
      iconBg: 'bg-emerald-500/20',
      textColor: 'text-emerald-400',
    },
    {
      label: 'Expense Bulan Ini',
      value: monthlyExpense,
      icon: TrendingDown,
      gradient: 'from-red-600 to-rose-600',
      iconBg: 'bg-red-500/20',
      textColor: 'text-red-400',
    },
    {
      label: 'Net Balance (excl. Savings)',
      value: netBalance,
      icon: DollarSign,
      gradient: netBalance >= 0 ? 'from-blue-600 to-cyan-600' : 'from-orange-600 to-red-600',
      iconBg: netBalance >= 0 ? 'bg-blue-500/20' : 'bg-orange-500/20',
      textColor: netBalance >= 0 ? 'text-blue-400' : 'text-red-400',
    },
  ];

  const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const greeting = getGreeting();

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">{greeting.emoji} {greeting.text}{userProfile?.name ? `, ${userProfile.name}` : ''}</p>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-surface-500">{monthName}</p>
          {userProfile?.userId && (
            <p className="text-[10px] text-surface-600 font-mono mt-0.5">ID: {userProfile.userId}</p>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {summaryCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="stat-card group hover:border-primary-500/30">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <Icon size={18} className={card.textColor} />
                </div>
              </div>
              <p className="text-[11px] text-surface-400 font-medium mb-1">{card.label}</p>
              <p className={`text-base font-bold ${card.textColor} truncate`}>
                {formatCompactIDR(card.value)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Budget Plans Widget */}
      {activePlans.length > 0 && (
        <div className="card mb-4 cursor-pointer hover:border-primary-500/30 transition-all" onClick={() => onNavigate('budget')}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
              <ClipboardList size={18} className="text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Budget Plans Aktif</p>
              <p className="text-[11px] text-surface-500">{activePlans.length} plan • Dana teralokasi</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-indigo-400">{formatCompactIDR(totalAllocated)}</p>
              <ChevronRight size={14} className="text-surface-500 ml-auto" />
            </div>
          </div>
        </div>
      )}

      {/* Active Debts Widget */}
      {activeDebts.length > 0 && (
        <div className="card mb-4 cursor-pointer hover:border-orange-500/30 transition-all" onClick={() => onNavigate('transactions')}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
              <Banknote size={18} className="text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Hutang Aktif</p>
              <p className="text-[11px] text-surface-500">{activeDebts.length} hutang belum lunas</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-orange-400">{formatCompactIDR(totalDebt)}</p>
              <ChevronRight size={14} className="text-surface-500 ml-auto" />
            </div>
          </div>
        </div>
      )}

      {/* Financial Health */}
      {financialHealth && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">📊 Kesehatan Keuangan</h3>
          </div>
          {/* Current Ratios */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center">
              <p className="text-[10px] text-surface-400 mb-1">Hutang</p>
              <p className={`text-sm font-bold ${financialHealth.debtRatio > financialHealth.ideal.debtPercentage ? 'text-red-400' : 'text-white'}`}>
                {financialHealth.debtRatio.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-surface-400 mb-1">Pengeluaran</p>
              <p className={`text-sm font-bold ${financialHealth.expenseRatio > financialHealth.ideal.expensePercentage ? 'text-red-400' : 'text-white'}`}>
                {financialHealth.expenseRatio.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-surface-400 mb-1">Tabungan</p>
              <p className={`text-sm font-bold ${financialHealth.savingsRatio < financialHealth.ideal.savingsPercentage ? 'text-red-400' : 'text-emerald-400'}`}>
                {financialHealth.savingsRatio.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Ideal Breakdown */}
          {financialHealth.ideal && financialHealth.totalIncome > 0 && (
            <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-3 mb-4">
              <p className="text-[11px] font-semibold text-primary-300 mb-2">Target Ideal dari Rp {formatCompactIDR(financialHealth.totalIncome)}</p>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <p className="text-surface-500">Hutang ({financialHealth.ideal.debtPercentage}%)</p>
                  <p className="font-bold text-white">{formatCompactIDR(financialHealth.ideal.debtAmount)}</p>
                </div>
                <div>
                  <p className="text-surface-500">Pengeluaran ({financialHealth.ideal.expensePercentage}%)</p>
                  <p className="font-bold text-white">{formatCompactIDR(financialHealth.ideal.expenseAmount)}</p>
                </div>
                <div>
                  <p className="text-surface-500">Tabungan ({financialHealth.ideal.savingsPercentage}%)</p>
                  <p className="font-bold text-emerald-400">{formatCompactIDR(financialHealth.ideal.savingsAmount)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {financialHealth.recommendations.map((rec, index) => {
              const iconMap = {
                warning: <AlertTriangle size={16} className="text-orange-400" />,
                critical: <AlertTriangle size={16} className="text-red-400" />,
                suggestion: <Info size={16} className="text-blue-400" />,
                success: <CheckCircle size={16} className="text-emerald-400" />
              };

              const bgColorMap = {
                warning: 'bg-orange-500/10 border-orange-500/30',
                critical: 'bg-red-500/10 border-red-500/30',
                suggestion: 'bg-blue-500/10 border-blue-500/30',
                success: 'bg-emerald-500/10 border-emerald-500/30'
              };

              return (
                <div 
                  key={index} 
                  className={`flex items-start gap-3 p-3 rounded-xl border ${bgColorMap[rec.type]}`}
                >
                  {iconMap[rec.type]}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{rec.title}</p>
                    <p className="text-[11px] text-surface-500 mb-2">{rec.description}</p>
                    {rec.nominal > 0 && (
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <p className="text-surface-600">Target:</p>
                          <p className="font-semibold text-white">{formatCompactIDR(rec.ideal)}</p>
                        </div>
                        <div>
                          <p className="text-surface-600">Butuh Lagi:</p>
                          <p className="font-semibold text-orange-400">{formatCompactIDR(rec.nominal)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Wallet Distribution */}
      {sortedWallets.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Wallet Distribution</h3>
            <button
              onClick={() => onNavigate('wallets')}
              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              Lihat semua <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {sortedWallets.map((wallet) => {
              const balance = walletBalances[wallet.id] || 0;
              const pct = totalBalance > 0 ? Math.max(0, (balance / totalBalance) * 100) : 0;
              return (
                <div key={wallet.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: wallet.color || '#6366f1' }}
                      />
                      <span className="text-xs font-medium text-surface-300">
                        {wallet.icon || '💳'} {wallet.name}
                      </span>
                    </div>
                    <span className={`text-xs font-bold ${balance < 0 ? 'text-red-400' : 'text-white'}`}>
                      {formatCompactIDR(balance)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        backgroundColor: wallet.color || '#6366f1',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Transaksi Terakhir</h3>
          <button
            onClick={() => onNavigate('transactions')}
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
          >
            Lihat semua <ChevronRight size={12} />
          </button>
        </div>

        {recentTx.length === 0 ? (
          <div className="empty-state py-8">
            <ArrowLeftRight size={32} className="mb-2 text-surface-600" />
            <p className="text-sm">Belum ada transaksi</p>
            <p className="text-xs text-surface-600 mt-1">Tambahkan transaksi pertama Anda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTx.map((tx) => {
              const cat = catMap[tx.categoryId];
              const wallet = walletMap[tx.walletId] || walletMap[tx.fromWalletId];
              const toWallet = walletMap[tx.toWalletId];

              const isDebt = tx.type === 'debt';
              const isRepayment = tx.type === 'debt_repayment';

              let txIcon = tx.type === 'transfer' ? '↔️' : (cat?.icon || '📦');
              let txBgColor = (cat?.color || '#6366f1') + '20';
              let txLabel = tx.type === 'transfer'
                ? `${wallet?.name || '?'} → ${toWallet?.name || '?'}`
                : (cat?.name || 'Lainnya');

              if (isDebt) {
                txIcon = '💸';
                txBgColor = '#f9731620';
                txLabel = tx.debtPerson ? `Hutang: ${tx.debtPerson}` : 'Hutang';
              } else if (isRepayment) {
                txIcon = '✅';
                txBgColor = '#10b98120';
                txLabel = tx.debtPerson ? `Pelunasan: ${tx.debtPerson}` : 'Pelunasan';
              }

              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/50 hover:bg-surface-800 transition-colors"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: txBgColor }}
                  >
                    {txIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{txLabel}</p>
                    <p className="text-[11px] text-surface-500 truncate">
                      {tx.note || (wallet?.name || '')} • {formatDate(tx.date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm font-bold ${
                        (tx.type === 'income' || isRepayment)
                          ? 'text-emerald-400'
                          : tx.type === 'expense'
                            ? 'text-red-400'
                            : isDebt
                              ? 'text-orange-400'
                              : 'text-blue-400'
                      }`}
                    >
                      {(tx.type === 'income' || isRepayment) ? '+' : (tx.type === 'expense' || isDebt) ? '-' : ''}
                      {formatIDR(tx.amount, false)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
