import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getSummary } from "@/lib/ledger";
import { currentMonthKey, isMonthKey } from "@/lib/date";
import { json, errorResponse } from "@/lib/http";

// GET /api/summary?month=YYYY-MM — balances, net worth, per-category spend vs
// budget, savings progress. All derived from the ledger.
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const monthParam = request.nextUrl.searchParams.get("month");
    const month = monthParam && isMonthKey(monthParam) ? monthParam : currentMonthKey();
    const summary = await getSummary(userId, month);
    return json(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
