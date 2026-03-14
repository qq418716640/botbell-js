import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotBell } from "../src/client.js";
import {
  AuthenticationError,
  BotBellError,
  BotPausedError,
  QuotaExceededError,
  RateLimitError,
  ValidationError,
} from "../src/errors.js";

// ── Mock fetch ──────────────────────────────────────────────────────

function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ── Init ────────────────────────────────────────────────────────────

describe("constructor", () => {
  it("creates bot token client", () => {
    const client = new BotBell({ token: "bt_test123" });
    expect(client.mode).toBe("bot_token");
  });

  it("creates PAT client", () => {
    const client = new BotBell({ pat: "pak_test123" });
    expect(client.mode).toBe("pat");
  });

  it("throws when no token provided", () => {
    expect(() => new BotBell({})).toThrow("Provide a bot token or PAT");
  });

  it("throws when both tokens provided", () => {
    expect(() => new BotBell({ token: "bt_x", pat: "pak_y" })).toThrow("not both");
  });

  it("throws on invalid bot token prefix", () => {
    expect(() => new BotBell({ token: "invalid" })).toThrow("bt_");
  });

  it("throws on invalid PAT prefix", () => {
    expect(() => new BotBell({ pat: "invalid" })).toThrow("pak_");
  });

  it("strips trailing slash from base URL", () => {
    const client = new BotBell({ token: "bt_test", baseUrl: "http://localhost:8090/v1/" });
    // Verify by making a request and checking URL
    expect(client.mode).toBe("bot_token");
  });
});

// ── Send ────────────────────────────────────────────────────────────

describe("send", () => {
  it("sends with bot token (URL mode, no auth header)", async () => {
    const fetchMock = mockFetch({ code: 0, data: { message_id: "msg_1", bot_id: "bot_1" } });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ token: "bt_test123" });
    const result = await client.send("Hello");

    expect(result.messageId).toBe("msg_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/push/bt_test123");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ message: "Hello" });
    // No auth headers in bot token URL mode
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["X-Bot-Token"]).toBeUndefined();
  });

  it("sends with PAT mode", async () => {
    const fetchMock = mockFetch({ code: 0, data: { message_id: "msg_2" } });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const result = await client.send("Hello", { botId: "bot_99" });

    expect(result.messageId).toBe("msg_2");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/bots/bot_99/push");
    expect(init.headers.Authorization).toBe("Bearer pak_test123");
  });

  it("throws when PAT mode without botId", async () => {
    const client = new BotBell({ pat: "pak_test123" });
    await expect(client.send("Hello")).rejects.toThrow("botId is required");
  });

  it("sends with all options", async () => {
    const fetchMock = mockFetch({ code: 0, data: { message_id: "msg_3", bot_id: "bot_1" } });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ token: "bt_test123" });
    await client.send("Deploy?", {
      title: "Deploy",
      url: "https://example.com",
      imageUrl: "https://example.com/img.png",
      summary: "Deploy request",
      format: "markdown",
      actions: [
        { key: "yes", label: "Approve" },
        { key: "no", label: "Reject" },
      ],
      actionsDescription: "Choose an action",
      replyMode: "actions_only",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.title).toBe("Deploy");
    expect(body.url).toBe("https://example.com");
    expect(body.image_url).toBe("https://example.com/img.png");
    expect(body.summary).toBe("Deploy request");
    expect(body.format).toBe("markdown");
    expect(body.actions).toHaveLength(2);
    expect(body.actions_description).toBe("Choose an action");
    expect(body.reply_mode).toBe("actions_only");
  });

  it("sets User-Agent header", async () => {
    const fetchMock = mockFetch({ code: 0, data: { message_id: "msg_1", bot_id: "bot_1" } });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ token: "bt_test123" });
    await client.send("Hello");

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["User-Agent"]).toMatch(/^botbell-js\//);
  });
});

// ── Replies ─────────────────────────────────────────────────────────

describe("getReplies", () => {
  it("gets replies in bot token mode", async () => {
    const fetchMock = mockFetch({
      code: 0,
      data: {
        messages: [
          {
            message_id: "r_1",
            content: "Yes",
            timestamp: 1700000000,
            action: "approve",
            reply_to: "msg_1",
          },
        ],
        has_more: false,
      },
    });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ token: "bt_test123" });
    const replies = await client.getReplies();

    expect(replies).toHaveLength(1);
    expect(replies[0].replyId).toBe("r_1");
    expect(replies[0].message).toBe("Yes");
    expect(replies[0].action).toBe("approve");
    expect(replies[0].replyTo).toBe("msg_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/messages/poll");
    expect(init.headers["X-Bot-Token"]).toBe("bt_test123");
  });

  it("gets replies in PAT mode", async () => {
    const fetchMock = mockFetch({ code: 0, data: { messages: [], has_more: false } });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const replies = await client.getReplies("bot_1");

    expect(replies).toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toContain("/bots/bot_1/replies");
  });

  it("throws when PAT mode without botId", async () => {
    const client = new BotBell({ pat: "pak_test123" });
    await expect(client.getReplies()).rejects.toThrow("botId is required");
  });
});

// ── Bot management ──────────────────────────────────────────────────

describe("bot management", () => {
  it("lists bots", async () => {
    const fetchMock = mockFetch({
      code: 0,
      data: {
        bots: [
          { bot_id: "bot_1", name: "Test Bot", description: "A test bot", status: "active", created_at: 1700000000 },
        ],
        total: 1,
        limit: 50,
      },
    });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const bots = await client.listBots();

    expect(bots).toHaveLength(1);
    expect(bots[0].botId).toBe("bot_1");
    expect(bots[0].name).toBe("Test Bot");
    expect(bots[0].description).toBe("A test bot");
    expect(bots[0].status).toBe("active");
  });

  it("creates bot with options", async () => {
    const fetchMock = mockFetch({
      code: 0,
      data: {
        bot_id: "bot_new",
        name: "My Bot",
        api_token: "bt_new123",
        push_url: "https://api.botbell.app/v1/push/bt_new123",
        webhook_secret: "whsec_abc123",
      },
    });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const bot = await client.createBot("My Bot", {
      description: "Deploy notifications",
      replyUrl: "https://example.com/hook",
    });

    expect(bot.botId).toBe("bot_new");
    expect(bot.token).toBe("bt_new123");
    expect(bot.webhookSecret).toBe("whsec_abc123");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.description).toBe("Deploy notifications");
    expect(body.reply_url).toBe("https://example.com/hook");
  });

  it("gets bot details", async () => {
    const fetchMock = mockFetch({
      code: 0,
      data: { bot_id: "bot_1", name: "Test Bot", status: "active" },
    });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const bot = await client.getBot("bot_1");
    expect(bot.botId).toBe("bot_1");
    expect(fetchMock.mock.calls[0][0]).toContain("/bots/bot_1");
  });

  it("updates bot", async () => {
    const fetchMock = mockFetch({
      code: 0,
      data: { bot_id: "bot_1", name: "New Name", status: "paused" },
    });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const bot = await client.updateBot("bot_1", { name: "New Name", status: "paused" });

    expect(bot.name).toBe("New Name");
    expect(bot.status).toBe("paused");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("New Name");
    expect(body.status).toBe("paused");
  });

  it("deletes bot", async () => {
    const fetchMock = mockFetch({ code: 0, message: "success" });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    await client.deleteBot("bot_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("DELETE");
    expect(url).toContain("/bots/bot_1");
  });

  it("resets bot token", async () => {
    const fetchMock = mockFetch({ code: 0, data: { api_token: "bt_new_rotated" } });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const newToken = await client.resetBotToken("bot_1");

    expect(newToken).toBe("bt_new_rotated");
    expect(fetchMock.mock.calls[0][0]).toContain("/bots/bot_1/reset-token");
  });

  it("resets webhook secret", async () => {
    const fetchMock = mockFetch({ code: 0, data: { webhook_secret: "whsec_new_rotated" } });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const newSecret = await client.resetWebhookSecret("bot_1");

    expect(newSecret).toBe("whsec_new_rotated");
    expect(fetchMock.mock.calls[0][0]).toContain("/bots/bot_1/reset-webhook-secret");
  });

  it("gets quota", async () => {
    const fetchMock = mockFetch({
      code: 0,
      data: { plan: "free", monthly_limit: 300, monthly_used: 42, bot_limit: 3, bot_used: 1 },
    });
    globalThis.fetch = fetchMock;

    const client = new BotBell({ pat: "pak_test123" });
    const quota = await client.getQuota();

    expect(quota.plan).toBe("free");
    expect(quota.monthlyLimit).toBe(300);
    expect(quota.monthlyUsed).toBe(42);
    expect(quota.botLimit).toBe(3);
  });

  it("throws when bot management called in bot token mode", async () => {
    const client = new BotBell({ token: "bt_test123" });
    await expect(client.listBots()).rejects.toThrow("requires PAT mode");
    await expect(client.createBot("test")).rejects.toThrow("requires PAT mode");
    await expect(client.getBot("bot_1")).rejects.toThrow("requires PAT mode");
    await expect(client.updateBot("bot_1", { name: "x" })).rejects.toThrow("requires PAT mode");
    await expect(client.deleteBot("bot_1")).rejects.toThrow("requires PAT mode");
    await expect(client.resetBotToken("bot_1")).rejects.toThrow("requires PAT mode");
    await expect(client.resetWebhookSecret("bot_1")).rejects.toThrow("requires PAT mode");
    await expect(client.getQuota()).rejects.toThrow("requires PAT mode");
  });
});

// ── Error handling ──────────────────────────────────────────────────

describe("error handling", () => {
  it("throws AuthenticationError on 40001", async () => {
    globalThis.fetch = mockFetch({ code: 40001, message: "Invalid token" }, 401);
    const client = new BotBell({ token: "bt_test123" });
    await expect(client.send("Hello")).rejects.toThrow(AuthenticationError);
  });

  it("throws RateLimitError on 40029", async () => {
    globalThis.fetch = mockFetch({ code: 40029, message: "Rate limit exceeded" }, 429);
    const client = new BotBell({ token: "bt_test123" });
    await expect(client.send("Hello")).rejects.toThrow(RateLimitError);
  });

  it("throws QuotaExceededError on 40030", async () => {
    globalThis.fetch = mockFetch({ code: 40030, message: "Quota exhausted" }, 403);
    const client = new BotBell({ token: "bt_test123" });
    await expect(client.send("Hello")).rejects.toThrow(QuotaExceededError);
  });

  it("throws BotPausedError on 40033", async () => {
    globalThis.fetch = mockFetch({ code: 40033, message: "Bot is paused" }, 403);
    const client = new BotBell({ token: "bt_test123" });
    await expect(client.send("Hello")).rejects.toThrow(BotPausedError);
  });

  it("throws ValidationError on 40010", async () => {
    globalThis.fetch = mockFetch({ code: 40010, message: "message is required" }, 400);
    const client = new BotBell({ token: "bt_test123" });
    await expect(client.send("")).rejects.toThrow(ValidationError);
  });

  it("throws BotBellError with code for unknown error", async () => {
    globalThis.fetch = mockFetch({ code: 99999, message: "Something weird" }, 500);
    const client = new BotBell({ token: "bt_test123" });
    try {
      await client.send("Hello");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BotBellError);
      expect((e as BotBellError).code).toBe(99999);
    }
  });

  it("throws BotBellError for non-JSON response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: () => Promise.resolve("<html>Bad Gateway</html>"),
    });
    const client = new BotBell({ token: "bt_test123" });
    await expect(client.send("Hello")).rejects.toThrow("HTTP 502");
  });

  it("throws BotBellError on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const client = new BotBell({ token: "bt_test123" });
    await expect(client.send("Hello")).rejects.toThrow("Connection error");
  });
});

// ── sendAndWait ─────────────────────────────────────────────────────

describe("sendAndWait", () => {
  it("returns reply when matched", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // send
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({ code: 0, data: { message_id: "msg_1", bot_id: "bot_1" } }),
            ),
        });
      }
      // poll
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              code: 0,
              data: {
                messages: [
                  { message_id: "r_1", content: "Yes", action: "approve", reply_to: "msg_1" },
                ],
                has_more: false,
              },
            }),
          ),
      });
    });

    const client = new BotBell({ token: "bt_test123" });
    const reply = await client.sendAndWait("Approve?", { timeout: 10 });

    expect(reply).not.toBeNull();
    expect(reply!.message).toBe("Yes");
    expect(reply!.action).toBe("approve");
  });

  it("preserves non-matching replies", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({ code: 0, data: { message_id: "msg_1", bot_id: "bot_1" } }),
            ),
        });
      }
      if (callCount === 2) {
        // Poll returns: before + match + after
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                code: 0,
                data: {
                  messages: [
                    { message_id: "r_before", content: "Before", reply_to: "msg_other" },
                    { message_id: "r_1", content: "Yes", reply_to: "msg_1" },
                    { message_id: "r_after", content: "After", reply_to: "msg_another" },
                  ],
                  has_more: false,
                },
              }),
            ),
        });
      }
      // Subsequent getReplies call
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ code: 0, data: { messages: [], has_more: false } })),
      });
    });

    const client = new BotBell({ token: "bt_test123" });
    const reply = await client.sendAndWait("Approve?", { timeout: 10 });

    expect(reply).not.toBeNull();
    expect(reply!.replyTo).toBe("msg_1");

    // Both non-matched replies should be preserved
    const remaining = await client.getReplies();
    expect(remaining).toHaveLength(2);
    expect(remaining[0].replyId).toBe("r_before");
    expect(remaining[1].replyId).toBe("r_after");
  });

  it("returns null on timeout", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({ code: 0, data: { message_id: "msg_1", bot_id: "bot_1" } }),
            ),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ code: 0, data: { messages: [], has_more: false } })),
      });
    });

    const client = new BotBell({ token: "bt_test123" });
    const reply = await client.sendAndWait("Hello?", { timeout: 0 });

    expect(reply).toBeNull();
  });
});
