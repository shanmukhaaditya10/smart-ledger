import { prisma } from "@/lib/db";
import type { MonthKey } from "@/lib/date";

/**
 * Read/write the editable preferences for a month: the overall limit, savings
 * target, and per-category budgets. These live in Budget / CategoryBudget and
 * are upserted (one Budget per user per month).
 */

export type CategoryBudgetInput = { categoryId: string; limit: bigint };

export async function upsertPreferences(
  userId: string,
  month: MonthKey,
  data: {
    overallLimit: bigint;
    savingsTarget: bigint;
    categoryBudgets: CategoryBudgetInput[];
  },
) {
  // Only allow category budgets for categories the user owns.
  const owned = await prisma.category.findMany({
    where: { userId, id: { in: data.categoryBudgets.map((c) => c.categoryId) } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((c) => c.id));

  return prisma.$transaction(async (tx) => {
    const budget = await tx.budget.upsert({
      where: { userId_month: { userId, month } },
      create: {
        userId,
        month,
        overallLimitMinor: data.overallLimit,
        savingsTargetMinor: data.savingsTarget,
      },
      update: {
        overallLimitMinor: data.overallLimit,
        savingsTargetMinor: data.savingsTarget,
      },
    });

    for (const cb of data.categoryBudgets) {
      if (!ownedIds.has(cb.categoryId)) continue;
      await tx.categoryBudget.upsert({
        where: {
          budgetId_categoryId: { budgetId: budget.id, categoryId: cb.categoryId },
        },
        create: {
          budgetId: budget.id,
          categoryId: cb.categoryId,
          limitMinor: cb.limit,
        },
        update: { limitMinor: cb.limit },
      });
    }

    return tx.budget.findUnique({
      where: { id: budget.id },
      include: { categoryBudgets: true },
    });
  });
}

export async function getPreferences(userId: string, month: MonthKey) {
  const [budget, accounts, categories] = await Promise.all([
    prisma.budget.findUnique({
      where: { userId_month: { userId, month } },
      include: { categoryBudgets: true },
    }),
    prisma.account.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  return { budget, accounts, categories };
}
