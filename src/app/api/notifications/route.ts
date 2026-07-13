import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { json, errorResponse } from "@/lib/http";

// GET /api/notifications?unread=1 — list notifications, newest first.
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId, ...(unreadOnly ? { read: false } : {}) },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return json({ notifications, unreadCount });
  } catch (err) {
    return errorResponse(err);
  }
}
