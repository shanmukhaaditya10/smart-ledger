import { clearCurrentUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/http";

// POST /api/logout — clear the session cookie. Single-user demo: this just
// forgets which user this browser is scoped to; their data is left intact.
export async function POST() {
  try {
    await clearCurrentUser();
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
