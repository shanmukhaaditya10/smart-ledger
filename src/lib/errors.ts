/**
 * Typed domain errors. Services throw these so route handlers can map them to
 * the right HTTP status without every handler re-deriving it. Anything that
 * isn't an AppError is treated as an unexpected 500 (its message is NOT sent to
 * the client — see http.ts).
 */

type AppErrorOptions = {
  status?: number;
  code?: string;
  /** Safe to show the message to the client? Domain errors: yes. */
  expose?: boolean;
  details?: unknown;
};

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.status = opts.status ?? 400;
    this.code = opts.code ?? "bad_request";
    this.expose = opts.expose ?? true;
    this.details = opts.details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, { status: 400, code: "bad_request", details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated") {
    super(message, { status: 401, code: "unauthorized" });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, { status: 404, code: "not_found" });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, { status: 409, code: "conflict" });
  }
}
