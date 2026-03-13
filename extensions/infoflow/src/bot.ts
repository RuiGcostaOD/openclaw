import * as crypto from "crypto";
import type { ClawdbotConfig, RuntimeEnv, HistoryEntry } from "openclaw/plugin-sdk/feishu";
import {
  buildAgentMediaPayload,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  createScopedPairingAccess,
  DEFAULT_GROUP_HISTORY_LIMIT,
  issuePairingChallenge,
  normalizeAgentId,
  recordPendingHistoryEntryIfEnabled,
  resolveOpenProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
} from "openclaw/plugin-sdk/feishu";
import { resolveInfoflowAccount } from "./accounts.js";
import { accountToCredentials } from "./client.js";
import { sendInfoflowPrivateMessage, sendInfoflowGroupMessage } from "./send.js";
import type { InfoflowMessageContext, ResolvedInfoflowAccount } from "./types.js";

/**
 * Parse an Infoflow group message event into a normalized context.
 */
export function parseInfoflowGroupMessageEvent(
  msgData: Record<string, unknown>,
): InfoflowMessageContext | null {
  const message = msgData.message as Record<string, unknown> | undefined;
  const header = message?.header as Record<string, unknown> | undefined;
  const body = message?.body as Array<Record<string, unknown>> | undefined;

  const senderId = String(header?.fromuserid ?? "");
  const groupId = String(msgData.groupid ?? "");

  if (!senderId || !groupId) return null;

  // Extract text content from body items
  let textContent = "";
  for (const item of body ?? []) {
    if (item.type === "TEXT") {
      textContent += String(item.content ?? "");
    } else if (item.type === "LINK") {
      const label = item.label;
      if (label) textContent += ` ${String(label)} `;
    }
    // Skip AT items
  }

  const messageId = String(
    header?.messageid ?? header?.msgid ?? `${senderId}_${groupId}_${Date.now()}`,
  );

  return {
    chatId: groupId,
    messageId,
    senderId,
    chatType: "group",
    content: textContent.trim(),
    contentType: "text",
  };
}

/**
 * Parse an Infoflow private (DM) message event.
 * DMs come as XML-like JSON with FromUserId, Content, etc.
 */
export function parseInfoflowPrivateMessageEvent(
  msgData: Record<string, unknown>,
): InfoflowMessageContext | null {
  const fromUserId = String(msgData.FromUserId ?? "");
  const fromUserName = msgData.FromUserName as string | undefined;
  const content = String(msgData.Content ?? "");
  const msgId = String(msgData.MsgId ?? `dm_${fromUserId}_${Date.now()}`);

  if (!fromUserId || !content.trim()) return null;

  return {
    chatId: fromUserId,
    messageId: msgId,
    senderId: fromUserId,
    senderName: fromUserName,
    chatType: "private",
    content: content.trim(),
    contentType: "text",
  };
}

/**
 * Handle an incoming Infoflow message: dispatch to the agent runtime.
 */
export async function handleInfoflowMessage(params: {
  cfg: ClawdbotConfig;
  runtime?: RuntimeEnv;
  account: ResolvedInfoflowAccount;
  ctx: InfoflowMessageContext;
}): Promise<void> {
  const { cfg, runtime, account, ctx } = params;
  const log = runtime?.log ?? console.log;
  const creds = accountToCredentials(account);

  log(
    `infoflow[${account.accountId}]: message from ${ctx.senderId} in ${ctx.chatType} ${ctx.chatId}: ${ctx.content.slice(0, 80)}`,
  );

  // Dispatch to agent via runtime.dispatchMessage
  if (!runtime?.dispatchMessage) {
    log(`infoflow[${account.accountId}]: no runtime.dispatchMessage, cannot dispatch`);
    return;
  }

  const sessionId =
    ctx.chatType === "private" ? `infoflow:dm:${ctx.senderId}` : `infoflow:group:${ctx.chatId}`;

  try {
    const result = await runtime.dispatchMessage({
      channel: "infoflow",
      accountId: account.accountId,
      sessionId,
      senderId: ctx.senderId,
      senderName: ctx.senderName,
      chatId: ctx.chatId,
      chatType: ctx.chatType === "private" ? "direct" : "channel",
      messageId: ctx.messageId,
      text: ctx.content,
      replyCallback: async (text: string) => {
        if (ctx.chatType === "private") {
          await sendInfoflowPrivateMessage({
            creds,
            touser: ctx.senderId,
            content: text,
          });
        } else {
          await sendInfoflowGroupMessage({
            creds,
            groupId: ctx.chatId,
            content: text,
          });
        }
      },
    });
  } catch (err) {
    log(`infoflow[${account.accountId}]: dispatch error: ${err}`);

    // Send error feedback to user
    const errorMsg = "抱歉，处理消息时出现了错误，请稍后重试。";
    try {
      if (ctx.chatType === "private") {
        await sendInfoflowPrivateMessage({ creds, touser: ctx.senderId, content: errorMsg });
      } else {
        await sendInfoflowGroupMessage({ creds, groupId: ctx.chatId, content: errorMsg });
      }
    } catch {
      // Ignore send errors for error messages
    }
  }
}
