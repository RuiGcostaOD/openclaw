import { getInfoflowAppAccessToken } from "./auth.js";
import type { ResolvedInfoflowAccount } from "./types.js";

const INFOFLOW_API_BASE = "http://apiin.im.baidu.com";

/** Default HTTP timeout for Infoflow API requests (30 seconds). */
export const INFOFLOW_HTTP_TIMEOUT_MS = 30_000;

export type InfoflowClientCredentials = {
  accountId?: string;
  appKey?: string;
  appSecret?: string;
};

/**
 * Make an authenticated API request to Infoflow.
 */
export async function infoflowApiRequest<T = unknown>(params: {
  creds: InfoflowClientCredentials;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  timeoutMs?: number;
}): Promise<T> {
  const { creds, method, path, body, timeoutMs = INFOFLOW_HTTP_TIMEOUT_MS } = params;
  if (!creds.appKey || !creds.appSecret) {
    throw new Error(
      `Infoflow credentials not configured for account "${creds.accountId ?? "default"}"`,
    );
  }

  const token = await getInfoflowAppAccessToken(creds.appKey, creds.appSecret);
  const url = `${INFOFLOW_API_BASE}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer-${token}`,
        "Content-Type": "application/json; charset=utf-8",
        LOGID: String(Date.now() * 1000),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Infoflow API ${path} failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build credentials from a resolved account.
 */
export function accountToCredentials(account: ResolvedInfoflowAccount): InfoflowClientCredentials {
  return {
    accountId: account.accountId,
    appKey: account.appKey,
    appSecret: account.appSecret,
  };
}
