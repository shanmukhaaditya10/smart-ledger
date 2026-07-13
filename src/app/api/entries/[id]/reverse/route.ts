import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { reverseEntry } from "@/lib/entries";
import { json, errorResponse } from "@/lib/http";

// POST /api/entries/:id/reverse — append a reversing entry. This is our
// "delete/edit": the original is never mutated.
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/entries/[id]/reverse">) {
  try {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const reversal = await reverseEntry(userId, id);
    return json({ reversal }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
