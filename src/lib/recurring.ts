import { prisma } from "@/lib/db";
import {
  addMonths,
  monthKeyOf,
  monthsBetween,
  ruleDateInMonth,
  type MonthKey,
} from "@/lib/date";
import { checkBudgets } from "@/lib/budget";
import { getAccountBalanceAsOf } from "@/lib/ledger";
import type { CreatedNotification } from "@/lib/entries";
import type { RecurringRule } from "@/generated/prisma/client";

/**
 * Idempotent recurring materializer (spec §7). NO cron. On demand, for each
 * active rule, we generate any entries that should exist from the rule's start
 * up to `now`. Every generated entry gets a deterministic dedupeKey
 * `rule:{ruleId}:{YYYY-MM}`; the unique constraint on Entry.dedupeKey means
 * calling this twice can never double-insert.
 *
 * Each rule carries a `lastMaterializedMonth` cursor so a run resumes from the
 * first unsettled month instead of re-walking (and re-attempting inserts for)
 * every month since the rule began — O(new months) instead of O(rule age). The
 * dedupeKey unique constraint is still the correctness backstop; the cursor is
 * purely an optimization on top of it.
 *
 * Dynamic amounts (PAYOFF / SWEEP_SURPLUS) are sized from the account's live
 * balance AS OF the fire date, so the transfer reflects reality on payday and
 * back-fills past months correctly. To make that deterministic we process rules
 * in passes — FIXED first, then PAYOFF, then SWEEP — so that e.g. a salary
 * (fixed income) is already posted before a "sweep my surplus to savings" rule
 * reads the bank balance. If a computed amount is ≤ 0 (nothing owed / no
 * surplus) we simply post nothing for that month.
 */

export type RecurringRunResult = {
  createdCount: number;
  createdEntryIds: string[];
  notifications: CreatedNotification[];
};

function dedupeKeyFor(ruleId: string, month: MonthKey): string {
  return `rule:${ruleId}:${month}`;
}

/** Day-precision UTC floor so start/end comparisons ignore time-of-day. */
function dayFloor(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const MODE_PRIORITY: Record<string, number> = { FIXED: 0, PAYOFF: 1, SWEEP_SURPLUS: 2 };

/**
 * The amount this rule should transfer this month, or null to post nothing.
 * FIXED → the stored amount. PAYOFF → whatever the destination account owes
 * (its negative balance). SWEEP_SURPLUS → the source balance above the kept
 * threshold. Both dynamic amounts are read as of `fireDate`.
 */
async function effectiveAmount(
  userId: string,
  rule: RecurringRule,
  fireDate: Date,
): Promise<bigint | null> {
  if (rule.amountMode === "FIXED") {
    return rule.amountMinor > 0n ? rule.amountMinor : null;
  }

  if (rule.amountMode === "PAYOFF") {
    if (!rule.toAccountId) return null;
    const balance = await getAccountBalanceAsOf(userId, rule.toAccountId, fireDate);
    // Only pay off when the account is actually in the red.
    return balance < 0n ? -balance : null;
  }

  if (rule.amountMode === "SWEEP_SURPLUS") {
    if (!rule.fromAccountId) return null;
    const balance = await getAccountBalanceAsOf(userId, rule.fromAccountId, fireDate);
    const surplus = balance - (rule.thresholdMinor ?? 0n);
    return surplus > 0n ? surplus : null;
  }

  return null;
}

export async function runRecurring(
  userId: string,
  now: Date = new Date(),
): Promise<RecurringRunResult> {
  const rules = await prisma.recurringRule.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: "asc" },
  });
  // Stable sort into passes: FIXED, then PAYOFF, then SWEEP_SURPLUS.
  rules.sort((a, b) => (MODE_PRIORITY[a.amountMode] ?? 0) - (MODE_PRIORITY[b.amountMode] ?? 0));

  const nowFloor = dayFloor(now);
  const currentMonth = monthKeyOf(now);
  const createdEntryIds: string[] = [];
  const notifications: CreatedNotification[] = [];

  for (const rule of rules) {
    const startFloor = dayFloor(rule.startDate);
    const endFloor = rule.endDate ? dayFloor(rule.endDate) : null;

    const startMonth = monthKeyOf(rule.startDate);
    // Resume from the month after the cursor (the last fully-settled month we
    // already accounted for), never earlier than the rule's start. This avoids
    // re-attempting inserts for every past month on every run. We ALWAYS
    // re-scan the current month, because a dynamic (payoff/sweep) amount there
    // can still change as the month's spending lands.
    const resumeFrom = rule.lastMaterializedMonth
      ? addMonths(rule.lastMaterializedMonth, 1)
      : startMonth;
    const firstMonth = resumeFrom > startMonth ? resumeFrom : startMonth;

    for (const month of monthsBetween(firstMonth, currentMonth)) {
      const fireDate = ruleDateInMonth(month, rule.dayOfMonth);
      const fireFloor = dayFloor(fireDate);

      // Must be on/after start, on/before today, and on/before end (if set).
      if (fireFloor < startFloor) continue;
      if (fireFloor > nowFloor) continue;
      if (endFloor !== null && fireFloor > endFloor) continue;

      const amount = await effectiveAmount(userId, rule, fireDate);
      if (amount == null || amount <= 0n) continue; // nothing to post this month

      const dedupeKey = dedupeKeyFor(rule.id, month);
      try {
        const entry = await prisma.entry.create({
          data: {
            userId,
            type: rule.type,
            amountMinor: amount,
            fromAccountId: rule.fromAccountId,
            toAccountId: rule.toAccountId,
            categoryId: rule.type === "TRANSFER" ? null : rule.categoryId,
            note: rule.note ?? null,
            occurredAt: fireDate,
            recurringRuleId: rule.id,
            dedupeKey,
          },
        });
        createdEntryIds.push(entry.id);

        if (entry.type === "EXPENSE") {
          const ns = await checkBudgets(userId, entry.occurredAt, entry.categoryId);
          notifications.push(...ns);
        }
      } catch (err: unknown) {
        // Already materialized this month → unique violation → skip. Idempotent.
        if (!isUniqueViolation(err)) throw err;
      }
    }

    // Advance the cursor to the last fully-elapsed month (everything before the
    // current month is now settled for this rule). Forward-only, and only once a
    // full month has elapsed since the rule started. The current month is left
    // out of the cursor so it's always re-scanned next run.
    const settled = addMonths(currentMonth, -1);
    if (settled >= startMonth && settled > (rule.lastMaterializedMonth ?? "")) {
      await prisma.recurringRule.update({
        where: { id: rule.id },
        data: { lastMaterializedMonth: settled },
      });
    }
  }

  return {
    createdCount: createdEntryIds.length,
    createdEntryIds,
    notifications,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
