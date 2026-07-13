import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { json, errorResponse } from "@/lib/http";

// POST /api/notifications/read-all — mark all of the user's notifications read.
export async function POST() {
  try {
    const userId = await requireUserId();
    const res = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return json({ updated: res.count });
  } catch (err) {
    return errorResponse(err);
  }
}
