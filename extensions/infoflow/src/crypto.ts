import * as crypto from "crypto";

/**
 * Base64 URLSafe decode with automatic padding normalization.
 */
function base64UrlSafeDecode(s: string): Buffer {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat(normalized.length % 4);
  return Buffer.from(padded, "base64");
}

/**
 * Decrypt an Infoflow encrypted message using AES-ECB.
 * The EncodingAESKey is a 43-char Base64-encoded AES key.
 */
export function decryptInfoflowMessage(encryptMsg: string, encodingAesKey: string): string {
  const aesKey = base64UrlSafeDecode(encodingAesKey);
  const cipherText = base64UrlSafeDecode(encryptMsg);

  const decipher = crypto.createDecipheriv("aes-256-ecb", aesKey, null);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);

  return decrypted.toString("utf-8");
}

/**
 * Verify Infoflow webhook signature.
 * Signature = md5(rn + timestamp + accessToken)
 */
export function verifyInfoflowSignature(params: {
  signature: string;
  timestamp: string;
  rn: string;
  accessToken: string;
}): boolean {
  const { signature, timestamp, rn, accessToken } = params;
  const strToHash = `${rn}${timestamp}${accessToken}`;
  const expected = crypto.createHash("md5").update(strToHash).digest("hex");
  return signature === expected;
}
