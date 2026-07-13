import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { onboardingSchema } from "@/lib/validation";
import { upsertPreferences } from "@/lib/preferences";
import { seedSalaryEntry } from "@/lib/onboarding";
import { json, errorResponse } from "@/lib/http";

// POST /api/onboarding — save budget preferences AND seed the salary as a real
// INCOME entry so the ledger reconciles. Idempotent on the salary.
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const input = onboardingSchema.parse(await request.json());

    await upsertPreferences(userId, input.month, {
      overallLimit: input.overallLimit,
      savingsTarget: input.savingsTarget,
      categoryBudgets: input.categoryBudgets.map((c) => ({
        categoryId: c.categoryId,
        limit: c.limit,
      })),
    });

    const salaryEntryId = await seedSalaryEntry(
      userId,
      input.month,
      input.monthlySalary,
      input.salaryAccountId ?? null,
    );

    return json({ ok: true, salaryEntryId });
  } catch (err) {
    return errorResponse(err);
  }
}
