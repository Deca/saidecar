import { config } from "./config.js";
import { askCodex } from "./codexClient.js";
import { askCodexWebSearch } from "./codexWebSearchClient.js";
import { askOpenAI } from "./openaiClient.js";
import { modes } from "./modes.js";

export async function askModel({ question, modeName, sessionContext = [] }) {
  const mode = modes[modeName] || modes.normal;

  if (config.backend === "codex" && mode.tools.length > 0) {
    return askCodexWebSearch({ question, modeName, sessionContext });
  }

  if (config.backend === "codex") {
    return askCodex({ question, modeName, sessionContext });
  }

  return askOpenAI({ question, modeName, sessionContext });
}
