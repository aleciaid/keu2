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
 * Calculate total balance excluding savings wallet
 */
export function calculateNetBalance(wallets, walletBalances) {
  let totalBalance = 0;
  
  wallets.forEach((wallet) => {
    // Exclude fixed savings wallet from net balance
    if (!wallet.isFixed) {
      totalBalance += walletBalances[wallet.id] || 0;
    }
  });

  return totalBalance;
}

/**
 * Calculate total balance including all wallets
 */
export function calculateTotalBalance(walletBalances) {
  return Object.values(walletBalances).reduce((a, b) => a + b, 0);
}

/**
 * Get savings wallet balance
 */
export function getSavingsWalletBalance(wallets, walletBalances) {
  const savingsWallet = wallets.find(w => w.isFixed === true);
  return savingsWallet ? (walletBalances[savingsWallet.id] || 0) : 0;
}

/**
 * Calculate available balance for spending (net balance excluding savings)
 */
export function getAvailableBalanceForSpending(wallets, walletBalances) {
  return calculateNetBalance(wallets, walletBalances);
}
