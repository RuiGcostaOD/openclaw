import * as crypto from "crypto";

const INFOFLOW_TOKEN_URL = "http://apiin.im.baidu.com/api/v1/auth/app_access_token";

type CachedToken = {
  token: string;
  expiresAt: number;
};

// Token cache per appKey
const tokenCache = new Map<string, CachedToken>();

/**
 * Get Infoflow app access token.
 * Caches the token and auto-refreshes before expiry.
 */
export async function getInfoflowAppAccessToken(
  appKey: string,
  appSecret: string,
): Promise<string> {
  const cached = tokenCache.get(appKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  // Infoflow requires MD5-hashed app_secret
  const md5Secret = crypto.createHash("md5").update(appSecret).digest("hex").toLowerCase();

  const requestBody = { app_key: appKey, app_secret: md5Secret };
  console.log(`[infoflow:auth] POST ${INFOFLOW_TOKEN_URL}`);
  console.log(`[infoflow:auth] body: ${JSON.stringify(requestBody)}`);

  const response = await fetch(INFOFLOW_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  console.log(`[infoflow:auth] response status: ${response.status}`);
  console.log(`[infoflow:auth] response body: ${responseText}`);

  if (!response.ok) {
    throw new Error(
      `Infoflow token request failed: ${response.status} ${response.statusText} - ${responseText}`,
    );
  }

  const data = JSON.parse(responseText) as {
    code?: string;
    data?: { app_access_token?: string; expire?: number };
  };
  const token = data.data?.app_access_token;
  if (!token) {
    throw new Error(`Infoflow token response missing app_access_token: ${JSON.stringify(data)}`);
  }

  // Default expiry 2 hours if not provided
  const expireSeconds = data.data?.expire ?? 7200;
  tokenCache.set(appKey, {
    token,
    expiresAt: Date.now() + expireSeconds * 1000,
  });

  return token;
}

/** Clear token cache (for testing). */
export function clearTokenCache(): void {
  tokenCache.clear();
}
