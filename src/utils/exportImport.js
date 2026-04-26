import { db } from '../db/database';

const APP_VERSION = '1.0.0';

/**
 * Export all data to JSON
 */
export async function exportData() {
  try {
    const wallets = await db.wallets.toArray();
    const transactions = await db.transactions.toArray();
    const categories = await db.categories.toArray();
    const logs = await db.logs.toArray();
    const settings = await db.settings.toArray();
    const budgetPlans = await db.budgetPlans.toArray();

    const data = {
      metadata: {
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        recordCount: {
          wallets: wallets.length,
          transactions: transactions.length,
          categories: categories.length,
          logs: logs.length,
          budgetPlans: budgetPlans.length,
        },
      },
      wallets,
      transactions,
      categories,
      logs,
      settings,
      budgetPlans,
    };

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `finance-backup-${dateStr}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    return { filename, size: blob.size };
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
}

/**
 * Validate import data structure
 */
export function validateImportData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Invalid data format');
    return { valid: false, errors };
  }

  if (!data.metadata) {
    errors.push('Missing metadata');
  }

  const requiredTables = ['wallets', 'transactions', 'categories'];
  for (const table of requiredTables) {
    if (!Array.isArray(data[table])) {
      errors.push(`Missing or invalid "${table}" data`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    preview: errors.length === 0 ? {
      version: data.metadata?.version || 'unknown',
      exportedAt: data.metadata?.exportedAt || 'unknown',
      counts: data.metadata?.recordCount || {
        wallets: data.wallets?.length || 0,
        transactions: data.transactions?.length || 0,
        categories: data.categories?.length || 0,
        logs: data.logs?.length || 0,
      },
    } : null,
  };
}

/**
 * Import data with mode: 'replace' or 'merge'
 */
export async function importData(data, mode = 'replace') {
  try {
    if (mode === 'replace') {
      // Clear all tables
      await db.wallets.clear();
      await db.transactions.clear();
      await db.categories.clear();
      await db.logs.clear();
      if (db.budgetPlans) await db.budgetPlans.clear();

      // Import all data with error handling
      try {
        if (data.wallets?.length) {
          for (const w of data.wallets) {
            try {
              await db.wallets.put(w);
            } catch (e) {
              console.warn(`Failed to import wallet ${w.id}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('Error importing wallets:', e);
      }

      try {
        if (data.transactions?.length) {
          for (const t of data.transactions) {
            try {
              await db.transactions.put(t);
            } catch (e) {
              console.warn(`Failed to import transaction ${t.id}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('Error importing transactions:', e);
      }

      try {
        if (data.categories?.length) {
          for (const c of data.categories) {
            try {
              await db.categories.put(c);
            } catch (e) {
              console.warn(`Failed to import category ${c.id}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('Error importing categories:', e);
      }

      try {
        if (data.logs?.length) {
          for (const l of data.logs) {
            try {
              await db.logs.put(l);
            } catch (e) {
              console.warn(`Failed to import log ${l.id}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('Error importing logs:', e);
      }

      try {
        if (data.settings?.length) {
          for (const s of data.settings) {
            try {
              await db.settings.put(s);
            } catch (e) {
              console.warn(`Failed to import setting ${s.key}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('Error importing settings:', e);
      }

      try {
        if (data.budgetPlans?.length) {
          for (const bp of data.budgetPlans) {
            try {
              await db.budgetPlans.put(bp);
            } catch (e) {
              console.warn(`Failed to import budget plan ${bp.id}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('Error importing budget plans:', e);
      }
    } else {
      // Merge mode: skip duplicates
      if (data.wallets?.length) {
        for (const w of data.wallets) {
          try {
            const exists = await db.wallets.get(w.id);
            if (!exists) await db.wallets.add(w);
          } catch (e) {
            console.warn(`Failed to merge wallet ${w.id}:`, e);
          }
        }
      }
      if (data.transactions?.length) {
        for (const t of data.transactions) {
          try {
            const exists = await db.transactions.get(t.id);
            if (!exists) await db.transactions.add(t);
          } catch (e) {
            console.warn(`Failed to merge transaction ${t.id}:`, e);
          }
        }
      }
      if (data.categories?.length) {
        for (const c of data.categories) {
          try {
            const exists = await db.categories.get(c.id);
            if (!exists) await db.categories.add(c);
          } catch (e) {
            console.warn(`Failed to merge category ${c.id}:`, e);
          }
        }
      }
      if (data.logs?.length) {
        for (const l of data.logs) {
          try {
            const exists = await db.logs.get(l.id);
            if (!exists) await db.logs.add(l);
          } catch (e) {
            console.warn(`Failed to merge log ${l.id}:`, e);
          }
        }
      }
      if (data.budgetPlans?.length) {
        for (const bp of data.budgetPlans) {
          try {
            const exists = await db.budgetPlans.get(bp.id);
            if (!exists) await db.budgetPlans.add(bp);
          } catch (e) {
            console.warn(`Failed to merge budget plan ${bp.id}:`, e);
          }
        }
      }
    }

    // Log import
    try {
      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'data_imported',
        details: { mode, version: data.metadata?.version },
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to log import:', e);
    }

    return { success: true };
  } catch (error) {
    console.error('Import failed:', error);
    throw error;
  }
}
