import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { z } from "zod";
export { z };
import { buildSecretInputSchema, hasConfiguredSecretInput } from "./secret-input.js";

const DmPolicySchema = z.enum(["open", "pairing", "allowlist"]);
const GroupPolicySchema = z.union([
  z.enum(["open", "allowlist", "disabled"]),
  z.literal("allowall").transform(() => "open" as const),
]);

const InfoflowSharedConfigShape = {
  webhookHost: z.string().optional(),
  webhookPort: z.number().int().positive().optional(),
  dmPolicy: DmPolicySchema.optional(),
  allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  groupPolicy: GroupPolicySchema.optional(),
  groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  historyLimit: z.number().int().min(0).optional(),
  dmHistoryLimit: z.number().int().min(0).optional(),
  textChunkLimit: z.number().int().positive().optional(),
  httpTimeoutMs: z.number().int().positive().max(300_000).optional(),
};

/**
 * Per-account configuration.
 * All fields are optional - missing fields inherit from top-level config.
 */
export const InfoflowAccountConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    appKey: z.string().optional(),
    appSecret: buildSecretInputSchema().optional(),
    accessToken: buildSecretInputSchema().optional(),
    encodingAesKey: z.string().optional(),
    webhookPath: z.string().optional(),
    ...InfoflowSharedConfigShape,
  })
  .strict();

export const InfoflowConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultAccount: z.string().optional(),
    // Top-level credentials (single-account mode)
    appKey: z.string().optional(),
    appSecret: buildSecretInputSchema().optional(),
    accessToken: buildSecretInputSchema().optional(),
    encodingAesKey: z.string().optional(),
    webhookPath: z.string().optional().default("/infoflow/events"),
    ...InfoflowSharedConfigShape,
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    // Multi-account configuration
    accounts: z.record(z.string(), InfoflowAccountConfigSchema.optional()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const defaultAccount = value.defaultAccount?.trim();
    if (defaultAccount && value.accounts && Object.keys(value.accounts).length > 0) {
      const normalizedDefaultAccount = normalizeAccountId(defaultAccount);
      if (!Object.prototype.hasOwnProperty.call(value.accounts, normalizedDefaultAccount)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["defaultAccount"],
          message: `channels.infoflow.defaultAccount="${defaultAccount}" does not match a configured account key`,
        });
      }
    }

    if (value.dmPolicy === "open") {
      const allowFrom = value.allowFrom ?? [];
      const hasWildcard = allowFrom.some((entry) => String(entry).trim() === "*");
      if (!hasWildcard) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowFrom"],
          message:
            'channels.infoflow.dmPolicy="open" requires channels.infoflow.allowFrom to include "*"',
        });
      }
    }
  });
