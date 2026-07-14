import { prisma } from "@/lib/db";
import { monthRange, type MonthKey } from "@/lib/date";
import { SAVINGS_ACCOUNT_NAME } from "@/lib/constants";
import { usagePct } from "@/lib/money";

/**
 * Derived queries over the append-only Entry ledger.
 *
 * NOTHING here is a stored running total. Every number is recomputed from Entry
 * rows on read, which is the whole point of the design: balances can never
 * drift out of sync with history.
 *
 * Reversal semantics: a correction is a new Entry that carries the SAME shape as
 * the original (same accounts, amount, category) plus `reversesEntryId`. Its
 * effect on every derived number is simply NEGATED. So a reversal of an expense
 * credits the account back and reduces that category's spend — without ever
 * mutating the original row.
 */

/** +1 for a normal entry, -1 for a reversing entry. */
function sign(reversesEntryId: string | null): bigint {
  return reversesEntryId ? -1n : 1n;
}

export type AccountBalance = {
  id: string;
  name: string;
  type: string;
  balanceMinor: bigint;
};

/**
 * Balance of ONE account as of a given date (inclusive) — only entries with
 * `occurredAt <= asOf` count. Used by dynamic recurring rules (payoff / sweep)
 * to size a transfer from the account's live balance on the day it fires,
 * deterministically and correctly even when back-filling past months.
 */
export async function getAccountBalanceAsOf(
  userId: string,
  accountId: string,
  asOf: Date,
): Promise<bigint> {
  const entries = await prisma.entry.findMany({
    where: {
      userId,
      occurredAt: { lte: asOf },
      OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
    },
    select: {
      amountMinor: true,
      fromAccountId: true,
      toAccountId: true,
      reversesEntryId: true,
    },
  });

  let balance = 0n;
  for (const e of entries) {
    const amt = e.amountMinor * sign(e.reversesEntryId);
    if (e.toAccountId === accountId) balance += amt;
    if (e.fromAccountId === accountId) balance -= amt;
  }
  return balance;
}

/**
 * Balance per account = Σ credits − Σ debits, with reversals negated.
 *   credits: INCOME.toAccount, TRANSFER.toAccount
 *   debits:  EXPENSE.fromAccount, TRANSFER.fromAccount
 */
export async function getAccountBalances(userId: string): Promise<AccountBalance[]> {
  const [accounts, entries] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
    prisma.entry.findMany({
      where: { userId },
      select: {
        amountMinor: true,
        fromAccountId: true,
        toAccountId: true,
        reversesEntryId: true,
      },
    }),
  ]);

  const balances = new Map<string, bigint>();
  for (const a of accounts) balances.set(a.id, 0n);

  for (const e of entries) {
    const s = sign(e.reversesEntryId);
    const amt = e.amountMinor * s;
    if (e.toAccountId && balances.has(e.toAccountId)) {
      balances.set(e.toAccountId, balances.get(e.toAccountId)! + amt);
    }
    if (e.fromAccountId && balances.has(e.fromAccountId)) {
      balances.set(e.fromAccountId, balances.get(e.fromAccountId)! - amt);
    }
  }

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    balanceMinor: balances.get(a.id) ?? 0n,
  }));
}

export async function getNetWorth(userId: string): Promise<bigint> {
  const balances = await getAccountBalances(userId);
  return balances.reduce((sum, b) => sum + b.balanceMinor, 0n);
}

/** Map of categoryId -> spend (paise) for EXPENSE entries in the month. */
export async function getCategorySpend(
  userId: string,
  month: MonthKey,
): Promise<Map<string, bigint>> {
  const { start, end } = monthRange(month);
  const entries = await prisma.entry.findMany({
    where: {
      userId,
      type: "EXPENSE",
      occurredAt: { gte: start, lt: end },
    },
    select: { categoryId: true, amountMinor: true, reversesEntryId: true },
  });

  const spend = new Map<string, bigint>();
  for (const e of entries) {
    if (!e.categoryId) continue;
    const cur = spend.get(e.categoryId) ?? 0n;
    spend.set(e.categoryId, cur + e.amountMinor * sign(e.reversesEntryId));
  }
  return spend;
}

/** Total INCOME and EXPENSE for the month (reversals negated). */
export async function getMonthTotals(
  userId: string,
  month: MonthKey,
): Promise<{ incomeMinor: bigint; expenseMinor: bigint }> {
  const { start, end } = monthRange(month);
  const entries = await prisma.entry.findMany({
    where: {
      userId,
      type: { in: ["INCOME", "EXPENSE"] },
      occurredAt: { gte: start, lt: end },
    },
    select: { type: true, amountMinor: true, reversesEntryId: true },
  });

  let income = 0n;
  let expense = 0n;
  for (const e of entries) {
    const amt = e.amountMinor * sign(e.reversesEntryId);
    if (e.type === "INCOME") income += amt;
    else expense += amt;
  }
  return { incomeMinor: income, expenseMinor: expense };
}

export type CategorySummary = {
  categoryId: string;
  name: string;
  kind: string;
  limitMinor: bigint | null;
  spentMinor: bigint;
  remainingMinor: bigint | null;
  pct: number | null;
};

export type Summary = {
  month: MonthKey;
  accounts: AccountBalance[];
  netWorthMinor: bigint;
  incomeMinor: bigint;
  expenseMinor: bigint;
  overall: {
    limitMinor: bigint;
    spentMinor: bigint;
    remainingMinor: bigint;
    pct: number;
  };
  categories: CategorySummary[];
  savings: {
    targetMinor: bigint;
    currentMinor: bigint;
    pct: number;
  };
  biggestCategory: { name: string; spentMinor: bigint } | null;
};

/**
 * The `/api/summary` payload: balances, net worth, per-category spend vs budget,
 * and savings progress — all derived, for a given month.
 */
export async function getSummary(userId: string, month: MonthKey): Promise<Summary> {
  const [accounts, categories, budget, spendMap, totals] = await Promise.all([
    getAccountBalances(userId),
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.budget.findUnique({
      where: { userId_month: { userId, month } },
      include: { categoryBudgets: true },
    }),
    getCategorySpend(userId, month),
    getMonthTotals(userId, month),
  ]);

  const catLimit = new Map<string, bigint>();
  for (const cb of budget?.categoryBudgets ?? []) {
    catLimit.set(cb.categoryId, cb.limitMinor);
  }

  const categorySummaries: CategorySummary[] = categories.map((c) => {
    const spent = spendMap.get(c.id) ?? 0n;
    const limit = catLimit.get(c.id) ?? null;
    return {
      categoryId: c.id,
      name: c.name,
      kind: c.kind,
      limitMinor: limit,
      spentMinor: spent,
      remainingMinor: limit === null ? null : limit - spent,
      pct: limit === null ? null : usagePct(spent, limit),
    };
  });

  const overallLimit = budget?.overallLimitMinor ?? 0n;
  const overallSpent = totals.expenseMinor;

  const savingsAccount = accounts.find((a) => a.name === SAVINGS_ACCOUNT_NAME);
  const savingsCurrent = savingsAccount?.balanceMinor ?? 0n;
  const savingsTarget = budget?.savingsTargetMinor ?? 0n;

  // biggest expense category this month (positive spend only)
  let biggest: { name: string; spentMinor: bigint } | null = null;
  for (const c of categorySummaries) {
    if (c.kind !== "EXPENSE") continue;
    if (c.spentMinor > 0n && (!biggest || c.spentMinor > biggest.spentMinor)) {
      biggest = { name: c.name, spentMinor: c.spentMinor };
    }
  }

  return {
    month,
    accounts,
    netWorthMinor: accounts.reduce((s, a) => s + a.balanceMinor, 0n),
    incomeMinor: totals.incomeMinor,
    expenseMinor: totals.expenseMinor,
    overall: {
      limitMinor: overallLimit,
      spentMinor: overallSpent,
      remainingMinor: overallLimit - overallSpent,
      pct: usagePct(overallSpent, overallLimit),
    },
    categories: categorySummaries,
    savings: {
      targetMinor: savingsTarget,
      currentMinor: savingsCurrent,
      pct: usagePct(savingsCurrent, savingsTarget),
    },
    biggestCategory: biggest,
  };
}
