import { prisma } from "@/lib/db";
import {
  monthKeyOf,
  monthsBetween,
  ruleDateInMonth,
  type MonthKey,
} from "@/lib/date";
import { checkBudgets } from "@/lib/budget";
import type { CreatedNotification } from "@/lib/entries";

/**
 * Idempotent recurring materializer (spec §7). NO cron. On demand, for each
 * active rule, we generate any entries that should exist from the rule's start
 * up to `now`. Every generated entry gets a deterministic dedupeKey
 * `rule:{ruleId}:{YYYY-MM}`; the unique constraint on Entry.dedupeKey means
 * calling this twice can never double-insert.
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

export async function runRecurring(
  userId: string,
  now: Date = new Date(),
): Promise<RecurringRunResult> {
  const rules = await prisma.recurringRule.findMany({
    where: { userId, active: true },
  });

  const nowFloor = dayFloor(now);
  const createdEntryIds: string[] = [];
  const notifications: CreatedNotification[] = [];

  for (const rule of rules) {
    const startFloor = dayFloor(rule.startDate);
    const endFloor = rule.endDate ? dayFloor(rule.endDate) : null;

    const firstMonth = monthKeyOf(rule.startDate);
    const lastMonth = monthKeyOf(now);

    for (const month of monthsBetween(firstMonth, lastMonth)) {
      const fireDate = ruleDateInMonth(month, rule.dayOfMonth);
      const fireFloor = dayFloor(fireDate);

      // Must be on/after start, on/before today, and on/before end (if set).
      if (fireFloor < startFloor) continue;
      if (fireFloor > nowFloor) continue;
      if (endFloor !== null && fireFloor > endFloor) continue;

      const dedupeKey = dedupeKeyFor(rule.id, month);
      try {
        const entry = await prisma.entry.create({
          data: {
            userId,
            type: rule.type,
            amountMinor: rule.amountMinor,
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
