import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { recurringRuleSchema } from "@/lib/validation";
import {
  updateRecurringRule,
  deleteRecurringRule,
  setRuleActive,
} from "@/lib/recurring-crud";
import { json, errorResponse } from "@/lib/http";

// PUT /api/recurring/:id — edit a rule.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/recurring/[id]">) {
  try {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const input = recurringRuleSchema.parse(await request.json());
    const rule = await updateRecurringRule(userId, id, {
      type: input.type,
      amountMode: input.amountMode,
      amount: input.amount,
      threshold: input.threshold,
      categoryId: input.categoryId ?? null,
      fromAccountId: input.fromAccountId ?? null,
      toAccountId: input.toAccountId ?? null,
      note: input.note ?? null,
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      active: input.active,
    });
    return json({ rule });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/recurring/:id — toggle active.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/recurring/[id]">) {
  try {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const { active } = z.object({ active: z.boolean() }).parse(await request.json());
    const rule = await setRuleActive(userId, id, active);
    return json({ rule });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/recurring/:id — remove a rule (detaches generated entries).
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/recurring/[id]">) {
  try {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await deleteRecurringRule(userId, id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
