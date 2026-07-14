import { prisma } from "@/lib/db";
import type { CreateEntryInput } from "@/lib/validation";
import { checkBudgets } from "@/lib/budget";
import { NotFoundError, ConflictError } from "@/lib/errors";
import type { NotificationKind } from "@/generated/prisma/enums";

/**
 * Entry service. The ONLY place entries are appended. Enforces that referenced
 * accounts/categories belong to the user, then writes an immutable Entry row.
 * There is deliberately no update/delete — corrections go through `reverseEntry`.
 */

export type CreatedNotification = { id: string; kind: NotificationKind; message: string };

async function assertOwnedAccounts(userId: string, ids: (string | null | undefined)[]) {
  const wanted = ids.filter((x): x is string => !!x);
  if (wanted.length === 0) return;
  const found = await prisma.account.count({
    where: { userId, id: { in: wanted } },
  });
  if (found !== new Set(wanted).size) {
    throw new NotFoundError("Account not found");
  }
}

async function assertOwnedCategory(userId: string, id: string | null | undefined) {
  if (!id) return;
  const found = await prisma.category.count({ where: { userId, id } });
  if (found === 0) throw new NotFoundError("Category not found");
}

export async function createEntry(userId: string, input: CreateEntryInput) {
  await assertOwnedAccounts(userId, [input.fromAccountId, input.toAccountId]);
  // categoryId is ignored for transfers
  const categoryId = input.type === "TRANSFER" ? null : input.categoryId ?? null;
  await assertOwnedCategory(userId, categoryId);

  const entry = await prisma.entry.create({
    data: {
      userId,
      type: input.type,
      amountMinor: input.amount, // already bigint paise from Zod transform
      fromAccountId: input.type === "INCOME" ? null : input.fromAccountId ?? null,
      toAccountId: input.type === "EXPENSE" ? null : input.toAccountId ?? null,
      categoryId,
      note: input.note ?? null,
      occurredAt: input.occurredAt,
    },
  });

  // Budget loop only matters for expenses.
  let notifications: CreatedNotification[] = [];
  if (entry.type === "EXPENSE") {
    notifications = await checkBudgets(userId, entry.occurredAt, entry.categoryId);
  }

  return { entry, notifications };
}

/**
 * Append a reversing entry that negates `entryId`. This is our "delete/edit":
 * the original row is never touched. The reversal mirrors the original's shape
 * (same accounts/amount/category) and shares its `occurredAt` so it nets out in
 * the same month for budgets and balances.
 */
export async function reverseEntry(userId: string, entryId: string) {
  const original = await prisma.entry.findFirst({
    where: { id: entryId, userId },
  });
  if (!original) throw new NotFoundError("Entry not found");
  if (original.reversesEntryId) {
    throw new ConflictError("Cannot reverse a reversing entry");
  }

  const already = await prisma.entry.findFirst({
    where: { reversesEntryId: entryId },
    select: { id: true },
  });
  if (already) throw new ConflictError("Entry already reversed");

  const reversal = await prisma.entry.create({
    data: {
      userId,
      type: original.type,
      amountMinor: original.amountMinor,
      fromAccountId: original.fromAccountId,
      toAccountId: original.toAccountId,
      categoryId: original.categoryId,
      note: original.note ? `Reversal of: ${original.note}` : "Reversal",
      occurredAt: original.occurredAt,
      reversesEntryId: original.id,
    },
  });

  return reversal;
}
