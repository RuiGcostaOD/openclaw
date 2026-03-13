import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  ClawdbotConfig,
  SecretInput,
  WizardPrompter,
} from "openclaw/plugin-sdk/feishu";
import {
  buildSingleChannelSecretPromptState,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  hasConfiguredSecretInput,
  mergeAllowFromEntries,
  promptSingleChannelSecretInput,
  setTopLevelChannelAllowFrom,
  setTopLevelChannelDmPolicyWithAllowFrom,
  setTopLevelChannelGroupPolicy,
  splitOnboardingEntries,
} from "openclaw/plugin-sdk/feishu";
import type { InfoflowConfig } from "./types.js";

const channel = "infoflow" as const;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function setInfoflowGroupPolicy(
  cfg: ClawdbotConfig,
  groupPolicy: "open" | "allowlist" | "disabled",
): ClawdbotConfig {
  return setTopLevelChannelGroupPolicy({
    cfg,
    channel: "infoflow",
    groupPolicy,
    enabled: true,
  }) as ClawdbotConfig;
}

function setInfoflowAllowFrom(cfg: ClawdbotConfig, allowFrom: string[]): ClawdbotConfig {
  return setTopLevelChannelAllowFrom({
    cfg,
    channel: "infoflow",
    allowFrom,
  }) as ClawdbotConfig;
}

async function noteInfoflowCredentialHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Go to Infoflow admin console (qy.baidu.com)",
      "2) Create a bot application",
      "3) Get App Key and App Secret from the credentials page",
      "4) Get Access Token and Encoding AES Key for webhook verification",
      `Docs: ${formatDocsLink("/channels/infoflow", "infoflow")}`,
    ].join("\n"),
    "Infoflow credentials",
  );
}

async function promptInfoflowAllowFrom(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
}): Promise<ClawdbotConfig> {
  const existing = params.cfg.channels?.infoflow?.allowFrom ?? [];
  await params.prompter.note(
    [
      "Allowlist Infoflow DMs by user ID.",
      "You can find user IDs in the Infoflow admin console.",
      "Examples: user123, zhangsan",
    ].join("\n"),
    "Infoflow allowlist",
  );

  while (true) {
    const entry = await params.prompter.text({
      message: "Infoflow allowFrom (user IDs)",
      placeholder: "user1, user2",
      initialValue: existing[0] ? String(existing[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
    });
    const parts = splitOnboardingEntries(String(entry));
    if (parts.length === 0) {
      await params.prompter.note("Enter at least one user.", "Infoflow allowlist");
      continue;
    }
    const unique = mergeAllowFromEntries(existing, parts);
    return setInfoflowAllowFrom(params.cfg, unique);
  }
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Infoflow",
  channel,
  policyKey: "channels.infoflow.dmPolicy",
  allowFromKey: "channels.infoflow.allowFrom",
  getCurrent: (cfg) =>
    (cfg.channels?.infoflow as InfoflowConfig | undefined)?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) =>
    setTopLevelChannelDmPolicyWithAllowFrom({
      cfg,
      channel: "infoflow",
      dmPolicy: policy,
    }) as ClawdbotConfig,
  promptAllowFrom: promptInfoflowAllowFrom,
};

export const infoflowOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,

  getStatus: async ({ cfg }) => {
    const infoCfg = cfg.channels?.infoflow as InfoflowConfig | undefined;

    const topLevelConfigured = Boolean(
      normalizeString(infoCfg?.appKey) && hasConfiguredSecretInput(infoCfg?.appSecret),
    );

    const accountConfigured = Object.values(infoCfg?.accounts ?? {}).some((account) => {
      if (!account || typeof account !== "object") return false;
      const rec = account as Record<string, unknown>;
      const hasOwnAppKey = Object.prototype.hasOwnProperty.call(rec, "appKey");
      const hasOwnAppSecret = Object.prototype.hasOwnProperty.call(rec, "appSecret");
      const appKeyConfigured = hasOwnAppKey
        ? Boolean(normalizeString(rec.appKey))
        : Boolean(normalizeString(infoCfg?.appKey));
      const secretConfigured = hasOwnAppSecret
        ? hasConfiguredSecretInput(rec.appSecret)
        : hasConfiguredSecretInput(infoCfg?.appSecret);
      return appKeyConfigured && secretConfigured;
    });

    const configured = topLevelConfigured || accountConfigured;

    const statusLines: string[] = [];
    if (!configured) {
      statusLines.push("Infoflow: needs app credentials");
    } else {
      statusLines.push("Infoflow: configured");
    }

    return {
      channel,
      configured,
      statusLines,
      selectionHint: configured ? "configured" : "needs app creds",
      quickstartScore: configured ? 2 : 0,
    };
  },

  configure: async ({ cfg, prompter }) => {
    const infoCfg = cfg.channels?.infoflow as InfoflowConfig | undefined;
    const hasConfigSecret = hasConfiguredSecretInput(infoCfg?.appSecret);
    const hasConfigCreds = Boolean(normalizeString(infoCfg?.appKey) && hasConfigSecret);

    const appSecretPromptState = buildSingleChannelSecretPromptState({
      accountConfigured: hasConfigCreds,
      hasConfigToken: hasConfigSecret,
      allowEnv: !hasConfigCreds && Boolean(process.env.INFOFLOW_APP_KEY?.trim()),
      envValue: process.env.INFOFLOW_APP_SECRET,
    });

    let next = cfg;
    let appKey: string | null = null;
    let appSecret: SecretInput | null = null;

    if (!hasConfigCreds) {
      await noteInfoflowCredentialHelp(prompter);
    }

    // Prompt for App Secret
    const appSecretResult = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "infoflow",
      credentialLabel: "App Secret",
      accountConfigured: appSecretPromptState.accountConfigured,
      canUseEnv: appSecretPromptState.canUseEnv,
      hasConfigToken: appSecretPromptState.hasConfigToken,
      envPrompt: "INFOFLOW_APP_KEY + INFOFLOW_APP_SECRET detected. Use env vars?",
      keepPrompt: "Infoflow App Secret already configured. Keep it?",
      inputPrompt: "Enter Infoflow App Secret",
      preferredEnvVar: "INFOFLOW_APP_SECRET",
    });

    if (appSecretResult.action === "use-env") {
      next = {
        ...next,
        channels: {
          ...next.channels,
          infoflow: { ...next.channels?.infoflow, enabled: true },
        },
      };
    } else if (appSecretResult.action === "set") {
      appSecret = appSecretResult.value;

      // Prompt for App Key
      appKey = String(
        await prompter.text({
          message: "Enter Infoflow App Key",
          initialValue:
            normalizeString(infoCfg?.appKey) ?? normalizeString(process.env.INFOFLOW_APP_KEY),
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (appKey && appSecret) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          infoflow: {
            ...next.channels?.infoflow,
            enabled: true,
            appKey,
            appSecret,
          },
        },
      };
    }

    // Prompt for Access Token (webhook verification)
    const accessTokenResult = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "infoflow-webhook",
      credentialLabel: "Access Token",
      accountConfigured: hasConfiguredSecretInput(infoCfg?.accessToken),
      canUseEnv: false,
      hasConfigToken: hasConfiguredSecretInput(infoCfg?.accessToken),
      envPrompt: "",
      keepPrompt: "Infoflow Access Token already configured. Keep it?",
      inputPrompt: "Enter Infoflow Access Token (for webhook signature verification)",
      preferredEnvVar: "INFOFLOW_ACCESS_TOKEN",
    });
    if (accessTokenResult.action === "set") {
      next = {
        ...next,
        channels: {
          ...next.channels,
          infoflow: {
            ...next.channels?.infoflow,
            accessToken: accessTokenResult.value,
          },
        },
      };
    }

    // Prompt for Encoding AES Key
    const aesKeyResult = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "infoflow-aes",
      credentialLabel: "Encoding AES Key",
      accountConfigured: Boolean(normalizeString(infoCfg?.encodingAesKey)),
      canUseEnv: false,
      hasConfigToken: Boolean(normalizeString(infoCfg?.encodingAesKey)),
      envPrompt: "",
      keepPrompt: "Infoflow Encoding AES Key already configured. Keep it?",
      inputPrompt: "Enter Infoflow Encoding AES Key (for message decryption)",
      preferredEnvVar: "INFOFLOW_ENCODING_AES_KEY",
    });
    if (aesKeyResult.action === "set") {
      next = {
        ...next,
        channels: {
          ...next.channels,
          infoflow: {
            ...next.channels?.infoflow,
            encodingAesKey:
              typeof aesKeyResult.value === "string"
                ? aesKeyResult.value
                : aesKeyResult.resolvedValue,
          },
        },
      };
    }

    // Group policy
    const groupPolicy = await prompter.select({
      message: "Group chat policy",
      options: [
        { value: "allowlist", label: "Allowlist - only respond in specific groups" },
        { value: "open", label: "Open - respond in all groups" },
        { value: "disabled", label: "Disabled - don't respond in groups" },
      ],
      initialValue: infoCfg?.groupPolicy ?? "allowlist",
    });
    if (groupPolicy) {
      next = setInfoflowGroupPolicy(next, groupPolicy as "open" | "allowlist" | "disabled");
    }

    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },

  dmPolicy,

  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      infoflow: { ...cfg.channels?.infoflow, enabled: false },
    },
  }),
};
