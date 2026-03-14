/** A reply action button or input field. */
export interface Action {
  /** Button identifier. */
  key: string;
  /** Display text. */
  label: string;
  /** Action type — "button" (default) or "input". */
  type?: "button" | "input";
  /** Placeholder text for input fields. */
  placeholder?: string;
}

/** A user reply to a message. */
export interface Reply {
  replyId: string;
  message: string;
  timestamp: number;
  action?: string;
  replyTo?: string;
}

/** A bot resource. */
export interface Bot {
  botId: string;
  name: string;
  description?: string;
  token?: string;
  webhookSecret?: string;
  pushUrl?: string;
  replyUrl?: string;
  status?: string;
  createdAt: number;
}

/** User's message quota information. */
export interface Quota {
  plan: string;
  monthlyLimit: number;
  used: number;
  remaining: number;
  resetAt: number;
}

/** Result of sending a message. */
export interface SendResult {
  messageId: string;
  /** Whether the push notification was delivered to a device. */
  delivered: boolean;
  /** Block until a reply is received or timeout. */
  waitForReply(options?: WaitOptions): Promise<Reply | null>;
}

export interface WaitOptions {
  /** Max seconds to wait (default 300). */
  timeout?: number;
  /** Seconds between poll requests (default 3). */
  pollInterval?: number;
}

/** Options for sending a message. */
export interface SendOptions {
  title?: string;
  url?: string;
  imageUrl?: string;
  summary?: string;
  /** Message format — "text" (default) or "markdown". */
  format?: "text" | "markdown";
  actions?: Action[];
  actionsDescription?: string;
  /** Reply mode — "open", "actions_only", or "none". */
  replyMode?: "open" | "actions_only" | "none";
  /** Required in PAT mode. */
  botId?: string;
}

/** Constructor options for BotBell client. */
export interface BotBellOptions {
  /** Bot Token (bt_...) for single-bot mode. */
  token?: string;
  /** Personal Access Token (pak_...) for multi-bot mode. */
  pat?: string;
  /** API base URL (default: https://api.botbell.app/v1). */
  baseUrl?: string;
  /** HTTP request timeout in milliseconds (default: 30000). */
  timeout?: number;
}
