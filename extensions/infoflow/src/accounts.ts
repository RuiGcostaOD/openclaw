import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { ClawdbotConfig } from "openclaw/plugin-sdk/feishu";
import { normalizeResolvedSecretInputString, normalizeSecretInputString } from "./secret-input.js";
import type {
  InfoflowConfig,
  InfoflowAccountConfig,
  InfoflowDefaultAccountSelectionSource,
  ResolvedInfoflowAccount,
} from "./types.js";

/**
 * List all configured account IDs from the accounts field.
 */
function listConfiguredAccountIds(cfg: ClawdbotConfig): string[] {
  const accounts = (cfg.channels?.infoflow as InfoflowConfig)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

/**
 * List all Infoflow account IDs.
 * If no accounts configured, returns [DEFAULT_ACCOUNT_ID] for backward compatibility.
 */
export function listInfoflowAccountIds(cfg: ClawdbotConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return [...ids].toSorted((a, b) => a.localeCompare(b));
}

/**
 * Resolve the default account selection and its source.
 */
export function resolveDefaultInfoflowAccountSelection(cfg: ClawdbotConfig): {
  accountId: string;
  source: InfoflowDefaultAccountSelectionSource;
} {
  const preferredRaw = (
    cfg.channels?.infoflow as InfoflowConfig | undefined
  )?.defaultAccount?.trim();
  const preferred = preferredRaw ? normalizeAccountId(preferredRaw) : undefined;
  if (preferred) {
    return { accountId: preferred, source: "explicit-default" };
  }
  const ids = listInfoflowAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return { accountId: DEFAULT_ACCOUNT_ID, source: "mapped-default" };
  }
  return { accountId: ids[0] ?? DEFAULT_ACCOUNT_ID, source: "fallback" };
}

export function resolveDefaultInfoflowAccountId(cfg: ClawdbotConfig): string {
  return resolveDefaultInfoflowAccountSelection(cfg).accountId;
}

/**
 * Resolve credentials for a specific account.
 */
export function resolveInfoflowCredentials(
  cfg: ClawdbotConfig,
  accountId?: string,
): {
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  encodingAesKey?: string;
} {
  const infoflowCfg = cfg.channels?.infoflow as InfoflowConfig | undefined;
  const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;

  if (isDefault) {
    return {
      appKey: infoflowCfg?.appKey,
      appSecret: normalizeSecretInputString(infoflowCfg?.appSecret),
      accessToken: normalizeSecretInputString(infoflowCfg?.accessToken),
      encodingAesKey: infoflowCfg?.encodingAesKey,
    };
  }

  const accountCfg = infoflowCfg?.accounts?.[accountId] as InfoflowAccountConfig | undefined;
  return {
    appKey: accountCfg?.appKey ?? infoflowCfg?.appKey,
    appSecret:
      normalizeSecretInputString(accountCfg?.appSecret) ??
      normalizeSecretInputString(infoflowCfg?.appSecret),
    accessToken:
      normalizeSecretInputString(accountCfg?.accessToken) ??
      normalizeSecretInputString(infoflowCfg?.accessToken),
    encodingAesKey: accountCfg?.encodingAesKey ?? infoflowCfg?.encodingAesKey,
  };
}

/**
 * Resolve a full account object.
 */
export function resolveInfoflowAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string;
}): ResolvedInfoflowAccount {
  const { cfg, accountId: rawAccountId } = params;
  const infoflowCfg = cfg.channels?.infoflow as InfoflowConfig | undefined;

  const accountId = rawAccountId
    ? normalizeAccountId(rawAccountId)
    : resolveDefaultInfoflowAccountId(cfg);

  const isDefault = accountId === DEFAULT_ACCOUNT_ID;
  const accountCfg = isDefault
    ? undefined
    : (infoflowCfg?.accounts?.[accountId] as InfoflowAccountConfig | undefined);

  const selectionSource = rawAccountId
    ? ("explicit" as const)
    : resolveDefaultInfoflowAccountSelection(cfg).source;

  const creds = resolveInfoflowCredentials(cfg, accountId);
  const configured = Boolean(creds.appKey && creds.appSecret);

  const enabled = isDefault ? infoflowCfg?.enabled !== false : accountCfg?.enabled !== false;

  // Merge config: account-level overrides top-level
  const mergedConfig = {
    ...infoflowCfg,
    ...accountCfg,
  } as InfoflowConfig;

  return {
    accountId,
    selectionSource,
    enabled,
    configured,
    name: accountCfg?.name,
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    accessToken: creds.accessToken,
    encodingAesKey: creds.encodingAesKey,
    config: mergedConfig,
  };
}

/**
 * List all enabled, configured accounts.
 */
export function listEnabledInfoflowAccounts(cfg: ClawdbotConfig): ResolvedInfoflowAccount[] {
  const accountIds = listInfoflowAccountIds(cfg);
  return accountIds
    .map((id) => resolveInfoflowAccount({ cfg, accountId: id }))
    .filter((a) => a.enabled && a.configured);
}
