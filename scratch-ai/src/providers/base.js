export const PROVIDER_OPENAI = "openai";
export const PROVIDER_DEEPSEEK = "deepseek";
export const PROVIDER_ANTHROPIC = "anthropic";
export const PROVIDER_CODEX = "codex";

export const KNOWN_PROVIDERS = [
  PROVIDER_OPENAI,
  PROVIDER_DEEPSEEK,
  PROVIDER_ANTHROPIC,
  PROVIDER_CODEX,
];

export function providerBaseUrl(provider) {
  const urls = {
    [PROVIDER_OPENAI]: "https://api.openai.com/v1",
    [PROVIDER_DEEPSEEK]: "https://api.deepseek.com/v1",
    [PROVIDER_ANTHROPIC]: "https://api.anthropic.com/v1",
  };
  return urls[provider] || null;
}

export function providerModels(provider) {
  const models = {
    [PROVIDER_OPENAI]: ["gpt-4o-mini", "gpt-4o", "gpt-4.5"],
    [PROVIDER_DEEPSEEK]: ["deepseek-chat", "deepseek-coder"],
    [PROVIDER_ANTHROPIC]: ["claude-3-5-haiku", "claude-3-5-sonnet"],
  };
  return models[provider] || [];
}

export function isOpenAICompatible(provider) {
  return [PROVIDER_OPENAI, PROVIDER_DEEPSEEK].includes(provider);
}

export function needsSystemPrompt(provider) {
  return provider === PROVIDER_ANTHROPIC;
}

export function buildHeaders(provider, apiKey) {
  const headers = {
    [PROVIDER_OPENAI]: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    [PROVIDER_DEEPSEEK]: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    [PROVIDER_ANTHROPIC]: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
  };
  return headers[provider] || {};
}

export async function createProviderClient(provider, apiKey, baseUrl) {
  if (isOpenAICompatible(provider)) {
    const { default: OpenAI } = await import("openai");
    return new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined,
    });
  }

  if (provider === PROVIDER_ANTHROPIC) {
    const { Anthropic } = await import("@anthropic-ai/sdk");
    return new Anthropic({
      apiKey,
      baseURL: baseUrl || undefined,
    });
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export function buildChatRequest(provider, { model, systemPrompt, question, tools, reasoning }) {
  if (provider === PROVIDER_ANTHROPIC) {
    return {
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
      max_tokens: 4096,
      ...(reasoning && { reasoning_effort: reasoning }),
    };
  }

  const request = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content: question },
    ],
  };

  if (tools && tools.length > 0) {
    request.tools = tools;
    request.tool_choice = "auto";
  }

  if (reasoning) {
    request.reasoning = reasoning;
  }

  return request;
}

export async function parseProviderResponse(provider, response, backend) {
  if (provider === PROVIDER_ANTHROPIC) {
    return {
      answer: response.content[0].text,
      raw: response,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      backend,
    };
  }

  const text = response.choices?.[0]?.message?.content || "";
  return {
    answer: text,
    raw: response,
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : null,
    backend,
  };
}

export function providerRequiresTools(provider) {
  return provider === PROVIDER_ANTHROPIC;
}