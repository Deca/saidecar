import OpenAI from "openai";
import { config } from "./config.js";
import { modes } from "./modes.js";
import { systemPrompt } from "./prompt.js";
import { buildQuestionWithContext } from "./sessionContext.js";

function createClient() {
  return new OpenAI({ apiKey: config.apiKey });
}

function buildRequest({ question, mode, sessionContext }) {
  const request = {
    model: mode.model,
    instructions: systemPrompt,
    input: buildQuestionWithContext(question, sessionContext),
  };

  if (mode.reasoning) {
    request.reasoning = mode.reasoning;
  }

  if (mode.tools.length > 0) {
    request.tools = mode.tools;
    request.tool_choice = "auto";
    request.include = ["web_search_call.action.sources"];
  }

  return request;
}

export async function askOpenAI({ question, modeName, sessionContext = [] }) {
  const mode = modes[modeName] || modes.normal;
  const client = createClient();
  const response = await client.responses.create(buildRequest({ question, mode, sessionContext }));

  return {
    answer: response.output_text || "",
    raw: response,
    usage: response.usage || null,
    mode,
    backend: "openai",
  };
}
