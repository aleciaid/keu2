import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatIDR, formatDate, formatCompactIDR } from '../utils/currency';
import { calculateWalletBalances, isWalletLocked, lockedWalletMessage } from '../utils/calculations';
import {
  SAVINGS_TARGET_ICONS,
  SAVINGS_TARGET_COLORS,
  DEFAULT_TARGET_FORM,
  calcTargetStats,
  calcSavingsSummary,
  calcSavedPerWallet,
  daysUntil,
  createSavingsDeposit,
  createSavingsWithdrawal,
  createInitialSavingsEntry,
  deleteSavingsTarget,
} from '../utils/savingsTargets';
import Modal from '../components/Modal';
import AmountInput from '../components/AmountInput';
import toast from 'react-hot-toast';
import {
  Plus,
  PiggyBank,
  Target,
  ArrowDownToLine,
  ArrowUpFromLine,
  Pencil,
  Trash2,
  Wallet as WalletIcon,
  CalendarDays,
  Flag,
  AlertTriangle,
  CheckCircle,
  Lock,
  ChevronDown as ChevDown,
} from 'lucide-react';

// ─── Progress bar ─────────────────────────────────────────────────────────────
function TargetProgressBar({ progress, color, achieved }) {
  const barColor = achieved ? 'from-emerald-500 to-teal-400' : '';
  return (
    <div className="h-2.5 bg-surface-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${achieved ? barColor : ''}`}
        style={{
          width: `${Math.max(progress > 0 ? 2 : 0, Math.min(100, progress))}%`,
          backgroundColor: achieved ? undefined : (color || '#10b981'),
          boxShadow: `0 0 8px ${achieved ? '#10b981' : (color || '#10b981')}60`,
        }}
      />
    </div>
  );
}

// ─── Single target card ───────────────────────────────────────────────────────
function SavingsTargetCard({ target, stats, walletMap, onDeposit, onWithdraw, onEdit, onDelete }) {
  const source = walletMap[target.sourceWalletId];
  const destination = walletMap[target.destinationWalletId];
  const days = daysUntil(target.deadline);
  const overdue = days !== null && days < 0 && !stats.isAchieved;

  const monthsLeft = days === null ? null : Math.max(1, Math.ceil(days / 30));
  const monthlyNeeded = monthsLeft ? stats.remaining / monthsLeft : null;

  return (
    <div className={`card group transition-all ${stats.isAchieved ? 'border-emerald-500/30' : 'hover:border-primary-500/30'}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: (target.color || '#10b981') + '20' }}
        >
          {target.icon || '🎯'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-white truncate">{target.name}</h4>
            {stats.isAchieved ? (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full shrink-0">
                <CheckCircle size={10} /> Tercapai
              </span>
            ) : overdue ? (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded-full shrink-0">
                <AlertTriangle size={10} /> Lewat tenggat
              </span>
            ) : (
              <span className="text-[10px] font-medium text-surface-400 bg-surface-700/50 px-1.5 py-0.5 rounded-full shrink-0">
                {stats.progress.toFixed(1)}%
              </span>
            )}
          </div>

          <div className="mt-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-white">{formatIDR(stats.saved, false)}</span>
              <span className="text-[11px] text-surface-500">/ {formatIDR(stats.targetAmount, false)}</span>
            </div>
            <div className="mt-1.5">
              <TargetProgressBar progress={stats.progress} color={target.color} achieved={stats.isAchieved} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => onEdit(target)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary-500/20 text-surface-500 hover:text-primary-400 transition-all"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => onDelete(target)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-all"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-surface-500 mt-3">
        {source && (
          <span className="flex items-center gap-1">
            <ArrowUpFromLine size={10} className="text-orange-400" />
            {source.icon || '💳'} {source.name}
          </span>
        )}
        <span className="text-surface-600">→</span>
        {destination && (
          <span className="flex items-center gap-1">
            <ArrowDownToLine size={10} className="text-emerald-400" />
            {destination.icon || '💰'} {destination.name}
          </span>
        )}
        {target.deadline && (
          <span className={`flex items-center gap-1 ${overdue ? 'text-red-400' : ''}`}>
            <CalendarDays size={10} /> {formatDate(target.deadline)}
            {days !== null && (
              <span className="text-surface-600">
                ({days < 0 ? `${Math.abs(days)} hari lewat` : `${days} hari lagi`})
              </span>
            )}
          </span>
        )}
      </div>

      {/* Remaining / plan */}
      {!stats.isAchieved && stats.targetAmount > 0 && (
        <div className="mt-3 p-2.5 rounded-xl bg-surface-800/40 border border-surface-700/30 flex items-center justify-between gap-2">
          <span className="text-[11px] text-surface-400">
            Kurang <span className="font-semibold text-white">{formatCompactIDR(stats.remaining)}</span>
          </span>
          {monthlyNeeded > 0 && (
            <span className="text-[11px] text-primary-400">
              ≈ {formatCompactIDR(monthlyNeeded)}/bulan ({monthsLeft} bln)
            </span>
          )}
        </div>
      )}

      {target.note && (
        <p className="text-[11px] text-surface-500 mt-2 truncate">{target.note}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-surface-800/50">
        <button
          onClick={() => onDeposit(target)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all"
        >
          <ArrowDownToLine size={14} />
          Setor
        </button>
        <button
          onClick={() => onWithdraw(target)}
          disabled={stats.saved <= 0}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
            stats.saved <= 0
              ? 'bg-surface-800/30 border-surface-700/30 text-surface-600 cursor-not-allowed'
              : 'bg-surface-800/50 border-surface-700/50 text-surface-400 hover:bg-orange-500/15 hover:border-orange-500/30 hover:text-orange-400'
          }`}
        >
          <ArrowUpFromLine size={14} />
          Tarik
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SavingsTargets({ openModal, onModalStateChange }) {
  const targets = useLiveQuery(() => db.savingsTargets.toArray()) || [];
  const deposits = useLiveQuery(() => db.savingsDeposits.toArray()) || [];
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteTransactions, setDeleteTransactions] = useState(false);
  const [depositTarget, setDepositTarget] = useState(null);
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [form, setForm] = useState(DEFAULT_TARGET_FORM);
  const [initialBalance, setInitialBalance] = useState(0);
  const [movementForm, setMovementForm] = useState({
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });

  const walletMap = useMemo(() => {
    const m = {};
    wallets.forEach((w) => { m[w.id] = w; });
    return m;
  }, [wallets]);

  const walletBalances = useMemo(
    () => calculateWalletBalances(wallets, transactions),
    [wallets, transactions],
  );

  const savedPerWallet = useMemo(
    () => calcSavedPerWallet(targets, deposits),
    [targets, deposits],
  );

  const summary = useMemo(
    () => calcSavingsSummary(targets, deposits),
    [targets, deposits],
  );

  const statsByTarget = useMemo(() => {
    const m = {};
    targets.forEach((t) => { m[t.id] = calcTargetStats(t, deposits); });
    return m;
  }, [targets, deposits]);

  // Suggest usable wallets: locked wallets cannot fund a target.
  const getDefaultWallets = useCallback(() => {
    const usable = wallets.filter((w) => !w.isLocked);
    const destination = usable[1]?.id || usable[0]?.id || '';
    const source = usable.find((w) => w.id !== destination)?.id || '';
    return { source, destination };
  }, [wallets]);

  const openCreate = useCallback(() => {
    const { source, destination } = getDefaultWallets();
    setEditTarget(null);
    setInitialBalance(0);
    setForm({ ...DEFAULT_TARGET_FORM, sourceWalletId: source, destinationWalletId: destination });
    setModalOpen(true);
  }, [getDefaultWallets]);

  useEffect(() => {
    if (openModal) {
      openCreate();
      if (onModalStateChange) onModalStateChange(false);
    }
  }, [openModal, onModalStateChange, openCreate]);

  const openEdit = (target) => {
    setEditTarget(target);
    setForm({
      name: target.name,
      targetAmount: target.targetAmount || 0,
      sourceWalletId: target.sourceWalletId || '',
      destinationWalletId: target.destinationWalletId || '',
      deadline: (target.deadline || '').slice(0, 10),
      note: target.note || '',
      icon: target.icon || '🎯',
      color: target.color || '#10b981',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nama target harus diisi');
      return;
    }
    if (!form.targetAmount || form.targetAmount <= 0) {
      toast.error('Nominal target harus lebih dari 0');
      return;
    }
    if (!form.sourceWalletId || !form.destinationWalletId) {
      toast.error('Pilih wallet sumber dan wallet penampung');
      return;
    }
    if (form.sourceWalletId === form.destinationWalletId) {
      toast.error('Wallet sumber dan penampung tidak boleh sama');
      return;
    }

    if (isWalletLocked(wallets, form.sourceWalletId)) {
      toast.error(lockedWalletMessage(wallets, form.sourceWalletId, 'sumber dana tabungan'));
      return;
    }

    if (!editTarget && initialBalance > 0) {
      const available = walletBalances[form.destinationWalletId] || 0;
      if (initialBalance > available) {
        toast.error(`Saldo wallet penampung tidak cukup. Tersedia: ${formatIDR(available)}`);
        return;
      }
    }

    if (editTarget) {
      const saved = statsByTarget[editTarget.id]?.saved || 0;
      const walletChanged =
        editTarget.sourceWalletId !== form.sourceWalletId ||
        editTarget.destinationWalletId !== form.destinationWalletId;
      if (saved > 0 && walletChanged) {
        toast.error(
          `Target sudah memiliki tabungan ${formatIDR(saved)}. Tarik dulu dananya sebelum mengganti wallet.`,
        );
        return;
      }
    }

    const now = new Date().toISOString();
    const payload = {
      name: form.name.trim(),
      targetAmount: form.targetAmount,
      sourceWalletId: form.sourceWalletId,
      destinationWalletId: form.destinationWalletId,
      deadline: form.deadline || null,
      note: form.note,
      icon: form.icon,
      color: form.color,
      updatedAt: now,
    };

    if (editTarget) {
      await db.savingsTargets.update(editTarget.id, payload);
      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'savings_target_updated',
        details: { targetId: editTarget.id, name: payload.name, targetAmount: payload.targetAmount },
        createdAt: now,
      });
      toast.success('Target tabungan diupdate');
    } else {
      const id = crypto.randomUUID();
      await db.savingsTargets.add({ id, ...payload, createdAt: now });

      if (initialBalance > 0) {
        await createInitialSavingsEntry(
          { id, name: payload.name, sourceWalletId: payload.sourceWalletId, destinationWalletId: payload.destinationWalletId },
          initialBalance,
          now,
        );
      }

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'savings_target_created',
        details: { targetId: id, name: payload.name, targetAmount: payload.targetAmount },
        createdAt: now,
      });
      toast.success('Target tabungan dibuat');
    }

    setModalOpen(false);
  };

  const openDeposit = (target) => {
    setMovementForm({ amount: 0, date: new Date().toISOString().slice(0, 10), note: '' });
    setDepositTarget(target);
  };

  const openWithdraw = (target) => {
    setMovementForm({ amount: 0, date: new Date().toISOString().slice(0, 10), note: '' });
    setWithdrawTarget(target);
  };

  const handleDeposit = async () => {
    const stats = statsByTarget[depositTarget.id];
    if (isWalletLocked(wallets, depositTarget.sourceWalletId)) {
      toast.error(lockedWalletMessage(wallets, depositTarget.sourceWalletId, 'setoran tabungan'));
      setDepositTarget(null);
      return;
    }
    const available = walletBalances[depositTarget.sourceWalletId] || 0;
    if (!movementForm.amount || movementForm.amount <= 0) {
      toast.error('Jumlah setoran harus lebih dari 0');
      return;
    }
    if (movementForm.amount > available) {
      toast.error(`Saldo wallet sumber tidak cukup. Tersedia: ${formatIDR(available)}`);
      return;
    }
    try {
      await createSavingsDeposit({
        target: depositTarget,
        amount: movementForm.amount,
        date: movementForm.date,
        note: movementForm.note,
      });
      toast.success('Setoran tabungan berhasil');
      setDepositTarget(null);
      if (stats && movementForm.amount >= stats.remaining && !stats.isAchieved) {
        toast('🎉 Target tabungan tercapai!', { duration: 3000 });
      }
    } catch (e) {
      toast.error(e.message || 'Gagal menyimpan setoran');
    }
  };

  const handleWithdraw = async () => {
    const stats = statsByTarget[withdrawTarget.id];
    const parked = walletBalances[withdrawTarget.destinationWalletId] || 0;
    if (!movementForm.amount || movementForm.amount <= 0) {
      toast.error('Jumlah penarikan harus lebih dari 0');
      return;
    }
    if (movementForm.amount > parked) {
      toast.error(`Saldo wallet penampung hanya ${formatIDR(parked)}. Dana tabungan mungkin sudah terpakai.`);
      return;
    }
    try {
      await createSavingsWithdrawal({
        target: withdrawTarget,
        amount: movementForm.amount,
        date: movementForm.date,
        note: movementForm.note,
        saved: stats?.saved,
      });
      toast.success('Penarikan tabungan berhasil');
      setWithdrawTarget(null);
    } catch (e) {
      toast.error(e.message || 'Gagal menyimpan penarikan');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSavingsTarget(deleteTarget.id, { deleteLinkedTransactions: deleteTransactions });
      toast.success('Target tabungan dihapus');
    } catch (e) {
      toast.error('Gagal menghapus target');
    }
    setDeleteTarget(null);
    setDeleteTransactions(false);
  };

  const depositWallet = depositTarget ? walletMap[depositTarget.sourceWalletId] : null;
  const depositAvailable = depositTarget ? (walletBalances[depositTarget.sourceWalletId] || 0) : 0;
  const depositStats = depositTarget ? statsByTarget[depositTarget.id] : null;
  const withdrawStats = withdrawTarget ? statsByTarget[withdrawTarget.id] : null;

  const recentMovements = useMemo(() => {
    const targetMap = {};
    targets.forEach((t) => { targetMap[t.id] = t; });
    return [...deposits]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 15)
      .map((d) => ({ ...d, target: targetMap[d.targetId] }));
  }, [deposits, targets]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">🎯 Rencana</p>
          <h1 className="page-title">Tabungan</h1>
        </div>
        <button
          onClick={openCreate}
          disabled={wallets.length === 0}
          className={`btn-primary btn-sm ${wallets.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Plus size={14} /> Baru
        </button>
      </div>

      {/* Summary */}
      {targets.length > 0 && (
        <div className="card bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border-emerald-500/20 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-surface-400 mb-1">Total Terkumpul</p>
              <p className="text-2xl font-bold text-white">{formatIDR(summary.totalSaved)}</p>
              <p className="text-xs text-surface-500 mt-1">
                dari target {formatIDR(summary.totalTarget)} • {summary.targetCount} target
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <PiggyBank size={22} className="text-emerald-400" />
            </div>
          </div>
          <TargetProgressBar progress={summary.progress} color="#10b981" achieved={summary.progress >= 100} />
          <div className="flex justify-between mt-2 text-[11px]">
            <span className="text-surface-500">
              Sisa: <span className="font-semibold text-white">{formatCompactIDR(summary.totalRemaining)}</span>
            </span>
            <span className="font-bold text-emerald-400">{summary.progress.toFixed(1)}%</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center p-2 rounded-lg bg-surface-800/40">
              <p className="text-[10px] text-surface-500">Tercapai</p>
              <p className="text-xs font-bold text-emerald-400">{summary.achievedCount}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-surface-800/40">
              <p className="text-[10px] text-surface-500">Berjalan</p>
              <p className="text-xs font-bold text-white">{summary.activeCount}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-surface-800/40">
              <p className="text-[10px] text-surface-500">Setoran</p>
              <p className="text-xs font-bold text-white">{summary.depositCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* No wallets guard */}
      {wallets.length === 0 && (
        <div className="empty-state">
          <WalletIcon size={40} className="mb-3 text-surface-600" />
          <p className="text-base font-medium mb-1">Belum ada wallet</p>
          <p className="text-sm text-surface-600">Buat wallet terlebih dahulu untuk mulai menabung</p>
        </div>
      )}

      {/* Targets list */}
      {wallets.length > 0 && targets.length === 0 && (
        <div className="empty-state">
          <Target size={40} className="mb-3 text-surface-600" />
          <p className="text-base font-medium mb-1">Belum ada target tabungan</p>
          <p className="text-sm text-surface-600 mb-4">
            Buat target, pilih wallet sumber dana, lalu setor sedikit demi sedikit
          </p>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Buat Target
          </button>
        </div>
      )}

      {targets.length > 0 && (
        <div className="space-y-3">
          {targets.map((target) => (
            <SavingsTargetCard
              key={target.id}
              target={target}
              stats={statsByTarget[target.id]}
              walletMap={walletMap}
              onDeposit={openDeposit}
              onWithdraw={openWithdraw}
              onEdit={openEdit}
              onDelete={(t) => { setDeleteTransactions(false); setDeleteTarget(t); }}
            />
          ))}
        </div>
      )}

      {/* Savings held per wallet */}
      {Object.keys(savedPerWallet).length > 0 && (
        <div className="card mt-4">
          <h3 className="text-sm font-semibold text-white mb-3">Dana Tabungan per Wallet</h3>
          <div className="space-y-2">
            {Object.entries(savedPerWallet).map(([walletId, amount]) => {
              const w = walletMap[walletId];
              if (!w) return null;
              return (
                <div key={walletId} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-800/50">
                  <span className="flex items-center gap-2 text-xs text-surface-300">
                    <span>{w.icon || '💳'}</span> {w.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-emerald-400">{formatIDR(amount)}</span>
                    <Lock size={10} className="text-surface-600" />
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-surface-600 mt-3">
            Dana ini tercatat sebagai bagian dari saldo wallet tersebut, bukan saldo terpisah.
          </p>
        </div>
      )}

      {/* Movement history */}
      {deposits.length > 0 && (
        <div className="card mt-4 overflow-hidden">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center">
                <Flag size={15} className="text-primary-400" />
              </div>
              <span className="text-sm font-semibold text-white">Riwayat Setoran</span>
            </div>
            <ChevDown
              size={16}
              className={`text-surface-500 transition-transform duration-300 ${historyOpen ? '' : '-rotate-90'}`}
            />
          </button>

          {historyOpen && (
            <div className="mt-4 space-y-2 animate-fadeIn">
              {recentMovements.map((m) => {
                const isWithdraw = m.type === 'withdraw';
                return (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-800/50">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isWithdraw ? 'bg-orange-500/15' : 'bg-emerald-500/15'}`}>
                      {isWithdraw
                        ? <ArrowUpFromLine size={14} className="text-orange-400" />
                        : <ArrowDownToLine size={14} className="text-emerald-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">
                        {m.target?.icon} {m.target?.name || 'Target dihapus'}
                      </p>
                      <p className="text-[10px] text-surface-500 truncate">
                        {m.note || (isWithdraw ? 'Penarikan' : 'Setoran')} • {formatDate(m.date)}
                      </p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${isWithdraw ? 'text-orange-400' : 'text-emerald-400'}`}>
                      {isWithdraw ? '-' : '+'}{formatIDR(m.amount, false)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Target Tabungan' : 'Target Tabungan Baru'}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Batal</button>
            <button onClick={handleSave} className="btn-primary flex-1">
              {editTarget ? 'Update' : 'Simpan'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="input-group">
            <label className="input-label">Nama Target</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="cth: Dana Darurat, Liburan, DP Rumah"
              className="w-full"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Nominal Target</label>
            <AmountInput
              value={form.targetAmount}
              onChange={(v) => setForm({ ...form, targetAmount: v })}
              placeholder="cth: 10jt"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Wallet Sumber Dana</label>
            <select
              value={form.sourceWalletId}
              onChange={(e) => setForm({ ...form, sourceWalletId: e.target.value })}
              className="w-full"
            >
              <option value="">Pilih wallet sumber</option>
              {wallets.map((w) => {
                const blocked = w.isLocked && w.id !== editTarget?.sourceWalletId;
                return (
                  <option key={w.id} value={w.id} disabled={blocked}>
                    {w.isLocked ? '🔒 ' : ''}{w.icon} {w.name} ({formatIDR(walletBalances[w.id] || 0)})
                    {blocked ? ' — terkunci' : ''}
                  </option>
                );
              })}
            </select>
            <p className="text-[10px] text-surface-500">
              Wallet tempat uang diambil setiap kali Anda menyetor ke target ini.
              {wallets.some((w) => w.isLocked) && ' Wallet terkunci tidak bisa dipakai sebagai sumber.'}
            </p>
          </div>

          <div className="input-group">
            <label className="input-label">Wallet Penampung</label>
            <select
              value={form.destinationWalletId}
              onChange={(e) => setForm({ ...form, destinationWalletId: e.target.value })}
              className="w-full"
            >
              <option value="">Pilih wallet penampung</option>
              {wallets
                .filter((w) => w.id !== form.sourceWalletId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.icon} {w.name} ({formatIDR(walletBalances[w.id] || 0)})
                  </option>
                ))}
            </select>
            <p className="text-[10px] text-surface-500">
              Wallet tempat dana tabungan disimpan, mis. wallet Saving.
            </p>
          </div>

          {!editTarget && (
            <div className="input-group">
              <label className="input-label">Saldo Awal Tabungan (opsional)</label>
              <AmountInput value={initialBalance} onChange={setInitialBalance} placeholder="cth: 1jt" />
              <p className="text-[10px] text-surface-500">
                Isi jika dana tabungan sudah ada di wallet penampung saat ini.
              </p>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Target Tanggal (opsional)</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className="w-full"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Icon</label>
            <div className="flex flex-wrap gap-2">
              {SAVINGS_TARGET_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setForm({ ...form, icon })}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
                    form.icon === icon
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
              {SAVINGS_TARGET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setForm({ ...form, color })}
                  className={`w-8 h-8 rounded-full transition-all ${
                    form.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Catatan (opsional)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Tambah catatan..."
              className="w-full"
            />
          </div>
        </div>
      </Modal>

      {/* Deposit modal */}
      {depositTarget && (
        <Modal
          isOpen={!!depositTarget}
          onClose={() => setDepositTarget(null)}
          title="Setor ke Tabungan"
          footer={
            <div className="flex gap-3">
              <button onClick={() => setDepositTarget(null)} className="btn-ghost flex-1">Batal</button>
              <button onClick={handleDeposit} className="btn-success flex-1">
                <ArrowDownToLine size={14} /> Setor
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-surface-800/50">
              <p className="text-xs text-surface-400 mb-1">Target</p>
              <p className="text-sm font-semibold text-white">{depositTarget.icon} {depositTarget.name}</p>
              {depositStats && (
                <p className="text-[11px] text-surface-500 mt-1">
                  Terkumpul {formatIDR(depositStats.saved)} dari {formatIDR(depositStats.targetAmount)} • kurang{' '}
                  <span className="font-semibold text-white">{formatIDR(depositStats.remaining)}</span>
                </p>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">Jumlah Setoran</label>
              <AmountInput
                value={movementForm.amount}
                onChange={(v) => setMovementForm({ ...movementForm, amount: v })}
              />
              {depositStats && depositStats.remaining > 0 && (
                <button
                  onClick={() => setMovementForm({ ...movementForm, amount: Math.min(depositStats.remaining, depositAvailable) })}
                  className="self-start text-[11px] text-primary-400 hover:text-primary-300"
                >
                  Isi sisa target ({formatCompactIDR(depositStats.remaining)})
                </button>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/40 border border-surface-700/30">
              <span className="text-[11px] text-surface-400">
                Diambil dari <span className="font-semibold text-white">{depositWallet?.icon} {depositWallet?.name || '-'}</span>
              </span>
              <span className="text-[11px] text-surface-400">
                Tersedia: <span className="font-semibold text-white">{formatCompactIDR(depositAvailable)}</span>
              </span>
            </div>

            <div className="input-group">
              <label className="input-label">Tanggal</label>
              <input
                type="date"
                value={movementForm.date}
                onChange={(e) => setMovementForm({ ...movementForm, date: e.target.value })}
                className="w-full"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Catatan (opsional)</label>
              <input
                type="text"
                value={movementForm.note}
                onChange={(e) => setMovementForm({ ...movementForm, note: e.target.value })}
                placeholder="cth: Sisihkan dari gaji"
                className="w-full"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Withdraw modal */}
      {withdrawTarget && (
        <Modal
          isOpen={!!withdrawTarget}
          onClose={() => setWithdrawTarget(null)}
          title="Tarik dari Tabungan"
          footer={
            <div className="flex gap-3">
              <button onClick={() => setWithdrawTarget(null)} className="btn-ghost flex-1">Batal</button>
              <button onClick={handleWithdraw} className="btn-primary flex-1">
                <ArrowUpFromLine size={14} /> Tarik
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-surface-800/50">
              <p className="text-xs text-surface-400 mb-1">Target</p>
              <p className="text-sm font-semibold text-white">{withdrawTarget.icon} {withdrawTarget.name}</p>
              {withdrawStats && (
                <p className="text-[11px] text-surface-500 mt-1">
                  Tersimpan: <span className="font-semibold text-emerald-400">{formatIDR(withdrawStats.saved)}</span>
                </p>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">Jumlah Penarikan</label>
              <AmountInput
                value={movementForm.amount}
                onChange={(v) => setMovementForm({ ...movementForm, amount: v })}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/40 border border-surface-700/30">
              <span className="text-[11px] text-surface-400">
                Dikembalikan ke{' '}
                <span className="font-semibold text-white">
                  {walletMap[withdrawTarget.sourceWalletId]?.icon} {walletMap[withdrawTarget.sourceWalletId]?.name || '-'}
                </span>
              </span>
            </div>

            <div className="input-group">
              <label className="input-label">Tanggal</label>
              <input
                type="date"
                value={movementForm.date}
                onChange={(e) => setMovementForm({ ...movementForm, date: e.target.value })}
                className="w-full"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Catatan (opsional)</label>
              <input
                type="text"
                value={movementForm.note}
                onChange={(e) => setMovementForm({ ...movementForm, note: e.target.value })}
                placeholder="cth: Kebutuhan mendesak"
                className="w-full"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Delete target confirm */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="modal-content sm:max-w-sm animate-scaleIn">
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Hapus Target Tabungan?</h3>
              <p className="text-sm font-medium text-white mb-1">{deleteTarget.icon} {deleteTarget.name}</p>
              <p className="text-xs text-surface-500 mb-4">
                Riwayat setoran target ini akan dihapus. Perpindahan dana antar wallet tetap tersimpan sebagai transaksi.
              </p>
              <label className="flex items-start gap-2 p-3 rounded-xl bg-surface-800/50 text-left mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteTransactions}
                  onChange={(e) => setDeleteTransactions(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] text-surface-400">
                  Hapus juga transaksi transfer yang terkait (saldo wallet akan disesuaikan kembali)
                </span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="btn-ghost flex-1">Batal</button>
                <button onClick={handleDelete} className="btn-danger flex-1">Hapus</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
