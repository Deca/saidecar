import { config } from "../config.js";
import { systemPrompt } from "../prompt.js";
import { parseProviderResponse } from "./index.js";
import { MinimaxAuth } from "./minimaxAuth.js";

export async function askMinimaxProvider({ question, modeName, sessionContext = [] }) {
  const auth = new MinimaxAuth();

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

  const headers = {
    "Authorization": `Bearer ${credentials.access_token}`,
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };

  function transformToolsForMinimax(tools) {
    return tools.map((tool) => {
      if (tool.type === "web_search") {
        return {
          name: "web_search",
          description: "Search the web for current information",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" },
            },
            required: ["query"],
          },
        };
      }
      return tool;
    });
  }

  async function sendRequest(payload) {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      const refreshed = await auth.refreshCredentials();
      if (refreshed) {
        headers.Authorization = `Bearer ${refreshed.access_token}`;
        return sendRequest(payload);
      }
      throw new Error("MiniMax authentication expired. Please re-authenticate with 'mmx auth login'");
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API error: HTTP ${response.status} ${errorText}`);
    }

    return response.json();
  }

  const tools = mode.tools?.length > 0 ? transformToolsForMinimax(mode.tools) : [];

  const payload = {
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: questionWithContext }],
    max_tokens: 4096,
    ...(tools.length > 0 && { tools }),
  };

  let data = await sendRequest(payload);

  if (data.type === "error") {
    throw new Error(`MiniMax API error: ${data.error?.message || JSON.stringify(data)}`);
  }

  // Handle tool calls if present (for non-web modes, tools is empty so this is skipped)
  const toolCalls = data.content?.filter((block) => block.type === "tool_use") || [];

  if (toolCalls.length > 0 && tools.length > 0) {
    // Add assistant message with tool calls
    const messages = [
      { role: "user", content: questionWithContext },
      { role: "assistant", content: data.content },
    ];

    // Execute tool calls and add results
    const toolResults = toolCalls.map((toolCall) => ({
      type: "tool_result",
      tool_use_id: toolCall.id,
      content: `[Tool ${toolCall.name} called with ${JSON.stringify(toolCall.input)} - implement actual execution]`,
    }));

    messages.push({ role: "user", content: toolResults });

    // Continue with tool results
    data = await sendRequest({
      model,
      system: systemPrompt,
      messages,
      max_tokens: 4096,
      tools,
    });
  }

  return parseProviderResponse("minimax", data, "minimax");
}