import { createHmac, timingSafeEqual } from "node:crypto";

/** Raised when webhook signature verification fails. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export interface VerifyWebhookOptions {
  /** Raw request body (string or Buffer). */
  body: string | Buffer;
  /** Value of X-Webhook-Signature header. */
  signature: string;
  /** Value of X-Webhook-Timestamp header. */
  timestamp: string;
  /** Your bot's webhook secret. */
  secret: string;
  /** Max allowed age in seconds (default 300 = 5 min). */
  tolerance?: number;
}

/**
 * Verify a BotBell webhook signature.
 *
 * @throws {WebhookVerificationError} If signature is invalid or timestamp expired.
 */
export function verifyWebhook(options: VerifyWebhookOptions): void {
  const { body, signature, timestamp, secret, tolerance = 300 } = options;

  // Validate timestamp
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    throw new WebhookVerificationError("Invalid timestamp header");
  }

  if (Math.abs(Date.now() / 1000 - ts) > tolerance) {
    throw new WebhookVerificationError("Timestamp outside tolerance window");
  }

  // Compute expected signature
  const bodyStr = typeof body === "string" ? body : body.toString("utf-8");
  const payload = `${ts}.${bodyStr}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  // Parse "sha256=..." from header
  const sig = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  // Constant-time comparison
  const sigBuf = Buffer.from(sig, "utf-8");
  const expectedBuf = Buffer.from(expected, "utf-8");

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new WebhookVerificationError("Signature mismatch");
  }
}
