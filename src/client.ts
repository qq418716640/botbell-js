import { BotBellError, throwForError } from "./errors.js";
import type {
  Action,
  Bot,
  BotBellOptions,
  Quota,
  Reply,
  SendOptions,
  SendResult,
  WaitOptions,
} from "./types.js";
import { VERSION } from "./version.js";

const DEFAULT_BASE_URL = "https://api.botbell.app/v1";
const USER_AGENT = `botbell-js/${VERSION}`;

type AuthMode = "bot_token" | "pat";

/**
 * BotBell SDK client.
 *
 * Supports two authentication modes:
 * - Bot Token (bt_...): single-bot operations (send, getReplies)
 * - Personal Access Token (pak_...): multi-bot management
 *
 * @example
 * ```ts
 * // Bot Token mode
 * const bot = new BotBell({ token: "bt_xxx" });
 * await bot.send("Hello!");
 *
 * // PAT mode
 * const client = new BotBell({ pat: "pak_xxx" });
 * await client.send("Hello!", { botId: "bot_123" });
 * ```
 */
export class BotBell {
  private readonly _token: string | undefined;
  private readonly _pat: string | undefined;
  private readonly _baseUrl: string;
  private readonly _timeout: number;
  private readonly _mode: AuthMode;
  private _pendingReplies: Reply[] = [];

  constructor(options: BotBellOptions) {
    const { token, pat, baseUrl = DEFAULT_BASE_URL, timeout = 30_000 } = options;

    if (token && pat) {
      throw new Error("Provide either token or pat, not both");
    }
    if (!token && !pat) {
      throw new Error("Provide a bot token or PAT");
    }

    this._baseUrl = baseUrl.replace(/\/+$/, "");
    this._timeout = timeout;

    if (token) {
      if (!token.startsWith("bt_")) {
        throw new Error("Bot token must start with 'bt_'");
      }
      this._token = token;
      this._mode = "bot_token";
    } else {
      if (!pat!.startsWith("pak_")) {
        throw new Error("PAT must start with 'pak_'");
      }
      this._pat = pat;
      this._mode = "pat";
    }
  }

  /** Authentication mode: "bot_token" or "pat". */
  get mode(): AuthMode {
    return this._mode;
  }

  // ── Sending messages ──────────────────────────────────────────────

  /**
   * Send a push notification.
   *
   * @param message - Message body (required, max 4096 chars).
   * @param options - Optional send parameters.
   * @returns SendResult with messageId and waitForReply() method.
   */
  async send(message: string, options: SendOptions = {}): Promise<SendResult> {
    const body: Record<string, unknown> = { message };

    if (options.title != null) body.title = options.title;
    if (options.url != null) body.url = options.url;
    if (options.imageUrl != null) body.image_url = options.imageUrl;
    if (options.summary != null) body.summary = options.summary;
    if (options.format != null) body.format = options.format;
    if (options.actions != null) body.actions = options.actions;
    if (options.actionsDescription != null)
      body.actions_description = options.actionsDescription;
    if (options.replyMode != null) body.reply_mode = options.replyMode;

    let resp: Record<string, unknown>;

    if (this._mode === "bot_token") {
      resp = await this._request("POST", `/push/${this._token}`, body, false);
    } else {
      if (!options.botId) {
        throw new Error("botId is required in PAT mode");
      }
      resp = await this._request("POST", `/bots/${options.botId}/push`, body);
    }

    const data = resp.data as Record<string, unknown>;
    const messageId = data.message_id as string;
    const resolvedBotId = options.botId ?? (data.bot_id as string | undefined);

    return {
      messageId,
      waitForReply: (waitOpts?: WaitOptions) =>
        this._waitForReply({
          botId: resolvedBotId,
          messageId,
          timeout: waitOpts?.timeout ?? 300,
          pollInterval: waitOpts?.pollInterval ?? 3,
        }),
    };
  }

  /**
   * Send a message and wait for a reply.
   *
   * @param message - Message body.
   * @param options - Send options + wait options.
   * @returns The first reply to this message, or null on timeout.
   */
  async sendAndWait(
    message: string,
    options: SendOptions & WaitOptions = {},
  ): Promise<Reply | null> {
    const { timeout = 300, pollInterval = 3, ...sendOpts } = options;
    const result = await this.send(message, sendOpts);
    return result.waitForReply({ timeout, pollInterval });
  }

  // ── Replies ───────────────────────────────────────────────────────

  /**
   * Poll for user replies.
   *
   * @param botId - Required in PAT mode, ignored in bot token mode.
   * @returns List of Reply objects (includes any buffered replies).
   */
  async getReplies(botId?: string): Promise<Reply[]> {
    // Drain buffered replies from sendAndWait
    const replies = [...this._pendingReplies];
    this._pendingReplies = [];

    const raw = await this._pollRaw(botId);
    replies.push(...raw);
    return replies;
  }

  // ── Bot management (PAT mode only) ────────────────────────────────

  /** List all bots. PAT mode only. */
  async listBots(): Promise<Bot[]> {
    this._requirePat("listBots");
    const resp = await this._request("GET", "/bots");
    const data = resp.data as Record<string, unknown>[];
    return data.map((item) => this._parseBot(item));
  }

  /**
   * Create a new bot. PAT mode only.
   *
   * @param name - Bot display name.
   * @returns The created Bot (includes token and pushUrl).
   */
  async createBot(name: string): Promise<Bot> {
    this._requirePat("createBot");
    const resp = await this._request("POST", "/bots", { name });
    return this._parseBot(resp.data as Record<string, unknown>);
  }

  /** Get current message quota. PAT mode only. */
  async getQuota(): Promise<Quota> {
    this._requirePat("getQuota");
    const resp = await this._request("GET", "/account/quota");
    const data = resp.data as Record<string, unknown>;
    return {
      plan: (data.plan as string) ?? "free",
      monthlyLimit: (data.monthly_limit as number | null) ?? null,
      monthlyUsed: (data.monthly_used as number) ?? 0,
      botLimit: (data.bot_limit as number) ?? 3,
      botUsed: (data.bot_used as number) ?? 0,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────

  private _requirePat(method: string): void {
    if (this._mode !== "pat") {
      throw new BotBellError(`${method}() requires PAT mode`);
    }
  }

  private async _pollRaw(botId?: string): Promise<Reply[]> {
    let resp: Record<string, unknown>;

    if (this._mode === "bot_token") {
      resp = await this._request("GET", "/messages/poll");
    } else {
      if (!botId) {
        throw new Error("botId is required in PAT mode");
      }
      resp = await this._request("GET", `/bots/${botId}/replies`);
    }

    const data = (resp.data ?? []) as Record<string, unknown>[];
    return data.map((item) => ({
      replyId: (item.reply_id as string) ?? "",
      botId: (item.bot_id as string) ?? "",
      message: (item.message as string) ?? "",
      timestamp: (item.timestamp as number) ?? 0,
      action: item.action as string | undefined,
      replyTo: item.reply_to as string | undefined,
    }));
  }

  private async _waitForReply(opts: {
    botId: string | undefined;
    messageId: string;
    timeout: number;
    pollInterval: number;
  }): Promise<Reply | null> {
    const deadline = Date.now() + opts.timeout * 1000;

    while (Date.now() < deadline) {
      const replies = await this._pollRaw(opts.botId);
      let matched: Reply | null = null;

      for (const reply of replies) {
        if (matched === null && reply.replyTo === opts.messageId) {
          matched = reply;
        } else {
          this._pendingReplies.push(reply);
        }
      }

      if (matched !== null) {
        return matched;
      }

      const remaining = deadline - Date.now();
      const sleepMs = Math.min(opts.pollInterval * 1000, Math.max(0, remaining));
      await new Promise((r) => setTimeout(r, sleepMs));
    }

    return null;
  }

  private async _request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    auth: boolean = true,
  ): Promise<Record<string, unknown>> {
    const url = this._baseUrl + path;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };

    if (auth) {
      if (this._mode === "pat") {
        headers["Authorization"] = `Bearer ${this._pat}`;
      } else {
        headers["X-Bot-Token"] = this._token!;
      }
    }

    const init: RequestInit = { method, headers };

    if (body != null) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    if (this._timeout > 0) {
      init.signal = AbortSignal.timeout(this._timeout);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new BotBellError(
          `Request timed out after ${this._timeout}ms`,
          undefined,
        );
      }
      throw new BotBellError(
        `Connection error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const text = await res.text();
    let json: Record<string, unknown>;

    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new BotBellError(`HTTP ${res.status}: ${text}`, res.status);
    }

    if (!res.ok) {
      const code = (json.code as number) ?? res.status;
      const message = (json.message as string) ?? res.statusText;
      throwForError(code, message);
    }

    return json;
  }

  private _parseBot(data: Record<string, unknown>): Bot {
    return {
      botId: (data.bot_id as string) ?? "",
      name: (data.name as string) ?? "",
      token: data.token as string | undefined,
      pushUrl: data.push_url as string | undefined,
      replyUrl: data.reply_url as string | undefined,
      status: data.status as string | undefined,
      createdAt: (data.created_at as number) ?? 0,
    };
  }
}
