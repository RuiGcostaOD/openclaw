import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk/feishu";
import { resolveInfoflowAccount } from "./accounts.js";
import { accountToCredentials } from "./client.js";
import { sendInfoflowPrivateMessage, sendInfoflowGroupMessage } from "./send.js";

export const infoflowOutbound: ChannelOutboundAdapter = {
  sendText: async ({ cfg, target, text, accountId }) => {
    const account = resolveInfoflowAccount({ cfg, accountId });
    const creds = accountToCredentials(account);
    const to = target.trim();

    // Detect group vs user target
    const isGroup = /^\d+$/.test(to) || to.startsWith("group:");
    const targetId = to.replace(/^(group|user):/, "");

    if (isGroup) {
      const result = await sendInfoflowGroupMessage({
        creds,
        groupId: targetId,
        content: text,
      });
      return { ok: result.ok, error: result.error };
    }

    const result = await sendInfoflowPrivateMessage({
      creds,
      touser: targetId,
      content: text,
    });
    return { ok: result.ok, error: result.error };
  },
};
