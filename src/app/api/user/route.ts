import type { NextRequest } from "next/server";
import { createUserSchema } from "@/lib/validation";
import { createOrGetUser } from "@/lib/onboarding";
import { setCurrentUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/http";

// POST /api/user — first-open: create or fetch a user by email, seed their
// default accounts + categories, and set the session cookie.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email } = createUserSchema.parse(body);
    const { user, created } = await createOrGetUser(name, email);
    await setCurrentUser(user.id);
    return json({ user, created }, { status: created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
