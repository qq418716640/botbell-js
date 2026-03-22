[English](README.md) | [中文](README.zh-CN.md)

# @botbell/sdk

[![npm](https://img.shields.io/npm/v/@botbell/sdk)](https://www.npmjs.com/package/@botbell/sdk)
[![Node](https://img.shields.io/node/v/@botbell/sdk)](https://www.npmjs.com/package/@botbell/sdk)
[![License](https://img.shields.io/github/license/qq418716640/botbell-js)](https://github.com/qq418716640/botbell-js/blob/main/LICENSE)
[![CI](https://github.com/qq418716640/botbell-js/actions/workflows/ci.yml/badge.svg)](https://github.com/qq418716640/botbell-js/actions/workflows/ci.yml)

[BotBell](https://botbell.app) 官方 JavaScript/TypeScript SDK —— 为 AI 智能体和脚本提供推送通知。

**零依赖。** 仅使用内置 `fetch` API（Node.js 18+）。

## 安装

```bash
npm install @botbell/sdk
```

## 快速开始

```ts
import { BotBell } from "@botbell/sdk";

const bot = new BotBell({ token: "bt_your_token" });
await bot.send("部署成功 ✅");
```

## 发送富文本消息

```ts
await bot.send("Alice 的新订单", {
  title: "订单 #1234",
  url: "https://dashboard.example.com/orders/1234",
  imageUrl: "https://example.com/preview.png",
  format: "markdown",
});
```

## 交互式 Actions

```ts
const result = await bot.send("将 v2.1.0 部署到生产环境？", {
  actions: [
    { key: "approve", label: "批准" },
    { key: "reject", label: "拒绝" },
  ],
});

// 等待用户回复（最多等 5 分钟）
const reply = await result.waitForReply({ timeout: 300 });
if (reply?.action === "approve") {
  deploy();
}
```

或使用简写方式：

```ts
const reply = await bot.sendAndWait("删除 3 条重复记录？", {
  actions: [
    { key: "yes", label: "是" },
    { key: "no", label: "否" },
  ],
});
```

## 文本输入 Actions

```ts
await bot.send("构建失败，怎么处理？", {
  actions: [
    { key: "retry", label: "重试" },
    { key: "comment", label: "添加备注", type: "input", placeholder: "输入备注..." },
  ],
});
```

## 轮询回复

```ts
const replies = await bot.getReplies();
for (const reply of replies) {
  console.log(reply.action ?? reply.message);
}
```

## PAT 模式（多 Bot）

使用个人访问令牌管理多个 Bot：

```ts
const client = new BotBell({ pat: "pak_your_token" });

// 列出 Bot
const bots = await client.listBots();

// 创建 Bot
const newBot = await client.createBot("Deploy Bot");

// 通过指定 Bot 发送
await client.send("Hello!", { botId: newBot.botId });

// 查看配额
const quota = await client.getQuota();
console.log(`${quota.plan}: 剩余 ${quota.remaining}/${quota.monthlyLimit} 条消息`);
```

## Webhook 签名验证

使用 `replyUrl`（Webhook）时，验证请求来源确实是 BotBell：

```ts
import { verifyWebhook, WebhookVerificationError } from "@botbell/sdk";

// 在你的 Webhook 处理器中（Express/Fastify/Hono 等）
try {
  verifyWebhook({
    body: req.body, // 原始字符串或 Buffer
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

// 签名验证通过 — 处理回复
const data = JSON.parse(req.body);
```

验证使用 HMAC-SHA256 签名，并拒绝超过 5 分钟的请求（可通过 `tolerance` 选项配置）。

## API 参考

### `new BotBell(options)`

| 选项 | 类型 | 说明 |
|------|------|------|
| `token` | `string` | Bot Token（`bt_...`），单 Bot 模式 |
| `pat` | `string` | 个人访问令牌（`pak_...`），多 Bot 模式 |
| `baseUrl` | `string` | API 基础 URL（默认：`https://api.botbell.app/v1`） |
| `timeout` | `number` | 请求超时毫秒数（默认：30000） |

### `send(message, options?) → Promise<SendResult>`

### `sendAndWait(message, options?) → Promise<Reply | null>`

### `getReplies(botId?) → Promise<Reply[]>`

### `listBots() → Promise<Bot[]>`（仅 PAT）

### `createBot(name, options?) → Promise<Bot>`（仅 PAT）

### `getBot(botId) → Promise<Bot>`（仅 PAT）

### `updateBot(botId, updates) → Promise<Bot>`（仅 PAT）

### `deleteBot(botId) → Promise<void>`（仅 PAT）

### `resetBotToken(botId) → Promise<string>`（仅 PAT）

### `resetWebhookSecret(botId) → Promise<string>`（仅 PAT）

### `getQuota() → Promise<Quota>`（仅 PAT）

### `verifyWebhook(options)`

验证 Webhook 签名。失败时抛出 `WebhookVerificationError`。

| 选项 | 类型 | 说明 |
|------|------|------|
| `body` | `string \| Buffer` | 原始请求体 |
| `signature` | `string` | `X-Webhook-Signature` 请求头 |
| `timestamp` | `string` | `X-Webhook-Timestamp` 请求头 |
| `secret` | `string` | Bot 的 Webhook 密钥 |
| `tolerance` | `number` | 最大有效时间秒数（默认：300） |

## 错误处理

所有错误继承自 `BotBellError`：

| 异常 | 错误码 | 说明 |
|------|--------|------|
| `AuthenticationError` | 40001 | Token 无效或已过期 |
| `ForbiddenError` | 40003 | 权限不足 |
| `NotFoundError` | 40004 | 资源不存在 |
| `ValidationError` | 40010 | 参数无效 |
| `RateLimitError` | 40029 | 请求过于频繁 |
| `QuotaExceededError` | 40030 | 月度消息配额已用完 |
| `BotPausedError` | 40033 | Bot 已暂停 |
| `ServerError` | 50000 | 服务端错误 |

## 许可证

MIT
