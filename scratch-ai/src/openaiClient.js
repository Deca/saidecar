import OpenAI from "openai";
import { config } from "./config.js";
import { modes } from "./modes.js";
import { systemPrompt } from "./prompt.js";

function createClient() {
  return new OpenAI({ apiKey: config.apiKey });
}

function buildRequest({ question, mode }) {
  const request = {
    model: mode.model,
    instructions: systemPrompt,
    input: question,
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

export async function askOpenAI({ question, modeName }) {
  const mode = modes[modeName] || modes.normal;
  const client = createClient();
  const response = await client.responses.create(buildRequest({ question, mode }));

  return {
    answer: response.output_text || "",
    raw: response,
    usage: response.usage || null,
    mode,
    backend: "openai",
  };
}
