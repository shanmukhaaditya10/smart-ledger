import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { json, errorResponse, notFound } from "@/lib/http";

// POST /api/notifications/:id/read — mark one notification read.
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/notifications/[id]/read">) {
  try {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const res = await prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    if (res.count === 0) return notFound("Notification not found");
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
