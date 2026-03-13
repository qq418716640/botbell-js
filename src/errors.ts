/** Base exception for BotBell SDK. */
export class BotBellError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "BotBellError";
    this.code = code;
  }
}

/** Invalid or expired token (40001). */
export class AuthenticationError extends BotBellError {
  constructor(message: string, code?: number) {
    super(message, code);
    this.name = "AuthenticationError";
  }
}

/** Insufficient permissions (40003). */
export class ForbiddenError extends BotBellError {
  constructor(message: string, code?: number) {
    super(message, code);
    this.name = "ForbiddenError";
  }
}

/** Resource not found (40004). */
export class NotFoundError extends BotBellError {
  constructor(message: string, code?: number) {
    super(message, code);
    this.name = "NotFoundError";
  }
}

/** Parameter validation failed (40010). */
export class ValidationError extends BotBellError {
  constructor(message: string, code?: number) {
    super(message, code);
    this.name = "ValidationError";
  }
}

/** Rate limit exceeded (40029). */
export class RateLimitError extends BotBellError {
  readonly retryAfter: number | undefined;

  constructor(message: string, code?: number, retryAfter?: number) {
    super(message, code ?? 40029);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/** Monthly message quota exhausted (40030). */
export class QuotaExceededError extends BotBellError {
  constructor(message: string, code?: number) {
    super(message, code);
    this.name = "QuotaExceededError";
  }
}

/** Bot is paused (40033). */
export class BotPausedError extends BotBellError {
  constructor(message: string, code?: number) {
    super(message, code);
    this.name = "BotPausedError";
  }
}

/** Server-side error (50000). */
export class ServerError extends BotBellError {
  constructor(message: string, code?: number) {
    super(message, code);
    this.name = "ServerError";
  }
}

const ERROR_MAP: Record<number, new (message: string, code?: number) => BotBellError> = {
  40001: AuthenticationError,
  40003: ForbiddenError,
  40004: NotFoundError,
  40010: ValidationError,
  40029: RateLimitError,
  40030: QuotaExceededError,
  40033: BotPausedError,
  50000: ServerError,
};

/** Throw the appropriate exception for an error code. */
export function throwForError(code: number, message: string, cause?: Error): never {
  const ErrorClass = ERROR_MAP[code] ?? BotBellError;
  const err = new ErrorClass(message, code);
  if (cause) err.cause = cause;
  throw err;
}
