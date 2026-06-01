import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";
import { modes } from "./modes.js";

class CodexSearchError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CodexSearchError";
    this.status = status;
  }
}

function codexAuthPath() {
  return path.join(os.homedir(), ".codex", "auth.json");
}

function readCodexAuth() {
  const authPath = codexAuthPath();

  if (!fs.existsSync(authPath)) {
    throw new CodexSearchError(
      "Codex auth file was not found. Run `codex login` first."
    );
  }

  const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
  const token = auth?.tokens?.access_token;
  const accountId = auth?.tokens?.account_id || extractAccountIdFromToken(token);

  if (!token || !accountId) {
    throw new CodexSearchError(
      "Codex OAuth token or account id is missing. Run `codex login` again."
    );
  }

  return { token, accountId };
}

function extractAccountIdFromToken(token) {
  if (!token) {
    return undefined;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
  } catch {
    return undefined;
  }
}

function endpoint(pathName) {
  return `${config.codexSearchBaseUrl.replace(/\/+$/, "")}/codex/${pathName}`;
}

function headers(token, accountId, accept) {
  const result = {
    Authorization: `Bearer ${token}`,
    "chatgpt-account-id": accountId,
    originator: "scratch-ai",
    "OpenAI-Beta": "responses=experimental",
    accept,
    "User-Agent": "scratch-ai-codex-search",
  };

  if (accept === "text/event-stream") {
    result["content-type"] = "application/json";
  }

  return result;
}

async function fetchCodexModels({ token, accountId, signal }) {
  const url = new URL(endpoint("models"));
  url.searchParams.set("client_version", "1.0.0");

  const response = await fetch(url, {
    headers: headers(token, accountId, "application/json"),
    signal,
  });

  if (!response.ok) {
    throw new CodexSearchError(
      `Codex models request failed: HTTP ${response.status} ${await response.text()}`,
      response.status
    );
  }

  const data = await response.json();
  return (data.models || [])
    .map((model) => ({
      id: model.slug || model.id || model.model || "",
      isDefault: model.is_default,
    }))
    .filter((model) => model.id);
}

async function resolveSearchModel(auth, signal) {
  if (config.codexSearchModel) {
    return config.codexSearchModel;
  }

  try {
    const models = await fetchCodexModels({ ...auth, signal });
    return (models.find((model) => model.isDefault) || models[0])?.id || config.defaultModel;
  } catch {
    return config.defaultModel;
  }
}

function requestBody({ question, model, modeName }) {
  const deeper = modeName === "deepweb";

  return {
    model,
    instructions: deeper
      ? "You are a concise research assistant. Use web search, reason carefully, answer the query, and preserve source citations from annotations."
      : "You are a concise web search assistant. Use web search, answer the query, and preserve source citations from annotations.",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: question }],
      },
    ],
    tools: [
      {
        type: "web_search",
        external_web_access: true,
        search_context_size: config.codexSearchContextSize,
      },
    ],
    tool_choice: "required",
    parallel_tool_calls: true,
    store: false,
    stream: true,
    include: [],
  };
}

async function* parseSse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf("\n\n");

    while (separatorIndex !== -1) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const event = parseSseFrame(frame);
      if (event) {
        yield event;
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode();
  const event = parseSseFrame(buffer);
  if (event) {
    yield event;
  }
}

function parseSseFrame(frame) {
  const lines = frame.split(/\r?\n/);
  let type = "";
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      type = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  const raw = dataLines.join("\n");
  if (raw === "[DONE]") {
    return undefined;
  }

  try {
    return { type, data: JSON.parse(raw) };
  } catch {
    return { type, raw };
  }
}

function collectOutputItem(item, messageTextParts, citations, searchCalls) {
  if (!item) {
    return;
  }

  if (item.type === "web_search_call") {
    searchCalls.push({
      id: item.id,
      status: item.status,
      query: item.action?.query || item.action?.queries?.join(", "),
      url: item.action?.url,
    });
    return;
  }

  if (item.type !== "message" || item.role !== "assistant") {
    return;
  }

  for (const part of item.content || []) {
    if (part.type !== "output_text") {
      continue;
    }

    messageTextParts.push(part.text || "");

    for (const annotation of part.annotations || []) {
      if (annotation.type !== "url_citation" || !annotation.url) {
        continue;
      }

      citations.set(annotation.url, {
        title: annotation.title,
        url: annotation.url,
        startIndex: annotation.start_index,
        endIndex: annotation.end_index,
      });
    }
  }
}

function formatAnswer(text, citations) {
  if (citations.length === 0) {
    return text;
  }

  const sources = citations.map((citation, index) => {
    const title = citation.title?.trim() || citation.url;
    return `${index + 1}. ${title}: ${citation.url}`;
  });

  return `${text}\n\nSources:\n${sources.join("\n")}`;
}

export async function askCodexWebSearch({ question, modeName }) {
  const auth = readCodexAuth();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.codexTimeoutMs);
  const model = await resolveSearchModel(auth, controller.signal);

  try {
    const response = await fetch(endpoint("responses"), {
      method: "POST",
      headers: headers(auth.token, auth.accountId, "text/event-stream"),
      body: JSON.stringify(requestBody({ question, model, modeName })),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new CodexSearchError(
        `Codex web search request failed: HTTP ${response.status} ${await response.text()}`,
        response.status
      );
    }

    if (!response.body) {
      throw new CodexSearchError("Codex web search response did not include a body.");
    }

    let responseId;
    let usage;
    let streamedText = "";
    const messageTextParts = [];
    const citations = new Map();
    const searchCalls = [];

    for await (const event of parseSse(response.body)) {
      const data = event.data;

      if (event.type === "response.created") {
        responseId = data?.response?.id;
      } else if (event.type === "response.output_text.delta") {
        streamedText += data?.delta || "";
      } else if (event.type === "response.output_item.done") {
        collectOutputItem(data?.item, messageTextParts, citations, searchCalls);
      } else if (event.type === "response.completed") {
        usage = data?.response?.usage;
      } else if (event.type === "response.failed") {
        throw new CodexSearchError(
          data?.error?.message || data?.error?.code || "Codex web search failed."
        );
      }
    }

    const rawText = messageTextParts.join("") || streamedText;
    const citationList = [...citations.values()];

    return {
      answer: formatAnswer(rawText, citationList).trim(),
      raw: { responseId, searchCalls, citations: citationList },
      usage: usage
        ? {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            totalTokens: usage.total_tokens,
          }
        : null,
      mode: modes[modeName] || modes.web,
      backend: "codex-web",
    };
  } finally {
    clearTimeout(timeout);
  }
}
