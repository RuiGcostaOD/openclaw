import {
  collectAllowlistProviderRestrictSendersWarnings,
  formatAllowFromLowercase,
  mapAllowFromEntries,
} from "openclaw/plugin-sdk/compat";
import type { ChannelMeta, ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk/feishu";
import {
  buildProbeChannelStatusSummary,
  buildRuntimeAccountStatusSnapshot,
  createDefaultChannelRuntimeState,
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
} from "openclaw/plugin-sdk/feishu";
import {
  resolveInfoflowAccount,
  resolveInfoflowCredentials,
  listInfoflowAccountIds,
  resolveDefaultInfoflowAccountId,
} from "./accounts.js";
import { accountToCredentials } from "./client.js";
import { infoflowOnboardingAdapter } from "./onboarding.js";
import { infoflowOutbound } from "./outbound.js";
import { probeInfoflow } from "./probe.js";
import { sendInfoflowPrivateMessage } from "./send.js";
import { normalizeInfoflowTarget, looksLikeInfoflowId } from "./targets.js";
import type { ResolvedInfoflowAccount, InfoflowConfig } from "./types.js";

const meta: ChannelMeta = {
  id: "infoflow",
  label: "Infoflow",
  selectionLabel: "Infoflow (如流)",
  docsPath: "/channels/infoflow",
  docsLabel: "infoflow",
  blurb: "百度如流企业通讯平台",
  aliases: ["ruliu"],
  order: 75,
};

const secretInputJsonSchema = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      required: ["source", "provider", "id"],
      properties: {
        source: { type: "string", enum: ["env", "file", "exec"] },
        provider: { type: "string", minLength: 1 },
        id: { type: "string", minLength: 1 },
      },
    },
  ],
} as const;

function setInfoflowNamedAccountEnabled(
  cfg: ClawdbotConfig,
  accountId: string,
  enabled: boolean,
): ClawdbotConfig {
  const infoCfg = cfg.channels?.infoflow as InfoflowConfig | undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      infoflow: {
        ...infoCfg,
        accounts: {
          ...infoCfg?.accounts,
          [accountId]: {
            ...infoCfg?.accounts?.[accountId],
            enabled,
          },
        },
      },
    },
  };
}

export const infoflowPlugin: ChannelPlugin<ResolvedInfoflowAccount> = {
  id: "infoflow",
  meta: { ...meta },
  pairing: {
    idLabel: "infoflowUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^infoflow:/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveInfoflowAccount({ cfg });
      const creds = accountToCredentials(account);
      await sendInfoflowPrivateMessage({
        creds,
        touser: id,
        content: PAIRING_APPROVED_MESSAGE,
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: false,
  },
  reload: { configPrefixes: ["channels.infoflow"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        defaultAccount: { type: "string" },
        appKey: { type: "string" },
        appSecret: secretInputJsonSchema,
        accessToken: secretInputJsonSchema,
        encodingAesKey: { type: "string" },
        webhookPath: { type: "string" },
        webhookHost: { type: "string" },
        webhookPort: { type: "integer", minimum: 1 },
        dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
        allowFrom: { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } },
        groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
        groupAllowFrom: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "number" }] },
        },
        historyLimit: { type: "integer", minimum: 0 },
        dmHistoryLimit: { type: "integer", minimum: 0 },
        textChunkLimit: { type: "integer", minimum: 1 },
        httpTimeoutMs: { type: "integer", minimum: 1 },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              name: { type: "string" },
              appKey: { type: "string" },
              appSecret: secretInputJsonSchema,
              accessToken: secretInputJsonSchema,
              encodingAesKey: { type: "string" },
              webhookPath: { type: "string" },
              webhookHost: { type: "string" },
              webhookPort: { type: "integer", minimum: 1 },
            },
          },
        },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => listInfoflowAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveInfoflowAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultInfoflowAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;
      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            infoflow: {
              ...cfg.channels?.infoflow,
              enabled,
            },
          },
        };
      }
      return setInfoflowNamedAccountEnabled(cfg, accountId, enabled);
    },
    deleteAccount: ({ cfg, accountId }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;
      if (isDefault) {
        const next = { ...cfg } as ClawdbotConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>).infoflow;
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }
      const infoCfg = cfg.channels?.infoflow as InfoflowConfig | undefined;
      const accounts = { ...infoCfg?.accounts };
      delete accounts[accountId];
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          infoflow: {
            ...infoCfg,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appKey: account.appKey,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveInfoflowAccount({ cfg, accountId });
      return mapAllowFromEntries(account.config?.allowFrom);
    },
    formatAllowFrom: ({ allowFrom }) => formatAllowFromLowercase({ allowFrom }),
  },
  security: {
    collectWarnings: ({ cfg, accountId }) => {
      const account = resolveInfoflowAccount({ cfg, accountId });
      const infoCfg = account.config;
      return collectAllowlistProviderRestrictSendersWarnings({
        cfg,
        providerConfigPresent: cfg.channels?.infoflow !== undefined,
        configuredGroupPolicy: infoCfg?.groupPolicy,
        surface: `Infoflow[${account.accountId}] groups`,
        openScope: "any member",
        groupPolicyPath: "channels.infoflow.groupPolicy",
        groupAllowFromPath: "channels.infoflow.groupAllowFrom",
      });
    },
  },
  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({ cfg, accountId }) => {
      const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;
      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            infoflow: {
              ...cfg.channels?.infoflow,
              enabled: true,
            },
          },
        };
      }
      return setInfoflowNamedAccountEnabled(cfg, accountId, true);
    },
  },
  onboarding: infoflowOnboardingAdapter,
  messaging: {
    normalizeTarget: (raw) => normalizeInfoflowTarget(raw) ?? undefined,
    targetResolver: {
      looksLikeId: looksLikeInfoflowId,
      hint: "<userId|group:groupId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },
  outbound: infoflowOutbound,
  status: {
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, { port: null }),
    buildChannelSummary: ({ snapshot }) =>
      buildProbeChannelStatusSummary(snapshot, {
        port: snapshot.port ?? null,
      }),
    probeAccount: async ({ account }) => await probeInfoflow(accountToCredentials(account)),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appKey: account.appKey,
      ...buildRuntimeAccountStatusSnapshot({ runtime, probe }),
      port: runtime?.port ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const { monitorInfoflowProvider } = await import("./monitor.js");
      const account = resolveInfoflowAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
      const port = account.config?.webhookPort ?? null;
      ctx.setStatus({ accountId: ctx.accountId, port });
      ctx.log?.info(`starting infoflow[${ctx.accountId}] (webhook mode)`);
      return monitorInfoflowProvider({
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
      });
    },
  },
};
