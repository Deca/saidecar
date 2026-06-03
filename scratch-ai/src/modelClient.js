import { config } from "./config.js";
import { askCodex } from "./codexClient.js";
import { askCodexWebSearch } from "./codexWebSearchClient.js";
import { askOpenAIProvider } from "./providers/openaiProvider.js";
import { askDeepSeekProvider } from "./providers/deepseekProvider.js";
import { askAnthropicProvider } from "./providers/anthropicProvider.js";
import { askMinimaxProvider } from "./providers/minimaxProvider.js";
import { askOpenAI } from "./openaiClient.js";
import { PROVIDER_OPENAI, PROVIDER_DEEPSEEK, PROVIDER_ANTHROPIC, PROVIDER_MINIMAX, PROVIDER_CODEX } from "./providers/index.js";
import { modes } from "./modes.js";

export async function askModel({ question, modeName, sessionContext = [] }) {
  const mode = modes[modeName] || modes.normal;

  // Route by provider (non-OpenAI/non-Codex providers take precedence)
  if (config.provider !== PROVIDER_OPENAI && config.provider !== PROVIDER_CODEX && config.provider) {
    if (config.provider === PROVIDER_DEEPSEEK) {
      const result = await askDeepSeekProvider({ question, modeName, sessionContext });
      return { ...result, mode };
    }
    if (config.provider === PROVIDER_ANTHROPIC) {
      const result = await askAnthropicProvider({ question, modeName, sessionContext });
      return { ...result, mode };
    }
    if (config.provider === PROVIDER_MINIMAX && mode.tools.length > 0) {
      // MiniMax doesn't have a usable client-side web search API.
      // If OpenAI key is available, route to OpenAI provider. Otherwise fall through
      // to Codex backend which has working web search.
      if (config.apiKey || process.env.OPENAI_API_KEY) {
        const result = await askOpenAIProvider({ question, modeName, sessionContext });
        return { ...result, mode };
      }
      // Fall through to Codex backend check below
    }

    if (config.provider === PROVIDER_MINIMAX) {
      const result = await askMinimaxProvider({ question, modeName, sessionContext });
      return { ...result, mode };
    }
  }

  // OpenAI-compatible providers
  if (config.provider === PROVIDER_OPENAI || config.provider === PROVIDER_DEEPSEEK) {
    const result = await askOpenAIProvider({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  // Codex backend (only when provider is not set to a specific LLM provider)
  if (config.backend === "codex" && mode.tools.length > 0) {
    const result = await askCodexWebSearch({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  if (config.backend === "codex") {
    const result = await askCodex({ question, modeName, sessionContext });
    return { ...result, mode };
  }

  const result = await askOpenAI({ question, modeName, sessionContext });
  return { ...result, mode };
}
