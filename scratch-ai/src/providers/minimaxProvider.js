import { config } from "../config.js";
import { systemPrompt } from "../prompt.js";
import { parseProviderResponse } from "./index.js";
import { MinimaxAuth } from "./minimaxAuth.js";

export async function askMinimaxProvider({ question, modeName, sessionContext = [] }) {
  const auth = new MinimaxAuth();

  // Check if we have valid cached credentials first
  const credentials = await auth.getCredentials();

  if (!credentials) {
    console.log("\n📝 MiniMax OAuth login required...");
    console.log("   Use 'mmx auth login' in terminal to authenticate, or set MINIMAX_API_KEY in .env\n");

    throw new Error(
      "MiniMax authentication required. Run 'mmx auth login' in terminal, or set MINIMAX_API_KEY in .env"
    );
  }

  const { modes } = await import("../modes.js");
  const { buildQuestionWithContext } = await import("../sessionContext.js");

  const mode = modes[modeName] || modes.normal;
  const questionWithContext = buildQuestionWithContext(question, sessionContext);

  const baseUrl = auth.getBaseUrl(credentials);
  const model = mode.model || "MiniMax-M3";

  const payload = {
    model,
    system: systemPrompt,
    messages: buildMessages(questionWithContext),
    max_tokens: 4096,
    ...(mode.tools?.length > 0 && { tools: transformToolsForMinimax(mode.tools) }),
  };

  function buildMessages(questionWithContext) {
    return [{ role: "user", content: questionWithContext }];
  }

  function transformToolsForMinimax(tools) {
    return tools.map((tool) => {
      if (tool.type === "web_search") {
        return {
          name: "web_search",
          description: "Search the web for current information",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query",
              },
            },
            required: ["query"],
          },
        };
      }
      return tool;
    });
  }

  async function executeToolCall(toolCall, tools) {
    const tool = tools.find((t) => t.name === toolCall.name);
    if (!tool) {
      return { tool_use_id: toolCall.id, content: `Error: unknown tool ${toolCall.name}` };
    }

    if (toolCall.name === "web_search") {
      const query = toolCall.input?.query;
      if (!query) {
        return { tool_use_id: toolCall.id, content: "Error: missing query parameter" };
      }

      // MiniMax web_search tool: try common search endpoints
      const searchEndpoints = [
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      ];

      // Try fetching through a simple proxy or direct search
      // For now, return a placeholder that indicates search was triggered
      // The model will use this to formulate an answer
      return {
        tool_use_id: toolCall.id,
        content: JSON.stringify({
          query,
          results: [],
          message: "Web search tool called - implement actual search API",
        }),
      };
    }

    return { tool_use_id: toolCall.id, content: `Error: unhandled tool ${toolCall.name}` };
  }

  async function sendRequest(payload, tools) {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      const refreshed = await auth.refreshCredentials();
      if (refreshed) {
        headers.Authorization = `Bearer ${refreshed.access_token}`;
        return sendRequest(payload, tools);
      }
      throw new Error("MiniMax authentication expired. Please re-authenticate with 'mmx auth login'");
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API error: HTTP ${response.status} ${errorText}`);
    }

    return response.json();
  }

  const tools = transformToolsForMinimax(mode.tools || []);
  let messages = buildMessages(questionWithContext);
  let data = await sendRequest(payload, tools);

  if (data.type === "error") {
    throw new Error(`MiniMax API error: ${data.error?.message || JSON.stringify(data)}`);
  }

  // Tool use loop: if model returns tool_use blocks, execute and continue
  for (let iteration = 0; iteration < 5; iteration++) {
    const toolCalls = data.content?.filter((block) => block.type === "tool_use") || [];

    if (toolCalls.length === 0) {
      break;
    }

    // Add assistant message with tool calls to conversation history
    messages.push({ role: "assistant", content: data.content });

    // Execute each tool call and collect results
    const toolResults = [];
    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall, tools);
      toolResults.push(result);
    }

    // Add tool results to conversation
    messages.push({
      role: "user",
      content: toolResults.map((result) => ({
        type: "tool_result",
        tool_use_id: result.tool_use_id,
        content: result.content,
      })),
    });

    // Continue conversation with tool results
    data = await sendRequest({ model, system: systemPrompt, messages, max_tokens: 4096, tools }, tools);
  }

  const result = parseProviderResponse("minimax", data, "minimax");
}