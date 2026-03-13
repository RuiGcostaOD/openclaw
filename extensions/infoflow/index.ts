import type { OpenClawPluginApi } from "openclaw/plugin-sdk/compat";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/compat";
import { infoflowPlugin } from "./src/channel.js";

export { monitorInfoflowProvider } from "./src/monitor.js";
export {
  sendInfoflowMessage,
  sendInfoflowPrivateMessage,
  sendInfoflowGroupMessage,
} from "./src/send.js";
export { probeInfoflow } from "./src/probe.js";
export { infoflowPlugin } from "./src/channel.js";

const plugin = {
  id: "infoflow",
  name: "Infoflow",
  description: "Infoflow (如流) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: infoflowPlugin });
  },
};

export default plugin;
