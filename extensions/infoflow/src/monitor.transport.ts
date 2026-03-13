import * as http from "http";
import * as querystring from "querystring";
import type { RuntimeEnv } from "openclaw/plugin-sdk/feishu";
import {
  applyBasicWebhookRequestGuards,
  installRequestBodyLimitGuard,
} from "openclaw/plugin-sdk/feishu";
import { decryptInfoflowMessage, verifyInfoflowSignature } from "./crypto.js";
import type { ResolvedInfoflowAccount } from "./types.js";

const INFOFLOW_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const INFOFLOW_WEBHOOK_BODY_TIMEOUT_MS = 30_000;

export type MonitorTransportParams = {
  account: ResolvedInfoflowAccount;
  accountId: string;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  onGroupMessage: (msgData: Record<string, unknown>) => void;
  onPrivateMessage: (msgData: Record<string, unknown>) => void;
};

// Track HTTP servers for cleanup
const httpServers = new Map<string, http.Server>();

/**
 * Start a webhook HTTP server for receiving Infoflow callbacks.
 */
export async function monitorWebhook(params: MonitorTransportParams): Promise<void> {
  const { account, accountId, runtime, abortSignal, onGroupMessage, onPrivateMessage } = params;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  const port = account.config.webhookPort ?? 3000;
  const path = account.config.webhookPath ?? "/infoflow/events";
  const host = account.config.webhookHost ?? "127.0.0.1";

  log(`infoflow[${accountId}]: starting Webhook server on ${host}:${port}, path ${path}...`);

  const server = http.createServer();

  server.on("request", (req, res) => {
    if (req.url !== path && !req.url?.startsWith(`${path}?`)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    // Collect request body
    const chunks: Buffer[] = [];
    let bodySize = 0;

    req.on("data", (chunk: Buffer) => {
      bodySize += chunk.length;
      if (bodySize > INFOFLOW_WEBHOOK_MAX_BODY_BYTES) {
        res.writeHead(413);
        res.end("Payload Too Large");
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        handleWebhookRequest({
          rawBody,
          contentType: req.headers["content-type"] ?? "",
          account,
          accountId,
          log,
          error,
          onGroupMessage,
          onPrivateMessage,
          res,
        });
      } catch (err) {
        error(`infoflow[${accountId}]: webhook handler error: ${err}`);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      }
    });
  });

  httpServers.set(accountId, server);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.close();
      httpServers.delete(accountId);
    };

    const handleAbort = () => {
      log(`infoflow[${accountId}]: abort signal received, stopping Webhook server`);
      cleanup();
      resolve();
    };

    if (abortSignal?.aborted) {
      cleanup();
      resolve();
      return;
    }

    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    server.listen(port, host, () => {
      log(`infoflow[${accountId}]: Webhook server listening on ${host}:${port}`);
    });

    server.on("error", (err) => {
      error(`infoflow[${accountId}]: Webhook server error: ${err}`);
      abortSignal?.removeEventListener("abort", handleAbort);
      reject(err);
    });
  });
}

function handleWebhookRequest(params: {
  rawBody: string;
  contentType: string;
  account: ResolvedInfoflowAccount;
  accountId: string;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  onGroupMessage: (msgData: Record<string, unknown>) => void;
  onPrivateMessage: (msgData: Record<string, unknown>) => void;
  res: http.ServerResponse;
}): void {
  const {
    rawBody,
    contentType,
    account,
    accountId,
    log,
    error,
    onGroupMessage,
    onPrivateMessage,
    res,
  } = params;

  // Infoflow uses form-urlencoded or raw body for different message types
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = querystring.parse(rawBody);

    const signature = String(formData.signature ?? "");
    const timestamp = String(formData.timestamp ?? "");
    const rn = String(formData.rn ?? "");
    const echostr = formData.echostr as string | undefined;
    const messageJsonStr = formData.messageJson as string | undefined;

    // URL verification challenge
    if (echostr && timestamp && rn && account.accessToken) {
      const valid = verifyInfoflowSignature({
        signature,
        timestamp,
        rn,
        accessToken: account.accessToken,
      });

      if (valid) {
        log(`infoflow[${accountId}]: URL verification passed`);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(echostr);
      } else {
        log(`infoflow[${accountId}]: URL verification failed`);
        res.writeHead(403);
        res.end("Invalid signature");
      }
      return;
    }

    // Private (DM) message via messageJson field
    if (messageJsonStr) {
      try {
        const messageJson = JSON.parse(messageJsonStr) as { Encrypt?: string };
        if (messageJson.Encrypt && account.encodingAesKey) {
          const decrypted = decryptInfoflowMessage(messageJson.Encrypt, account.encodingAesKey);
          let msgData: Record<string, unknown>;
          try {
            msgData = JSON.parse(decrypted) as Record<string, unknown>;
          } catch {
            // Try XML parse fallback - for now just log
            error(`infoflow[${accountId}]: could not parse decrypted DM as JSON`);
            res.writeHead(200);
            res.end("success");
            return;
          }
          onPrivateMessage(msgData);
        }
      } catch (err) {
        error(`infoflow[${accountId}]: failed to process DM: ${err}`);
      }
      res.writeHead(200);
      res.end("success");
      return;
    }
  }

  // Group message: raw body is encrypted
  if (rawBody && account.encodingAesKey) {
    try {
      const decrypted = decryptInfoflowMessage(rawBody, account.encodingAesKey);
      const msgData = JSON.parse(decrypted) as Record<string, unknown>;
      onGroupMessage(msgData);
    } catch (err) {
      error(`infoflow[${accountId}]: failed to decrypt group message: ${err}`);
    }
  }

  res.writeHead(200);
  res.end("success");
}

export function stopInfoflowWebhook(accountId: string): void {
  const server = httpServers.get(accountId);
  if (server) {
    server.close();
    httpServers.delete(accountId);
  }
}
