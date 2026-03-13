import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk/feishu";
import { resolveInfoflowAccount } from "./accounts.js";
import {
  handleInfoflowMessage,
  parseInfoflowGroupMessageEvent,
  parseInfoflowPrivateMessageEvent,
} from "./bot.js";
import { monitorWebhook } from "./monitor.transport.js";
import type { ResolvedInfoflowAccount } from "./types.js";

// Message dedup cache
const processedMessages = new Map<string, number>();
const MESSAGE_CACHE_EXPIRE_MS = 5 * 60 * 1000; // 5 minutes
const MESSAGE_CACHE_MAX_SIZE = 1000;

function isDuplicateMessage(messageId: string): boolean {
  // Clean expired entries
  const now = Date.now();
  for (const [key, timestamp] of processedMessages) {
    if (now - timestamp > MESSAGE_CACHE_EXPIRE_MS) {
      processedMessages.delete(key);
    }
  }

  if (processedMessages.has(messageId)) {
    return true;
  }

  processedMessages.set(messageId, now);

  // Evict oldest if too large
  if (processedMessages.size > MESSAGE_CACHE_MAX_SIZE) {
    const oldest = processedMessages.keys().next().value;
    if (oldest !== undefined) {
      processedMessages.delete(oldest);
    }
  }

  return false;
}

export type MonitorInfoflowAccountParams = {
  cfg: ClawdbotConfig;
  account: ResolvedInfoflowAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
};

/**
 * Monitor a single Infoflow account: start webhook and handle messages.
 */
export async function monitorSingleAccount(params: MonitorInfoflowAccountParams): Promise<void> {
  const { cfg, account, runtime, abortSignal } = params;
  const log = runtime?.log ?? console.log;

  log(`infoflow[${account.accountId}]: starting account monitor`);

  return monitorWebhook({
    account,
    accountId: account.accountId,
    runtime,
    abortSignal,
    onGroupMessage: (msgData) => {
      const ctx = parseInfoflowGroupMessageEvent(msgData);
      if (!ctx || !ctx.content) return;
      if (isDuplicateMessage(ctx.messageId)) {
        log(`infoflow[${account.accountId}]: duplicate message ${ctx.messageId}, skipping`);
        return;
      }
      // Handle async, don't block the webhook
      void handleInfoflowMessage({ cfg, runtime, account, ctx }).catch((err) => {
        log(`infoflow[${account.accountId}]: error handling group message: ${err}`);
      });
    },
    onPrivateMessage: (msgData) => {
      const ctx = parseInfoflowPrivateMessageEvent(msgData);
      if (!ctx || !ctx.content) return;
      if (isDuplicateMessage(ctx.messageId)) {
        log(`infoflow[${account.accountId}]: duplicate DM ${ctx.messageId}, skipping`);
        return;
      }
      void handleInfoflowMessage({ cfg, runtime, account, ctx }).catch((err) => {
        log(`infoflow[${account.accountId}]: error handling DM: ${err}`);
      });
    },
  });
}
