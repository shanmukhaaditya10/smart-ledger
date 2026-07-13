import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { recurringRuleSchema } from "@/lib/validation";
import { createRecurringRule, listRecurringRules } from "@/lib/recurring-crud";
import { json, errorResponse } from "@/lib/http";

// GET /api/recurring — list rules with usage counts.
export async function GET() {
  try {
    const userId = await requireUserId();
    const rules = await listRecurringRules(userId);
    return json({ rules });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/recurring — create a rule.
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = recurringRuleSchema.parse(body);
    const rule = await createRecurringRule(userId, {
      type: input.type,
      amount: input.amount,
      categoryId: input.categoryId ?? null,
      fromAccountId: input.fromAccountId ?? null,
      toAccountId: input.toAccountId ?? null,
      note: input.note ?? null,
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      active: input.active,
    });
    return json({ rule }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
