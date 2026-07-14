import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

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

export function notFound(message = "Not found"): NextResponse {
  return json({ error: message, code: "not_found" }, { status: 404 });
}

/** A Prisma "known request error" duck-typed (avoids coupling to the client). */
function prismaErrorCode(err: unknown): string | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("P")
  ) {
    return (err as { code: string }).code;
  }
  return null;
}

/**
 * Map any thrown value to a JSON error response with the right status.
 * The response shape is stable: `{ error: string, code: string, details? }`.
 *
 * - ZodError            → 400 validation_error (+ field details)
 * - AppError            → its own status/code/message
 * - Prisma P2002/P2025  → 409 / 404
 * - anything else       → 500 with a GENERIC message (internals never leak);
 *                          the real error is logged server-side with a ref.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return json(
      { error: "Validation failed", code: "validation_error", details: err.flatten() },
      { status: 400 },
    );
  }

  if (err instanceof AppError) {
    return json(
      {
        error: err.expose ? err.message : "Request failed",
        code: err.code,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
      { status: err.status },
    );
  }

  const pcode = prismaErrorCode(err);
  if (pcode === "P2002") {
    return json({ error: "That already exists", code: "conflict" }, { status: 409 });
  }
  if (pcode === "P2025") {
    return json({ error: "Not found", code: "not_found" }, { status: 404 });
  }

  // Unexpected: log the full error with a correlation ref, return a generic 500.
  const ref = Math.random().toString(36).slice(2, 10);
  console.error(`[api error ref=${ref}]`, err);
  return json(
    { error: "Something went wrong", code: "internal_error", ref },
    { status: 500 },
  );
}
