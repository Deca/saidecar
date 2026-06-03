import {
  createProviderClient,
  buildChatRequest,
  parseProviderResponse,
  PROVIDER_OPENAI,
} from "./index.js";
import { config } from "../config.js";
import { systemPrompt } from "../prompt.js";

export async function askOpenAIProvider({ question, modeName, sessionContext = [] }) {
  const provider = PROVIDER_OPENAI;
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it to your environment or create .env from .env.example."
    );
  }

  const { modes } = await import("../modes.js");
  const { buildQuestionWithContext } = await import("../sessionContext.js");

  const mode = modes[modeName] || modes.normal;
  const client = createProviderClient(provider, apiKey);
  const questionWithContext = buildQuestionWithContext(question, sessionContext);

  const request = buildChatRequest(provider, {
    model: mode.model,
    systemPrompt: systemPrompt,
    question: questionWithContext,
    tools: mode.tools.length > 0 ? mode.tools : undefined,
    reasoning: mode.reasoning,
  });

  const response = await client.chat.completions.create(request);

  return parseProviderResponse(provider, response, provider);
}