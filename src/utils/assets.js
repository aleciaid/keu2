import { db } from '../db/database';
import { sendWebhook } from './webhook';
import { formatIDR } from './currency';

/**
 * Assets are the things you own.
 *
 *  - kind: 'physical' | 'digital'
 *  - physical          : bought once (emas, motor, rumah, elektronik)
 *  - digital lifetime  : one-time purchase, owned forever (lisensi, domain)
 *  - digital subscription: recurring (Netflix, Spotify, VPS) — monthly/yearly
 *
 * Only subscriptions carry a billing cycle. A subscription's next due date is
 * advanced by the cycle each time it is billed (auto or manual), and the charge
 * is written as a normal expense transaction from the chosen wallet so wallet
 * balances stay truthful.
 */

export const ASSET_KINDS = [
  { value: 'physical', label: 'Fisik', icon: '📦', desc: 'Barang yang dimiliki' },
  { value: 'digital', label: 'Digital', icon: '💾', desc: 'Lisensi, langganan, domain' },
];

export const DIGITAL_TYPES = [
  { value: 'lifetime', label: 'Lifetime', icon: '♾️', desc: 'Sekali bayar, selamanya' },
  { value: 'subscription', label: 'Langganan', icon: '🔄', desc: 'Berulang tiap periode' },
];

export const BILLING_CYCLES = [
  { value: 'monthly', label: 'Bulanan', icon: '🗓️', months: 1 },
  { value: 'yearly', label: 'Tahunan', icon: '📆', months: 12 },
];

export const ASSET_CONDITIONS = [
  { value: 'good', label: 'Baik' },
  { value: 'fair', label: 'Cukup' },
  { value: 'worn', label: 'Usang' },
];

export const ASSET_ICONS = [
  '📦', '💾', '🏠', '🚗', '🏍️', '📱', '💻', '⌚', '📷', '🎮',
  '🪙', '💎', '🏆', '🎸', '🛋️', '📺', '🌐', '🔑', '📜', '☁️',
];

export const ASSET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#10b981', '#14b8a6', '#3b82f6', '#06b6d4',
];

export const DEFAULT_ASSET_FORM = {
  name: '',
  kind: 'physical',
  digitalType: 'lifetime',
  billingCycle: 'monthly',
  purchasePrice: 0,
  purchaseDate: new Date().toISOString().slice(0, 10),
  walletId: '',
  categoryId: '',
  vendor: '',
  condition: 'good',
  note: '',
  icon: '📦',
  color: '#6366f1',
  autoCharge: false,
  reminderEnabled: true,
};

export function isSubscription(asset) {
  return asset?.kind === 'digital' && asset?.digitalType === 'subscription';
}

export function getCycleMonths(cycle) {
  return BILLING_CYCLES.find((c) => c.value === cycle)?.months || 1;
}

export function getCycleLabel(cycle) {
  return BILLING_CYCLES.find((c) => c.value === cycle)?.label || 'Bulanan';
}

export function getAssetTypeLabel(asset) {
  if (!asset) return '';
  if (asset.kind !== 'digital') return 'Fisik';
  return asset.digitalType === 'subscription' ? 'Langganan' : 'Lifetime';
}

/**
 * Advance a due date by one billing cycle.
 *
 * Clamps to the last day of the target month so a subscription billed on the
 * 31st does not overflow into the following month (Jan 31 + 1 month => Feb 28,
 * not Mar 3). The original day-of-month is preserved whenever it exists.
 */
export function addCycle(isoDate, cycle) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;

  const day = d.getDate();
  const target = new Date(d.getTime());
  target.setDate(1);
  target.setMonth(target.getMonth() + getCycleMonths(cycle));

  // Last day of the target month
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));

  return target.toISOString();
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86_400_000);
}

/**
 * Normalised cost per month for a subscription (yearly is spread over 12).
 * Used so monthly and yearly plans can be compared fairly.
 */
export function monthlyCost(asset) {
  if (!isSubscription(asset)) return 0;
  const price = asset.purchasePrice || 0;
  return asset.billingCycle === 'yearly' ? price / 12 : price;
}

export function yearlyCost(asset) {
  if (!isSubscription(asset)) return 0;
  const price = asset.purchasePrice || 0;
  return asset.billingCycle === 'yearly' ? price : price * 12;
}

/**
 * Portfolio summary.
 *  - totalValue        : sum of purchase prices for everything owned
 *  - physicalValue     : physical goods only
 *  - digitalLifetime   : one-time digital purchases
 *  - subscriptionMonthly / subscriptionYearly : recurring cost
 */
export function calcAssetSummary(assets) {
  const list = assets || [];
  const physical = list.filter((a) => a.kind !== 'digital');
  const lifetime = list.filter((a) => a.kind === 'digital' && a.digitalType !== 'subscription');
  const subs = list.filter(isSubscription);

  const sum = (arr) => arr.reduce((t, a) => t + (a.purchasePrice || 0), 0);

  return {
    count: list.length,
    totalValue: sum(list),
    physicalCount: physical.length,
    physicalValue: sum(physical),
    lifetimeCount: lifetime.length,
    lifetimeValue: sum(lifetime),
    subscriptionCount: subs.length,
    subscriptionMonthly: subs.reduce((t, a) => t + monthlyCost(a), 0),
    subscriptionYearly: subs.reduce((t, a) => t + yearlyCost(a), 0),
    dueSoon: subs.filter((a) => {
      const d = daysUntil(a.nextDueDate);
      return d !== null && d <= 7;
    }).length,
  };
}

/** Group subscriptions by wallet so the user sees which wallet they drain. */
export function calcSubscriptionsPerWallet(assets) {
  const perWallet = {};
  (assets || []).filter(isSubscription).forEach((a) => {
    if (!a.walletId) return;
    perWallet[a.walletId] = (perWallet[a.walletId] || 0) + monthlyCost(a);
  });
  return perWallet;
}

/**
 * Record one billing period for a subscription: writes an expense transaction
 * and advances nextDueDate. Returns the created transaction id.
 */
export async function chargeSubscription(asset, { date, note = '' } = {}) {
  if (!isSubscription(asset)) throw new Error('Aset ini bukan langganan');
  if (!asset.walletId) throw new Error('Langganan belum memiliki wallet pembayaran');

  const wallet = await db.wallets.get(asset.walletId);
  if (!wallet) throw new Error('Wallet pembayaran tidak ditemukan');
  if (wallet.isLocked) {
    throw new Error(`Wallet "${wallet.name}" terkunci. Unlock dulu untuk membayar langganan.`);
  }

  const now = new Date().toISOString();
  const chargeDate = date ? new Date(date).toISOString() : now;
  const amount = asset.purchasePrice || 0;
  const txId = crypto.randomUUID();

  await db.transactions.add({
    id: txId,
    type: 'expense',
    amount,
    walletId: asset.walletId,
    categoryId: asset.categoryId || '',
    fromWalletId: '',
    toWalletId: '',
    assetId: asset.id,
    date: chargeDate,
    note: `[Langganan] ${asset.name}${note ? ' - ' + note : ''}`,
    createdAt: now,
    updatedAt: now,
  });

  const baseForNext = asset.nextDueDate || chargeDate;
  const nextDue = addCycle(baseForNext, asset.billingCycle) || chargeDate;

  await db.assets.update(asset.id, {
    nextDueDate: nextDue,
    lastChargedAt: chargeDate,
    lastChargeTransactionId: txId,
    updatedAt: now,
  });

  await db.logs.add({
    id: crypto.randomUUID(),
    action: 'asset_subscription_charged',
    details: { assetId: asset.id, name: asset.name, amount, transactionId: txId, nextDueDate: nextDue },
    createdAt: now,
  });

  sendWebhook('asset_subscription_charged', {
    assetId: asset.id,
    name: asset.name,
    amount,
    formattedAmount: formatIDR(amount),
    cycle: asset.billingCycle,
    wallet: wallet.name,
    nextDueDate: nextDue,
    message: `🔄 Langganan "${asset.name}" ${formatIDR(amount)} dibayar dari ${wallet.name}`,
  });

  return { transactionId: txId, nextDueDate: nextDue };
}

/**
 * Scheduler: charge every subscription whose nextDueDate has arrived.
 * Locked or missing wallets are skipped and logged instead of failing.
 */
export async function runAssetScheduler() {
  try {
    const assets = await db.assets.toArray();
    const subs = assets.filter(
      (a) => isSubscription(a) && a.autoCharge && a.nextDueDate,
    );

    if (subs.length === 0) return [];

    const todayStr = new Date().toISOString().slice(0, 10);
    const wallets = await db.wallets.toArray();
    const walletMap = {};
    wallets.forEach((w) => { walletMap[w.id] = w; });

    const results = [];

    for (const asset of subs) {
      if (asset.nextDueDate.slice(0, 10) > todayStr) continue;

      const wallet = walletMap[asset.walletId];
      if (!wallet || wallet.isLocked) {
        await db.logs.add({
          id: crypto.randomUUID(),
          action: 'asset_subscription_failed',
          details: {
            assetId: asset.id,
            name: asset.name,
            reason: !wallet ? 'wallet_missing' : 'wallet_locked',
          },
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      try {
        const result = await chargeSubscription(asset);
        results.push({ asset, ...result });
      } catch (err) {
        console.error(`Subscription charge failed for ${asset.id}:`, err);
      }
    }

    return results;
  } catch (err) {
    console.error('Asset scheduler error:', err);
    return [];
  }
}

/** Subscriptions due within the given number of days (for reminders). */
export function getUpcomingSubscriptions(assets, withinDays = 7) {
  return (assets || [])
    .filter(isSubscription)
    .map((a) => ({ ...a, daysLeft: daysUntil(a.nextDueDate) }))
    .filter((a) => a.daysLeft !== null && a.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
