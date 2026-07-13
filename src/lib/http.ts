import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * BigInt-safe JSON response. `JSON.stringify` throws on bigint, so we serialize
 * with a replacer that renders bigint as a decimal string. Money therefore
 * travels over the wire as a string of paise; the client re-parses with
 * `BigInt(...)` before formatting.
 */
export function json(data: unknown, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  return new NextResponse(body, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export function badRequest(message: string, details?: unknown): NextResponse {
  return json({ error: message, details }, { status: 400 });
}

export function notFound(message = "Not found"): NextResponse {
  return json({ error: message }, { status: 404 });
}

export function unauthorized(message = "No user"): NextResponse {
  return json({ error: message }, { status: 401 });
}

/** Turn a thrown error (Zod or otherwise) into a 400/500 response. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return json(
      { error: "Validation failed", details: err.flatten() },
      { status: 400 },
    );
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[api error]", err);
  return json({ error: message }, { status: 400 });
}
