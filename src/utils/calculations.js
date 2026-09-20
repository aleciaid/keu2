import { db } from '../db/database';

/**
 * Calculate wallet balances from transactions
 */
export function calculateWalletBalances(wallets, transactions) {
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

  return walletBalances;
}

/**
 * Calculate total balance across all wallets.
 *
 * Savings targets are goals, not balances: money saved for a target stays in
 * its destination wallet, so it is already included here.
 */
export function calculateTotalBalance(walletBalances) {
  return Object.values(walletBalances).reduce((a, b) => a + b, 0);
}

/**
 * A locked wallet cannot be used as the source of any outgoing money
 * (expense, transfer, debt, budget payment or savings deposit) until it is
 * unlocked. Incoming money is always allowed.
 */
export function isWalletLocked(wallets, walletId) {
  if (!walletId) return false;
  const wallet = (wallets || []).find((w) => w.id === walletId);
  return Boolean(wallet?.isLocked);
}

export function getLockedWalletIds(wallets) {
  return (wallets || []).filter((w) => w.isLocked).map((w) => w.id);
}

/**
 * Human-readable error message for a blocked locked-wallet action.
 */
export function lockedWalletMessage(wallets, walletId, action = 'transaksi') {
  const wallet = (wallets || []).find((w) => w.id === walletId);
  const name = wallet ? wallet.name : 'Wallet';
  return `Wallet "${name}" terkunci. Unlock dulu untuk melakukan ${action}.`;
}

/** Total balance sitting in locked wallets. */
export function calculateLockedBalance(wallets, walletBalances) {
  return (wallets || []).reduce(
    (sum, w) => (w.isLocked ? sum + (walletBalances[w.id] || 0) : sum),
    0,
  );
}
