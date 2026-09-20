import { useState, useMemo, useEffect } from 'react';
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
  ClipboardList,
  CreditCard,
  Trash2,
  Pencil,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
  Repeat,
  Zap,
} from 'lucide-react';
import {
  RECURRENCE_OPTIONS,
  getRecurrenceLabel,
  processManualPayment,
  notifyCancelledPlan,
} from '../utils/budgetScheduler';

export default function BudgetPlans({ openModal, onModalStateChange }) {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const budgetPlans = useLiveQuery(() => db.budgetPlans.orderBy('createdAt').reverse().toArray()) || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [payPlanId, setPayPlanId] = useState(null);
  const [cancelPlanId, setCancelPlanId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('planned');

  useEffect(() => {
    if (openModal) {
      openCreate();
      if (onModalStateChange) onModalStateChange(false);
    }
  }, [openModal, onModalStateChange]);

  const [form, setForm] = useState({
    name: '',
    amount: 0,
    walletId: '',
    categoryId: '',
    dueDate: '',
    note: '',
    recurrence: 'none',
    autoPayment: false,
  });

  // Maps
  const catMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => { m[c.id] = c; });
    return m;
  }, [categories]);

  const walletMap = useMemo(() => {
    const m = {};
    wallets.forEach((w) => { m[w.id] = w; });
    return m;
  }, [wallets]);

  // Calculate wallet balances from transactions
  const walletBalances = useMemo(() => {
    const balances = {};
    wallets.forEach((w) => { balances[w.id] = w.initialBalance || 0; });
    transactions.forEach((t) => {
      if (t.type === 'income' || t.type === 'debt_repayment') balances[t.walletId] = (balances[t.walletId] || 0) + t.amount;
      else if (t.type === 'expense' || t.type === 'debt') balances[t.walletId] = (balances[t.walletId] || 0) - t.amount;
      else if (t.type === 'transfer') {
        balances[t.fromWalletId] = (balances[t.fromWalletId] || 0) - t.amount;
        balances[t.toWalletId] = (balances[t.toWalletId] || 0) + t.amount;
      }
    });
    return balances;
  }, [wallets, transactions]);

  // Calculate allocated amounts per wallet (only active/planned items)
  const allocatedPerWallet = useMemo(() => {
    const allocated = {};
    budgetPlans.filter((p) => p.status === 'planned').forEach((p) => {
      allocated[p.walletId] = (allocated[p.walletId] || 0) + p.amount;
    });
    return allocated;
  }, [budgetPlans]);

  // Summary
  const summary = useMemo(() => {
    const planned = budgetPlans.filter((p) => p.status === 'planned');
    const paid = budgetPlans.filter((p) => p.status === 'paid');
    const cancelled = budgetPlans.filter((p) => p.status === 'cancelled');
    return {
      plannedCount: planned.length,
      plannedAmount: planned.reduce((a, p) => a + p.amount, 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((a, p) => a + p.amount, 0),
      cancelledCount: cancelled.length,
      cancelledAmount: cancelled.reduce((a, p) => a + p.amount, 0),
    };
  }, [budgetPlans]);

  // Filtered plans
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return budgetPlans;
    return budgetPlans.filter((p) => p.status === statusFilter);
  }, [budgetPlans, statusFilter]);

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  // --- Handlers ---
  const openCreate = () => {
    setEditPlan(null);
    setForm({
      name: '',
      amount: 0,
      walletId: wallets[0]?.id || '',
      categoryId: '',
      dueDate: '',
      note: '',
      recurrence: 'none',
      autoPayment: false,
    });
    setModalOpen(true);
  };

  const openEdit = (plan) => {
    if (plan.status !== 'planned') return;
    setEditPlan(plan);
    setForm({
      name: plan.name,
      amount: plan.amount,
      walletId: plan.walletId,
      categoryId: plan.categoryId || '',
      dueDate: (plan.dueDate || '').slice(0, 10),
      note: plan.note || '',
      recurrence: plan.recurrence || 'none',
      autoPayment: plan.autoPayment || false,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nama plan harus diisi');
      return;
    }
    if (form.amount <= 0) {
      toast.error('Jumlah harus lebih dari 0');
      return;
    }
    if (!form.walletId) {
      toast.error('Pilih wallet');
      return;
    }

    // Check available balance (wallet balance minus existing allocations)
    const walletBalance = walletBalances[form.walletId] || 0;
    const alreadyAllocated = allocatedPerWallet[form.walletId] || 0;
    // If editing same wallet+planned, add back the old amount
    const editAmount = editPlan && editPlan.walletId === form.walletId && editPlan.status === 'planned'
      ? editPlan.amount : 0;
    const available = walletBalance - alreadyAllocated + editAmount;

    if (form.amount > available) {
      toast.error(`Saldo tersedia tidak cukup. Tersedia: ${formatCompactIDR(available)}`);
      return;
    }

    const now = new Date().toISOString();

    if (editPlan) {
      await db.budgetPlans.update(editPlan.id, {
        name: form.name.trim(),
        amount: form.amount,
        walletId: form.walletId,
        categoryId: form.categoryId,
        dueDate: form.dueDate || null,
        note: form.note,
        recurrence: form.recurrence,
        autoPayment: form.autoPayment,
        updatedAt: now,
      });

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'budget_plan_updated',
        details: { planId: editPlan.id, name: form.name },
        createdAt: now,
      });

      toast.success('Plan berhasil diupdate');
    } else {
      const id = crypto.randomUUID();
      await db.budgetPlans.add({
        id,
        name: form.name.trim(),
        amount: form.amount,
        walletId: form.walletId,
        categoryId: form.categoryId,
        status: 'planned',
        dueDate: form.dueDate || null,
        note: form.note,
        recurrence: form.recurrence,
        autoPayment: form.autoPayment,
        createdAt: now,
        updatedAt: now,
      });

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'budget_plan_created',
        details: { planId: id, name: form.name, amount: form.amount },
        createdAt: now,
      });

      sendWebhook('budget_plan_created', {
        id,
        name: form.name,
        amount: form.amount,
        wallet: walletMap[form.walletId]?.name || '',
      });

      toast.success('Plan berhasil dibuat');
    }

    setModalOpen(false);
  };

  const handlePayment = async (plan) => {
    const now = new Date().toISOString();

    // Create expense transaction
    const txId = crypto.randomUUID();
    await db.transactions.add({
      id: txId,
      type: 'expense',
      amount: plan.amount,
      walletId: plan.walletId,
      categoryId: plan.categoryId || '',
      fromWalletId: '',
      toWalletId: '',
      date: now,
      note: `[Budget] ${plan.name}${plan.note ? ' - ' + plan.note : ''}`,
      createdAt: now,
      updatedAt: now,
    });

    // Update plan status
    await db.budgetPlans.update(plan.id, {
      status: 'paid',
      paidAt: now,
      transactionId: txId,
      updatedAt: now,
    });

    await db.logs.add({
      id: crypto.randomUUID(),
      action: 'budget_plan_paid',
      details: { planId: plan.id, transactionId: txId, amount: plan.amount },
      createdAt: now,
    });

    // Handle webhook and generate next recurring plan if any
    await processManualPayment(plan, walletMap);

    toast.success('Pembayaran berhasil dicatat');
    setPayPlanId(null);
  };

  const handleCancelPlan = async (plan) => {
    const now = new Date().toISOString();

    await db.budgetPlans.update(plan.id, {
      status: 'cancelled',
      cancelledAt: now,
      updatedAt: now,
    });

    await db.logs.add({
      id: crypto.randomUUID(),
      action: 'budget_plan_cancelled',
      details: { planId: plan.id, amount: plan.amount },
      createdAt: now,
    });

    // Notify webhook about cancellation
    await notifyCancelledPlan(plan, walletMap);

    toast.success('Plan dibatalkan, alokasi dikembalikan');
    setCancelPlanId(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await db.budgetPlans.delete(deleteId);
    await db.logs.add({
      id: crypto.randomUUID(),
      action: 'budget_plan_deleted',
      details: { planId: deleteId },
      createdAt: new Date().toISOString(),
    });
    toast.success('Plan berhasil dihapus');
    setDeleteId(null);
  };

  // Status filter tabs
  const filterTabs = [
    { id: 'planned', label: 'Aktif', icon: Clock, count: summary.plannedCount },
    { id: 'paid', label: 'Terbayar', icon: CheckCircle, count: summary.paidCount },
    { id: 'cancelled', label: 'Batal', icon: XCircle, count: summary.cancelledCount },
    { id: 'all', label: 'Semua', icon: ClipboardList, count: budgetPlans.length },
  ];

  // Find plan objects for confirm dialogs
  const payPlan = budgetPlans.find((p) => p.id === payPlanId);
  const cancelPlan = budgetPlans.find((p) => p.id === cancelPlanId);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">📋 Rencana</p>
          <h1 className="page-title">Budget</h1>
        </div>
        <button onClick={openCreate} className="btn-primary btn-sm">
          <Plus size={14} /> Baru
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="stat-card !p-3">
          <p className="text-[10px] text-surface-400 mb-1">Teralokasi</p>
          <p className="text-sm font-bold text-primary-400">{formatCompactIDR(summary.plannedAmount)}</p>
          <p className="text-[10px] text-surface-500">{summary.plannedCount} plan</p>
        </div>
        <div className="stat-card !p-3">
          <p className="text-[10px] text-surface-400 mb-1">Terbayar</p>
          <p className="text-sm font-bold text-emerald-400">{formatCompactIDR(summary.paidAmount)}</p>
          <p className="text-[10px] text-surface-500">{summary.paidCount} plan</p>
        </div>
        <div className="stat-card !p-3">
          <p className="text-[10px] text-surface-400 mb-1">Dibatalkan</p>
          <p className="text-sm font-bold text-surface-500">{formatCompactIDR(summary.cancelledAmount)}</p>
          <p className="text-[10px] text-surface-500">{summary.cancelledCount} plan</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {filterTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-primary-500/15 border-primary-500/30 text-primary-400'
                  : 'bg-surface-800/50 border-transparent text-surface-400 hover:bg-surface-800'
              }`}
            >
              <Icon size={12} />
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-primary-500/20' : 'bg-surface-700/50'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Plan List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={40} className="mb-3 text-surface-600" />
          <p className="text-base font-medium mb-1">
            {statusFilter === 'planned' ? 'Belum ada plan aktif' : 'Tidak ada plan'}
          </p>
          <p className="text-sm text-surface-600">
            {statusFilter === 'planned' ? 'Buat plan pembelian untuk mengalokasikan dana' : 'Ubah filter untuk melihat plan lain'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((plan) => {
            const cat = catMap[plan.categoryId];
            const wallet = walletMap[plan.walletId];
            const isPlanned = plan.status === 'planned';
            const isPaid = plan.status === 'paid';
            const isCancelled = plan.status === 'cancelled';

            return (
              <div
                key={plan.id}
                className={`card group transition-all ${
                  isPlanned ? 'hover:border-primary-500/30' : 'opacity-75'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: (cat?.color || '#6366f1') + '20' }}
                  >
                    {cat?.icon || '📦'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0" onClick={() => openEdit(plan)}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="text-sm font-semibold text-white truncate">{plan.name}</h4>
                      {isPaid && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full shrink-0">
                          <CheckCircle size={10} /> Paid
                        </span>
                      )}
                      {isCancelled && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-surface-500 bg-surface-700/50 px-1.5 py-0.5 rounded-full shrink-0">
                          <XCircle size={10} /> Batal
                        </span>
                      )}
                    </div>
                    <p className="text-base font-bold text-white mb-1">
                      {formatIDR(plan.amount)}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-surface-500 flex-wrap mt-0.5">
                      {wallet && (
                        <span className="flex items-center gap-1">
                          {wallet.icon || '💳'} {wallet.name}
                        </span>
                      )}
                      {cat && (
                        <span>• {cat.name}</span>
                      )}
                      {plan.dueDate && (
                        <span className="flex items-center gap-0.5">
                          <Calendar size={10} /> {formatDate(plan.dueDate)}
                        </span>
                      )}
                      {plan.recurrence && plan.recurrence !== 'none' && (
                        <span className="flex items-center gap-1 text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded-md text-[10px] font-medium border border-primary-500/20">
                          <Repeat size={10} /> {getRecurrenceLabel(plan.recurrence)}
                        </span>
                      )}
                      {plan.autoPayment && (
                        <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md text-[10px] font-medium border border-amber-500/20">
                          <Zap size={10} /> Auto
                        </span>
                      )}
                    </div>
                    {plan.note && (
                      <p className="text-[11px] text-surface-500 mt-1 truncate">{plan.note}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {isPlanned && (
                      <button
                        onClick={() => openEdit(plan)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary-500/20 text-surface-500 hover:text-primary-400 transition-all"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteId(plan.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Action Buttons for Planned Items */}
                {isPlanned && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-surface-800/50">
                    <button
                      onClick={() => setPayPlanId(plan.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all"
                    >
                      <CreditCard size={14} />
                      Bayar
                    </button>
                    <button
                      onClick={() => setCancelPlanId(plan.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-surface-800/50 border border-surface-700/50 text-surface-400 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400 transition-all"
                    >
                      <Ban size={14} />
                      Batalkan
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editPlan ? 'Edit Plan' : 'Plan Baru'}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Batal</button>
            <button onClick={handleSave} className="btn-primary flex-1">
              {editPlan ? 'Update' : 'Simpan'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Plan Name */}
          <div className="input-group">
            <label className="input-label">Nama Plan</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="cth: Beli Laptop, Service Motor"
              className="w-full"
            />
          </div>

          {/* Amount */}
          <div className="input-group">
            <label className="input-label">Jumlah</label>
            <AmountInput
              value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })}
            />
          </div>

          {/* Wallet */}
          <div className="input-group">
            <label className="input-label">Dari Wallet</label>
            <select
              value={form.walletId}
              onChange={(e) => setForm({ ...form, walletId: e.target.value })}
              className="w-full"
            >
              <option value="">Pilih wallet</option>
              {wallets.map((w) => {
                const balance = walletBalances[w.id] || 0;
                const allocated = allocatedPerWallet[w.id] || 0;
                // If editing, add back the old amount for this wallet
                const editAmt = editPlan && editPlan.walletId === w.id && editPlan.status === 'planned'
                  ? editPlan.amount : 0;
                const avail = balance - allocated + editAmt;
                return (
                  <option key={w.id} value={w.id}>
                    {w.icon} {w.name} (Tersedia: {formatIDR(avail)})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Category */}
          <div className="input-group">
            <label className="input-label">Kategori (opsional)</label>
            <div className="grid grid-cols-4 gap-2">
              {expenseCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setForm({ ...form, categoryId: cat.id })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all ${
                    form.categoryId === cat.id
                      ? 'bg-primary-500/20 border border-primary-500/50'
                      : 'bg-surface-800/50 border border-transparent hover:bg-surface-700/50'
                  }`}
                >
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-[10px] text-surface-300 leading-tight">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div className="input-group">
            <label className="input-label">Target Tanggal (opsional)</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full"
            />
          </div>

          {/* Recurrence Selection */}
          <div className="input-group">
            <label className="input-label">Ulangi Budget (Periode Berulang)</label>
            <select
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              className="w-full"
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Auto Payment Toggle */}
          {form.dueDate && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50 border border-surface-700/30">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-1.5">
                  <Zap size={14} className="text-amber-400" /> Auto-Payment
                </p>
                <p className="text-[11px] text-surface-500">Bayar otomatis saat tanggal jatuh tempo</p>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, autoPayment: !form.autoPayment })}
                className={`w-12 h-7 rounded-full transition-all relative ${form.autoPayment ? 'bg-primary-500' : 'bg-surface-700'}`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${form.autoPayment ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          )}

          {/* Note */}
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

      {/* Payment Confirm Dialog */}
      {payPlan && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPayPlanId(null); }}>
          <div className="modal-content sm:max-w-sm animate-scaleIn">
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CreditCard className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Bayar Plan Ini?</h3>
              <p className="text-sm font-medium text-white mb-1">{payPlan.name}</p>
              <p className="text-xl font-bold text-emerald-400 mb-3">{formatIDR(payPlan.amount)}</p>
              <p className="text-xs text-surface-500 mb-6">
                Dana akan diambil dari <strong className="text-surface-300">{walletMap[payPlan.walletId]?.name || 'wallet'}</strong> dan
                tercatat sebagai transaksi pengeluaran.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setPayPlanId(null)} className="btn-ghost flex-1">Batal</button>
                <button onClick={() => handlePayment(payPlan)} className="btn-success flex-1">
                  <CreditCard size={14} /> Bayar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Dialog */}
      {cancelPlan && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCancelPlanId(null); }}>
          <div className="modal-content sm:max-w-sm animate-scaleIn">
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-orange-500/15 flex items-center justify-center">
                <Ban className="w-7 h-7 text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Batalkan Plan Ini?</h3>
              <p className="text-sm font-medium text-white mb-1">{cancelPlan.name}</p>
              <p className="text-lg font-bold text-orange-400 mb-3">{formatIDR(cancelPlan.amount)}</p>
              <p className="text-xs text-surface-500 mb-6">
                Alokasi dana sebesar <strong className="text-surface-300">{formatIDR(cancelPlan.amount)}</strong> akan
                dikembalikan ke saldo wallet <strong className="text-surface-300">{walletMap[cancelPlan.walletId]?.name || ''}</strong>.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setCancelPlanId(null)} className="btn-ghost flex-1">Kembali</button>
                <button onClick={() => handleCancelPlan(cancelPlan)} className="btn-danger flex-1">
                  <Ban size={14} /> Batalkan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Hapus Plan?"
        message="Plan yang dihapus tidak dapat dikembalikan."
      />
    </div>
  );
}
