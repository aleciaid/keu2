import { db } from '../db/database';

export async function calculateFinancialRatios() {
  // Get total income
  const incomeTransactions = await db.transactions
    .where('type')
    .equals('income')
    .toArray();
  
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Get total expense
  const expenseTransactions = await db.transactions
    .where('type')
    .equals('expense')
    .toArray();
  
  const totalExpense = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Get total debt
  const debtTransactions = await db.transactions
    .where('type')
    .equals('debt')
    .toArray();
  
  const totalDebt = debtTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Get savings (assuming fixed savings wallet)
  const savingsWallet = await db.wallets
    .filter(w => w.isFixed === true)
    .first();
  
  // Calculate savings wallet balance from transactions
  let totalSavings = savingsWallet ? (savingsWallet.initialBalance || 0) : 0;
  
  if (savingsWallet) {
    const savingsTransactions = await db.transactions.toArray();
    savingsTransactions.forEach(t => {
      if (t.toWalletId === savingsWallet.id) {
        totalSavings += t.amount;
      } else if (t.fromWalletId === savingsWallet.id) {
        totalSavings -= t.amount;
      }
    });
  }

  // Retrieve ideal percentages
  const savingsGoalSetting = await db.settings.get('savingsGoalPercentage');
  const savingsGoalPercentage = savingsGoalSetting ? savingsGoalSetting.value : 20;
  const expensePercentage = 50; // Default 50-60%, using 50
  const debtPercentage = 20; // Default 20-30%, using 20

  // Calculate ratios
  const debtRatio = totalIncome > 0 ? (totalDebt / totalIncome) * 100 : 0;
  const expenseRatio = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0;
  const savingsRatio = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

  // Calculate ideal nominal amounts
  const idealExpenseAmount = (totalIncome * expensePercentage) / 100;
  const idealDebtAmount = (totalIncome * debtPercentage) / 100;
  const idealSavingsAmount = (totalIncome * savingsGoalPercentage) / 100;

  // Calculate recommendations (current vs ideal)
  const debtRecommendation = Math.max(0, idealDebtAmount - totalDebt);
  const expenseRecommendation = Math.max(0, idealExpenseAmount - totalExpense);
  const savingsRecommendation = Math.max(0, idealSavingsAmount - totalSavings);

  // Generate recommendation
  const recommendations = generateRecommendations({
    totalIncome,
    debtRatio,
    expenseRatio,
    savingsRatio,
    savingsGoalPercentage,
    debtPercentage,
    expensePercentage,
    idealExpenseAmount,
    idealDebtAmount,
    idealSavingsAmount,
    currentDebt: totalDebt,
    currentExpense: totalExpense,
    currentSavings: totalSavings
  });

  return {
    totalIncome,
    totalExpense,
    totalDebt,
    totalSavings,
    debtRatio,
    expenseRatio,
    savingsRatio,
    recommendations,
    ideal: {
      expenseAmount: idealExpenseAmount,
      debtAmount: idealDebtAmount,
      savingsAmount: idealSavingsAmount,
      expensePercentage,
      debtPercentage,
      savingsPercentage: savingsGoalPercentage
    }
  };
}

function generateRecommendations({
  totalIncome,
  debtRatio,
  expenseRatio,
  savingsRatio,
  savingsGoalPercentage,
  debtPercentage,
  expensePercentage,
  idealExpenseAmount,
  idealDebtAmount,
  idealSavingsAmount,
  currentDebt,
  currentExpense,
  currentSavings
}) {
  const recommendations = [];

  if (totalIncome === 0) {
    return [{
      type: 'info',
      title: 'Belum Ada Income',
      description: 'Tambahkan income terlebih dahulu untuk melihat rekomendasi keuangan.',
      nominal: 0
    }];
  }

  // Debt recommendation
  if (debtRatio > debtPercentage) {
    const excessDebt = currentDebt - idealDebtAmount;
    recommendations.push({
      type: 'warning',
      title: 'Hutang Tinggi',
      description: `Hutang ${debtRatio.toFixed(1)}%. Target ideal: ${debtPercentage}%. Butuh kurangi: Rp ${Math.max(0, excessDebt).toLocaleString('id-ID')}`,
      nominal: Math.max(0, excessDebt),
      ideal: idealDebtAmount,
      current: currentDebt,
      percentage: debtRatio
    });
  }

  // Expense recommendation
  if (expenseRatio > expensePercentage) {
    const excessExpense = currentExpense - idealExpenseAmount;
    recommendations.push({
      type: 'warning',
      title: 'Pengeluaran Tinggi',
      description: `Pengeluaran ${expenseRatio.toFixed(1)}%. Target ideal: ${expensePercentage}%. Butuh kurangi: Rp ${Math.max(0, excessExpense).toLocaleString('id-ID')}`,
      nominal: Math.max(0, excessExpense),
      ideal: idealExpenseAmount,
      current: currentExpense,
      percentage: expenseRatio
    });
  }

  // Savings recommendation
  if (savingsRatio < savingsGoalPercentage) {
    const neededSavings = idealSavingsAmount - currentSavings;
    recommendations.push({
      type: savingsRatio === 0 ? 'critical' : 'suggestion',
      title: 'Target Tabungan',
      description: `Tabungan ${savingsRatio.toFixed(1)}%. Target ideal: ${savingsGoalPercentage}%. Butuh tambah: Rp ${Math.max(0, neededSavings).toLocaleString('id-ID')}`,
      nominal: Math.max(0, neededSavings),
      ideal: idealSavingsAmount,
      current: currentSavings,
      percentage: savingsGoalPercentage
    });
  }

  // Positive scenarios
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'success',
      title: 'Keuangan Sehat',
      description: 'Anda sudah mengelola keuangan dengan baik. Lanjutkan pola ini!',
      nominal: 0
    });
  }

  return recommendations;
}

export async function updateSavingsGoal(percentage) {
  await db.settings.put({ key: 'savingsGoalPercentage', value: percentage });
}

export async function getSavingsGoal() {
  const goal = await db.settings.get('savingsGoalPercentage');
  return goal ? goal.value : 20;
}