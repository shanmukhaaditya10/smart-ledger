import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { createEntrySchema } from "@/lib/validation";
import { createEntry } from "@/lib/entries";
import { upsertRecurringRule } from "@/lib/recurring-crud";
import { monthRange, isMonthKey } from "@/lib/date";
import { json, errorResponse } from "@/lib/http";
import type { Prisma } from "@/generated/prisma/client";

// POST /api/entries — append an income/expense/transfer. Runs the budget check
// and optionally creates a recurring rule ("make this recurring").
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = createEntrySchema.parse(body);

    const { entry, notifications } = await createEntry(userId, input);

    let recurringRuleId: string | null = null;
    if (input.recurring) {
      const rule = await upsertRecurringRule(userId, {
        type: input.type,
        amount: input.amount,
        categoryId: input.categoryId ?? null,
        fromAccountId: input.fromAccountId ?? null,
        toAccountId: input.toAccountId ?? null,
        note: input.note ?? null,
        dayOfMonth: input.recurring.dayOfMonth,
        startDate: input.occurredAt,
        endDate: input.recurring.endDate ?? null,
        active: true,
      });
      recurringRuleId = rule.id;
    }

    return json({ entry, notifications, recurringRuleId }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/entries?month=&categoryId=&type=&page=&pageSize= — filtered, paginated.
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const sp = request.nextUrl.searchParams;

    const where: Prisma.EntryWhereInput = { userId };

    const month = sp.get("month");
    if (month && isMonthKey(month)) {
      const { start, end } = monthRange(month);
      where.occurredAt = { gte: start, lt: end };
    }

    const type = sp.get("type");
    if (type === "INCOME" || type === "EXPENSE" || type === "TRANSFER") {
      where.type = type;
    }

    const categoryId = sp.get("categoryId");
    if (categoryId) where.categoryId = categoryId;

    const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? "20") || 20));

    const [total, entries] = await Promise.all([
      prisma.entry.count({ where }),
      prisma.entry.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { id: true, name: true, kind: true } },
          fromAccount: { select: { id: true, name: true, type: true } },
          toAccount: { select: { id: true, name: true, type: true } },
          reversedBy: { select: { id: true } },
        },
      }),
    ]);

    return json({
      entries,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
