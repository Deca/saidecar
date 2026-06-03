import { config } from "./config.js";
import { askCodex } from "./codexClient.js";
import { askCodexWebSearch } from "./codexWebSearchClient.js";
import { askWebSearch } from "./webSearchClient.js";
import { askOpenAIProvider } from "./providers/openaiProvider.js";
import { askDeepSeekProvider } from "./providers/deepseekProvider.js";
import { askAnthropicProvider } from "./providers/anthropicProvider.js";
import { askMinimaxProvider } from "./providers/minimaxProvider.js";
import { askOpenAI } from "./openaiClient.js";
import { PROVIDER_OPENAI, PROVIDER_DEEPSEEK, PROVIDER_ANTHROPIC, PROVIDER_MINIMAX, PROVIDER_CODEX } from "./providers/index.js";
import { modes } from "./modes.js";

export async function askModel({ question, modeName, sessionContext = [] }) {
  const mode = modes[modeName] || modes.normal;

  // Web search mode (uses SearXNG, falls back to DuckDuckGo)
  if (mode.tools.length > 0 && config.backend !== "codex") {
    const result = await askWebSearch({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  // Codex backend with web search tools
  if (config.backend === "codex" && mode.tools.length > 0) {
    const result = await askCodexWebSearch({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  // Route by provider
  if (config.provider === PROVIDER_MINIMAX) {
    const result = await askMinimaxProvider({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  if (config.provider === PROVIDER_DEEPSEEK) {
    const result = await askDeepSeekProvider({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  if (config.provider === PROVIDER_ANTHROPIC) {
    const result = await askAnthropicProvider({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  if (config.provider === PROVIDER_OPENAI) {
    const result = await askOpenAIProvider({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  // Codex backend without tools
  if (config.backend === "codex") {
    const result = await askCodex({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  // Default: OpenAI
  const result = await askOpenAI({ question, modeName, sessionContext });
  return { ...result, mode };
}
