import type { ClawdbotConfig } from "openclaw/plugin-sdk/feishu";
import { resolveInfoflowAccount } from "./accounts.js";
import { infoflowApiRequest, type InfoflowClientCredentials } from "./client.js";
import type { InfoflowSendResult } from "./types.js";

type InfoflowApiResponse = {
  code?: string;
  invaliduser?: string;
  [key: string]: unknown;
};

/**
 * Send a private (DM) message via the Infoflow API.
 */
export async function sendInfoflowPrivateMessage(params: {
  creds: InfoflowClientCredentials;
  touser: string;
  content: string;
  msgtype?: "text" | "md" | "image";
}): Promise<InfoflowSendResult> {
  const { creds, touser, content, msgtype = "text" } = params;

  const payload: Record<string, unknown> = { touser, msgtype };
  if (msgtype === "text") {
    payload.text = { content };
  } else if (msgtype === "md") {
    payload.md = { content };
  } else if (msgtype === "image") {
    payload.image = { content };
  } else {
    payload.text = { content };
  }

  const result = await infoflowApiRequest<InfoflowApiResponse>({
    creds,
    method: "POST",
    path: "/api/v1/app/message/send",
    body: payload,
  });

  if (result.invaliduser) {
    return { ok: false, error: `Invalid user: ${result.invaliduser}` };
  }
  return {
    ok: result.code === "ok" || !result.code,
    error: result.code !== "ok" ? String(result.code) : undefined,
  };
}

/**
 * Send a group message via the Infoflow robot API.
 */
export async function sendInfoflowGroupMessage(params: {
  creds: InfoflowClientCredentials;
  groupId: string;
  content: string;
  msgtype?: string;
}): Promise<InfoflowSendResult> {
  const { creds, groupId, content, msgtype = "TEXT" } = params;

  const payload = {
    message: {
      header: {
        toid: groupId,
        totype: "GROUP",
        msgtype,
        clientmsgid: Date.now(),
        role: "robot",
      },
      body: [{ type: msgtype, content }],
    },
  };

  const result = await infoflowApiRequest<InfoflowApiResponse>({
    creds,
    method: "POST",
    path: "/api/v1/robot/msg/groupmsgsend",
    body: payload,
  });

  return {
    ok: result.code === "ok" || !result.code,
    error: result.code !== "ok" ? String(result.code) : undefined,
  };
}

/**
 * High-level message send: auto-detects private vs group based on target format.
 */
export async function sendInfoflowMessage(params: {
  cfg: ClawdbotConfig;
  to: string;
  text: string;
  accountId?: string;
}): Promise<InfoflowSendResult> {
  const { cfg, to, text, accountId } = params;
  const account = resolveInfoflowAccount({ cfg, accountId });

  const creds: InfoflowClientCredentials = {
    accountId: account.accountId,
    appKey: account.appKey,
    appSecret: account.appSecret,
  };

  // Group IDs are numeric; user IDs are typically username strings
  if (looksLikeGroupId(to)) {
    return sendInfoflowGroupMessage({ creds, groupId: to, content: text });
  }
  return sendInfoflowPrivateMessage({ creds, touser: to, content: text });
}

function looksLikeGroupId(id: string): boolean {
  return /^group:/.test(id) || /^\d+$/.test(id);
}
