import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { json, errorResponse } from "@/lib/http";

// GET /api/meta — accounts + categories for building forms.
export async function GET() {
  try {
    const userId = await requireUserId();
    const [accounts, categories] = await Promise.all([
      prisma.account.findMany({ where: { userId }, orderBy: { name: "asc" } }),
      prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    ]);
    return json({ accounts, categories });
  } catch (err) {
    return errorResponse(err);
  }
}
