import { db } from '../db/database';
import { sendWebhook } from './webhook';
import { formatIDR } from './currency';

/**
 * Calculate next due date based on recurrence type.
 * @param {string} currentDueDate - ISO date string
 * @param {'weekly'|'monthly'|'yearly'} recurrence
 * @returns {string} ISO date string of next due date
 */
export function calculateNextDueDate(currentDueDate, recurrence) {
  const d = new Date(currentDueDate);
  switch (recurrence) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return null;
  }
  return d.toISOString();
}

/**
 * Create the next recurring plan from an existing plan.
 * Called after a plan is paid or when spawning the next cycle.
 */
async function createNextRecurringPlan(plan) {
  if (!plan.recurrence || plan.recurrence === 'none' || !plan.dueDate) return null;

  const nextDue = calculateNextDueDate(plan.dueDate, plan.recurrence);
  if (!nextDue) return null;

  const now = new Date().toISOString();
  const newId = crypto.randomUUID();

  const newPlan = {
    id: newId,
    name: plan.name,
    amount: plan.amount,
    walletId: plan.walletId,
    categoryId: plan.categoryId || '',
    status: 'planned',
    dueDate: nextDue,
    note: plan.note || '',
    recurrence: plan.recurrence,
    autoPayment: plan.autoPayment || false,
    parentPlanId: plan.parentPlanId || plan.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.budgetPlans.add(newPlan);

  await db.logs.add({
    id: crypto.randomUUID(),
    action: 'budget_recurring_created',
    details: {
      planId: newId,
      name: plan.name,
      amount: plan.amount,
      recurrence: plan.recurrence,
      dueDate: nextDue,
      fromPlanId: plan.id,
    },
    createdAt: now,
  });

  return newPlan;
}

/**
 * Execute auto-payment for a single plan.
 * Creates an expense transaction and marks the plan as paid.
 * Returns { success, newRecurringPlan? }
 */
async function executeAutoPayment(plan, walletMap) {
  const now = new Date().toISOString();

  // Create the expense transaction
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
    note: `[Auto Budget] ${plan.name}${plan.note ? ' - ' + plan.note : ''}`,
    createdAt: now,
    updatedAt: now,
  });

  // Mark plan as paid
  await db.budgetPlans.update(plan.id, {
    status: 'paid',
    paidAt: now,
    transactionId: txId,
    updatedAt: now,
  });

  await db.logs.add({
    id: crypto.randomUUID(),
    action: 'budget_auto_paid',
    details: {
      planId: plan.id,
      transactionId: txId,
      amount: plan.amount,
      name: plan.name,
    },
    createdAt: now,
  });

  // Send webhook for auto-payment
  const walletName = walletMap?.[plan.walletId]?.name || plan.walletId;
  sendWebhook('budget_auto_paid', {
    planId: plan.id,
    name: plan.name,
    amount: plan.amount,
    formattedAmount: formatIDR(plan.amount),
    wallet: walletName,
    dueDate: plan.dueDate,
    recurrence: plan.recurrence || 'none',
    message: `💸 Auto-payment: "${plan.name}" sebesar ${formatIDR(plan.amount)} dari ${walletName}`,
  });

  // If recurring, create the next plan
  let newRecurringPlan = null;
  if (plan.recurrence && plan.recurrence !== 'none') {
    newRecurringPlan = await createNextRecurringPlan(plan);
  }

  return { success: true, newRecurringPlan };
}

/**
 * Process a cancelled plan: send webhook notification.
 */
export async function notifyCancelledPlan(plan, walletMap) {
  const walletName = walletMap?.[plan.walletId]?.name || plan.walletId;
  sendWebhook('budget_plan_cancelled', {
    planId: plan.id,
    name: plan.name,
    amount: plan.amount,
    formattedAmount: formatIDR(plan.amount),
    wallet: walletName,
    message: `❌ Budget dibatalkan: "${plan.name}" sebesar ${formatIDR(plan.amount)} dari ${walletName}`,
  });
}

/**
 * Process a paid plan (manual payment): send webhook notification
 * and create next recurring plan if applicable.
 */
export async function processManualPayment(plan, walletMap) {
  const walletName = walletMap?.[plan.walletId]?.name || plan.walletId;
  sendWebhook('budget_plan_paid', {
    planId: plan.id,
    name: plan.name,
    amount: plan.amount,
    formattedAmount: formatIDR(plan.amount),
    wallet: walletName,
    dueDate: plan.dueDate,
    recurrence: plan.recurrence || 'none',
    message: `✅ Budget terbayar: "${plan.name}" sebesar ${formatIDR(plan.amount)} dari ${walletName}`,
  });

  // Create the next recurring plan if applicable
  let newRecurringPlan = null;
  if (plan.recurrence && plan.recurrence !== 'none' && plan.dueDate) {
    newRecurringPlan = await createNextRecurringPlan(plan);
  }

  return { newRecurringPlan };
}

/**
 * MAIN SCHEDULER: Check all planned budgets for auto-payment on due dates.
 * This should be called on app startup and periodically.
 *
 * Logic:
 * - Find all 'planned' budgets with autoPayment=true and dueDate <= now
 * - For each, execute auto-payment
 * - If recurring, create the next budget plan
 *
 * Returns array of processed plans.
 */
export async function runBudgetScheduler() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Get all planned budgets that have auto-payment enabled and are due
    const allPlanned = await db.budgetPlans
      .where('status')
      .equals('planned')
      .toArray();

    const duePlans = allPlanned.filter((p) => {
      if (!p.autoPayment || !p.dueDate) return false;
      const dueDay = p.dueDate.slice(0, 10);
      return dueDay <= todayStr;
    });

    if (duePlans.length === 0) return [];

    // Build wallet map for webhook messages
    const wallets = await db.wallets.toArray();
    const walletMap = {};
    wallets.forEach((w) => { walletMap[w.id] = w; });

    const results = [];

    for (const plan of duePlans) {
      try {
        const result = await executeAutoPayment(plan, walletMap);
        results.push({ plan, ...result });
      } catch (err) {
        console.error(`Auto-payment failed for plan ${plan.id}:`, err);
        await db.logs.add({
          id: crypto.randomUUID(),
          action: 'budget_auto_pay_failed',
          details: { planId: plan.id, error: err.message },
          createdAt: new Date().toISOString(),
        });
      }
    }

    return results;
  } catch (err) {
    console.error('Budget scheduler error:', err);
    return [];
  }
}

/**
 * Recurrence labels for UI display
 */
export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Sekali', icon: '1️⃣' },
  { value: 'weekly', label: 'Mingguan', icon: '📅' },
  { value: 'monthly', label: 'Bulanan', icon: '🗓️' },
  { value: 'yearly', label: 'Tahunan', icon: '📆' },
];

export function getRecurrenceLabel(value) {
  return RECURRENCE_OPTIONS.find((o) => o.value === value)?.label || 'Sekali';
}
