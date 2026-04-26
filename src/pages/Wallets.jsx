import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatIDR, formatDate } from '../utils/currency';
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
} from 'lucide-react';

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
      <div className="card bg-gradient-to-br from-primary-600/20 to-purple-600/20 border-primary-500/20 mb-6">
        <p className="text-xs text-surface-400 mb-1">Total Balance</p>
        <p className={`text-2xl font-bold ${totalBalance < 0 ? 'text-red-400' : 'text-white'}`}>
          {formatIDR(totalBalance)}
        </p>
        <p className="text-xs text-surface-500 mt-1">{wallets.length} wallet aktif</p>
      </div>

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
