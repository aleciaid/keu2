import { db } from '../db/database';
import { sendWebhook } from './webhook';
import { formatIDR } from './currency';

/**
 * Savings targets are GOALS, not balances.
 *
 * A target has:
 *  - targetAmount         : the goal the user wants to reach
 *  - sourceWalletId       : the wallet the money is taken FROM (e.g. BCA)
 *  - destinationWalletId  : the wallet the money is parked IN (e.g. Saving)
 *
 * Money movement is recorded as a normal `transfer` transaction so wallet
 * balances always stay truthful, while a `savingsDeposits` ledger keeps the
 * per-target attribution (many targets may share one destination wallet).
 */

export const SAVINGS_TARGET_ICONS = ['🎯', '💰', '🏖️', '🚗', '🏠', '📱', '💻', '🎓', '💍', '🛡️', '✈️', '🏥'];
export const SAVINGS_TARGET_COLORS = [
  '#10b981', '#14b8a6', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#f97316', '#eab308',
];

export const DEFAULT_TARGET_FORM = {
  name: '',
  targetAmount: 0,
  sourceWalletId: '',
  destinationWalletId: '',
  deadline: '',
  note: '',
  icon: '🎯',
  color: '#10b981',
};

/** Sum of deposits minus withdrawals for a single target. */
export function calcTargetStats(target, deposits) {
  let saved = 0;
  let deposited = 0;
  let withdrawn = 0;
  let depositCount = 0;

  (deposits || []).forEach((d) => {
    if (d.targetId !== target.id) return;
    if (d.type === 'withdraw') {
      saved -= d.amount || 0;
      withdrawn += d.amount || 0;
    } else {
      saved += d.amount || 0;
      deposited += d.amount || 0;
      depositCount += 1;
    }
  });

  saved = Math.max(0, saved);

  const targetAmount = target.targetAmount || 0;
  const remaining = Math.max(0, targetAmount - saved);
  const progress = targetAmount > 0 ? Math.min(100, (saved / targetAmount) * 100) : 0;

  return {
    targetAmount,
    saved,
    deposited,
    withdrawn,
    depositCount,
    remaining,
    progress,
    isAchieved: targetAmount > 0 && saved >= targetAmount,
  };
}

/** Aggregate stats across all targets. */
export function calcSavingsSummary(targets, deposits) {
  const totalTarget = (targets || []).reduce((a, t) => a + (t.targetAmount || 0), 0);

  let totalSaved = 0;
  let totalDeposited = 0;
  let totalWithdrawn = 0;
  let depositCount = 0;
  let achievedCount = 0;

  (targets || []).forEach((t) => {
    const stats = calcTargetStats(t, deposits);
    totalSaved += stats.saved;
    totalDeposited += stats.deposited;
    totalWithdrawn += stats.withdrawn;
    depositCount += stats.depositCount;
    if (stats.isAchieved) achievedCount += 1;
  });

  return {
    totalTarget,
    totalSaved,
    totalDeposited,
    totalWithdrawn,
    totalRemaining: Math.max(0, totalTarget - totalSaved),
    depositCount,
    targetCount: (targets || []).length,
    activeCount: (targets || []).length - achievedCount,
    achievedCount,
    progress: totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0,
  };
}

/** Sum of savings held per destination wallet (used for wallet badges). */
export function calcSavedPerWallet(targets, deposits) {
  const perWallet = {};
  const targetMap = {};
  (targets || []).forEach((t) => { targetMap[t.id] = t; });

  (deposits || []).forEach((d) => {
    const target = targetMap[d.targetId];
    const walletId = d.destinationWalletId || target?.destinationWalletId;
    if (!walletId) return;
    const signed = d.type === 'withdraw' ? -(d.amount || 0) : (d.amount || 0);
    perWallet[walletId] = (perWallet[walletId] || 0) + signed;
  });

  return perWallet;
}

/** Days left until the deadline (negative = overdue). Null when no deadline. */
export function daysUntil(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86_400_000);
}

/**
 * Record a deposit (setoran) toward a target.
 * Moves money sourceWallet -> destinationWallet as a transfer transaction and
 * writes the ledger entry that ties the transfer to this target.
 */
export async function createSavingsDeposit({ target, amount, date, note = '' }) {
  if (!target) throw new Error('Target tidak ditemukan');
  if (!amount || amount <= 0) throw new Error('Jumlah setoran harus lebih dari 0');
  if (!target.sourceWalletId || !target.destinationWalletId) {
    throw new Error('Target belum memiliki wallet sumber dan wallet penampung');
  }
  if (target.sourceWalletId === target.destinationWalletId) {
    throw new Error('Wallet sumber dan wallet penampung tidak boleh sama');
  }

  const sourceWallet = await db.wallets.get(target.sourceWalletId);
  if (sourceWallet?.isLocked) {
    throw new Error(`Wallet "${sourceWallet.name}" terkunci. Unlock dulu untuk menyetor.`);
  }

  const now = new Date().toISOString();
  const txId = crypto.randomUUID();
  const dateValue = date ? new Date(date).toISOString() : now;

  await db.transactions.add({
    id: txId,
    type: 'transfer',
    amount,
    fromWalletId: target.sourceWalletId,
    toWalletId: target.destinationWalletId,
    walletId: '',
    categoryId: '',
    savingsTargetId: target.id,
    date: dateValue,
    note: `[Tabungan] ${target.name}${note ? ' - ' + note : ''}`,
    createdAt: now,
    updatedAt: now,
  });

  const depositId = crypto.randomUUID();
  await db.savingsDeposits.add({
    id: depositId,
    targetId: target.id,
    sourceWalletId: target.sourceWalletId,
    destinationWalletId: target.destinationWalletId,
    amount,
    type: 'deposit',
    note,
    date: dateValue,
    transactionId: txId,
    createdAt: now,
  });

  await db.logs.add({
    id: crypto.randomUUID(),
    action: 'savings_deposit',
    details: { targetId: target.id, name: target.name, amount, transactionId: txId },
    createdAt: now,
  });

  sendWebhook('savings_deposit', {
    targetId: target.id,
    name: target.name,
    amount,
    formattedAmount: formatIDR(amount),
    note,
    date: dateValue,
    message: `💰 Setoran tabungan "${target.name}" sebesar ${formatIDR(amount)}`,
  });

  return { depositId, transactionId: txId };
}

/**
 * Withdraw (tarik) from a target back to its source wallet.
 */
export async function createSavingsWithdrawal({ target, amount, date, note = '', saved }) {
  if (!target) throw new Error('Target tidak ditemukan');
  if (!amount || amount <= 0) throw new Error('Jumlah penarikan harus lebih dari 0');
  if (typeof saved === 'number' && amount > saved) {
    throw new Error(`Melebihi saldo tabungan. Tersimpan: ${formatIDR(saved)}`);
  }

  const now = new Date().toISOString();
  const txId = crypto.randomUUID();
  const dateValue = date ? new Date(date).toISOString() : now;

  await db.transactions.add({
    id: txId,
    type: 'transfer',
    amount,
    fromWalletId: target.destinationWalletId,
    toWalletId: target.sourceWalletId,
    walletId: '',
    categoryId: '',
    savingsTargetId: target.id,
    date: dateValue,
    note: `[Tarik Tabungan] ${target.name}${note ? ' - ' + note : ''}`,
    createdAt: now,
    updatedAt: now,
  });

  const depositId = crypto.randomUUID();
  await db.savingsDeposits.add({
    id: depositId,
    targetId: target.id,
    sourceWalletId: target.sourceWalletId,
    destinationWalletId: target.destinationWalletId,
    amount,
    type: 'withdraw',
    note,
    date: dateValue,
    transactionId: txId,
    createdAt: now,
  });

  await db.logs.add({
    id: crypto.randomUUID(),
    action: 'savings_withdraw',
    details: { targetId: target.id, name: target.name, amount, transactionId: txId },
    createdAt: now,
  });

  sendWebhook('savings_withdraw', {
    targetId: target.id,
    name: target.name,
    amount,
    formattedAmount: formatIDR(amount),
    note,
    date: dateValue,
    message: `📤 Penarikan tabungan "${target.name}" sebesar ${formatIDR(amount)}`,
  });

  return { depositId, transactionId: txId };
}

/**
 * Book an opening balance for a target: money that is already parked in the
 * destination wallet. Recorded in the ledger only (no money movement).
 */
export async function createInitialSavingsEntry(target, amount, date) {
  if (!amount || amount <= 0) return null;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.savingsDeposits.add({
    id,
    targetId: target.id,
    sourceWalletId: target.sourceWalletId,
    destinationWalletId: target.destinationWalletId,
    amount,
    type: 'deposit',
    note: 'Saldo awal tabungan',
    date: date ? new Date(date).toISOString() : now,
    transactionId: null,
    isInitial: true,
    createdAt: now,
  });

  await db.logs.add({
    id: crypto.randomUUID(),
    action: 'savings_deposit',
    details: { targetId: target.id, name: target.name, amount, initial: true },
    createdAt: now,
  });

  return id;
}

/**
 * Delete a target together with its ledger. Linked transfer transactions are
 * kept by default because the money really moved between wallets.
 */
export async function deleteSavingsTarget(targetId, { deleteLinkedTransactions = false } = {}) {
  const deposits = await db.savingsDeposits.where('targetId').equals(targetId).toArray();

  if (deleteLinkedTransactions) {
    for (const d of deposits) {
      if (d.transactionId) {
        await db.transactions.delete(d.transactionId);
      }
    }
  }

  await db.savingsDeposits.where('targetId').equals(targetId).delete();
  await db.savingsTargets.delete(targetId);

  await db.logs.add({
    id: crypto.randomUUID(),
    action: 'savings_target_deleted',
    details: { targetId, depositsRemoved: deposits.length, transactionsRemoved: deleteLinkedTransactions },
    createdAt: new Date().toISOString(),
  });
}

/** Remove the ledger row that belongs to a deleted transfer transaction. */
export async function removeLedgerByTransaction(transactionId) {
  if (!transactionId) return;
  const entries = await db.savingsDeposits.where('transactionId').equals(transactionId).toArray();
  for (const entry of entries) {
    await db.savingsDeposits.delete(entry.id);
  }
}
