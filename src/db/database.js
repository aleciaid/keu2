import Dexie from 'dexie';

export const db = new Dexie('FinanceTracker');

// Use string IDs for non-auto-increment tables
db.version(7).stores({
  wallets: 'id, name, createdAt, updatedAt',
  transactions: 'id, type, walletId, fromWalletId, toWalletId, categoryId, date, amount, createdAt, updatedAt',
  categories: 'id, name, type, createdAt, updatedAt',
  logs: 'id, action, createdAt',
  settings: 'key',
  deviceInfo: 'key',
  budgetPlans: 'id, name, walletId, categoryId, status, dueDate, createdAt, updatedAt',
});

db.version(8).stores({
  transactions: 'id, type, walletId, fromWalletId, toWalletId, categoryId, date, amount, debtStatus, linkedDebtId, createdAt, updatedAt',
});

// v9: Add recurring budget support
db.version(9).stores({
  budgetPlans: 'id, name, walletId, categoryId, status, dueDate, recurrence, nextDueDate, parentPlanId, createdAt, updatedAt',
});

// Default categories
export const DEFAULT_CATEGORIES = [
  // Income
  { id: 'cat-income-gaji', name: 'Gaji', type: 'income', icon: '💰', color: '#10b981', isDefault: true },
  { id: 'cat-income-bonus', name: 'Bonus', type: 'income', icon: '🎁', color: '#f59e0b', isDefault: true },
  { id: 'cat-income-investasi', name: 'Investasi', type: 'income', icon: '📈', color: '#3b82f6', isDefault: true },
  { id: 'cat-income-lainnya', name: 'Lainnya', type: 'income', icon: '📥', color: '#8b5cf6', isDefault: true },
  // Expense
  { id: 'cat-expense-makan', name: 'Makan', type: 'expense', icon: '🍕', color: '#ef4444', isDefault: true },
  { id: 'cat-expense-transport', name: 'Transport', type: 'expense', icon: '🚗', color: '#f97316', isDefault: true },
  { id: 'cat-expense-tagihan', name: 'Tagihan', type: 'expense', icon: '📄', color: '#eab308', isDefault: true },
  { id: 'cat-expense-belanja', name: 'Belanja', type: 'expense', icon: '🛍️', color: '#ec4899', isDefault: true },
  { id: 'cat-expense-hiburan', name: 'Hiburan', type: 'expense', icon: '🎬', color: '#a855f7', isDefault: true },
  { id: 'cat-expense-kesehatan', name: 'Kesehatan', type: 'expense', icon: '🏥', color: '#14b8a6', isDefault: true },
  { id: 'cat-expense-pendidikan', name: 'Pendidikan', type: 'expense', icon: '📚', color: '#6366f1', isDefault: true },
  { id: 'cat-expense-lainnya', name: 'Lainnya', type: 'expense', icon: '📦', color: '#64748b', isDefault: true },
];

// Device UUID generation
export async function getDeviceUUID() {
  try {
    const existingUUID = await db.deviceInfo.get('deviceUUID');
    if (existingUUID) {
      return existingUUID.value;
    }

    // Generate a new UUID if not exists
    const newUUID = crypto.randomUUID();
    await db.deviceInfo.put({ key: 'deviceUUID', value: newUUID });
    return newUUID;
  } catch (error) {
    console.error('Failed to get device UUID:', error);
    throw error;
  }
}

export async function seedDatabase() {
  try {
    const now = new Date().toISOString();

    // 1. Seed categories safely
    try {
      const existingCategories = await db.categories.toArray();
      
      if (existingCategories.length === 0) {
        // Only add if table is empty
        for (const category of DEFAULT_CATEGORIES) {
          try {
            await db.categories.put({
              ...category,
              createdAt: now,
              updatedAt: now,
            });
          } catch (e) {
            // Skip duplicate entries
            console.warn(`Skipping duplicate category: ${category.id}`);
          }
        }
      }
    } catch (error) {
      console.error('Error seeding categories:', error);
    }

    // 2. Seed default settings
    try {
      const settingsToCheck = [
        { key: 'webhookUrl', value: '' },
        { key: 'webhookEnabled', value: false },
        { key: 'appVersion', value: '1.0.0' },
        { key: 'theme', value: 'dark' },
        { key: 'savingsGoalPercentage', value: 20 },
      ];

      for (const setting of settingsToCheck) {
        const existingSetting = await db.settings.get(setting.key);
        if (!existingSetting) {
          await db.settings.put(setting);
        }
      }
    } catch (error) {
      console.error('Error seeding settings:', error);
    }

    // 3. Create default fixed savings wallet
    try {
      const allWallets = await db.wallets.toArray();
      const fixedWalletExists = allWallets.some(w => w.isFixed === true);

      if (!fixedWalletExists) {
        await db.wallets.put({
          id: `wallet-savings-${crypto.randomUUID()}`,
          name: 'Tabungan Target',
          createdAt: now,
          updatedAt: now,
          isFixed: true,
          amount: 0,
          icon: '💰',
          color: '#10b981',
          initialBalance: 0
        });
      }
    } catch (error) {
      console.error('Error seeding fixed wallet:', error);
    }

    // 4. Ensure device UUID is generated
    try {
      await getDeviceUUID();
    } catch (error) {
      console.error('Error generating device UUID:', error);
    }

    return true;
  } catch (error) {
    console.error('Seeding database failed:', error);
    throw error;
  }
}

// Clear database completely
export async function clearDatabase() {
  try {
    const tables = db.tables;
    for (const table of tables) {
      await table.clear();
    }
  } catch (error) {
    console.error('Error clearing database:', error);
  }
}

// Reset database to initial state
export async function resetDatabase() {
  try {
    await clearDatabase();
    await seedDatabase();
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  }
}