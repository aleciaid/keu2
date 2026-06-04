import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatIDR, formatDate, formatCompactIDR } from '../utils/currency';
import { sendWebhook } from '../utils/webhook';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AmountInput from '../components/AmountInput';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Wallet as WalletIcon,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Check,
  PieChart,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronRight,
  ChevronDown as ChevDown,
  Shield,
  Target,
  Flame,
  BadgeCheck,
} from 'lucide-react';

// ─── Savings Analysis Component ──────────────────────────────────────────────
function SavingsAnalysis({ wallets, walletBalances, totalBalance }) {
  const [collapsed, setCollapsed] = useState(false);

  if (totalBalance <= 0 || wallets.length === 0) return null;

  // Rasio setiap wallet terhadap total balance
  const walletRatios = wallets.map((w) => {
    const balance = walletBalances[w.id] || 0;
    const ratio = totalBalance > 0 ? (balance / totalBalance) * 100 : 0;
    return { ...w, balance, ratio: Math.max(0, ratio) };
  });

  // Wallet terbesar (dominan)
  const dominant = [...walletRatios].sort((a, b) => b.balance - a.balance)[0];
  const dominantRatio = dominant?.ratio ?? 0;

  // Hitung "konsentrasi" – idealnya tidak ada 1 wallet yang >70% dari total
  const isConcentrated = dominantRatio > 70;
  const isWellDistributed = dominantRatio < 50 && wallets.length >= 2;

  // Rekomendasi ideal: gunakan prinsip 50/30/20
  //  • 50% kebutuhan/operasional (bisa di wallet utama / cash)
  //  • 30% keinginan (fleksibel)
  //  • 20% tabungan/investasi
  const ideal50 = totalBalance * 0.5;
  const ideal30 = totalBalance * 0.3;
  const ideal20 = totalBalance * 0.2;

  // Insight berdasarkan kondisi
  const insights = [];
  if (isConcentrated) {
    insights.push({
      type: 'warning',
      icon: AlertTriangle,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10 border-orange-500/20',
      title: `Konsentrasi tinggi di "${dominant?.name}"`,
      desc: `${dominantRatio.toFixed(1)}% dari total balance ada di 1 wallet. Pertimbangkan distribusi ke wallet lain.`,
    });
  } else if (isWellDistributed) {
    insights.push({
      type: 'success',
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      title: 'Distribusi balance cukup baik',
      desc: `Balance tersebar merata di ${wallets.length} wallet. Likuiditas terjaga.`,
    });
  } else {
    insights.push({
      type: 'info',
      icon: Info,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      title: 'Distribusi normal',
      desc: 'Tambah lebih banyak wallet untuk diversifikasi penyimpanan dana.',
    });
  }

  if (wallets.length === 1) {
    insights.push({
      type: 'suggestion',
      icon: Info,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      title: 'Satu wallet saja',
      desc: 'Pisahkan dana tabungan dan operasional ke wallet berbeda untuk tracking lebih mudah.',
    });
  }

  return (
    <div className="card mb-4 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between mb-0"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center">
            <PieChart size={15} className="text-primary-400" />
          </div>
          <span className="text-sm font-semibold text-white">Analisis Tabungan</span>
        </div>
        <ChevDown
          size={16}
          className={`text-surface-500 transition-transform duration-300 ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-4 animate-fadeIn">
          {/* Rasio distribusi per wallet */}
          <div>
            <p className="text-[11px] text-surface-500 font-medium uppercase tracking-wide mb-2">
              Distribusi dari Total Balance
            </p>
            <div className="space-y-2.5">
              {walletRatios.map((w) => (
                <div key={w.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{w.icon || '💳'}</span>
                      <span className="text-xs font-medium text-surface-300 truncate max-w-[120px]">
                        {w.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-surface-400">
                        {formatCompactIDR(w.balance)}
                      </span>
                      <span
                        className="text-[11px] font-bold tabular-nums"
                        style={{ color: w.color || '#6366f1' }}
                      >
                        {w.ratio.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, w.ratio)}%`,
                        backgroundColor: w.color || '#6366f1',
                        boxShadow: `0 0 6px ${w.color || '#6366f1'}60`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rekomendasi Alokasi Ideal 50/30/20 */}
          <div className="bg-surface-800/40 border border-surface-700/40 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp size={13} className="text-primary-400" />
              <p className="text-[11px] font-semibold text-primary-300 uppercase tracking-wide">
                Rekomendasi Alokasi (50/30/20)
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-[9px] text-blue-300 mb-1 font-medium">KEBUTUHAN</p>
                <p className="text-[10px] text-surface-400 mb-1">50%</p>
                <p className="text-xs font-bold text-white">{formatCompactIDR(ideal50)}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <p className="text-[9px] text-purple-300 mb-1 font-medium">KEINGINAN</p>
                <p className="text-[10px] text-surface-400 mb-1">30%</p>
                <p className="text-xs font-bold text-white">{formatCompactIDR(ideal30)}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[9px] text-emerald-300 mb-1 font-medium">TABUNGAN</p>
                <p className="text-[10px] text-surface-400 mb-1">20%</p>
                <p className="text-xs font-bold text-emerald-400">{formatCompactIDR(ideal20)}</p>
              </div>
            </div>
          </div>

          {/* Insights */}
          <div className="space-y-2">
            {insights.map((ins, i) => {
              const Icon = ins.icon;
              return (
                <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border ${ins.bg}`}>
                  <Icon size={14} className={`${ins.color} mt-0.5 shrink-0`} />
                  <div>
                    <p className="text-xs font-semibold text-white">{ins.title}</p>
                    <p className="text-[11px] text-surface-500 mt-0.5">{ins.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Emergency Fund Section ───────────────────────────────────────────────────
function EmergencyFundSection({ transactions, totalBalance }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // ── Hitung total pengeluaran bulan ini ──────────────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const monthlyExpense = transactions
    .filter(t => (t.type === 'expense' || t.type === 'debt') && t.date >= monthStart && t.date <= monthEnd)
    .reduce((sum, t) => sum + t.amount, 0);

  // Jika belum ada transaksi bulan ini, gunakan rata-rata dari 3 bulan terakhir
  let baseExpense = monthlyExpense;
  if (monthlyExpense === 0) {
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
    const last3Months = transactions.filter(
      t => (t.type === 'expense' || t.type === 'debt') && t.date >= threeMonthsAgo && t.date < monthStart
    );
    if (last3Months.length > 0) {
      baseExpense = last3Months.reduce((s, t) => s + t.amount, 0) / 3;
    }
  }

  // Target dana darurat = 6 × pengeluaran bulan berjalan
  const MULTIPLIER = 6;
  const target = baseExpense * MULTIPLIER;

  // Berapa yang sudah disisihkan (dari total balance)
  const currentSaved = Math.max(0, totalBalance);
  const progress = target > 0 ? Math.min(100, (currentSaved / target) * 100) : 0;
  const shortfall = Math.max(0, target - currentSaved);
  const isAchieved = shortfall === 0 && target > 0;

  // Status label & warna
  const getStatus = () => {
    if (target === 0) return { label: 'Belum ada data', color: 'text-surface-400', bg: 'bg-surface-700/40 border-surface-600/30', icon: Info };
    if (progress >= 100) return { label: 'Dana Darurat Aman! 🎉', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: BadgeCheck };
    if (progress >= 60)  return { label: 'Hampir Tercapai', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: TrendingUp };
    if (progress >= 30)  return { label: 'Perlu Ditingkatkan', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', icon: AlertTriangle };
    return { label: 'Kritis — Segera Tabung!', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: Flame };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  // Cicilan menabung (berapa harus ditabung tiap bulan agar tercapai dalam 6 bln)
  const monthlyTarget = shortfall > 0 ? shortfall / 6 : 0;
  const monthlyTarget3 = shortfall > 0 ? shortfall / 3 : 0;

  // Progress bar gradient color
  const barColor = progress >= 100
    ? 'from-emerald-500 to-teal-400'
    : progress >= 60
      ? 'from-yellow-500 to-amber-400'
      : progress >= 30
        ? 'from-orange-500 to-red-400'
        : 'from-red-600 to-rose-500';

  // Month name
  const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const isEstimated = monthlyExpense === 0 && baseExpense > 0;

  return (
    <div className="card mb-4 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
            <Shield size={15} className="text-red-400" />
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold text-white">Dana Darurat</span>
            {!collapsed && target > 0 && (
              <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                progress >= 100 ? 'bg-emerald-500/15 text-emerald-400' :
                progress >= 60  ? 'bg-yellow-500/15 text-yellow-400' :
                                   'bg-red-500/15 text-red-400'
              }`}>
                {progress.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <ChevDown
          size={16}
          className={`text-surface-500 transition-transform duration-300 ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-4 animate-fadeIn">

          {/* Info tooltip toggle */}
          <button
            className="flex items-center gap-1.5 text-[11px] text-surface-500 hover:text-surface-300 transition-colors"
            onClick={() => setShowInfo(!showInfo)}
          >
            <Info size={12} />
            Apa itu dana darurat?
          </button>

          {showInfo && (
            <div className="p-3 rounded-xl bg-surface-800/50 border border-surface-700/30 text-[11px] text-surface-400 leading-relaxed animate-fadeIn">
              Dana darurat adalah tabungan khusus sebesar <strong className="text-white">6× pengeluaran bulanan</strong> yang
              hanya digunakan saat kondisi darurat (PHK, sakit, kecelakaan). Target ini dihitung dari
              total pengeluaran bulan {monthName}{isEstimated ? ' (estimasi rata-rata 3 bulan terakhir)' : ''}.
            </div>
          )}

          {/* Target & Progress */}
          {target > 0 ? (
            <>
              {/* Numbers row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-surface-800/40 border border-surface-700/30">
                  <p className="text-[10px] text-surface-500 mb-1 uppercase tracking-wide">
                    Pengeluaran {isEstimated ? '(est.)' : 'Bulan Ini'}
                  </p>
                  <p className="text-sm font-bold text-white">{formatCompactIDR(baseExpense)}</p>
                  <p className="text-[10px] text-surface-600 mt-0.5">× {MULTIPLIER} bulan</p>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-[10px] text-red-300/80 mb-1 uppercase tracking-wide">Target Dana Darurat</p>
                  <p className="text-sm font-bold text-red-300">{formatCompactIDR(target)}</p>
                  <p className="text-[10px] text-surface-600 mt-0.5">= 6 × pengeluaran</p>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] text-surface-400">
                    Tersimpan: <span className="font-semibold text-white">{formatCompactIDR(currentSaved)}</span>
                  </span>
                  <span className={`text-[11px] font-bold ${status.color}`}>
                    {progress.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-surface-600">Rp 0</span>
                  <span className="text-[10px] text-surface-600">{formatCompactIDR(target)}</span>
                </div>
              </div>

              {/* Status card */}
              <div className={`flex items-center gap-2.5 p-3 rounded-xl border ${status.bg}`}>
                <StatusIcon size={16} className={`${status.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${status.color}`}>{status.label}</p>
                  {!isAchieved && shortfall > 0 && (
                    <p className="text-[11px] text-surface-500 mt-0.5">
                      Kekurangan: <span className="font-semibold text-white">{formatCompactIDR(shortfall)}</span>
                    </p>
                  )}
                  {isAchieved && (
                    <p className="text-[11px] text-surface-500 mt-0.5">
                      Total balance kamu sudah cukup untuk menutup 6 bulan pengeluaran.
                    </p>
                  )}
                </div>
              </div>

              {/* Cicilan menabung (hanya jika belum tercapai) */}
              {!isAchieved && shortfall > 0 && (
                <div className="bg-surface-800/40 border border-surface-700/40 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Target size={13} className="text-primary-400" />
                    <p className="text-[11px] font-semibold text-primary-300 uppercase tracking-wide">
                      Rencana Menabung
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-2.5 rounded-lg bg-primary-500/10 border border-primary-500/20">
                      <p className="text-[9px] text-primary-300 mb-1 font-medium uppercase tracking-wide">
                        6 Bulan
                      </p>
                      <p className="text-xs font-bold text-white">{formatCompactIDR(monthlyTarget)}</p>
                      <p className="text-[10px] text-surface-500 mt-0.5">/bulan</p>
                    </div>
                    <div className="text-center p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <p className="text-[9px] text-purple-300 mb-1 font-medium uppercase tracking-wide">
                        3 Bulan
                      </p>
                      <p className="text-xs font-bold text-white">{formatCompactIDR(monthlyTarget3)}</p>
                      <p className="text-[10px] text-surface-500 mt-0.5">/bulan</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-surface-600 mt-2 text-center">
                    Sisihkan jumlah di atas dari income bulanan untuk mencapai dana darurat
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Empty state — belum ada transaksi sama sekali */
            <div className="text-center py-4">
              <Shield size={32} className="mx-auto mb-2 text-surface-700" />
              <p className="text-xs text-surface-500">Belum ada data pengeluaran</p>
              <p className="text-[11px] text-surface-600 mt-1">
                Tambahkan transaksi pengeluaran untuk menghitung target dana darurat
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const WALLET_ICONS = ['💳', '💰', '🏦', '📱', '💵', '🪙', '💎', '🏧'];
const WALLET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#10b981', '#14b8a6', '#3b82f6', '#06b6d4',
];

export default function Wallets({ openModal, onModalStateChange }) {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const walletOrderSetting = useLiveQuery(() => db.settings.get('walletOrder'));

  const [modalOpen, setModalOpen] = useState(false);
  const [editWallet, setEditWallet] = useState(null);

  useEffect(() => {
    if (openModal) {
      openCreate();
      if (onModalStateChange) onModalStateChange(false);
    }
  }, [openModal, onModalStateChange]);
  const [deleteId, setDeleteId] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [walletOrder, setWalletOrder] = useState([]);

  // Drag state
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const listRef = useRef(null);
  const touchStartY = useRef(0);

  // Load order from settings
  useEffect(() => {
    if (walletOrderSetting?.value) {
      setWalletOrder(walletOrderSetting.value);
    }
  }, [walletOrderSetting]);

  // Sort wallets by saved order
  const sortedWallets = useMemo(() => {
    if (!walletOrder.length) return wallets;
    const orderMap = {};
    walletOrder.forEach((id, i) => { orderMap[id] = i; });
    return [...wallets].sort((a, b) => {
      const ai = orderMap[a.id] ?? 999;
      const bi = orderMap[b.id] ?? 999;
      return ai - bi;
    });
  }, [wallets, walletOrder]);

  const saveOrder = useCallback(async (ids) => {
    setWalletOrder(ids);
    await db.settings.put({ key: 'walletOrder', value: ids });
  }, []);

  const moveWallet = useCallback((from, to) => {
    if (from === to) return;
    const list = [...sortedWallets];
    const [removed] = list.splice(from, 1);
    list.splice(to, 0, removed);
    saveOrder(list.map((w) => w.id));
  }, [sortedWallets, saveOrder]);

  // Touch drag handlers
  const handleTouchStart = (index, e) => {
    setDragIdx(index);
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = useCallback((e) => {
    if (dragIdx === null || !listRef.current) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const items = listRef.current.children;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (y > rect.top && y < rect.bottom) {
        setDragOverIdx(i);
        break;
      }
    }
  }, [dragIdx]);

  const handleTouchEnd = useCallback(() => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      moveWallet(dragIdx, dragOverIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, dragOverIdx, moveWallet]);

  // Attach touch move/end to list
  useEffect(() => {
    const el = listRef.current;
    if (!el || !reorderMode) return;
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    return () => {
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [reorderMode, handleTouchMove, handleTouchEnd]);

  // HTML5 drag handlers (desktop)
  const onDragStart = (index) => setDragIdx(index);
  const onDragEnter = (index) => setDragOverIdx(index);
  const onDragEnd = () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      moveWallet(dragIdx, dragOverIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const [form, setForm] = useState({
    name: '',
    initialBalance: 0,
    icon: '💳',
    color: '#6366f1',
  });

  // Calculate wallet balances
  const walletBalances = {};
  wallets.forEach((w) => {
    walletBalances[w.id] = w.initialBalance || 0;
  });
  transactions.forEach((t) => {
    if (t.type === 'income' || t.type === 'debt_repayment') {
      walletBalances[t.walletId] = (walletBalances[t.walletId] || 0) + t.amount;
    } else if (t.type === 'expense' || t.type === 'debt') {
      walletBalances[t.walletId] = (walletBalances[t.walletId] || 0) - t.amount;
    } else if (t.type === 'transfer') {
      walletBalances[t.fromWalletId] = (walletBalances[t.fromWalletId] || 0) - t.amount;
      walletBalances[t.toWalletId] = (walletBalances[t.toWalletId] || 0) + t.amount;
    }
  });

  const totalBalance = Object.values(walletBalances).reduce((a, b) => a + b, 0);

  const openCreate = () => {
    setEditWallet(null);
    setForm({ name: '', initialBalance: 0, icon: '💳', color: '#6366f1' });
    setModalOpen(true);
  };

  const openEdit = (wallet) => {
    setEditWallet(wallet);
    setForm({
      name: wallet.name,
      initialBalance: wallet.initialBalance,
      icon: wallet.icon || '💳',
      color: wallet.color || '#6366f1',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nama wallet harus diisi');
      return;
    }

    const now = new Date().toISOString();

    if (editWallet) {
      await db.wallets.update(editWallet.id, {
        name: form.name.trim(),
        initialBalance: form.initialBalance,
        icon: form.icon,
        color: form.color,
        updatedAt: now,
      });

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'wallet_updated',
        details: { walletId: editWallet.id, name: form.name },
        createdAt: now,
      });

      sendWebhook('wallet_updated', {
        id: editWallet.id,
        name: form.name,
        balance: walletBalances[editWallet.id] || 0,
      });

      toast.success('Wallet berhasil diupdate');
    } else {
      const id = crypto.randomUUID();
      await db.wallets.add({
        id,
        name: form.name.trim(),
        initialBalance: form.initialBalance,
        icon: form.icon,
        color: form.color,
        createdAt: now,
        updatedAt: now,
      });

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'wallet_created',
        details: { walletId: id, name: form.name },
        createdAt: now,
      });

      sendWebhook('wallet_created', {
        id,
        name: form.name,
        initialBalance: form.initialBalance,
      });

      toast.success('Wallet berhasil dibuat');
    }

    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    // Check if wallet has transactions
    const txCount = await db.transactions
      .where('walletId').equals(deleteId)
      .or('fromWalletId').equals(deleteId)
      .or('toWalletId').equals(deleteId)
      .count();

    if (txCount > 0) {
      toast.error(`Wallet masih memiliki ${txCount} transaksi. Hapus transaksi terlebih dahulu.`);
      setDeleteId(null);
      return;
    }

    await db.wallets.delete(deleteId);
    await db.logs.add({
      id: crypto.randomUUID(),
      action: 'wallet_deleted',
      details: { walletId: deleteId },
      createdAt: new Date().toISOString(),
    });

    toast.success('Wallet berhasil dihapus');
    setDeleteId(null);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">💳 Kelola</p>
          <h1 className="page-title">Wallets</h1>
        </div>
        <div className="flex gap-2">
          {wallets.length > 1 && (
            <button
              onClick={() => setReorderMode(!reorderMode)}
              className={`btn-sm flex items-center gap-1 transition-all ${
                reorderMode
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'btn-ghost'
              }`}
            >
              {reorderMode ? <Check size={14} /> : <ArrowUpDown size={14} />}
              {reorderMode ? 'Selesai' : 'Atur'}
            </button>
          )}
          {!reorderMode && (
            <button onClick={openCreate} className="btn-primary btn-sm">
              <Plus size={14} /> Baru
            </button>
          )}
        </div>
      </div>

      {/* Total Balance Card */}
      <div className="card bg-gradient-to-br from-primary-600/20 to-purple-600/20 border-primary-500/20 mb-4">
        <p className="text-xs text-surface-400 mb-1">Total Balance</p>
        <p className={`text-2xl font-bold ${totalBalance < 0 ? 'text-red-400' : 'text-white'}`}>
          {formatIDR(totalBalance)}
        </p>
        <p className="text-xs text-surface-500 mt-1">{wallets.length} wallet aktif</p>
      </div>

      {/* Savings Analysis Section */}
      {wallets.length > 0 && (
        <SavingsAnalysis
          wallets={sortedWallets}
          walletBalances={walletBalances}
          totalBalance={totalBalance}
        />
      )}

      {/* Emergency Fund Section */}
      <EmergencyFundSection
        transactions={transactions}
        totalBalance={totalBalance}
      />

      {/* Reorder hint */}
      {reorderMode && (
        <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-primary-500/10 border border-primary-500/20 animate-scaleIn">
          <ArrowUpDown size={14} className="text-primary-400 shrink-0" />
          <p className="text-xs text-primary-300">Geser grip handle atau gunakan panah untuk mengatur urutan wallet</p>
        </div>
      )}

      {/* Wallet List */}
      {sortedWallets.length === 0 ? (
        <div className="empty-state">
          <WalletIcon size={40} className="mb-3 text-surface-600" />
          <p className="text-base font-medium mb-1">Belum ada wallet</p>
          <p className="text-sm text-surface-600 mb-4">Buat wallet pertama Anda untuk mulai tracking</p>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Buat Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-3" ref={listRef}>
          {sortedWallets.map((wallet, index) => {
            const balance = walletBalances[wallet.id] || 0;
            const isDragging = dragIdx === index;
            const isDragOver = dragOverIdx === index && dragIdx !== index;

            return (
              <div
                key={wallet.id}
                className={`card group transition-all ${
                  reorderMode
                    ? isDragging
                      ? 'opacity-50 scale-95 border-primary-500/50'
                      : isDragOver
                        ? 'border-primary-400/60 bg-primary-500/5'
                        : 'hover:border-surface-600'
                    : 'hover:border-primary-500/30'
                }`}
                draggable={reorderMode}
                onDragStart={() => reorderMode && onDragStart(index)}
                onDragEnter={() => reorderMode && onDragEnter(index)}
                onDragEnd={() => reorderMode && onDragEnd()}
                onDragOver={(e) => reorderMode && e.preventDefault()}
              >
                <div className="flex items-center gap-3">
                  {/* Grip handle (reorder mode) */}
                  {reorderMode && (
                    <div
                      className="flex flex-col items-center gap-0.5 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
                      onTouchStart={(e) => handleTouchStart(index, e)}
                    >
                      <GripVertical size={20} className="text-surface-500" />
                    </div>
                  )}

                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ backgroundColor: (wallet.color || '#6366f1') + '20' }}
                  >
                    {wallet.icon || '💳'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white">{wallet.name}</h4>
                    <p className={`text-lg font-bold ${balance < 0 ? 'text-red-400' : 'text-white'}`}>
                      {formatIDR(balance)}
                    </p>
                    {!reorderMode && (
                      <p className="text-[10px] text-surface-500">
                        Saldo awal: {formatIDR(wallet.initialBalance)}
                      </p>
                    )}
                  </div>

                  {/* Reorder buttons OR edit/delete */}
                  {reorderMode ? (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => index > 0 && moveWallet(index, index - 1)}
                        disabled={index === 0}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                          index === 0
                            ? 'text-surface-700 cursor-not-allowed'
                            : 'bg-surface-800 hover:bg-primary-500/20 text-surface-400 hover:text-primary-400'
                        }`}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => index < sortedWallets.length - 1 && moveWallet(index, index + 1)}
                        disabled={index === sortedWallets.length - 1}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                          index === sortedWallets.length - 1
                            ? 'text-surface-700 cursor-not-allowed'
                            : 'bg-surface-800 hover:bg-primary-500/20 text-surface-400 hover:text-primary-400'
                        }`}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(wallet)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-800 hover:bg-primary-500/20 text-surface-400 hover:text-primary-400 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteId(wallet.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-800 hover:bg-red-500/20 text-surface-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editWallet ? 'Edit Wallet' : 'Buat Wallet Baru'}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Batal</button>
            <button onClick={handleSave} className="btn-primary flex-1">
              {editWallet ? 'Update' : 'Simpan'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="input-group">
            <label className="input-label">Nama Wallet</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="cth: Cash, BCA, Dana"
              className="w-full"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Saldo Awal</label>
            <AmountInput
              value={form.initialBalance}
              onChange={(v) => setForm({ ...form, initialBalance: v })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Icon</label>
            <div className="flex flex-wrap gap-2">
              {WALLET_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setForm({ ...form, icon })}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${form.icon === icon
                      ? 'bg-primary-500/20 border-2 border-primary-500 scale-110'
                      : 'bg-surface-800 hover:bg-surface-700'
                    }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Warna</label>
            <div className="flex flex-wrap gap-2">
              {WALLET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setForm({ ...form, color })}
                  className={`w-8 h-8 rounded-full transition-all ${form.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900 scale-110' : 'hover:scale-105'
                    }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Hapus Wallet?"
        message="Wallet yang dihapus tidak dapat dikembalikan. Pastikan tidak ada transaksi yang terkait."
      />
    </div>
  );
}
