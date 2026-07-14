import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { getAccountBalances } from "@/lib/ledger";
import { createEntry } from "@/lib/entries";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { json, errorResponse } from "@/lib/http";

// POST /api/accounts/:id/payoff — one-off "pay this account off in full".
// Computes the account's CURRENT debt server-side (no client-supplied amount, so
// it can't be stale) and appends a transfer from `fromAccountId` that brings it
// to exactly ₹0. This is the on-demand twin of the recurring PAYOFF rule.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/accounts/[id]/payoff">) {
  try {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const { fromAccountId } = z
      .object({ fromAccountId: z.string().cuid() })
      .parse(await request.json());

    if (fromAccountId === id) {
      throw new BadRequestError("Pick a different account to pay from");
    }

    // Use the FULL (all-time) balance — the same number shown on the dashboard —
    // so "Settle" clears it to exactly ₹0, not just the portion dated up to today.
    const balances = await getAccountBalances(userId);
    const target = balances.find((a) => a.id === id);
    if (!target) throw new NotFoundError("Account not found");

    if (target.balanceMinor >= 0n) {
      throw new BadRequestError(`${target.name} isn't in debt — nothing to pay off`);
    }

    const debt = -target.balanceMinor; // positive amount needed to reach ₹0
    const { entry } = await createEntry(userId, {
      type: "TRANSFER",
      amount: debt,
      fromAccountId,
      toAccountId: id,
      categoryId: null,
      note: `Paid off ${target.name}`,
      occurredAt: new Date(),
    });

    return json({ entry, amountMinor: debt }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
