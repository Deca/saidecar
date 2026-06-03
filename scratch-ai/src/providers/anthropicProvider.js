import {
  createProviderClient,
  buildChatRequest,
  parseProviderResponse,
  PROVIDER_ANTHROPIC,
  providerBaseUrl,
  needsSystemPrompt,
} from "./index.js";
import { config } from "../config.js";
import { systemPrompt } from "../prompt.js";

export async function askAnthropicProvider({ question, modeName, sessionContext = [] }) {
  const provider = PROVIDER_ANTHROPIC;
  const apiKey = config.providerApiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Add it to your environment or create .env from .env.example."
    );
  }

  const { modes } = await import("../modes.js");
  const { buildQuestionWithContext } = await import("../sessionContext.js");

  const mode = modes[modeName] || modes.normal;
  const client = createProviderClient(provider, apiKey, providerBaseUrl(provider));
  const questionWithContext = buildQuestionWithContext(question, sessionContext);

  const system = needsSystemPrompt(provider) ? systemPrompt : undefined;

  const request = buildChatRequest(provider, {
    model: mode.model || "claude-3-5-haiku",
    systemPrompt: system,
    question: questionWithContext,
    reasoning: mode.reasoning,
  });

  const response = await client.messages.create(request);

  return parseProviderResponse(provider, response, provider);
}