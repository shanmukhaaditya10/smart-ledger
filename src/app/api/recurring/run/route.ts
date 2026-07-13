import { requireUserId } from "@/lib/session";
import { runRecurring } from "@/lib/recurring";
import { json, errorResponse } from "@/lib/http";

// POST /api/recurring/run — materialize any due recurring entries up to today.
// Idempotent: safe to call on every app load. The deterministic dedupeKey +
// unique constraint guarantee each logical entry is created at most once.
export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await runRecurring(userId);
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
