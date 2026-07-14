import { prisma } from "@/lib/db";
import type { EntryType, AmountMode } from "@/generated/prisma/enums";

/**
 * CRUD for RecurringRule. Rules are configuration, not ledger entries, so they
 * may be edited/deleted freely — the immutable entries they've already
 * generated are left untouched (we just detach them).
 */

export type RuleInput = {
  type: EntryType;
  amountMode?: AmountMode; // default FIXED
  amount: bigint | null; // required for FIXED, ignored for dynamic modes
  threshold?: bigint | null; // SWEEP_SURPLUS: balance to keep in the source
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  note: string | null;
  dayOfMonth: number;
  startDate: Date;
  endDate: Date | null;
  active: boolean;
};

function toData(userId: string, input: RuleInput) {
  const mode: AmountMode = input.amountMode ?? "FIXED";
  // Dynamic modes (payoff / sweep) are always transfers between two accounts.
  const effectiveType: EntryType = mode === "FIXED" ? input.type : "TRANSFER";
  return {
    userId,
    type: effectiveType,
    amountMode: mode,
    amountMinor: mode === "FIXED" ? input.amount ?? 0n : 0n,
    thresholdMinor: mode === "SWEEP_SURPLUS" ? input.threshold ?? 0n : null,
    categoryId: effectiveType === "TRANSFER" ? null : input.categoryId,
    fromAccountId: effectiveType === "INCOME" ? null : input.fromAccountId,
    toAccountId: effectiveType === "EXPENSE" ? null : input.toAccountId,
    note: input.note,
    dayOfMonth: input.dayOfMonth,
    startDate: input.startDate,
    endDate: input.endDate,
    active: input.active,
  };
}

export async function createRecurringRule(userId: string, input: RuleInput) {
  return prisma.recurringRule.create({ data: toData(userId, input) });
}

// Backwards-compatible alias used by the "make this recurring" entry toggle.
export const upsertRecurringRule = createRecurringRule;

export async function updateRecurringRule(userId: string, id: string, input: RuleInput) {
  const existing = await prisma.recurringRule.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Rule not found");
  return prisma.recurringRule.update({
    where: { id },
    data: toData(userId, input),
  });
}

export async function setRuleActive(userId: string, id: string, active: boolean) {
  const existing = await prisma.recurringRule.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Rule not found");
  return prisma.recurringRule.update({ where: { id }, data: { active } });
}

export async function deleteRecurringRule(userId: string, id: string) {
  const existing = await prisma.recurringRule.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Rule not found");
  return prisma.$transaction(async (tx) => {
    // Detach already-generated (immutable) entries, then remove the rule.
    await tx.entry.updateMany({
      where: { recurringRuleId: id },
      data: { recurringRuleId: null },
    });
    await tx.recurringRule.delete({ where: { id } });
  });
}

export async function listRecurringRules(userId: string) {
  return prisma.recurringRule.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { id: true, name: true } },
      fromAccount: { select: { id: true, name: true } },
      toAccount: { select: { id: true, name: true } },
      _count: { select: { entries: true } },
    },
  });
}
