# @botbell/sdk

Official JavaScript/TypeScript SDK for [BotBell](https://botbell.app) — push notifications for AI agents and scripts.

**Zero dependencies.** Uses only the built-in `fetch` API (Node.js 18+).

## Install

```bash
npm install @botbell/sdk
```

## Quick Start

```ts
import { BotBell } from "@botbell/sdk";

const bot = new BotBell({ token: "bt_your_token" });
await bot.send("Deploy succeeded ✅");
```

## Send Rich Messages

```ts
await bot.send("New order from Alice", {
  title: "Order #1234",
  url: "https://dashboard.example.com/orders/1234",
  imageUrl: "https://example.com/preview.png",
  format: "markdown",
});
```

## Interactive Actions

```ts
const result = await bot.send("Deploy v2.1.0 to production?", {
  actions: [
    { key: "approve", label: "Approve" },
    { key: "reject", label: "Reject" },
  ],
});

// Wait for user's reply (blocks up to 5 minutes)
const reply = await result.waitForReply({ timeout: 300 });
if (reply?.action === "approve") {
  deploy();
}
```

Or use the shorthand:

```ts
const reply = await bot.sendAndWait("Delete 3 duplicate records?", {
  actions: [
    { key: "yes", label: "Yes" },
    { key: "no", label: "No" },
  ],
});
```

## Text Input Actions

```ts
await bot.send("Build failed. What should we do?", {
  actions: [
    { key: "retry", label: "Retry" },
    { key: "comment", label: "Add note", type: "input", placeholder: "Type a note..." },
  ],
});
```

## Poll Replies

```ts
const replies = await bot.getReplies();
for (const reply of replies) {
  console.log(reply.action ?? reply.message);
}
```

## PAT Mode (Multi-Bot)

Use a Personal Access Token to manage multiple bots:

```ts
const client = new BotBell({ pat: "pak_your_token" });

// List bots
const bots = await client.listBots();

// Create a bot
const newBot = await client.createBot("Deploy Bot");

// Send via specific bot
await client.send("Hello!", { botId: newBot.botId });

// Check quota
const quota = await client.getQuota();
console.log(`${quota.plan}: ${quota.remaining}/${quota.monthlyLimit} messages left`);
```

## Webhook Signature Verification

When using `replyUrl` (webhook), verify incoming requests to ensure they're from BotBell:

```ts
import { verifyWebhook, WebhookVerificationError } from "@botbell/sdk";

// In your webhook handler (Express/Fastify/Hono etc.)
try {
  verifyWebhook({
    body: req.body, // raw string or Buffer
    signature: req.headers["x-webhook-signature"],
    timestamp: req.headers["x-webhook-timestamp"],
    secret: "your_webhook_secret",
  });
} catch (e) {
  if (e instanceof WebhookVerificationError) {
    return res.status(401).json({ error: e.message });
  }
  throw e;
}

// Signature valid — process the reply
const data = JSON.parse(req.body);
```

The verification checks HMAC-SHA256 signature and rejects requests older than 5 minutes (configurable via `tolerance` option).

## API Reference

### `new BotBell(options)`

| Option | Type | Description |
|--------|------|-------------|
| `token` | `string` | Bot Token (`bt_...`) for single-bot mode |
| `pat` | `string` | Personal Access Token (`pak_...`) for multi-bot mode |
| `baseUrl` | `string` | API base URL (default: `https://api.botbell.app/v1`) |
| `timeout` | `number` | Request timeout in ms (default: 30000) |

### `send(message, options?) → Promise<SendResult>`

### `sendAndWait(message, options?) → Promise<Reply | null>`

### `getReplies(botId?) → Promise<Reply[]>`

### `listBots() → Promise<Bot[]>` (PAT only)

### `createBot(name, options?) → Promise<Bot>` (PAT only)

### `getBot(botId) → Promise<Bot>` (PAT only)

### `updateBot(botId, updates) → Promise<Bot>` (PAT only)

### `deleteBot(botId) → Promise<void>` (PAT only)

### `resetBotToken(botId) → Promise<string>` (PAT only)

### `resetWebhookSecret(botId) → Promise<string>` (PAT only)

### `getQuota() → Promise<Quota>` (PAT only)

### `verifyWebhook(options)`

Verifies webhook signature. Throws `WebhookVerificationError` on failure.

| Option | Type | Description |
|--------|------|-------------|
| `body` | `string \| Buffer` | Raw request body |
| `signature` | `string` | `X-Webhook-Signature` header value |
| `timestamp` | `string` | `X-Webhook-Timestamp` header value |
| `secret` | `string` | Your bot's webhook secret |
| `tolerance` | `number` | Max age in seconds (default: 300) |

## Errors

All errors extend `BotBellError`:

| Exception | Code | Description |
|-----------|------|-------------|
| `AuthenticationError` | 40001 | Invalid or expired token |
| `ForbiddenError` | 40003 | Insufficient permissions |
| `NotFoundError` | 40004 | Resource not found |
| `ValidationError` | 40010 | Invalid parameters |
| `RateLimitError` | 40029 | Too many requests |
| `QuotaExceededError` | 40030 | Monthly message limit reached |
| `BotPausedError` | 40033 | Bot is paused |
| `ServerError` | 50000 | Server-side error |

## License

MIT
