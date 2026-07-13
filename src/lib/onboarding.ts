import { prisma } from "@/lib/db";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "@/lib/constants";
import { monthRange, type MonthKey } from "@/lib/date";

/**
 * Seed the fixed default accounts and categories for a user. Idempotent: the
 * unique [userId, name] constraints + skipDuplicates mean re-running is a no-op.
 */
export async function seedUserDefaults(userId: string): Promise<void> {
  await prisma.account.createMany({
    data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, userId })),
    skipDuplicates: true,
  });
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })),
    skipDuplicates: true,
  });
}

/** Create the user (if new) and seed their defaults. Returns the user. */
export async function createOrGetUser(name: string, email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await seedUserDefaults(existing.id);
    return { user: existing, created: false };
  }
  const user = await prisma.user.create({ data: { name, email } });
  await seedUserDefaults(user.id);
  return { user, created: true };
}

/**
 * Seed the salary the user entered during onboarding as a REAL income Entry so
 * the ledger reconciles (spec §10). Idempotent via a `salary:{month}` dedupeKey
 * so re-submitting onboarding won't double the salary. Returns the entry id, or
 * null if salary is 0 or no destination account exists.
 */
export async function seedSalaryEntry(
  userId: string,
  month: MonthKey,
  amountMinor: bigint,
  accountId?: string | null,
): Promise<string | null> {
  if (amountMinor <= 0n) return null;

  const account = accountId
    ? await prisma.account.findFirst({ where: { id: accountId, userId } })
    : (await prisma.account.findFirst({ where: { userId, type: "BANK" } })) ??
      (await prisma.account.findFirst({ where: { userId } }));
  if (!account) return null;

  const salaryCategory = await prisma.category.findFirst({
    where: { userId, name: "Salary" },
  });

  const { start } = monthRange(month);
  const dedupeKey = `salary:${userId}:${month}`;

  try {
    const entry = await prisma.entry.create({
      data: {
        userId,
        type: "INCOME",
        amountMinor,
        toAccountId: account.id,
        categoryId: salaryCategory?.id ?? null,
        note: "Monthly salary",
        occurredAt: start,
        dedupeKey,
      },
    });
    return entry.id;
  } catch (err: unknown) {
    // Already seeded this month.
    if (typeof err === "object" && err && "code" in err && (err as { code?: string }).code === "P2002") {
      return null;
    }
    throw err;
  }
}
