import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { preferencesSchema } from "@/lib/validation";
import { getPreferences, upsertPreferences } from "@/lib/preferences";
import { currentMonthKey, isMonthKey } from "@/lib/date";
import { json, errorResponse } from "@/lib/http";

// GET /api/preferences?month=YYYY-MM — budget, category budgets, accounts, categories.
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const monthParam = request.nextUrl.searchParams.get("month");
    const month = monthParam && isMonthKey(monthParam) ? monthParam : currentMonthKey();
    const prefs = await getPreferences(userId, month);
    return json({ month, ...prefs });
  } catch (err) {
    return errorResponse(err);
  }
}

// PUT /api/preferences — update overall limit, savings target, per-category budgets.
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = preferencesSchema.parse(body);
    const budget = await upsertPreferences(userId, input.month, {
      overallLimit: input.overallLimit,
      savingsTarget: input.savingsTarget,
      categoryBudgets: input.categoryBudgets.map((c) => ({
        categoryId: c.categoryId,
        limit: c.limit,
      })),
    });
    return json({ budget });
  } catch (err) {
    return errorResponse(err);
  }
}
