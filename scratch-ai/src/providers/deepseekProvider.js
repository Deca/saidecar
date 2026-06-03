import {
  createProviderClient,
  buildChatRequest,
  parseProviderResponse,
  PROVIDER_DEEPSEEK,
  providerBaseUrl,
} from "./index.js";
import { config } from "../config.js";
import { systemPrompt } from "../prompt.js";

export async function askDeepSeekProvider({ question, modeName, sessionContext = [] }) {
  const provider = PROVIDER_DEEPSEEK;
  const apiKey = config.providerApiKey || process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing DEEPSEEK_API_KEY. Add it to your environment or create .env from .env.example."
    );
  }

  const { modes } = await import("../modes.js");
  const { buildQuestionWithContext } = await import("../sessionContext.js");

  const mode = modes[modeName] || modes.normal;
  const baseUrl = providerBaseUrl(provider);
  const client = createProviderClient(provider, apiKey, baseUrl);
  const questionWithContext = buildQuestionWithContext(question, sessionContext);

  const request = buildChatRequest(provider, {
    model: mode.model || "deepseek-chat",
    systemPrompt: systemPrompt,
    question: questionWithContext,
    tools: mode.tools.length > 0 ? mode.tools : undefined,
    reasoning: mode.reasoning,
  });

  const response = await client.chat.completions.create(request);

  return parseProviderResponse(provider, response, provider);
}