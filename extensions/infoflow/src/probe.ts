import { infoflowApiRequest, type InfoflowClientCredentials } from "./client.js";
import type { InfoflowProbeResult } from "./types.js";

const probeCache = new Map<string, { result: InfoflowProbeResult; expiresAt: number }>();
const PROBE_SUCCESS_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PROBE_ERROR_TTL_MS = 60 * 1000; // 1 minute
const MAX_PROBE_CACHE_SIZE = 64;
export const INFOFLOW_PROBE_REQUEST_TIMEOUT_MS = 10_000;

function setCachedProbeResult(
  cacheKey: string,
  result: InfoflowProbeResult,
  ttlMs: number,
): InfoflowProbeResult {
  probeCache.set(cacheKey, { result, expiresAt: Date.now() + ttlMs });
  if (probeCache.size > MAX_PROBE_CACHE_SIZE) {
    const oldest = probeCache.keys().next().value;
    if (oldest !== undefined) {
      probeCache.delete(oldest);
    }
  }
  return result;
}

/**
 * Probe the Infoflow API to check connectivity.
 * Uses the token endpoint to validate credentials.
 */
export async function probeInfoflow(
  creds?: InfoflowClientCredentials,
): Promise<InfoflowProbeResult> {
  if (!creds?.appKey || !creds?.appSecret) {
    return { ok: false, error: "missing credentials (appKey, appSecret)" };
  }

  const cacheKey = creds.accountId ?? `${creds.appKey}`;
  const cached = probeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  try {
    // Probe by attempting to get a token — validates credentials
    const result = await infoflowApiRequest<{
      code?: string;
      data?: { app_access_token?: string };
    }>({
      creds,
      method: "POST",
      path: "/api/v1/auth/app_access_token",
      body: {},
      timeoutMs: INFOFLOW_PROBE_REQUEST_TIMEOUT_MS,
    });

    if (result.data?.app_access_token) {
      return setCachedProbeResult(
        cacheKey,
        { ok: true, appKey: creds.appKey },
        PROBE_SUCCESS_TTL_MS,
      );
    }

    return setCachedProbeResult(
      cacheKey,
      { ok: false, appKey: creds.appKey, error: `API error: ${JSON.stringify(result)}` },
      PROBE_ERROR_TTL_MS,
    );
  } catch (err) {
    return setCachedProbeResult(
      cacheKey,
      {
        ok: false,
        appKey: creds.appKey,
        error: err instanceof Error ? err.message : String(err),
      },
      PROBE_ERROR_TTL_MS,
    );
  }
}

/** Clear the probe cache (for testing). */
export function clearProbeCache(): void {
  probeCache.clear();
}
