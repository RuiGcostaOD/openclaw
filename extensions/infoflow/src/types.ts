import type { BaseProbeResult } from "openclaw/plugin-sdk/feishu";
import type { InfoflowConfigSchema, InfoflowAccountConfigSchema, z } from "./config-schema.js";

export type InfoflowConfig = z.infer<typeof InfoflowConfigSchema>;
export type InfoflowAccountConfig = z.infer<typeof InfoflowAccountConfigSchema>;

export type InfoflowDefaultAccountSelectionSource =
  | "explicit-default"
  | "mapped-default"
  | "fallback";
export type InfoflowAccountSelectionSource = "explicit" | InfoflowDefaultAccountSelectionSource;

export type ResolvedInfoflowAccount = {
  accountId: string;
  selectionSource: InfoflowAccountSelectionSource;
  enabled: boolean;
  configured: boolean;
  name?: string;
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  encodingAesKey?: string;
  /** Merged config (top-level defaults + account-specific overrides) */
  config: InfoflowConfig;
};

export type InfoflowMessageContext = {
  chatId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  chatType: "private" | "group";
  content: string;
  contentType: string;
};

export type InfoflowSendResult = {
  ok: boolean;
  error?: string;
};

export type InfoflowProbeResult = BaseProbeResult<string> & {
  appKey?: string;
};
