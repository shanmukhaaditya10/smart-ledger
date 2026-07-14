import { prisma } from "@/lib/db";
import { getCategorySpend, getMonthTotals } from "@/lib/ledger";
import { formatINR, usagePct } from "@/lib/money";
import { BUDGET_OVER_PCT, BUDGET_WARN_PCT } from "@/lib/constants";
import { monthKeyOf } from "@/lib/date";
import type { NotificationKind } from "@/generated/prisma/enums";

/**
 * Budget → notification loop (spec §6). After an EXPENSE is appended we recompute
 * the affected category's spend and the overall spend, then raise BUDGET_80 /
 * BUDGET_100 alerts. Each alert has a deterministic `dedupeKey` and the unique
 * constraint guarantees it fires at most once per month per scope — no spam,
 * even if the same threshold is re-crossed by later expenses.
 */

type Candidate = {
  kind: NotificationKind;
  dedupeKey: string;
  message: string;
};

function candidatesFor(
  scopeLabel: string,
  scopeKey: string, // "overall" or "cat:<id>"
  month: string,
  spent: bigint,
  limit: bigint,
): Candidate[] {
  if (limit <= 0n) return [];
  const pct = usagePct(spent, limit);
  // Fire only the HIGHEST threshold crossed for a scope, so a single expense
  // that jumps past both doesn't raise "80%" and "over 100%" at the same time.
  // (Crossing them at different times still produces both — different dedupeKeys.)
  if (pct >= BUDGET_OVER_PCT) {
    return [
      {
        kind: "BUDGET_100",
        dedupeKey: `budget100:${month}:${scopeKey}`,
        message: `You're over your ${scopeLabel} budget — ${formatINR(spent)} spent of ${formatINR(limit)}.`,
      },
    ];
  }
  if (pct >= BUDGET_WARN_PCT) {
    return [
      {
        kind: "BUDGET_80",
        dedupeKey: `budget80:${month}:${scopeKey}`,
        message: `You've used ${Math.round(pct)}% of your ${scopeLabel} budget (${formatINR(spent)} of ${formatINR(limit)}).`,
      },
    ];
  }
  return [];
}

/**
 * Recompute budgets for the month an entry occurred in and persist any newly
 * crossed alerts. Returns the notifications that were actually created (so the
 * caller can toast them). Safe to call repeatedly.
 */
export async function checkBudgets(
  userId: string,
  occurredAt: Date,
  categoryId: string | null,
): Promise<{ id: string; kind: NotificationKind; message: string }[]> {
  const month = monthKeyOf(occurredAt);

  const budget = await prisma.budget.findUnique({
    where: { userId_month: { userId, month } },
    include: { categoryBudgets: true, },
  });
  if (!budget) return [];

  const candidates: Candidate[] = [];

  // Overall
  const { expenseMinor } = await getMonthTotals(userId, month);
  candidates.push(
    ...candidatesFor("overall monthly", "overall", month, expenseMinor, budget.overallLimitMinor),
  );

  // Affected category (only if it has a per-category limit)
  if (categoryId) {
    const cb = budget.categoryBudgets.find((c) => c.categoryId === categoryId);
    if (cb) {
      const spendMap = await getCategorySpend(userId, month);
      const spent = spendMap.get(categoryId) ?? 0n;
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { name: true },
      });
      candidates.push(
        ...candidatesFor(category?.name ?? "category", `cat:${categoryId}`, month, spent, cb.limitMinor),
      );
    }
  }

  // Insert, relying on the unique dedupeKey to drop repeats.
  const created: { id: string; kind: NotificationKind; message: string }[] = [];
  for (const c of candidates) {
    try {
      const n = await prisma.notification.create({
        data: {
          userId,
          kind: c.kind,
          message: c.message,
          dedupeKey: c.dedupeKey,
        },
        select: { id: true, kind: true, message: true },
      });
      created.push(n);
    } catch (err: unknown) {
      // P2002 = unique violation = already alerted this month. Ignore.
      if (!isUniqueViolation(err)) throw err;
    }
  }
  return created;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
