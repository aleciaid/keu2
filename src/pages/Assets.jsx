import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatIDR, formatDate, formatCompactIDR } from '../utils/currency';
import { isWalletLocked, lockedWalletMessage } from '../utils/calculations';
import { sendWebhook } from '../utils/webhook';
import {
  ASSET_KINDS,
  DIGITAL_TYPES,
  BILLING_CYCLES,
  ASSET_CONDITIONS,
  ASSET_ICONS,
  ASSET_COLORS,
  DEFAULT_ASSET_FORM,
  isSubscription,
  getCycleLabel,
  getAssetTypeLabel,
  addCycle,
  daysUntil,
  monthlyCost,
  yearlyCost,
  calcAssetSummary,
  calcSubscriptionsPerWallet,
  chargeSubscription,
} from '../utils/assets';
import Modal from '../components/Modal';
import AmountInput from '../components/AmountInput';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  Gem,
  Infinity as InfinityIcon,
  RefreshCw,
  CalendarClock,
  Wallet as WalletIcon,
  Lock,
  ChevronDown as ChevDown,
  Receipt,
} from 'lucide-react';

const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'physical', label: 'Fisik' },
  { id: 'lifetime', label: 'Lifetime' },
  { id: 'subscription', label: 'Langganan' },
];

// ─── Asset card ───────────────────────────────────────────────────────────────
function AssetCard({ asset, walletMap, catMap, onEdit, onDelete, onCharge }) {
  const sub = isSubscription(asset);
  const days = sub ? daysUntil(asset.nextDueDate) : null;
  const isOverdue = days !== null && days < 0;
  const isSoon = days !== null && days >= 0 && days <= 7;
  const wallet = walletMap[asset.walletId];
  const cat = catMap[asset.categoryId];

  return (
    <div className={`card group transition-all ${sub && isOverdue ? 'border-red-500/30' : 'hover:border-primary-500/30'}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: (asset.color || '#6366f1') + '20' }}
        >
          {asset.icon || '📦'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-sm font-semibold text-white truncate">{asset.name}</h4>
            {sub ? (
              <span className="flex items-center gap-0.5 text-[9px] font-medium text-primary-400 bg-primary-500/15 px-1.5 py-0.5 rounded-full shrink-0">
                <RefreshCw size={8} /> {getCycleLabel(asset.billingCycle)}
              </span>
            ) : asset.kind === 'digital' ? (
              <span className="flex items-center gap-0.5 text-[9px] font-medium text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded-full shrink-0">
                <InfinityIcon size={8} /> Lifetime
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-[9px] font-medium text-surface-400 bg-surface-700/50 px-1.5 py-0.5 rounded-full shrink-0">
                <Package size={8} /> Fisik
              </span>
            )}
          </div>

          <p className="text-base font-bold text-white mt-1">
            {formatIDR(asset.purchasePrice)}
            {sub && (
              <span className="text-[11px] font-medium text-surface-500">
                {' '}/ {asset.billingCycle === 'yearly' ? 'tahun' : 'bulan'}
              </span>
            )}
          </p>

          {/* Subscription cycle info */}
          {sub && (
            <div className={`flex items-center gap-1.5 mt-1.5 text-[11px] ${
              isOverdue ? 'text-red-400' : isSoon ? 'text-amber-400' : 'text-surface-500'
            }`}>
              <CalendarClock size={11} />
              {asset.nextDueDate ? (
                <>
                  {isOverdue ? 'Lewat tempo' : 'Jatuh tempo'} {formatDate(asset.nextDueDate)}
                  {days !== null && (
                    <span className="text-surface-600">
                      ({days < 0 ? `${Math.abs(days)} hari lewat` : days === 0 ? 'hari ini' : `${days} hari lagi`})
                    </span>
                  )}
                </>
              ) : (
                'Belum ada jadwal'
              )}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-surface-500 mt-1.5">
            {asset.purchaseDate && !sub && (
              <span>Beli {formatDate(asset.purchaseDate)}</span>
            )}
            {asset.vendor && <span>• {asset.vendor}</span>}
            {cat && <span>• {cat.name}</span>}
            {sub && wallet && (
              <span className="flex items-center gap-1">
                • {wallet.isLocked ? '🔒 ' : ''}{wallet.icon} {wallet.name}
              </span>
            )}
          </div>

          {sub && (
            <p className="text-[10px] text-surface-600 mt-1">
              ≈ {formatIDR(monthlyCost(asset))}/bulan • {formatIDR(yearlyCost(asset))}/tahun
            </p>
          )}

          {asset.note && (
            <p className="text-[11px] text-surface-500 mt-1 truncate">{asset.note}</p>
          )}
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => onEdit(asset)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary-500/20 text-surface-500 hover:text-primary-400 transition-all"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => onDelete(asset)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-all"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {sub && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-surface-800/50">
          <button
            onClick={() => onCharge(asset)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all"
          >
            <Receipt size={14} /> Bayar Periode Ini
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Assets({ openModal, onModalStateChange }) {
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [deleteAsset, setDeleteAsset] = useState(null);
  const [chargeAsset, setChargeAsset] = useState(null);
  const [chargeForm, setChargeForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [filter, setFilter] = useState('all');
  const [subsOpen, setSubsOpen] = useState(true);

  const [form, setForm] = useState(DEFAULT_ASSET_FORM);

  const walletMap = useMemo(() => {
    const m = {};
    wallets.forEach((w) => { m[w.id] = w; });
    return m;
  }, [wallets]);

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => { m[c.id] = c; });
    return m;
  }, [categories]);

  const summary = useMemo(() => calcAssetSummary(assets), [assets]);

  const subsPerWallet = useMemo(() => calcSubscriptionsPerWallet(assets), [assets]);

  const filtered = useMemo(() => {
    if (filter === 'all') return assets;
    if (filter === 'physical') return assets.filter((a) => a.kind !== 'digital');
    if (filter === 'lifetime') return assets.filter((a) => a.kind === 'digital' && a.digitalType !== 'subscription');
    return assets.filter(isSubscription);
  }, [assets, filter]);

  const subscriptions = useMemo(
    () => assets.filter(isSubscription).sort((a, b) => (a.nextDueDate || '').localeCompare(b.nextDueDate || '')),
    [assets],
  );

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  );

  const openCreate = useCallback(() => {
    setEditAsset(null);
    const firstUsable = wallets.find((w) => !w.isLocked);
    setForm({
      ...DEFAULT_ASSET_FORM,
      purchaseDate: new Date().toISOString().slice(0, 10),
      walletId: firstUsable?.id || '',
      categoryId: expenseCategories[0]?.id || '',
    });
    setModalOpen(true);
  }, [wallets, expenseCategories]);

  useEffect(() => {
    if (openModal) {
      openCreate();
      if (onModalStateChange) onModalStateChange(false);
    }
  }, [openModal, onModalStateChange, openCreate]);

  const openEdit = (asset) => {
    setEditAsset(asset);
    setForm({
      name: asset.name,
      kind: asset.kind || 'physical',
      digitalType: asset.digitalType || 'lifetime',
      billingCycle: asset.billingCycle || 'monthly',
      purchasePrice: asset.purchasePrice || 0,
      purchaseDate: (asset.purchaseDate || '').slice(0, 10),
      walletId: asset.walletId || '',
      categoryId: asset.categoryId || '',
      vendor: asset.vendor || '',
      condition: asset.condition || 'good',
      note: asset.note || '',
      icon: asset.icon || '📦',
      color: asset.color || '#6366f1',
      autoCharge: asset.autoCharge || false,
      reminderEnabled: asset.reminderEnabled !== false,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nama aset harus diisi');
      return;
    }
    if (!form.purchasePrice || form.purchasePrice <= 0) {
      toast.error('Harga harus lebih dari 0');
      return;
    }

    const sub = form.kind === 'digital' && form.digitalType === 'subscription';

    if (sub) {
      if (!form.walletId) {
        toast.error('Pilih wallet pembayaran langganan');
        return;
      }
      if (isWalletLocked(wallets, form.walletId)) {
        toast.error(lockedWalletMessage(wallets, form.walletId, 'pembayaran langganan'));
        return;
      }
    }

    const now = new Date().toISOString();
    const purchaseDate = form.purchaseDate ? new Date(form.purchaseDate).toISOString() : now;

    // A subscription needs a next due date: first renewal is one cycle after purchase
    const nextDueDate = sub
      ? (editAsset?.nextDueDate || addCycle(purchaseDate, form.billingCycle))
      : null;

    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      digitalType: form.kind === 'digital' ? form.digitalType : null,
      billingCycle: sub ? form.billingCycle : null,
      purchasePrice: form.purchasePrice,
      purchaseDate,
      walletId: sub ? form.walletId : '',
      categoryId: sub ? (form.categoryId || '') : '',
      vendor: form.vendor,
      condition: form.kind === 'physical' ? form.condition : null,
      note: form.note,
      icon: form.icon,
      color: form.color,
      autoCharge: sub ? form.autoCharge : false,
      reminderEnabled: sub ? form.reminderEnabled : false,
      nextDueDate,
      status: 'owned',
      updatedAt: now,
    };

    if (editAsset) {
      await db.assets.update(editAsset.id, payload);
      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'asset_updated',
        details: { assetId: editAsset.id, name: payload.name },
        createdAt: now,
      });
      sendWebhook('asset_updated', {
        id: editAsset.id,
        name: payload.name,
        kind: payload.kind,
        purchasePrice: payload.purchasePrice,
      });
      toast.success('Aset berhasil diupdate');
    } else {
      const id = crypto.randomUUID();
      await db.assets.add({ id, ...payload, createdAt: now });
      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'asset_created',
        details: { assetId: id, name: payload.name, kind: payload.kind },
        createdAt: now,
      });
      sendWebhook('asset_created', {
        id,
        name: payload.name,
        kind: payload.kind,
        type: getAssetTypeLabel(payload),
        purchasePrice: payload.purchasePrice,
      });
      toast.success('Aset berhasil ditambahkan');
    }

    setModalOpen(false);
  };

  const openCharge = (asset) => {
    setChargeForm({ date: new Date().toISOString().slice(0, 10), note: '' });
    setChargeAsset(asset);
  };

  const handleCharge = async () => {
    if (isWalletLocked(wallets, chargeAsset.walletId)) {
      toast.error(lockedWalletMessage(wallets, chargeAsset.walletId, 'pembayaran langganan'));
      setChargeAsset(null);
      return;
    }
    try {
      await chargeSubscription(chargeAsset, {
        date: chargeForm.date,
        note: chargeForm.note,
      });
      toast.success('Langganan dicatat sebagai pengeluaran');
      setChargeAsset(null);
    } catch (e) {
      toast.error(e.message || 'Gagal mencatat langganan');
    }
  };

  const handleDelete = async () => {
    if (!deleteAsset) return;
    try {
      await db.assets.delete(deleteAsset.id);
      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'asset_deleted',
        details: { assetId: deleteAsset.id, name: deleteAsset.name },
        createdAt: new Date().toISOString(),
      });
      toast.success('Aset berhasil dihapus');
    } catch (e) {
      toast.error('Gagal menghapus aset');
    }
    setDeleteAsset(null);
  };

  const isSubForm = form.kind === 'digital' && form.digitalType === 'subscription';
  const chargeWallet = chargeAsset ? walletMap[chargeAsset.walletId] : null;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">💎 Kekayaan</p>
          <h1 className="page-title">Aset</h1>
        </div>
        <button onClick={openCreate} className="btn-primary btn-sm">
          <Plus size={14} /> Baru
        </button>
      </div>

      {/* Summary */}
      {assets.length > 0 && (
        <div className="card bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border-blue-500/20 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-surface-400 mb-1">Total Nilai Aset</p>
              <p className="text-2xl font-bold text-white">{formatIDR(summary.totalValue)}</p>
              <p className="text-xs text-surface-500 mt-1">{summary.count} aset tercatat</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
              <Gem size={22} className="text-blue-400" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-surface-800/40">
              <p className="text-[10px] text-surface-500 flex items-center justify-center gap-1">
                <Package size={9} /> Fisik
              </p>
              <p className="text-xs font-bold text-white">{formatCompactIDR(summary.physicalValue)}</p>
              <p className="text-[9px] text-surface-600">{summary.physicalCount} item</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-surface-800/40">
              <p className="text-[10px] text-surface-500 flex items-center justify-center gap-1">
                <InfinityIcon size={9} /> Lifetime
              </p>
              <p className="text-xs font-bold text-white">{formatCompactIDR(summary.lifetimeValue)}</p>
              <p className="text-[9px] text-surface-600">{summary.lifetimeCount} item</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-surface-800/40">
              <p className="text-[10px] text-surface-500 flex items-center justify-center gap-1">
                <RefreshCw size={9} /> Langganan
              </p>
              <p className="text-xs font-bold text-primary-400">{formatCompactIDR(summary.subscriptionMonthly)}</p>
              <p className="text-[9px] text-surface-600">/bulan</p>
            </div>
          </div>

          {summary.subscriptionCount > 0 && (
            <div className="mt-3 p-2.5 rounded-xl bg-surface-800/40 border border-surface-700/30 flex items-center justify-between">
              <span className="text-[11px] text-surface-400">Total langganan setahun</span>
              <span className="text-xs font-bold text-primary-400">
                {formatIDR(summary.subscriptionYearly)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {assets.length === 0 && (
        <div className="empty-state">
          <Gem size={40} className="mb-3 text-surface-600" />
          <p className="text-base font-medium mb-1">Belum ada aset</p>
          <p className="text-sm text-surface-600 mb-4">
            Catat barang fisik, lisensi lifetime, dan langganan digital Anda
          </p>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Tambah Aset
          </button>
        </div>
      )}

      {/* Filter tabs */}
      {assets.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {FILTERS.map((f) => {
            const isActive = filter === f.id;
            const count = f.id === 'all'
              ? assets.length
              : f.id === 'physical'
                ? summary.physicalCount
                : f.id === 'lifetime'
                  ? summary.lifetimeCount
                  : summary.subscriptionCount;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-primary-500/15 border-primary-500/30 text-primary-400'
                    : 'bg-surface-800/50 border-transparent text-surface-400 hover:bg-surface-800'
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-primary-500/20' : 'bg-surface-700/50'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Asset list */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              walletMap={walletMap}
              catMap={catMap}
              onEdit={openEdit}
              onDelete={setDeleteAsset}
              onCharge={openCharge}
            />
          ))}
        </div>
      )}

      {assets.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <Package size={32} className="mb-2 text-surface-600" />
          <p className="text-sm">Tidak ada aset di kategori ini</p>
        </div>
      )}

      {/* Subscription schedule + wallet drain */}
      {subscriptions.length > 0 && (
        <div className="card mt-4 overflow-hidden">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setSubsOpen(!subsOpen)}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center">
                <CalendarClock size={15} className="text-primary-400" />
              </div>
              <span className="text-sm font-semibold text-white">Jadwal Langganan</span>
            </div>
            <ChevDown
              size={16}
              className={`text-surface-500 transition-transform duration-300 ${subsOpen ? '' : '-rotate-90'}`}
            />
          </button>

          {subsOpen && (
            <div className="mt-4 space-y-3 animate-fadeIn">
              {subscriptions.map((s) => {
                const days = daysUntil(s.nextDueDate);
                const overdue = days !== null && days < 0;
                const soon = days !== null && days >= 0 && days <= 7;
                return (
                  <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-800/50">
                    <span className="text-lg shrink-0">{s.icon || '🔄'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{s.name}</p>
                      <p className={`text-[10px] ${overdue ? 'text-red-400' : soon ? 'text-amber-400' : 'text-surface-500'}`}>
                        {s.nextDueDate ? formatDate(s.nextDueDate) : 'Belum dijadwalkan'}
                        {days !== null && (
                          <span className="text-surface-600">
                            {' '}• {days < 0 ? `${Math.abs(days)} hari lewat` : days === 0 ? 'hari ini' : `${days} hari lagi`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-white">{formatIDR(s.purchasePrice, false)}</p>
                      <p className="text-[9px] text-surface-500">{getCycleLabel(s.billingCycle)}</p>
                    </div>
                  </div>
                );
              })}

              {/* Per-wallet monthly cost */}
              {Object.keys(subsPerWallet).length > 0 && (
                <div className="pt-3 border-t border-surface-800/50">
                  <p className="text-[11px] text-surface-500 uppercase tracking-wide font-medium mb-2">
                    Beban Langganan per Wallet
                  </p>
                  <div className="space-y-2">
                    {Object.entries(subsPerWallet).map(([walletId, amount]) => {
                      const w = walletMap[walletId];
                      if (!w) return null;
                      return (
                        <div key={walletId} className="flex items-center justify-between p-2 rounded-lg bg-surface-800/40">
                          <span className="flex items-center gap-1.5 text-[11px] text-surface-300">
                            <WalletIcon size={10} className="text-surface-500" />
                            {w.isLocked && <Lock size={9} className="text-amber-400" />}
                            {w.icon} {w.name}
                          </span>
                          <span className="text-[11px] font-bold text-primary-400">
                            {formatIDR(amount)}/bulan
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editAsset ? 'Edit Aset' : 'Aset Baru'}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Batal</button>
            <button onClick={handleSave} className="btn-primary flex-1">
              {editAsset ? 'Update' : 'Simpan'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="input-group">
            <label className="input-label">Nama Aset</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="cth: Emas Antam, Netflix, Domain"
              className="w-full"
            />
          </div>

          {/* Kind */}
          <div className="input-group">
            <label className="input-label">Jenis Aset</label>
            <div className="flex gap-2">
              {ASSET_KINDS.map((k) => (
                <button
                  key={k.value}
                  onClick={() => setForm({ ...form, kind: k.value })}
                  className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                    form.kind === k.value
                      ? 'bg-primary-500/15 border-primary-500/30 text-primary-400'
                      : 'bg-surface-800/50 border-transparent text-surface-400 hover:bg-surface-800'
                  }`}
                >
                  <span className="text-lg">{k.icon}</span>
                  <span className="text-xs font-semibold">{k.label}</span>
                  <span className="text-[9px] text-surface-500 text-center leading-tight">{k.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Digital type */}
          {form.kind === 'digital' && (
            <div className="input-group">
              <label className="input-label">Tipe Digital</label>
              <div className="flex gap-2">
                {DIGITAL_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setForm({ ...form, digitalType: t.value })}
                    className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                      form.digitalType === t.value
                        ? 'bg-primary-500/15 border-primary-500/30 text-primary-400'
                        : 'bg-surface-800/50 border-transparent text-surface-400 hover:bg-surface-800'
                    }`}
                  >
                    <span className="text-lg">{t.icon}</span>
                    <span className="text-xs font-semibold">{t.label}</span>
                    <span className="text-[9px] text-surface-500 text-center leading-tight">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Billing cycle */}
          {isSubForm && (
            <div className="input-group">
              <label className="input-label">Periode Langganan</label>
              <div className="flex gap-2">
                {BILLING_CYCLES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setForm({ ...form, billingCycle: c.value })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      form.billingCycle === c.value
                        ? 'bg-primary-500/15 border-primary-500/30 text-primary-400'
                        : 'bg-surface-800/50 border-transparent text-surface-400 hover:bg-surface-800'
                    }`}
                  >
                    <span>{c.icon}</span> {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price */}
          <div className="input-group">
            <label className="input-label">
              {isSubForm ? 'Biaya per Periode' : 'Harga Beli'}
            </label>
            <AmountInput
              value={form.purchasePrice}
              onChange={(v) => setForm({ ...form, purchasePrice: v })}
              placeholder="cth: 250rb, 2jt"
            />
            {isSubForm && form.purchasePrice > 0 && (
              <p className="text-[10px] text-surface-500">
                ≈ {formatIDR(form.billingCycle === 'yearly' ? form.purchasePrice / 12 : form.purchasePrice)}/bulan
              </p>
            )}
          </div>

          {/* Purchase date */}
          <div className="input-group">
            <label className="input-label">
              {isSubForm ? 'Tanggal Mulai' : 'Tanggal Beli'}
            </label>
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
              className="w-full"
            />
          </div>

          {/* Payment wallet + category (subscription only) */}
          {isSubForm && (
            <>
              <div className="input-group">
                <label className="input-label">Wallet Pembayaran</label>
                <select
                  value={form.walletId}
                  onChange={(e) => setForm({ ...form, walletId: e.target.value })}
                  className="w-full"
                >
                  <option value="">Pilih wallet</option>
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id} disabled={w.isLocked && w.id !== editAsset?.walletId}>
                      {w.isLocked ? '🔒 ' : ''}{w.icon} {w.name}
                      {w.isLocked && w.id !== editAsset?.walletId ? ' — terkunci' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-surface-500">
                  Wallet yang diisi tiap jatuh tempo langganan.
                </p>
              </div>

              <div className="input-group">
                <label className="input-label">Kategori Pengeluaran</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full"
                >
                  <option value="">Tanpa kategori</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50 border border-surface-700/30">
                <div>
                  <p className="text-sm font-medium text-white flex items-center gap-1.5">
                    <RefreshCw size={14} className="text-primary-400" /> Auto-charge
                  </p>
                  <p className="text-[11px] text-surface-500">Catat otomatis saat jatuh tempo</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, autoCharge: !form.autoCharge })}
                  className={`w-12 h-7 rounded-full transition-all relative ${form.autoCharge ? 'bg-primary-500' : 'bg-surface-700'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${form.autoCharge ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50 border border-surface-700/30">
                <div>
                  <p className="text-sm font-medium text-white flex items-center gap-1.5">
                    <CalendarClock size={14} className="text-amber-400" /> Reminder
                  </p>
                  <p className="text-[11px] text-surface-500">Tampilkan pengingat saat mendekati tempo</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, reminderEnabled: !form.reminderEnabled })}
                  className={`w-12 h-7 rounded-full transition-all relative ${form.reminderEnabled ? 'bg-primary-500' : 'bg-surface-700'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${form.reminderEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </>
          )}

          {/* Condition (physical only) */}
          {form.kind === 'physical' && (
            <div className="input-group">
              <label className="input-label">Kondisi</label>
              <div className="flex gap-2">
                {ASSET_CONDITIONS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setForm({ ...form, condition: c.value })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      form.condition === c.value
                        ? 'bg-primary-500/15 border-primary-500/30 text-primary-400'
                        : 'bg-surface-800/50 border-transparent text-surface-400 hover:bg-surface-800'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Vendor / Sumber (opsional)</label>
            <input
              type="text"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="cth: Antam, Netflix, Namecheap"
              className="w-full"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ASSET_ICONS.map((icon) => (
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
              {ASSET_COLORS.map((color) => (
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

      {/* Charge subscription modal */}
      {chargeAsset && (
        <Modal
          isOpen={!!chargeAsset}
          onClose={() => setChargeAsset(null)}
          title="Bayar Periode Langganan"
          footer={
            <div className="flex gap-3">
              <button onClick={() => setChargeAsset(null)} className="btn-ghost flex-1">Batal</button>
              <button onClick={handleCharge} className="btn-success flex-1">
                <Receipt size={14} /> Bayar
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-surface-800/50">
              <p className="text-xs text-surface-400 mb-1">Langganan</p>
              <p className="text-sm font-semibold text-white">{chargeAsset.icon} {chargeAsset.name}</p>
              <p className="text-[11px] text-surface-500 mt-1">
                {getCycleLabel(chargeAsset.billingCycle)} • jatuh tempo{' '}
                {chargeAsset.nextDueDate ? formatDate(chargeAsset.nextDueDate) : '-'}
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-primary-500/10 border border-primary-500/20">
              <span className="text-[11px] text-surface-400">Jumlah tagihan</span>
              <span className="text-base font-bold text-primary-400">{formatIDR(chargeAsset.purchasePrice)}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/40 border border-surface-700/30">
              <span className="text-[11px] text-surface-400">
                Dibayar dari{' '}
                <span className="font-semibold text-white">
                  {chargeWallet?.isLocked ? '🔒 ' : ''}{chargeWallet?.icon} {chargeWallet?.name || '-'}
                </span>
              </span>
            </div>

            <div className="input-group">
              <label className="input-label">Tanggal Bayar</label>
              <input
                type="date"
                value={chargeForm.date}
                onChange={(e) => setChargeForm({ ...chargeForm, date: e.target.value })}
                className="w-full"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Catatan (opsional)</label>
              <input
                type="text"
                value={chargeForm.note}
                onChange={(e) => setChargeForm({ ...chargeForm, note: e.target.value })}
                placeholder="cth: Periode September"
                className="w-full"
              />
            </div>

            <p className="text-[10px] text-surface-600">
              Dicatat sebagai pengeluaran dan jadwal berikutnya dimajukan satu periode.
            </p>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteAsset && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteAsset(null); }}>
          <div className="modal-content sm:max-w-sm animate-scaleIn">
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Hapus Aset?</h3>
              <p className="text-sm font-medium text-white mb-1">{deleteAsset.icon} {deleteAsset.name}</p>
              <p className="text-xs text-surface-500 mb-6">
                {isSubscription(deleteAsset)
                  ? 'Jadwal langganan akan hilang. Transaksi pengeluaran yang sudah tercatat tetap tersimpan.'
                  : 'Aset ini akan dihapus dari daftar kekayaan Anda.'}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteAsset(null)} className="btn-ghost flex-1">Batal</button>
                <button onClick={handleDelete} className="btn-danger flex-1">Hapus</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
