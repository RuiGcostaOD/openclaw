import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk/feishu";
import { listEnabledInfoflowAccounts, resolveInfoflowAccount } from "./accounts.js";
import { monitorSingleAccount } from "./monitor.account.js";

export type MonitorInfoflowOpts = {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
};

export async function monitorInfoflowProvider(opts: MonitorInfoflowOpts = {}): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error("Config is required for Infoflow monitor");
  }

  const log = opts.runtime?.log ?? console.log;

  if (opts.accountId) {
    const account = resolveInfoflowAccount({ cfg, accountId: opts.accountId });
    if (!account.enabled || !account.configured) {
      throw new Error(`Infoflow account "${opts.accountId}" not configured or disabled`);
    }
    return monitorSingleAccount({
      cfg,
      account,
      runtime: opts.runtime,
      abortSignal: opts.abortSignal,
    });
  }

  const accounts = listEnabledInfoflowAccounts(cfg);
  if (accounts.length === 0) {
    throw new Error("No enabled Infoflow accounts configured");
  }

  log(
    `infoflow: starting ${accounts.length} account(s): ${accounts.map((a) => a.accountId).join(", ")}`,
  );

  const monitorPromises: Promise<void>[] = [];
  for (const account of accounts) {
    if (opts.abortSignal?.aborted) {
      log("infoflow: abort signal received during startup; stopping");
      break;
    }

    monitorPromises.push(
      monitorSingleAccount({
        cfg,
        account,
        runtime: opts.runtime,
        abortSignal: opts.abortSignal,
      }),
    );
  }

  await Promise.all(monitorPromises);
}
