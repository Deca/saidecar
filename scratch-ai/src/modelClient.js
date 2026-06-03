import { config } from "./config.js";
import { askCodex } from "./codexClient.js";
import { askCodexWebSearch } from "./codexWebSearchClient.js";
import { askOpenAIProvider } from "./providers/openaiProvider.js";
import { askDeepSeekProvider } from "./providers/deepseekProvider.js";
import { askAnthropicProvider } from "./providers/anthropicProvider.js";
import { askOpenAI } from "./openaiClient.js";
import { PROVIDER_OPENAI, PROVIDER_DEEPSEEK, PROVIDER_ANTHROPIC } from "./providers/index.js";
import { modes } from "./modes.js";

export async function askModel({ question, modeName, sessionContext = [] }) {
  const mode = modes[modeName] || modes.normal;

  if (config.backend === "codex" && mode.tools.length > 0) {
    return askCodexWebSearch({ question, modeName, sessionContext });
  }

  if (config.backend === "codex") {
    return askCodex({ question, modeName, sessionContext });
  }

  if (config.provider === PROVIDER_OPENAI) {
    return askOpenAIProvider({ question, modeName, sessionContext });
  }

  if (config.provider === PROVIDER_DEEPSEEK) {
    return askDeepSeekProvider({ question, modeName, sessionContext });
  }

  if (config.provider === PROVIDER_ANTHROPIC) {
    return askAnthropicProvider({ question, modeName, sessionContext });
  }

  return askOpenAI({ question, modeName, sessionContext });
}
