import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { currentMonthKey } from "@/lib/date";
import { json, errorResponse } from "@/lib/http";

// GET /api/me — current user + whether they've set a budget for this month
// (drives the "needs onboarding?" decision in the shell).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ user: null });

    const month = currentMonthKey();
    const budget = await prisma.budget.findUnique({
      where: { userId_month: { userId: user.id, month } },
      select: { id: true },
    });
    const entryCount = await prisma.entry.count({ where: { userId: user.id } });

    return json({
      user,
      month,
      hasBudget: Boolean(budget),
      hasEntries: entryCount > 0,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
