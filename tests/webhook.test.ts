import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WebhookVerificationError, verifyWebhook } from "../src/webhook.js";

const SECRET = "whsec_test_secret_123";

function sign(body: string, ts: number, secret = SECRET): string {
  const payload = `${ts}.${body}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${sig}`;
}

describe("verifyWebhook", () => {
  it("accepts valid signature", () => {
    const body = '{"reply_id":"r_1","message":"Yes"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(body, ts);

    expect(() =>
      verifyWebhook({ body, signature: sig, timestamp: String(ts), secret: SECRET }),
    ).not.toThrow();
  });

  it("accepts Buffer body", () => {
    const body = '{"reply_id":"r_1","message":"Yes"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(body, ts);

    expect(() =>
      verifyWebhook({
        body: Buffer.from(body),
        signature: sig,
        timestamp: String(ts),
        secret: SECRET,
      }),
    ).not.toThrow();
  });

  it("rejects invalid signature", () => {
    const body = '{"reply_id":"r_1"}';
    const ts = Math.floor(Date.now() / 1000);

    expect(() =>
      verifyWebhook({
        body,
        signature: "sha256=invalid_hex",
        timestamp: String(ts),
        secret: SECRET,
      }),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects wrong secret", () => {
    const body = '{"reply_id":"r_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(body, ts, "wrong_secret");

    expect(() =>
      verifyWebhook({ body, signature: sig, timestamp: String(ts), secret: SECRET }),
    ).toThrow("Signature mismatch");
  });

  it("rejects tampered body", () => {
    const body = '{"reply_id":"r_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(body, ts);

    expect(() =>
      verifyWebhook({
        body: '{"reply_id":"r_TAMPERED"}',
        signature: sig,
        timestamp: String(ts),
        secret: SECRET,
      }),
    ).toThrow("Signature mismatch");
  });

  it("rejects expired timestamp", () => {
    const body = '{"reply_id":"r_1"}';
    const ts = Math.floor(Date.now() / 1000) - 600;
    const sig = sign(body, ts);

    expect(() =>
      verifyWebhook({ body, signature: sig, timestamp: String(ts), secret: SECRET }),
    ).toThrow("Timestamp outside tolerance");
  });

  it("rejects future timestamp", () => {
    const body = '{"reply_id":"r_1"}';
    const ts = Math.floor(Date.now() / 1000) + 600;
    const sig = sign(body, ts);

    expect(() =>
      verifyWebhook({ body, signature: sig, timestamp: String(ts), secret: SECRET }),
    ).toThrow("Timestamp outside tolerance");
  });

  it("rejects invalid timestamp", () => {
    expect(() =>
      verifyWebhook({
        body: "{}",
        signature: "sha256=abc",
        timestamp: "not_a_number",
        secret: SECRET,
      }),
    ).toThrow("Invalid timestamp");
  });

  it("respects custom tolerance", () => {
    const body = '{"reply_id":"r_1"}';
    const ts = Math.floor(Date.now() / 1000) - 10;
    const sig = sign(body, ts);

    // Should fail with 5-second tolerance
    expect(() =>
      verifyWebhook({ body, signature: sig, timestamp: String(ts), secret: SECRET, tolerance: 5 }),
    ).toThrow("Timestamp outside tolerance");

    // Should pass with 30-second tolerance
    expect(() =>
      verifyWebhook({
        body,
        signature: sig,
        timestamp: String(ts),
        secret: SECRET,
        tolerance: 30,
      }),
    ).not.toThrow();
  });

  it("accepts signature without sha256= prefix", () => {
    const body = '{"reply_id":"r_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(body, ts).replace("sha256=", "");

    expect(() =>
      verifyWebhook({ body, signature: sig, timestamp: String(ts), secret: SECRET }),
    ).not.toThrow();
  });
});
